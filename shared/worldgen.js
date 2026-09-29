// Deterministic world generation for Emberwild. Same seed => identical world on server and client.
import { Noise, mulberry32, hash2, smoothstep, lerp, clamp, seedToInt } from './noise.js';

export const WORLD_HALF = 1024;
export const WATER_LEVEL = 0;
export const CELL = 16; // resource / collider bucket size
export const BIOME = { SEA: 0, BEACH: 1, MEADOW: 2, FOREST: 3, DESERT: 4, TUNDRA: 5, HIGHLAND: 6 };
export const BIOME_NAMES = ['Open Sea', 'Beach', 'Meadow', 'Forest', 'Desert', 'Tundra', 'Highlands'];

const cellKey = (cx, cz) => cx * 4096 + cz;

export class Terrain {
  constructor(seedInt) {
    this.seed = seedInt;
    this.nA = new Noise(seedInt ^ 0x1234abcd); // continents
    this.nB = new Noise(seedInt ^ 0x9e3779b9); // hills / detail
    this.nC = new Noise(seedInt ^ 0x51ed270b); // mountains / lakes
    this.nD = new Noise(seedInt ^ 0x7f4a7c15); // climate
    this.flats = [];
    this.roadSegs = new Map();
    this.roadLines = [];
  }

  rawHeight(x, z) {
    const r = Math.hypot(x, z) / WORLD_HALF;
    const edge = 0.74 + 0.1 * this.nA.n2(x * 0.0022 + 11, z * 0.0022 - 7);
    const mask = 1 - smoothstep(edge - 0.22, edge + 0.1, r);
    const cont = (this.nA.fbm(x * 0.0028, z * 0.0028, 4) + 1) * 0.5;
    let h = mask * (6 + cont * 10) - (1 - mask) * 16;
    h += this.nB.fbm(x * 0.009, z * 0.009, 4) * 9 * mask;
    const mt = smoothstep(0.5, 0.72, (this.nC.fbm(x * 0.0017 + 77, z * 0.0017 - 33, 3) + 1) * 0.5);
    if (mt > 0) {
      const ridge = 1 - Math.abs(this.nC.n2(x * 0.0055, z * 0.0055));
      h += ridge * ridge * 78 * mt * mask;
    }
    const lake = smoothstep(0.55, 0.78, (this.nC.fbm(x * 0.0055 + 500, z * 0.0055 + 200, 3) + 1) * 0.5) * mask;
    h -= lake * 15;
    h += this.nB.fbm(x * 0.035, z * 0.035, 3) * 1.1;
    return h;
  }

  height(x, z) {
    let h = this.rawHeight(x, z);
    const f = this.flats;
    for (let i = 0; i < f.length; i++) {
      const p = f[i];
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r + 22) h = lerp(h, p.h, 1 - smoothstep(p.r, p.r + 22, d));
    }
    return h;
  }

  climate(x, z, h) {
    const t = 0.52 - (z / WORLD_HALF) * 0.3 + this.nD.fbm(x * 0.0016 + 900, z * 0.0016, 3) * 0.42 - Math.max(0, h - 22) / 100;
    const m = 0.5 + this.nD.fbm(x * 0.0022 - 300, z * 0.0022 + 100, 3) * 0.75;
    return { t, m };
  }

  biome(x, z, h = this.height(x, z)) {
    if (h < WATER_LEVEL) return BIOME.SEA;
    if (h < 2.0) return BIOME.BEACH;
    if (h > 36) return BIOME.HIGHLAND;
    const { t, m } = this.climate(x, z, h);
    if (t < 0.3) return BIOME.TUNDRA;
    if (t > 0.64 && m < 0.5) return BIOME.DESERT;
    if (m > 0.5) return BIOME.FOREST;
    return BIOME.MEADOW;
  }

  addRoad(points) {
    this.roadLines.push(points);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const seg = { ax: a.x, az: a.z, bx: b.x, bz: b.z };
      const minx = Math.min(a.x, b.x) - 8, maxx = Math.max(a.x, b.x) + 8;
      const minz = Math.min(a.z, b.z) - 8, maxz = Math.max(a.z, b.z) + 8;
      for (let cx = Math.floor(minx / 64); cx <= Math.floor(maxx / 64); cx++)
        for (let cz = Math.floor(minz / 64); cz <= Math.floor(maxz / 64); cz++) {
          const k = cellKey(cx, cz);
          let arr = this.roadSegs.get(k);
          if (!arr) this.roadSegs.set(k, (arr = []));
          arr.push(seg);
        }
    }
  }

  roadDist(x, z) {
    const arr = this.roadSegs.get(cellKey(Math.floor(x / 64), Math.floor(z / 64)));
    if (!arr) return 99;
    let best = 99;
    for (const s of arr) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - s.ax) * dx + (z - s.az) * dz) / l2, 0, 1);
      const d = Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
      if (d < best) best = d;
    }
    return best;
  }
}

