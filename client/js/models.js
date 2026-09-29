// Emberwild procedural low-poly models: characters, animals, held items, nodes, deployables, structures.
import * as THREE from 'three';
import { mergeGeometries } from 'three-addons/utils/BufferGeometryUtils.js';
import { pieceBoxes, TIER_COLORS, GRID, LEVEL_H } from '/shared/building.js';

// ------------------------------------------------------------------ palettes
export const SKIN = ['#ffdcb8', '#f5c49b', '#e0a77a', '#c98b5e', '#a26b45', '#7c4a2e', '#5a3320', '#f4d6e6'];
export const HAIR = ['#1b1512', '#3b2416', '#6a3f1e', '#a86a2c', '#d9b25a', '#e8e0c8', '#b3372c', '#2f6fb3', '#3ba36b', '#8a4fc7'];
export const CLOTH = ['#e2554b', '#e8862a', '#f2c94c', '#7fbf5a', '#3ba36b', '#3aa6b5', '#3f78c9', '#7a5bc7', '#c95ba0', '#f0eee6', '#6b7480', '#2a2f38'];
export const ACCENT = ['#d94b3a', '#f2c94c', '#3aa6b5', '#7fbf5a', '#c95ba0', '#f0eee6', '#e8862a', '#2a2f38'];
export const HAIR_STYLES = ['Bald', 'Short', 'Spiky', 'Long', 'Mohawk', 'Bun', 'Fluffy', 'Pigtails'];
export const EYE_STYLES = ['Bright', 'Sleepy', 'Fierce', 'Happy', 'Wide', 'Wink'];
export const HAT_STYLES = ['None', 'Cap', 'Beanie', 'Cowboy', 'Headband'];

const matCache = new Map();
export function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...opts });
    matCache.set(k, m);
  }
  return m;
}
const boxG = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const box = (w, h, d, color, x = 0, y = 0, z = 0, opts) => { const m = new THREE.Mesh(boxG(w, h, d), mat(color, opts)); m.position.set(x, y, z); m.castShadow = true; return m; };
const sph = (r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, detail = 1) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), mat(color)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; return m; };
const cyl = (rt, rb, h, color, seg = 6, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color)); m.position.set(x, y, z); m.castShadow = true; return m; };
const pivot = (x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); return g; };
const tint = (geo, hex) => {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
};
const jitter = (geo, amt, seed = 1) => {
  const p = geo.attributes.position;
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s / 2147483647) - 0.5; };
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let o = map.get(k);
    if (!o) map.set(k, (o = [rnd() * amt, rnd() * amt, rnd() * amt]));
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  geo.computeVertexNormals();
  return geo;
};

// ------------------------------------------------------------------ CHARACTER
export function buildCharacter(app = {}, opts = {}) {
  const a = { skin: 2, hair: 1, hairColor: 2, eyes: 0, shirt: 3, pants: 1, accent: 0, hat: 0, ...app };
  const root = new THREE.Group();
  const skin = SKIN[a.skin % SKIN.length], hairC = HAIR[a.hairColor % HAIR.length];
  const shirt = opts.shirt || CLOTH[a.shirt % CLOTH.length], pants = opts.pants || CLOTH[a.pants % CLOTH.length], accent = ACCENT[a.accent % ACCENT.length];
  const raider = !!opts.raider;
  const body = new THREE.Group(); root.add(body);
  const parts = { root, body };
  // torso
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.34, 3, 8), mat(shirt));
  torso.position.set(0, 1.12, 0); torso.scale.set(1.05, 1, 0.78); torso.castShadow = true; body.add(torso);
  parts.torso = torso;
  const belt = box(0.62, 0.08, 0.4, raider ? '#3a2f26' : accent, 0, 0.86, 0); body.add(belt);
  // scarf accent
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 10), mat(accent)); scarf.rotation.x = Math.PI / 2; scarf.position.set(0, 1.5, 0); scarf.scale.set(1, 1, 1.1); body.add(scarf);
  // head group
  const head = pivot(0, 1.62, 0); body.add(head); parts.head = head;
  const skull = sph(0.27, skin, 0, 0.14, 0, 1, 1.02, 0.96, 2); head.add(skull);
  const ear = (sx) => { const e = sph(0.06, skin, sx * 0.27, 0.12, 0, 0.6, 1, 1, 1); head.add(e); };
  ear(1); ear(-1);
  // eyes
  const eyes = new THREE.Group(); eyes.position.set(0, 0.16, -0.235); head.add(eyes); parts.eyes = eyes;
  buildEyes(eyes, a.eyes, raider);
  // nose & mouth
  head.add(sph(0.04, SKIN[a.skin % SKIN.length], 0, 0.08, -0.27, 1, 0.9, 1.2, 0));
  const mouth = box(0.11, 0.025, 0.02, '#7a2f2f', 0, -0.02, -0.255); head.add(mouth); parts.mouth = mouth;
  if (raider) { const mask = box(0.5, 0.2, 0.06, '#2b2b30', 0, 0.03, -0.24); head.add(mask); }
  // hair
  buildHair(head, a.hair, hairC);
  // hat
  buildHat(head, a.hat, accent);
  // arms & legs (pivot at joints)
  const armL = pivot(-0.36, 1.38, 0), armR = pivot(0.36, 1.38, 0);
  for (const [arm, sx] of [[armL, -1], [armR, 1]]) {
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.3, 3, 6), mat(shirt)); upper.position.set(0, -0.2, 0); upper.castShadow = true; arm.add(upper);
    const hand = sph(0.085, skin, 0, -0.45, 0, 1, 1, 1, 1); arm.add(hand);
    body.add(arm);
  }
  const legL = pivot(-0.14, 0.86, 0), legR = pivot(0.14, 0.86, 0);
  for (const leg of [legL, legR]) {
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.42, 3, 6), mat(pants)); l.position.set(0, -0.32, 0); l.castShadow = true; leg.add(l);
    const boot = box(0.2, 0.13, 0.3, raider ? '#2a2420' : '#4a3a2c', 0, -0.68, -0.04); leg.add(boot); leg.userData.boot = boot;
    body.add(leg);
  }
  Object.assign(parts, { armL, armR, legL, legR, shirt, pants, skinC: skin });
  // armour overlays
  const armor = new THREE.Group(); body.add(armor); parts.armor = armor;
  const hand = pivot(0, -0.45, 0); armR.add(hand); parts.hand = hand;   // held item mount
  root.userData.parts = parts;
  root.userData.appearance = a;
  return root;
}

