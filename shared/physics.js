// Shared player movement + collision. Client predicts with this; server validates with it.
import { WORLD_HALF, WATER_LEVEL } from './worldgen.js';
import { NODES } from './items.js';

export const PLAYER_R = 0.38;
export const PLAYER_H = 1.8;
export const EYE_H = 1.62;
export const STEP_UP = 0.62;
export const GRAVITY = 24;
export const JUMP_V = 7.6;
export const SPEED = { walk: 4.3, sprint: 6.9, crouch: 2.1, swim: 2.5, wade: 0.72 };

/**
 * env: {
 *   world: WorldData,
 *   pieces: PieceIndex,
 *   depleted: Set<number>            // depleted node ids
 *   solids(x,z): [{x,z,r,y0,y1}]     // dynamic solid circles (deployables)
 * }
 */

export function terrainH(env, x, z) { return env.world.height(x, z); }

export function nodeRadius(n) { const d = NODES[n.type]; return d && d.r > 0 ? d.r * Math.min(1.2, n.s) * 0.85 : 0; }

function rampY(b, x, z) {
  const r = b.ramp;
  // t along climbing direction 0..1
  let t;
  if (r.ax !== 0) t = r.ax > 0 ? (x - r.x0) / 4 : 1 - (x - r.x0) / 4;
  else t = r.az > 0 ? (z - r.z0) / 4 : 1 - (z - r.z0) / 4;
  t = Math.min(1, Math.max(0, t));
  return r.y0 + (r.y1 - r.y0) * t;
}

// highest standable surface for a point at feet height y
export function groundAt(env, x, z, y) {
  let g = terrainH(env, x, z);
  const w = env.world;
  const consider = (b) => {
    if (x < b.minx || x > b.maxx || z < b.minz || z > b.maxz) return;
    if (b.ramp) {
      const ry = rampY(b, x, z);
      if (ry <= y + STEP_UP + 0.05 && ry > g) g = ry;
    } else if (b.maxy <= y + STEP_UP && b.maxy > g && (b.floor !== undefined || b.top !== false)) {
      if (b.door && b.piece && b.piece.open) return;
      // only surfaces that are big enough to stand on (floors/foundations/static roofs), not thin walls
      if (b.maxx - b.minx > 0.9 && b.maxz - b.minz > 0.9) g = b.maxy;
    }
  };
  for (const b of w.staticAt(x, z)) consider(b);
  if (env.pieces) for (const b of env.pieces.boxesNear(x, z)) consider(b);
  return g;
}

function pushBox(b, s, y, r) {
  // vertical overlap test
  if (b.ramp) return;
  if (b.door && b.piece && b.piece.open) return;
  if (y + PLAYER_H <= b.miny + 0.02 || y + STEP_UP >= b.maxy) return; // above (steppable) or below
  const cx = Math.max(b.minx, Math.min(s.x, b.maxx));
  const cz = Math.max(b.minz, Math.min(s.z, b.maxz));
  let dx = s.x - cx, dz = s.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2), k = (r - d) / d;
    s.x += dx * k; s.z += dz * k;
  } else {
    // centre inside box: push along the shallowest axis
    const l = s.x - b.minx, rr = b.maxx - s.x, t = s.z - b.minz, bt = b.maxz - s.z;
    const m = Math.min(l, rr, t, bt);
    if (m === l) s.x = b.minx - r; else if (m === rr) s.x = b.maxx + r; else if (m === t) s.z = b.minz - r; else s.z = b.maxz + r;
  }
}

function pushCircle(cx, cz, cr, s, r) {
  const dx = s.x - cx, dz = s.z - cz, d2 = dx * dx + dz * dz, m = cr + r;
  if (d2 >= m * m) return;
  const d = Math.sqrt(d2) || 1e-4;
  s.x = cx + (dx / d) * m; s.z = cz + (dz / d) * m;
}

export function resolveHorizontal(env, s, r = PLAYER_R) {
  const w = env.world;
  for (let it = 0; it < 3; it++) {
    const ox = s.x, oz = s.z;
    for (const b of w.staticAt(s.x, s.z)) pushBox(b, s, s.y, r);
    if (env.pieces) for (const b of env.pieces.boxesNear(s.x, s.z)) pushBox(b, s, s.y, r);
    // resource node colliders (3x3 buckets)
    for (const dx of [-16, 0, 16]) for (const dz of [-16, 0, 16]) {
      const arr = w.nodesAt(s.x + dx, s.z + dz);
      for (let i = 0; i < arr.length; i++) {
        const n = arr[i];
        if (Math.abs(n.x - s.x) > 3 || Math.abs(n.z - s.z) > 3) continue;
        const nr = nodeRadius(n);
        if (nr > 0 && !(env.depleted && env.depleted.has(n.id))) pushCircle(n.x, n.z, nr, s, r);
      }
    }
    if (env.solids) for (const c of env.solids(s.x, s.z)) if (s.y < c.y1 - 0.3 && s.y + PLAYER_H > c.y0) pushCircle(c.x, c.z, c.r, s, r);
    if (Math.abs(s.x - ox) + Math.abs(s.z - oz) < 1e-6) break;
  }
  const lim = WORLD_HALF - 2;
  if (s.x > lim) s.x = lim; else if (s.x < -lim) s.x = -lim;
  if (s.z > lim) s.z = lim; else if (s.z < -lim) s.z = -lim;
}