// ---------------------------------------------------------------- Landmark definitions
const NAMES = {
  outpost: ['Fort Cinder', 'Bastion Hollow', 'Blackwatch Post', 'Iron Reach Garrison', 'Redgate Outpost'],
  town: ['Ashmere', 'Dunhollow', 'Brackenford', 'Lowmarch', 'Old Kettle', 'Pinewick'],
  lighthouse: ['Salt Beacon', 'Gull Point Light', 'Widow’s Lamp'],
  mine: ['Grimtooth Quarry', 'Deepvein Mine', 'Ore Hollow', 'Cragmouth Dig'],
  radio: ['Static Spire', 'Echo Tower', 'Signal Hill'],
  farmstead: ['Hollow Acres', 'Barley Fold', 'Sunder Farm', 'Marrow Fields'],
  camp: ['Raider Camp', 'Scrapper Den', 'Bandit Rest', 'Cutthroat Bivouac'],
};
const LM_SPECS = [
  { type: 'outpost', count: 3, radius: 34, hmin: 6, hmax: 55 },
  { type: 'town', count: 4, radius: 40, hmin: 4, hmax: 24 },
  { type: 'lighthouse', count: 2, radius: 12, hmin: 1.5, hmax: 5, coast: true },
  { type: 'mine', count: 3, radius: 24, hmin: 26, hmax: 70 },
  { type: 'radio', count: 2, radius: 16, hmin: 20, hmax: 70 },
  { type: 'farmstead', count: 4, radius: 28, hmin: 3, hmax: 16 },
  { type: 'camp', count: 7, radius: 14, hmin: 4, hmax: 40 },
];

// ---- structure helpers (local coords, y is offset above landmark ground)
class Builder {
  constructor(lm) { this.lm = lm; this.parts = []; this.crates = []; this.raiders = []; this.extraNodes = []; }
  rot(x, z) {
    switch (this.lm.rot) {
      case 1: return [-z, x];
      case 2: return [-x, -z];
      case 3: return [z, -x];
      default: return [x, z];
    }
  }
  box(cx, y, cz, w, h, d, mat, solid = true) {
    const [rx, rz] = this.rot(cx, cz);
    const swap = this.lm.rot % 2 === 1;
    this.parts.push({ x: this.lm.x + rx, y: this.lm.y + y, z: this.lm.z + rz, w: swap ? d : w, h, d: swap ? w : d, mat, solid });
  }
  // rectangular building with a door gap in +z wall (side 0), -z (1), +x (2), -x (3); windows on other walls
  house(cx, cz, w, d, h, doorSide, mat = 'plank', opts = {}) {
    const t = 0.3, dw = 1.8, dh = 2.5, ww = 1.4;
    const ruin = opts.ruin || 0;
    const rnd = opts.rnd || Math.random;
    this.box(cx, 0, cz, w, 0.2, d, 'floor');
    const wall = (ax, az, len, alongX, sideIdx) => {
      // wall centered at (ax,az); length len; thickness t
      const w1 = alongX ? len : t, d1 = alongX ? t : len;
      const isDoor = sideIdx === doorSide;
      const hasWin = !isDoor && len > 5 && rnd() < 0.8;
      if (rnd() < ruin * 0.4 && !isDoor) { // collapsed wall
        this.box(ax, 0, az, alongX ? len : t, h * 0.35, alongX ? t : len, mat);
        return;
      }
      const seg = (off, l, y0, hh) => {
        if (l <= 0.01 || hh <= 0.01) return;
        this.box(ax + (alongX ? off : 0), y0, az + (alongX ? 0 : off), alongX ? l : t, hh, alongX ? t : l, mat);
      };
      if (isDoor) {
        const l = (len - dw) / 2;
        seg(-(dw / 2 + l / 2), l, 0, h); seg(dw / 2 + l / 2, l, 0, h);
        seg(0, dw, dh, h - dh);
      } else if (hasWin) {
        const l = (len - ww) / 2;
        seg(-(ww / 2 + l / 2), l, 0, h); seg(ww / 2 + l / 2, l, 0, h);
        seg(0, ww, 0, 1.0); seg(0, ww, 2.1, h - 2.1);
      } else seg(0, len, 0, h);
    };
    wall(cx, cz + d / 2, w, true, 0);
    wall(cx, cz - d / 2, w, true, 1);
    wall(cx + w / 2, cz, d, false, 2);
    wall(cx - w / 2, cz, d, false, 3);
    if (!opts.noRoof && rnd() >= ruin * 0.5) this.box(cx, h, cz, w + 0.8, 0.3, d + 0.8, opts.roof || 'roof');
  }
  crate(x, z, kind, y = 0.2, ry = 0) {
    const [rx, rz] = this.rot(x, z);
    this.crates.push({ x: this.lm.x + rx, z: this.lm.z + rz, y: this.lm.y + y, ry: ry + this.lm.rot * Math.PI / 2, kind });
  }
  raider(x, z) { const [rx, rz] = this.rot(x, z); this.raiders.push({ x: this.lm.x + rx, z: this.lm.z + rz }); }
  node(type, x, z) { const [rx, rz] = this.rot(x, z); this.extraNodes.push({ type, x: this.lm.x + rx, z: this.lm.z + rz }); }
}