function buildEyes(g, style, raider) {
  while (g.children.length) g.remove(g.children[0]);
  const white = '#ffffff', pupil = '#1b1b24';
  const eye = (sx, mode) => {
    const e = new THREE.Group(); e.position.x = sx * 0.1;
    if (mode === 'arc') { const a = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 4, 8, Math.PI), mat(pupil)); a.position.z = -0.005; a.rotation.z = 0; e.add(a); return e; }
    if (mode === 'line') { e.add(box(0.1, 0.016, 0.012, pupil, 0, 0, 0)); return e; }
    const s = mode === 'wide' ? 0.085 : mode === 'sleepy' ? 0.06 : 0.07;
    const w = sph(s, white, 0, 0, 0, 1, mode === 'sleepy' ? 0.55 : 1.05, 0.5, 1); e.add(w);
    const p = sph(s * 0.55, pupil, 0, 0, -0.02, 1, 1.1, 0.5, 1); e.add(p);
    const sh = sph(0.013, '#ffffff', -0.012, 0.014, -0.045, 1, 1, 1, 0); e.add(sh);
    return e;
  };
  const modes = [['n', 'n'], ['sleepy', 'sleepy'], ['n', 'n'], ['arc', 'arc'], ['wide', 'wide'], ['n', 'line']][style % 6];
  g.add(eye(-1, modes[0])); g.add(eye(1, modes[1]));
  // brows
  const brow = (sx, rot) => { const b = box(0.11, 0.024, 0.02, '#2a1b12', sx * 0.1, 0.1, -0.01); b.rotation.z = rot; g.add(b); };
  if (style === 2 || raider) { brow(-1, -0.4); brow(1, 0.4); }
  else if (style === 1) { brow(-1, 0.1); brow(1, -0.1); }
  else if (style === 4) { brow(-1, 0.15); brow(1, -0.15); }
  else brow(-1, 0), brow(1, 0);
}

function buildHair(head, style, color) {
  const h = new THREE.Group(); h.name = 'hair'; head.add(h);
  const add = (m) => { h.add(m); return m; };
  switch (style % 8) {
    case 1: add(sph(0.29, color, 0, 0.2, 0.02, 1, 0.62, 1.02, 1)); add(box(0.5, 0.1, 0.1, color, 0, 0.32, -0.19)); break;
    case 2: for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const c = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 5), mat(color)); c.position.set(Math.cos(a) * 0.15, 0.4, Math.sin(a) * 0.15 - 0.02); c.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); add(c); } add(sph(0.28, color, 0, 0.22, 0.02, 1, 0.55, 1, 1)); break;
    case 3: add(sph(0.3, color, 0, 0.2, 0.03, 1.05, 0.7, 1.05, 1)); add(box(0.56, 0.5, 0.16, color, 0, -0.08, 0.2)); add(box(0.08, 0.35, 0.16, color, -0.27, -0.05, 0)); add(box(0.08, 0.35, 0.16, color, 0.27, -0.05, 0)); break;
    case 4: add(box(0.1, 0.22, 0.42, color, 0, 0.42, 0.02)); add(sph(0.26, color, 0, 0.22, 0.02, 1, 0.4, 1, 1)); break;
    case 5: add(sph(0.28, color, 0, 0.2, 0.02, 1, 0.6, 1, 1)); add(sph(0.13, color, 0, 0.47, 0.06, 1, 1, 1, 1)); break;
    case 6: add(sph(0.36, color, 0, 0.26, 0.02, 1, 0.85, 1, 1)); break;
    case 7: add(sph(0.29, color, 0, 0.2, 0.02, 1, 0.62, 1.02, 1)); for (const sx of [-1, 1]) { add(sph(0.11, color, sx * 0.3, 0.02, 0.06, 1, 1.4, 1, 1)); add(sph(0.06, '#d94b3a', sx * 0.3, 0.2, 0.06, 1, 1, 1, 0)); } break;
    default: break;
  }
}

function buildHat(head, style, color) {
  const g = new THREE.Group(); g.name = 'hat'; head.add(g);
  if (style === 1) { g.add(sph(0.29, color, 0, 0.22, 0.01, 1, 0.7, 1.02, 1)); g.add(box(0.36, 0.04, 0.22, color, 0, 0.16, -0.32)); }
  else if (style === 2) { g.add(sph(0.3, color, 0, 0.24, 0.01, 1, 0.8, 1.02, 1)); g.add(sph(0.06, '#f0eee6', 0, 0.5, 0, 1, 1, 1, 1)); g.add(box(0.6, 0.08, 0.56, '#2a2f38', 0, 0.12, 0)); }
  else if (style === 3) { g.add(cyl(0.36, 0.36, 0.03, '#7a4b25', 10, 0, 0.26, 0)); g.add(cyl(0.2, 0.24, 0.2, '#8a5a2d', 8, 0, 0.36, 0)); g.add(cyl(0.24, 0.24, 0.05, color, 8, 0, 0.29, 0)); }
  else if (style === 4) { g.add(box(0.6, 0.07, 0.56, color, 0, 0.22, 0)); }
}

