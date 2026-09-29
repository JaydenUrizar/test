// Tiny static file server that behaves like GitHub Pages (no API, 404 page), optionally under a sub-path.
// Usage: node scripts/serve-dist.mjs [dir=dist] [port=8080] [base=/]        e.g. node scripts/serve-dist.mjs dist 8080 /test/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.resolve(process.argv[2] || path.join(ROOT, 'dist'));
const port = +(process.argv[3] || 8080);
let base = process.argv[4] || '/'; if (!base.endsWith('/')) base += '/';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
export function serve(dirPath = dir, listenPort = port, basePath = base) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!p.startsWith(basePath) || p.includes('..')) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end('<h1>404</h1>'); }
    p = p.slice(basePath.length);
    let f = path.join(dirPath, p || 'index.html');
    try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); } catch { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end('<h1>404</h1>'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => server.listen(listenPort, '127.0.0.1', () => r({ server, port: server.address().port })));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) serve().then(({ port }) => console.log(`Serving ${dir} at http://127.0.0.1:${port}${base}`));
