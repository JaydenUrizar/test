// Survival: hunger/thirst/temperature/stamina, weather & time, damage, death, respawn, consumables.
import { GameWorld } from '../game.js';
import { ITEMS, DEPLOY, PERKS, EQUIP_SLOTS, LOOT } from '../../shared/items.js';
import { BIOME, WATER_LEVEL } from '../../shared/worldgen.js';
import { groundAt } from '../../shared/physics.js';
import { mkItem, addTo, emptySlots } from '../inventory.js';
import { clamp, rnd, weightedPick, int } from '../util.js';

const BASE_TEMP = [16, 22, 18, 14, 32, -8, 2]; // by biome id
const WEATHER = [['clear', 45], ['cloudy', 24], ['rain', 15], ['fog', 8], ['storm', 8]];

Object.assign(GameWorld.prototype, {
  armorFor(p) { let a = 0; for (const it of p.equip) if (it) a += ITEMS[it.id].armor || 0; return Math.min(0.7, a); },
  warmthFor(p) { let w = 0; for (const it of p.equip) if (it) w += ITEMS[it.id].warmth || 0; return w; },

  sunLevel() { return Math.sin(((this.hour - 6) / 24) * Math.PI * 2); },

  envTemp(p) {
    const h = this.data.height(p.x, p.z);
    const bio = this.data.biome(p.x, p.z);
    const sun01 = (this.sunLevel() + 1) / 2;
    const nightDrop = bio === BIOME.DESERT ? 34 : 11;
    let t = BASE_TEMP[bio] - (1 - sun01) * nightDrop - Math.max(0, h) * 0.05;
    const wt = this.weather.type;
    t += wt === 'rain' ? -5 : wt === 'storm' ? -8 : wt === 'fog' ? -2 : 0;
    if (h < WATER_LEVEL - 0.3) t -= 9;
    // warmth sources
    let warm = this.warmthFor(p);
    const held = p.inv[p.sel];
    if (held && ITEMS[held.id].warmth && ITEMS[held.id].cat !== 'armor') warm += ITEMS[held.id].warmth;
    for (const d of this.depsNear(p.x, p.z, 8)) {
      if (d.on && (d.type === 'campfire' || d.type === 'furnace')) {
        const dd = Math.hypot(d.x - p.x, d.z - p.z);
        if (dd < 8) warm += 22 * (1 - dd / 8);
      }
    }
    // roofed & enclosed
    if (this.pieces.boxesNear(p.x, p.z).some((b) => b.floor && b.miny > p.y + 1.8 && b.miny < p.y + 5 && p.x >= b.minx && p.x <= b.maxx && p.z >= b.minz && p.z <= b.maxz)) warm += 7;
    return t + warm;
  },

  tickSurvival(dt) {
    for (const p of this.players.values()) {
      if (p.dead) continue;
      p.spawnPro = Math.max(0, p.spawnPro - dt);
      p.bloom = Math.max(0, p.bloom - dt * 5);
      const sprinting = !!p.sprinting && Date.now() - p.lastMove < 400;
      const endure = p.perks.endure || 0;
      const hot = p.temp > 38.2;
      p.food = clamp(p.food - dt * 0.05 * (sprinting ? 1.7 : 1) * (1 - 0.06 * endure), 0, 100);
      p.water = clamp(p.water - dt * 0.075 * (sprinting ? 1.7 : 1) * (hot ? 1.8 : 1) * (p.sick > 0 ? 1.5 : 1), 0, 100);
      // stamina
      const maxSt = this.maxStamina(p);
      if (sprinting) p.stamina = Math.max(0, p.stamina - dt * 15);
      else p.stamina = Math.min(maxSt, p.stamina + dt * (p.flags & 2 ? 22 : 17));
      p.exhausted = p.stamina <= 0.5;
      p.budget = Math.min(4, p.budget); // clamp (accrual done in tick)
      if (p.exhausted) p.budget = Math.min(p.budget, 1.2);
      // temperature
      if (this.tickN % 10 === p.eid % 10) {
        const eff = this.envTemp(p);
        p.tempTarget = eff >= 15 ? (eff > 36 ? 36.5 + (eff - 36) * 0.3 : 36.5) : 36.5 - (15 - eff) * 0.36;
      }
      if (p.tempTarget !== undefined) p.temp += (p.tempTarget - p.temp) * dt * 0.03;
      // damage over time
      let dot = 0;
      if (p.food <= 0) dot += 0.7;
      if (p.water <= 0) dot += 1.1;
      if (p.temp < 30) dot += (30 - p.temp) * 0.35;
      if (p.temp > 40.5) dot += (p.temp - 40.5) * 0.6;
      if (p.sick > 0) { p.sick -= dt; dot += 0.6; }
      if (dot > 0) this.hurtPlayer(p, dot * dt, { kind: p.food <= 0 ? 'hunger' : p.water <= 0 ? 'thirst' : p.temp < 30 ? 'cold' : p.temp > 40 ? 'heat' : 'sickness' }, true);
      else if (p.hp < p.maxHp && p.food > 35 && p.water > 35 && p.temp > 34 && this.clock - p.lastHurt > 7) p.hp = Math.min(p.maxHp, p.hp + dt * 0.7);
      // healing over time
      for (let i = p.hot.length - 1; i >= 0; i--) {
        const h = p.hot[i];
        const t = Math.min(dt, h.left);
        p.hp = Math.min(p.maxHp, p.hp + h.rate * t); h.left -= t;
        if (h.left <= 0) p.hot.splice(i, 1);
      }
      // temperature warnings
      if (this.tickN % 100 === p.eid % 100) {
        if (p.temp < 33.5) this.toast(p, 'You are freezing! Find a fire or put on clothing.', 'warn');
        else if (p.temp > 38.8) this.toast(p, 'You are overheating! Find shade and water.', 'warn');
      }
      this.tickReload(p);
      if (this.tickN % 5 === p.eid % 5) this.sendVitals(p);
    }
  },

  tickWeather(dt) {
    if (this.clock >= this.weather.next) {
      const prev = this.weather.type;
      let type = weightedPick(WEATHER)[0];
      if (prev === 'storm') type = 'rain';
      this.weather = { type, next: this.clock + rnd(200, 520) };
      this.emitAll({ e: 'weather', type });
    }
    if (this.tickN % 100 === 0) this.emitAll({ e: 'time', h: this.hour, d: this.day });
  },

  tickWorldEvents(dt) {
    for (const p of this.players.values()) {
      if (!p.ws) {
        p.linger -= dt;
        if (p.linger <= 0) this.removePlayer(p);
        continue;
      }
      p.seconds += dt;
      if (this.tickN % 10 === p.eid % 10 && !p.dead) {
        const lm = this.data.landmarkAt(p.x, p.z, 15);
        if (lm && !p.disc.has(lm.id)) {
          p.disc.add(lm.id);
          this.emit(p, { e: 'disc', id: lm.id, name: lm.name });
          this.toast(p, `Discovered ${lm.name}!  +75 XP`, 'good');
          this.giveXp(p, 75);
        }
      }
    }
  },

  // ---------------------------------------------------------------- damage
  hurtPlayer(p, dmg, src = {}, quiet = false) {
    if (p.dead || dmg <= 0) return 0;
    const environmental = ['fall', 'hunger', 'thirst', 'cold', 'heat', 'sickness'].includes(src.kind);
    if (!environmental && p.spawnPro > 0) return 0;
    if (!environmental) dmg *= 1 - this.armorFor(p);
    p.hp -= dmg;
    p.lastHurt = this.clock;
    if (!quiet) {
      this.emit(p, { e: 'hurt', d: Math.round(dmg), from: src.from, kind: src.kind });
      p.sendHp = true;
    }
    if (p.hp <= 0) { p.hp = 0; this.killPlayer(p, src); }
    return dmg;
  },

  killPlayer(p, src = {}) {
    if (p.dead) return;
    p.dead = true; p.hp = 0; p.deaths++;
    p.respawnAt = this.clock + 3;
    p.reload = null; p.open = null; p.craftQ = []; p.hot = [];
    let killer = '';
    if (src.byPlayer) { killer = src.byPlayer.name; if (src.byPlayer !== p) { src.byPlayer.kills++; this.giveXp(src.byPlayer, 40); } }
    else if (src.mob) killer = src.mob;
    const cause = src.kind;
    // death drop
    if (this.rules.deathDrop === 'all') {
      const slots = emptySlots(36);
      let k = 0;
      for (const it of [...p.inv, ...p.equip]) if (it) slots[k++] = it;
      p.inv = emptySlots(30); p.equip = emptySlots(4);
      if (k > 0) {
        const d = { id: this.id_(), type: 'loot_bag', x: p.x, y: groundAt(this.env, p.x, p.z, p.y + 1), z: p.z, ry: 0, owner: p.uid, hp: 1, inv: slots, expire: this.clock + 900, label: p.name };
        this.deps.set(d.id, d); this.depIndex(d, true);
        this.emitAll({ e: 'dep+', d: this.depView(d) });
      }
      this.sendInv(p);
    }
    this.emitAll({ e: 'kill', victim: p.name, killer, cause, weapon: src.weapon || '' });
    const bags = [...this.deps.values()].filter((d) => d.type === 'sleeping_bag' && d.owner === p.uid).map((d) => ({ id: d.id, x: Math.round(d.x), z: Math.round(d.z), cd: Math.max(0, Math.ceil((d.cool || 0) - this.clock)) }));
    this.emit(p, { e: 'dead', killer, cause, bags });
    this.emitAll({ e: 'pst', eid: p.eid, dead: true });
  },

  respawn(p, bagId) {
    let pos = null;
    if (bagId) {
      const d = this.deps.get(bagId);
      if (d && d.type === 'sleeping_bag' && d.owner === p.uid && this.clock >= (d.cool || 0)) {
        pos = { x: d.x + 0.9, z: d.z, y: d.y };
        d.cool = this.clock + 30;
      } else this.toast(p, 'That sleeping bag is on cooldown or gone — spawning at the coast.', 'warn');
    }
    if (!pos) { const sp = this.spawnPoint(); pos = { x: sp.x, z: sp.z, y: groundAt(this.env, sp.x, sp.z, 500) }; }
    p.x = pos.x; p.z = pos.z; p.y = groundAt(this.env, pos.x, pos.z, pos.y + 1) + 0.05;
    p.dead = false; p.maxHp = this.maxHp(p); p.hp = p.maxHp; p.food = Math.max(p.food, 60); p.water = Math.max(p.water, 60); p.temp = 36.5; p.tempTarget = 36.5;
    p.stamina = this.maxStamina(p); p.spawnPro = 6; p.air = false; p.budget = 4; p.sick = 0; p.strikes = 0;
    if (!p.inv.some(Boolean)) { addTo(p.inv, 'rock', 1); addTo(p.inv, 'torch', 1); }
    this.emit(p, { e: 'respawned', x: p.x, y: p.y, z: p.z, self: this.selfState(p) });
    this.sendInv(p); this.sendVitals(p, true);
    this.emitAll({ e: 'pst', eid: p.eid, dead: false });
  },

  // ---------------------------------------------------------------- consumables
  consume(p, item, slot) {
    const d = ITEMS[item.id];
    if (d.cat === 'food') {
      p.food = clamp(p.food + (d.food || 0), 0, 100);
      p.water = clamp(p.water + (d.water || 0), 0, 100);
      if (d.sick && Math.random() < d.sick) { p.sick = 25; this.toast(p, 'That raw meat made you sick…', 'warn'); }
      this.emit(p, { e: 'sfx', s: d.water > d.food ? 'drink' : 'eat' });
    } else if (d.cat === 'med') {
      p.hot.push({ rate: d.heal / d.hot, left: d.hot });
      this.emit(p, { e: 'sfx', s: 'heal' });
    }
    item.n--; if (item.n <= 0) p.inv[slot] = null;
    p.coolUntil = this.clock + 0.9;
    p.atkSeq++;
    this.sendInv(p); this.sendVitals(p, true);
  },

  h_perk(p, m) {
    const id = m.id;
    if (!PERKS[id] || p.points <= 0) return;
    const r = p.perks[id] || 0;
    if (r >= PERKS[id].max) return;
    p.perks[id] = r + 1; p.points--;
    if (id === 'vital') { p.maxHp = this.maxHp(p); p.hp += 8; }
    this.emit(p, { e: 'perks', perks: p.perks, points: p.points });
    this.sendVitals(p, true);
  },

  checkQuestStats(p) { /* tutorial progress is derived client-side from inv/events */ },
});