export function isBlocked(env, x, y, z) {
  const s = { x, y, z };
  resolveHorizontal(env, s, PLAYER_R * 0.8);
  return Math.abs(s.x - x) > 0.05 || Math.abs(s.z - z) > 0.05;
}

/**
 * Advance one physics step.
 * s: { x,y,z,vy,onGround,swim }  cmd: { mx,mz (unit-ish world dir), sprint, crouch, jump }
 * returns nothing; mutates s. Also sets s.speed (horizontal m/s) and s.wet
 */
export function stepMove(env, s, cmd, dt) {
  const gh0 = groundAt(env, s.x, s.z, s.y);
  const depth = WATER_LEVEL - gh0;
  const swim = depth > 1.0;
  const wade = !swim && depth > 0.15;
  let speed = cmd.crouch ? SPEED.crouch : cmd.sprint ? SPEED.sprint : SPEED.walk;
  if (swim) speed = SPEED.swim; else if (wade) speed *= SPEED.wade;
  const len = Math.hypot(cmd.mx, cmd.mz);
  let vx = 0, vz = 0;
  if (len > 0.001) { const k = Math.min(1, len) / len; vx = cmd.mx * k * speed; vz = cmd.mz * k * speed; }
  s.speed = Math.hypot(vx, vz);
  s.swim = swim;

  // substep horizontal so we never tunnel through thin walls
  const dist = s.speed * dt;
  const n = Math.max(1, Math.ceil(dist / 0.2));
  for (let i = 0; i < n; i++) {
    s.x += (vx * dt) / n; s.z += (vz * dt) / n;
    resolveHorizontal(env, s);
  }

  // vertical
  const gh = groundAt(env, s.x, s.z, s.y);
  if (swim) {
    const target = WATER_LEVEL - 1.15;
    s.y += (target - s.y) * Math.min(1, dt * 6);
    s.vy = 0; s.onGround = false; s.wet = true;
    return;
  }
  s.wet = wade;
  if (s.onGround && s.vy <= 0 && s.y - gh <= STEP_UP + 0.1 && !cmd.jump) {
    s.y = gh; s.vy = 0;
  } else {
    if (s.onGround && cmd.jump) { s.vy = JUMP_V; s.onGround = false; s.jumped = true; }
    s.vy -= GRAVITY * dt;
    s.y += s.vy * dt;
    if (s.y <= gh && s.vy <= 0) { s.y = gh; s.landV = s.vy; s.vy = 0; s.onGround = true; }
    else s.onGround = false;
  }
}

// line-of-sight helper vs statics/pieces/terrain: returns hit distance along ray or null
export function rayWorld(env, ox, oy, oz, dx, dy, dz, maxD, opts = {}) {
  let best = null;
  const step = 0.5;
  const w = env.world;
  for (let t = 0.5; t <= maxD; t += step) {
    const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
    if (y < terrainH(env, x, z)) { best = { t: t - step * 0.5, kind: 'terrain' }; break; }
    let hit = null;
    const chk = (b) => {
      if (b.ramp) { return; }
      if (b.door && b.piece && b.piece.open) return;
      if (x >= b.minx && x <= b.maxx && z >= b.minz && z <= b.maxz && y >= b.miny && y <= b.maxy) hit = b;
    };
    for (const b of w.staticAt(x, z)) chk(b);
    if (!hit && env.pieces) for (const b of env.pieces.boxesNear(x, z)) chk(b);
    if (hit) { best = { t, kind: hit.piece ? 'piece' : 'static', piece: hit.piece || null }; break; }
    if (opts.nodes) {
      const arr = w.nodesAt(x, z);
      for (const nd of arr) {
        const nr = nodeRadius(nd);
        if (nr > 0 && !(env.depleted && env.depleted.has(nd.id)) && (nd.x - x) ** 2 + (nd.z - z) ** 2 < nr * nr && y < nd.y + 6) { best = { t, kind: 'node', node: nd }; break; }
      }
      if (best) break;
    }
  }
  return best;
}
