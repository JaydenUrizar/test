// Interaction ("use"): containers, loot crates, dropped items, plants, water, devices.
import { GameWorld } from '../game.js';
import { ITEMS, DEPLOY, LOOT, CROPS } from '../../shared/items.js';
import { BIOME, WATER_LEVEL } from '../../shared/worldgen.js';
import { groundAt } from '../../shared/physics.js';
import { emptySlots, mkItem, addInstance, addTo, count } from '../inventory.js';
import { clamp, num, int, rndi, weightedPick } from '../util.js';

const CRATE_TABLE = { barrel: 'barrel', crate: 'crate', military: 'military', farm: 'farm' };
const CRATE_XP = { barrel: 4, crate: 12, military: 35, farm: 10 };
const CRATE_NAME = { barrel: 'Barrel', crate: 'Supply Crate', military: 'Military Crate', farm: 'Farm Crate' };
const CRATE_SLOTS = { barrel: 6, crate: 8, military: 10, farm: 8 };
const CRATE_RESPAWN = 900;

Object.assign(GameWorld.prototype, {
  // ---- container resolution ------------------------------------------------
  openContainer(p) {
    const o = p.open;
    if (!o) return null;
    let c = null;
    if (o.k === 'crate') {
      const cr = this.data.crates[o.id], st = this.crates.get(o.id);
      if (!cr || !st || !st.inv) return this.closeFor(p);
      if (Math.hypot(cr.x - p.x, cr.z - p.z) > 6) return this.closeFor(p);
      c = { key: 'c:' + o.id, kind: 'crate', slots: st.inv, title: CRATE_NAME[cr.kind] };
    } else if (o.k === 'dep') {
      const d = this.deps.get(o.id);
      if (!d || !d.inv) return this.closeFor(p);
      if (Math.hypot(d.x - p.x, d.z - p.z) > 6) return this.closeFor(p);
      if (d.lock && !this.authorized(p, d)) return this.closeFor(p);
      const kind = d.type === 'storage_box' || d.type === 'large_box' ? 'box' : d.type === 'loot_bag' ? 'bag' : d.type;
      c = { key: 'd:' + o.id, kind, slots: d.inv, title: d.type === 'loot_bag' ? `${d.label || 'Remains'}'s belongings` : DEPLOY[d.type].name, dep: d };
    }
    return c;
  },
  closeFor(p) { if (p.open) { p.open = null; this.emit(p, { e: 'contx' }); } return null; },
  contMsg(c, p) {
    const m = { e: 'cont', kind: c.kind, id: p.open.id, k: p.open.k, title: c.title, slots: c.slots };
    if (c.dep) { m.sub = { on: !!c.dep.on, burn: +(c.dep.burn || 0).toFixed(1), prog: +(c.dep.prog || 0).toFixed(1), lk: !!c.dep.lock }; }
    return m;
  },
  refreshContainer(c) {
    for (const p of this.players.values()) {
      if (!p.ws || !p.open) continue;
      const o = this.openContainer(p);
      if (o && o.key === c.key) this.emit(p, this.contMsg(o, p));
    }
  },
  refreshDep(d) { this.refreshContainer({ key: 'd:' + d.id }); },
  h_close(p) { p.open = null; },

  // ---- crates -----------------------------------------------------------------
  rollLoot(tableId, p, slots) {
    const t = LOOT[tableId];
    const scav = 1 + 0.1 * (p.perks.scav || 0);
    const rolls = Math.max(1, Math.round(rndi(t.rolls[0], t.rolls[1]) * this.rules.lootRate * scav));
    for (let i = 0; i < rolls; i++) {
      const [id, , mn, mx] = weightedPick(t.items);
      const it = mkItem(id, rndi(mn, mx));
      if (it.ammo !== undefined) it.ammo = 0;
      addInstance(slots, it);
    }
  },
  tickCrates() {
    for (const [id, st] of this.crates) {
      if (st.opened && this.clock - st.t > CRATE_RESPAWN && !this.players.size === false) {
        // only recycle when nobody is looking at it
        if ([...this.players.values()].some((p) => p.open && p.open.k === 'crate' && p.open.id === id)) continue;
        this.crates.delete(id);
        this.emitAll({ e: 'crate~', id, opened: false });
      }
    }
  },

  // ---- use ----------------------------------------------------------------------
  h_use(p, m) {
    if (p.dead) return;
    switch (m.k) {
      case 'crate': {
        const id = int(m.id, -1), cr = this.data.crates[id];
        if (!cr || Math.hypot(cr.x - p.x, cr.z - p.z) > 4.5 || Math.abs(cr.y - p.y) > 4) return;
        let st = this.crates.get(id);
        if (!st) {
          st = { inv: emptySlots(CRATE_SLOTS[cr.kind]), opened: true, t: this.clock };
          this.rollLoot(CRATE_TABLE[cr.kind], p, st.inv);
          this.crates.set(id, st);
          this.emitAll({ e: 'crate~', id, opened: true });
          this.giveXp(p, CRATE_XP[cr.kind]);
          p.stats.looted = (p.stats.looted || 0) + 1;
        }
        p.open = { k: 'crate', id };
        this.emit(p, this.contMsg(this.openContainer(p), p));
        return;
      }
      case 'dep': {
        const d = this.deps.get(int(m.id));
        if (!d || Math.hypot(d.x - p.x, d.z - p.z) > 4.5 || Math.abs(d.y - p.y) > 4) return;
        const def = DEPLOY[d.type];
        if (m.pk) return this.pickupDeployable(p, d);
        if (m.tog && def.device) {
          if (d.on) { d.on = false; this.emitAll({ e: 'dep~', id: d.id, on: false }); this.refreshDep(d); this.emit(p, { e: 'sfx', s: 'fireoff' }); }
          else if (d.inv[0] && d.inv[0].n > 0 || d.burn > 0) { d.on = true; this.emitAll({ e: 'dep~', id: d.id, on: true }); this.refreshDep(d); this.emit(p, { e: 'sfx', s: 'ignite' }); }
          else this.toast(p, 'Add wood as fuel first.', 'warn');
          return;
        }
        if (def.slots && !def.corpse && def.lockable === undefined && !def.device && !def.turret) return;
        if (def.slots) {
          if (d.lock && !this.authorized(p, d)) { this.emit(p, { e: 'sfx', s: 'locked' }); return this.emit(p, { e: 'lockprompt', k: 'dep', id: d.id }); }
          p.open = { k: 'dep', id: d.id };
          const c = this.openContainer(p);
          if (c) this.emit(p, this.contMsg(c, p));
        }
        return;
      }
      case 'drop': {
        const dr = this.drops.get(int(m.id));
        if (!dr || Math.hypot(dr.x - p.x, dr.z - p.z) > 3.5 || Math.abs(dr.y - p.y) > 3.5) return;
        const left = addInstance(p.inv, dr.it);
        if (left === dr.it.n) return this.toast(p, 'Inventory full.', 'warn');
        this.emit(p, { e: 'got', id: dr.it.id, n: dr.it.n - left });
        if (left > 0) dr.it.n = left;
        else { this.drops.delete(dr.id); this.emitAll({ e: 'drop-', id: dr.id, by: p.eid }); }
        this.sendInv(p);
        return;
      }
      case 'plant': {
        const pl = this.plants.get(int(m.id));
        if (!pl || Math.hypot(pl.x - p.x, pl.z - p.z) > 3.5) return;
        const c = CROPS[pl.crop];
        if (this.clock - pl.t0 < c.grow) return this.toast(p, `${c.name} isn’t ripe yet.`, 'warn');
        for (const [id, n] of c.yield) this.give(p, id, Math.max(1, Math.round(n * (0.8 + Math.random() * 0.6))));
        this.plants.delete(pl.id);
        this.emitAll({ e: 'plant-', id: pl.id });
        this.giveXp(p, 8);
        p.stats.harvested = (p.stats.harvested || 0) + 1;
        return;
      }
      case 'water': {
        const x = num(m.x, NaN), z = num(m.z, NaN);
        if (!Number.isFinite(x) || Math.hypot(x - p.x, z - p.z) > 4.6) return;
        if (this.data.height(x, z) > WATER_LEVEL - 0.05) return;
        if (this.clock < (p.drinkAt || 0)) return;
        p.drinkAt = this.clock + 0.5;
        p.water = clamp(p.water + 14, 0, 100);
        this.emit(p, { e: 'sfx', s: 'drink' });
        this.sendVitals(p, true);
        return;
      }
    }
  },

  // ---- farming -----------------------------------------------------------------
  plantSeed(p, it, d, m) {
    const tp = Array.isArray(m.tp) ? m.tp : null;
    if (!tp) return;
    const x = num(tp[0], NaN), z = num(tp[1], NaN);
    if (!Number.isFinite(x)) return;
    if (Math.hypot(x - p.x, z - p.z) > 6) return this.toast(p, 'Too far to plant there.', 'warn');
    const h = this.data.height(x, z), bio = this.data.biome(x, z);
    if (bio !== BIOME.MEADOW && bio !== BIOME.FOREST) return this.toast(p, 'The soil here is unfit for crops. Try a meadow or forest.', 'warn');
    if (this.data.landmarkAt(x, z, 0) && false) return;
    let mine = 0;
    for (const pl of this.plants.values()) {
      if (Math.hypot(pl.x - x, pl.z - z) < 1.1) return this.toast(p, 'Too close to another plant.', 'warn');
      if (pl.owner === p.uid) mine++;
    }
    if (mine >= 80) return this.toast(p, 'You have too many crops planted.', 'warn');
    for (const s of this.pieces.boxesNear(x, z)) if (x > s.minx - 0.3 && x < s.maxx + 0.3 && z > s.minz - 0.3 && z < s.maxz + 0.3) return this.toast(p, 'Can’t plant there.', 'warn');
    const pl = { id: this.id_(), crop: d.plant, x, y: h, z, t0: this.clock, owner: p.uid };
    this.plants.set(pl.id, pl);
    it.n--; if (it.n <= 0) p.inv[p.sel] = null;
    p.coolUntil = this.clock + 0.6;
    p.atkSeq++;
    this.emitAll({ e: 'plant+', pl });
    this.emit(p, { e: 'sfx', s: 'plant' });
    this.giveXp(p, 3);
    this.sendInv(p);
  },
});