export function setEquipment(char, equip) {
  const P = char.userData.parts;
  const a = char.userData.appearance;
  while (P.armor.children.length) P.armor.remove(P.armor.children[0]);
  const hat = P.head.getObjectByName('hat'), hair = P.head.getObjectByName('hair');
  const [head, chest, legs, feet] = equip || [];
  const cl = (id) => id && id.startsWith('cloth');
  // shirt/pants recolour
  P.torso.material = mat(cl(chest) ? '#e6dcc0' : chest ? '#8f99a5' : CLOTH[a.shirt % CLOTH.length], chest && !cl(chest) ? { metalness: 0.5, roughness: 0.45 } : {});
  const legMat = mat(cl(legs) ? '#d8cfae' : legs ? '#8f99a5' : CLOTH[a.pants % CLOTH.length], legs && !cl(legs) ? { metalness: 0.5, roughness: 0.45 } : {});
  for (const l of [P.legL, P.legR]) { l.children[0].material = legMat; l.userData.boot.material = mat(feet ? (cl(feet) ? '#d8cfae' : '#8f99a5') : '#4a3a2c', feet && !cl(feet) ? { metalness: 0.5, roughness: 0.45 } : {}); }
  for (const arm of [P.armL, P.armR]) arm.children[0].material = mat(cl(chest) ? '#e6dcc0' : chest ? '#8f99a5' : CLOTH[a.shirt % CLOTH.length], chest && !cl(chest) ? { metalness: 0.5, roughness: 0.45 } : {});
  if (chest && !cl(chest)) {
    P.armor.add(box(0.66, 0.5, 0.44, '#aab3bd', 0, 1.17, 0, { metalness: 0.6, roughness: 0.4 }));
    for (const sx of [-1, 1]) P.armor.add(sph(0.14, '#aab3bd', sx * 0.36, 1.46, 0, 1, 0.7, 1, 1));
  }
  if (head) {
    if (hat) hat.visible = false;
    if (hair) hair.visible = !!cl(head);
    if (cl(head)) { const h = sph(0.31, '#e6dcc0', 0, 0.18, 0.02, 1, 0.95, 1.03, 1); P.head.add(h); P.armor.userData.hood = h; P.armor.add(new THREE.Group()); h.name = 'hoodmesh'; }
    else { const g = new THREE.Group(); g.add(sph(0.3, '#aab3bd', 0, 0.2, 0, 1, 0.82, 1.04, 1)); g.add(box(0.07, 0.36, 0.36, '#d94b3a', 0, 0.42, 0)); g.add(box(0.44, 0.06, 0.05, '#7d8791', 0, 0.12, -0.28)); g.name = 'helm'; P.head.add(g); }
  } else { if (hat) hat.visible = true; if (hair) hair.visible = true; }
  // remove stale head armour on re-equip
  for (const ch of [...P.head.children]) if ((ch.name === 'helm' && !(head && !cl(head))) || (ch.name === 'hoodmesh' && !(head && cl(head)))) P.head.remove(ch);
}

// ------------------------------------------------------------------ HELD ITEMS
const held = {};
export function buildHeld(id) {
  if (held[id]) return held[id].clone();
  const g = new THREE.Group();
  const wood = '#8a5a2d', steel = '#c9d1d9', dark = '#3b4048';
  switch (id) {
    case 'rock': g.add(jitter(new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), mat('#a0a4a8')).geometry, 0.04, 3) && sph(0.11, '#a0a4a8', 0, 0, 0, 1, 0.8, 1, 0)); break;
    case 'stone_hatchet': case 'iron_hatchet': g.add(box(0.05, 0.55, 0.05, wood, 0, 0.18, 0)); g.add(box(0.05, 0.16, 0.24, id === 'iron_hatchet' ? steel : '#9aa0a6', 0, 0.42, -0.1)); break;
    case 'stone_pickaxe': case 'iron_pickaxe': g.add(box(0.05, 0.6, 0.05, wood, 0, 0.2, 0)); g.add(box(0.05, 0.08, 0.5, id === 'iron_pickaxe' ? steel : '#9aa0a6', 0, 0.48, 0)); break;
    case 'hammer': g.add(box(0.05, 0.42, 0.05, wood, 0, 0.14, 0)); g.add(box(0.14, 0.12, 0.22, '#c99a5b', 0, 0.36, 0)); break;
    case 'torch': g.add(box(0.05, 0.4, 0.05, wood, 0, 0.12, 0)); g.add(sph(0.07, '#ff9a3c', 0, 0.36, 0, 1, 1.3, 1, 1)); { const f = sph(0.045, '#ffe08a', 0, 0.4, 0, 1, 1.3, 1, 0); f.userData.flame = true; g.add(f); } break;
    case 'stone_spear': g.add(box(0.035, 1.2, 0.035, wood, 0, 0.35, 0)); { const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), mat('#9aa0a6')); c.position.y = 1.05; g.add(c); } break;
    case 'machete': g.add(box(0.04, 0.16, 0.04, dark, 0, 0.02, 0)); g.add(box(0.03, 0.5, 0.09, steel, 0, 0.36, 0)); break;
    case 'bow': { const a = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.018, 4, 12, Math.PI), mat(wood)); a.rotation.z = -Math.PI / 2; a.rotation.y = Math.PI / 2; a.position.set(0, 0.2, 0); g.add(a); const s = box(0.006, 0.8, 0.006, '#e8e0c8', 0.0, 0.2, 0.0); g.add(s); g.userData.string = s; break; }
    case 'revolver': g.add(box(0.05, 0.1, 0.24, '#b8bcc4', 0, 0.06, -0.12, { metalness: 0.6 })); g.add(box(0.045, 0.16, 0.06, '#5a3a22', 0, -0.02, 0.02)); g.add(cyl(0.05, 0.05, 0.08, '#9aa0a6', 6, 0, 0.06, -0.1)); g.children[g.children.length - 1].rotation.x = Math.PI / 2; g.userData.muzzle = [0, 0.08, -0.27]; break;
    case 'smg': g.add(box(0.06, 0.13, 0.42, '#5c6470', 0, 0.06, -0.16, { metalness: 0.5 })); g.add(box(0.05, 0.22, 0.07, '#2a2f38', 0, -0.08, -0.12)); g.add(box(0.05, 0.14, 0.06, '#2a2f38', 0, -0.05, 0.05)); g.add(box(0.04, 0.05, 0.16, '#2a2f38', 0, 0.06, -0.44)); g.userData.muzzle = [0, 0.06, -0.54]; break;
    case 'shotgun': g.add(box(0.06, 0.09, 0.62, '#4a4f56', 0, 0.06, -0.28, { metalness: 0.5 })); g.add(box(0.07, 0.1, 0.24, '#8a5a3a', 0, 0.0, 0.06)); g.add(box(0.075, 0.07, 0.2, '#6a4429', 0, 0.0, -0.3)); g.userData.muzzle = [0, 0.06, -0.6]; break;
    case 'rifle': g.add(box(0.05, 0.08, 0.86, '#4a4f56', 0, 0.07, -0.34, { metalness: 0.5 })); g.add(box(0.07, 0.12, 0.34, '#6b5b45', 0, 0.0, 0.1)); g.add(cyl(0.028, 0.028, 0.22, '#2a2f38', 8, 0, 0.17, -0.2)); g.children[g.children.length - 1].rotation.x = Math.PI / 2; g.userData.muzzle = [0, 0.07, -0.78]; break;
    default: {
      g.add(box(0.14, 0.14, 0.14, '#c9a36b', 0, 0.05, 0));
    }
  }
  held[id] = g;
  return g.clone();
}

