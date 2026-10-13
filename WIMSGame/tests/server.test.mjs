import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { createGameServer } from '../server.mjs';
import { scoreFor } from '../src/rules.js';

test('Shared leaderboard persists scores, recomputes points, and rejects reused or impossible rounds', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'wims-test-'));
  assert.equal(resolve(dirname(dataDir)), resolve(tmpdir()));
  assert.ok(basename(dataDir).startsWith('wims-test-'));
  let now = 1_000_000;
  let server = await createGameServer({ dataDir, clock: () => now, basePath: '/game' });
  const listen = async s => { await new Promise(resolve => s.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${s.address().port}/game/api/`; };
  let api = await listen(server);
  const post = (path, data, extra = {}) => fetch(api + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(data) });
  try {
    assert.equal((await fetch(api + 'scores')).status, 200);
    const { token } = await (await post('runs', { seed: 123 })).json();
    now += 10000;
    const result = { token, player_name: '<Sam>', time_ms: 10000, hunger_ms: 90000, incidents: 0, checked: 1, points: 99999999 };
    assert.equal((await post('scores', result)).status, 201);
    const saved = await (await fetch(api + 'scores')).json();
    assert.equal(saved.scores[0].name, 'Sam');
    assert.equal(saved.scores[0].score, scoreFor(90, 0, 1));
    assert.equal((await post('scores', result)).status, 400);
    const badRun = await (await post('runs', { seed: 123 })).json();
    now += 10000;
    assert.equal((await post('scores', { ...result, token: badRun.token, hunger_ms: 100000 })).status, 400);
    assert.equal((await post('runs', { seed: 123 }, { Origin: 'https://unrelated.example' })).status, 403);
    const concurrent = await (await post('runs', { seed: 123 })).json(); now += 10000;
    const responses = await Promise.all([post('scores', { ...result, token: concurrent.token }), post('scores', { ...result, token: concurrent.token })]);
    assert.deepEqual(responses.map(r => r.status).sort(), [201, 400]);
    await new Promise(resolve => server.close(resolve));
    server = await createGameServer({ dataDir, clock: () => now, basePath: '/game' }); api = await listen(server);
    assert.equal((await (await fetch(api + 'scores')).json()).scores.length, 2);
    assert.equal((await fetch(api.replace('api/', '') + '..%2f..%2fpackage.json')).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dataDir, { recursive: true, force: true }); }
});
