// In-browser game server: runs the exact same server core inside a Web Worker (bundled by scripts/build-pages.mjs).
// Storage is an IndexedDB-backed file map (see shims/fs.js); the "network" is postMessage.
import { createCore } from './core.js';
import { initFs, persistent } from './shims/fs.js';

const sockets = new Map(); // sid -> FakeSocket

class FakeSocket {
  constructor(sid) { this.sid = sid; this.h = { message: [], close: [], error: [] }; this.closed = false; this.readyState = 1; }
  on(ev, fn) { (this.h[ev] ||= []).push(fn); }
  send(str) { if (!this.closed) postMessage({ k: 'ws-msg', sid: this.sid, data: str }); }
  close() { if (this.closed) return; this.closed = true; this.readyState = 3; postMessage({ k: 'ws-close', sid: this.sid }); this.fire('close'); }
  fire(ev, ...a) { for (const f of this.h[ev] || []) { try { f(...a); } catch (e) { console.error(e); } } }
}

let core = null;
const ready = (async () => {
  const persisted = await initFs();
  core = createCore({ dataDir: '/data', maxWorlds: 8, maxConnPerIp: 1000, uptime: () => performance.now() / 1000 });
  postMessage({ k: 'ready', persisted });
})();

onmessage = async (ev) => {
  await ready;
  const m = ev.data;
  switch (m.k) {
    case 'api': { const r = core.api(m.path, m.method, m.body || {}, m.auth, 'local'); postMessage({ k: 'api', id: m.id, code: r.code, body: r.body }); break; }
    case 'ws-open': { const s = new FakeSocket(m.sid); sockets.set(m.sid, s); core.connection(s, 'local'); postMessage({ k: 'ws-open', sid: m.sid }); break; }
    case 'ws-msg': { const s = sockets.get(m.sid); if (s && !s.closed) s.fire('message', m.data, false); break; }
    case 'ws-close': { const s = sockets.get(m.sid); if (s && !s.closed) { s.closed = true; s.readyState = 3; s.fire('close'); } sockets.delete(m.sid); break; }
    case 'flush': core.flush(); break;
  }
};
export { persistent };
