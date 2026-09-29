// Renders and animates everything the server tells us about: players, mobs, pieces, deployables, drops, plants, crates.
import * as THREE from 'three';
import { ITEMS, DEPLOY, CROPS } from '/shared/items.js';
import { PieceIndex, pieceCenter } from '/shared/building.js';
import { buildCharacter, setEquipment, buildHeld, buildAnimal, buildPiece, animateDoor, buildDeployable, buildCrate, buildPlant, buildDrop, tierMaterial } from './models.js';

const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export function makeNameplate(text, color = '#ffffff') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 48;
  const x = c.getContext('2d');
  x.font = 'bold 26px "Trebuchet MS", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.75)'; x.strokeText(text, 128, 26); x.fillStyle = color; x.fillText(text, 128, 26);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  s.scale.set(1.9, 0.36, 1); s.renderOrder = 20;
  return s;
}

// -------- shared character animation (used for remote players, the local third-person model, raiders)
export function animateCharacter(m, st, dt) {
  const P = m.userData.parts;
  st.phase = (st.phase || 0) + st.speed * dt * 1.55;
  const walkAmp = Math.min(1, st.speed / 4.2) * (st.sprint ? 1.25 : 1);
  const gun = st.holdKind === 'gun' || st.holdKind === 'bow';
  const swing = Math.sin(st.phase) * 0.85 * walkAmp;
  let bodyY = 0;
  P.legL.rotation.x = swing; P.legR.rotation.x = -swing;
  P.legL.rotation.z = P.legR.rotation.z = 0;
  P.body.rotation.set(0, 0, 0); P.body.position.set(0, 0, 0);
  if (st.crouch) { bodyY = -0.32; P.legL.rotation.x = swing * 0.5 - 0.7; P.legR.rotation.x = -swing * 0.5 - 0.7; P.body.rotation.x = 0.18; }
  P.body.position.y = bodyY + Math.abs(Math.cos(st.phase)) * 0.03 * walkAmp;
  const idle = Math.sin(st.time * 1.7) * 0.015;
  P.torso.scale.y = 1 + idle;
  // arms
  let aL = -swing * 0.9, aR = swing * 0.9, aRz = 0, aLz = 0;
  let atk = st.atkT > 0 ? 1 - st.atkT / st.atkDur : -1;
  if (gun) {
    const kick = atk >= 0 ? Math.sin(atk * Math.PI) * 0.25 : 0;
    aR = -1.45 + st.pitch * 0.9 + kick; aL = -1.3 + st.pitch * 0.9 + kick; aLz = 0.35; aRz = -0.05;
    if (st.holdKind === 'bow') { aL = -1.5 + st.pitch * 0.9; aR = -1.3 + st.pitch * 0.9 + (st.drawing ? 0.35 : 0); aLz = 0; }
    if (st.reloading) { aL = -0.9; aLz = 0.9; }
    P.body.rotation.y = 0;
  } else if (st.holdKind === 'melee') {
    aR = -0.55; if (atk >= 0) { const e = Math.sin(atk * Math.PI); aR = -2.7 + atk * 3.1 + 0.0; if (atk < 0.35) aR = -2.7 + (atk / 0.35) * 0.3 - 0.0; aL = e * -0.5; P.body.rotation.y = -0.35 * e; }
  } else if (st.holdKind === 'item') { aR = -0.9; aRz = 0; if (atk >= 0) aR = -0.9 - Math.sin(atk * Math.PI) * 0.6; }
  if (st.swim) { P.body.rotation.x = 1.2; P.body.position.y = -0.35; const sw = Math.sin(st.time * 5) * 0.8; aL = -2.4 + sw; aR = -2.4 - sw; P.legL.rotation.x = Math.sin(st.time * 6) * 0.5; P.legR.rotation.x = -Math.sin(st.time * 6) * 0.5; }
  // emotes
  if (st.emote && !st.dead) {
    const t = st.time;
    switch (st.emote) {
      case 'wave': aR = -2.7 + Math.sin(t * 9) * 0.35; aRz = -0.5; break;
      case 'cheer': aR = -2.9 + Math.sin(t * 10) * 0.2; aL = -2.9 - Math.sin(t * 10) * 0.2; P.body.position.y += Math.abs(Math.sin(t * 5)) * 0.15; break;
      case 'dance': aR = -2.3 + Math.sin(t * 7) * 0.7; aL = -2.3 - Math.sin(t * 7) * 0.7; P.body.rotation.y = Math.sin(t * 3.5) * 0.5; P.body.position.y += Math.abs(Math.sin(t * 7)) * 0.1; P.legL.rotation.x = Math.sin(t * 7) * 0.5; P.legR.rotation.x = -Math.sin(t * 7) * 0.5; break;
      case 'sit': P.body.position.y = -0.42; P.legL.rotation.x = P.legR.rotation.x = -1.45; aR = aL = -0.5; break;
      case 'point': aR = -1.57; break;
    }
  }
  P.armL.rotation.set(aL, 0, aLz); P.armR.rotation.set(aR, 0, aRz);
  P.head.rotation.x = st.dead ? 0 : Math.max(-0.7, Math.min(0.7, -st.pitch * 0.6));
  P.head.rotation.y = 0;
  // held item orientation
  if (P.hand.children.length) {
    const it = P.hand.children[0];
    if (gun) { P.hand.rotation.set(Math.PI / 2 - 0.04, 0, 0); it.position.set(0, 0.03, 0); }
    else { P.hand.rotation.set(0, 0, 0); it.position.set(0, 0.02, 0); it.rotation.set(0, 0, 0); }
    if (st.holdKind === 'bow') { P.hand.rotation.set(Math.PI / 2, 0, 0); }
  }
  // dead pose
  if (st.dead) { m.rotation.x = lerp(m.rotation.x, -Math.PI / 2, Math.min(1, dt * 6)); m.position.y = st.baseY + 0.18; }
  else m.rotation.x = lerp(m.rotation.x, 0, Math.min(1, dt * 10));
}

