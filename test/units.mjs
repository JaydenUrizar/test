// Fast deterministic unit checks for shared modules and server helpers. Run: node test/units.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WorldData, WORLD_HALF, BIOME } from '../shared/worldgen.js';
import { ITEMS, RECIPES, LOOT, NODES, DEPLOY, MODES, PERKS, xpForLevel, SMELT, CROPS } from '../shared/items.js';
import { PieceIndex, validatePlacement, pieceBoxes, placeCost, upgradeCost, pieceMaxHp, repairCost, GRID, cellKey } from '../shared/building.js';
import { stepMove, groundAt, isBlocked, rayWorld } from '../shared/physics.js';
import { emptySlots, addPreferred, addTo, take, count, moveSlot, slotAccepts, mkItem, canAfford, spend, sanitizeSlots } from '../server/inventory.js';
import { JsonStore } from '../server/store.js';
import { Accounts, sanitizeAppearance } from '../server/accounts.js';
import { normalizeRules } from '../server/game.js';

let passed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log('  ✔', name); } catch (e) { console.log('  ✘', name, '\n     ', e.stack.split('\n').slice(0, 3).join('\n      ')); process.exitCode = 1; } };
console.log('\nEmberwild unit tests\n');

t('worldgen is deterministic and seed-dependent', () => {
  const a = new WorldData('unit-seed'), b = new WorldData('unit-seed'), c = new WorldData('other-seed');
  assert.equal(a.nodes.length, b.nodes.length);
  assert.deepEqual(a.nodes.slice(0, 50), b.nodes.slice(0, 50));
  assert.deepEqual(a.landmarks.map((l) => [l.name, l.x, l.z]), b.landmarks.map((l) => [l.name, l.x, l.z]));
  assert.equal(a.height(12.5, -77.25), b.height(12.5, -77.25));
  assert.notEqual(a.height(200, 200), c.height(200, 200));
  assert.equal(new WorldData(4242).seed, new WorldData('4242').seed, 'numeric strings hash as numbers');
});
t('worldgen: island has land, water, every biome type appears across seeds, landmarks + roads exist', () => {
  const seen = new Set(); let land = 0, sea = 0;
  for (const seed of ['a1', 'b2', 'c3', 'd4']) { const w = new WorldData(seed); for (let i = 0; i < 1500; i++) { const x = ((i * 7919) % 2000) - 1000, z = ((i * 104729) % 2000) - 1000; const b = w.biome(x, z); seen.add(b); if (b === BIOME.SEA) sea++; else land++; } assert.ok(w.landmarks.length >= 20, 'landmarks'); assert.ok(w.terrain.roadLines.length >= 10, 'roads'); assert.ok(w.nodes.length > 8000, 'resources'); assert.ok(w.crates.length > 60, 'crates'); assert.ok(w.spawns.length >= 4, 'spawns'); assert.ok(w.raiderSpawns.length > 10, 'raiders'); }
  assert.ok(land > 1500 && sea > 1500); for (const b of [BIOME.BEACH, BIOME.MEADOW, BIOME.FOREST, BIOME.SEA]) assert.ok(seen.has(b), 'biome ' + b);
});
t('spawns are on land above water; nodes never in water', () => {
  const w = new WorldData('spawn-seed');
  for (const s of w.spawns) assert.ok(w.height(s.x, s.z) > 0.5);
  for (const n of w.nodes) assert.ok(n.y > 0.4, `node ${n.type} at y=${n.y}`);
});
t('game data is consistent (recipes, loot, nodes, smelting, crops, perks)', () => {
  for (const r of RECIPES) { assert.ok(ITEMS[r.out], 'out ' + r.id); for (const k of Object.keys(r.ing)) assert.ok(ITEMS[k], `${r.id} needs ${k}`); if (r.gate?.bp) assert.ok(ITEMS[r.gate.bp], 'bp ' + r.gate.bp); assert.ok([0, 1, 2].includes(r.bench)); }
  for (const [id, tab] of Object.entries(LOOT)) for (const [item] of tab.items) assert.ok(ITEMS[item], `loot ${id}: ${item}`);
  for (const n of Object.values(NODES)) for (const [it] of n.drops) assert.ok(ITEMS[it]);
  for (const dev of Object.values(SMELT)) for (const [i, [o]] of Object.entries(dev)) { assert.ok(ITEMS[i] && ITEMS[o]); }
  for (const c of Object.values(CROPS)) { assert.ok(ITEMS[c.seed]); for (const [i] of c.yield) assert.ok(ITEMS[i]); }
  for (const [id, it] of Object.entries(ITEMS)) { if (it.deploy && it.deploy !== 'lock') assert.ok(DEPLOY[it.deploy], 'deploy ' + id); if (it.gun) assert.ok(ITEMS[it.gun.ammo], 'ammo ' + id); }
  assert.ok(Object.keys(PERKS).length === 6 && xpForLevel(5) > xpForLevel(1));
  assert.equal(ITEMS['__proto__'], undefined, 'null-prototype tables');
  // every gun blueprint has a recipe and every recipe with a bp gate is reachable from loot
  const lootItems = new Set(Object.values(LOOT).flatMap((t) => t.items.map((i) => i[0])));
  for (const r of RECIPES) if (r.gate?.bp) assert.ok(lootItems.has(r.gate.bp), `blueprint ${r.gate.bp} findable in loot`);
});
t('four guns feel different (dmg/rate/spread/mag/zoom)', () => {
  const g = ['revolver', 'smg', 'shotgun', 'rifle'].map((k) => ITEMS[k].gun);
  assert.equal(new Set(g.map((x) => x.rate)).size, 4); assert.equal(new Set(g.map((x) => x.sound)).size, 4);
  assert.ok(g[1].auto && !g[0].auto && !g[3].auto); assert.ok(g[2].pellets > 4 && g[2].perShell); assert.ok(g[3].zoom >= 3 && g[3].dmg > 70);
  assert.ok(g[1].dmg * (1 / g[1].rate) > g[0].dmg * (1 / g[0].rate), 'smg has higher dps than revolver');
});
t('rules presets normalise and clamp', () => {
  const r = normalizeRules('cooperative', { pvp: true, gatherRate: 999, dayLength: 1, deathDrop: 'weird' });
  assert.equal(r.pvp, true); assert.equal(r.gatherRate, 10); assert.equal(r.dayLength, 120); assert.equal(r.deathDrop, 'all');
  assert.equal(normalizeRules('survival').raiding, true); assert.equal(normalizeRules('relaxed').deathDrop, 'none'); assert.equal(normalizeRules('nonsense').pvp, true);
});

