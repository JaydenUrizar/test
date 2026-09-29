// npm test: unit checks, then the full protocol integration test.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['units.mjs', 'integration.mjs']) {
  const r = spawnSync('node', [path.join(dir, f)], { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`\n${f} FAILED`); process.exit(r.status || 1); }
}
console.log('All tests passed.');
