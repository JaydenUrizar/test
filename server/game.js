// GameWorld: one running, authoritative Emberwild server world.
import path from 'node:path';
import { JsonStore } from './store.js';
import { WorldData, WORLD_HALF, WATER_LEVEL } from '../shared/worldgen.js';
import { PieceIndex, pieceCenter } from '../shared/building.js';
import { groundAt, isBlocked, SPEED, EYE_H, PLAYER_H } from '../shared/physics.js';
import { ITEMS, INV_SLOTS, EQUIP_SLOTS, HOTBAR, DEPLOY, MODES, RULE_KEYS, xpForLevel, MAX_LEVEL } from '../shared/items.js';
import { emptySlots, mkItem, addTo, addPreferred, addInstance, sanitizeSlots, count, moveSlot, slotAccepts, maxStack } from './inventory.js';
import { clamp, num, int, dist2, Bucket, cleanText, rnd, rndi, pick } from './util.js';

export const TICK = 1 / 20;
const worldCache = new Map();
export function getWorldData(seed) {
  const k = String(seed);
  let w = worldCache.get(k);
  if (!w) {
    w = new WorldData(seed);
    worldCache.set(k, w);
    if (worldCache.size > 4) worldCache.delete(worldCache.keys().next().value);
  }
  return w;
}

export function normalizeRules(mode, rules = {}) {
  const base = { ...(MODES[mode] || MODES.survival) };
  delete base.label;
  const out = { ...base };
  for (const k of RULE_KEYS) if (rules[k] !== undefined) out[k] = rules[k];
  out.pvp = !!out.pvp; out.raiding = !!out.raiding; out.friendlyFire = !!out.friendlyFire; out.mobs = !!out.mobs; out.decay = !!out.decay;
  out.deathDrop = out.deathDrop === 'none' ? 'none' : 'all';
  out.gatherRate = clamp(num(out.gatherRate, 1), 0.25, 10);
  out.lootRate = clamp(num(out.lootRate, 1), 0.25, 10);
  out.dayLength = clamp(num(out.dayLength, 1200), 120, 7200);
  return out;
}

export class GameWorld {
  constructor(cfg, dir) {
    this.cfg = cfg;
    this.id = cfg.id;
    this.rules = normalizeRules(cfg.mode, cfg.rules);
    this.data = getWorldData(cfg.seed);
    this.store = new JsonStore(path.join(dir, 'worlds', cfg.id + '.json'), null);
    this.S = this.store.data || { v: 1 };
    this.store.data = this.S;
    this.tickN = 0;
    this.clock = this.S.clock || 0;
    this.hour = this.S.hour ?? 8;
    this.day = this.S.day || 1;
    this.nextId = this.S.nextId || 1000;
    this.players = new Map();     // eid -> player
    this.byUid = new Map();
    this.saved = this.S.players || {};   // uid -> persisted player data
    this.S.players = this.saved;
    this.teams = this.S.teams || {};      // teamId -> {id, name, leader, members:[uid]}
    this.S.teams = this.teams;
    this.names = this.S.names || {};      // uid -> name
    this.S.names = this.names;
    this.bans = new Set(this.S.bans || []);
    this.pieces = new PieceIndex();
    this.deps = new Map();                // deployables
    this.depGrid = new Map();
    this.plants = new Map();
    this.drops = new Map();
    this.depleted = new Map();            // nodeId -> respawn clock
    this.depletedSet = new Set();
    this.nodeHp = new Map();              // nodeId -> {hp, t}
    this.crates = new Map();              // crateId -> {inv, opened}
    this.projectiles = new Map();
    this.mobs = new Map();
    this.weather = this.S.weather || { type: 'clear', next: 120 };
    this.evAll = [];
    this.env = {
      world: this.data, pieces: this.pieces, depleted: this.depletedSet,
      solids: (x, z) => this.solidsNear(x, z),
    };
    this.emptySince = Date.now();
    this.lastSave = Date.now();
    this.load();
    if (this.S.wall) this.clock += Math.min(6 * 3600, (Date.now() - this.S.wall) / 1000) * 0.5; // offline catch-up (crops, respawns)
    this.initMobs();
  }

