// Emberwild server entry: static files, REST API (accounts, server browser), WebSocket game transport.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createCore } from './core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const MAX_WORLDS = parseInt(process.env.MAX_WORLDS || '8', 10);

export function createServer({ port = PORT, host = HOST, dataDir = DATA_DIR } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const core = createCore({ dataDir, maxWorlds: MAX_WORLDS, maxConnPerIp: parseInt(process.env.MAX_CONN_PER_IP || '12', 10), uptime: () => process.uptime() });
  const { accounts, lobby } = core;

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
  const readBody = (req) => new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > 20000) { reject(new Error('Body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('Bad JSON')); } });
    req.on('error', reject);
  });
  // CORS so a statically hosted client (e.g. GitHub Pages) can talk to this server: <page>?server=https://your-host
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Max-Age': '600' };
  const json = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(b) }); res.end(b); };
  async function api(req, res, url) {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    let body = {};
    try { if (req.method === 'POST') body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }); }
    const r = core.api(url.pathname, req.method, body, req.headers.authorization, req.socket.remoteAddress || '');
    return json(res, r.code, r.body);
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
  const clientIp = (req) => (process.env.TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket.remoteAddress || '';
  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    core.connection(ws, clientIp(req));
  });
  const hb = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch {} }
  }, 15000);

  const ready = new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port)));
  const close = async () => {
    clearInterval(hb);
    core.stop();
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
