import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';
import { scoreFor } from '../../WIMSGame/src/rules.js';

// Just enough of the D1 API (prepare/bind/first/all/run/batch) over node:sqlite to run the real SQL.
function fakeD1(db) {
  const statement = (sql, params = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => db.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...params).map(row => ({ ...row })) }),
    run: async () => ({ meta: { changes: db.prepare(sql).run(...params).changes } }),
  });
  return { prepare: sql => statement(sql), batch: async list => { const out = []; for (const s of list) out.push(await s.run()); return out; } };
}

const migrations = new URL('../migrations/', import.meta.url);
function migrate(db) {
  for (const file of readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file, migrations), 'utf8'));
}

function setup(db = new DatabaseSync(':memory:')) {
  migrate(db);
  const env = { DB: fakeD1(db) };
  const call = (method, path, body, origin = 'https://whereismysandwich.com') => worker.fetch(new Request(`https://sandwich-api.example${path}`, {
    method, headers: { ...(origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  const ticket = async () => (await (await call('POST', '/api/runs', { seed: 1 })).json()).token;
  const age = ms => db.exec(`UPDATE runs SET created_at = created_at - ${ms}`); // pretend the round started earlier
  return { db, call, ticket, age };
}

// The sample payload: one hit, one porch checked, no sprinting.
const sample = { player_name: 'HoagieHunter69', points: 8290, time_ms: 14900, incidents: 1, hunger_ms: 77100, checked: 1 };

test('CORS: the site and local previews may call the API, other sites may not', async () => {
  const { call } = setup();
  const ok = await call('OPTIONS', '/api/scores');
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://whereismysandwich.com');
  assert.match(ok.headers.get('Access-Control-Allow-Headers'), /Content-Type/);
  assert.equal((await call('OPTIONS', '/api/scores', undefined, 'http://localhost:8577')).status, 204);
  assert.equal((await call('OPTIONS', '/api/scores', undefined, 'https://evil.example')).status, 403);
  assert.equal((await call('POST', '/api/runs', { seed: 1 }, 'https://evil.example')).status, 403);
  const read = await call('GET', '/api/scores');
  assert.equal(read.headers.get('Access-Control-Allow-Origin'), 'https://whereismysandwich.com');
});

test('A valid round is stored with recomputed points and read back in the game\'s format', async () => {
  const { call, ticket, age } = setup();
  assert.deepEqual(await (await call('GET', '/api/scores')).json(), { scores: [] });

  const token = await ticket(); age(20000);
  const saved = await call('POST', '/api/scores', { ...sample, token });
  assert.equal(saved.status, 201);
  assert.deepEqual(await saved.json(), { points: 8290 });

  const token2 = await ticket(); age(20000);
  const greedy = { player_name: '<Sam>', points: 99999999, time_ms: 10000, hunger_ms: 90000, incidents: 0, checked: 1, token: token2 };
  assert.equal((await call('POST', '/api/scores', greedy)).status, 201);

  const { scores } = await (await call('GET', '/api/scores')).json();
  assert.deepEqual(scores, [
    { name: 'Sam', score: scoreFor(90, 0, 1), elapsed: 10 },
    { name: 'HoagieHunter69', score: 8290, elapsed: 14.9 },
  ]);
});

test('Tickets are single-use, must exist, and must be old enough for the claimed time', async () => {
  const { call, ticket, age } = setup();
  const token = await ticket(); age(20000);
  assert.equal((await call('POST', '/api/scores', { ...sample, token })).status, 201);
  assert.equal((await call('POST', '/api/scores', { ...sample, token })).status, 400, 'reused ticket');
  assert.equal((await call('POST', '/api/scores', { ...sample, token: 'made-up' })).status, 400, 'unknown ticket');
  assert.equal((await call('POST', '/api/scores', sample)).status, 400, 'no ticket');
  const fresh = await ticket();
  assert.equal((await call('POST', '/api/scores', { ...sample, token: fresh })).status, 400, '14.9s round claimed 0s after it started');
  const stale = await ticket(); age(2 * 60 * 60 * 1000);
  assert.equal((await call('POST', '/api/scores', { ...sample, token: stale })).status, 400, 'expired ticket');
});

test('Impossible rounds and junk bodies are rejected', async () => {
  const { call, ticket, age } = setup();
  const bad = [
    { hunger_ms: 100000 },            // more hunger left than the clock allows
    { hunger_ms: 85200 },             // ignores the 8s lost to the one incident
    { time_ms: 1000 },                // under 3 seconds
    { time_ms: 14900.5 },             // not whole milliseconds
    { incidents: -1 },
    { checked: 0 },
    { checked: 17 },
    { hunger_ms: 0 },
  ];
  for (const change of bad) {
    const token = await ticket(); age(20000);
    assert.equal((await call('POST', '/api/scores', { ...sample, ...change, token })).status, 400, JSON.stringify(change));
  }
  const raw = (body) => worker.fetch(new Request('https://sandwich-api.example/api/scores', { method: 'POST', body }), { DB: null });
  assert.equal((await raw('{not json')).status, 400);
  assert.equal((await raw('x'.repeat(5000))).status, 400);
  assert.equal((await call('GET', '/nope')).status, 404);
});

test('Migrations upgrade the hand-made live table without losing its row', async () => {
  // The live sandwich-leaderboard as it was before any migration ran (copied from sqlite_master).
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE scores (     id INTEGER PRIMARY KEY AUTOINCREMENT,     player_name TEXT NOT NULL,     time_ms INTEGER NOT NULL,     created_at TEXT DEFAULT CURRENT_TIMESTAMP )`);
  db.exec(`INSERT INTO scores (player_name, time_ms, created_at) VALUES ('HoagieHunter69', 154000, '2026-10-13 21:40:12')`);
  const { call, ticket, age } = setup(db);
  assert.deepEqual({ ...db.prepare('SELECT player_name, time_ms, points, incidents FROM scores WHERE id = 1').get() },
    { player_name: 'HoagieHunter69', time_ms: 154000, points: 0, incidents: 0 });
  const token = await ticket(); age(20000);
  assert.equal((await call('POST', '/api/scores', { ...sample, token })).status, 201);
  const { scores } = await (await call('GET', '/api/scores')).json();
  assert.deepEqual(scores, [
    { name: 'HoagieHunter69', score: 8290, elapsed: 14.9 },
    { name: 'HoagieHunter69', score: 0, elapsed: 154 },
  ]);
  assert.ok(db.prepare('SELECT created_at FROM scores WHERE id = 2').get().created_at, 'new rows get a timestamp');
});

test('Issuing a ticket sweeps tickets older than an hour', async () => {
  const { db, ticket, age } = setup();
  await ticket(); age(2 * 60 * 60 * 1000);
  await ticket();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM runs').get().n, 1);
});