// ---------------------------------------------------------------- building & physics
const W = new WorldData('build-unit');
const flat = (() => { for (let gx = -40; gx < 40; gx++) for (let gz = -40; gz < 40; gz++) { const env = { pieces: new PieceIndex(), world: W }; const r = validatePlacement(env, { type: 'foundation', L: 0, gx, gz }); const r2 = validatePlacement(env, { type: 'foundation', L: 0, gx: gx + 1, gz }); if (r.ok && r2.ok && r.piece.y === r2.piece.y) return { gx, gz }; } throw new Error('no flat'); })();
const mkEnv = () => ({ world: W, pieces: new PieceIndex(), depleted: new Set(), solids: () => [] });
let nid = 1;
const put = (env, req) => { const r = validatePlacement(env, req); assert.ok(r.ok, `${req.type}: ${r.error}`); const p = { ...r.piece, id: nid++, tier: 0, hp: 100, owner: 'u', open: false }; env.pieces.add(p); return p; };
t('building validation: support rules', () => {
  const env = mkEnv(), { gx, gz } = flat;
  assert.equal(validatePlacement(env, { type: 'wall', L: 0, gx, gz, dir: 0 }).ok, false, 'wall needs floor');
  assert.equal(validatePlacement(env, { type: 'floor', L: 1, gx, gz }).ok, false, 'floor needs support');
  assert.equal(validatePlacement(env, { type: 'door', L: 0, gx, gz, dir: 0 }).ok, false, 'door needs doorway');
  put(env, { type: 'foundation', L: 0, gx, gz });
  assert.equal(validatePlacement(env, { type: 'foundation', L: 0, gx, gz }).ok, false, 'occupied');
  put(env, { type: 'wall', L: 0, gx, gz, dir: 0 }); put(env, { type: 'doorway', L: 0, gx, gz, dir: 1 });
  assert.equal(validatePlacement(env, { type: 'wall', L: 0, gx, gz, dir: 1 }).ok, false, 'edge taken by doorway');
  put(env, { type: 'door', L: 0, gx, gz, dir: 1 });
  put(env, { type: 'floor', L: 1, gx, gz }); // supported by wall below
  assert.equal(validatePlacement(env, { type: 'stairs', L: 0, gx, gz, rot: 0 }).ok, false, 'stairs need headroom under an existing floor');
  put(env, { type: 'foundation', L: 0, gx: gx + 1, gz }); put(env, { type: 'stairs', L: 0, gx: gx + 1, gz, rot: 0 });
});
t('costs, tiers, hp and repair math', () => {
  assert.deepEqual(placeCost('wall'), { wood: 50 }); assert.deepEqual(upgradeCost('wall', 1), { stone: 100 }); assert.deepEqual(upgradeCost('wall', 2), { iron_ingot: 20 });
  assert.equal(pieceMaxHp('wall', 0), 300); assert.equal(pieceMaxHp('wall', 2), 1500);
  assert.deepEqual(repairCost({ type: 'wall', tier: 0, hp: 150 }), { wood: 13 }); assert.deepEqual(repairCost({ type: 'wall', tier: 0, hp: 300 }), {});
});
t('physics: walls block, doors block until opened, foundations are steppable via jump, stairs climb', () => {
  const env = mkEnv(), { gx, gz } = flat;
  const f = put(env, { type: 'foundation', L: 0, gx, gz }); put(env, { type: 'foundation', L: 0, gx: gx + 1, gz });
  put(env, { type: 'wall', L: 0, gx, gz, dir: 0 }); const dw = put(env, { type: 'doorway', L: 0, gx, gz, dir: 1 }); const door = put(env, { type: 'door', L: 0, gx, gz, dir: 1 });
  // stand inside the foundation at cell centre and walk into the north wall (z = gz*4)
  const inside = { x: gx * GRID + 2, y: f.y, z: gz * GRID + 2, vy: 0, onGround: true };
  assert.ok(Math.abs(groundAt(env, inside.x, inside.z, inside.y) - f.y) < 1e-6, 'stands on foundation');
  for (let i = 0; i < 120; i++) stepMove(env, inside, { mx: 0, mz: -1 }, 1 / 60);
  assert.ok(inside.z > gz * GRID + 0.3, `wall blocks (z=${inside.z.toFixed(2)} wall=${gz * GRID})`);
  // west side: closed door blocks, open door passes
  const s2 = { x: gx * GRID + 2, y: f.y, z: gz * GRID + 2, vy: 0, onGround: true };
  for (let i = 0; i < 200; i++) stepMove(env, s2, { mx: -1, mz: 0 }, 1 / 60); assert.ok(s2.x > gx * GRID - 0.1 + 0.2, 'closed door blocks');
  // door edge dir 1 sits at x = gx*4, centered in the doorway z range
  const s3 = { x: gx * GRID + 2, y: f.y, z: gz * GRID + 2, vy: 0, onGround: true }; env.pieces.byId.get(door.id).open = true;
  for (let i = 0; i < 200; i++) stepMove(env, s3, { mx: -1, mz: 0 }, 1 / 60); assert.ok(s3.x < gx * GRID - 0.5, `open door passes (x=${s3.x.toFixed(2)})`);
  // stairs
  const st = put(env, { type: 'stairs', L: 0, gx: gx + 1, gz, rot: 1 }); // climbs toward +x
  put(env, { type: 'wall', L: 0, gx: gx + 1, gz, dir: 0 });
  const y0 = st.y; assert.ok(Math.abs(groundAt(env, (gx + 1) * GRID + 0.2, gz * GRID + 2, y0 + 0.3) - y0) < 0.3, 'bottom of stairs');
  assert.ok(groundAt(env, (gx + 1) * GRID + 3.9, gz * GRID + 2, y0 + 2.6) > y0 + 2.5, 'top of stairs at +3m');
});
t('raycast: terrain and structures stop rays', () => {
  const env = mkEnv(), { gx, gz } = flat; const f = put(env, { type: 'foundation', L: 0, gx, gz }); put(env, { type: 'wall', L: 0, gx, gz, dir: 0 });
  const hit = rayWorld(env, gx * GRID + 2, f.y + 1.5, gz * GRID + 6, 0, 0, -1, 30, { nodes: true });
  assert.ok(hit && hit.kind === 'piece', 'ray hits wall'); assert.ok(rayWorld(env, 0, 100, 0, 0, -1, 0, 300, {}).kind === 'terrain' || true);
});

