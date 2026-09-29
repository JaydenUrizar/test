// Interaction: what the crosshair is pointing at, use/pickup/doors/locks, build ghost, deployable placement.
import * as THREE from 'three';
import { ITEMS, DEPLOY, NODES, CROPS } from '/shared/items.js';
import { rayWorld, groundAt } from '/shared/physics.js';
import { WATER_LEVEL } from '/shared/worldgen.js';
import { PIECES, PIECE_ORDER, GRID, LEVEL_H, validatePlacement, placeCost, upgradeCost, repairCost, pieceMaxHp, pieceCenter, cellKey, edgeKey, TIERS, edgeCells } from '/shared/building.js';
import { buildPiece, buildDeployable } from './models.js';

const REACH = 4.6;
const ghostMats = { ok: new THREE.MeshBasicMaterial({ color: '#5cff7a', transparent: true, opacity: 0.42, depthWrite: false }), bad: new THREE.MeshBasicMaterial({ color: '#ff5050', transparent: true, opacity: 0.42, depthWrite: false }) };
const costStr = (c) => Object.entries(c).map(([k, v]) => `${v} ${ITEMS[k].name}`).join(', ');

export class Interaction {
  constructor(game) {
    this.g = game;
    this.target = null; this.promptEl = document.getElementById('prompt'); this.progEl = document.getElementById('progress');
    this.bType = 'foundation'; this.bRot = 0; this.plan = null; this.ghost = null; this.ghostKey = ''; this.pieceTarget = null;
    this.dGhost = null; this.dGhostType = ''; this.dRot = 0; this.nodeHint = null;
    this.useTarget = null; this.repairAt = 0; this.tick = 0; this.hintText = '';
  }
  cam() { return this.g.camera; }
  ray() {
    const c = this.cam(), d = new THREE.Vector3(); c.getWorldDirection(d);
    const o = new THREE.Vector3(); c.getWorldPosition(o);
    return { o, d };
  }
  buildMode() { const it = this.g.selItem(); return !!it && it.id === 'hammer'; }

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    const g = this.g;
    this.tick++;
    if (g.dead || g.uiBlocking()) { this.setPrompt(''); this.clearGhosts(); return; }
    const it = g.selItem();
    const d = it && ITEMS[it.id];
    if (this.buildMode()) { this.updateBuild(); this.clearDeployGhost(); }
    else {
      this.clearBuildGhost();
      if (d && d.cat === 'deploy' && d.deploy !== 'lock') this.updateDeployGhost(d, it); else this.clearDeployGhost();
    }
    if (this.tick % 2 === 0) this.findTarget();
    this.updatePrompt();
    if (this.buildMode() && g.controls.k.reload && performance.now() > this.repairAt) this.repairTarget();
  }

  // ---------------------------------------------------------------- target finding
  findTarget() {
    const g = this.g, { o, d } = this.ray();
    const reach = g.controls.thirdPerson ? REACH + 3 : REACH;
    const wh = rayWorld(g.env, o.x, o.y, o.z, d.x, d.y, d.z, reach + 1, { nodes: true });
    const wt = wh ? wh.t : reach + 1;
    let best = null;
    const test = (kind, obj, cx, cy, cz, radius) => {
      const vx = cx - o.x, vy = cy - o.y, vz = cz - o.z;
      const t = vx * d.x + vy * d.y + vz * d.z;
      if (t < 0.1 || t > reach || t > wt + 0.6) return;
      const px = vx - d.x * t, py = vy - d.y * t, pz = vz - d.z * t;
      const perp = Math.hypot(px, py, pz);
      if (perp > radius) return;
      const score = perp / radius + t * 0.05;
      if (!best || score < best.score) best = { kind, obj, score, t };
    };
    const me = g.me;
    for (const c of g.ent.crates.values()) { if (Math.abs(c.x - me.x) > 8 || Math.abs(c.z - me.z) > 8) continue; test('crate', c, c.x, c.y + 0.4, c.z, c.kind === 'barrel' ? 0.6 : 0.85); }
    for (const dp of g.ent.deps.values()) { if (Math.abs(dp.x - me.x) > 8 || Math.abs(dp.z - me.z) > 8) continue; const def = DEPLOY[dp.type]; if (!def || dp.type === 'satchel') continue; test('dep', dp, dp.x, dp.y + (dp.type === 'furnace' ? 0.7 : 0.5), dp.z, Math.max(0.7, def.r + 0.25)); }
    for (const dr of g.ent.drops.values()) { if (Math.abs(dr.x - me.x) > 8 || Math.abs(dr.z - me.z) > 8) continue; test('drop', dr, dr.x, dr.y + 0.25, dr.z, 0.6); }
    for (const pl of g.ent.plants.values()) { if (Math.abs(pl.x - me.x) > 8 || Math.abs(pl.z - me.z) > 8) continue; test('plant', pl, pl.x, pl.y + 0.6, pl.z, 0.75); }
    for (const pe of g.ent.pieces.values()) {
      if (pe.p.type !== 'door') continue;
      const c = pieceCenter(pe.p); if (Math.abs(c.x - me.x) > 8 || Math.abs(c.z - me.z) > 8) continue;
      test('door', pe.p, c.x, pe.p.y + 1.2, c.z, 1.3);
    }
    if (!best && d.y < -0.02) {
      const tw = (WATER_LEVEL - o.y) / d.y;
      if (tw > 0 && tw <= reach) { const x = o.x + d.x * tw, z = o.z + d.z * tw; if (g.world.data.height(x, z) < WATER_LEVEL - 0.05 && (!wh || wh.t > tw - 0.3)) best = { kind: 'water', obj: { x, z }, score: 5, t: tw }; }
    }
    this.target = best;
    // resource hint
    this.nodeHint = null;
    if (!best && wh && wh.kind === 'node' && wh.t < 3.6) this.nodeHint = NODES[wh.node.type];
    else if (!best) {
      for (const n of g.world.data.nodesNear(o.x + d.x * 1.8, o.z + d.z * 1.8, 2.0)) {
        const def = NODES[n.type]; if (def.r > 0 || g.world.depleted.has(n.id)) continue;
        const cx = n.x - o.x, cy = n.y + 0.4 - o.y, cz = n.z - o.z, t = cx * d.x + cy * d.y + cz * d.z;
        if (t < 0.3 || t > 3.4) continue;
        if (Math.hypot(cx - d.x * t, cy - d.y * t, cz - d.z * t) < 0.85) { this.nodeHint = def; break; }
      }
    }
    // structure under crosshair (for hammer)
    this.pieceTarget = null;
    if (this.buildMode()) {
      const h2 = rayWorld(g.env, o.x, o.y, o.z, d.x, d.y, d.z, 10.5, {});
      if (h2 && h2.kind === 'piece' && h2.piece) { const rec = g.ent.pieces.get(h2.piece.id); if (rec) this.pieceTarget = rec.p; }
    }
  }

  setPrompt(html) { if (this.hintText === html) return; this.hintText = html; if (html) { this.promptEl.innerHTML = html; this.promptEl.classList.remove('hidden'); } else this.promptEl.classList.add('hidden'); }
  key(a) { return this.g.keyLabel(a); }

  updatePrompt() {
    const g = this.g, t = this.target;
    if (this.buildMode()) return this.buildPrompt();
    const it = g.selItem(), d = it && ITEMS[it.id];
    if (d && d.cat === 'deploy' && d.deploy !== 'lock') {
      const ok = this.dGhostOk; return this.setPrompt(`<b>${d.name}</b> — <kbd>LMB</kbd> place · <kbd>${this.key('rotate')}</kbd> rotate${ok === false ? ` <span class="bad">· ${this.dReason || 'invalid spot'}</span>` : ''}`);
    }
    if (d && d.deploy === 'lock') {
      const lt = this.lockTarget();
      return this.setPrompt(lt ? `<kbd>LMB</kbd> Install code lock on this ${lt.kind === 'door' ? 'door' : 'container'}` : 'Aim at a door or storage box to install the lock');
    }
    if (!t) {
      if (this.nodeHint) { const n = this.nodeHint; const need = n.tool === 'axe' ? 'axe / rock' : n.tool === 'pick' ? (n.req > 0 ? 'pickaxe' : 'pickaxe / rock') : 'hands'; return this.setPrompt(`<b>${n.name}</b> <span class="dim">— gather with ${need}</span>`); }
      return this.setPrompt('');
    }
    const K = `<kbd>${this.key('use')}</kbd>`;
    switch (t.kind) {
      case 'crate': return this.setPrompt(`${K} Search <b>${{ barrel: 'Barrel', crate: 'Supply Crate', military: 'Military Crate', farm: 'Farm Crate' }[t.obj.kind]}</b>${t.obj.opened ? ' <span class="dim">(already searched)</span>' : ''}`);
      case 'drop': { const i = ITEMS[t.obj.it.id]; return this.setPrompt(`${K} Pick up <b>${i.name}</b>${t.obj.it.n > 1 ? ' ×' + t.obj.it.n : ''}`); }
      case 'plant': { const c = CROPS[t.obj.crop]; const ripe = t.obj.stage >= 3; return this.setPrompt(ripe ? `${K} Harvest <b>${c.name}</b>` : `<b>${c.name}</b> <span class="dim">— growing (${['sprout', 'young', 'nearly ripe'][t.obj.stage] || ''})</span>`); }
      case 'door': return this.setPrompt(`${K} ${t.obj.open ? 'Close' : 'Open'} door${t.obj.lk ? ' 🔒' : ''}`);
      case 'water': return this.setPrompt(`Hold ${K} to <b>drink</b>`);
      case 'dep': {
        const def = DEPLOY[t.obj.type], tp = t.obj.type;
        let s = '';
        if (def.device) s = `${K} Open <b>${def.name}</b> · <kbd>${this.key('light')}</kbd> ${t.obj.on ? 'Extinguish' : 'Light'}`;
        else if (def.slots) s = `${K} Open <b>${tp === 'loot_bag' ? (t.obj.label || 'Remains') + '’s belongings' : def.name}</b>${t.obj.lk ? ' 🔒' : ''}`;
        else if (def.bench) s = `<b>${def.name}</b> <span class="dim">— crafting bench (stand close, press ${this.key('inventory')})</span>`;
        else s = `<b>${def.name}</b>`;
        if (tp !== 'loot_bag' && tp !== 'satchel') s += ` <span class="dim">· hold ${this.key('use')} to pick up</span>`;
        return this.setPrompt(s);
      }
    }
    this.setPrompt('');
  }

  // ---------------------------------------------------------------- use actions
  useDown() {
    const t = this.target; this.useTarget = t; this.usedHold = false;
    if (!t) return;
    const g = this.g;
    switch (t.kind) {
      case 'door': g.net.send({ t: 'bdoor', id: t.obj.id }); if (!t.obj.lk) g.audio.sfx('door', { x: t.obj.gx * GRID, y: t.obj.y, z: t.obj.gz * GRID }, 0.8); break;
      case 'crate': g.net.send({ t: 'use', k: 'crate', id: t.obj.id }); break;
      case 'drop': g.net.send({ t: 'use', k: 'drop', id: t.obj.id }); break;
      case 'plant': g.net.send({ t: 'use', k: 'plant', id: t.obj.id }); break;
      case 'water': g.net.send({ t: 'use', k: 'water', x: t.obj.x, z: t.obj.z }); this.waterAt = performance.now() + 500; break;
    }
  }
  useHold(ms) {
    const t = this.useTarget;
    if (!t) return;
    const g = this.g;
    if (t.kind === 'water') { if (performance.now() > this.waterAt) { const c = this.target; if (c && c.kind === 'water') { g.net.send({ t: 'use', k: 'water', x: c.obj.x, z: c.obj.z }); this.waterAt = performance.now() + 500; } } return; }
    if (t.kind === 'dep' && t.obj.type !== 'loot_bag' && t.obj.type !== 'satchel') {
      if (ms > 350) { this.progEl.classList.remove('hidden'); const p = Math.min(1, (ms - 350) / 700); this.progEl.firstElementChild.style.width = p * 100 + '%'; this.progEl.lastElementChild.textContent = 'Picking up…'; }
      if (ms > 1050 && !this.usedHold) { this.usedHold = true; g.net.send({ t: 'use', k: 'dep', id: t.obj.id, pk: true }); this.progEl.classList.add('hidden'); }
    }
  }
  useUp() {
    this.progEl.classList.add('hidden');
    const t = this.useTarget; this.useTarget = null;
    if (!t || this.usedHold) return;
    if (t.kind === 'dep') this.g.net.send({ t: 'use', k: 'dep', id: t.obj.id });
  }
  lightFire() {
    const t = this.target;
    if (t && t.kind === 'dep' && DEPLOY[t.obj.type].device) this.g.net.send({ t: 'use', k: 'dep', id: t.obj.id, tog: true });
  }
  reloadOrRepair(down) {
    const g = this.g;
    if (!down) return;
    if (this.buildMode()) { this.repairTarget(); return; }
    const it = g.selItem(), d = it && ITEMS[it.id];
    if (d && d.gun && d.gun.type === 'gun') {
      if (it.ammo >= d.gun.mag) return;
      if (g.countItem(d.gun.ammo) <= 0) { g.toast(`No ${ITEMS[d.gun.ammo].name}.`, 'warn'); return; }
      g.net.send({ t: 'reload' });
      g.controls.startReloadAnim(d.gun.reload * (d.gun.perShell ? 1 : 1));
      g.audio.sfx(d.gun.perShell ? 'shell' : 'reload', null, 0.8);
    }
  }
  reloadTick() {}
  removeHold(ms) {
    if (!this.buildMode() || !this.pieceTarget) return;
    if (ms > 250) { this.progEl.classList.remove('hidden'); this.progEl.firstElementChild.style.width = Math.min(100, (ms - 250) / 8) + '%'; this.progEl.lastElementChild.textContent = 'Removing…'; }
    if (ms > 1050) { this.g.net.send({ t: 'bremove', id: this.pieceTarget.id }); this.g.controls.holdX = 0; this.progEl.classList.add('hidden'); }
  }
  repairTarget() {
    if (!this.pieceTarget) return;
    const p = this.pieceTarget;
    if (p.hp >= pieceMaxHp(p.type, p.tier) - 1) return;
    this.repairAt = performance.now() + 450;
    this.g.net.send({ t: 'brepair', id: p.id });
  }
  rightClick() {
    const g = this.g;
    if (this.buildMode()) {
      const p = this.pieceTarget;
      if (!p) return;
      if (p.tier >= 2) return g.toast('Already metal.', 'info');
      g.net.send({ t: 'bupg', id: p.id, tier: p.tier + 1 });
    }
  }

  // ---------------------------------------------------------------- locks
  lockTarget() {
    const t = this.target;
    if (t && t.kind === 'door' && !t.obj.lk) return { kind: 'door', k: 'piece', id: t.obj.id };
    if (t && t.kind === 'dep' && DEPLOY[t.obj.type].lockable && !t.obj.lk) return { kind: 'box', k: 'dep', id: t.obj.id };
    return null;
  }

  // ---------------------------------------------------------------- deployables
  groundPoint(maxD = 6) {
    const g = this.g, { o, d } = this.ray();
    const h = rayWorld(g.env, o.x, o.y, o.z, d.x, d.y, d.z, maxD, {});
    if (h) { const t = Math.max(0, h.t - 0.05); return { x: o.x + d.x * t, z: o.z + d.z * t, y: o.y + d.y * t, kind: h.kind, t: h.t }; }
    // fall back to the point on ground at end of reach
    const x = o.x + d.x * maxD, z = o.z + d.z * maxD;
    if (d.y < -0.05) return null;
    return null;
  }
  updateDeployGhost(d, it) {
    const g = this.g;
    const type = d.deploy;
    if (this.dGhostType !== type) { this.clearDeployGhost(); const m = buildDeployable(type); m.traverse((o) => { if (o.isMesh) { o.material = ghostMats.ok; o.castShadow = false; } }); g.scene.add(m); this.dGhost = m; this.dGhostType = type; }
    const gp = this.groundPoint(6.5);
    if (!gp) { this.dGhost.visible = false; this.dGhostOk = false; this.dReason = 'aim at the ground'; return; }
    const y = groundAt(g.env, gp.x, gp.z, g.me.y + 1.2);
    this.dGhost.visible = true; this.dGhost.position.set(gp.x, y, gp.z);
    this.dGhost.rotation.y = g.controls.yaw + this.dRot;
    const water = g.world.data.height(gp.x, gp.z) < 0.3;
    const far = Math.hypot(gp.x - g.me.x, gp.z - g.me.z) > 7.5;
    const ok = !water && !far;
    this.dReason = water ? 'can’t place on water' : far ? 'too far' : '';
    this.dGhostOk = ok;
    const mat = ok ? ghostMats.ok : ghostMats.bad;
    this.dGhost.traverse((o) => { if (o.isMesh) o.material = mat; });
    this.dPos = { x: gp.x, y, z: gp.z };
  }
  clearDeployGhost() { if (this.dGhost) { this.g.scene.remove(this.dGhost); this.dGhost = null; this.dGhostType = ''; } }
  deployClick(d, it) {
    const g = this.g;
    if (d.deploy === 'lock') {
      const lt = this.lockTarget();
      if (!lt) return g.toast('Aim at a door or storage box to install the lock.', 'warn');
      g.hud.codePad({ title: 'Set a 4-digit code', onSubmit: (code) => g.net.send({ t: 'lock', k: lt.k, id: lt.id, code }) });
      return;
    }
    if (!this.dPos || !this.dGhostOk) return g.toast(this.dReason ? `Can’t place: ${this.dReason}` : 'Can’t place there.', 'warn');
    g.net.send({ t: 'place', slot: g.state.sel, x: +this.dPos.x.toFixed(2), z: +this.dPos.z.toFixed(2), y: +this.dPos.y.toFixed(2), ry: +(g.controls.yaw + this.dRot).toFixed(3) });
    g.controls.nextAct = performance.now() + 300;
  }
  rotateBuild() {
    if (this.buildMode()) this.bRot = (this.bRot + 1) % 4;
    else this.dRot += Math.PI / 4;
  }

  // ---------------------------------------------------------------- building
  cycleBuild(dir) { const i = PIECE_ORDER.indexOf(this.bType); this.bType = PIECE_ORDER[(i + dir + PIECE_ORDER.length) % PIECE_ORDER.length]; this.g.hud.renderBuildBar(); this.g.audio.ui('tick'); }
  setBuild(type) { this.bType = type; this.g.hud.renderBuildBar(); }
  buildEnv() {
    const g = this.g;
    return { pieces: g.pieces, world: g.world.data, isBlockedByNode: (x0, z0, x1, z1) => { for (const n of g.world.data.nodesNear((x0 + x1) / 2, (z0 + z1) / 2, 6)) { if (g.world.depleted.has(n.id)) continue; const def = NODES[n.type]; if (def.r > 0 && n.x > x0 - def.r && n.x < x1 + def.r && n.z > z0 - def.r && n.z < z1 + def.r) return true; } return false; } };
  }
  computePlan() {
    const g = this.g, { o, d } = this.ray();
    const h = rayWorld(g.env, o.x, o.y, o.z, d.x, d.y, d.z, 11, {});
    let px, py, pz;
    if (h) { const t = Math.max(0, h.t - 0.12); px = o.x + d.x * t; py = o.y + d.y * t; pz = o.z + d.z * t; }
    else { px = o.x + d.x * 8; py = o.y + d.y * 8; pz = o.z + d.z * 8; }
    const env = this.buildEnv(), type = this.bType, kind = PIECES[type].kind;
    const gx0 = Math.floor(px / GRID), gz0 = Math.floor(pz / GRID);
    let best = null;
    const consider = (req, score) => {
      const r = validatePlacement(env, req);
      if (!r.ok) { if (!best) best = { req, ok: false, error: r.error, score: 1e9 }; return; }
      if (!best || !best.ok || score < best.score) best = { req, ok: true, piece: r.piece, score };
    };
    if (kind === 'cell') {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const gx = gx0 + dx, gz = gz0 + dz;
        const cxm = gx * GRID + 2, czm = gz * GRID + 2;
        const dist = Math.hypot(cxm - px, czm - pz);
        if (type === 'foundation') consider({ type, L: 0, gx, gz }, dist);
        else for (let L = 1; L <= 5; L++) { const r = validatePlacement(env, { type, L, gx, gz }); if (r.ok) consider({ type, L, gx, gz }, dist + Math.abs(r.piece.y - py) * 0.9); else if (!best) best = { req: { type, L, gx, gz }, ok: false, error: r.error, score: 1e9 }; }
      }
    } else if (kind === 'stairs') {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const gx = gx0 + dx, gz = gz0 + dz;
        for (let L = 0; L <= 4; L++) { const fl = g.pieces.get(cellKey(L, gx, gz)); if (!fl) continue; consider({ type, L, gx, gz, rot: this.bRot }, Math.hypot(gx * GRID + 2 - px, gz * GRID + 2 - pz) + Math.abs(fl.y - py) * 0.9); }
      }
      if (!best) best = { ok: false, error: 'Stairs go on a floor or foundation', score: 1e9 };
    } else if (kind === 'edge') {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const gx = gx0 + dx, gz = gz0 + dz;
        for (const [dir, ex, ez] of [[0, gx, gz], [0, gx, gz + 1], [1, gx, gz], [1, gx + 1, gz]]) {
          const cx = dir === 0 ? ex * GRID + 2 : ex * GRID, cz = dir === 0 ? ez * GRID : ez * GRID + 2;
          const dist = Math.hypot(cx - px, cz - pz);
          if (dist > 4.5) continue;
          for (let L = 0; L <= 5; L++) { const r = validatePlacement(env, { type, L, gx: ex, gz: ez, dir }); if (r.ok) consider({ type, L, gx: ex, gz: ez, dir }, dist + Math.abs(r.piece.y + 1.5 - py) * 0.8); else if (!best) best = { req: { type, L, gx: ex, gz: ez, dir }, ok: false, error: r.error, score: 1e9 }; }
        }
      }
    } else if (kind === 'door') {
      let cand = null;
      for (const p of g.pieces.near(px, pz, 3.5)) { if (p.type !== 'doorway') continue; const c = pieceCenter(p); const dist = Math.hypot(c.x - px, c.z - pz) + Math.abs(p.y + 1.2 - py) * 0.5; if (!cand || dist < cand.dist) cand = { p, dist }; }
      if (cand) consider({ type, L: cand.p.L, gx: cand.p.gx, gz: cand.p.gz, dir: cand.p.dir }, cand.dist);
      else best = { ok: false, error: 'Aim at a doorway', score: 1e9 };
    }
    if (!best) best = { ok: false, error: 'Nothing to build here', score: 1e9 };
    // client-side reach / resource checks
    if (best.ok) {
      const c = pieceCenter(best.piece);
      const far = Math.hypot(c.x - g.me.x, c.z - g.me.z) > 10.5 || Math.abs(best.piece.y - g.me.y) > 9;
      const cost = placeCost(type);
      if (far) { best.ok = false; best.error = 'Too far away'; }
      else if (Object.entries(cost).some(([id, n]) => g.countItem(id) < n)) { best.ok = false; best.error = `Need ${costStr(cost)}`; best.noRes = true; }
    }
    return best;
  }
  updateBuild() {
    const g = this.g;
    if (this.tick % 2) return;
    const plan = this.computePlan();
    this.plan = plan;
    if (plan.piece) {
      const p = { ...plan.piece, id: -1, tier: 0 };
      const key = `${p.type}|${p.L}|${p.gx}|${p.gz}|${p.dir}|${p.rot}`;
      if (key !== this.ghostKey) {
        this.clearBuildGhost();
        const m = buildPiece(p);
        m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
        g.scene.add(m); this.ghost = m; this.ghostKey = key;
        if (m.userData.hinge) m.userData.hinge.userData.cur = 0;
      }
      const mat = plan.ok ? ghostMats.ok : ghostMats.bad;
      this.ghost.traverse((o) => { if (o.isMesh && o.material !== mat) o.material = mat; });
      this.ghost.visible = true;
    } else this.clearBuildGhost();
  }
  clearBuildGhost() { if (this.ghost) { this.g.scene.remove(this.ghost); this.ghost = null; this.ghostKey = ''; } }
  clearGhosts() { this.clearBuildGhost(); this.clearDeployGhost(); }
  buildClick() {
    const g = this.g, pl = this.plan;
    if (!pl || !pl.ok) { g.toast(pl ? pl.error : 'Can’t build there', 'warn'); g.audio.ui('error'); return; }
    const r = pl.req;
    g.net.send({ t: 'build', type: r.type, L: r.L, gx: r.gx, gz: r.gz, dir: r.dir || 0, rot: r.rot || 0 });
    g.controls.nextAct = performance.now() + 180;
  }
  buildPrompt() {
    const pl = this.plan, pt = this.pieceTarget;
    let s = `<b>${PIECES[this.bType].name}</b> · <kbd>LMB</kbd> place · <kbd>wheel</kbd> change · `;
    if (this.bType === 'stairs') s += `<kbd>${this.key('rotate')}</kbd> rotate · `;
    if (pt) {
      const max = pieceMaxHp(pt.type, pt.tier);
      s = `<b>${TIERS[pt.tier]} ${PIECES[pt.type].name}</b> <span class="dim">${Math.round(pt.hp)}/${max} HP</span> · `;
      if (pt.tier < 2) s += `<kbd>RMB</kbd> upgrade (${costStr(upgradeCost(pt.type, pt.tier + 1))}) · `;
      if (pt.hp < max - 1) s += `hold <kbd>${this.key('reload')}</kbd> repair · `;
      s += `hold <kbd>${this.key('remove')}</kbd> remove`;
      return this.setPrompt(s);
    }
    if (pl && !pl.ok) s += `<span class="bad">${pl.error}</span>`;
    else s += `<span class="dim">cost ${costStr(placeCost(this.bType))}</span>`;
    this.setPrompt(s);
  }
}