// ------------------------------------------------------------------ ANIMALS
export function buildAnimal(sp) {
  const g = new THREE.Group();
  const legs = [];
  const mk = (bodyC, cfg) => {
    const body = box(cfg.bw, cfg.bh, cfg.bl, bodyC, 0, cfg.legH + cfg.bh / 2, 0); g.add(body);
    const head = pivot(0, cfg.legH + cfg.bh * 0.8, -cfg.bl / 2); g.add(head);
    const skull = box(cfg.hw, cfg.hh, cfg.hl, cfg.headC || bodyC, 0, 0.05, -cfg.hl / 2 + 0.05); head.add(skull);
    const eye = (sx) => head.add(box(0.05, 0.05, 0.03, '#111', sx * cfg.hw * 0.35, 0.1, -cfg.hl + 0.06));
    eye(-1); eye(1);
    if (cfg.snout) head.add(box(cfg.hw * 0.6, cfg.hh * 0.5, 0.2, cfg.snout, 0, -0.03, -cfg.hl - 0.05));
    if (cfg.ears) for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 4), mat(bodyC)); e.position.set(sx * cfg.hw * 0.4, 0.2, -0.05); head.add(e); }
    if (cfg.antlers) for (const sx of [-1, 1]) { const a = box(0.03, 0.4, 0.03, '#d8c9a0', sx * 0.1, 0.32, -0.1); a.rotation.z = -sx * 0.4; head.add(a); const b = box(0.03, 0.2, 0.03, '#d8c9a0', sx * 0.2, 0.42, -0.1); b.rotation.z = sx * 0.5; head.add(b); }
    const tail = box(0.08, 0.08, cfg.tail || 0.2, cfg.tailC || bodyC, 0, cfg.legH + cfg.bh * 0.85, cfg.bl / 2 + 0.05); g.add(tail);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const l = pivot(x * cfg.bw * 0.36, cfg.legH, z * cfg.bl * 0.34);
      l.add(box(cfg.lw, cfg.legH, cfg.lw, cfg.legC || bodyC, 0, -cfg.legH / 2, 0));
      g.add(l); legs.push(l);
    }
    g.userData = { legs, head, scale: cfg.bl };
  };
  switch (sp) {
    case 'deer': mk('#b98a5e', { bw: 0.42, bh: 0.5, bl: 1.0, legH: 0.7, lw: 0.09, hw: 0.2, hh: 0.24, hl: 0.4, snout: '#3a2a20', ears: true, antlers: true, tailC: '#f0e6d2', tail: 0.12, legC: '#8a6444' }); break;
    case 'boar': mk('#6b4a36', { bw: 0.6, bh: 0.55, bl: 1.1, legH: 0.3, lw: 0.12, hw: 0.36, hh: 0.36, hl: 0.5, snout: '#c7907a', ears: true, tailC: '#4a3428', tail: 0.1 }); { const h = g.userData.head; for (const sx of [-1, 1]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4), mat('#f0eee6')); t.position.set(sx * 0.12, -0.08, -0.5); t.rotation.x = -0.5; h.add(t); } } break;
    case 'wolf': mk('#7c8590', { bw: 0.36, bh: 0.42, bl: 0.9, legH: 0.5, lw: 0.08, hw: 0.24, hh: 0.24, hl: 0.34, snout: '#4a525c', ears: true, tail: 0.5, tailC: '#5f6873', headC: '#8a939e', legC: '#5f6873' }); break;
    case 'bear': mk('#5a3d2b', { bw: 0.9, bh: 0.85, bl: 1.5, legH: 0.55, lw: 0.28, hw: 0.5, hh: 0.46, hl: 0.5, snout: '#c9a27a', ears: true, tail: 0.1, legC: '#472f21' }); break;
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ------------------------------------------------------------------ RESOURCE NODES (merged, vertex-coloured)
const NODE_GEOS = {};
function mergeColored(list) { return mergeGeometries(list, false); }
const T = (g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.scale(sx, sy, sz); g.translate(x, y, z); return g; };
const ni = (g) => (g.index ? g.toNonIndexed() : g);
const CylC = (rt, rb, h, seg, c) => tint(ni(new THREE.CylinderGeometry(rt, rb, h, seg)), c);
const ConeC = (r, h, seg, c) => tint(ni(new THREE.ConeGeometry(r, h, seg)), c);
const IcoC = (r, d, c) => tint(ni(new THREE.IcosahedronGeometry(r, d)), c);
const BoxC = (w, h, d, c) => tint(ni(new THREE.BoxGeometry(w, h, d)), c);

