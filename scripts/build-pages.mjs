// Builds a fully static copy of the game into ./dist (for GitHub Pages or any static host):
//   dist/index.html, css/, js/, shared/, vendor/ (three + the addons we import), local-server.js (the game server, bundled for a Web Worker)
// Usage: node scripts/build-pages.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'dist'));
const sh = (...p) => path.join(ROOT, 'server', 'shims', ...p);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const copy = (from, to, filter) => fs.cpSync(from, to, { recursive: true, filter });

copy(path.join(ROOT, 'client'), OUT, (src) => !src.includes(`${path.sep}client${path.sep}dev`));
copy(path.join(ROOT, 'shared'), path.join(OUT, 'shared'));
fs.mkdirSync(path.join(OUT, 'vendor', 'three-addons', 'utils'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'node_modules/three/build/three.module.js'), path.join(OUT, 'vendor/three.module.js'));
// three.module.js imports ./three.core.js on newer releases
const core = path.join(ROOT, 'node_modules/three/build/three.core.js');
if (fs.existsSync(core)) fs.copyFileSync(core, path.join(OUT, 'vendor/three.core.js'));
// only the addons the client imports (and their relative deps, none for BufferGeometryUtils)
const used = new Set();
const scan = (dir) => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); if (f.isDirectory()) scan(p); else if (f.name.endsWith('.js')) for (const m of fs.readFileSync(p, 'utf8').matchAll(/from\s+['"]three-addons\/([^'"]+)['"]/g)) used.add(m[1]); } };
scan(path.join(ROOT, 'client', 'js'));
for (const a of used) { const dst = path.join(OUT, 'vendor/three-addons', a); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'node_modules/three/examples/jsm', a), dst); }

await build({
  entryPoints: [path.join(ROOT, 'server/browser-worker.js')],
  outfile: path.join(OUT, 'local-server.js'),
  bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: true, legalComments: 'none',
  alias: { 'node:fs': sh('fs.js'), 'node:path': sh('path.js'), 'node:crypto': sh('crypto.js') },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});

fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
fs.copyFileSync(path.join(OUT, 'index.html'), path.join(OUT, '404.html'));
const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, f) => n + (f.isDirectory() ? size(path.join(d, f.name)) : fs.statSync(path.join(d, f.name)).size), 0);
console.log(`Built ${OUT} (${(size(OUT) / 1e6).toFixed(1)} MB)`);
