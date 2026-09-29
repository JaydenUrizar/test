// Grid-based building system shared by server (authoritative) and client (ghost preview / collision).
import { WORLD_HALF } from './worldgen.js';

export const GRID = 4;      // metres per cell
export const LEVEL_H = 3;   // metres per storey
export const TIERS = ['Wood', 'Stone', 'Metal'];
export const TIER_HP = [1, 2.5, 5];
export const TIER_COLORS = ['#b98a54', '#a3a8ad', '#7d8b99'];

export const PIECES = {
  foundation: { kind: 'cell', name: 'Foundation', cost: 60, hp: 400 },
  floor: { kind: 'cell', name: 'Floor', cost: 40, hp: 250 },
  stairs: { kind: 'stairs', name: 'Stairs', cost: 50, hp: 250 },
  wall: { kind: 'edge', name: 'Wall', cost: 50, hp: 300 },
  doorway: { kind: 'edge', name: 'Doorway', cost: 40, hp: 250 },
  window: { kind: 'edge', name: 'Window Wall', cost: 40, hp: 220 },
  door: { kind: 'door', name: 'Door', cost: 30, hp: 160 },
};
export const PIECE_ORDER = ['foundation', 'wall', 'doorway', 'window', 'door', 'floor', 'stairs'];

// Tier 0 always costs wood. Upgrades cost stone (tier 1) or iron ingots (tier 2).
export function placeCost(type) { return { wood: PIECES[type].cost }; }
export function upgradeCost(type, toTier) {
  const c = PIECES[type].cost;
  return toTier === 1 ? { stone: c * 2 } : { iron_ingot: Math.ceil(c * 0.4) };
}
export function pieceMaxHp(type, tier) { return Math.round(PIECES[type].hp * TIER_HP[tier]); }
export function repairCost(p) {
  const missing = 1 - p.hp / pieceMaxHp(p.type, p.tier);
  const full = p.tier === 0 ? placeCost(p.type) : upgradeCost(p.type, p.tier);
  const out = {};
  for (const [k, v] of Object.entries(full)) { const n = Math.ceil(v * missing * 0.5); if (n > 0) out[k] = n; }
  return out;
}

export const cellKey = (L, gx, gz) => `C|${L}|${gx}|${gz}`;
export const stairKey = (L, gx, gz) => `S|${L}|${gx}|${gz}`;
export const edgeKey = (L, gx, gz, dir) => `E|${L}|${gx}|${gz}|${dir}`;
export const doorKey = (L, gx, gz, dir) => `D|${L}|${gx}|${gz}|${dir}`;

export function pieceKey(p) {
  switch (PIECES[p.type].kind) {
    case 'cell': return cellKey(p.L, p.gx, p.gz);
    case 'stairs': return stairKey(p.L, p.gx, p.gz);
    case 'edge': return edgeKey(p.L, p.gx, p.gz, p.dir);
    case 'door': return doorKey(p.L, p.gx, p.gz, p.dir);
  }
}

// world-space centre of a piece footprint
export function pieceCenter(p) {
  const k = PIECES[p.type].kind;
  if (k === 'cell' || k === 'stairs') return { x: p.gx * GRID + GRID / 2, z: p.gz * GRID + GRID / 2 };
  return p.dir === 0 ? { x: p.gx * GRID + GRID / 2, z: p.gz * GRID } : { x: p.gx * GRID, z: p.gz * GRID + GRID / 2 };
}

const T = 0.3;
const DOORW = 1.7, DOORH = 2.5, WINW = 1.7;

function box(minx, maxx, miny, maxy, minz, maxz, extra) { return { minx, maxx, miny, maxy, minz, maxz, ...extra }; }

