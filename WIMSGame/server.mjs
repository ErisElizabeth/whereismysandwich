import http from 'node:http';
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkResult } from './src/rules.js';

const project = dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json' };

export async function createGameServer({ root = resolve(project, '..', 'game'), dataDir = resolve(project, 'data'), basePath = '', clock = Date.now } = {}) {
  basePath = '/' + basePath.split('/').filter(Boolean).join('/');
  if (basePath === '/') basePath = '';
  await mkdir(dataDir, { recursive: true });
  const scoreFile = resolve(dataDir, 'leaderboard.json');
  let scores = [];
  try {
    scores = JSON.parse(await readFile(scoreFile, 'utf8'));
    if (!Array.isArray(scores)) throw new Error('Leaderboard must be an array');
  } catch (error) { if (error.code !== 'ENOENT') throw new Error('Unable to read existing leaderboard; refusing to overwrite it.', { cause: error }); }
  const runs = new Map();
  const limits = new Map();
  let persistence = Promise.resolve();
  const sweep = setInterval(() => {
    for (const [key, run] of runs) if (clock() - run.at > 60 * 60 * 1000) runs.delete(key);
    for (const [key, limit] of limits) if (clock() - limit.at > 60000) limits.delete(key);
  }, 60000); sweep.unref();

  function reply(res, status, object) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(object));
  }

  async function body(req) {
    let bytes = 0; const chunks = [];
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 2048) throw new Error('Request too large');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (basePath && url.pathname === basePath) { res.writeHead(308, { Location: basePath + '/' }); res.end(); return; }
      if (!url.pathname.startsWith(basePath + '/')) { reply(res, 404, { error: 'Not found' }); return; }
      const path = url.pathname.slice(basePath.length);
      if (path.startsWith('/api/')) {
        if (req.method === 'POST') {
          // Same-origin writes; tickets cannot be issued or submitted by another site.
          if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) { reply(res, 403, { error: 'Wrong origin' }); return; }
          const address = req.socket.remoteAddress || 'unknown';
          const limit = limits.get(address) || { at: clock(), count: 0 };
          if (clock() - limit.at > 60000) { limit.at = clock(); limit.count = 0; }
          limit.count++; limits.set(address, limit);
          if (limit.count > 40) { reply(res, 429, { error: 'Please slow down' }); return; }
        }
        if (path === '/api/scores' && req.method === 'GET') { reply(res, 200, { scores: scores.slice(0, 10) }); return; }
        if (path === '/api/runs' && req.method === 'POST') {
          const data = await body(req);
          if (!Number.isInteger(data.seed) || data.seed < 0 || data.seed > 4294967295) { reply(res, 400, { error: 'Invalid seed' }); return; }
          const token = randomBytes(24).toString('hex'); runs.set(token, { at: clock(), seed: data.seed });
          reply(res, 201, { token }); return;
        }
        if (path === '/api/scores' && req.method === 'POST') {
          const data = await body(req); const run = runs.get(data.token);
          if (!run || clock() - run.at > 60 * 60 * 1000) { reply(res, 400, { error: 'Invalid or expired round' }); return; }
          const row = checkResult(data, (clock() - run.at) / 1000);
          if (!row) { reply(res, 400, { error: 'Invalid round result' }); return; }
          const entry = { name: row.player_name, score: row.points, elapsed: Math.round(row.time_ms / 100) / 10, date: new Date(clock()).toISOString() };
          // Reserve the ticket before awaiting disk, so parallel requests cannot reuse it.
          runs.delete(data.token);
          const save = persistence.then(async () => {
            const next = [...scores, entry].sort((a, b) => b.score - a.score || a.elapsed - b.elapsed).slice(0, 100);
            const temporary = scoreFile + '.tmp';
            await writeFile(temporary, JSON.stringify(next, null, 2)); await rename(temporary, scoreFile); scores = next;
          });
          persistence = save.catch(() => {});
          try { await save; }
          catch (error) { runs.set(data.token, run); throw error; }
          reply(res, 201, { points: entry.score }); return;
        }
        reply(res, 404, { error: 'Not found' }); return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { reply(res, 405, { error: 'Method not allowed' }); return; }
      let decoded;
      try { decoded = decodeURIComponent(path); } catch { reply(res, 400, { error: 'Invalid path' }); return; }
      const relative = decoded === '/' ? 'index.html' : decoded.slice(1);
      const file = resolve(root, relative);
      if (!file.startsWith(resolve(root) + sep) || relative.includes('\0')) { reply(res, 403, { error: 'Invalid path' }); return; }
      let details;
      try { details = await stat(file); } catch { reply(res, 404, { error: 'File not found. Run npm run build first.' }); return; }
      if (!details.isFile()) { reply(res, 404, { error: 'Not found' }); return; }
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Content-Length': details.size, 'Cache-Control': relative.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
      if (req.method === 'HEAD') res.end(); else createReadStream(file).pipe(res);
    } catch (error) {
      if (error instanceof SyntaxError || error.message === 'Request too large') reply(res, 400, { error: 'Invalid request body' });
      else { console.error('Request failed:', error.message); if (!res.headersSent) reply(res, 500, { error: 'Unable to save right now' }); else res.end(); }
    }
  });
  server.on('close', () => clearInterval(sweep));
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createGameServer({ dataDir: process.env.DATA_DIR || resolve(project, 'data'), basePath: process.env.BASE_PATH || '' });
  const port = Number(process.env.PORT) || 4174;
  server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Where Is My Sandwich is ready at http://localhost:${port}${process.env.BASE_PATH || ''}/`));
}
