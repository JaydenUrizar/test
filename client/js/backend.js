// Backend selection. Three ways to run:
//   same   — the page is served by the Node server (npm start): REST + WebSocket on the same origin.
//   remote — static page (e.g. GitHub Pages) + `?server=https://your-host` pointing at a hosted Node server.
//   local  — static page with no server: the whole game server runs in a Web Worker inside this browser
//            (single-player, saves in IndexedDB). This is what a bare GitHub Pages link uses.
const QS = new URLSearchParams(location.search);
const SKEY = 'emberwild.server';
const here = (p) => new URL(p, document.baseURI).href;

export const backend = {
  mode: 'same', apiBase: '', wsUrl: '', label: location.host || 'localhost', persisted: true, worker: null, reason: '',
  async api(path, method, body, auth) {
    if (this.mode !== 'local') return null;
    return new Promise((resolve) => {
      const id = ++this._id; this._pending.set(id, resolve);
      this.worker.postMessage({ k: 'api', id, path, method, body, auth });
    });
  },
  url(path) { return this.mode === 'remote' ? this.apiBase + path : here(path.replace(/^\//, '')); },
  openSocket() { return this.mode === 'local' ? new LocalSocket(this) : new WebSocket(this.wsUrl); },
  flush() { try { this.worker && this.worker.postMessage({ k: 'flush' }); } catch {} },
  _id: 0, _pending: new Map(), _socks: new Map(), _sid: 0,
};

class LocalSocket {
  constructor(b) {
    this.b = b; this.readyState = 0; this.sid = ++b._sid; b._socks.set(this.sid, this);
    b.worker.postMessage({ k: 'ws-open', sid: this.sid });
  }
  _open() { this.readyState = 1; this.onopen && this.onopen(); }
  send(data) { if (this.readyState === 1) this.b.worker.postMessage({ k: 'ws-msg', sid: this.sid, data }); }
  close() { if (this.readyState >= 2) return; this.readyState = 2; this.b.worker.postMessage({ k: 'ws-close', sid: this.sid }); this._closed(); }
  _closed() { if (this.readyState === 3) return; this.readyState = 3; this.b._socks.delete(this.sid); this.onclose && this.onclose(); }
}

function normalizeServer(v) {
  v = String(v || '').trim().replace(/\/+$/, '');
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = (/^(localhost|127\.|192\.168\.|10\.)/.test(v) ? 'http://' : 'https://') + v;
  return v;
}

async function healthy(base) {
  try {
    const r = await fetch(base + '/api/health', { cache: 'no-store' });
    if (!r.ok) return false;
    const j = await r.json();
    return !!(j && j.ok);
  } catch { return false; }
}

function startWorker() {
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker(new URL('../local-server.js', import.meta.url)); } catch (e) { return reject(e); }
    const t = setTimeout(() => reject(new Error('In-browser server did not start')), 15000);
    w.onerror = (e) => { clearTimeout(t); reject(new Error('In-browser server failed: ' + (e.message || 'error'))); };
    w.onmessage = (ev) => {
      const m = ev.data;
      if (m.k === 'ready') { clearTimeout(t); backend.persisted = !!m.persisted; resolve(w); return; }
      if (m.k === 'api') { const f = backend._pending.get(m.id); backend._pending.delete(m.id); f && f({ code: m.code, body: m.body }); }
      else if (m.k === 'ws-open') { const s = backend._socks.get(m.sid); s && s._open(); }
      else if (m.k === 'ws-msg') { const s = backend._socks.get(m.sid); s && s.onmessage && s.onmessage({ data: m.data }); }
      else if (m.k === 'ws-close') { const s = backend._socks.get(m.sid); s && s._closed(); }
    };
  });
}

export async function initBackend() {
  const asked = QS.get('server');
  if (asked === 'off' || asked === '') { try { localStorage.removeItem(SKEY); } catch {} }
  let remote = normalizeServer(asked && asked !== 'off' ? asked : '') || (() => { try { return normalizeServer(localStorage.getItem(SKEY)); } catch { return ''; } })();
  if (remote) {
    if (await healthy(remote)) {
      try { localStorage.setItem(SKEY, remote); } catch {}
      const u = new URL(remote);
      Object.assign(backend, { mode: 'remote', apiBase: remote, wsUrl: (u.protocol === 'https:' ? 'wss://' : 'ws://') + u.host + '/ws', label: u.host });
      return backend;
    }
    backend.reason = `Could not reach ${remote} — running offline instead.`;
    try { localStorage.removeItem(SKEY); } catch {}
  }
  if (!QS.has('local') && !/\.github\.io$/.test(location.hostname) && await healthy(here('').replace(/\/$/, ''))) {
    Object.assign(backend, { mode: 'same', wsUrl: (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + new URL('.', document.baseURI).pathname.replace(/\/$/, '') + '/ws' });
    return backend;
  }
  backend.worker = await startWorker();
  backend.mode = 'local'; backend.label = 'offline mode';
  addEventListener('pagehide', () => backend.flush());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') backend.flush(); });
  return backend;
}
