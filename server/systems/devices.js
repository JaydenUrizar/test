// Devices: campfire/furnace processing, turrets, satchel fuses, plant growth stages, corpse bag expiry.
import { GameWorld } from '../game.js';
import { ITEMS, DEPLOY, SMELT, CROPS } from '../../shared/items.js';
import { rayWorld } from '../../shared/physics.js';
import { SPECIES } from './mobs.js';
import { addTo, take, count } from '../inventory.js';
import { clamp, rnd } from '../util.js';

const RANGES = { furnace: { inp: [1, 3], out: [4, 6] }, campfire: { inp: [1, 2], out: [3, 4] } };

Object.assign(GameWorld.prototype, {
  tickDevices(dt) {
    for (const d of this.deps.values()) {
      const def = DEPLOY[d.type];
      if (!def) continue;
      if (def.spikes) { if (this.tickN % 5 === 0) this.tickSpikes(d, def); continue; }
      if (def.device && d.on) this.tickDevice(d, def, dt);
      else if (def.turret && this.tickN % 3 === 0) this.tickTurret(d, dt * 3);
      else if (d.type === 'satchel' && this.clock >= d.fuseEnd) {
        this.deps.delete(d.id); this.depIndex(d, false);
        this.emitAll({ e: 'dep-', id: d.id });
        this.explode(d.x, d.y + 0.3, d.z, 4.5, this.players.get(d.by) || null);
      } else if (d.type === 'loot_bag' && (this.clock > d.expire || !d.inv.some(Boolean))) {
        this.deps.delete(d.id); this.depIndex(d, false);
        this.emitAll({ e: 'dep-', id: d.id });
        for (const p of this.players.values()) if (p.open && p.open.k === 'dep' && p.open.id === d.id) this.closeFor(p);
      }
    }
    if (this.tickN % 100 === 0) this.tickPlants();
    if (this.tickN % 200 === 1) this.tickCrates();
  },

  tickDevice(d, def, dt) {
    const r = RANGES[def.device], rec = SMELT[def.device];
    let src = -1;
    for (let i = r.inp[0]; i <= r.inp[1]; i++) if (d.inv[i] && rec[d.inv[i].id]) { src = i; break; }
    const fuel = () => {
      if (d.burn > 0) return true;
      const f = d.inv[0];
      if (f && f.id === 'wood' && f.n > 0) { f.n--; if (f.n <= 0) d.inv[0] = null; d.burn = def.burn; return true; }
      return false;
    };
    const burning = def.device === 'campfire' || src >= 0;
    if (burning) {
      if (!fuel()) { d.on = false; d.prog = 0; this.emitAll({ e: 'dep~', id: d.id, on: false }); this.refreshDep(d); return; }
      d.burn -= dt;
    }
    if (src >= 0) {
      const [out, secs] = rec[d.inv[src].id];
      d.prog += dt;
      if (d.prog >= secs) {
        // room in outputs?
        let placed = false;
        for (let i = r.out[0]; i <= r.out[1] && !placed; i++) {
          const s = d.inv[i];
          if (s && s.id === out && s.n < ITEMS[out].stack) { s.n++; placed = true; }
          else if (!s) { d.inv[i] = { id: out, n: 1 }; placed = true; }
        }
        if (placed) { d.inv[src].n--; if (d.inv[src].n <= 0) d.inv[src] = null; d.prog = 0; this.refreshDep(d); }
        else d.prog = secs; // wait for room
      }
    } else d.prog = 0;
    if (this.tickN % 10 === 0) this.refreshDep(d);
  },

  // Spike barricade: hurts strangers (and wildlife) that walk into it.
  tickSpikes(d, def) {
    const reach = def.r + 0.4;
    for (const p of this.players.values()) {
      if (p.dead || p.spawnPro > 0 || Math.abs(p.y - d.y) > 1.6) continue;
      if ((p.x - d.x) ** 2 + (p.z - d.z) ** 2 > reach * reach) continue;
      if (this.sameTeam(p.uid, d.owner) || !this.rules.pvp || this.clock < (p.spikeAt || 0)) continue;
      p.spikeAt = this.clock + 0.6;
      this.hurtPlayer(p, def.spikes, { kind: 'spikes', mob: 'a spike barricade' });
      this.emitNear(d.x, d.z, 40, { e: 'hit', eid: 0, k: 'dep', x: p.x, y: p.y + 0.4, z: p.z, mat: 'wood' });
    }
    if (this.rules.mobs) for (const m of this.mobs.values()) {
      if (m.dead || (m.x - d.x) ** 2 + (m.z - d.z) ** 2 > reach * reach || this.clock < (m.spikeAt || 0)) continue;
      m.spikeAt = this.clock + 0.6; this.hurtMob(m, def.spikes, null, false, 'spikes');
    }
  },

  tickTurret(d, dt) {
    let slot = -1;
    for (let i = 0; i < 3; i++) if (d.inv[i] && d.inv[i].n > 0) { slot = i; break; }
    const should = slot >= 0;
    if (!!d.on !== should) { d.on = should; this.emitAll({ e: 'dep~', id: d.id, on: should }); }
    if (!should) return;
    d.cool = (d.cool || 0) - dt;
    if (d.cool > 0) return;
    const ox = d.x, oy = d.y + 1.15, oz = d.z;
    let best = null, bd = 32;
    for (const p of this.players.values()) {
      if (p.dead || p.spawnPro > 0 || this.sameTeam(p.uid, d.owner)) continue;
      if (d.lock && d.lock.auth.includes(p.uid)) continue;
      const dist = Math.hypot(p.x - ox, p.z - oz);
      if (dist >= bd) continue;
      const dx = p.x - ox, dy = p.y + 1.2 - oy, dz = p.z - oz, L = Math.hypot(dx, dy, dz);
      if (rayWorld(this.env, ox, oy, oz, dx / L, dy / L, dz / L, L - 0.4, {})) continue;
      best = { p, x: p.x, y: p.y + 1.2, z: p.z }; bd = dist;
    }
    if (!best && this.rules.mobs) for (const m of this.mobs.values()) {
      if (m.dead || !(SPECIES[m.sp].aggro || SPECIES[m.sp].ranged)) continue;
      const dist = Math.hypot(m.x - ox, m.z - oz);
      if (dist >= bd || dist > 24) continue;
      best = { m, x: m.x, y: m.y + 1, z: m.z }; bd = dist;
    }
    if (!best) return;
    d.inv[slot].n--; if (d.inv[slot].n <= 0) d.inv[slot] = null;
    d.cool = 0.18;
    const tx = best.x + rnd(-0.35, 0.35), ty = best.y + rnd(-0.4, 0.4), tz = best.z + rnd(-0.35, 0.35);
    this.emitNear(d.x, d.z, 300, { e: 'shot', eid: -d.id, w: 'turret', o: [ox, oy, oz], en: [[+tx.toFixed(1), +ty.toFixed(1), +tz.toFixed(1), 'flesh']] });
    if (best.p) { if (Math.random() < 0.72) this.hurtPlayer(best.p, 11, { kind: 'turret', mob: 'an Auto Turret' }); }
    else if (Math.random() < 0.72) this.hurtMob(best.m, 14, null, false, 'turret');
    if (this.tickN % 6 === 0) this.refreshDep(d);
  },

  tickPlants() {
    for (const pl of this.plants.values()) {
      const c = CROPS[pl.crop];
      const age = this.clock - pl.t0;
      const stage = age >= c.grow ? 3 : Math.floor((age / c.grow) * 3);
      if (stage !== pl.stage) { pl.stage = stage; this.emitAll({ e: 'plant~', id: pl.id, st: stage }); }
    }
  },
});