export function nodeGeometry(type) {
  if (NODE_GEOS[type]) return NODE_GEOS[type];
  let g;
  switch (type) {
    case 'tree_pine': g = mergeColored([T(CylC(0.22, 0.34, 3, 6, '#6b4a2b'), 0, 1.5, 0), T(ConeC(1.7, 2.6, 7, '#2f6b3b'), 0, 3.2, 0), T(ConeC(1.35, 2.3, 7, '#37793f'), 0, 4.6, 0), T(ConeC(0.95, 2.0, 7, '#3f8a47'), 0, 5.9, 0)]); break;
    case 'tree_oak': g = mergeColored([T(CylC(0.28, 0.45, 2.6, 6, '#6e4b2c'), 0, 1.3, 0), jitter(T(IcoC(1.9, 1, '#4c9a3f'), 0, 3.7, 0, 0, 0, 0, 1, 0.85, 1), 0.3, 5), jitter(T(IcoC(1.3, 1, '#5aa848'), 1.1, 3.0, 0.4), 0.25, 7), jitter(T(IcoC(1.2, 1, '#55a044'), -1.0, 3.2, -0.5), 0.25, 9)]); break;
    case 'tree_palm': { const parts = [T(CylC(0.16, 0.24, 4.6, 6, '#a6805a'), 0.35, 2.3, 0, 0, 0, -0.12)]; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; parts.push(T(BoxC(0.5, 0.05, 2.3, i % 2 ? '#3f9a49' : '#4aae54'), Math.cos(a) * 1.0 + 0.7, 4.55, Math.sin(a) * 1.0, Math.sin(a) * 0.35, -a + Math.PI / 2, -Math.cos(a) * 0.35)); } parts.push(T(IcoC(0.22, 0, '#7a5a2a'), 0.75, 4.35, 0)); g = mergeColored(parts); break; }
    case 'tree_dead': g = mergeColored([T(CylC(0.14, 0.32, 3.4, 5, '#6d6355'), 0, 1.7, 0), T(BoxC(0.1, 1.3, 0.1, '#6d6355'), 0.5, 2.6, 0, 0, 0, -0.9), T(BoxC(0.09, 1.0, 0.09, '#6d6355'), -0.4, 3.0, 0.1, 0, 0, 0.8), T(BoxC(0.08, 0.7, 0.08, '#6d6355'), 0.1, 3.4, -0.3, 0.7, 0, 0)]); break;
    case 'cactus': g = mergeColored([T(CylC(0.28, 0.3, 2.2, 7, '#4f9a55'), 0, 1.1, 0), T(CylC(0.15, 0.17, 0.9, 6, '#4f9a55'), 0.55, 1.5, 0), T(CylC(0.15, 0.15, 0.4, 6, '#4f9a55'), 0.32, 1.1, 0, 0, 0, Math.PI / 2), T(CylC(0.13, 0.15, 0.7, 6, '#4f9a55'), -0.5, 1.3, 0), T(CylC(0.13, 0.13, 0.35, 6, '#4f9a55'), -0.3, 1.0, 0, 0, 0, Math.PI / 2)]); break;
    case 'rock': g = mergeColored([jitter(T(IcoC(1.2, 1, '#8b9299'), 0, 0.7, 0, 0, 0, 0, 1.2, 0.85, 1), 0.35, 11), jitter(T(IcoC(0.6, 1, '#9aa1a8'), 1.0, 0.35, 0.5), 0.2, 13)]); break;
    case 'ore_iron': g = mergeColored([jitter(T(IcoC(1.1, 1, '#727a82'), 0, 0.65, 0, 0, 0, 0, 1.15, 0.85, 1), 0.3, 21), T(IcoC(0.25, 0, '#e08a4c'), 0.6, 1.1, 0.4), T(IcoC(0.2, 0, '#c7703a'), -0.4, 1.2, 0.5), T(IcoC(0.22, 0, '#e08a4c'), 0.1, 1.4, -0.3), T(IcoC(0.18, 0, '#d47a40'), -0.7, 0.7, -0.5)]); break;
    case 'ore_sulfur': g = mergeColored([jitter(T(IcoC(1.05, 1, '#8a8474'), 0, 0.6, 0, 0, 0, 0, 1.1, 0.8, 1), 0.3, 31), T(ConeC(0.2, 0.6, 4, '#f0e050'), 0.5, 1.2, 0.3), T(ConeC(0.16, 0.5, 4, '#e6d64a'), -0.4, 1.2, 0.4), T(ConeC(0.18, 0.55, 4, '#f5ea62'), 0.1, 1.3, -0.4)]); break;
    case 'bush_berry': g = mergeColored([jitter(T(IcoC(0.7, 1, '#3f8a3f'), 0, 0.5, 0, 0, 0, 0, 1.2, 0.8, 1.1), 0.15, 41), T(IcoC(0.09, 0, '#d0304e'), 0.5, 0.7, 0.3), T(IcoC(0.09, 0, '#d0304e'), -0.4, 0.8, 0.4), T(IcoC(0.09, 0, '#d0304e'), 0.1, 0.95, -0.4), T(IcoC(0.09, 0, '#e2455f'), -0.6, 0.55, -0.2), T(IcoC(0.09, 0, '#e2455f'), 0.7, 0.5, -0.3)]); break;
    case 'fiber_plant': { const parts = []; for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; parts.push(T(ConeC(0.07, 1.1, 4, i % 2 ? '#88c95f' : '#6db24a'), Math.cos(a) * 0.18, 0.5, Math.sin(a) * 0.18, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35)); } g = mergeColored(parts); break; }
    default: g = mergeColored([BoxC(0.5, 0.5, 0.5, '#f0f')]);
  }
  g.computeVertexNormals();
  NODE_GEOS[type] = g;
  return g;
}
let nodeMat;
export function nodeMaterial() { return nodeMat || (nodeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true })); }

