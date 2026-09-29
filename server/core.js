// Transport-independent server core: REST-style API + per-socket game session handling.
// Used by server/index.js (HTTP + `ws`) and by the in-browser build (server/browser-worker.js).
import { Accounts } from './accounts.js';
import { Lobby } from './lobby.js';
import { Bucket } from './util.js';
import { MODES } from '../shared/items.js';

export function createCore({ dataDir, maxWorlds = 8, maxConnPerIp = 12, uptime = () => 0 } = {}) {
  const accounts = new Accounts(dataDir);
  const lobby = new Lobby(dataDir, { maxWorlds });
  lobby.start();

  const ipBuckets = new Map(), ipConns = new Map(), joinBuckets = new Map();
  const authLimit = (ip) => { let b = ipBuckets.get(ip); if (!b) ipBuckets.set(ip, (b = new Bucket(10 / 60, 10))); return b.allow(); };
  const bearer = (auth) => String(auth || '').replace(/^Bearer /, '');

  // Returns { code, body }. `body` is an already-parsed JSON object (or {}).
  function api(pathname, method, body, auth, ip = '') {
    try {
      if (pathname === '/api/health') return { code: 200, body: { ok: true, name: 'Emberwild', worlds: lobby.worlds.size, uptime: Math.round(uptime()) } };
      if (pathname === '/api/modes') return { code: 200, body: { modes: Object.fromEntries(Object.entries(MODES)) } };
      if (method === 'POST' && (pathname === '/api/register' || pathname === '/api/login')) {
        if (!authLimit(ip)) return { code: 429, body: { error: 'Too many attempts — slow down a little.' } };
        const r = pathname === '/api/register' ? accounts.register(body.name, body.password) : accounts.login(body.name, body.password);
        return { code: 200, body: { token: r.token, profile: accounts.profile(r.user) } };
      }
      const user = accounts.byToken(bearer(auth));
      if (pathname === '/api/logout' && method === 'POST') { accounts.logout(bearer(auth)); return { code: 200, body: { ok: true } }; }
      if (!user) return { code: 401, body: { error: 'Please sign in' } };
      if (pathname === '/api/me' && method === 'GET') return { code: 200, body: { profile: accounts.profile(user) } };
      if (pathname === '/api/profile' && method === 'POST') { accounts.update(user, body); return { code: 200, body: { profile: accounts.profile(user) } }; }
      if (pathname === '/api/servers' && method === 'GET') return { code: 200, body: { servers: lobby.list(user.uid) } };
      if (pathname === '/api/servers' && method === 'POST') { const s = lobby.create(user, body); return { code: 200, body: { server: lobby.view(s, user.uid) } }; }
      if (pathname === '/api/servers/invite' && method === 'POST') {
        const s = lobby.byInvite(body.code);
        if (!s) return { code: 404, body: { error: 'No server found for that invite code' } };
        return { code: 200, body: { server: lobby.view(s, user.uid), invite: String(body.code).toUpperCase() } };
      }
      const del = pathname.match(/^\/api\/servers\/([\w-]+)$/);
      if (del && method === 'DELETE') { lobby.remove(user, del[1]); return { code: 200, body: { ok: true } }; }
      return { code: 404, body: { error: 'Not found' } };
    } catch (e) {
      return { code: 400, body: { error: e.message || 'Bad request' } };
    }
  }

  // `ws` must offer on('message'|'close'|'error'), send(str) and close().
  function connection(ws, ip = '') {
    const n = (ipConns.get(ip) || 0) + 1; ipConns.set(ip, n);
    ws.on('close', () => { const c = (ipConns.get(ip) || 1) - 1; if (c <= 0) ipConns.delete(ip); else ipConns.set(ip, c); });
    if (n > maxConnPerIp) { try { ws.send(JSON.stringify({ t: 'error', error: 'Too many connections from your address' })); } catch {} ws.close(); return; }
    let ctx = null; // { world, p }
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
        let jb = joinBuckets.get(ip); if (!jb) joinBuckets.set(ip, (jb = new Bucket(30 / 60, 30)));
        if (!jb.allow()) { send({ t: 'error', error: 'Too many join attempts — wait a moment' }); ws.close(); return; }
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
  }

  const flush = () => { lobby.saveAll(); accounts.store.flush(); };
  const stop = () => { lobby.stop(); accounts.store.flush(); };
  return { accounts, lobby, api, connection, flush, stop };
}
