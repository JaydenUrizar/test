// Wildlife and raider NPCs. Mobs only simulate near players; respawn at their home spot.
import { GameWorld } from '../game.js';
import { LOOT } from '../../shared/items.js';
import { groundAt, resolveHorizontal, rayWorld } from '../../shared/physics.js';
import { WATER_LEVEL } from '../../shared/worldgen.js';
import { mkItem } from '../inventory.js';
import { clamp, rnd, rndi, weightedPick } from '../util.js';

// st: 0 idle, 1 wander, 2 chase, 3 attack, 4 flee, 5 aim (raider)
export const SPECIES = {
  deer: { name: 'Deer', hp: 60, walk: 1.8, run: 8.5, r: 0.5, h: 1.5, xp: 12, drops: [['raw_meat', 3], ['hide', 2]], flee: 20, leash: 60 },
  boar: { name: 'Boar', hp: 90, walk: 1.6, run: 6.4, r: 0.55, h: 0.95, xp: 18, drops: [['raw_meat', 4], ['hide', 2]], neutral: true, dmg: 11, cd: 1.2, reach: 1.7, leash: 50 },
  wolf: { name: 'Wolf', hp: 70, walk: 2.4, run: 8.2, r: 0.45, h: 1.0, xp: 28, drops: [['raw_meat', 3], ['hide', 2]], aggro: 24, dmg: 11, cd: 0.9, reach: 1.7, leash: 90 },
  bear: { name: 'Bear', hp: 260, walk: 2.0, run: 6.8, r: 0.8, h: 1.7, xp: 90, drops: [['raw_meat', 8], ['hide', 5]], aggro: 16, dmg: 32, cd: 1.5, reach: 2.3, leash: 70 },
  raider: { name: 'Raider', hp: 100, walk: 2.2, run: 5.2, r: 0.42, h: 1.8, xp: 70, drops: [], aggro: 48, ranged: true, dmg: 9, cd: 0.55, range: 55, head: true, leash: 70, loot: 'raider' },
};

