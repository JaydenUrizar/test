// Combat & gathering: melee, guns (lag-compensated hitscan), bows/arrows, structure damage, explosions.
import { GameWorld } from '../game.js';
import { ITEMS, NODES, DEPLOY, CROPS } from '../../shared/items.js';
import { rayWorld, groundAt, nodeRadius, EYE_H } from '../../shared/physics.js';
import { pieceMaxHp, PIECES, pieceCenter } from '../../shared/building.js';
import { WATER_LEVEL } from '../../shared/worldgen.js';
import { SPECIES } from './mobs.js';
import { count, take, mkItem, addTo } from '../inventory.js';
import { clamp, num, int, rnd, dist3 } from '../util.js';

export const forward = (yaw, pitch) => [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];

function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, y0, y1, r, maxT) {
  const ex = ox - cx, ez = oz - cz;
  const a = dx * dx + dz * dz;
  let t0 = 0, t1 = maxT;
  if (a < 1e-9) { if (ex * ex + ez * ez > r * r) return null; }
  else {
    const b = 2 * (ex * dx + ez * dz), c = ex * ex + ez * ez - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    t0 = Math.max(0, (-b - s) / (2 * a)); t1 = Math.min(maxT, (-b + s) / (2 * a));
    if (t0 > t1) return null;
  }
  // y slab
  if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return null; }
  else {
    let ta = (y0 - oy) / dy, tb = (y1 - oy) / dy;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return t0;
}
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxT) {
  const ex = cx - ox, ey = cy - oy, ez = cz - oz;
  const tca = ex * dx + ey * dy + ez * dz;
  if (tca < 0 && ex * ex + ey * ey + ez * ez > r * r) return null;
  const d2 = ex * ex + ey * ey + ez * ez - tca * tca;
  if (d2 > r * r) return null;
  const t = tca - Math.sqrt(r * r - d2);
  return t > maxT ? null : Math.max(0, t);
}

const UNARMED = { dmg: 5, rate: 0.6, range: 2.0, kind: 'blunt' };