// collision boxes for a piece (absolute world coordinates)
export function pieceBoxes(p) {
  const k = PIECES[p.type].kind;
  const x0 = p.gx * GRID, z0 = p.gz * GRID, y = p.y;
  if (k === 'cell') return [box(x0, x0 + GRID, p.type === 'foundation' ? y - 4 : y - 0.3, y, z0, z0 + GRID, { floor: true })];
  if (k === 'stairs') {
    const [ax, az] = [[0, 1], [1, 0], [0, -1], [-1, 0]][p.rot];
    return [box(x0, x0 + GRID, y, y + LEVEL_H, z0, z0 + GRID, { ramp: { rot: p.rot, y0: y, y1: y + LEVEL_H, ax, az, x0, z0 } })];
  }
  const H = LEVEL_H;
  const along = (a0, a1, yy0, yy1, extra) => (p.dir === 0
    ? box(x0 + a0, x0 + a1, yy0, yy1, z0 - T / 2, z0 + T / 2, extra)
    : box(x0 - T / 2, x0 + T / 2, yy0, yy1, z0 + a0, z0 + a1, extra));
  if (p.type === 'wall') return [along(0, GRID, y, y + H)];
  if (p.type === 'doorway') {
    const s = (GRID - DOORW) / 2;
    return [along(0, s, y, y + H), along(GRID - s, GRID, y, y + H), along(s, GRID - s, y + DOORH, y + H)];
  }
  if (p.type === 'window') {
    const s = (GRID - WINW) / 2;
    return [along(0, s, y, y + H), along(GRID - s, GRID, y, y + H), along(s, GRID - s, y, y + 1.0), along(s, GRID - s, y + 2.0, y + H)];
  }
  if (p.type === 'door') {
    const s = (GRID - DOORW) / 2;
    return [along(s, GRID - s, y, y + DOORH, { door: true })];
  }
  return [];
}

// ------------------------------------------------------------------ index
export class PieceIndex {
  constructor() { this.byId = new Map(); this.byKey = new Map(); this.grid = new Map(); }
  static gk(cx, cz) { return cx * 8192 + cz; }
  add(p) {
    p.boxes = pieceBoxes(p);
    for (const b of p.boxes) b.piece = p;
    this.byId.set(p.id, p);
    this.byKey.set(pieceKey(p), p);
    for (const b of p.boxes) this._each(b, (arr) => arr.push(b));
  }
  remove(id) {
    const p = this.byId.get(id);
    if (!p) return null;
    this.byId.delete(id);
    this.byKey.delete(pieceKey(p));
    for (const b of p.boxes) this._each(b, (arr) => { const i = arr.indexOf(b); if (i >= 0) arr.splice(i, 1); }, true);
    return p;
  }
  _each(b, fn, noCreate) {
    const S = 8;
    for (let cx = Math.floor((b.minx - 1 + WORLD_HALF) / S); cx <= Math.floor((b.maxx + 1 + WORLD_HALF) / S); cx++)
      for (let cz = Math.floor((b.minz - 1 + WORLD_HALF) / S); cz <= Math.floor((b.maxz + 1 + WORLD_HALF) / S); cz++) {
        const k = PieceIndex.gk(cx, cz);
        let a = this.grid.get(k);
        if (!a) { if (noCreate) continue; this.grid.set(k, (a = [])); }
        fn(a);
      }
  }
  get(key) { return this.byKey.get(key); }
  boxesNear(x, z) { return this.grid.get(PieceIndex.gk(Math.floor((x + WORLD_HALF) / 8), Math.floor((z + WORLD_HALF) / 8))) || []; }
  near(x, z, r) {
    const out = [];
    for (const p of this.byId.values()) { const c = pieceCenter(p); if ((c.x - x) ** 2 + (c.z - z) ** 2 <= r * r) out.push(p); }
    return out;
  }
}

// ------------------------------------------------------------------ placement validation
const floorLike = (idx, L, gx, gz) => idx.get(cellKey(L, gx, gz));
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// edge -> two adjacent cells
export function edgeCells(dir, gx, gz) { return dir === 0 ? [[gx, gz], [gx, gz - 1]] : [[gx, gz], [gx - 1, gz]]; }
function cellEdges(gx, gz) { return [[0, gx, gz], [0, gx, gz + 1], [1, gx, gz], [1, gx + 1, gz]]; }

/**
 * Validate & complete a placement request. Returns { ok, error?, piece? } — piece has y filled in.
 * env: { pieces: PieceIndex, world: WorldData, isBlockedByNode(x0,z0,x1,z1) }
 */