function buildLandmark(lm, rnd) {
  const b = new Builder(lm);
  const R = (a, c) => a + rnd() * (c - a);
  switch (lm.type) {
    case 'town': {
      const n = 6 + Math.floor(rnd() * 3);
      const placed = [];
      for (let i = 0; i < 60 && placed.length < n; i++) {
        const a = rnd() * Math.PI * 2, rr = R(6, 30);
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        const w = R(7, 10), d = R(6, 9);
        if (placed.some((p) => Math.abs(p.x - x) < (p.w + w) / 2 + 5 && Math.abs(p.z - z) < (p.d + d) / 2 + 5)) continue;
        placed.push({ x, z, w, d });
        const door = Math.floor(rnd() * 4);
        b.house(x, z, w, d, R(3.2, 4.2), door, rnd() < 0.5 ? 'plank' : 'brick', { ruin: 0.55, rnd });
        if (rnd() < 0.85) b.crate(x + (rnd() - 0.5) * (w - 3), z + (rnd() - 0.5) * (d - 3), rnd() < 0.25 ? 'military' : 'crate');
        if (rnd() < 0.6) b.crate(x + (rnd() < 0.5 ? -1 : 1) * (w / 2 + 2), z + (rnd() - 0.5) * 4, 'barrel', 0);
      }
      break;
    }
    case 'outpost': {
      const s = 22, wallH = 3.6, gate = 5;
      const wall = (cx, cz, l, alongX, gap) => {
        if (gap) {
          const seg = (l - gate) / 2;
          for (const sgn of [-1, 1]) b.box(cx + (alongX ? sgn * (gate / 2 + seg / 2) : 0), 0, cz + (alongX ? 0 : sgn * (gate / 2 + seg / 2)), alongX ? seg : 0.6, wallH, alongX ? 0.6 : seg, 'concrete');
        } else b.box(cx, 0, cz, alongX ? l : 0.6, wallH, alongX ? 0.6 : l, 'concrete');
      };
      wall(0, s, s * 2, true, true); wall(0, -s, s * 2, true, false);
      wall(s, 0, s * 2, false, false); wall(-s, 0, s * 2, false, false);
      for (const [tx, tz] of [[s, s], [-s, s], [s, -s], [-s, -s]]) {
        b.box(tx, 0, tz, 4.2, 8, 4.2, 'metal');
        b.box(tx, 8, tz, 5.6, 0.4, 5.6, 'concrete');
        b.box(tx, 8.4, tz, 5.6, 1.1, 0.3, 'concrete'); b.box(tx, 8.4, tz + 2.6, 5.6, 1.1, 0.3, 'concrete');
      }
      b.house(0, -6, 14, 10, 4.2, 0, 'concrete', { noRoof: false, rnd, roof: 'metal' });
      b.crate(-3, -8, 'military'); b.crate(3, -8, 'military'); b.crate(0, -10, 'military');
      b.crate(8, 8, 'crate'); b.crate(-9, 10, 'crate'); b.crate(12, -14, 'barrel', 0); b.crate(-13, -15, 'barrel', 0);
      for (const [x, z] of [[0, 12], [-8, 4], [9, 3], [-10, -18], [11, -18], [0, -16]]) b.raider(x, z);
      // parked scrap trucks
      b.box(-12, 0.4, 16, 5.5, 2.2, 2.4, 'rust'); b.box(14, 0.4, 14, 2.4, 2.2, 5.5, 'rust');
      break;
    }
    case 'lighthouse': {
      b.house(0, 6, 8, 7, 3.4, 1, 'plank', { rnd, noRoof: false });
      b.crate(1, 6, 'crate'); b.crate(-2, 7, 'barrel');
      const mats = ['white', 'red', 'white', 'red', 'white', 'red'];
      for (let i = 0; i < 6; i++) b.box(0, i * 4, 0, 6.2 - i * 0.5, 4, 6.2 - i * 0.5, mats[i]);
      b.box(0, 24, 0, 4.8, 1.2, 4.8, 'glow', false);
      b.box(0, 25.2, 0, 6.6, 0.5, 6.6, 'roof');
      break;
    }
    case 'mine': {
      b.house(0, 0, 11, 8, 4, 0, 'plank', { rnd, ruin: 0.2 });
      b.crate(-2, -1, 'crate'); b.crate(3, 1, 'barrel', 0);
      // mine-cart & timber frame
      b.box(11, 0.4, 6, 2.6, 1.2, 1.4, 'rust');
      b.box(9, 0, 10, 0.5, 3.6, 0.5, 'wood'); b.box(13, 0, 10, 0.5, 3.6, 0.5, 'wood'); b.box(11, 3.4, 10, 5, 0.5, 0.5, 'wood');
      b.crate(11, 8, 'crate');
      for (let i = 0; i < 8; i++) { const a = rnd() * 6.28, rr = R(13, 22); b.node('rock', Math.cos(a) * rr, Math.sin(a) * rr); }
      for (let i = 0; i < 6; i++) { const a = rnd() * 6.28, rr = R(11, 22); b.node('ore_iron', Math.cos(a) * rr, Math.sin(a) * rr); }
      for (let i = 0; i < 3; i++) { const a = rnd() * 6.28, rr = R(13, 22); b.node('ore_sulfur', Math.cos(a) * rr, Math.sin(a) * rr); }
      break;
    }
    case 'radio': {
      const H = 32;
      for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) b.box(x, 0, z, 0.6, H, 0.6, 'metal');
      for (let y = 6; y < H; y += 6) { b.box(0, y, -2, 4.6, 0.3, 0.3, 'metal', false); b.box(0, y, 2, 4.6, 0.3, 0.3, 'metal', false); b.box(-2, y, 0, 0.3, 0.3, 4.6, 'metal', false); b.box(2, y, 0, 0.3, 0.3, 4.6, 'metal', false); }
      b.box(0, H, 0, 6, 0.5, 6, 'concrete');
      b.box(0, H + 0.5, 0, 0.5, 8, 0.5, 'red', false);
      b.house(10, 4, 7, 6, 3.4, 1, 'concrete', { rnd, roof: 'metal' });
      b.crate(10, 4, 'military'); b.crate(6, 10, 'crate'); b.crate(13, 9, 'barrel', 0);
      break;
    }
    case 'farmstead': {
      b.house(0, 0, 15, 11, 6, 0, 'wood', { rnd, roof: 'red', ruin: 0.1 });
      b.crate(-4, -2, 'farm'); b.crate(3, 2, 'farm');
      // silo
      for (let i = 0; i < 4; i++) b.box(-14, i * 3, 0, 5.2, 3, 5.2, i % 2 ? 'white' : 'metal');
      b.box(-14, 12, 0, 6, 0.5, 6, 'roof');
      b.crate(-14, 4.6, 'barrel', 0);
      // fields of wild crops
      for (let i = 0; i < 14; i++) b.node('bush_berry', R(8, 22) * (rnd() < 0.5 ? -1 : 1), R(-14, 14) + 6);
      for (let i = 0; i < 12; i++) b.node('fiber_plant', R(8, 22) * (rnd() < 0.5 ? -1 : 1), R(-14, 14) + 6);
      b.crate(13, 12, 'farm');
      break;
    }
    case 'camp': {
      for (const [x, z, ry] of [[-5, 0, 0], [5, 2, 1], [0, -6, 0]]) {
        const w = ry ? 3.2 : 4.4, d = ry ? 4.4 : 3.2;
        b.box(x, 0, z, w, 0.9, d, 'canvas'); b.box(x, 0.9, z, w * 0.66, 0.9, d * 0.66, 'canvas'); b.box(x, 1.8, z, w * 0.25, 0.6, d * 0.25, 'canvas');
      }
      b.crate(-4.5, 0.4, 'crate'); b.crate(4, 5, 'barrel', 0); b.crate(-1, -5, 'barrel', 0);
      b.raider(0, 3); b.raider(-3, -3); if (rnd() < 0.6) b.raider(4, -3);
      break;
    }
  }
  lm.parts = b.parts; lm.crates = b.crates; lm.raiders = b.raiders; lm.extraNodes = b.extraNodes;
}