Object.assign(GameWorld.prototype, {
  sameTeam(uidA, uidB) {
    if (uidA === uidB) return true;
    const ta = this.teamOf(uidA);
    return !!ta && ta === this.teamOf(uidB);
  },
  teamOf(uid) { const p = this.byUid.get(uid); return p ? p.teamId : this.saved[uid]?.teamId || 0; },
  pvpAllowed(a, b) {
    if (!this.rules.pvp) return false;
    if (b.spawnPro > 0 || b.dead) return false;
    if (!this.rules.friendlyFire && this.sameTeam(a.uid, b.uid)) return false;
    return true;
  },
  dmgMult(p) { return 1 + 0.05 * (p.perks.brawn || 0); },

  // position of a player `back` seconds ago
  posAt(q, tWanted) {
    const h = q.hist;
    if (!h.length) return { x: q.x, y: q.y, z: q.z, h: 1.8 };
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i].t <= tWanted) {
        const a = h[i], b = h[i + 1];
        if (!b) return a;
        const f = clamp((tWanted - a.t) / Math.max(1e-6, b.t - a.t), 0, 1);
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, h: a.h };
      }
    }
    return h[0];
  },

  /**
   * Cast a ray for player p. Returns closest hit: { t, kind: player|mob|dep|piece|node|terrain|static, ... }
   */
  castRay(p, ox, oy, oz, dx, dy, dz, range, opts = {}) {
    let best = null;
    const consider = (h) => { if (h && (!best || h.t < best.t)) best = h; };
    const wh = rayWorld(this.env, ox, oy, oz, dx, dy, dz, range, { nodes: true });
    if (wh) consider({ t: wh.t, kind: wh.kind, piece: wh.piece, node: wh.node });
    const lim = best ? best.t : range;
    // non-collidable (hand) nodes
    if (opts.melee) {
      for (const n of this.data.nodesNear(ox + dx * range * 0.5, oz + dz * range * 0.5, range * 0.5 + 1.2)) {
        if (NODES[n.type].r > 0 || this.depletedSet.has(n.id)) continue;
        const cy = n.y + 0.4;
        const t = (n.x - ox) * dx + (cy - oy) * dy + (n.z - oz) * dz;
        if (t < 0 || t > lim) continue;
        const px = ox + dx * t - n.x, py = oy + dy * t - cy, pz = oz + dz * t - n.z;
        if (px * px + py * py + pz * pz < 0.85 * 0.85) consider({ t, kind: 'node', node: n });
      }
    }
    const lenient = opts.melee ? 0.3 : 0.08;
    const rew = opts.rewind ?? this.clock;
    for (const q of this.players.values()) {
      if (q === p || q.dead || !this.pvpAllowed(p, q)) continue;
      if ((q.x - ox) ** 2 + (q.z - oz) ** 2 > (range + 4) ** 2) continue;
      const pos = opts.melee ? q : this.posAt(q, rew);
      const hh = pos.h || 1.8;
      const t = rayCylinder(ox, oy, oz, dx, dy, dz, pos.x, pos.z, pos.y, pos.y + hh, 0.42 + lenient, lim);
      if (t !== null) {
        const th = raySphere(ox, oy, oz, dx, dy, dz, pos.x, pos.y + hh - 0.16, pos.z, 0.26 + lenient * 0.5, lim);
        consider({ t: th !== null ? th : t, kind: 'player', target: q, head: th !== null && th <= t + 0.35 });
      }
    }
    for (const m of this.mobs.values()) {
      if (m.dead) continue;
      if ((m.x - ox) ** 2 + (m.z - oz) ** 2 > (range + 4) ** 2) continue;
      const sp = SPECIES[m.sp];
      const t = rayCylinder(ox, oy, oz, dx, dy, dz, m.x, m.z, m.y, m.y + sp.h, sp.r + lenient, lim);
      if (t !== null) {
        let head = false;
        if (sp.head) { const th = raySphere(ox, oy, oz, dx, dy, dz, m.x, m.y + sp.h - 0.16, m.z, 0.26 + lenient * 0.5, lim); head = th !== null; }
        consider({ t, kind: 'mob', target: m, head });
      }
    }
    for (const d of this.depsNear(ox + dx * range * 0.5, oz + dz * range * 0.5, range * 0.5 + 2)) {
      const def = DEPLOY[d.type];
      if (!def || def.corpse) continue;
      const t = raySphere(ox, oy, oz, dx, dy, dz, d.x, d.y + 0.5, d.z, def.r + 0.25, lim);
      if (t !== null) consider({ t, kind: 'dep', dep: d });
    }
    return best;
  },

  // -------------------------------------------------------------------- attack entry point
  h_atk(p, m) {
    if (p.dead) return;
    const now = this.clock;
    const it = p.inv[p.sel];
    const d = it ? ITEMS[it.id] : null;
    if (Number.isFinite(m.yaw)) p.yaw = m.yaw;
    if (Number.isFinite(m.pitch)) p.pitch = clamp(m.pitch, -1.5, 1.5);
    if (d && d.gun && d.gun.type === 'bow') return this.bowInput(p, it, d, m);
    if (now < p.coolUntil - 0.03) return;
    if (!d || d.melee || d.cat === 'tool' || d.cat === 'build' || d.cat === 'melee') return this.meleeSwing(p, it, d);
    if (d.gun) return this.fireGun(p, it, d);
    if (d.cat === 'food' || d.cat === 'med') {
      if ((d.cat === 'food' && d.food + (d.water || 0) > 0) || d.cat === 'med') return this.consume(p, it, p.sel);
    }
    if (d.cat === 'bp') return this.learnBlueprint(p, it, p.sel);
    if (d.cat === 'seed') return this.plantSeed(p, it, d, m);
  },

  // -------------------------------------------------------------------- melee & gathering
  meleeSwing(p, it, d) {
    const w = d && d.melee ? d.melee : UNARMED;
    p.coolUntil = this.clock + w.rate;
    p.atkSeq++;
    const ox = p.x, oy = p.y + (p.flags & 2 ? 1.25 : EYE_H), oz = p.z;
    const [dx, dy, dz] = forward(p.yaw, p.pitch);
    const hit = this.castRay(p, ox, oy, oz, dx, dy, dz, w.range + 0.4, { melee: true });
    let fx = { e: 'swing', eid: p.eid };
    let wear = false;
    if (hit) {
      const hx = ox + dx * hit.t, hy = oy + dy * hit.t, hz = oz + dz * hit.t;
      fx = { e: 'hit', eid: p.eid, k: hit.kind, x: +hx.toFixed(2), y: +hy.toFixed(2), z: +hz.toFixed(2) };
      switch (hit.kind) {
        case 'node': fx.nt = hit.node.type; this.gatherHit(p, hit.node, it, d, fx); wear = true; break;
        case 'player': case 'mob': {
          const dmg = w.dmg * this.dmgMult(p);
          this.dealDamage(p, hit, dmg, 'melee', d ? d.id : 'fist');
          wear = true; break;
        }
        case 'piece': case 'dep':
          this.damageStructure(hit.kind === 'piece' ? hit.piece : hit.dep, w.dmg * this.dmgMult(p), 'melee', p);
          fx.mat = hit.kind === 'piece' ? ['wood', 'stone', 'metal'][hit.piece.tier] : 'wood'; wear = true; break;
        case 'terrain': fx.mat = 'dirt'; break;
        default: fx.mat = 'stone';
      }
    }
    this.emitNear(p.x, p.z, 60, fx);
    if (wear) this.wearItem(p, p.sel, 1);
  },

  wearItem(p, slot, n = 1) {
    const it = p.inv[slot];
    if (!it || it.dur == null) return;
    it.dur -= n;
    if (it.dur <= 0) {
      p.inv[slot] = null;
      this.toast(p, `Your ${ITEMS[it.id].name} broke!`, 'warn');
      this.emit(p, { e: 'sfx', s: 'break' });
      this.sendInv(p);
    } else if (it.dur % 10 === 0) this.sendInv(p);
  },

  gatherHit(p, node, it, d, fx) {
    if (this.depletedSet.has(node.id)) return;
    const def = NODES[node.type];
    let power = 0;
    if (def.tool === 'hand') power = 15;
    else power = d && d.power ? d.power[def.tool] || 0 : 0;
    if (power < Math.max(1, def.req)) {
      fx.deny = true;
      this.toast(p, def.req > 0 && power > 0 ? `${def.name} needs a stronger tool.` : `You need ${def.tool === 'axe' ? 'an axe or a rock' : 'a pickaxe or a rock'} for that.`, 'warn');
      return;
    }
    let h = this.nodeHp.get(node.id);
    if (!h) this.nodeHp.set(node.id, (h = { hp: def.hp, t: this.clock }));
    h.hp -= power; h.t = this.clock;
    const gr = this.rules.gatherRate * (1 + 0.12 * (p.perks.gather || 0));
    for (const [id, per] of def.drops) {
      const n = Math.max(1, Math.round((per * power / 10) * gr));
      this.give(p, id, n);
    }
    if (def.seedDrop) for (const [sid, chance] of def.seedDrop) if (Math.random() < chance) this.give(p, sid, 1);
    if (def.thorns) this.hurtPlayer(p, def.thorns, { kind: 'thorns' });
    this.giveXp(p, def.xp);
    p.stats.gathered = (p.stats.gathered || 0) + 1;
    fx.n = node.id;
    if (h.hp <= 0) {
      this.nodeHp.delete(node.id);
      const bonus = def.drops[0];
      this.give(p, bonus[0], Math.round(bonus[1] * 2 * gr));
      this.giveXp(p, def.xp * 2);
      this.depleted.set(node.id, this.clock + def.respawn * (0.8 + Math.random() * 0.4));
      this.depletedSet.add(node.id);
      this.emitAll({ e: 'node-', id: node.id, yaw: p.yaw });
      fx.fell = true;
    }
  },

  // -------------------------------------------------------------------- damage dispatch
  dealDamage(p, hit, dmg, kind, weapon) {
    if (hit.kind === 'player') {
      const q = hit.target;
      const dealt = this.hurtPlayer(q, dmg, { kind: 'player', byPlayer: p, from: p.eid, weapon });
      if (dealt > 0) {
        this.emit(p, { e: 'hm', head: !!hit.head, d: Math.round(dealt), kill: q.dead });
        this.emitNear(q.x, q.z, 60, { e: 'blood', x: q.x, y: q.y + 1.3, z: q.z });
      }
    } else if (hit.kind === 'mob') {
      this.hurtMob(hit.target, dmg, p, hit.head, weapon);
    }
  },

  damageStructure(target, dmg, kind, p) {
    if (!this.rules.raiding) return;
    const owner = target.owner;
    if (p && this.sameTeam(p.uid, owner)) return;
    const mult = kind === 'bullet' ? 0.07 : kind === 'arrow' ? 0.04 : kind === 'melee' ? 0.5 : 1;
    const d = dmg * mult;
    if (d <= 0) return;
    if (target.type in PIECES) {
      target.hp -= d; target.lastHit = this.clock;
      if (target.hp <= 0) this.destroyPiece(target.id, true);
      else this.emitAll({ e: 'piece~', id: target.id, hp: Math.round(target.hp) });
    } else {
      target.hp -= d;
      if (target.hp <= 0) this.destroyDeployable(target, true);
      else this.emitAll({ e: 'dep~', id: target.id, hp: Math.round(target.hp) });
    }
  },

  // -------------------------------------------------------------------- guns
  fireGun(p, it, d) {
    const g = d.gun;
    if (p.reload && !g.perShell) return;
    if (p.reload && g.perShell) p.reload = null;
    if (it.ammo <= 0) {
      p.coolUntil = this.clock + 0.35;
      this.emit(p, { e: 'sfx', s: 'dry' });
      if (count(p.inv, g.ammo) > 0) this.startReload(p);
      return;
    }
    it.ammo--;
    p.coolUntil = this.clock + g.rate;
    p.atkSeq++;
    const ox = p.x, oy = p.y + (p.flags & 2 ? 1.25 : EYE_H), oz = p.z;
    let spread = g.spread + p.bloom;
    if (p.sprinting) spread += 2.2;
    if (p.flags & 2) spread *= 0.65;
    if (p.flags & 16) spread *= 0.5;
    if (p.flags & 8) spread += 2.5;
    p.bloom = Math.min(g.bloom ? g.bloom * 8 : 0, p.bloom + (g.bloom || 0));
    const ends = [];
    const rew = this.clock - clamp(p.rtt / 2000 + 0.1, 0.05, 0.4);
    let hitmark = null;
    const pellets = g.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const a = rnd(0, Math.PI * 2), r = Math.sqrt(Math.random()) * spread * Math.PI / 180;
      let yaw = p.yaw + Math.cos(a) * r, pitch = p.pitch + Math.sin(a) * r;
      const [dx, dy, dz] = forward(yaw, pitch);
      const hit = this.castRay(p, ox, oy, oz, dx, dy, dz, g.range, { rewind: rew });
      const t = hit ? hit.t : g.range;
      const ex = ox + dx * t, ey = oy + dy * t, ez = oz + dz * t;
      let kind = hit ? hit.kind : 'air';
      if (hit) {
        const fall = g.pellets > 1 ? 1 - 0.65 * (t / g.range) : 1 - 0.25 * (t / g.range);
        let dmg = g.dmg * fall * this.dmgMult(p);
        if (hit.kind === 'player' || hit.kind === 'mob') {
          if (hit.head) dmg *= it.id === 'rifle' ? 2.6 : 2;
          this.dealDamage(p, hit, dmg, 'bullet', it.id);
          if (!hitmark || hit.head) hitmark = { head: !!hit.head };
        } else if (hit.kind === 'piece') { this.damageStructure(hit.piece, dmg, 'bullet', p); kind = ['wood', 'stone', 'metal'][hit.piece.tier]; }
        else if (hit.kind === 'dep') { this.damageStructure(hit.dep, dmg, 'bullet', p); kind = 'wood'; }
        else if (hit.kind === 'node') kind = NODES[hit.node.type].tool === 'pick' ? 'stone' : 'wood';
      }
      if (ends.length < 8) ends.push([+ex.toFixed(1), +ey.toFixed(1), +ez.toFixed(1), kind === 'player' || kind === 'mob' ? 'flesh' : kind]);
    }
    this.emitNear(p.x, p.z, 320, { e: 'shot', eid: p.eid, w: it.id, o: [+ox.toFixed(2), +oy.toFixed(2), +oz.toFixed(2)], en: ends });
    this.wearItem(p, p.sel, 1);
    if (it.ammo === 0 && !g.perShell) { /* auto-reload prompt on next click */ }
    this.emit(p, { e: 'ammo', a: it.ammo });
    if (this.tickN % 2 === 0 || it.ammo === 0) this.sendInv(p);
  },

  h_reload(p) {
    if (p.dead) return;
    this.startReload(p);
  },
  startReload(p) {
    const it = p.inv[p.sel];
    const d = it && ITEMS[it.id];
    if (!d || !d.gun || d.gun.type === 'bow' || p.reload) return;
    const g = d.gun;
    if (it.ammo >= g.mag) return;
    if (count(p.inv, g.ammo) <= 0) return this.toast(p, `No ${ITEMS[g.ammo].name} to reload with.`, 'warn');
    p.reload = { item: it.id, slot: p.sel, end: this.clock + g.reload };
    this.emitNear(p.x, p.z, 80, { e: 'rl', eid: p.eid, w: it.id, t: g.reload });
  },
  tickReload(p) {
    const r = p.reload;
    if (!r) return;
    const it = p.inv[r.slot];
    if (!it || it.id !== r.item || p.sel !== r.slot) { p.reload = null; return; }
    if (this.clock < r.end) return;
    const g = ITEMS[it.id].gun;
    const avail = count(p.inv, g.ammo);
    if (g.perShell) {
      if (avail > 0 && it.ammo < g.mag) { take(p.inv, g.ammo, 1); it.ammo++; }
      if (it.ammo < g.mag && count(p.inv, g.ammo) > 0) r.end = this.clock + g.reload;
      else p.reload = null;
    } else {
      const t = Math.min(g.mag - it.ammo, avail);
      take(p.inv, g.ammo, t); it.ammo += t; p.reload = null;
    }
    this.sendInv(p);
    this.emit(p, { e: 'ammo', a: it.ammo });
  },

  // -------------------------------------------------------------------- bow
  bowInput(p, it, d, m) {
    const g = d.gun;
    if (m.ph === 1) {
      if (!p.draw) return;
      const pow = clamp((this.clock - p.draw) / g.draw, 0, 1);
      p.draw = 0;
      if (pow < 0.25 || this.clock < p.coolUntil) return;
      if (!take(p.inv, g.ammo, 1)) return this.toast(p, 'No arrows.', 'warn');
      p.coolUntil = this.clock + g.rate; p.atkSeq++;
      const [dx, dy, dz] = forward(p.yaw + rnd(-1, 1) * g.spread * 0.017, p.pitch + rnd(-1, 1) * g.spread * 0.017);
      const sp = g.speed * (0.45 + 0.55 * pow);
      const a = { id: this.id_(), owner: p.eid, x: p.x, y: p.y + EYE_H - 0.1, z: p.z, vx: dx * sp, vy: dy * sp, vz: dz * sp, born: this.clock, dmg: g.dmg * (0.4 + 0.6 * pow) * this.dmgMult(p) };
      this.projectiles.set(a.id, a);
      this.emitNear(p.x, p.z, 200, { e: 'shot', eid: p.eid, w: 'bow', o: [a.x, a.y, a.z], en: [] });
      this.sendInv(p);
    } else if (m.ph === 0 || m.ph === undefined) {
      if (this.clock < p.coolUntil) return;
      if (count(p.inv, g.ammo) <= 0) return this.toast(p, 'No arrows.', 'warn');
      p.draw = this.clock;
      this.emitNear(p.x, p.z, 60, { e: 'draw', eid: p.eid });
    }
  },

  tickProjectiles(dt) {
    for (const a of this.projectiles.values()) {
      const shooter = this.players.get(a.owner);
      const sub = 3, h = dt / sub;
      let done = false;
      for (let s = 0; s < sub && !done; s++) {
        const ox = a.x, oy = a.y, oz = a.z;
        a.vy -= 12 * h;
        a.x += a.vx * h; a.y += a.vy * h; a.z += a.vz * h;
        const seg = Math.hypot(a.x - ox, a.y - oy, a.z - oz) || 1e-6;
        const dx = (a.x - ox) / seg, dy = (a.y - oy) / seg, dz = (a.z - oz) / seg;
        const wh = rayWorld(this.env, ox, oy, oz, dx, dy, dz, seg, { nodes: true });
        let best = wh ? { t: wh.t, w: wh } : null;
        for (const q of this.players.values()) {
          if (q.eid === a.owner || q.dead || !shooter || !this.pvpAllowed(shooter, q)) continue;
          const t = rayCylinder(ox, oy, oz, dx, dy, dz, q.x, q.z, q.y, q.y + 1.8, 0.5, seg);
          if (t !== null && (!best || t < best.t)) best = { t, player: q, head: raySphere(ox, oy, oz, dx, dy, dz, q.x, q.y + 1.65, q.z, 0.3, seg) !== null };
        }
        for (const m of this.mobs.values()) {
          if (m.dead) continue;
          const sp = SPECIES[m.sp];
          const t = rayCylinder(ox, oy, oz, dx, dy, dz, m.x, m.z, m.y, m.y + sp.h, sp.r + 0.1, seg);
          if (t !== null && (!best || t < best.t)) best = { t, mob: m };
        }
        if (best) {
          done = true;
          const hx = ox + dx * best.t, hy = oy + dy * best.t, hz = oz + dz * best.t;
          if (best.player && shooter) { const dmg = a.dmg * (best.head ? 2 : 1); this.dealDamage(shooter, { kind: 'player', target: best.player, head: best.head }, dmg, 'arrow', 'bow'); }
          else if (best.mob && shooter) this.hurtMob(best.mob, a.dmg, shooter, false, 'bow');
          else if (best.w && best.w.kind === 'piece' && shooter) this.damageStructure(best.w.piece, a.dmg, 'arrow', shooter);
          this.emitNear(hx, hz, 100, { e: 'hit', k: best.player || best.mob ? 'flesh' : best.w.kind === 'terrain' ? 'terrain' : 'wood', x: hx, y: hy, z: hz, arrow: true });
          if (Math.random() < 0.6) this.spawnDrop(mkItem('arrow', 1), hx, hy, hz);
        }
      }
      if (done || this.clock - a.born > 6 || a.y < this.data.height(a.x, a.z) - 2) this.projectiles.delete(a.id);
    }
  },

  // -------------------------------------------------------------------- explosions
  explode(x, y, z, radius, byPlayer) {
    this.emitNear(x, z, 300, { e: 'boom', x, y, z, r: radius });
    for (const pc of this.pieces.near(x, z, radius + 3)) {
      const c = pieceCenter(pc);
      const d = Math.hypot(c.x - x, pc.y + 1.5 - y, c.z - z);
      if (d <= radius + 2) this.damageStructure(pc, 300 * (1 - 0.5 * (d / (radius + 2))), 'explosive', byPlayer);
    }
    for (const dep of this.depsNear(x, z, radius + 2)) {
      if (dep.type === 'loot_bag') continue;
      const d = Math.hypot(dep.x - x, dep.y - y, dep.z - z);
      if (d <= radius) this.damageStructure(dep, 400 * (1 - 0.5 * d / radius), 'explosive', byPlayer);
    }
    for (const q of this.players.values()) {
      if (q.dead) continue;
      const d = Math.hypot(q.x - x, q.y + 1 - y, q.z - z);
      if (d < radius + 1.5 && (this.rules.pvp || q === byPlayer || true)) {
        if (q !== byPlayer && byPlayer && !this.rules.pvp) continue;
        this.hurtPlayer(q, 130 * (1 - d / (radius + 1.5)), { kind: 'explosion', byPlayer, weapon: 'satchel' });
      }
    }
    for (const m of this.mobs.values()) if (!m.dead && Math.hypot(m.x - x, m.z - z) < radius + 1) this.hurtMob(m, 150, byPlayer, false, 'satchel');
  },
});
