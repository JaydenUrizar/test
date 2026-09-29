// Crafting queue, workbench proximity, blueprint learning.
import { GameWorld } from '../game.js';
import { ITEMS, RECIPE } from '../../shared/items.js';
import { canAfford, spend, addTo, mkItem } from '../inventory.js';
import { int, clamp } from '../util.js';

Object.assign(GameWorld.prototype, {
  benchTier(p) {
    let t = 0;
    for (const d of this.depsNear(p.x, p.z, 6)) {
      if ((d.type === 'workbench_1' || d.type === 'workbench_2') && Math.hypot(d.x - p.x, d.z - p.z) < 5) t = Math.max(t, d.type === 'workbench_2' ? 2 : 1);
    }
    return t;
  },
  recipeUnlocked(p, r) {
    if (!r.gate) return true;
    if (r.gate.level && p.level < r.gate.level) return false;
    if (r.gate.bp && !p.learned.includes(r.gate.bp)) return false;
    return true;
  },

  h_craft(p, m) {
    if (p.dead) return;
    const r = RECIPE[m.r];
    if (!r) return;
    const n = clamp(int(m.n, 1), 1, 20);
    if (!this.recipeUnlocked(p, r)) return this.toast(p, 'You have not unlocked that recipe yet.', 'warn');
    if (r.bench > this.benchTier(p)) return this.toast(p, r.bench === 1 ? 'You need to be near a Workbench I.' : 'You need to be near a Workbench II.', 'warn');
    if (p.craftQ.length >= 8) return this.toast(p, 'Crafting queue is full.', 'warn');
    const total = {};
    for (const [id, c] of Object.entries(r.ing)) total[id] = c * n;
    if (!canAfford(p.inv, total)) return this.toast(p, 'Missing ingredients.', 'warn');
    spend(p.inv, total);
    const last = p.craftQ[p.craftQ.length - 1];
    if (last && last.r === r.id) last.n += n; else p.craftQ.push({ r: r.id, n, t: 0 });
    this.sendInv(p);
    this.emitQ(p);
  },

  h_cancelcraft(p, m) {
    const i = int(m.i, -1);
    const c = p.craftQ[i];
    if (!c) return;
    const r = RECIPE[c.r];
    for (const [id, cnt] of Object.entries(r.ing)) this.give(p, id, cnt * c.n);
    p.craftQ.splice(i, 1);
    this.emitQ(p);
  },

  emitQ(p) { this.emit(p, { e: 'craftq', q: p.craftQ.map((c) => ({ r: c.r, n: c.n, t: +c.t.toFixed(2) })) }); },

  tickCrafting(dt) {
    for (const p of this.players.values()) {
      if (p.dead || !p.craftQ.length) continue;
      const c = p.craftQ[0];
      const r = RECIPE[c.r];
      if (r.bench > this.benchTier(p)) {
        if (this.tickN % 60 === 0) this.toast(p, 'Crafting paused — return to your workbench.', 'warn');
        continue;
      }
      c.t += dt;
      const need = r.time * (1 - 0.1 * (p.perks.craft || 0));
      if (c.t >= need) {
        c.t = 0; c.n--;
        this.give(p, r.out, r.n);
        this.giveXp(p, r.xp || 1);
        this.emit(p, { e: 'crafted', r: r.id, out: r.out });
        p.stats.crafted = (p.stats.crafted || 0) + 1;
        if (c.n <= 0) p.craftQ.shift();
        this.emitQ(p);
      } else if (this.tickN % 10 === 0) this.emitQ(p);
    }
  },

  learnBlueprint(p, item, slot) {
    const d = ITEMS[item.id];
    if (p.learned.includes(d.learn)) return this.toast(p, 'You already know this blueprint.', 'warn');
    p.learned.push(d.learn);
    item.n--; if (item.n <= 0) p.inv[slot] = null;
    this.emit(p, { e: 'learned', bp: d.learn, learned: p.learned });
    this.toast(p, `Blueprint learned: ${d.name.replace(' Blueprint', '')}`, 'good');
    this.giveXp(p, 30);
    this.sendInv(p);
  },
});
