// Local player: input, client-side prediction (shared physics), camera, first-person viewmodel, attack handling.
import * as THREE from 'three';
import { settings, ACTIONS } from './settings.js';
import { stepMove, EYE_H } from '/shared/physics.js';
import { WATER_LEVEL, BIOME } from '/shared/worldgen.js';
import { ITEMS, HOTBAR } from '/shared/items.js';
import { buildHeld, SKIN, CLOTH } from './models.js';
import { holdKindOf } from './entities.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Controls {
  constructor(game) {
    this.g = game;
    this.s = { x: 0, y: 0, z: 0, vy: 0, onGround: true, swim: false };
    this.yaw = 0; this.pitch = 0; this.recoil = { p: 0, y: 0, vp: 0, vy: 0 };
    this.k = {}; this.mouse = { l: false, r: false };
    this.keymap = {};
    this.acc = 0; this.sendT = 0; this.seq = 0; this.lastSent = '';
    this.eye = EYE_H; this.crouchT = 0; this.bobPhase = 0; this.bobAmt = 0;
    this.nextAct = 0; this.pressEdge = false; this.holdE = 0; this.holdX = 0; this.firedPress = false;
    this.aim = 0; this.zoom = 1; this.fovCur = 75; this.shake = 0;
    this.stride = 0; this.thirdPerson = false; this.lastLandV = 0;
    this.vm = new THREE.Group(); this.vmItem = null; this.vmId = null; this.vmSwing = 0; this.vmKick = 0; this.vmReload = 0; this.vmReloadDur = 1; this.vmUse = 0; this.vmDraw = 0; this.vmT = 0;
    this.drawStart = 0; this.drawing = false; this.emote = ''; this.emoteUntil = 0; this.ready = false;
    this.buildVM();
    this.bind();
  }

  // ------------------------------------------------------------- setup
  bind() {
    this.rebuildKeymap();
    settings.on((k) => { if (k === 'keys' || k === 'preset') this.rebuildKeymap(); });
    this.onKD = (e) => this.keyDown(e); this.onKU = (e) => this.keyUp(e);
    this.onMD = (e) => this.mouseDown(e); this.onMU = (e) => this.mouseUp(e); this.onMM = (e) => this.mouseMove(e); this.onWH = (e) => this.wheel(e);
    this.onBlur = () => { this.k = {}; this.mouse.l = this.mouse.r = false; };
    window.addEventListener('keydown', this.onKD); window.addEventListener('keyup', this.onKU); window.addEventListener('blur', this.onBlur);
    this.g.canvas.addEventListener('mousedown', this.onMD); window.addEventListener('mouseup', this.onMU); window.addEventListener('mousemove', this.onMM);
    window.addEventListener('wheel', this.onWH, { passive: false });
    this.onCtx = (e) => e.preventDefault(); this.g.canvas.addEventListener('contextmenu', this.onCtx);
  }
  dispose() {
    window.removeEventListener('keydown', this.onKD); window.removeEventListener('keyup', this.onKU); window.removeEventListener('blur', this.onBlur);
    this.g.canvas.removeEventListener('mousedown', this.onMD); window.removeEventListener('mouseup', this.onMU); window.removeEventListener('mousemove', this.onMM);
    window.removeEventListener('wheel', this.onWH); this.g.canvas.removeEventListener('contextmenu', this.onCtx);
  }
  rebuildKeymap() { this.keymap = {}; for (const a of ACTIONS) this.keymap[settings.key(a.id)] = a.id; }
  actionOf(code) { return this.keymap[code]; }

  buildVM() {
    const vm = this.vm;
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.4), new THREE.MeshStandardMaterial({ color: '#6fa24a', flatShading: true }));
    sleeve.position.set(0.02, -0.02, 0.2); this.sleeve = sleeve;
    const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 1), new THREE.MeshStandardMaterial({ color: '#e0a77a', flatShading: true }));
    this.hand = hand;
    const arm = new THREE.Group(); arm.add(sleeve); arm.add(hand); this.arm = arm;
    const rig = new THREE.Group(); rig.add(arm); this.rig = rig; vm.add(rig);
    vm.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    this.itemMount = new THREE.Group(); this.itemMount.scale.setScalar(0.62); rig.add(this.itemMount);
    arm.scale.setScalar(0.72);
  }
  applyAppearance(app) {
    const a = app || {};
    this.hand.material.color.set(SKIN[a.skin % SKIN.length] || '#e0a77a');
    this.sleeve.material.color.set(CLOTH[a.shirt % CLOTH.length] || '#6fa24a');
  }

  // ------------------------------------------------------------- input events
  blocked() { return this.g.uiBlocking(); }
  keyDown(e) {
    if (!this.g.active) return;
    if (e.code === 'Escape') { this.g.onEscape(); return; }
    const chatting = document.activeElement && document.activeElement.id === 'chat-input';
    if (chatting) return;
    const act = this.actionOf(e.code);
    if (e.repeat && act !== 'jump') { if (act) e.preventDefault(); return; }
    if (/^Digit[1-6]$/.test(e.code) && !this.blocked()) { this.g.selectSlot(+e.code[5] - 1); return; }
    if (!act) return;
    if (act === 'inventory' || act === 'map' || act === 'skills' || act === 'team' || act === 'chat') { e.preventDefault(); this.g.hotkey(act); return; }
    if (this.blocked()) return;
    if (act === 'debug' || act === 'view' || act === 'emote' || act === 'light' || act === 'reload' || act === 'rotate') e.preventDefault();
    this.k[act] = true;
    switch (act) {
      case 'view': this.thirdPerson = !this.thirdPerson; break;
      case 'debug': this.g.hud.toggleDebug(); break;
      case 'emote': this.g.hud.toggleEmoteWheel(); break;
      case 'light': this.g.ix.lightFire(); break;
      case 'reload': this.g.ix.reloadOrRepair(true); break;
      case 'rotate': this.g.ix.rotateBuild(); break;
      case 'use': this.holdE = performance.now(); this.g.ix.useDown(); break;
      case 'remove': this.holdX = performance.now(); break;
      case 'jump': e.preventDefault(); break;
    }
  }
  keyUp(e) {
    const act = this.actionOf(e.code);
    if (act) { this.k[act] = false; if (act === 'use') this.g.ix.useUp(); if (act === 'remove') this.holdX = 0; if (act === 'reload') this.g.ix.reloadOrRepair(false); }
  }
  mouseDown(e) {
    if (!this.g.active) return;
    if (!this.g.locked && !this.blocked()) { this.g.requestLock(); return; }
    if (this.blocked() || !this.g.locked) return;
    e.preventDefault();
    if (e.button === 0) { this.mouse.l = true; this.pressEdge = true; this.firedPress = false; }
    if (e.button === 2) { this.mouse.r = true; this.g.ix.rightClick(); }
  }
  mouseUp(e) {
    if (e.button === 0) { this.mouse.l = false; this.releaseAttack(); }
    if (e.button === 2) this.mouse.r = false;
  }
  mouseMove(e) {
    if (!this.g.locked || this.blocked()) return;
    const sens = 0.0022 * settings.get('sensitivity') * (this.aiming() ? settings.get('adsSensitivity') / Math.max(1, this.zoom * 0.7) : 1);
    this.yaw -= e.movementX * sens;
    this.pitch = clamp(this.pitch - e.movementY * sens * (settings.get('invertY') ? -1 : 1), -1.5, 1.5);
  }
  wheel(e) {
    if (!this.g.active || this.blocked() || !this.g.locked) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    if (this.g.ix.buildMode()) this.g.ix.cycleBuild(dir);
    else this.g.selectSlot((this.g.state.sel + dir + HOTBAR) % HOTBAR);
  }

  aiming() { const it = this.g.selItem(); return this.mouse.r && it && ITEMS[it.id]?.gun && !this.blocked(); }

  // ------------------------------------------------------------- state
  teleport(x, y, z) { this.s.x = x; this.s.y = y; this.s.z = z; this.s.vy = 0; this.s.onGround = false; this.g.me.x = x; this.g.me.y = y; this.g.me.z = z; }

  // ------------------------------------------------------------- per-frame
  update(dt, cam) {
    const g = this.g;
    const blocked = this.blocked() || g.dead;
    const st = g.state;
    // movement command
    let fwd = 0, side = 0;
    if (!blocked) { fwd = (this.k.forward ? 1 : 0) - (this.k.back ? 1 : 0); side = (this.k.right ? 1 : 0) - (this.k.left ? 1 : 0); }
    const stamina = st.vit.stamina;
    const crouch = !blocked && !!this.k.crouch;
    const moving = fwd !== 0 || side !== 0;
    if (this.sprintLock && stamina > 22) this.sprintLock = false;
    if (stamina < 1.5) this.sprintLock = true;
    const aiming = this.aiming();
    const sprint = !blocked && !!this.k.sprint && fwd > 0 && !crouch && !this.sprintLock && !aiming && !this.drawing;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const cmd = { mx: fwd * -sy + side * cy, mz: fwd * -cy + side * -sy, sprint, crouch, jump: !blocked && !!this.k.jump };
    this.acc += Math.min(dt, 0.1);
    const STEP = 1 / 60;
    const wasGround = this.s.onGround;
    while (this.acc >= STEP) {
      this.s.landV = 0; this.s.jumped = false;
      stepMove(g.env, this.s, cmd, STEP);
      if (this.s.landV < -6 && !this.s.swim) { g.audio.sfx('land', { x: this.s.x, y: this.s.y, z: this.s.z }, clamp(-this.s.landV / 14, 0.3, 1)); if (g.fx) g.fx.dust(this.s.x, this.s.y, this.s.z); }
      if (this.s.jumped) g.audio.sfx('jump', { x: this.s.x, y: this.s.y, z: this.s.z }, 0.6);
      this.acc -= STEP;
    }
    const s = this.s;
    g.me.x = s.x; g.me.y = s.y; g.me.z = s.z; g.me.yaw = this.yaw; g.me.pitch = this.pitch;
    g.me.speed = s.speed || 0; g.me.crouch = crouch; g.me.sprint = sprint; g.me.swim = s.swim; g.me.onGround = s.onGround;
    // footsteps
    if (s.onGround && (s.speed || 0) > 0.5 && !g.dead) {
      this.stride += (s.speed || 0) * dt;
      const len = sprint ? 2.3 : crouch ? 1.5 : 1.85;
      if (this.stride > len) { this.stride = 0; g.audio.sfx(g.stepSound(s), { x: s.x, y: s.y, z: s.z }, crouch ? 0.45 : sprint ? 1.1 : 0.8); }
    } else if (s.swim && (s.speed || 0) > 0.3) { this.stride += dt; if (this.stride > 0.7) { this.stride = 0; g.audio.sfx('step_water', { x: s.x, y: s.y, z: s.z }, 0.5); } }
    // send
    this.sendT += dt;
    if (g.net.joined && !g.dead && this.sendT >= 0.05) {
      this.sendT = 0;
      const flags = (sprint && moving ? 1 : 0) | (crouch ? 2 : 0) | (aiming || this.drawing ? 16 : 0);
      const emoteNow = this.emote && performance.now() < this.emoteUntil ? this.emote : '';
      g.net.send({ t: 'mv', s: ++this.seq, x: +s.x.toFixed(3), y: +s.y.toFixed(3), z: +s.z.toFixed(3), yaw: +this.yaw.toFixed(3), pitch: +this.pitch.toFixed(3), f: flags, e: emoteNow });
    }
    if (moving) this.emote = '';
    // stamina prediction so sprint feels responsive
    if (sprint && moving) st.vit.stamina = Math.max(0, st.vit.stamina - 15 * dt); else st.vit.stamina = Math.min(st.vit.maxSt || 100, st.vit.stamina + 17 * dt);
    // hold-to-pickup / remove
    if (this.holdE && this.k.use) g.ix.useHold(performance.now() - this.holdE);
    if (this.holdX && this.k.remove) g.ix.removeHold(performance.now() - this.holdX);
    // attacks
    this.updateAttack(dt);
    // camera
    this.updateCamera(dt, cam, aiming, crouch, moving, sprint);
    this.updateVM(dt, aiming);
  }

  updateCamera(dt, cam, aiming, crouch, moving, sprint) {
    const g = this.g, s = this.s;
    const targetEye = crouch ? 1.15 : EYE_H;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 12);
    // bob
    const spd = s.onGround ? (s.speed || 0) : 0;
    this.bobAmt += (Math.min(1, spd / 4.5) - this.bobAmt) * Math.min(1, dt * 8);
    this.bobPhase += spd * dt * 1.7;
    const bob = settings.get('headBob') && !this.thirdPerson ? Math.sin(this.bobPhase * 2) * 0.03 * this.bobAmt * (aiming ? 0.2 : 1) : 0;
    const sway = settings.get('headBob') && !this.thirdPerson ? Math.cos(this.bobPhase) * 0.015 * this.bobAmt : 0;
    // recoil spring
    const R = this.recoil;
    R.p += R.vp * dt; R.y += R.vy * dt; R.vp -= R.p * 60 * dt + R.vp * 9 * dt; R.vy -= R.y * 60 * dt + R.vy * 9 * dt;
    // FOV / zoom
    const it = g.selItem(); const gd = it && ITEMS[it.id]?.gun;
    const targetZoom = (aiming && gd) ? (gd.zoom || 1.1) : (this.drawing ? 1.25 : 1);
    this.zoom += (targetZoom - this.zoom) * Math.min(1, dt * 12);
    const baseFov = settings.get('fov') * (s.speed > 6 ? 1.06 : 1);
    this.fovCur += (baseFov / this.zoom - this.fovCur) * Math.min(1, dt * 10);
    cam.fov = this.fovCur; cam.updateProjectionMatrix();
    const scoped = gd && gd.zoom >= 2.5 && this.zoom > 2.4 && !this.thirdPerson;
    g.hud.setScope(scoped);
    this.shake = Math.max(0, this.shake - dt * 3);
    const sh = this.shake * 0.05;
    const ex = s.x, ey = s.y + this.eye + bob, ez = s.z;
    const yaw = this.yaw + R.y + (Math.random() - 0.5) * sh, pitch = clamp(this.pitch + R.p + (Math.random() - 0.5) * sh, -1.55, 1.55);
    cam.rotation.set(pitch, yaw, sway * 0.4, 'YXZ');
    if (this.thirdPerson) {
      const back = 3.4, dirx = Math.sin(yaw) * Math.cos(pitch), dirz = Math.cos(yaw) * Math.cos(pitch), diry = -Math.sin(pitch);
      let px = ex + dirx * back, py = ey + 0.3 + diry * back, pz = ez + dirz * back;
      const gh = g.world.data.height(px, pz); if (py < gh + 0.4) py = gh + 0.4;
      cam.position.set(px + Math.cos(yaw) * 0.5, py, pz - Math.sin(yaw) * 0.5);
    } else cam.position.set(ex, ey, ez);
    g.underwater = cam.position.y < WATER_LEVEL - 0.05;
  }

  // ------------------------------------------------------------- viewmodel
  setVMItem(id) {
    if (this.vmId === id) return;
    this.vmId = id;
    if (this.vmItem) this.itemMount.remove(this.vmItem);
    this.vmItem = null;
    if (!id) return;
    const d = ITEMS[id]; if (!d) return;
    let m;
    if (d.hold) m = buildHeld(d.hold);
    else { m = buildHeld('_generic'); m.children[0].material = new THREE.MeshStandardMaterial({ color: d.color, flatShading: true }); m.children[0].scale.setScalar(1.3); }
    m.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    this.vmItem = m; this.itemMount.add(m);
    this.vmDrawIn = 1;
  }
  updateVM(dt, aiming) {
    const g = this.g, vm = this.vm;
    const it = g.selItem();
    this.setVMItem(it ? it.id : null);
    vm.visible = !this.thirdPerson && !g.dead && this.zoom < 2.4;
    this.vmT += dt;
    this.vmSwing = Math.max(0, this.vmSwing - dt * (1 / 0.32)); this.vmKick = Math.max(0, this.vmKick - dt * 9);
    this.vmReload = Math.max(0, this.vmReload - dt); this.vmUse = Math.max(0, this.vmUse - dt * 1.1);
    this.vmDrawIn = Math.max(0, (this.vmDrawIn || 0) - dt * 4);
    const kind = it ? holdKindOf(it.id) : 'none';
    const rig = this.rig, item = this.itemMount;
    const bob = this.bobAmt, ph = this.bobPhase;
    let px = 0.3, py = -0.3, pz = -0.52, rx = 0, ry = 0, rz = 0;
    const t = this.vmT;
    px += Math.cos(ph) * 0.012 * bob; py += Math.abs(Math.sin(ph)) * 0.014 * bob - Math.sin(t * 1.6) * 0.003;
    if (kind === 'gun') {
      const ads = this.aim = this.aim + ((aiming ? 1 : 0) - this.aim) * Math.min(1, dt * 12);
      px = 0.22 + (0 - 0.22) * ads; py = -0.22 + (-0.145 + 0.22) * ads; pz = -0.42 + (-0.3 + 0.42) * ads;
      pz += this.vmKick * 0.07; rx = this.vmKick * 0.09; py -= this.vmDrawIn * 0.25;
      if (this.vmReload > 0) { const p = 1 - this.vmReload / this.vmReloadDur; const e = Math.sin(p * Math.PI); py -= e * 0.16; rx -= e * 0.6; rz += e * 0.5; px += e * 0.02; }
      item.rotation.set(Math.PI / 2 * 0 , 0, 0); item.position.set(0, 0.03, -0.02);
      rig.rotation.set(rx, 0, rz); rig.position.set(px, py, pz);
      this.arm.position.set(0.0, -0.02, 0.1); this.arm.rotation.set(0.05, 0, 0);
      this.hand.position.set(0.0, -0.06, 0.06);
      this.sleeve.position.set(0.03, -0.1, 0.24); this.sleeve.rotation.set(0.35, 0, 0);
    } else if (kind === 'bow') {
      this.aim += ((this.drawing ? 1 : 0) - this.aim) * Math.min(1, dt * 8);
      const dr = this.drawing ? clamp((performance.now() - this.drawStart) / 550, 0, 1) : 0;
      px = 0.12 - 0.12 * this.aim; py = -0.17; pz = -0.45 + this.vmKick * 0.04 - 0.05 * dr;
      rig.rotation.set(0, 0.06, 0); rig.position.set(px, py, pz);
      item.rotation.set(0, 0, 0); item.position.set(0, 0.0, 0);
      this.arm.position.set(0, 0, 0.1); this.hand.position.set(0, -0.02, 0.05);
      this.sleeve.position.set(0.02, -0.02, 0.28); this.sleeve.rotation.set(0.1, 0, 0);
    } else {
      // melee / tool / item / hands
      const sw = this.vmSwing; const e = sw > 0 ? Math.sin((1 - sw) * Math.PI) : 0; const prog = 1 - sw;
      px += 0.06; py += 0.02 - this.vmDrawIn * 0.3;
      if (kind === 'melee') {
        const swing = sw > 0 ? (prog < 0.3 ? -prog / 0.3 * 0.9 : -0.9 + (prog - 0.3) / 0.7 * 2.3) : 0;
        rig.rotation.set(-0.15 + swing, -0.35 + e * 0.5, 0.1 - e * 0.4); rig.position.set(px - e * 0.15, py + e * 0.1 - (prog > 0.3 && sw > 0 ? 0.05 : 0), pz);
        item.rotation.set(-0.35, 0, 0); item.position.set(0, -0.01, -0.02);
      } else if (kind === 'item') {
        const u = this.vmUse > 0 ? Math.sin((1 - this.vmUse) * Math.PI) : 0;
        rig.rotation.set(-0.3 - u * 0.5, -0.2, 0.05); rig.position.set(px - 0.05 - u * 0.1, py + u * 0.2, pz + u * 0.15);
        item.rotation.set(-0.5, 0, 0); item.position.set(0, -0.02, -0.05);
      } else {
        const punch = e * 0.3;
        rig.rotation.set(-0.2, -0.1, 0); rig.position.set(px, py + 0.05, pz - punch);
      }
      this.arm.position.set(0, 0, 0.16); this.hand.position.set(0, -0.02, 0.02);
      this.sleeve.position.set(0.02, -0.06, 0.34); this.sleeve.rotation.set(0.4, 0, 0);
      if (!it) this.hand.scale.setScalar(1.4); else this.hand.scale.setScalar(1);
    }
    // torch light & flame
    if (it && it.id === 'torch') {
      if (!this.torchLight) { this.torchLight = new THREE.PointLight('#ffb060', 2, 24, 1.6); this.rig.add(this.torchLight); this.torchLight.position.set(0.0, 0.5, -0.2); }
      this.torchLight.intensity = 2.1 + Math.random() * 0.4; this.torchLight.visible = !this.thirdPerson;
      if (this.vmItem) this.vmItem.traverse((o) => { if (o.userData && o.userData.flame) o.scale.setScalar(0.9 + Math.random() * 0.4); });
    } else if (this.torchLight) this.torchLight.visible = false;
    // muzzle position for viewmodel
    this.muzzleVM = this.vmItem && this.vmItem.userData.muzzle ? this.vmItem.userData.muzzle : null;
  }

  // ------------------------------------------------------------- attacks
  releaseAttack() {
    const g = this.g, it = g.selItem();
    if (this.drawing && it && ITEMS[it.id]?.gun?.type === 'bow') {
      g.net.send({ t: 'atk', yaw: this.yaw, pitch: this.pitch, ph: 1 });
      const pow = clamp((performance.now() - this.drawStart) / (ITEMS[it.id].gun.draw * 1000), 0, 1);
      if (pow >= 0.25) { this.vmKick = 1; g.audio.sfx('bow', { x: this.s.x, y: this.s.y, z: this.s.z }, 0.9); this.nextAct = performance.now() + ITEMS[it.id].gun.rate * 1000; }
      this.drawing = false;
    }
  }
  updateAttack(dt) {
    const g = this.g;
    if (this.blocked() || g.dead || !g.locked) { if (this.drawing) this.releaseAttack(); this.pressEdge = false; return; }
    const it = g.selItem();
    const now = performance.now();
    const down = this.mouse.l;
    const edge = this.pressEdge; this.pressEdge = false;
    if (!down && !edge) return;
    const d = it ? ITEMS[it.id] : null;
    const kind = it ? holdKindOf(it.id) : 'none';
    if (g.ix.buildMode()) { if (edge) g.ix.buildClick(); return; }
    if (d && d.cat === 'deploy') { if (edge) g.ix.deployClick(d, it); return; }
    if (d && d.cat === 'deploy' && d.deploy === 'lock') return;
    if (kind === 'bow') {
      if (edge && now >= this.nextAct) { if (g.countItem(d.gun.ammo) <= 0) { g.toast('You have no arrows.', 'warn'); return; } this.drawing = true; this.drawStart = now; g.net.send({ t: 'atk', yaw: this.yaw, pitch: this.pitch, ph: 0 }); g.audio.sfx('draw', null, 0.6); }
      return;
    }
    if (now < this.nextAct) return;
    if (kind === 'gun') {
      const gd = d.gun;
      if (!gd.auto && !edge) return;
      if (g.reloadingNow()) { if (!gd.perShell) return; }
      if (it.ammo <= 0) {
        if (edge) { g.audio.sfx('dry', null, 0.8); this.nextAct = now + 300; if (g.countItem(gd.ammo) > 0) g.net.send({ t: 'reload' }); else g.toast(`Out of ${ITEMS[gd.ammo].name}.`, 'warn'); }
        return;
      }
      this.nextAct = now + gd.rate * 1000;
      g.net.send({ t: 'atk', yaw: this.yaw, pitch: this.pitch });
      it.ammo--; g.hud.updateAmmo();
      this.fireLocal(d, gd);
      return;
    }
    if (kind === 'melee' || kind === 'none') {
      const w = d && d.melee ? d.melee : { rate: 0.6 };
      this.nextAct = now + w.rate * 1000;
      g.net.send({ t: 'atk', yaw: this.yaw, pitch: this.pitch });
      this.vmSwing = 1; g.audio.sfx('whoosh', null, 0.5);
      return;
    }
    if (edge && kind === 'item') {
      if (d.cat === 'seed') { const tp = g.ix.groundPoint(6); if (!tp) { g.toast('Look at open ground to plant.', 'warn'); return; } this.nextAct = now + 700; g.net.send({ t: 'atk', yaw: this.yaw, pitch: this.pitch, tp: [tp.x, tp.z] }); this.vmUse = 1; return; }
      this.nextAct = now + 900; g.net.send({ t: 'atk', yaw: this.yaw, pitch: this.pitch }); this.vmUse = 1;
    }
  }
  fireLocal(d, gd) {
    const g = this.g, R = this.recoil;
    const k = gd.recoil;
    R.vp += k * 0.55 * (this.aim > 0.5 ? 0.6 : 1) * 1.0; R.vy += (Math.random() - 0.5) * k * 0.5;
    this.pitch = clamp(this.pitch + k * 0.0032 * (this.aim > 0.5 ? 0.6 : 1), -1.5, 1.5);
    this.yaw += (Math.random() - 0.5) * k * 0.0018;
    this.vmKick = 1; this.shake = Math.min(1, this.shake + k * 0.03);
    g.audio.sfx(gd.sound, null, 1);
    const cam = g.camera; const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const org = new THREE.Vector3(); cam.getWorldPosition(org);
    const right = new THREE.Vector3().crossVectors(dir, cam.up).normalize();
    const mp = org.clone().add(dir.clone().multiplyScalar(0.7)).add(right.multiplyScalar(this.thirdPerson ? 0.1 : 0.16)).add(new THREE.Vector3(0, -0.11, 0));
    g.fx.muzzle(mp.x, mp.y, mp.z, dir.x, dir.y, dir.z, gd.pellets > 1 ? 1.6 : d.id === 'rifle' ? 1.4 : 1);
    if (d.id === 'shotgun') setTimeout(() => g.audio.sfx('pump', null, 0.8), 380);
  }
  startReloadAnim(dur) { this.vmReload = dur; this.vmReloadDur = dur; }
}