  // ------------------------------------------------------------- ids / events
  id_() { return this.nextId++; }
  emit(p, ev) { if (p.ws) p.out.push(ev); }
  emitAll(ev) { for (const p of this.players.values()) if (p.ws) p.out.push(ev); }
  emitNear(x, z, r, ev, except = -1) {
    const r2 = r * r;
    for (const p of this.players.values()) if (p.ws && p.eid !== except && (p.x - x) ** 2 + (p.z - z) ** 2 <= r2) p.out.push(ev);
  }
  toast(p, text, kind = 'info') { this.emit(p, { e: 'toast', text, kind }); }
  systemChat(text) { this.emitAll({ e: 'chat', ch: 'sys', text }); }

  // ------------------------------------------------------------- persistence
  load() {
    const S = this.S;
    for (const p of S.pieces || []) { p.boxes = undefined; this.pieces.add(p); }
    for (const d of S.deps || []) { this.deps.set(d.id, d); this.depIndex(d, true); }
    for (const p of S.plants || []) this.plants.set(p.id, p);
    for (const d of S.drops || []) this.drops.set(d.id, d);
    for (const [id, t] of S.depleted || []) { this.depleted.set(id, t); this.depletedSet.add(id); }
    for (const [id, c] of S.crates || []) this.crates.set(id, c);
    for (const d of this.deps.values()) if (d.type === 'turret') d.tgt = null;
  }
  serialize() {
    const S = this.S;
    S.wall = Date.now(); S.v = 1; S.cfg = this.cfg; S.clock = this.clock; S.hour = this.hour; S.day = this.day; S.nextId = this.nextId; S.weather = this.weather;
    S.pieces = [...this.pieces.byId.values()].map((p) => { const { boxes, ...r } = p; return r; });
    S.deps = [...this.deps.values()].map((d) => { const { tgt, cool, ...r } = d; return r; });
    S.plants = [...this.plants.values()];
    S.drops = [...this.drops.values()];
    S.depleted = [...this.depleted.entries()];
    S.crates = [...this.crates.entries()];
    S.bans = [...this.bans];
    for (const p of this.players.values()) this.saved[p.uid] = this.exportPlayer(p);
  }
  save(sync = false) {
    this.serialize();
    if (sync) this.store.flush(); else this.store.touch(50);
    this.lastSave = Date.now();
  }

  exportPlayer(p) {
    return {
      x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.dead ? 0 : p.hp, food: p.food, water: p.water, temp: p.temp,
      xp: p.xp, level: p.level, points: p.points, perks: p.perks, learned: p.learned, inv: p.inv, equip: p.equip, sel: p.sel,
      teamId: p.teamId || 0, bag: p.bag || 0, kills: p.kills, deaths: p.deaths, seconds: p.seconds, disc: [...p.disc], dead: !!p.dead,
      stats: p.stats, tut: p.tut, name: p.name, lastOn: Date.now(),
    };
  }

