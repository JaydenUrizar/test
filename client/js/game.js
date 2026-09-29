// Game: owns renderer/scene/net and wires world, entities, controls, interaction, HUD, audio and UI panels.
import * as THREE from 'three';
import { ITEMS, HOTBAR, DEPLOY } from '/shared/items.js';
import { PieceIndex, pieceCenter, GRID } from '/shared/building.js';
import { WATER_LEVEL, BIOME, WORLD_HALF } from '/shared/worldgen.js';
import { buildCharacter, setEquipment } from './models.js';
import { WorldView } from './world.js';
import { Effects } from './effects.js';
import { Entities, animateCharacter, holdKindOf } from './entities.js';
import { Controls } from './controls.js';
import { Interaction } from './interact.js';
import { Hud } from './hud.js';
import { Net } from './net.js';
import { Tutorial } from './tutorial.js';
import { settings, keyLabel } from './settings.js';
import { audio } from './audio.js';
import { api } from './api.js';

const $ = (id) => document.getElementById(id);
const WEATHER_LABEL = { clear: '☀ Clear', cloudy: '☁ Cloudy', rain: '🌧 Rain', storm: '⛈ Storm', fog: '🌫 Fog' };

export class Game {
  constructor(app) {
    this.app = app; this.audio = audio; this.settings = settings;
    this.canvas = $('game');
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.setSize(innerWidth, innerHeight, false);
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = settings.get('shadows') !== 'off'; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), innerWidth / innerHeight, 0.08, 1400);
    this.scene.add(this.camera);
    this.pieces = new PieceIndex();
    this.state = this.freshState();
    this.me = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, name: '' };
    this.uis = new Set(); this.modalOpen = 0; this.dead = false; this.active = false; this.locked = false; this.hour = 9; this.hourServer = 9; this.weather = 'clear'; this.underwater = false;
    this.listeners = new Map(); this.worldInfo = {}; this.netState = 'idle'; this.netAttempt = 0; this.welcomed = false;
    this.fx = new Effects(this.scene);
    this.ent = new Entities(this); this.ent.fx = this.fx;
    this.hud = new Hud(this);
    this.ix = new Interaction(this);
    this.controls = new Controls(this);
    this.camera.add(this.controls.vm);
    this.selfModel = null; this.selfSt = { speed: 0, time: 0, atkT: 0, atkDur: 0.35, pitch: 0, holdKind: 'none' };
    this.net = new Net({ message: (m) => this.onMessage(m), status: (s, i) => this.onNetStatus(s, i) });
    this.last = performance.now(); this.rafId = 0; this.frameN = 0; this.slowFrames = 0; this.benchT = 0; this.thunderT = 0; this.flashT = 0;
    this.ui = {};
    document.addEventListener('pointerlockchange', () => this.onLockChange());
    this.onResize = () => { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight, false); };
    window.addEventListener('resize', this.onResize);
    this.settingsOff = settings.on((k) => this.onSettings(k));
    window.addEventListener('beforeunload', () => this.net.close());
  }

  freshState() {
    return { inv: new Array(30).fill(null), eq: new Array(4).fill(null), sel: 0, cont: null, craftQ: [], learned: [], level: 1, xp: 0, xpNext: 100, points: 0, perks: {}, vit: { hp: 100, food: 100, water: 100, stamina: 100, temp: 36.5, maxHp: 100, maxSt: 100 }, benchTier: 0, disc: new Set(), team: null, invite: null, players: new Map(), teamPos: new Map(), waypoint: null, spawnPro: false, stats: {} };
  }

  // ---------------------------------------------------------------- events (for UI modules)
  on(evt, fn) { let s = this.listeners.get(evt); if (!s) this.listeners.set(evt, (s = new Set())); s.add(fn); return () => s.delete(fn); }
  emit(evt, data) { const s = this.listeners.get(evt); if (s) for (const fn of [...s]) { try { fn(data); } catch (e) { console.error(`[ui ${evt}]`, e); } } }
  send(m) { this.net.send(m); }
  toast(t, kind) { this.app.toast(t, kind); }
  keyLabel(a) { return keyLabel(settings.key(a)); }
  selItem() { return this.state.inv[this.state.sel]; }
  countItem(id) { let n = 0; for (const s of this.state.inv) if (s && s.id === id) n += s.n; return n; }
  reloadingNow() { return this.controls.vmReload > 0; }
  weatherLabel() { return WEATHER_LABEL[this.weather] || ''; }
  selectSlot(i) { if (i < 0 || i >= HOTBAR) return; this.state.sel = i; this.net.send({ t: 'sel', i }); this.hud.renderHotbar(); this.hud.renderBuildBar(); this.controls.drawing = false; this.audio.ui('tick'); this.controls.vmDrawIn = 1; }

  // ---------------------------------------------------------------- UI state
  uiBlocking() { return !this.active || this.uis.size > 0 || this.hud.chatOpen || this.modalOpen > 0 || this.paused || !this.welcomed; }
  uiOpened(name) { this.uis.add(name); this.releaseLock(); this.controls.k = {}; this.controls.mouse.l = this.controls.mouse.r = false; this.audio.ui('open'); }
  uiClosed(name) { this.uis.delete(name); this.audio.ui('back'); if (this.uis.size === 0 && !this.dead) setTimeout(() => this.requestLock(), 30); }
  anyUiOpen() { return this.uis.size > 0; }
  hotkey(act) {
    if (!this.welcomed) return;
    if (act === 'chat') { if (!this.hud.chatOpen && !this.uis.size && !this.dead) { this.releaseLock(true); this.hud.openChat(); } return; }
    if (this.dead) return;
    const map = { inventory: this.ui.inventory, map: this.ui.map, skills: this.ui.skills, team: this.ui.team };
    const target = map[act];
    if (!target) return;
    // close others first
    for (const [k, u] of Object.entries(map)) if (u !== target && u && u.isOpen && u.isOpen()) u.close();
    target.toggle();
    if (act === 'map' && target.isOpen()) this.tutorial && this.tutorial.event('map');
  }
  onEscape() {
    for (const u of [this.ui.inventory, this.ui.map, this.ui.skills, this.ui.team]) if (u && u.isOpen && u.isOpen()) { u.close(); return; }
    if (this.hud.chatOpen) { this.hud.closeChat(); return; }
    if (!this.hud.emoteWheel.classList.contains('hidden')) { this.hud.emoteWheel.classList.add('hidden'); return; }
    if (!this.paused) this.showPause();
  }
  showPause() {
    if (this.paused || this.dead) return;
    this.paused = true; this.releaseLock(true); this.controls.k = {};
    this.app.menus.showPause({ onResume: () => { this.paused = false; this.requestLock(); }, onLeave: () => { this.paused = false; this.app.leaveGame(); } });
  }
  resumeFromPause() { this.paused = false; }
  requestLock() { if (this.uiBlocking() || this.dead || this.locked) return; try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch {} }
  releaseLock(intentional) { this.expectUnlock = true; if (document.pointerLockElement) document.exitPointerLock(); setTimeout(() => { this.expectUnlock = false; }, 300); }
  onLockChange() {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked && this.active && this.welcomed && !this.expectUnlock && !this.uis.size && !this.dead && !this.paused && !this.modalOpen && !this.hud.chatOpen) setTimeout(() => { if (!this.locked && !this.uis.size && !this.paused && !this.dead && !this.expectUnlock) this.showPause(); }, 60);
  }
  onSettings(k) {
    if (!this.world) return;
    if (k === 'viewDistance' || k === 'preset') this.world.setViewDistance(settings.get('viewDistance'));
    if (k === 'shadows' || k === 'preset') { this.renderer.shadowMap.enabled = settings.get('shadows') !== 'off'; this.world.setShadows(settings.get('shadows')); this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
    if (k === 'crosshair' || k === 'preset') $('crosshair').style.display = settings.get('crosshair') ? '' : 'none';
    this.ix.g = this;
  }

  // ---------------------------------------------------------------- lifecycle
  async join(server, opts = {}) {
    this.serverInfo = server;
    this.welcomed = false; this.dead = false;
    const p = new Promise((resolve, reject) => { this._welcome = { resolve, reject }; setTimeout(() => reject(new Error('The server took too long to respond')), 12000); });
    await this.net.connect({ t: 'join', token: api.token, server: server.id, password: opts.password, invite: opts.invite });
    await p;
  }
  async loadUI() {
    const tryImport = async (path) => { try { return await import(path); } catch (e) { console.warn('[ui] failed to load', path, e); return null; } };
    const [icons, inv, map, panels] = await Promise.all([tryImport('./ui/icons.js'), tryImport('./ui/inventory.js'), tryImport('./ui/map.js'), tryImport('./ui/panels.js')]);
    this.iconMod = icons;
    if (inv && !this.ui.inventory) this.ui.inventory = new inv.InventoryUI(this, $('inv-root'));
    if (map && !this.ui.map) { this.ui.map = new map.MapUI(this, $('map-root')); this.ui.minimap = new map.Minimap($('minimap'), this); }
    if (panels && !this.ui.skills) { this.ui.skills = new panels.SkillsUI(this, $('panel-root')); this.ui.team = new panels.TeamUI(this, $('panel-root')); }
    this.hud.lastHotKey = ''; this.hud.renderHotbar();
  }
  start() {
    this.active = true; this.last = performance.now();
    this.hud.show();
    $('crosshair').style.display = settings.get('crosshair') ? '' : 'none';
    cancelAnimationFrame(this.rafId);
    const loop = (t) => { this.rafId = requestAnimationFrame(loop); try { this.frame(t); } catch (e) { console.error('frame error', e); } };
    this.rafId = requestAnimationFrame(loop);
  }
  stop() {
    this.active = false; cancelAnimationFrame(this.rafId);
    this.net.close(); this.controls.dispose(); this.releaseLock();
    for (const u of Object.values(this.ui)) { try { u.destroy ? u.destroy() : u.close && u.close(); } catch {} }
    this.hud.hide(); this.hud.hideDeath(); this.hud.setScope(false);
    if (this.tutorial) this.tutorial.hide();
    this.ent.clear();
    this.settingsOff && this.settingsOff();
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    audio.setUnderwater(false);
  }

  // ---------------------------------------------------------------- network
  onNetStatus(s, info) {
    this.netState = s; if (s === 'reconnecting') this.netAttempt = info;
    if (s === 'error') { if (this._welcome) { this._welcome.reject(new Error(info)); this._welcome = null; } }
    if (s === 'kicked') { this.active && this.app.onDisconnected('Disconnected', info || 'You were disconnected from the server.'); }
    if (s === 'lost') this.active && this.app.onDisconnected('Connection lost', 'Could not re-establish the connection to the server.', { retry: true });
    if (s === 'reconnected') this.toast('Reconnected!', 'good');
    if (s === 'closed' && this.active && !this.net.closedByUs) this.app.onDisconnected('Disconnected', 'The connection to the server was closed.', { retry: true });
  }
  onMessage(m) {
    if (m.t !== 's') return;
    if (m.ev) for (const e of m.ev) { try { this.onEvent(e); } catch (err) { console.error('[event]', e && e.e, err); } }
    if (!this.welcomed) return;
    this.ent.onSnapshotPlayers(m.P); this.ent.onSnapshotMobs(m.M); this.ent.onSnapshotProj(m.PR);
    this.hourServer = m.h;
    if (m.tm) { const tp = new Map(); for (const [eid, x, z] of m.tm) tp.set(eid, { x, z, name: (this.ent.info.get(eid) || {}).name || '' }); this.state.teamPos = tp; }
  }

  eqIds(eq) { return (eq || []).map((it) => (it ? it.id : null)); }

  onEvent(e) {
    const st = this.state;
    switch (e.e) {
      case 'welcome': return this.onWelcome(e);
      case 'inv': {
        st.inv = e.inv; st.eq = e.eq; st.sel = e.sel;
        this.hud.renderHotbar(); this.hud.renderBuildBar();
        if (this.selfModel) setEquipment(this.selfModel, this.eqIds(e.eq));
        this.emit('inv'); this.emit('vit');
        break;
      }
      case 'vit': { const [hp, food, water, stamina, temp, maxHp, maxSt] = e.v; const wasSt = st.vit.stamina; Object.assign(st.vit, { hp, food, water, temp, maxHp, maxSt }); if (Math.abs(stamina - wasSt) > 8) st.vit.stamina = stamina; else st.vit.stamina += (stamina - st.vit.stamina) * 0.3; st.xp = e.xp; st.level = e.lvl; st.points = e.pts; st.xpNext = e.next; this.emit('vit'); break; }
      case 'sel': st.sel = e.i; this.hud.renderHotbar(); this.hud.renderBuildBar(); break;
      case 'corr': { const c = this.controls; if (e.force || Math.hypot(c.s.x - e.x, c.s.z - e.z) > 0.25 || Math.abs(c.s.y - e.y) > 0.6) c.teleport(e.x, e.y, e.z); break; }
      case 'toast': this.toast(e.text, e.kind === 'good' ? 'good' : e.kind === 'warn' ? 'warn' : 'info'); if (e.kind === 'good') audio.ui('success'); break;
      case 'berr': this.toast(e.text, 'warn'); audio.ui('error'); break;
      case 'chat': this.hud.chatMsg(e); break;
      case 'pj': if (e.eid !== this.myEid) { this.ent.setInfo(e.eid, { name: e.name, app: e.app, team: e.team, eq: (e.eq || []).map((x) => x || null) }); } st.players.set(e.eid, { name: e.name, team: e.team }); this.emit('players'); break;
      case 'pl': this.ent.removePlayer(e.eid); st.players.delete(e.eid); this.emit('players'); break;
      case 'pteam': { const p = st.players.get(e.eid); if (p) p.team = e.team; this.ent.setInfo(e.eid, { team: e.team }); this.emit('players'); break; }
      case 'peq': if (e.eid !== this.myEid) this.ent.setInfo(e.eid, { eq: e.eq }); break;
      case 'hurt': {
        let ang; const src = e.from ? (this.ent.players.get(e.from) || this.ent.mobs.get(e.from)) : null;
        if (src) { const dx = src.x - this.me.x, dz = src.z - this.me.z; const bearing = Math.atan2(-dx, -dz); ang = this.controls.yaw - bearing; ang = -ang + Math.PI; }
        this.hud.hurt(src ? ang : undefined); audio.sfx('hurt', null, 0.9); this.controls.shake = Math.min(1.2, this.controls.shake + Math.min(1, e.d / 25));
        this.controls.recoil.vp += Math.min(2, e.d * 0.05); break;
      }
      case 'dead': this.onDead(e); break;
      case 'respawned': this.onRespawned(e); break;
      case 'hm': {
        this.hud.hitMarker(e.head, e.kill); audio.sfx(e.kill ? 'kill' : e.head ? 'headshot' : 'hit_marker', null, 0.7);
        const d = new THREE.Vector3(); this.camera.getWorldDirection(d); const p = this.camera.position.clone().add(d.multiplyScalar(7)); this.hud.damageNumber(p, e.d, e.head); break;
      }
      case 'hit': this.onHit(e); break;
      case 'shot': this.onShot(e); break;
      case 'rl': if (e.eid !== this.myEid) { const p = this.ent.players.get(e.eid); audio.sfx(e.w === 'shotgun' ? 'shell' : 'reload', p ? { x: p.x, y: p.y, z: p.z } : null, 0.6); } break;
      case 'draw': if (e.eid !== this.myEid) { const p = this.ent.players.get(e.eid); if (p) audio.sfx('draw', { x: p.x, y: p.y, z: p.z }, 0.5); } break;
      case 'blood': this.fx.hit('flesh', e.x, e.y, e.z); break;
      case 'mobdie': this.ent.mobDied(e.id, e.sp, e.x, e.y, e.z); audio.sfx(e.sp === 'wolf' ? 'growl' : e.sp === 'boar' ? 'boar' : e.sp === 'deer' ? 'deer' : e.sp === 'bear' ? 'growl' : 'hit_flesh', { x: e.x, y: e.y, z: e.z }, 0.8); break;
      case 'mobatk': { const m = this.ent.mobs.get(e.id); if (m) audio.sfx(m.sp === 'wolf' ? 'bite' : m.sp === 'bear' ? 'growl' : 'bite', { x: m.x, y: m.y, z: m.z }, 0.9); break; }
      case 'boom': { this.fx.explosion(e.x, e.y, e.z, e.r); audio.sfx('boom', { x: e.x, y: e.y, z: e.z, ref: 40 }, 1.4); const d = Math.hypot(e.x - this.me.x, e.z - this.me.z); this.controls.shake = Math.min(1.5, this.controls.shake + Math.max(0, 1.5 - d / 30)); break; }
      case 'node-': {
        this.world.setDepleted(e.id, true);
        const n = this.world.data.nodes[e.id];
        if (n) { if (n.type.startsWith('tree')) { this.world.fellTree(e.id, e.yaw || 0); audio.sfx('tree_fall', { x: n.x, y: n.y, z: n.z }, 0.9); } else if (n.type === 'bush_berry' || n.type === 'fiber_plant') this.fx.hit('leaf', n.x, n.y + 0.5, n.z); else this.fx.hit('stone', n.x, n.y + 0.6, n.z); }
        break;
      }
      case 'node+': this.world.setDepleted(e.id, false); break;
      case 'drop+': this.ent.addDrop(e.d); break;
      case 'drop-': this.ent.removeDrop(e.id); break;
      case 'dep+': this.ent.addDep(e.d); if (e.d.o === this.uid && e.d.type === 'campfire') this.tutorial && this.tutorial.event('placed'); audio.sfx('build', { x: e.d.x, y: e.d.y, z: e.d.z }, 0.7); this.fx.dust(e.d.x, e.d.y, e.d.z); break;
      case 'dep-': { const d = this.ent.deps.get(e.id); if (d && e.boom) { this.fx.explosion(d.x, d.y + 0.5, d.z, 1.5); audio.sfx('destroy', { x: d.x, y: d.y, z: d.z }, 0.8); } this.ent.removeDep(e.id); break; }
      case 'dep~': {
        const before = this.ent.deps.get(e.id); const wasOn = before && before.on;
        this.ent.updateDep(e);
        if (before && e.on && !wasOn && before.o === this.uid && (before.type === 'campfire' || before.type === 'furnace')) this.tutorial && this.tutorial.event('fire');
        break;
      }
      case 'piece+': { const p = this.ent.addPiece(e.p); if (e.p.o === this.uid) this.tutorial && this.tutorial.event('built'); const c = pieceCenter(p); audio.sfx('build', { x: c.x, y: p.y, z: c.z }, 1); this.fx.dust(c.x, p.y, c.z); this.fx.hit('wood', c.x, p.y + 1, c.z); break; }
      case 'piece-': { if (e.boom) { this.fx.explosion(e.x, e.y + 1, e.z, 1.5); audio.sfx('destroy', { x: e.x, y: e.y, z: e.z }, 1); } this.ent.removePiece(e.id); break; }
      case 'piece~': {
        const rec = this.ent.pieces.get(e.id); const old = rec ? { ...rec.p } : null;
        this.ent.updatePiece(e);
        if (rec && old) { const c = pieceCenter(rec.p); if (e.open !== undefined && e.open !== old.open) audio.sfx('door', { x: c.x, y: rec.p.y, z: c.z }, 0.9); if (e.tier !== undefined && e.tier !== old.tier) { audio.sfx('upgrade', { x: c.x, y: rec.p.y, z: c.z }, 1); this.fx.dust(c.x, rec.p.y + 1, c.z); } }
        break;
      }
      case 'built': break;
      case 'plant+': this.ent.addPlant(e.pl); break;
      case 'plant~': this.ent.setPlantStage(e.id, e.st); break;
      case 'plant-': this.ent.removePlant(e.id); break;
      case 'crate~': this.ent.setCrate(e.id, e.opened); break;
      case 'cont': st.cont = e; this.emit('cont', e); if (e.first && this.ui.inventory && !this.ui.inventory.isOpen()) this.ui.inventory.open('inventory'); break;
      case 'contx': st.cont = null; this.emit('contx'); break;
      case 'craftq': st.craftQ = e.q; this.emit('craftq'); break;
      case 'crafted': audio.sfx('craft', null, 0.8); this.tutorial && this.tutorial.event('crafted', e.r); break;
      case 'got': this.hud.pickup(e.id, e.n); if (performance.now() - (this.lastPick || 0) > 90) { audio.sfx('pickup', null, 0.6); this.lastPick = performance.now(); } break;
      case 'learned': st.learned = e.learned; this.emit('learned'); this.emit('inv'); break;
      case 'perks': st.perks = e.perks; st.points = e.points; this.emit('perks'); this.emit('vit'); break;
      case 'level': audio.ui('levelup'); this.emit('level'); this.emit('vit'); break;
      case 'disc': st.disc.add(e.id); this.emit('disc', e); audio.ui('levelup'); this.app.bigToast && this.app.bigToast('DISCOVERED', e.name); break;
      case 'weather': this.weather = e.type; audio.setWeather(e.type); break;
      case 'time': this.hourServer = e.h; this.hour = e.h; this.worldInfo.day = e.d; break;
      case 'kill': this.hud.killFeed(e); break;
      case 'sfx': this.onServerSfx(e.s); break;
      case 'ammo': { const it = this.selItem(); if (it && it.ammo !== undefined) { it.ammo = e.a; this.hud.updateAmmo(); this.hud.renderHotbar(); } break; }
      case 'team': st.team = e.team; this.ent.players.forEach((p) => this.ent.refreshPlate(p)); this.emit('team'); break;
      case 'invite': st.invite = { from: e.from, team: e.team }; this.emit('invite'); audio.sfx('notify', null, 1); this.toast(`${e.from} invited you to join "${e.team}" — open Team (P) to accept.`, 'good'); break;
      case 'unlocked': break;
      case 'lockprompt': this.hud.codePad({ title: 'Enter code', onSubmit: (code) => this.net.send({ t: 'unlock', k: e.k, id: e.id, code }) }); break;
      case 'pong': this.net.gotPong(e.ts); break;
    }
  }

  onServerSfx(s) {
    const map = { eat: 'eat', drink: 'drink', heal: 'heal', plant: 'plant', ignite: 'ignite', fireoff: 'fireoff', lock: 'lock', unlock: 'unlock', locked: 'locked', dry: 'dry', break: 'break' };
    if (s === 'eat' || s === 'drink') this.tutorial && this.tutorial.event('ate');
    if (map[s]) audio.sfx(map[s], null, 0.9);
  }

  onWelcome(e) {
    const st = this.state;
    const first = !this.world;
    this.worldInfo = { ...e.world };
    this.uid = e.you.uid; this.myEid = e.you.eid; this.selfName = e.you.name; this.me.name = e.you.name;
    if (first || this.world.data.seedRaw !== String(e.world.seed)) {
      if (this.world) { this.scene.clear(); }
      this.world = new WorldView(this.scene, e.world.seed, settings.all());
      this.scene.add(this.camera);
      this.fx = new Effects(this.scene); this.ent.fx = this.fx; this.ent.scene = this.scene;
    }
    this.env = { world: this.world.data, pieces: this.pieces, depleted: this.world.depleted, solids: (x, z) => this.ent.solidsNear(x, z) };
    this.ent.clear();
    for (const id of [...this.pieces.byId.keys()]) this.pieces.remove(id);
    // static world state
    for (const id of e.depleted) this.world.depleted.add(id);
    for (const p of e.pieces) this.ent.addPiece(p);
    for (const d of e.deps) this.ent.addDep(d);
    for (const p of e.plants) this.ent.addPlant(p);
    for (const d of e.drops) this.ent.addDrop(d);
    this.ent.initCrates(this.world.data.crates, e.crates);
    st.players.clear();
    for (const p of e.players) { st.players.set(p.eid, { name: p.name, team: p.team }); if (p.eid !== e.you.eid) this.ent.setInfo(p.eid, { name: p.name, app: p.app, team: p.team, eq: (p.eq || []).map((x) => x || null) }); }
    const teams = e.teams || []; st.team = null; for (const t of teams) if (t.members.some((m) => m.uid === e.you.uid)) st.team = t;
    Object.assign(st, { level: e.you.level, xp: e.you.xp, xpNext: e.you.xpNext, points: e.you.points, perks: e.you.perks, learned: e.you.learned, disc: new Set(e.you.disc), sel: e.you.sel });
    this.hour = this.hourServer = e.world.hour; this.weather = e.world.weather; audio.setWeather(this.weather);
    this.controls.teleport(e.you.x, e.you.y, e.you.z); this.controls.yaw = e.you.yaw || 0; this.controls.pitch = 0;
    this.controls.applyAppearance(this.app.profile.appearance);
    if (!this.selfModel) { this.selfModel = buildCharacter(this.app.profile.appearance); this.scene.add(this.selfModel); this.selfModel.visible = false; }
    this.dead = e.you.dead; if (this.dead) this.hud.showDeath({ cause: 'died', bags: [] });
    this.welcomed = true;
    this.emit('welcome'); this.emit('team'); this.emit('players'); this.emit('perks'); this.emit('learned'); this.emit('disc');
    if (this._welcome) { this._welcome.resolve(); this._welcome = null; }
    // tutorial for first-timers
    if (!this.tutorial && !this.app.profile.tutorialDone && this.settings.get('hintTips')) this.tutorial = new Tutorial(this, () => { this.app.profile.tutorialDone = true; api.saveProfile({ tutorialDone: true }).catch(() => {}); });
  }

  onDead(e) {
    this.dead = true; this.hud.showDeath(e); this.controls.k = {}; this.controls.mouse.l = false; this.controls.mouse.r = false;
    for (const u of [this.ui.inventory, this.ui.map, this.ui.skills, this.ui.team]) if (u && u.isOpen && u.isOpen()) u.close();
    this.uis.clear(); this.releaseLock();
  }
  onRespawned(e) {
    this.dead = false; this.hud.hideDeath(); this.controls.teleport(e.x, e.y, e.z); this.controls.k = {};
    this.requestLock();
  }

  // ---------------------------------------------------------------- combat & impact effects
  onHit(e) {
    const p = { x: e.x, y: e.y, z: e.z };
    const mine = e.eid === this.myEid;
    switch (e.k) {
      case 'node': {
        const t = e.nt || '';
        if (e.deny) { audio.sfx('hit_metal', p, 0.6); this.fx.hit('metal', e.x, e.y, e.z); break; }
        if (t.startsWith('tree') || t === 'cactus') { audio.sfx('chop', p, 1); this.fx.hit('wood', e.x, e.y, e.z); }
        else if (t === 'bush_berry' || t === 'fiber_plant') { audio.sfx('leaf', p, 0.8); this.fx.hit('leaf', e.x, e.y, e.z); }
        else { audio.sfx('mine', p, 1); this.fx.hit(t.startsWith('ore') ? 'metal' : 'stone', e.x, e.y, e.z); }
        if (mine) this.controls.vmKick = 0.6;
        break;
      }
      case 'player': case 'mob': audio.sfx('hit_flesh', p, 0.9); this.fx.hit('flesh', e.x, e.y, e.z); break;
      case 'piece': case 'dep': { const m = e.mat || 'wood'; audio.sfx(m === 'metal' ? 'hit_metal' : m === 'stone' ? 'hit_stone' : 'hit_wood', p, 0.9); this.fx.hit(m, e.x, e.y, e.z); break; }
      case 'terrain': audio.sfx('hit_dirt', p, 0.6); this.fx.hit('dirt', e.x, e.y, e.z); break;
      default: audio.sfx('hit_stone', p, 0.6); this.fx.hit('stone', e.x, e.y, e.z);
    }
  }
  onShot(e) {
    const mine = e.eid === this.myEid;
    let ox = e.o[0], oy = e.o[1], oz = e.o[2];
    const dirs = [];
    if (mine) {
      const cam = this.camera, d = new THREE.Vector3(); cam.getWorldDirection(d);
      const right = new THREE.Vector3().crossVectors(d, cam.up).normalize();
      ox = cam.position.x + d.x * 0.7 + right.x * 0.16; oy = cam.position.y + d.y * 0.7 - 0.11; oz = cam.position.z + d.z * 0.7 + right.z * 0.16;
      if (this.controls.thirdPerson) { ox = this.me.x; oy = this.me.y + 1.4; oz = this.me.z; }
    } else {
      const src = e.eid > 0 ? this.ent.players.get(e.eid) : null;
      const pos = { x: ox, y: oy, z: oz, ref: 30 };
      const name = e.w === 'bow' ? 'bow' : e.w === 'raider_gun' ? 'raider_gun' : e.w === 'turret' ? 'turret' : ITEMS[e.w]?.gun?.sound || 'smg';
      audio.sfx(name, pos, name === 'rifle' || name === 'shotgun' ? 1.5 : 1.1);
      if (e.w !== 'bow' && e.en[0]) { const [ex, ey, ez] = e.en[0]; this.fx.muzzle(ox, oy - 0.1, oz, (ex - ox) / 30, (ey - oy) / 30, (ez - oz) / 30, 0.7); }
    }
    for (const [ex, ey, ez, kind] of e.en) {
      const col = e.w === 'turret' ? '#ff8a6a' : e.w === 'raider_gun' ? '#ffd08a' : undefined;
      const from = mine ? { x: ox, y: oy, z: oz } : { x: ox, y: oy - 0.15, z: oz };
      this.fx.tracer(from.x, from.y, from.z, ex, ey, ez, e.en.length > 1 ? 0.06 : 0.1, col);
      if (kind !== 'air') this.fx.hit(kind === 'flesh' ? 'flesh' : kind === 'terrain' ? 'dirt' : kind, ex, ey, ez);
      if (kind === 'metal' || (kind === 'stone' && Math.random() < 0.3)) audio.sfx('ricochet', { x: ex, y: ey, z: ez }, 0.5);
      // near-miss whiz
      if (!mine) { const ax = ex - ox, ay = ey - oy, az = ez - oz, L2 = ax * ax + ay * ay + az * az || 1; const t = Math.max(0, Math.min(1, ((this.me.x - ox) * ax + (this.me.y + 1.5 - oy) * ay + (this.me.z - oz) * az) / L2)); const d = Math.hypot(ox + ax * t - this.me.x, oy + ay * t - (this.me.y + 1.5), oz + az * t - this.me.z); if (d < 3 && kind !== 'flesh') audio.sfx('bullet_whiz', { x: ox + ax * t, y: oy + ay * t, z: oz + az * t }, 0.7); }
    }
  }

  // ---------------------------------------------------------------- helpers
  stepSound(s) {
    const g = this.world.data, h = g.height(s.x, s.z);
    if (h < WATER_LEVEL - 0.05) return 'step_water';
    for (const b of this.pieces.boxesNear(s.x, s.z)) if (b.floor && Math.abs(b.maxy - s.y) < 0.4 && s.x >= b.minx && s.x <= b.maxx && s.z >= b.minz && s.z <= b.maxz) return ['step_wood', 'step_stone', 'step_stone'][b.piece.tier || 0];
    for (const b of g.staticAt(s.x, s.z)) if (Math.abs(b.maxy - s.y) < 0.4 && s.x >= b.minx && s.x <= b.maxx && s.z >= b.minz && s.z <= b.maxz) return 'step_wood';
    const bio = g.biome(s.x, s.z);
    return bio === BIOME.BEACH || bio === BIOME.DESERT ? 'step_sand' : bio === BIOME.TUNDRA ? 'step_snow' : bio === BIOME.HIGHLAND ? 'step_stone' : 'step_grass';
  }

  computeBench() {
    let t = 0;
    for (const d of this.ent.deps.values()) if ((d.type === 'workbench_1' || d.type === 'workbench_2') && Math.hypot(d.x - this.me.x, d.z - this.me.z) < 5) t = Math.max(t, d.type === 'workbench_2' ? 2 : 1);
    if (t !== this.state.benchTier) { this.state.benchTier = t; this.emit('inv'); }
  }

  // ---------------------------------------------------------------- frame
  frame(now) {
    let dt = (now - this.last) / 1000; this.last = now;
    dt = Math.min(dt, 0.1);
    if (!this.welcomed || !this.world) { this.renderer.render(this.scene, this.camera); return; }
    this.frameN++;
    // clock
    this.hour = (this.hour + (dt / (this.worldInfo.rules?.dayLength || 1200)) * 24) % 24;
    let dh = this.hourServer - this.hour; if (dh > 12) dh -= 24; if (dh < -12) dh += 24; this.hour = (this.hour + dh * Math.min(1, dt * 0.5) + 24) % 24;
    // local player
    this.controls.update(dt, this.camera);
    this.ix.update(dt);
    this.ent.update(dt, this.camera);
    if (this.frameN % 15 === 0) this.computeBench();
    // third person model
    const sm = this.selfModel;
    if (sm) {
      sm.visible = this.controls.thirdPerson && !this.dead;
      if (sm.visible) {
        const st = this.selfSt, c = this.controls, held = this.selItem();
        sm.position.set(this.me.x, this.me.y, this.me.z); sm.rotation.y = c.yaw;
        st.speed = this.me.speed || 0; st.time += dt; st.sprint = this.me.sprint; st.crouch = this.me.crouch; st.swim = this.me.swim; st.pitch = c.pitch; st.baseY = this.me.y; st.dead = false;
        st.holdKind = held ? holdKindOf(held.id) : 'none'; st.drawing = c.drawing; st.reloading = c.vmReload > 0; st.atkT = Math.max(0, (c.vmSwing > 0 ? c.vmSwing * 0.35 : 0) + (c.vmKick > 0.5 ? 0.1 : 0)); st.atkDur = 0.35;
        st.emote = c.emote && performance.now() < c.emoteUntil ? c.emote : '';
        const hid = held ? held.id : ''; if (sm.userData.heldId !== hid) { const P = sm.userData.parts; while (P.hand.children.length) P.hand.remove(P.hand.children[0]); if (hid) import('./models.js').then((M) => { const d = ITEMS[hid]; const h = M.buildHeld(d.hold || hid); P.hand.add(h); }); sm.userData.heldId = hid; }
        animateCharacter(sm, st, dt);
      }
    }
    this.world.update(dt, this.camera, this.hour, this.weather, this.locked);
    this.fx.update(dt);
    // storm lightning
    if (this.weather === 'storm') { this.thunderT -= dt; if (this.thunderT <= 0) { this.thunderT = 6 + Math.random() * 16; this.flashT = 0.35; setTimeout(() => audio.sfx('thunder', null, 0.9), 400 + Math.random() * 1500); } }
    if (this.flashT > 0) { this.flashT -= dt; this.world.hemi.intensity += this.flashT > 0.15 ? 3 : 1; this.world.sun.intensity += 1.5; }
    // underwater look
    if (this.underwater) { this.scene.fog.color.set('#1d6f8a'); this.scene.fog.near = 1; this.scene.fog.far = 28; this.scene.background.set('#1d6f8a'); }
    audio.setListener(this.camera.position.x, this.camera.position.y, this.camera.position.z, this.controls.yaw);
    audio.setNight(this.world.night || 0); audio.setUnderwater(this.underwater);
    if (this.frameN % 6 === 0) this.ambientTick(dt * 6);
    this.hud.update(dt, this.camera);
    this.hud.setClickToPlay(!this.locked && !this.uiBlocking() && !this.dead);
    if (this.ui.minimap) this.ui.minimap.draw(this.me.x, this.me.z, this.controls.yaw, dt);
    if (this.tutorial) this.tutorial.update(dt);
    this.renderer.render(this.scene, this.camera);
    // adaptive quality
    if (dt > 0.045) this.slowFrames++; else this.slowFrames = Math.max(0, this.slowFrames - 0.5);
    if (this.slowFrames > 120 && !this.autoLowered) { this.autoLowered = true; if (settings.get('shadows') !== 'off') { settings.set('shadows', 'off'); this.toast('Performance mode: shadows turned off. You can change this in Settings.', 'warn'); } else if (settings.get('viewDistance') > 240) { settings.set('viewDistance', 240); this.toast('Performance mode: view distance reduced.', 'warn'); } this.slowFrames = 0; setTimeout(() => { this.autoLowered = false; }, 15000); }
  }
  ambientTick(dt) {
    const d = this.world.data, x = this.me.x, z = this.me.z;
    const bio = d.biome(x, z);
    let waterDist = 99;
    for (const a of [0, 1.57, 3.14, 4.71]) for (const r of [8, 18, 32]) if (d.height(x + Math.cos(a) * r, z + Math.sin(a) * r) < WATER_LEVEL - 0.1) waterDist = Math.min(waterDist, r);
    const indoors = this.pieces.boxesNear(x, z).some((b) => b.floor && b.miny > this.me.y + 1.8 && b.miny < this.me.y + 5 && x >= b.minx && x <= b.maxx && z >= b.minz && z <= b.maxz);
    audio.updateAmbient(dt, { biome: ['sea', 'beach', 'meadow', 'forest', 'desert', 'tundra', 'highland'][bio], altitude: this.me.y, waterDist, indoors });
  }
}