export function holdKindOf(id) {
  const d = ITEMS[id];
  if (!d) return 'none';
  if (d.gun) return d.gun.type === 'bow' ? 'bow' : 'gun';
  if (d.melee || d.cat === 'tool' || d.cat === 'build' || d.cat === 'melee') return 'melee';
  return d.cat === 'deploy' || d.cat === 'food' || d.cat === 'med' || d.cat === 'seed' || d.cat === 'bp' ? 'item' : 'melee';
}

const heldForItem = (id) => {
  const d = ITEMS[id]; if (!d) return null;
  if (d.hold) return d.hold === 'raider' ? null : buildHeld(d.hold);
  if (d.cat === 'deploy' || d.cat === 'res' || d.cat === 'food' || d.cat === 'med' || d.cat === 'seed' || d.cat === 'bp' || d.cat === 'ammo') { const g = buildHeld('_generic'); g.children[0].material = new THREE.MeshStandardMaterial({ color: d.color, flatShading: true }); return g; }
  return buildHeld(id);
};

export class Entities {
  constructor(game) {
    this.g = game; this.scene = game.scene;
    this.players = new Map(); this.info = new Map(); this.mobs = new Map(); this.deps = new Map(); this.pieces = new Map(); this.plants = new Map(); this.drops = new Map(); this.crates = new Map(); this.proj = new Map();
    this.corpses = []; this.depGrid = new Map(); this.fireLights = []; this.torchLights = [];
    for (let i = 0; i < 6; i++) { const l = new THREE.PointLight('#ff9a4a', 0, 16, 1.6); l.userData.free = true; this.scene.add(l); this.fireLights.push(l); }
    for (let i = 0; i < 3; i++) { const l = new THREE.PointLight('#ffb060', 0, 12, 1.8); this.scene.add(l); this.torchLights.push(l); }
    this.time = 0;
    this.pieceIdx = game.pieces;
  }
  clear() {
    for (const map of [this.players, this.mobs, this.deps, this.pieces, this.plants, this.drops, this.crates, this.proj]) { for (const e of map.values()) { const o = e.mesh || e.model || e.group || e.m; if (o) this.scene.remove(o); } map.clear(); }
    for (const c of this.corpses) this.scene.remove(c.m); this.corpses = []; this.depGrid.clear();
  }