// ---------------------------------------------------------------- Node density tables
// per biome: [type, chance per attempt]
const NODE_TABLE = {
  [BIOME.FOREST]: [['tree_pine', 0.32], ['tree_oak', 0.28], ['rock', 0.04], ['bush_berry', 0.05], ['fiber_plant', 0.04]],
  [BIOME.MEADOW]: [['tree_oak', 0.06], ['tree_pine', 0.02], ['rock', 0.06], ['bush_berry', 0.07], ['fiber_plant', 0.09]],
  [BIOME.BEACH]: [['tree_palm', 0.07], ['rock', 0.03], ['fiber_plant', 0.03]],
  [BIOME.DESERT]: [['cactus', 0.1], ['tree_dead', 0.03], ['rock', 0.07], ['ore_sulfur', 0.03]],
  [BIOME.TUNDRA]: [['tree_pine', 0.12], ['tree_dead', 0.05], ['rock', 0.08], ['ore_iron', 0.012]],
  [BIOME.HIGHLAND]: [['rock', 0.17], ['ore_iron', 0.06], ['ore_sulfur', 0.03], ['tree_pine', 0.03], ['tree_dead', 0.02]],
};

// ---------------------------------------------------------------- World generation
export class WorldData {
  constructor(seed) {
    this.seedRaw = String(seed);
    this.seed = seedToInt(seed);
    this.terrain = new Terrain(this.seed);
    this.landmarks = [];
    this.nodes = [];
    this.crates = [];
    this.spawns = [];
    this.mobSpawns = [];
    this.raiderSpawns = [];
    this.nodeGrid = new Map();
    this.staticGrid = new Map();
    this.generate();
  }

