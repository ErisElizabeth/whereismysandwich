// sandwich-api: the shared leaderboard for whereismysandwich.com/game/, backed by D1.
//
//   GET  /api/scores  -> { scores: [{ name, score, elapsed }] }   top 10, elapsed in seconds
//   POST /api/runs    -> { token }                                 one ticket per round, issued at round start
//   POST /api/scores  <- { player_name, points, time_ms, incidents, hunger_ms, checked, token }
//
// Points are recomputed from the round's numbers (checkResult); the client's `points` is never stored.

import { checkResult } from '../../WIMSGame/src/rules.js';

const ALLOWED_ORIGINS = ['https://whereismysandwich.com', 'https://www.whereismysandwich.com'];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/; // local previews of the site
const TICKET_TTL_MS = 60 * 60 * 1000;
const MAX_BODY_BYTES = 2048;

function isAllowed(origin) {
  return ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin);
}

function corsHeaders(origin) {
  if (!origin || !isAllowed(origin)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(origin) },
  });
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function topScores(db) {
  const { results } = await db.prepare(
    `SELECT player_name AS name, points AS score, time_ms / 1000.0 AS elapsed
     FROM scores ORDER BY points DESC, time_ms ASC LIMIT 10`,
  ).all();
  return results;
}

async function issueTicket(db, now) {
  const token = randomToken();
  await db.batch([
    db.prepare('DELETE FROM runs WHERE created_at < ?').bind(now - TICKET_TTL_MS),
    db.prepare('INSERT INTO runs (token, created_at) VALUES (?, ?)').bind(token, now),
  ]);
  return token;
}

async function submitScore(db, data, now) {
  if (typeof data?.token !== 'string') return null;
  // Deleting the ticket as we read it makes it single-use, even if two requests race.
  const run = await db.prepare('DELETE FROM runs WHERE token = ? RETURNING created_at').bind(data.token).first();
  if (!run || now - run.created_at > TICKET_TTL_MS) return null;
  const row = checkResult(data, (now - run.created_at) / 1000);
  if (!row) return null;
  await db.prepare('INSERT INTO scores (player_name, points, time_ms, incidents) VALUES (?, ?, ?, ?)')
    .bind(row.player_name, row.points, row.time_ms, row.incidents).run();
  return row;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const { pathname } = new URL(request.url);
    const now = Date.now();

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: isAllowed(origin) ? 204 : 403, headers: corsHeaders(origin) });
    }
    // Browsers on other sites can't write scores. (Scripts without an Origin can; checkResult is the real guard.)
    if (request.method === 'POST' && origin && !isAllowed(origin)) {
      return json(403, { error: 'Wrong origin' }, origin);
    }

    try {
      if (pathname === '/api/scores' && request.method === 'GET') {
        return json(200, { scores: await topScores(env.DB) }, origin);
      }
      if (pathname === '/api/runs' && request.method === 'POST') {
        return json(201, { token: await issueTicket(env.DB, now) }, origin);
      }
      if (pathname === '/api/scores' && request.method === 'POST') {
        const data = await readJson(request);
        if (!data) return json(400, { error: 'Invalid request body' }, origin);
        const row = await submitScore(env.DB, data, now);
        if (!row) return json(400, { error: 'Invalid or expired round' }, origin);
        return json(201, { points: row.points }, origin);
      }
      return json(404, { error: 'Not found' }, origin);
    } catch (error) {
      console.error('Request failed:', error);
      return json(500, { error: 'Unable to save right now' }, origin);
    }
  },
};