  // ---------------------------------------------------------------- players
  setInfo(eid, info) { this.info.set(eid, { ...(this.info.get(eid) || {}), ...info }); const e = this.players.get(eid); if (e) { if (info.eq) setEquipment(e.model, info.eq); if (info.team !== undefined) this.refreshPlate(e); } }
  refreshPlate(e) {
    const inf = this.info.get(e.eid) || {};
    if (e.plate) e.model.remove(e.plate);
    const mine = this.g.state.team && inf.team && inf.team === this.g.state.team.id;
    e.plate = makeNameplate(inf.name || '…', mine ? '#9dff8a' : '#ffffff'); e.plate.position.y = 2.25; e.model.add(e.plate);
  }
  ensurePlayer(eid) {
    let e = this.players.get(eid);
    if (e) return e;
    const inf = this.info.get(eid) || { name: '…', app: {} };
    const model = buildCharacter(inf.app || {});
    if (inf.eq) setEquipment(model, inf.eq);
    model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(model);
    e = { eid, model, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, tx: 0, ty: 0, tz: 0, tyaw: 0, tpitch: 0, flags: 0, held: '', atkSeq: 0, st: { speed: 0, time: Math.random() * 10, atkT: 0, atkDur: 0.35, pitch: 0, holdKind: 'none' }, first: true, lastHeld: null, emote: '' };
    this.refreshPlate(e);
    this.players.set(eid, e);
    return e;
  }
  onSnapshotPlayers(list) {
    const seen = new Set();
    for (const r of list) {
      const [eid, x, y, z, yaw, pitch, flags, held, atk, hp, emote] = r;
      seen.add(eid);
      const e = this.ensurePlayer(eid);
      e.tx = x; e.ty = y; e.tz = z; e.tyaw = yaw; e.tpitch = pitch; e.flags = flags; e.held = held; e.hp = hp; e.emote = emote || '';
      if (e.first) { e.x = x; e.y = y; e.z = z; e.yaw = yaw; e.first = false; }
      if (atk !== e.atkSeq) { if (e.atkSeq !== undefined && e.seen) { e.st.atkT = e.st.atkDur = holdKindOf(held) === 'melee' ? 0.38 : 0.2; } e.atkSeq = atk; }
      e.seen = true; e.lastSeen = this.time;
    }
    for (const [eid, e] of this.players) if (!seen.has(eid)) { e.model.visible = false; e.away = true; } else { e.away = false; }
  }
  removePlayer(eid) { const e = this.players.get(eid); if (e) { this.scene.remove(e.model); this.players.delete(eid); } this.info.delete(eid); }