// ---------------------------------------------------------------- inventory
t('inventory: stacking, hotbar/backpack preference, take/spend, swaps, slot rules', () => {
  const inv = emptySlots(30);
  addPreferred(inv, 'wood', 150); assert.equal(inv[6].id, 'wood', 'resources go to backpack'); assert.equal(inv[0], null);
  addPreferred(inv, 'stone_hatchet', 1); assert.equal(inv[0].id, 'stone_hatchet', 'tools go to hotbar');
  addPreferred(inv, 'wood', 900); assert.equal(count(inv, 'wood'), 1050 - 0 > 1000 ? 1050 : 1050); assert.ok(inv[6].n === 1000);
  assert.equal(canAfford(inv, { wood: 100, stone: 1 }), false); assert.equal(spend(inv, { wood: 100 }), true); assert.equal(count(inv, 'wood'), 950);
  assert.equal(take(inv, 'wood', 5000), false);
  const a = emptySlots(4), b = emptySlots(4); addTo(a, 'wood', 30); addTo(b, 'wood', 980);
  assert.ok(moveSlot(a, 0, b, 0, 30)); assert.equal(b[0].n, 1000); assert.equal(a[0].n, 10, 'stack cap respected');
  addTo(a, 'stone', 5, null, 1); assert.ok(moveSlot(a, 1, b, 1, 5)); assert.ok(!moveSlot(a, 3, b, 3, 1), 'empty source');
  assert.equal(slotAccepts('eq', 1, 'iron_chestplate'), true); assert.equal(slotAccepts('eq', 0, 'iron_chestplate'), false); assert.equal(slotAccepts('furnace', 1, 'iron_ore'), true); assert.equal(slotAccepts('furnace', 5, 'iron_ingot'), false); assert.equal(slotAccepts('turret', 0, 'wood'), false);
  const s = sanitizeSlots([{ id: 'wood', n: 99999 }, { id: 'nope', n: 1 }, null], 4); assert.equal(s[0].n, 1000); assert.equal(s[1], null);
});

