// Building system (server side): pieces, upgrades, repair, removal, doors, locks, deployables.
import { GameWorld } from '../game.js';
import { ITEMS, DEPLOY, CROPS } from '../../shared/items.js';
import { PIECES, PieceIndex, validatePlacement, placeCost, upgradeCost, pieceMaxHp, repairCost, pieceCenter, GRID, edgeKey, doorKey, cellKey, stairKey, edgeCells, LEVEL_H } from '../../shared/building.js';
import { groundAt, nodeRadius, EYE_H } from '../../shared/physics.js';
import { WATER_LEVEL, BIOME } from '../../shared/worldgen.js';
import { canAfford, spend, count, take, emptySlots, mkItem } from '../inventory.js';
import { clamp, num, int, cleanText } from '../util.js';

const BUILD_RANGE = 10;
const PRIVILEGE_R = 26;

Object.assign(GameWorld.prototype, {
  pieceView(p) { return { id: p.id, type: p.type, tier: p.tier, L: p.L, gx: p.gx, gz: p.gz, dir: p.dir, rot: p.rot, y: p.y, hp: Math.round(p.hp), open: !!p.open, lk: !!p.lock, o: p.owner }; },
  depView(d) {
    const v = { id: d.id, type: d.type, x: +d.x.toFixed(2), y: +d.y.toFixed(2), z: +d.z.toFixed(2), ry: d.ry, hp: Math.round(d.hp), lk: !!d.lock, on: !!d.on, o: d.owner };
    if (d.label) v.label = d.label;
    if (d.type === 'satchel') v.fuse = Math.max(0, +(d.fuseEnd - this.clock).toFixed(1));
    return v;
  },

  authorized(p, obj) {
    if (!obj.lock) return true;
    return obj.lock.auth.includes(p.uid) || obj.owner === p.uid || this.sameTeam(p.uid, obj.owner);
  },
  holding(p, id) { const s = p.inv[p.sel]; return !!s && s.id === id; },
  inReach(p, x, y, z, r) { return Math.hypot(p.x - x, p.y + 1 - y, p.z - z) <= r; },

  // is there another team's structure within privilege radius of (x,z)?
  foreignBase(p, x, z) {
    for (const pc of this.pieces.byId.values()) {
      const c = pieceCenter(pc);
      if ((c.x - x) ** 2 + (c.z - z) ** 2 < PRIVILEGE_R * PRIVILEGE_R && !this.sameTeam(p.uid, pc.owner)) return true;
    }
    return false;
  },
  isBlockedByNode(x0, z0, x1, z1) {
    for (const n of this.data.nodesNear((x0 + x1) / 2, (z0 + z1) / 2, 6)) {
      if (this.depletedSet.has(n.id)) continue;
      const r = nodeRadius(n);
      if (r > 0 && n.x > x0 - r && n.x < x1 + r && n.z > z0 - r && n.z < z1 + r) return true;
    }
    return false;
  },

  h_build(p, m) {
    if (p.dead || !this.holding(p, 'hammer')) return;
    const res = validatePlacement({ pieces: this.pieces, world: this.data, isBlockedByNode: (a, b, c, d) => this.isBlockedByNode(a, b, c, d) }, m);
    if (!res.ok) return this.emit(p, { e: 'berr', text: res.error });
    const pc = res.piece;
    const c = pieceCenter(pc);
    if (!this.inReach(p, c.x, pc.y, c.z, BUILD_RANGE + 2)) return this.emit(p, { e: 'berr', text: 'Too far away' });
    if (this.foreignBase(p, c.x, c.z)) return this.emit(p, { e: 'berr', text: 'Another team’s base is too close' });
    if (this.pieces.byId.size > 25000) return this.emit(p, { e: 'berr', text: 'World building limit reached' });
    const cost = placeCost(pc.type);
    if (!canAfford(p.inv, cost)) return this.emit(p, { e: 'berr', text: 'Not enough resources' });
    spend(p.inv, cost);
    pc.id = this.id_(); pc.owner = p.uid; pc.tier = 0; pc.hp = pieceMaxHp(pc.type, 0); pc.placed = this.clock; pc.lock = null; pc.open = false;
    this.pieces.add(pc);
    p.stats.built = (p.stats.built || 0) + 1;
    this.emitAll({ e: 'piece+', p: this.pieceView(pc) });
    this.emitNear(c.x, c.z, 80, { e: 'built', x: c.x, y: pc.y, z: c.z, t: pc.type });
    this.giveXp(p, 2);
    this.sendInv(p);
  },

  pieceFor(p, id, needAuth = true) {
    const pc = this.pieces.byId.get(int(id));
    if (!pc) return null;
    const c = pieceCenter(pc);
    if (!this.inReach(p, c.x, pc.y + 1, c.z, BUILD_RANGE + 2)) return null;
    if (needAuth && !this.sameTeam(p.uid, pc.owner)) { this.emit(p, { e: 'berr', text: 'You don’t have permission (someone else’s build)' }); return null; }
    return pc;
  },

  h_bupg(p, m) {
    if (p.dead || !this.holding(p, 'hammer')) return;
    const pc = this.pieceFor(p, m.id);
    if (!pc) return;
    const to = int(m.tier, pc.tier + 1);
    if (to !== pc.tier + 1 || to > 2) return this.emit(p, { e: 'berr', text: 'Already at that tier' });
    if (pc.type === 'door' && to === 1) return this.emit(p, { e: 'berr', text: 'Doors upgrade straight to metal' });
    const cost = upgradeCost(pc.type, to);
    if (!canAfford(p.inv, cost)) return this.emit(p, { e: 'berr', text: 'Not enough resources to upgrade' });
    spend(p.inv, cost);
    pc.tier = to; pc.hp = pieceMaxHp(pc.type, to);
    this.emitAll({ e: 'piece~', id: pc.id, tier: pc.tier, hp: pc.hp });
    this.giveXp(p, 3);
    this.sendInv(p);
  },

  h_brepair(p, m) {
    if (p.dead || !this.holding(p, 'hammer')) return;
    const pc = this.pieceFor(p, m.id);
    if (!pc) return;
    const max = pieceMaxHp(pc.type, pc.tier);
    if (pc.hp >= max - 1) return;
    if (this.clock - (pc.lastHit || -99) < 10) return this.emit(p, { e: 'berr', text: 'Recently damaged — wait a few seconds' });
    const cost = repairCost(pc);
    if (!canAfford(p.inv, cost)) return this.emit(p, { e: 'berr', text: 'Not enough resources to repair' });
    spend(p.inv, cost);
    pc.hp = max;
    this.emitAll({ e: 'piece~', id: pc.id, hp: pc.hp });
    this.sendInv(p);
  },

  h_bremove(p, m) {
    if (p.dead || !this.holding(p, 'hammer')) return;
    const pc = this.pieceFor(p, m.id);
    if (!pc) return;
    if (pc.lock && !this.authorized(p, pc)) return this.emit(p, { e: 'berr', text: 'Locked' });
    if (pc.owner === p.uid && this.clock - pc.placed < 600 && pc.tier === 0) {
      for (const [id, n] of Object.entries(placeCost(pc.type))) this.give(p, id, Math.floor(n / 2));
    }
    if (pc.lock) this.give(p, 'code_lock', 1);
    this.destroyPiece(pc.id, false);
  },

  // is piece still structurally valid?
  pieceSupported(pc) {
    const idx = this.pieces;
    const kind = PIECES[pc.type].kind;
    if (kind === 'door') { const d = idx.get(edgeKey(pc.L, pc.gx, pc.gz, pc.dir)); return !!d && d.type === 'doorway'; }
    if (kind === 'edge') return edgeCells(pc.dir, pc.gx, pc.gz).some(([x, z]) => idx.get(cellKey(pc.L, x, z)));
    if (kind === 'stairs') return !!idx.get(cellKey(pc.L, pc.gx, pc.gz));
    if (pc.type === 'foundation') return true;
    // floor L>=1
    const edges = (gx, gz) => [[0, gx, gz], [0, gx, gz + 1], [1, gx, gz], [1, gx + 1, gz]];
    const below = (gx, gz) => edges(gx, gz).some(([d, ex, ez]) => idx.get(edgeKey(pc.L - 1, ex, ez, d)));
    if (below(pc.gx, pc.gz)) return true;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nb = idx.get(cellKey(pc.L, pc.gx + dx, pc.gz + dz));
      if (nb && (nb.type === 'foundation' || (nb.type === 'floor' && below(pc.gx + dx, pc.gz + dz)))) return true;
    }
    return false;
  },

  destroyPiece(id, byDamage) {
    const pc = this.pieces.remove(id);
    if (!pc) return;
    this.emitAll({ e: 'piece-', id, boom: byDamage, t: pc.type, x: pieceCenter(pc).x, y: pc.y, z: pieceCenter(pc).z });
    // cascade collapse
    for (let guard = 0; guard < 50; guard++) {
      let changed = false;
      for (const q of [...this.pieces.byId.values()]) {
        if (!this.pieceSupported(q)) { this.pieces.remove(q.id); this.emitAll({ e: 'piece-', id: q.id, boom: true, t: q.type, x: pieceCenter(q).x, y: q.y, z: pieceCenter(q).z }); changed = true; }
      }
      if (!changed) break;
    }
  },

  h_bdoor(p, m) {
    if (p.dead) return;
    const pc = this.pieces.byId.get(int(m.id));
    if (!pc || pc.type !== 'door') return;
    const c = pieceCenter(pc);
    if (!this.inReach(p, c.x, pc.y + 1, c.z, 5)) return;
    if (!this.authorized(p, pc)) { this.emit(p, { e: 'sfx', s: 'locked' }); return this.toast(p, 'The door is locked.', 'warn'); }
    pc.open = !pc.open;
    this.emitAll({ e: 'piece~', id: pc.id, open: pc.open });
  },

  // -------------------------------------------------------------------- locks
  lockTarget(p, m) {
    if (m.k === 'piece') { const pc = this.pieces.byId.get(int(m.id)); if (pc && pc.type === 'door') { const c = pieceCenter(pc); if (this.inReach(p, c.x, pc.y + 1, c.z, 5)) return { obj: pc, c }; } }
    if (m.k === 'dep') { const d = this.deps.get(int(m.id)); if (d && DEPLOY[d.type]?.lockable && this.inReach(p, d.x, d.y + 0.5, d.z, 5)) return { obj: d }; }
    return null;
  },
  h_lock(p, m) {
    if (p.dead) return;
    const tg = this.lockTarget(p, m);
    const code = String(m.code || '');
    if (!tg || !/^\d{4}$/.test(code)) return this.toast(p, 'Enter a 4-digit code.', 'warn');
    if (tg.obj.lock) return this.toast(p, 'Already locked.', 'warn');
    if (!this.sameTeam(p.uid, tg.obj.owner)) return this.toast(p, 'You can’t lock that.', 'warn');
    if (!take(p.inv, 'code_lock', 1)) return this.toast(p, 'You need a Code Lock item.', 'warn');
    tg.obj.lock = { code, auth: [p.uid] };
    this.broadcastObj(m.k, tg.obj);
    this.toast(p, 'Lock installed. Only people who enter the code can open it.', 'good');
    this.emit(p, { e: 'sfx', s: 'lock' });
    this.sendInv(p);
  },
  h_unlock(p, m) {
    if (p.dead) return;
    const tg = this.lockTarget(p, m);
    if (!tg || !tg.obj.lock) return;
    if (this.clock < (p.lockBlock || 0)) return this.toast(p, 'Too many wrong codes. Wait a moment.', 'warn');
    if (String(m.code) === tg.obj.lock.code) {
      if (!tg.obj.lock.auth.includes(p.uid)) tg.obj.lock.auth.push(p.uid);
      this.toast(p, 'Code accepted.', 'good');
      this.emit(p, { e: 'sfx', s: 'unlock' });
      this.emit(p, { e: 'unlocked', k: m.k, id: tg.obj.id });
    } else {
      p.lockFails = (p.lockFails || 0) + 1;
      if (p.lockFails >= 4) { p.lockBlock = this.clock + 30; p.lockFails = 0; }
      this.toast(p, 'Wrong code.', 'warn');
      this.emit(p, { e: 'sfx', s: 'locked' });
    }
  },
  h_rmlock(p, m) {
    const tg = this.lockTarget(p, m);
    if (!tg || !tg.obj.lock) return;
    if (!this.sameTeam(p.uid, tg.obj.owner)) return;
    tg.obj.lock = null;
    this.give(p, 'code_lock', 1);
    this.broadcastObj(m.k, tg.obj);
  },
  broadcastObj(k, obj) {
    if (k === 'piece') this.emitAll({ e: 'piece~', id: obj.id, lk: !!obj.lock });
    else this.emitAll({ e: 'dep~', id: obj.id, lk: !!obj.lock });
  },

  // -------------------------------------------------------------------- deployables
  h_place(p, m) {
    if (p.dead) return;
    const slot = int(m.slot, -1);
    const it = p.inv[slot];
    const d = it && ITEMS[it.id];
    if (!d || !d.deploy || d.deploy === 'lock') return;
    const def = DEPLOY[d.deploy];
    const x = num(m.x, NaN), z = num(m.z, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    if (Math.hypot(x - p.x, z - p.z) > 8) return this.emit(p, { e: 'berr', text: 'Too far away' });
    const h = this.data.height(x, z);
    if (h < 0.3) return this.emit(p, { e: 'berr', text: 'Can’t place that in water' });
    if (this.foreignBase(p, x, z) && d.deploy !== 'satchel') return this.emit(p, { e: 'berr', text: 'Another team’s base is too close' });
    if (this.data.landmarkAt(x, z, 2) && d.deploy !== 'satchel') return this.emit(p, { e: 'berr', text: 'Can’t build inside a landmark' });
    let owned = 0;
    for (const dd of this.deps.values()) if (dd.owner === p.uid && dd.type !== 'loot_bag') owned++;
    if (owned >= 120) return this.emit(p, { e: 'berr', text: 'Deployable limit reached' });
    for (const o of this.depsNear(x, z, 3)) if (o.type !== 'loot_bag' && Math.hypot(o.x - x, o.z - z) < def.r + DEPLOY[o.type].r - 0.1 && !(o.type === 'satchel')) return this.emit(p, { e: 'berr', text: 'Something is in the way' });
    if (this.isBlockedByNode(x - def.r, z - def.r, x + def.r, z + def.r)) return this.emit(p, { e: 'berr', text: 'Something is in the way' });
    const y = groundAt(this.env, x, z, Math.max(p.y, m.y === undefined ? p.y : num(m.y, p.y)) + 0.7);
    const dep = { id: this.id_(), type: d.deploy, x, y, z, ry: num(m.ry, 0), owner: p.uid, hp: def.hp, lock: null, on: false, placed: this.clock };
    if (def.slots) dep.inv = emptySlots(def.slots);
    if (def.fuse) { dep.fuseEnd = this.clock + def.fuse; dep.by = p.eid; }
    if (def.device) { dep.burn = 0; dep.prog = 0; }
    it.n--; if (it.n <= 0) p.inv[slot] = null;
    this.deps.set(dep.id, dep); this.depIndex(dep, true);
    this.emitAll({ e: 'dep+', d: this.depView(dep) });
    this.sendInv(p);
    p.stats.placed = (p.stats.placed || 0) + 1;
    this.giveXp(p, 2);
  },

  destroyDeployable(d, byDamage) {
    if (!this.deps.has(d.id)) return;
    this.deps.delete(d.id); this.depIndex(d, false);
    if (d.inv) for (const it of d.inv) if (it) this.spawnDrop(it, d.x + (Math.random() - 0.5), d.y + 0.6, d.z + (Math.random() - 0.5));
    this.emitAll({ e: 'dep-', id: d.id, boom: byDamage });
    for (const p of this.players.values()) if (p.open && p.open.k === 'dep' && p.open.id === d.id) { p.open = null; this.emit(p, { e: 'contx' }); }
  },

  // owner picks up a deployable (empty containers only)
  pickupDeployable(p, d) {
    if (d.owner !== p.uid && !this.sameTeam(p.uid, d.owner)) return this.toast(p, 'That isn’t yours.', 'warn');
    if (d.lock && !this.authorized(p, d)) return this.toast(p, 'Locked.', 'warn');
    if (d.inv && d.inv.some(Boolean)) return this.toast(p, 'Empty it first.', 'warn');
    const itemId = Object.values(ITEMS).find((i) => i.deploy === d.type)?.id;
    if (!itemId) return;
    this.deps.delete(d.id); this.depIndex(d, false);
    this.emitAll({ e: 'dep-', id: d.id });
    if (d.lock) this.give(p, 'code_lock', 1);
    this.give(p, itemId, 1);
  },

  tickDecay() {
    if (!this.rules.decay) return;
    const now = Date.now();
    const last = {};
    for (const pc of [...this.pieces.byId.values()]) {
      const online = this.byUid.get(pc.owner);
      if (online) { this.saved[pc.owner] && (this.saved[pc.owner].lastOn = now); continue; }
      const lo = this.saved[pc.owner]?.lastOn ?? (this.saved[pc.owner] ? (this.saved[pc.owner].lastOn = now) : now);
      if (now - lo > 3 * 86400e3) {
        pc.hp -= pieceMaxHp(pc.type, pc.tier) * 0.004;
        if (pc.hp <= 0) this.destroyPiece(pc.id, true);
      }
    }
  },
});