// ------------------------------------------------------------------ STRUCTURES (from shared collision boxes)
const texCache = {};
function canvasTex(kind) {
  if (texCache[kind]) return texCache[kind];
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const R = (a, b) => a + Math.random() * (b - a);
  if (kind === 'wood') {
    x.fillStyle = '#b98a54'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 8; i++) { x.fillStyle = `hsl(30,${R(35, 45)}%,${R(38, 50)}%)`; x.fillRect(0, i * 16, 128, 15); x.fillStyle = 'rgba(60,35,15,.5)'; x.fillRect(0, i * 16 + 14, 128, 2); for (let k = 0; k < 6; k++) { x.fillStyle = 'rgba(70,40,20,.18)'; x.fillRect(R(0, 128), i * 16 + R(2, 12), R(10, 40), 1); } }
  } else if (kind === 'stone') {
    x.fillStyle = '#9ea4aa'; x.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) { x.fillStyle = `hsl(210,5%,${R(52, 68)}%)`; const o = r % 2 ? 21 : 0; x.fillRect(k * 43 - o + 1, r * 32 + 1, 41, 30); }
    x.strokeStyle = 'rgba(40,45,50,.6)'; x.lineWidth = 2; for (let r = 0; r <= 4; r++) { x.beginPath(); x.moveTo(0, r * 32); x.lineTo(128, r * 32); x.stroke(); }
  } else if (kind === 'metal') {
    x.fillStyle = '#7d8b99'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = 'rgba(255,255,255,.12)'; for (let i = 0; i < 4; i++) x.fillRect(i * 32, 0, 3, 128);
    x.fillStyle = '#5a6673'; for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(i * 32 + 16, k * 32 + 16, 3, 0, 7); x.fill(); }
    x.strokeStyle = '#4a5560'; x.lineWidth = 3; x.strokeRect(0, 0, 128, 128);
  } else if (kind === 'brick') {
    x.fillStyle = '#a4574a'; x.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 8; r++) for (let k = 0; k < 4; k++) { x.fillStyle = `hsl(10,${R(35, 45)}%,${R(36, 46)}%)`; const o = r % 2 ? 16 : 0; x.fillRect(k * 32 - o + 1, r * 16 + 1, 30, 14); }
  } else if (kind === 'concrete') {
    x.fillStyle = '#8e9296'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(${R(80, 130) | 0},${R(80, 130) | 0},${R(80, 130) | 0},.25)`; x.fillRect(R(0, 128), R(0, 128), 3, 3); }
    x.strokeStyle = 'rgba(40,40,45,.4)'; x.lineWidth = 2; x.strokeRect(0, 0, 128, 128);
  } else { x.fillStyle = '#888'; x.fillRect(0, 0, 128, 128); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache[kind] = t;
  return t;
}
const LM_MATS = {
  plank: () => new THREE.MeshStandardMaterial({ map: canvasTex('wood'), roughness: 0.9, flatShading: true, color: '#d8c3a0' }),
  wood: () => new THREE.MeshStandardMaterial({ map: canvasTex('wood'), roughness: 0.9, flatShading: true, color: '#b08a60' }),
  brick: () => new THREE.MeshStandardMaterial({ map: canvasTex('brick'), roughness: 0.95, flatShading: true }),
  concrete: () => new THREE.MeshStandardMaterial({ map: canvasTex('concrete'), roughness: 0.95, flatShading: true }),
  metal: () => new THREE.MeshStandardMaterial({ map: canvasTex('metal'), roughness: 0.55, metalness: 0.4, flatShading: true, color: '#b9c3cc' }),
  roof: () => new THREE.MeshStandardMaterial({ color: '#5b4a3c', roughness: 0.9, flatShading: true }),
  floor: () => new THREE.MeshStandardMaterial({ color: '#7a6a58', roughness: 1, flatShading: true }),
  white: () => new THREE.MeshStandardMaterial({ color: '#efece4', roughness: 0.8, flatShading: true }),
  red: () => new THREE.MeshStandardMaterial({ color: '#c94a3c', roughness: 0.8, flatShading: true }),
  rust: () => new THREE.MeshStandardMaterial({ color: '#8a4a30', roughness: 0.9, flatShading: true }),
  glow: () => new THREE.MeshStandardMaterial({ color: '#ffe9a8', emissive: '#ffcf66', emissiveIntensity: 1.2, flatShading: true }),
  canvas: () => new THREE.MeshStandardMaterial({ color: '#b8a878', roughness: 1, flatShading: true }),
};
const lmMatCache = {};
export const landmarkMat = (name) => lmMatCache[name] || (lmMatCache[name] = (LM_MATS[name] || LM_MATS.concrete)());

function uvBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / 2.2, uv.getY(k) * dims[f][1] / 2.2); }
  return g;
}

export function buildLandmarkMeshes(lm) {
  const byMat = {};
  for (const p of lm.parts) {
    const g = uvBox(p.w, p.h, p.d); g.translate(p.x, p.y + p.h / 2, p.z);
    (byMat[p.mat] ||= []).push(g);
  }
  const grp = new THREE.Group();
  for (const [m, list] of Object.entries(byMat)) {
    const merged = mergeGeometries(list, false);
    const mesh = new THREE.Mesh(merged, landmarkMat(m));
    mesh.castShadow = m !== 'glow'; mesh.receiveShadow = true;
    grp.add(mesh);
  }
  return grp;
}

const tierMats = [];
function tierMat(t) {
  return tierMats[t] || (tierMats[t] = new THREE.MeshStandardMaterial({ map: canvasTex(['wood', 'stone', 'metal'][t]), roughness: t === 2 ? 0.5 : 0.9, metalness: t === 2 ? 0.45 : 0, flatShading: true }));
}
export function tierMaterial(t) { return tierMat(t); }

export function buildPiece(p) {
  const g = new THREE.Group();
  g.userData.pieceId = p.id;
  const boxes = pieceBoxes(p);
  const m = tierMat(p.tier || 0);
  if (p.type === 'stairs') {
    const r = boxes[0].ramp; const n = 8;
    for (let i = 0; i < n; i++) {
      const step = new THREE.Mesh(uvBox(GRID, LEVEL_H / n, GRID / n), m);
      const t = (i + 0.5) / n;
      // local space: climb along -Z rotated by rot
      step.position.set(0, (LEVEL_H / n) * (i + 0.5) - 0, -GRID / 2 + GRID * t);
      step.position.y = (LEVEL_H / n) * (i + 0.5);
      step.castShadow = step.receiveShadow = true;
      g.add(step);
    }
    // climb direction: rot 0 -> +z
    g.position.set(p.gx * GRID + GRID / 2, p.y, p.gz * GRID + GRID / 2);
    g.rotation.y = [0, Math.PI / 2, Math.PI, -Math.PI / 2][p.rot];
    // steps built climbing toward +z (t increases with z)
    return g;
  }
  boxes.forEach((b) => {
    const w = b.maxx - b.minx, h = b.maxy - b.miny, d = b.maxz - b.minz;
    const mesh = new THREE.Mesh(uvBox(w, h, d), m);
    mesh.castShadow = mesh.receiveShadow = true;
    if (b.door) {
      // pivot at hinge
      const hinge = new THREE.Group();
      const alongX = w > d;
      const cx = (b.minx + b.maxx) / 2, cz = (b.minz + b.maxz) / 2;
      hinge.position.set(alongX ? b.minx : cx, b.miny, alongX ? cz : b.minz);
      mesh.position.set(alongX ? w / 2 : 0, h / 2, alongX ? 0 : d / 2);
      hinge.add(mesh);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.14), mat('#2a2f38')); handle.position.set(alongX ? w - 0.2 : 0, h / 2, alongX ? 0 : d - 0.2); hinge.add(handle);
      hinge.userData = { door: true, alongX, open: !!p.open, cur: p.open ? 1 : 0 };
      g.userData.hinge = hinge;
      g.add(hinge);
      g.userData.doorMesh = mesh;
    } else {
      mesh.position.set((b.minx + b.maxx) / 2, (b.miny + b.maxy) / 2, (b.minz + b.maxz) / 2);
      g.add(mesh);
    }
  });
  return g;
}

// animate door hinge (call per frame)
export function animateDoor(g, dt) {
  const h = g.userData.hinge; if (!h) return;
  const target = g.userData.open ? 1 : 0;
  h.userData.cur += (target - h.userData.cur) * Math.min(1, dt * 8);
  h.rotation.y = h.userData.cur * (h.userData.alongX ? -1.75 : 1.75);
}

// ------------------------------------------------------------------ DEPLOYABLES
export function buildDeployable(type) {
  const g = new THREE.Group();
  const wood = '#a8743f', dark = '#5a3f24', stone = '#8a8f96';
  switch (type) {
    case 'campfire': {
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.add(T3(box(0.08, 0.08, 0.5, i % 2 ? dark : wood), Math.cos(a) * 0.18, 0.1, Math.sin(a) * 0.18, 0.25, -a + 1.57)); }
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(sph(0.12, '#8b9299', Math.cos(a) * 0.5, 0.06, Math.sin(a) * 0.5, 1, 0.7, 1, 0)); }
      const f = new THREE.Group(); f.name = 'fire'; f.visible = false;
      f.add(sph(0.18, '#ff7a1c', 0, 0.3, 0, 1, 1.8, 1, 1)); f.add(sph(0.11, '#ffd25a', 0, 0.28, 0, 1, 1.9, 1, 1));
      g.add(f); break;
    }
    case 'furnace': {
      g.add(box(1.0, 1.1, 1.0, stone, 0, 0.55, 0)); g.add(box(0.5, 0.4, 0.06, '#2a2a30', 0, 0.45, -0.5)); g.add(cyl(0.16, 0.2, 0.5, '#6f747a', 6, 0, 1.3, 0.1));
      g.add(box(1.1, 0.1, 1.1, '#6f747a', 0, 1.1, 0));
      const f = new THREE.Group(); f.name = 'fire'; f.visible = false; f.add(sph(0.16, '#ff7a1c', 0, 0.45, -0.46, 1, 1.3, 0.5, 1)); g.add(f); break;
    }
    case 'workbench_1': g.add(box(1.7, 0.12, 0.85, wood, 0, 0.9, 0)); for (const [x, z] of [[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]]) g.add(box(0.12, 0.9, 0.12, dark, x, 0.45, z)); g.add(box(0.3, 0.08, 0.5, '#c9a36b', -0.4, 1.0, 0)); g.add(box(0.5, 0.12, 0.12, '#9aa0a6', 0.35, 1.0, 0.1)); break;
    case 'workbench_2': g.add(box(1.9, 0.14, 0.95, '#6f7a86', 0, 0.95, 0, { metalness: 0.5 })); for (const [x, z] of [[-0.85, -0.4], [0.85, -0.4], [-0.85, 0.4], [0.85, 0.4]]) g.add(box(0.14, 0.95, 0.14, '#3f4750', x, 0.47, z)); g.add(box(0.4, 0.1, 0.4, '#d9b84a', -0.5, 1.07, 0)); g.add(box(1.7, 0.6, 0.06, '#4a5560', 0, 1.4, -0.44)); g.add(box(0.5, 0.25, 0.04, '#7fd6ff', 0.4, 1.4, -0.4, { emissive: '#3aa6e0', emissiveIntensity: 0.8 })); break;
    case 'sleeping_bag': g.add(box(0.7, 0.14, 1.9, '#d6743a', 0, 0.09, 0)); g.add(box(0.5, 0.1, 0.4, '#f0e6d2', 0, 0.18, -0.65)); g.add(box(0.72, 0.16, 0.5, '#b95a28', 0, 0.1, 0.55)); break;
    case 'storage_box': g.add(box(0.95, 0.6, 0.65, wood, 0, 0.3, 0)); g.add(box(1.0, 0.1, 0.7, dark, 0, 0.62, 0)); g.add(box(0.15, 0.12, 0.05, '#d9b84a', 0, 0.5, -0.34)); { const lid = g.children[1]; lid.name = 'lid'; } break;
    case 'large_box': g.add(box(1.6, 0.85, 0.85, '#8a5a3a', 0, 0.42, 0)); g.add(box(1.66, 0.14, 0.9, '#4a3220', 0, 0.9, 0)); g.add(box(0.2, 0.16, 0.06, '#d9b84a', 0, 0.7, -0.45)); for (const x of [-0.7, 0.7]) g.add(box(0.1, 0.9, 0.9, '#3a2a1a', x, 0.45, 0)); break;
    case 'spike_barricade': for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.09, 1.2, 5), mat(wood)); s.position.set((i - 2) * 0.32, 0.6, ((i % 2) - 0.5) * 0.2); s.rotation.z = (i - 2) * 0.12; s.castShadow = true; g.add(s); } g.add(box(1.6, 0.1, 0.1, dark, 0, 0.25, 0)); break;
    case 'turret': g.add(cyl(0.3, 0.4, 0.5, '#4a525c', 8, 0, 0.25, 0)); { const head = new THREE.Group(); head.name = 'head'; head.position.y = 0.8; head.add(box(0.5, 0.36, 0.5, '#5c6470', 0, 0, 0, { metalness: 0.5 })); head.add(box(0.1, 0.1, 0.6, '#2a2f38', 0, 0.02, -0.5)); head.add(box(0.08, 0.08, 0.04, '#ff3030', 0, 0.16, -0.24, { emissive: '#ff2020', emissiveIntensity: 1 })); g.add(head); } break;
    case 'satchel': g.add(box(0.36, 0.28, 0.16, '#7a6a4a', 0, 0.16, 0)); g.add(box(0.1, 0.1, 0.05, '#d94b3a', 0, 0.2, -0.1, { emissive: '#ff2020', emissiveIntensity: 1 })); g.add(box(0.03, 0.2, 0.03, '#222', 0.1, 0.36, 0)); break;
    case 'loot_bag': g.add(sph(0.36, '#7a5a3a', 0, 0.28, 0, 1.1, 0.9, 1, 1)); g.add(box(0.3, 0.08, 0.3, '#4a3220', 0, 0.55, 0)); g.add(sph(0.08, '#f2c94c', 0, 0.62, 0, 1, 1, 1, 0)); break;
    default: g.add(box(0.5, 0.5, 0.5, '#f0f', 0, 0.25, 0));
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
const T3 = (m, x, y, z, rx, ry) => { m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ'); return m; };

export function buildCrate(kind, opened) {
  const g = new THREE.Group();
  if (kind === 'barrel') {
    g.add(cyl(0.38, 0.38, 0.95, '#8a4a30', 10, 0, 0.48, 0));
    g.add(cyl(0.4, 0.4, 0.06, '#3a3f46', 10, 0, 0.25, 0)); g.add(cyl(0.4, 0.4, 0.06, '#3a3f46', 10, 0, 0.72, 0));
    if (opened) g.add(cyl(0.3, 0.3, 0.02, '#2a1a10', 10, 0, 0.97, 0));
  } else {
    const C = { crate: ['#b98a54', '#7a5a34'], military: ['#5f6b4a', '#3f4a2f'], farm: ['#c9a36b', '#8a6a3a'] }[kind] || ['#b98a54', '#7a5a34'];
    g.add(box(1.1, 0.7, 0.75, C[0], 0, 0.35, 0));
    g.add(box(1.14, 0.08, 0.79, C[1], 0, 0.02, 0)); g.add(box(1.14, 0.08, 0.79, C[1], 0, 0.7, 0));
    for (const x of [-0.5, 0.5]) g.add(box(0.08, 0.72, 0.8, C[1], x, 0.36, 0));
    if (kind === 'military') { g.add(box(0.5, 0.18, 0.02, '#e6d64a', 0, 0.42, -0.385)); }
    if (opened) { g.children[2].position.y = 0.9; g.children[2].rotation.x = -0.9; }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.opened = !!opened;
  return g;
}

const PLANT_GEO = {};
export function buildPlant(crop, stage) {
  const g = new THREE.Group();
  const s = [0.25, 0.5, 0.8, 1][stage] || 1;
  if (crop === 'corn') {
    for (let i = 0; i < 3; i++) { const st = box(0.05, 1.6 * s, 0.05, '#7fbf5a', (i - 1) * 0.2, 0.8 * s, ((i % 2) - 0.5) * 0.2); g.add(st); if (stage >= 1) for (let k = 0; k < 3; k++) { const l = box(0.4 * s, 0.03, 0.08, '#5fa33f', (i - 1) * 0.2 + 0.15, (0.4 + k * 0.4) * s, ((i % 2) - 0.5) * 0.2); l.rotation.z = 0.4; g.add(l); } if (stage === 3) g.add(cyl(0.06, 0.05, 0.4, '#f2c94c', 6, (i - 1) * 0.2, 1.05, ((i % 2) - 0.5) * 0.2 - 0.06)); }
  } else {
    g.add(sph(0.35 * s, '#4f9a3f', 0, 0.2 * s, 0, 1.5, 0.5, 1.5, 1));
    if (stage === 3) { g.add(sph(0.3, '#e8862a', 0.1, 0.25, 0.1, 1.1, 0.9, 1.1, 1)); g.add(box(0.06, 0.1, 0.06, '#5a7a2a', 0.1, 0.52, 0.1)); }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function buildDrop(item) {
  const g = new THREE.Group();
  const cat = item.cat, col = item.color || '#c9a36b';
  const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshStandardMaterial({ color: col, flatShading: true, roughness: 0.6, emissive: col, emissiveIntensity: 0.25 }));
  b.scale.set(1, 0.8, 1); b.castShadow = true; g.add(b);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.28, 14), new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = -0.12; g.add(ring);
  return g;
}