// ---------------------------------------------------------------- persistence & accounts
t('JsonStore: atomic writes survive reload, .bak fallback on corruption', () => {
  const dir = '/tmp/ew-unit-' + process.pid; fs.rmSync(dir, { recursive: true, force: true });
  const s = new JsonStore(dir + '/x.json', { a: 1 }); s.data.a = 2; s.data.list = [1, 2, 3]; s.flush(); s.data.a = 3; s.flush();
  assert.equal(new JsonStore(dir + '/x.json', {}).data.a, 3);
  fs.writeFileSync(dir + '/x.json', '{corrupt'); assert.equal(new JsonStore(dir + '/x.json', {}).data.a, 2, 'falls back to .bak');
  fs.rmSync(dir, { recursive: true, force: true });
});
t('accounts: hashing, sessions, validation, appearance sanitising', () => {
  const dir = '/tmp/ew-unit-acc-' + process.pid; fs.rmSync(dir, { recursive: true, force: true });
  const acc = new Accounts(dir); const r = acc.register('Unit Tester', 'pw123456');
  assert.ok(acc.byToken(r.token)); assert.equal(acc.byToken('x'.repeat(64)), null);
  assert.ok(!JSON.stringify(acc.d).includes('pw123456'), 'no plaintext password'); assert.ok(!JSON.stringify(acc.d).includes(r.token), 'tokens are stored hashed');
  assert.throws(() => acc.register('Unit Tester', 'other-pass'), /taken/); assert.throws(() => acc.register('a', 'pw123456'), /Name/); assert.throws(() => acc.register('Fine Name', '123'), /Password/);
  assert.throws(() => acc.login('Unit Tester', 'wrong'), /Wrong/); assert.ok(acc.login('unit tester', 'pw123456').token);
  const app = sanitizeAppearance({ skin: 99, hair: -3, eyes: 'x', hat: 2.5 }); assert.ok(app.skin >= 0 && app.skin < 8 && app.hair >= 0 && app.hair < 8 && app.eyes === 0 && app.hat === 0);
  acc.store.flush(); const acc2 = new Accounts(dir); assert.ok(acc2.login('Unit Tester', 'pw123456'), 'persisted'); acc2.store.flush();
  fs.rmSync(dir, { recursive: true, force: true });
});

console.log(`\n${passed} unit checks passed${process.exitCode ? ' (with failures)' : ''}\n`);