  // ------------------------------------------------------------- spatial index for deployables
  depIndex(d, add) {
    const k = Math.floor(d.x / 16) * 4096 + Math.floor(d.z / 16);
    let a = this.depGrid.get(k);
    if (add) { if (!a) this.depGrid.set(k, (a = new Set())); a.add(d); } else if (a) a.delete(d);
  }
  depsNear(x, z, r = 16) {
    const out = [];
    const c0 = Math.floor((x - r) / 16), c1 = Math.floor((x + r) / 16), d0 = Math.floor((z - r) / 16), d1 = Math.floor((z + r) / 16);
    for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) {
      const a = this.depGrid.get(cx * 4096 + cz);
      if (a) for (const d of a) out.push(d);
    }
    return out;
  }
  solidsNear(x, z) {
    const out = [];
    for (const d of this.depsNear(x, z, 3)) {
      const def = DEPLOY[d.type];
      if (def && def.solid) out.push({ x: d.x, z: d.z, r: def.r, y0: d.y, y1: d.y + 1.2 });
    }
    return out;
  }

  // ------------------------------------------------------------- players
  newPlayerData() {
    const inv = emptySlots(INV_SLOTS);
    addTo(inv, 'rock', 1); addTo(inv, 'torch', 1); addTo(inv, 'bandage', 2); addTo(inv, 'berries', 6);
    return { hp: 100, food: 90, water: 90, temp: 36.5, xp: 0, level: 1, points: 0, perks: {}, learned: [], inv, equip: emptySlots(4), sel: 0, teamId: 0, bag: 0, kills: 0, deaths: 0, seconds: 0, disc: [], stats: {}, tut: {} };
  }

  spawnPoint() {
    const s = pick(this.data.spawns);
    const h = this.data.height(s.x, s.z);
    return { x: s.x + rnd(-6, 6), z: s.z + rnd(-6, 6), h };
  }

  join(ws, user, opts = {}) {
    if (this.bans.has(user.uid)) return { error: 'You are banned from this server' };
    // reattach to a lingering body
    let p = this.byUid.get(user.uid);
    if (p) {
      if (p.ws && p.ws !== ws) { try { p.ws.send(JSON.stringify({ t: 'kicked', reason: 'Logged in from another location' })); p.ws.close(); } catch {} }
      p.ws = ws; p.linger = 0; p.out = []; p.rate = new Map();
    } else {
      if (this.players.size >= this.cfg.maxPlayers) return { error: 'Server is full' };
      const sd = this.saved[user.uid] || this.newPlayerData();
      const fresh = !this.saved[user.uid];
      const nd = this.newPlayerData();
      p = {
        eid: this.id_(), uid: user.uid, name: user.name, ws, app: user.appearance, out: [], rate: new Map(),
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, vy: 0,
        hp: sd.hp ?? 100, food: sd.food ?? 90, water: sd.water ?? 90, temp: sd.temp ?? 36.5, stamina: 100,
        xp: sd.xp || 0, level: sd.level || 1, points: sd.points || 0, perks: sd.perks || {}, learned: sd.learned || [],
        inv: sanitizeSlots(sd.inv || nd.inv, INV_SLOTS), equip: sanitizeSlots(sd.equip, 4), sel: sd.sel || 0,
        teamId: sd.teamId || 0, bag: sd.bag || 0, kills: sd.kills || 0, deaths: sd.deaths || 0, seconds: sd.seconds || 0,
        disc: new Set(sd.disc || []), stats: sd.stats || {}, tut: sd.tut || {}, dead: false,
        craftQ: [], open: null, budget: 3, hist: [], rtt: 80, lastFire: 0, bloom: 0, reload: null, draw: 0,
        atkSeq: 0, emote: '', linger: 0, spawnPro: 0, hot: [], sick: 0, lastHurt: -99, lastMove: Date.now(), airTop: 0, joined: Date.now(),
        lastCorr: 0, strikes: 0, ammoCool: 0, coolUntil: 0, bandage: null,
      };
      if (p.sel < 0 || p.sel >= HOTBAR) p.sel = 0;
      if (fresh || sd.dead || sd.hp <= 0) {
        if (!fresh && sd.hp <= 0) p.dead = true;
      }
      if (fresh) {
        const sp = this.spawnPoint();
        p.x = sp.x; p.z = sp.z; p.y = groundAt(this.env, sp.x, sp.z, 500);
        p.spawnPro = 8;
      } else if (sd.x !== undefined) {
        p.x = sd.x; p.y = sd.y; p.z = sd.z; p.yaw = sd.yaw || 0;
        // make sure we're not inside something
        p.y = Math.max(p.y, groundAt(this.env, p.x, p.z, p.y + 1));
      }
      p.maxHp = this.maxHp(p);
      p.hp = clamp(p.hp, 0, p.maxHp);
      if (p.dead) p.hp = 0;
      this.players.set(p.eid, p);
      this.byUid.set(p.uid, p);
      this.names[p.uid] = p.name;
    }
    p.lastSeq = 0;
    this.emptySince = 0;
    this.sendWelcome(p);
    this.emitAll({ e: 'pj', eid: p.eid, name: p.name, app: p.app, team: p.teamId, eq: this.eqIds(p) });
    this.systemChat(`${p.name} joined the server`);
    return { ok: true, p };
  }

  leave(p, reason = 'left') {
    p.ws = null;
    p.linger = 20; // seconds the body remains before removal (fast reconnect / combat-log deterrent)
    p.open = null;
    p.out = [];
  }
  removePlayer(p) {
    this.saved[p.uid] = this.exportPlayer(p);
    this.players.delete(p.eid);
    this.byUid.delete(p.uid);
    this.emitAll({ e: 'pl', eid: p.eid });
    this.systemChat(`${p.name} left the server`);
    if (this.players.size === 0) this.emptySince = Date.now();
    this.save();
  }

  maxHp(p) { return 100 + 8 * (p.perks.vital || 0); }
  maxStamina(p) { return 100 + 10 * (p.perks.endure || 0); }

  sendWelcome(p) {
    const players = [...this.players.values()].map((q) => ({ eid: q.eid, name: q.name, app: q.app, team: q.teamId, eq: this.eqIds(q) }));
    this.emit(p, {
      e: 'welcome',
      you: this.selfState(p),
      world: {
        id: this.id, name: this.cfg.name, seed: this.cfg.seedRaw ?? this.cfg.seed, rules: this.rules, mode: this.cfg.mode,
        hour: this.hour, day: this.day, weather: this.weather.type, owner: this.cfg.ownerUid === p.uid, ownerName: this.cfg.ownerName,
        invite: this.cfg.ownerUid === p.uid ? this.cfg.invite : undefined, maxPlayers: this.cfg.maxPlayers, official: !!this.cfg.official,
      },
      players,
      pieces: [...this.pieces.byId.values()].map((q) => this.pieceView(q)),
      deps: [...this.deps.values()].map((d) => this.depView(d)),
      plants: [...this.plants.values()],
      depleted: [...this.depleted.keys()],
      drops: [...this.drops.values()],
      crates: [...this.crates.entries()].filter(([, c]) => c.opened).map(([id]) => id),
      teams: this.teamsView(),
    });
    this.sendInv(p);
    this.sendVitals(p, true);
    this.emit(p, { e: 'craftq', q: p.craftQ.map((c) => ({ r: c.r, n: c.n, t: c.t })) });
  }

  selfState(p) {
    return {
      eid: p.eid, name: p.name, x: p.x, y: p.y, z: p.z, yaw: p.yaw, dead: p.dead, xp: p.xp, level: p.level, points: p.points,
      perks: p.perks, learned: p.learned, sel: p.sel, uid: p.uid, tut: p.tut, kills: p.kills, deaths: p.deaths,
      xpNext: xpForLevel(p.level), disc: [...p.disc], bag: p.bag, team: p.teamId,
    };
  }

  sendInv(p) { this.emit(p, { e: 'inv', inv: p.inv, eq: p.equip, sel: p.sel }); }
  sendVitals(p, force = false) {
    const v = [Math.round(p.hp * 10) / 10, Math.round(p.food * 10) / 10, Math.round(p.water * 10) / 10, Math.round(p.stamina), Math.round(p.temp * 10) / 10, p.maxHp, this.maxStamina(p)];
    const key = v.join(',');
    if (!force && p.lastVit === key) return;
    p.lastVit = key;
    this.emit(p, { e: 'vit', v, xp: p.xp, lvl: p.level, pts: p.points, next: xpForLevel(p.level) });
  }

  // ------------------------------------------------------------- xp
  giveXp(p, n) {
    if (p.level >= MAX_LEVEL) return;
    p.xp += Math.round(n);
    let up = false;
    while (p.level < MAX_LEVEL && p.xp >= xpForLevel(p.level)) {
      p.xp -= xpForLevel(p.level); p.level++; p.points++; up = true;
    }
    if (up) {
      this.emit(p, { e: 'level', level: p.level, points: p.points });
      this.toast(p, `Level up! You are now level ${p.level}. Spend your perk point (K).`, 'good');
    }
    this.sendVitals(p, true);
  }

  // ------------------------------------------------------------- main tick
  tick() {
    const dt = TICK;
    this.tickN++;
    this.clock += dt;
    this.hour = (this.hour + (dt / this.rules.dayLength) * 24) % 24;
    if (this.hour < 24 * dt / this.rules.dayLength && this.tickN > 1) this.day++;
    for (const p of this.players.values()) {
      p.budget = Math.min(4, p.budget + dt * SPEED.sprint * 1.3);
      p.hist.push({ t: this.clock, x: p.x, y: p.y, z: p.z, h: p.flags & 2 ? 1.3 : PLAYER_H });
      if (p.hist.length > 14) p.hist.shift();
    }
    this.tickSurvival(dt);
    this.tickWeather(dt);
    this.tickCrafting(dt);
    this.tickMobs(dt);
    this.tickProjectiles(dt);
    this.tickDevices(dt);
    this.tickWorldEvents(dt);
    this.broadcastSnapshots();
    if (this.tickN % 200 === 0) this.slowTick();
  }

  slowTick() {
    // respawn depleted nodes, expire drops, decay
    for (const [id, t] of this.depleted) {
      if (this.clock >= t) {
        this.depleted.delete(id); this.depletedSet.delete(id);
        this.emitAll({ e: 'node+', id });
      }
    }
    for (const [id, d] of this.drops) if (this.clock > d.ttl) { this.drops.delete(id); this.emitAll({ e: 'drop-', id }); }
    for (const [id, h] of this.nodeHp) if (this.clock - h.t > 60) this.nodeHp.delete(id);
    this.tickDecay();
    if (Date.now() - this.lastSave > 30000) this.save();
  }

  // ------------------------------------------------------------- snapshots (AOI filtered)
  broadcastSnapshots() {
    const AOI_P = 260 * 260, AOI_M = 200 * 200;
    for (const p of this.players.values()) {
      if (!p.ws) { p.out.length = 0; continue; }
      const P = [];
      for (const q of this.players.values()) {
        if (q === p) continue;
        if ((q.x - p.x) ** 2 + (q.z - p.z) ** 2 > AOI_P) continue;
        P.push([q.eid, +q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2), +q.yaw.toFixed(2), +q.pitch.toFixed(2), q.flags | (q.dead ? 32 : 0) | (q.ws ? 0 : 64), this.heldId(q), q.atkSeq, Math.round(q.hp), q.emote]);
      }
      const M = [];
      for (const m of this.mobs.values()) {
        if (m.dead) continue;
        if ((m.x - p.x) ** 2 + (m.z - p.z) ** 2 > AOI_M) continue;
        M.push([m.id, m.sp, +m.x.toFixed(2), +m.y.toFixed(2), +m.z.toFixed(2), +m.yaw.toFixed(2), m.st, Math.round(m.hp), m.atkSeq]);
      }
      const PR = [];
      for (const a of this.projectiles.values()) PR.push([a.id, +a.x.toFixed(2), +a.y.toFixed(2), +a.z.toFixed(2), +a.vx.toFixed(1), +a.vy.toFixed(1), +a.vz.toFixed(1)]);
      const msg = { t: 's', k: this.tickN, a: p.lastSeq, h: +this.hour.toFixed(3), P, M, PR, ev: p.out.length ? p.out : undefined };
      if (p.teamId && this.tickN % 20 === 0) { const t = this.teams[p.teamId]; if (t) msg.tm = t.members.map((u) => this.byUid.get(u)).filter((q) => q && q !== p && !q.dead).map((q) => [q.eid, +q.x.toFixed(0), +q.z.toFixed(0)]); }
      if (this.evAll.length) msg.ev = (msg.ev || []).concat(this.evAll);
      p.out = [];
      try { p.ws.send(JSON.stringify(msg)); } catch {}
    }
    this.evAll = [];
  }

  heldId(p) { const s = p.inv[p.sel]; return s ? s.id : ''; }

  // ------------------------------------------------------------- message dispatch
  onMessage(p, msg) {
    if (!msg || typeof msg.t !== 'string') return;
    const t = msg.t;
    // basic per-type rate limits
    const lim = RATES[t];
    if (!lim) return;
    let b = p.rate.get(t);
    if (!b) p.rate.set(t, (b = new Bucket(lim[0], lim[1])));
    if (!b.allow()) return;
    const h = this['h_' + t];
    if (h) h.call(this, p, msg);
  }

  h_ping(p, m) {
    p.rtt = clamp(num(m.rtt, 80), 0, 800);
    this.emit(p, { e: 'pong', ts: num(m.ts) });
  }

  h_mv(p, m) {
    if (p.dead) return;
    const x = num(m.x, NaN), y = num(m.y, NaN), z = num(m.z, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    p.lastSeq = int(m.s, p.lastSeq);
    const yaw = num(m.yaw), pitch = clamp(num(m.pitch), -1.6, 1.6);
    const dx = x - p.x, dz = z - p.z;
    const d = Math.hypot(dx, dz);
    let bad = false;
    if (Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF) bad = true;
    else if (d > p.budget + 0.4) bad = true;
    else if (y - groundAt(this.env, x, z, y) > 2.4 || y < groundAt(this.env, x, z, y) - 0.6 - (WATER_LEVEL - this.data.height(x, z) > 1 ? 3 : 0)) bad = true;
    else if (d > 0.01 && isBlocked(this.env, x, y, z)) bad = true;
    if (bad) {
      p.strikes++;
      if (this.clock - p.lastCorr > 0.15) { p.lastCorr = this.clock; this.emit(p, { e: 'corr', x: p.x, y: p.y, z: p.z, s: p.lastSeq }); }
      return;
    }
    p.budget = Math.max(0, p.budget - d);
    // fall damage / airborne tracking
    const gh = groundAt(this.env, x, z, y + 0.4);
    const airborne = y - gh > 0.25;
    if (airborne) { if (!p.air) { p.air = true; p.airTop = Math.max(p.y, y); } p.airTop = Math.max(p.airTop, y); }
    else if (p.air) {
      p.air = false;
      const fall = p.airTop - y;
      if (fall > 4 && this.data.height(x, z) > WATER_LEVEL - 0.6) this.hurtPlayer(p, (fall - 4) * 9, { kind: 'fall' });
    }
    if (d > 0.02) p.lastMove = Date.now();
    p.x = x; p.y = y; p.z = z; p.yaw = yaw; p.pitch = pitch;
    const f = int(m.f);
    p.flags = (f & 1 ? 1 : 0) | (f & 2 ? 2 : 0) | (f & 16 ? 16 : 0) | (this.data.height(x, z) < WATER_LEVEL - 1 ? 4 : 0) | (airborne ? 8 : 0) | (p.reload ? 128 : 0);
    p.sprinting = !!(f & 1) && d > 0.03;
    if (m.e !== undefined) p.emote = typeof m.e === 'string' ? cleanText(m.e, 12) : '';
  }

  h_sel(p, m) {
    const i = int(m.i, -1);
    if (i < 0 || i >= HOTBAR || p.dead) return;
    if (p.sel !== i) { p.sel = i; p.reload = null; p.draw = 0; p.coolUntil = Math.max(p.coolUntil, this.clock + 0.25); this.emit(p, { e: 'sel', i }); }
  }

  // -------- inventory
  slotsFor(p, ref) {
    const kind = ref && ref[0], i = int(ref && ref[1], -1);
    if (kind === 'inv') return i >= 0 && i < INV_SLOTS ? { slots: p.inv, i, kind: 'inv' } : null;
    if (kind === 'eq') return i >= 0 && i < 4 ? { slots: p.equip, i, kind: 'eq' } : null;
    if (kind === 'c') {
      const c = this.openContainer(p);
      return c && i >= 0 && i < c.slots.length ? { slots: c.slots, i, kind: c.kind, c } : null;
    }
    return null;
  }

  h_mv_item(p, m) {
    if (p.dead) return;
    const a = this.slotsFor(p, m.a), b = this.slotsFor(p, m.b);
    if (!a || !b) return;
    // output slots of devices can only be taken from
    const okTo = (id) => slotAccepts(b.kind, b.i, id);
    const okFrom = (id) => slotAccepts(a.kind, a.i, id);
    if (!moveSlot(a.slots, a.i, b.slots, b.i, int(m.n, 0) || undefined, okFrom, okTo)) return;
    this.afterInvChange(p, a, b);
  }

  eqIds(p) { return p.equip.map((it) => (it ? it.id : 0)); }
  afterInvChange(p, ...refs) {
    this.emitAll({ e: 'peq', eid: p.eid, eq: this.eqIds(p) });
    if (p.reload) { const s = p.inv[p.sel]; if (!s || s.id !== p.reload.item) p.reload = null; }
    this.sendInv(p);
    for (const r of refs) if (r && r.c) this.refreshContainer(r.c);
    this.checkQuestStats(p);
  }

  h_qm(p, m) { // quick move (shift-click / double-click)
    if (p.dead) return;
    const a = this.slotsFor(p, m.a);
    if (!a || !a.slots[a.i]) return;
    const it = a.slots[a.i];
    const d = ITEMS[it.id];
    const c = this.openContainer(p);
    let target = null;
    if (a.kind === 'inv') {
      if (c && !(c.readonlyIn)) target = { slots: c.slots, kind: c.kind, c, range: [0, c.slots.length] };
      else if (d.cat === 'armor') { const si = EQUIP_SLOTS.indexOf(d.slot); if (si >= 0) { const tgt = { slots: p.equip, i: si, kind: 'eq' }; if (moveSlot(a.slots, a.i, tgt.slots, si, it.n, () => true, (id) => slotAccepts('eq', si, id))) return this.afterInvChange(p, a); } }
      else if (a.i >= HOTBAR) target = { slots: p.inv, kind: 'inv', range: [0, HOTBAR] };
      else target = { slots: p.inv, kind: 'inv', range: [HOTBAR, INV_SLOTS] };
    } else target = { slots: p.inv, kind: 'inv', range: [0, INV_SLOTS] };
    if (!target) return;
    // try stacking then empty
    let left = it.n;
    for (let pass = 0; pass < 2 && left > 0; pass++) {
      for (let i = target.range[0]; i < target.range[1] && left > 0; i++) {
        if (!slotAccepts(target.kind, i, it.id)) continue;
        const s = target.slots[i];
        if (pass === 0 && s && s.id === it.id && maxStack(it.id) > 1) { const t = Math.min(left, maxStack(it.id) - s.n); s.n += t; left -= t; }
        else if (pass === 1 && !s) { target.slots[i] = { ...it, n: left }; left = 0; }
      }
    }
    if (left === it.n) return;
    if (left <= 0) a.slots[a.i] = null; else it.n = left;
    this.afterInvChange(p, a, target);
  }

  h_drop(p, m) {
    if (p.dead) return;
    const a = this.slotsFor(p, m.a);
    if (!a || !a.slots[a.i]) return;
    const it = a.slots[a.i];
    const n = clamp(int(m.n, it.n) || it.n, 1, it.n);
    const dropped = { ...it, n };
    if (n === it.n) a.slots[a.i] = null; else it.n -= n;
    const yaw = p.yaw;
    this.spawnDrop(dropped, p.x - Math.sin(yaw) * 1.2, p.y + 1.0, p.z - Math.cos(yaw) * 1.2);
    this.afterInvChange(p, a);
  }

  spawnDrop(inst, x, y, z) {
    const d = { id: this.id_(), it: inst, x, y, z, ttl: this.clock + 300 };
    d.y = Math.max(groundAt(this.env, x, z, y + 0.5), this.data.height(x, z)) + 0.15;
    this.drops.set(d.id, d);
    this.emitAll({ e: 'drop+', d });
    return d;
  }

  // give an item to a player, dropping overflow at their feet
  give(p, id, n, extra) {
    if (!ITEMS[id]) return;
    let left = n;
    if (extra && maxStack(id) === 1) {
      for (let k = 0; k < n; k++) { if (addPreferred(p.inv, id, 1, extra)) this.spawnDrop({ ...mkItem(id, 1), ...extra }, p.x, p.y + 1, p.z); }
      left = 0;
    } else left = addPreferred(p.inv, id, n);
    if (left > 0) { this.spawnDrop(mkItem(id, left), p.x, p.y + 1, p.z); this.toast(p, 'Inventory full — items dropped', 'warn'); }
    this.emit(p, { e: 'got', id, n });
    this.sendInv(p);
  }

  h_respawn(p, m) {
    if (!p.dead || this.clock < p.respawnAt) return;
    this.respawn(p, int(m.bag, 0));
  }

  h_chat(p, m) { this.handleChat(p, m); }
}

// message type -> [rate per sec, burst]
const RATES = {
  ping: [2, 4], mv: [40, 60], sel: [12, 12], atk: [30, 30], reload: [4, 4], use: [10, 12], place: [4, 6], build: [6, 8], bupg: [6, 8], brepair: [10, 12], bremove: [4, 6],
  bdoor: [8, 8], lock: [3, 5], unlock: [3, 5], rmlock: [3, 5], craft: [5, 8], cancelcraft: [5, 8], mv_item: [20, 30], qm: [20, 30], drop: [10, 12],
  respawn: [2, 3], chat: [3, 6], perk: [4, 6], team: [3, 6], close: [6, 8], eat: [5, 6], dismiss: [4, 6], setbag: [3, 4],
};
