// Headless protocol bot used by integration tests. Uses the same shared physics as the real client.
import WebSocket from 'ws';
import { WorldData } from '../shared/worldgen.js';
import { PieceIndex } from '../shared/building.js';
import { stepMove } from '../shared/physics.js';
import { forward } from '../server/systems/combat.js';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Bot {
  constructor(base, name) { this.base = base; this.name = name; this.inv = []; this.eq = []; this.events = []; this.evLog = []; this.pieces = new PieceIndex(); this.depleted = new Set(); this.players = new Map(); this.deps = new Map(); this.drops = new Map(); this.seq = 0; this.vit = null; this.cont = null; this.craftQ = []; this.toasts = []; }
  async api(path, body, method) {
    const r = await fetch(this.base + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(this.token ? { authorization: 'Bearer ' + this.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
    return j;
  }
  async register(pw = 'secret123') { const j = await this.api('/api/register', { name: this.name, password: pw }); this.token = j.token; this.profile = j.profile; return j; }
  async login(pw = 'secret123') { const j = await this.api('/api/login', { name: this.name, password: pw }); this.token = j.token; this.profile = j.profile; return j; }
  connect(serverId, extra = {}) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.base.replace('http', 'ws') + '/ws');
      this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'join', token: this.token, server: serverId, ...extra })));
      this.ws.on('message', (d) => {
        const m = JSON.parse(d.toString());
        if (m.t === 'error') return reject(new Error(m.error));
        if (m.t === 'kicked') { this.kicked = m.reason; return; }
        if (m.t === 's') { this.snap = m; this.tick = m.k; for (const e of m.ev || []) this.onEv(e); this.P = m.P; this.M = m.M; return; }
        if (m.t === 'joined') { this._joined = true; }
      });
      this.ws.on('close', () => { this.closed = true; });
      const t0 = Date.now();
      const iv = setInterval(() => { if (this.welcome) { clearInterval(iv); resolve(this); } else if (Date.now() - t0 > 8000) { clearInterval(iv); reject(new Error('join timeout')); } }, 20);
    });
  }
  onEv(e) {
    this.evLog.push(e); if (this.evLog.length > 500) this.evLog.shift();
    switch (e.e) {
      case 'welcome':
        this.welcome = e; this.me = e.you; this.eid = e.you.eid; this.world = new WorldData(e.world.seed); this.wd = e.world;
        this.x = e.you.x; this.y = e.you.y; this.z = e.you.z; this.yaw = 0; this.pitch = 0; this.s = { x: this.x, y: this.y, z: this.z, vy: 0, onGround: true };
        for (const p of e.pieces) this.pieces.add({ ...p });
        for (const d of e.deps) this.deps.set(d.id, d);
        for (const id of e.depleted) this.depleted.add(id);
        for (const d of e.drops) this.drops.set(d.id, d);
        this.env = { world: this.world, pieces: this.pieces, depleted: this.depleted };
        break;
      case 'inv': this.inv = e.inv; this.eq = e.eq; this.sel = e.sel; break;
      case 'vit': this.vit = e.v; this.lvl = e.lvl; this.xp = e.xp; this.pts = e.pts; break;
      case 'cont': this.cont = e; break;
      case 'contx': this.cont = null; break;
      case 'craftq': this.craftQ = e.q; break;
      case 'toast': this.toasts.push(e.text); break;
      case 'berr': this.toasts.push('BUILD:' + e.text); break;
      case 'piece+': this.pieces.add({ ...e.p }); break;
      case 'piece-': this.pieces.remove(e.id); break;
      case 'piece~': { const p = this.pieces.byId.get(e.id); if (p) Object.assign(p, { ...e, id: p.id }); break; }
      case 'dep+': this.deps.set(e.d.id, e.d); break;
      case 'dep-': this.deps.delete(e.id); break;
      case 'dep~': { const d = this.deps.get(e.id); if (d) Object.assign(d, e); break; }
      case 'drop+': this.drops.set(e.d.id, e.d); break;
      case 'drop-': this.drops.delete(e.id); break;
      case 'node-': this.depleted.add(e.id); break;
      case 'node+': this.depleted.delete(e.id); break;
      case 'corr': this.s.x = e.x; this.s.y = e.y; this.s.z = e.z; this.corrs = (this.corrs || 0) + 1; break;
      case 'dead': this.dead = true; this.deadInfo = e; break;
      case 'respawned': this.dead = false; this.s.x = e.x; this.s.y = e.y; this.s.z = e.z; break;
      case 'hm': this.hits = (this.hits || 0) + 1; this.lastHit = e; break;
      case 'hurt': this.hurts = (this.hurts || 0) + 1; break;
    }
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  count(id) { return this.inv.reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0); }
  slotOf(id) { return this.inv.findIndex((s) => s && s.id === id); }
  select(id) { const i = this.slotOf(id); if (i < 0 || i > 5) throw new Error('not on hotbar: ' + id); this.send({ t: 'sel', i }); this.sel = i; }
  sendMove(flags = 0) { this.send({ t: 'mv', s: ++this.seq, x: this.s.x, y: this.s.y, z: this.s.z, yaw: this.yaw, pitch: this.pitch, f: flags }); }
  async walkTo(tx, tz, opts = {}) {
    const dt = 0.05; const stopAt = opts.stop ?? 1.5; let t = 0;
    while (t < (opts.timeout || 90)) {
      const dx = tx - this.s.x, dz = tz - this.s.z, d = Math.hypot(dx, dz);
      if (d < stopAt) break;
      // simple obstacle sidestep: if not progressing, jitter
      const before = { x: this.s.x, z: this.s.z };
      const wob = (this.stuck || 0) > 6 ? Math.sin(t * 3) * 1.2 : 0;
      stepMove(this.env, this.s, { mx: dx / d + wob * (-dz / d), mz: dz / d + wob * (dx / d), sprint: false, jump: (this.stuck || 0) > 3 && this.s.onGround }, dt);
      this.yaw = Math.atan2(-dx, -dz);
      this.stuck = Math.hypot(this.s.x - before.x, this.s.z - before.z) < dt * 1.5 ? (this.stuck || 0) + 1 : 0;
      this.sendMove(); t += dt; await sleep(50);
    }
    return Math.hypot(tx - this.s.x, tz - this.s.z) < stopAt + 0.5;
  }
  aimAt(x, y, z) { const dx = x - this.s.x, dy = y - (this.s.y + 1.62), dz = z - this.s.z; this.yaw = Math.atan2(-dx, -dz); this.pitch = Math.atan2(dy, Math.hypot(dx, dz)); }
  attack(extra = {}) { this.send({ t: 'atk', yaw: this.yaw, pitch: this.pitch, ...extra }); }
  async waitFor(fn, ms = 4000, label = 'condition') { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(25); } throw new Error('timeout waiting for ' + label); }
  close() { try { this.ws.close(); } catch {} }
}
