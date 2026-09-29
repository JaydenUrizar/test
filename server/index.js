// Emberwild server entry: static files, REST API (accounts, server browser), WebSocket game transport.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Accounts } from './accounts.js';
import { Lobby } from './lobby.js';
import { Bucket } from './util.js';
import { MODES } from '../shared/items.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const MAX_WORLDS = parseInt(process.env.MAX_WORLDS || '8', 10);

export function createServer({ port = PORT, host = HOST, dataDir = DATA_DIR } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const accounts = new Accounts(dataDir);
  const lobby = new Lobby(dataDir, { maxWorlds: MAX_WORLDS });
  lobby.start();

  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
  const STATIC = [
    ['/vendor/three-addons/', path.join(ROOT, 'node_modules/three/examples/jsm')],
    ['/vendor/three.module.js', path.join(ROOT, 'node_modules/three/build/three.module.js')],
    ['/shared/', path.join(ROOT, 'shared')],
    ['/', path.join(ROOT, 'client')],
  ];
  const gzCache = new Map();

  function serveStatic(req, res, urlPath) {
    let file = null;
    for (const [prefix, dir] of STATIC) {
      if (prefix.endsWith('/') ? urlPath.startsWith(prefix) : urlPath === prefix) {
        file = prefix.endsWith('/') ? path.join(dir, urlPath.slice(prefix.length)) : dir;
        if (prefix === '/' && (urlPath === '/' || urlPath === '')) file = path.join(dir, 'index.html');
        break;
      }
    }
    if (!file) return false;
    file = path.normalize(file);
    if (!STATIC.some(([, d]) => file.startsWith(d))) { res.writeHead(403); res.end('Forbidden'); return true; }
    let st;
    try { st = fs.statSync(file); if (st.isDirectory()) { file = path.join(file, 'index.html'); st = fs.statSync(file); } } catch { return false; }
    const ext = path.extname(file).toLowerCase();
    const etag = `"${st.size}-${Math.floor(st.mtimeMs)}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304); res.end(); return true; }
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', ETag: etag, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
    const compressible = ['.js', '.html', '.css', '.json', '.svg'].includes(ext);
    if (compressible && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      let ent = gzCache.get(file);
      if (!ent || ent.etag !== etag) { ent = { etag, buf: zlib.gzipSync(fs.readFileSync(file)) }; gzCache.set(file, ent); }
      headers['Content-Encoding'] = 'gzip'; headers['Content-Length'] = ent.buf.length;
      res.writeHead(200, headers); res.end(ent.buf);
      return true;
    }
    headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
    return true;
  }

  // ---------------- REST
  const ipBuckets = new Map();
  const authLimit = (ip) => { let b = ipBuckets.get(ip); if (!b) ipBuckets.set(ip, (b = new Bucket(10 / 60, 10))); return b.allow(); };
  const readBody = (req) => new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > 20000) { reject(new Error('Body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('Bad JSON')); } });
    req.on('error', reject);
  });
  const json = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(b) }); res.end(b); };
  const authUser = (req) => accounts.byToken((req.headers.authorization || '').replace(/^Bearer /, ''));

  async function api(req, res, url) {
    const ip = req.socket.remoteAddress || '';
    try {
      if (url.pathname === '/api/health') return json(res, 200, { ok: true, name: 'Emberwild', worlds: lobby.worlds.size, uptime: Math.round(process.uptime()) });
      if (url.pathname === '/api/modes') return json(res, 200, { modes: Object.fromEntries(Object.entries(MODES).map(([k, v]) => [k, v])) });
      if (req.method === 'POST' && (url.pathname === '/api/register' || url.pathname === '/api/login')) {
        if (!authLimit(ip)) return json(res, 429, { error: 'Too many attempts — slow down a little.' });
        const b = await readBody(req);
        const r = url.pathname === '/api/register' ? accounts.register(b.name, b.password) : accounts.login(b.name, b.password);
        return json(res, 200, { token: r.token, profile: accounts.profile(r.user) });
      }
      const user = authUser(req);
      if (url.pathname === '/api/logout' && req.method === 'POST') { accounts.logout((req.headers.authorization || '').replace(/^Bearer /, '')); return json(res, 200, { ok: true }); }
      if (!user) return json(res, 401, { error: 'Please sign in' });
      if (url.pathname === '/api/me' && req.method === 'GET') return json(res, 200, { profile: accounts.profile(user) });
      if (url.pathname === '/api/profile' && req.method === 'POST') { accounts.update(user, await readBody(req)); return json(res, 200, { profile: accounts.profile(user) }); }
      if (url.pathname === '/api/servers' && req.method === 'GET') return json(res, 200, { servers: lobby.list(user.uid) });
      if (url.pathname === '/api/servers' && req.method === 'POST') { const s = lobby.create(user, await readBody(req)); return json(res, 200, { server: lobby.view(s, user.uid) }); }
      if (url.pathname === '/api/servers/invite' && req.method === 'POST') {
        const b = await readBody(req); const s = lobby.byInvite(b.code);
        if (!s) return json(res, 404, { error: 'No server found for that invite code' });
        return json(res, 200, { server: lobby.view(s, user.uid), invite: String(b.code).toUpperCase() });
      }
      const del = url.pathname.match(/^\/api\/servers\/([\w-]+)$/);
      if (del && req.method === 'DELETE') { lobby.remove(user, del[1]); return json(res, 200, { ok: true }); }
      return json(res, 404, { error: 'Not found' });
    } catch (e) {
      return json(res, 400, { error: e.message || 'Bad request' });
    }
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    let p; try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
    if (p.includes('\0') || p.includes('..')) { res.writeHead(400); return res.end(); }
    if (!serveStatic(req, res, p)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); }
  });

  // ---------------- WebSocket
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024, perMessageDeflate: false });
  wss.on('connection', (ws, req) => {
    let ctx = null; // { world, p }
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    const timer = setTimeout(() => { if (!ctx) ws.close(); }, 8000);
    const send = (o) => { try { ws.send(JSON.stringify(o)); } catch {} };
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      let msg;
      try { msg = JSON.parse(data.toString('utf8')); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (!ctx) {
        if (msg.t !== 'join') return;
        clearTimeout(timer);
        try {
          const user = accounts.byToken(msg.token);
          if (!user) throw new Error('Session expired — please sign in again');
          const s = lobby.find(msg.server);
          if (!s) throw new Error('That server no longer exists');
          lobby.authorizeJoin(user, s, msg);
          const world = lobby.world(s);
          const r = world.join(ws, user, msg);
          if (r.error) throw new Error(r.error);
          ctx = { world, p: r.p, user, joined: Date.now() };
          send({ t: 'joined', eid: r.p.eid });
        } catch (e) { send({ t: 'error', error: e.message }); ws.close(); }
        return;
      }
      if (msg.t === 'join') return;
      try { ctx.world.onMessage(ctx.p, msg); } catch (e) { console.error('[msg error]', msg && msg.t, e); }
    });
    ws.on('close', () => {
      clearTimeout(timer);
      if (ctx && ctx.p.ws === ws) {
        ctx.user.playSeconds = (ctx.user.playSeconds || 0) + (Date.now() - ctx.joined) / 1000;
        accounts.store.touch(1000);
        ctx.world.leave(ctx.p);
      }
    });
    ws.on('error', () => {});
  });
  const hb = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch {} }
  }, 15000);

  const ready = new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port)));
  const close = async () => {
    clearInterval(hb);
    lobby.stop(); accounts.store.flush();
    for (const ws of wss.clients) ws.terminate();
    await new Promise((r) => server.close(r));
  };
  return { server, lobby, accounts, ready, close };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const s = createServer();
  s.ready.then((port) => console.log(`\n  🔥 Emberwild is running → http://localhost:${port}\n     data: ${DATA_DIR}\n`));
  const shutdown = async () => { console.log('\nSaving worlds…'); await s.close(); process.exit(0); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