  // ---------------------------------------------------------------- mobs
  onSnapshotMobs(list) {
    const seen = new Set();
    for (const r of list) {
      const [id, sp, x, y, z, yaw, st, hp, atk] = r;
      seen.add(id);
      let e = this.mobs.get(id);
      if (!e) {
        let model;
        if (sp === 'raider') { model = buildCharacter({ skin: 3, hair: 1, hairColor: 0, eyes: 2, shirt: 10, pants: 11, accent: 7, hat: 0 }, { raider: true, shirt: '#4a4f3a', pants: '#3a3a30' }); const held = buildHeld('smg'); model.userData.parts.hand.add(held); }
        else model = buildAnimal(sp);
        this.scene.add(model);
        const plate = null;
        e = { id, sp, model, x, y, z, yaw, tx: x, ty: y, tz: z, tyaw: yaw, st, hp, atkSeq: atk, phase: 0, speed: 0, atkT: 0, ast: { speed: 0, time: 0, atkT: 0, atkDur: 0.3, pitch: 0, holdKind: 'gun' }, first: true };
        this.mobs.set(id, e);
      }
      if (e.first) { e.first = false; }
      e.tx = x; e.ty = y; e.tz = z; e.tyaw = yaw; e.st = st; e.hp = hp; e.model.visible = true;
      if (atk !== e.atkSeq) { e.atkT = 0.35; e.atkSeq = atk; }
    }
    for (const [id, e] of this.mobs) if (!seen.has(id)) { e.model.visible = false; }
  }
  mobDied(id, sp, x, y, z) {
    const e = this.mobs.get(id);
    if (!e) return;
    this.scene.remove(e.model); this.mobs.delete(id);
    const m = e.model; this.scene.add(m);
    this.corpses.push({ m, t: 0, x: e.x, z: e.z, y: e.y, sp });
  }

  // ---------------------------------------------------------------- structures
  addPiece(p) {
    const old = this.pieces.get(p.id);
    if (old) { this.scene.remove(old.mesh); }
    const rec = { ...p };
    this.pieceIdx.remove(p.id);
    this.pieceIdx.add(rec);
    const mesh = buildPiece(rec);
    mesh.userData.open = !!p.open;
    if (mesh.userData.hinge) mesh.userData.hinge.userData.cur = p.open ? 1 : 0;
    this.scene.add(mesh);
    this.pieces.set(p.id, { p: rec, mesh });
    return rec;
  }
  updatePiece(u) {
    const e = this.pieces.get(u.id);
    if (!e) return;
    const p = e.p;
    if (u.tier !== undefined && u.tier !== p.tier) { p.tier = u.tier; this.scene.remove(e.mesh); e.mesh = buildPiece(p); e.mesh.userData.open = !!p.open; if (e.mesh.userData.hinge) e.mesh.userData.hinge.userData.cur = p.open ? 1 : 0; this.scene.add(e.mesh); }
    if (u.hp !== undefined) p.hp = u.hp;
    if (u.open !== undefined) { p.open = u.open; e.mesh.userData.open = u.open; }
    if (u.lk !== undefined) p.lk = u.lk;
  }
  removePiece(id) {
    const e = this.pieces.get(id);
    if (!e) return;
    this.scene.remove(e.mesh); this.pieces.delete(id); this.pieceIdx.remove(id);
  }

