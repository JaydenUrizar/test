import { createServer } from '../server/index.js';
import { Bot, sleep } from './bot.js';
import fs from 'node:fs';
const dir = '/tmp/ew-smoke-' + process.pid; fs.rmSync(dir, { recursive: true, force: true });
const srv = createServer({ port: 0, host: '127.0.0.1', dataDir: dir });
const port = await srv.ready; const base = `http://127.0.0.1:${port}`;
const a = new Bot(base, 'Alice'); await a.register();
const list = await a.api('/api/servers'); console.log('servers', list.servers.map(s => s.id));
await a.connect('official-coop');
console.log('welcome ok; pos', a.s.x.toFixed(1), a.s.y.toFixed(1), a.s.z.toFixed(1), 'inv', a.inv.filter(Boolean).map(s => s.id + 'x' + s.n).join(','));
await sleep(500);
console.log('vitals', a.vit);
// walk to nearest tree
const trees = a.world.nodesNear(a.s.x, a.s.z, 120).filter(n => n.type.startsWith('tree')).sort((p, q) => Math.hypot(p.x - a.s.x, p.z - a.s.z) - Math.hypot(q.x - a.s.x, q.z - a.s.z));
console.log('trees near', trees.length);
const t = trees[0];
console.log('walk ok', await a.walkTo(t.x, t.z, { stop: 1.6 }), 'corrs', a.corrs || 0);
a.select('rock'); a.aimAt(t.x, t.y + 1.2, t.z);
for (let i = 0; i < 12; i++) { a.attack(); await sleep(600); }
console.log('wood', a.count('wood'), 'toasts', a.toasts.slice(-2));
a.close(); await sleep(300); await srv.close(); fs.rmSync(dir, { recursive: true, force: true });
process.exit(0);