export function validatePlacement(env, req) {
  const def = PIECES[req.type];
  if (!def) return { ok: false, error: 'Unknown piece' };
  const p = { type: req.type, L: req.L | 0, gx: req.gx | 0, gz: req.gz | 0, dir: req.dir | 0, rot: req.rot | 0, tier: 0 };
  if (p.dir !== 0 && p.dir !== 1) return { ok: false, error: 'Bad orientation' };
  if (p.rot < 0 || p.rot > 3) return { ok: false, error: 'Bad rotation' };
  if (p.L < 0 || p.L > 5) return { ok: false, error: 'Too high' };
  if (Math.abs(p.gx * GRID) > WORLD_HALF || Math.abs(p.gz * GRID) > WORLD_HALF) return { ok: false, error: 'Out of bounds' };
  const idx = env.pieces, W = env.world;
  const kind = def.kind;
  if (kind === 'cell') {
    if (idx.get(cellKey(p.L, p.gx, p.gz))) return { ok: false, error: 'Space occupied' };
    if (p.L === 0) {
      if (p.type !== 'foundation') return { ok: false, error: 'Build a foundation first' };
      const x0 = p.gx * GRID, z0 = p.gz * GRID;
      const hs = [W.height(x0, z0), W.height(x0 + GRID, z0), W.height(x0, z0 + GRID), W.height(x0 + GRID, z0 + GRID), W.height(x0 + 2, z0 + 2)];
      const hmax = Math.max(...hs), hmin = Math.min(...hs);
      let y = Math.round(hmax * 4) / 4;
      for (const [dx, dz] of N4) { const nb = floorLike(idx, 0, p.gx + dx, p.gz + dz); if (nb && nb.type === 'foundation') { y = nb.y; break; } }
      if (y < 0.4) return { ok: false, error: 'Too close to water' };
      if (hmax > y + 0.55) return { ok: false, error: 'Terrain in the way' };
      if (y - hmin > 1.2) return { ok: false, error: 'Ground too steep or uneven' };
      if (env.isBlockedByNode && env.isBlockedByNode(x0 - 0.3, z0 - 0.3, x0 + GRID + 0.3, z0 + GRID + 0.3)) return { ok: false, error: 'Something is in the way' };
      if (W.staticAt(x0 + 2, z0 + 2).some((b) => b.maxx > x0 - 0.5 && b.minx < x0 + GRID + 0.5 && b.maxz > z0 - 0.5 && b.minz < z0 + GRID + 0.5)) return { ok: false, error: 'Blocked by structure' };
      if (W.landmarkAt(x0 + 2, z0 + 2, 6)) return { ok: false, error: 'Too close to a landmark' };
      p.y = y;
    } else {
      if (p.type !== 'floor') return { ok: false, error: 'Bad piece' };
      if (idx.get(stairKey(p.L - 1, p.gx, p.gz))) return { ok: false, error: 'Stairs need headroom' };
      // supported by a wall/doorway/window below, or overhang next to a wall-supported floor
      const below = (gx, gz) => cellEdges(gx, gz).map(([d, ex, ez]) => idx.get(edgeKey(p.L - 1, ex, ez, d))).find(Boolean);
      let sup = below(p.gx, p.gz);
      if (!sup) {
        for (const [dx, dz] of N4) {
          const nb = floorLike(idx, p.L, p.gx + dx, p.gz + dz);
          if (nb && nb.type === 'floor' && below(p.gx + dx, p.gz + dz)) { sup = below(p.gx + dx, p.gz + dz); break; }
          if (nb && nb.type === 'foundation') { sup = nb; break; }
        }
      }
      if (!sup) return { ok: false, error: 'Needs a wall or floor to rest on' };
      p.y = sup.type === 'floor' || sup.type === 'foundation' ? sup.y : sup.y + LEVEL_H;
    }
  } else if (kind === 'stairs') {
    const fl = floorLike(idx, p.L, p.gx, p.gz);
    if (!fl) return { ok: false, error: 'Stairs need a floor' };
    if (idx.get(stairKey(p.L, p.gx, p.gz))) return { ok: false, error: 'Space occupied' };
    if (idx.get(cellKey(p.L + 1, p.gx, p.gz))) return { ok: false, error: 'Blocked above' };
    p.y = fl.y;
  } else if (kind === 'edge') {
    if (idx.get(edgeKey(p.L, p.gx, p.gz, p.dir))) return { ok: false, error: 'Edge occupied' };
    const cells = edgeCells(p.dir, p.gx, p.gz);
    const fl = cells.map(([cx, cz]) => floorLike(idx, p.L, cx, cz)).find(Boolean);
    if (!fl) return { ok: false, error: 'Walls need a floor edge' };
    p.y = fl.y;
  } else if (kind === 'door') {
    const dw = idx.get(edgeKey(p.L, p.gx, p.gz, p.dir));
    if (!dw || dw.type !== 'doorway') return { ok: false, error: 'Doors go in doorways' };
    if (idx.get(doorKey(p.L, p.gx, p.gz, p.dir))) return { ok: false, error: 'Already has a door' };
    p.y = dw.y;
  }
  return { ok: true, piece: p };
}

// world position -> cell coords
export const toCell = (v) => Math.floor(v / GRID);