  height(x, z) { return this.terrain.height(x, z); }
  biome(x, z) { return this.terrain.biome(x, z); }

  generate() {
    const rnd = mulberry32(this.seed ^ 0xa5a5a5a5);
    const T = this.terrain;
    // --- landmarks
    for (const spec of LM_SPECS) {
      let placed = 0;
      for (let attempt = 0; attempt < 1500 && placed < spec.count; attempt++) {
        const x = Math.round((rnd() * 2 - 1) * WORLD_HALF * 0.82), z = Math.round((rnd() * 2 - 1) * WORLD_HALF * 0.82);
        const h = T.rawHeight(x, z);
        if (h < spec.hmin || h > spec.hmax) continue;
        if (Math.hypot(x, z) < 90) continue;
        if (this.landmarks.some((l) => Math.hypot(l.x - x, l.z - z) < 150)) continue;
        // flatness
        let lo = h, hi = h;
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4, hh = T.rawHeight(x + Math.cos(a) * spec.radius * 0.8, z + Math.sin(a) * spec.radius * 0.8);
          lo = Math.min(lo, hh); hi = Math.max(hi, hh);
        }
        const maxRel = spec.type === 'mine' || spec.type === 'radio' ? 22 : 7;
        if (hi - lo > maxRel) continue;
        if (spec.coast) {
          let sea = false;
          for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; if (T.rawHeight(x + Math.cos(a) * 45, z + Math.sin(a) * 45) < -0.5) sea = true; }
          if (!sea) continue;
        } else if (lo < 1.2) continue;
        const names = NAMES[spec.type];
        const lm = { id: this.landmarks.length, type: spec.type, name: names[Math.floor(rnd() * names.length)], x, z, y: Math.max(2.4, h), r: spec.radius, rot: Math.floor(rnd() * 4) };
        if (this.landmarks.some((l) => l.name === lm.name)) lm.name += ' ' + ['II', 'North', 'East', 'South', 'West'][this.landmarks.length % 5];
        this.landmarks.push(lm);
        T.flats.push({ x, z, r: spec.radius, h: lm.y });
        placed++;
      }
    }
    for (const lm of this.landmarks) buildLandmark(lm, rnd);

    // --- roads: MST connecting a central hub and all landmarks
    const hub = { x: 0, z: 0, hub: true };
    const pts = [hub, ...this.landmarks];
    const inTree = [0];
    const rest = pts.map((_, i) => i).slice(1);
    while (rest.length) {
      let best = null;
      for (const i of inTree) for (const j of rest) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
        if (!best || d < best.d) best = { i, j, d };
      }
      inTree.push(best.j); rest.splice(rest.indexOf(best.j), 1);
      const a = pts[best.i], c = pts[best.j];
      const steps = Math.max(2, Math.ceil(best.d / 32));
      const nx = -(c.z - a.z) / best.d, nz = (c.x - a.x) / best.d;
      const ph = rnd() * 6.28, amp = Math.min(30, best.d * 0.08);
      const line = [];
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, off = Math.sin(t * Math.PI) * Math.sin(ph + t * 5) * amp;
        line.push({ x: lerp(a.x, c.x, t) + nx * off, z: lerp(a.z, c.z, t) + nz * off });
      }
      T.addRoad(line);
    }

    // --- resource nodes
    const N = Math.floor((WORLD_HALF * 2) / CELL);
    const lmNear = (x, z, pad) => this.landmarks.some((l) => Math.hypot(l.x - x, l.z - z) < l.r + pad);
    for (let cx = 0; cx < N; cx++) {
      for (let cz = 0; cz < N; cz++) {
        const r2 = mulberry32((hash2(this.seed, cx, cz) * 4294967296) >>> 0);
        for (let k = 0; k < 7; k++) {
          const x = -WORLD_HALF + (cx + r2()) * CELL, z = -WORLD_HALF + (cz + r2()) * CELL;
          const roll = r2(), s = 0.8 + r2() * 0.55, ry = r2() * Math.PI * 2;
          const h = T.height(x, z);
          if (h < 0.5) continue;
          const bio = T.biome(x, z, h);
          const table = NODE_TABLE[bio];
          if (!table) continue;
          let acc = 0, type = null;
          for (const [t, p] of table) { acc += p; if (roll < acc) { type = t; break; } }
          if (!type) continue;
          if (lmNear(x, z, 4)) continue;
          if (T.roadDist(x, z) < 4) continue;
          this.nodes.push({ id: this.nodes.length, type, x: +x.toFixed(2), y: +h.toFixed(2), z: +z.toFixed(2), s: +s.toFixed(2), r: +ry.toFixed(2) });
        }
      }
    }
    for (const lm of this.landmarks) for (const e of lm.extraNodes) {
      const h = T.height(e.x, e.z);
      if (h < 0.5) continue;
      this.nodes.push({ id: this.nodes.length, type: e.type, x: +e.x.toFixed(2), y: +h.toFixed(2), z: +e.z.toFixed(2), s: 1 + (e.x * 7 % 3) / 10, r: (e.z * 3) % 6 });
    }
    for (const n of this.nodes) {
      const k = cellKey(Math.floor((n.x + WORLD_HALF) / CELL), Math.floor((n.z + WORLD_HALF) / CELL));
      let a = this.nodeGrid.get(k); if (!a) this.nodeGrid.set(k, (a = []));
      a.push(n);
    }

    // --- static colliders + crates
    for (const lm of this.landmarks) {
      for (const p of lm.parts) {
        if (!p.solid) continue;
        const box = { minx: p.x - p.w / 2, maxx: p.x + p.w / 2, minz: p.z - p.d / 2, maxz: p.z + p.d / 2, miny: p.y, maxy: p.y + p.h, floor: p.mat === 'floor' };
        p.box = undefined;
        this.addStatic(box);
      }
      for (const c of lm.crates) { c.id = this.crates.length; c.lm = lm.id; this.crates.push(c); }
      for (const r of lm.raiders) this.raiderSpawns.push({ x: r.x, z: r.z, lm: lm.id, y: lm.y });
    }

    // --- coastal player spawns
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.1;
      let rr = WORLD_HALF * 0.95;
      while (rr > 20 && T.height(Math.cos(a) * rr, Math.sin(a) * rr) < 1.2) rr -= 6;
      if (rr <= 20) continue;
      rr -= 8;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr, h = T.height(x, z);
      if (h > 1.0 && h < 6 && !lmNear(x, z, 10)) this.spawns.push({ x, y: h, z });
    }
    if (!this.spawns.length) this.spawns.push({ x: 0, y: Math.max(1, T.height(0, 0)), z: 0 });

    // --- animal spawns
    for (let i = 0; i < 360 && this.mobSpawns.length < 170; i++) {
      const x = (rnd() * 2 - 1) * WORLD_HALF * 0.85, z = (rnd() * 2 - 1) * WORLD_HALF * 0.85;
      const h = T.height(x, z);
      if (h < 1.5 || Math.hypot(x, z) < 130 || lmNear(x, z, 30)) continue;
      const bio = T.biome(x, z, h), r = rnd();
      let sp = null;
      if (bio === BIOME.MEADOW) sp = r < 0.55 ? 'deer' : r < 0.9 ? 'boar' : 'wolf';
      else if (bio === BIOME.FOREST) sp = r < 0.4 ? 'deer' : r < 0.65 ? 'boar' : r < 0.95 ? 'wolf' : 'bear';
      else if (bio === BIOME.TUNDRA) sp = r < 0.45 ? 'wolf' : r < 0.7 ? 'bear' : 'deer';
      else if (bio === BIOME.HIGHLAND) sp = r < 0.45 ? 'bear' : r < 0.85 ? 'wolf' : 'deer';
      else if (bio === BIOME.DESERT) sp = r < 0.7 ? 'boar' : 'wolf';
      else if (bio === BIOME.BEACH) sp = r < 0.6 ? 'boar' : null;
      if (!sp) continue;
      const pack = sp === 'wolf' ? 2 + Math.floor(rnd() * 2) : sp === 'deer' ? 1 + Math.floor(rnd() * 2) : 1;
      for (let k = 0; k < pack; k++) this.mobSpawns.push({ species: sp, x: x + (rnd() - 0.5) * 8, z: z + (rnd() - 0.5) * 8 });
    }
  }

  addStatic(box) {
    for (let cx = Math.floor((box.minx + WORLD_HALF) / CELL); cx <= Math.floor((box.maxx + WORLD_HALF) / CELL); cx++)
      for (let cz = Math.floor((box.minz + WORLD_HALF) / CELL); cz <= Math.floor((box.maxz + WORLD_HALF) / CELL); cz++) {
        const k = cellKey(cx, cz);
        let a = this.staticGrid.get(k); if (!a) this.staticGrid.set(k, (a = []));
        a.push(box);
      }
  }

  nodesAt(x, z) { return this.nodeGrid.get(cellKey(Math.floor((x + WORLD_HALF) / CELL), Math.floor((z + WORLD_HALF) / CELL))) || EMPTY; }
  staticAt(x, z) { return this.staticGrid.get(cellKey(Math.floor((x + WORLD_HALF) / CELL), Math.floor((z + WORLD_HALF) / CELL))) || EMPTY; }

  nodesNear(x, z, r) {
    const out = [];
    const c0x = Math.floor((x - r + WORLD_HALF) / CELL), c1x = Math.floor((x + r + WORLD_HALF) / CELL);
    const c0z = Math.floor((z - r + WORLD_HALF) / CELL), c1z = Math.floor((z + r + WORLD_HALF) / CELL);
    for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
      const a = this.nodeGrid.get(cellKey(cx, cz));
      if (a) for (const n of a) if ((n.x - x) ** 2 + (n.z - z) ** 2 <= r * r) out.push(n);
    }
    return out;
  }

  landmarkAt(x, z, pad = 0) {
    for (const l of this.landmarks) if (Math.hypot(l.x - x, l.z - z) < l.r + pad) return l;
    return null;
  }
}
const EMPTY = [];