  depAt(x, z) { return `${Math.floor(x / 16)},${Math.floor(z / 16)}`; }
  addDep(d) {
    this.removeDep(d.id);
    const model = buildDeployable(d.type);
    model.position.set(d.x, d.y, d.z); model.rotation.y = d.ry || 0;
    if (d.type === 'loot_bag' && d.label) { const pl = makeNameplate(d.label, '#ffd58a'); pl.position.y = 1.0; model.add(pl); }
    this.scene.add(model);
    const rec = { ...d, model };
    this.deps.set(d.id, rec);
    const k = this.depAt(d.x, d.z); let s = this.depGrid.get(k); if (!s) this.depGrid.set(k, (s = new Set())); s.add(rec);
    this.setDepState(rec);
  }
  setDepState(rec) {
    const f = rec.model.getObjectByName('fire'); if (f) f.visible = !!rec.on;
    if (rec.type === 'satchel') rec.fuseEnd = performance.now() + (rec.fuse || 8) * 1000;
  }
  updateDep(u) { const d = this.deps.get(u.id); if (!d) return; Object.assign(d, u); this.setDepState(d); }
  removeDep(id) {
    const d = this.deps.get(id);
    if (!d) return;
    this.scene.remove(d.model); this.deps.delete(id);
    const s = this.depGrid.get(this.depAt(d.x, d.z)); if (s) s.delete(d);
  }
  solidsNear(x, z) {
    const out = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const s = this.depGrid.get(`${Math.floor(x / 16) + dx},${Math.floor(z / 16) + dz}`);
      if (s) for (const d of s) { const def = DEPLOY[d.type]; if (def && def.solid && Math.abs(d.x - x) < 3 && Math.abs(d.z - z) < 3) out.push({ x: d.x, z: d.z, r: def.r, y0: d.y, y1: d.y + 1.2 }); }
    }
    return out;
  }

  addPlant(p) {
    this.removePlant(p.id);
    const stage = p.stage ?? 0;
    const m = buildPlant(p.crop, stage); m.position.set(p.x, p.y, p.z); this.scene.add(m);
    this.plants.set(p.id, { ...p, stage, mesh: m });
  }
  setPlantStage(id, st) { const p = this.plants.get(id); if (!p || p.stage === st) return; this.scene.remove(p.mesh); this.addPlant({ ...p, stage: st }); }
  removePlant(id) { const p = this.plants.get(id); if (p) { this.scene.remove(p.mesh); this.plants.delete(id); } }

  addDrop(d) {
    this.removeDrop(d.id);
    const def = ITEMS[d.it.id];
    const m = buildDrop(def || {}); m.position.set(d.x, d.y, d.z); this.scene.add(m);
    this.drops.set(d.id, { ...d, mesh: m, bob: Math.random() * 6 });
  }
  removeDrop(id) { const d = this.drops.get(id); if (d) { this.scene.remove(d.mesh); this.drops.delete(id); } }

  initCrates(list, openedIds) {
    for (const c of this.crates.values()) this.scene.remove(c.mesh);
    this.crates.clear();
    const opened = new Set(openedIds);
    for (const c of list) {
      const m = buildCrate(c.kind, opened.has(c.id)); m.position.set(c.x, c.y, c.z); m.rotation.y = c.ry; m.visible = false; this.scene.add(m);
      this.crates.set(c.id, { ...c, mesh: m, opened: opened.has(c.id) });
    }
  }
  setCrate(id, opened) {
    const c = this.crates.get(id); if (!c || c.opened === opened) return;
    const vis = c.mesh.visible; this.scene.remove(c.mesh);
    c.mesh = buildCrate(c.kind, opened); c.mesh.position.set(c.x, c.y, c.z); c.mesh.rotation.y = c.ry; c.mesh.visible = vis; this.scene.add(c.mesh); c.opened = opened;
  }

  onSnapshotProj(list) {
    const seen = new Set();
    for (const [id, x, y, z, vx, vy, vz] of list) {
      seen.add(id);
      let a = this.proj.get(id);
      if (!a) {
        const m = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.7), new THREE.MeshBasicMaterial({ color: '#d9c08a' })); m.add(shaft);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 4), new THREE.MeshBasicMaterial({ color: '#9aa0a6' })); tip.rotation.x = -Math.PI / 2; tip.position.z = -0.4; m.add(tip);
        this.scene.add(m); a = { m, x, y, z, vx, vy, vz }; this.proj.set(id, a);
      }
      a.x = x; a.y = y; a.z = z; a.vx = vx; a.vy = vy; a.vz = vz;
    }
    for (const [id, a] of this.proj) if (!seen.has(id)) { this.scene.remove(a.m); this.proj.delete(id); }
  }

  // ---------------------------------------------------------------- per-frame
  update(dt, cam) {
    this.time += dt;
    const g = this.g, cx = cam.position.x, cz = cam.position.z;
    const smooth = 1 - Math.exp(-dt * 14);
    // players
    for (const e of this.players.values()) {
      if (e.away) continue;
      const dx = e.tx - e.x, dz = e.tz - e.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 6) { e.x = e.tx; e.z = e.tz; e.y = e.ty; } else { e.x += dx * smooth; e.z += dz * smooth; e.y += (e.ty - e.y) * smooth; }
      e.yaw += angDiff(e.yaw, e.tyaw) * smooth; e.pitch += (e.tpitch - e.pitch) * smooth;
      const spd = dist / Math.max(dt, 1e-3);
      e.st.speed += (Math.min(spd, 9) - e.st.speed) * Math.min(1, dt * 8);
      const d2 = (e.x - cx) ** 2 + (e.z - cz) ** 2;
      e.model.visible = d2 < 240 * 240;
      if (!e.model.visible) continue;
      e.model.position.set(e.x, e.y, e.z); e.model.rotation.y = e.yaw;
      const f = e.flags;
      const st = e.st;
      st.time += dt; st.sprint = !!(f & 1); st.crouch = !!(f & 2); st.swim = !!(f & 4); st.dead = !!(f & 32); st.baseY = e.y; st.pitch = e.pitch; st.reloading = !!(f & 128);
      st.holdKind = holdKindOf(e.held); st.drawing = !!(f & 16) && st.holdKind === 'bow';
      st.emote = e.emote; if (st.speed > 1.5) st.emote = '';
      if (st.atkT > 0) st.atkT -= dt;
      if (e.held !== e.lastHeld) {
        const P = e.model.userData.parts;
        while (P.hand.children.length) P.hand.remove(P.hand.children[0]);
        const h = e.held ? heldForItem(e.held) : null; if (h) { P.hand.add(h); h.traverse((o) => { if (o.isMesh) o.castShadow = true; }); }
        e.lastHeld = e.held;
      }
      animateCharacter(e.model, st, dt);
      if (e.plate) { e.plate.visible = d2 < 60 * 60 && !st.dead; }
    }
    // mobs
    for (const e of this.mobs.values()) {
      if (!e.model.visible) continue;
      const dx = e.tx - e.x, dz = e.tz - e.z, dist = Math.hypot(dx, dz);
      if (dist > 8) { e.x = e.tx; e.z = e.tz; e.y = e.ty; } else { e.x += dx * smooth; e.z += dz * smooth; e.y += (e.ty - e.y) * smooth; }
      e.yaw += angDiff(e.yaw, e.tyaw) * smooth;
      const spd = Math.min(10, dist / Math.max(dt, 1e-3)); e.speed += (spd - e.speed) * Math.min(1, dt * 8);
      const d2 = (e.x - cx) ** 2 + (e.z - cz) ** 2; if (d2 > 220 * 220) { e.model.visible = false; continue; }
      e.model.position.set(e.x, e.y, e.z); e.model.rotation.y = e.yaw;
      e.phase += e.speed * dt * (e.sp === 'bear' ? 1.6 : 2.2);
      if (e.atkT > 0) e.atkT -= dt;
      if (e.sp === 'raider') {
        const st = e.ast; st.speed = e.speed; st.time += dt; st.pitch = 0; st.holdKind = 'gun'; st.dead = false; st.baseY = e.y; st.sprint = e.speed > 3.5;
        st.atkT = e.atkT; st.atkDur = 0.3; animateCharacter(e.model, st, dt);
      } else {
        const legs = e.model.userData.legs, sw = Math.sin(e.phase) * Math.min(0.9, e.speed * 0.2 + (e.speed > 0.3 ? 0.15 : 0));
        if (legs) { legs[0].rotation.x = sw; legs[3].rotation.x = sw; legs[1].rotation.x = -sw; legs[2].rotation.x = -sw; }
        const head = e.model.userData.head; if (head) head.rotation.x = e.atkT > 0 ? -0.5 * Math.sin((1 - e.atkT / 0.35) * Math.PI) : (e.st === 4 ? 0.2 : Math.sin(this.time * 0.6 + e.id) * 0.05 - (e.st === 0 ? 0.35 * (Math.sin(this.time * 0.2 + e.id) > 0.6 ? 1 : 0) : 0));
        e.model.position.y += e.atkT > 0 ? Math.sin((1 - e.atkT / 0.35) * Math.PI) * 0.15 : 0;
      }
    }
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i]; c.t += dt;
      const a = Math.min(1, c.t * 3);
      c.m.rotation.z = lerp(0, Math.PI / 2, a); c.m.position.set(c.x, c.y + (c.sp === 'raider' ? 0 : 0.05) - Math.max(0, c.t - 20) * 0.1, c.z);
      if (c.sp === 'raider') { c.m.rotation.x = lerp(0, -Math.PI / 2, a); c.m.rotation.z = 0; c.m.position.y = c.y + 0.2; }
      if (c.t > 45) { this.scene.remove(c.m); this.corpses.splice(i, 1); }
    }
    // pieces: door anim + culling
    for (const e of this.pieces.values()) { if (e.mesh.userData.hinge) animateDoor(e.mesh, dt); }
    // crates culling
    for (const c of this.crates.values()) c.mesh.visible = (c.x - cx) ** 2 + (c.z - cz) ** 2 < 200 * 200;
    // drops bob
    for (const d of this.drops.values()) {
      d.bob += dt; d.mesh.position.y = d.y + 0.25 + Math.sin(d.bob * 2) * 0.08; d.mesh.rotation.y += dt * 1.5;
      d.mesh.visible = (d.x - cx) ** 2 + (d.z - cz) ** 2 < 90 * 90;
    }
    // plants culling
    for (const p of this.plants.values()) p.mesh.visible = (p.x - cx) ** 2 + (p.z - cz) ** 2 < 120 * 120;
    // projectiles
    for (const a of this.proj.values()) { a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt; a.vy -= 12 * dt; a.m.position.set(a.x, a.y, a.z); a.m.lookAt(a.x + a.vx, a.y + a.vy, a.z + a.vz); }
    // deployables: visibility, fire lights & particles
    let li = 0;
    const lit = [];
    for (const d of this.deps.values()) {
      const d2 = (d.x - cx) ** 2 + (d.z - cz) ** 2;
      d.model.visible = d2 < 180 * 180;
      if (!d.model.visible) continue;
      if (d.on && (d.type === 'campfire' || d.type === 'furnace')) {
        const f = d.model.getObjectByName('fire');
        if (f) { f.scale.setScalar(0.85 + Math.sin(this.time * 12 + d.id) * 0.12 + Math.random() * 0.06); f.rotation.y += dt * 2; }
        if (d2 < 30 * 30) { if (Math.random() < dt * 8) g.fx.spark(d.x, d.y + 0.5, d.z); if (Math.random() < dt * 3) g.fx.smoke(d.x, d.y + (d.type === 'furnace' ? 1.6 : 0.7), d.z); }
        lit.push([d2, d]);
      }
      if (d.type === 'satchel') { const blink = Math.sin((performance.now() % 500) / 500 * Math.PI * 2) > 0; d.model.children[1].visible = blink; }
      if (d.type === 'turret') { const h = d.model.getObjectByName('head'); if (h) h.rotation.y = d.on ? Math.sin(this.time * 1.4 + d.id) * 1.0 : h.rotation.y; }
    }
    lit.sort((a, b) => a[0] - b[0]);
    this.fireLights.forEach((l, i) => {
      const t = lit[i];
      if (t && t[0] < 60 * 60) { l.position.set(t[1].x, t[1].y + 1.0, t[1].z); l.intensity = 2.2 + Math.sin(this.time * 14 + i) * 0.35 + Math.random() * 0.2; }
      else l.intensity = 0;
    });
    // torch lights from nearby players (excluding self, handled elsewhere)
    let ti = 0;
    for (const e of this.players.values()) {
      if (ti >= this.torchLights.length) break;
      if (e.away || e.held !== 'torch' || !e.model.visible) continue;
      const l = this.torchLights[ti++]; l.position.set(e.x, e.y + 1.7, e.z); l.intensity = 1.6 + Math.random() * 0.25;
    }
    for (; ti < this.torchLights.length; ti++) this.torchLights[ti].intensity = 0;
  }
}