Object.assign(GameWorld.prototype, {
  initMobs() {
    this.mobs.clear();
    if (!this.rules.mobs) return;
    const add = (sp, x, z, home) => {
      const S = SPECIES[sp];
      const m = { id: this.id_(), sp, hx: x, hz: z, x, z, y: groundAt(this.env, x, z, 500), yaw: rnd(0, 6.28), hp: S.hp, st: 0, dead: false, t: rnd(0, 4), atkSeq: 0, target: 0, cd: 0, respawn: 0, wx: x, wz: z, aggro: 0, lm: home };
      this.mobs.set(m.id, m);
    };
    for (const s of this.data.mobSpawns) add(s.species, s.x, s.z);
    for (const s of this.data.raiderSpawns) add('raider', s.x, s.z, s.lm);
  },

  tickMobs(dt) {
    if (!this.rules.mobs) return;
    const players = [...this.players.values()].filter((p) => !p.dead);
    const night = this.sunLevel() < -0.1;
    for (const m of this.mobs.values()) {
      const S = SPECIES[m.sp];
      if (m.dead) {
        if (this.clock >= m.respawn) {
          m.dead = false; m.hp = S.hp; m.x = m.hx; m.z = m.hz; m.y = groundAt(this.env, m.x, m.z, 500); m.st = 0; m.target = 0; m.aggro = 0;
        }
        continue;
      }
      // find nearest player (active area check)
      let near = null, nd = Infinity;
      for (const p of players) { const d = Math.hypot(p.x - m.x, p.z - m.z); if (d < nd) { nd = d; near = p; } }
      if (!near || nd > 170) continue;
      const tgt = m.target ? this.players.get(m.target) : null;
      let target = tgt && !tgt.dead ? tgt : null;
      const homeD = Math.hypot(m.x - m.hx, m.z - m.hz);
      // aggro acquisition
      const range = (S.aggro || 0) * (night && m.sp === 'wolf' ? 1.3 : 1) * (near.flags & 2 ? 0.6 : 1) * (near.sprinting ? 1.3 : 1);
      if (!target && range && nd < range && near.spawnPro <= 0 && (!S.ranged || this.hasLos(m, near))) { target = near; m.target = near.eid; m.aggro = this.clock; }
      if (target) {
        const td = Math.hypot(target.x - m.x, target.z - m.z);
        if (td > (S.leash || 60) + 20 || homeD > (S.leash || 60) + 40 || target.spawnPro > 0) { m.target = 0; target = null; }
      }
      let vx = 0, vz = 0, speed = 0;
      if (m.sp === 'deer' && nd < S.flee) {
        m.st = 4; const a = Math.atan2(m.x - near.x, m.z - near.z);
        vx = Math.sin(a); vz = Math.cos(a); speed = S.run; m.yaw = Math.atan2(-vx, -vz);
      } else if (target) {
        const dx = target.x - m.x, dz = target.z - m.z, td = Math.hypot(dx, dz) || 1;
        m.yaw = Math.atan2(-dx, -dz);
        m.cd -= dt;
        if (S.ranged) {
          const los = td < S.range && this.hasLos(m, target);
          if (los) {
            m.st = 5;
            if (td > 22) { vx = dx / td; vz = dz / td; speed = S.walk * 1.2; }
            else if (td < 9) { vx = -dx / td; vz = -dz / td; speed = S.walk; }
            else { const sgn = Math.sin(this.clock * 0.7 + m.id) > 0 ? 1 : -1; vx = -dz / td * sgn; vz = dx / td * sgn; speed = S.walk * 0.8; }
            if (m.cd <= 0) { m.cd = S.cd + rnd(0, 0.5); this.mobShoot(m, target, td); }
          } else { m.st = 2; vx = dx / td; vz = dz / td; speed = S.run; }
        } else if (td > S.reach) { m.st = 2; vx = dx / td; vz = dz / td; speed = S.run; }
        else {
          m.st = 3;
          if (m.cd <= 0) {
            m.cd = S.cd; m.atkSeq++;
            this.hurtPlayer(target, S.dmg * rnd(0.85, 1.15), { kind: 'mob', mob: S.name, from: m.id });
            this.emitNear(m.x, m.z, 60, { e: 'mobatk', id: m.id });
            if (target.dead) m.target = 0;
          }
        }
      } else {
        // idle / wander
        m.t -= dt;
        if (m.t <= 0) {
          m.t = rnd(3, 9);
          if (Math.random() < 0.6) { const a = rnd(0, 6.28), r = rnd(4, 14); m.wx = m.hx + Math.cos(a) * r; m.wz = m.hz + Math.sin(a) * r; m.st = 1; }
          else m.st = 0;
        }
        if (m.st === 1) {
          const dx = m.wx - m.x, dz = m.wz - m.z, d = Math.hypot(dx, dz);
          if (d < 0.8) m.st = 0; else { vx = dx / d; vz = dz / d; speed = S.walk; m.yaw = Math.atan2(-vx, -vz); }
        }
      }
      if (speed > 0) {
        let mvx = vx, mvz = vz;
        if (m.sideT > 0) { m.sideT -= dt; mvx = -vz * m.sideDir * 0.9 + vx * 0.3; mvz = vx * m.sideDir * 0.9 + vz * 0.3; } // sidestep around obstacles
        const s = { x: m.x + mvx * speed * dt, z: m.z + mvz * speed * dt, y: m.y };
        const nh = this.data.height(s.x, s.z);
        if (nh > WATER_LEVEL + 0.3) {
          resolveHorizontal(this.env, s, S.r * 0.8);
          const moved = Math.hypot(s.x - m.x, s.z - m.z);
          if (moved < speed * dt * 0.25) {
            m.stuck = (m.stuck || 0) + dt;
            if (m.stuck > 0.45 && !(m.sideT > 0)) { m.sideT = 0.9; m.sideDir = Math.random() < 0.5 ? -1 : 1; m.stuck = 0; }
          } else m.stuck = 0;
          m.x = s.x; m.z = s.z;
        } else { m.st = 0; m.t = 0; }
      }
      m.y = groundAt(this.env, m.x, m.z, m.y + 1);
    }
  },

  hasLos(m, p) {
    const ox = m.x, oy = m.y + 1.5, oz = m.z;
    const dx = p.x - ox, dy = p.y + 1.3 - oy, dz = p.z - oz;
    const d = Math.hypot(dx, dy, dz) || 1;
    return !rayWorld(this.env, ox, oy, oz, dx / d, dy / d, dz / d, d - 0.5, {});
  },

  mobShoot(m, p, td) {
    m.atkSeq++;
    const S = SPECIES[m.sp];
    const ox = m.x, oy = m.y + 1.5, oz = m.z;
    const chance = clamp(0.8 - td * 0.012, 0.12, 0.65) * (p.flags & 2 ? 0.75 : 1) * (p.sprinting ? 0.7 : 1);
    const hit = Math.random() < chance;
    const tx = p.x + (hit ? 0 : rnd(-1.5, 1.5)), ty = p.y + 1.2 + (hit ? 0 : rnd(-0.8, 0.8)), tz = p.z + (hit ? 0 : rnd(-1.5, 1.5));
    this.emitNear(m.x, m.z, 300, { e: 'shot', eid: -m.id, w: 'raider_gun', o: [+ox.toFixed(1), +oy.toFixed(1), +oz.toFixed(1)], en: [[+tx.toFixed(1), +ty.toFixed(1), +tz.toFixed(1), hit ? 'flesh' : 'dirt']] });
    if (hit) this.hurtPlayer(p, S.dmg * rnd(0.8, 1.2), { kind: 'mob', mob: S.name, from: m.id });
  },

  hurtMob(m, dmg, p, head, weapon) {
    if (m.dead) return;
    m.hp -= dmg;
    const S = SPECIES[m.sp];
    if (p) {
      this.emit(p, { e: 'hm', head: !!head, d: Math.round(dmg), kill: m.hp <= 0 });
      if (S.neutral || S.aggro || S.ranged) { m.target = p.eid; m.aggro = this.clock; }
    }
    this.emitNear(m.x, m.z, 60, { e: 'blood', x: m.x, y: m.y + S.h * 0.6, z: m.z });
    if (m.hp <= 0) this.killMob(m, p);
  },

  killMob(m, p) {
    const S = SPECIES[m.sp];
    m.dead = true; m.hp = 0; m.target = 0;
    m.respawn = this.clock + (m.sp === 'raider' ? 420 : 300);
    this.emitNear(m.x, m.z, 100, { e: 'mobdie', id: m.id, sp: m.sp, x: m.x, y: m.y, z: m.z });
    for (const [id, n] of S.drops) this.spawnDrop(mkItem(id, n + rndi(0, 1)), m.x + rnd(-0.6, 0.6), m.y + 0.5, m.z + rnd(-0.6, 0.6));
    if (S.loot) {
      const t = LOOT[S.loot];
      const rolls = rndi(t.rolls[0], t.rolls[1]);
      for (let i = 0; i < rolls; i++) {
        const [id, , mn, mx] = weightedPick(t.items);
        this.spawnDrop(mkItem(id, rndi(mn, mx)), m.x + rnd(-1, 1), m.y + 0.5, m.z + rnd(-1, 1));
      }
    }
    if (p) { this.giveXp(p, S.xp); p.stats.kills = (p.stats.kills || 0) + 1; this.emit(p, { e: 'mobkill', sp: m.sp }); }
  },
});
