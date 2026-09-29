// In-game HUD: vitals, hotbar, compass, feed, chat, hit feedback, death screen, code pad, build bar.
import * as THREE from 'three';
import { ITEMS, HOTBAR } from '/shared/items.js';
import { PIECES, PIECE_ORDER, placeCost } from '/shared/building.js';
import { keyLabel } from './settings.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CAUSE = { fall: 'fell to their death', hunger: 'starved', thirst: 'died of thirst', cold: 'froze to death', heat: 'overheated', sickness: 'succumbed to sickness', suicide: 'gave up', thorns: 'was pricked to death', explosion: 'was blown up', turret: 'was shot by a turret', spikes: 'was impaled on spikes' };

export class Hud {
  constructor(game) {
    this.g = game;
    this.root = $('hud');
    this.bars = {};
    for (const k of ['hp', 'food', 'water', 'temp', 'stam']) { const el = this.root.querySelector('.vit.' + k); this.bars[k] = { fill: el.querySelector('.bar > i'), txt: el.querySelector('b'), el }; }
    this.hotbar = $('hotbar'); this.ammoEl = $('ammo'); this.feedEl = $('feed'); this.pickEl = $('pickups'); this.chatLog = $('chat-log'); this.chatIn = $('chat-input');
    this.compass = $('compass'); this.cc = document.createElement('canvas'); this.cc.width = 520; this.cc.height = 34; this.compass.insertBefore(this.cc, this.compass.firstChild);
    this.hitEl = $('hitmarker'); this.hurtEl = $('hurt-flash'); this.vig = $('vignette'); this.dmgRoot = $('dmg-numbers');
    this.netwarn = $('netwarn'); this.debugEl = $('debug'); this.topinfo = $('topinfo'); this.statuses = $('statuses'); this.scope = $('scope');
    this.clickPlay = document.createElement('div'); this.clickPlay.id = 'clickplay'; this.clickPlay.textContent = 'Click to play'; this.clickPlay.style.display = 'none'; this.root.appendChild(this.clickPlay);
    this.xp = $('xpbar'); this.buildbar = $('buildbar'); this.emoteWheel = $('emote-wheel');
    this.fps = 60; this.frames = 0; this.fpsT = 0; this.chatOpen = false; this.deathEl = null; this.lastHotKey = '';
    this.chatIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const v = this.chatIn.value.trim(); if (v) { const team = v.startsWith('/t ') ; game.net.send({ t: 'chat', text: team ? v.slice(3) : v, ch: team ? 'team' : 'all' }); } this.closeChat(); }
      else if (e.key === 'Escape') this.closeChat();
      e.stopPropagation();
    });
    this.chatIn.addEventListener('keyup', (e) => e.stopPropagation());
  }

  icon(id, cls = 'ico') { const m = this.g.iconMod; if (m) return m.iconHTML(id, cls); const d = ITEMS[id]; return `<i class="${cls}" style="background:${d ? d.color : '#888'};border-radius:8px"></i>`; }

  show() { this.root.classList.remove('hidden'); this.renderHotbar(); this.renderBuildBar(); }
  hide() { this.root.classList.add('hidden'); }

  // ------------------------------------------------------------- hotbar / ammo
  renderHotbar() {
    const g = this.g, inv = g.state.inv, sel = g.state.sel;
    let html = '';
    for (let i = 0; i < HOTBAR; i++) {
      const it = inv[i], d = it && ITEMS[it.id];
      html += `<div class="slot ${it ? 'filled' : ''} ${i === sel ? 'sel' : ''}" data-i="${i}"><span class="key">${i + 1}</span>`;
      if (it) {
        html += this.icon(it.id);
        if (it.n > 1) html += `<span class="cnt">${it.n}</span>`;
        if (d.gun && d.gun.mag > 1) html += `<span class="cnt" style="color:${it.ammo ? '#ffe9a8' : '#ff8a7a'}">${it.ammo}</span>`;
        if (it.dur != null && d.dur) html += `<span class="dur"><i style="width:${Math.max(0, it.dur / d.dur * 100)}%;background:${it.dur / d.dur < 0.25 ? '#e2554b' : ''}"></i></span>`;
      }
      html += '</div>';
    }
    if (html !== this.lastHotKey) { this.hotbar.innerHTML = html; this.lastHotKey = html; }
    this.updateAmmo();
    const it = inv[sel];
    this.selName = it ? ITEMS[it.id].name : '';
  }
  updateAmmo() {
    const g = this.g, it = g.selItem(), d = it && ITEMS[it.id];
    if (d && d.gun && d.gun.type === 'gun') {
      const reserve = g.countItem(d.gun.ammo);
      this.ammoEl.classList.remove('hidden');
      this.ammoEl.innerHTML = `<b class="${it.ammo === 0 ? 'empty' : ''}">${it.ammo}</b><span>/ ${reserve}</span><em>${ITEMS[d.gun.ammo].name}</em>${g.reloadingNow() ? '<u>RELOADING</u>' : ''}`;
    } else if (d && d.gun && d.gun.type === 'bow') {
      this.ammoEl.classList.remove('hidden'); this.ammoEl.innerHTML = `<b>${g.countItem('arrow')}</b><em>Arrows</em>`;
    } else this.ammoEl.classList.add('hidden');
    const kh = this.hotbar.querySelector('.slot.sel .cnt:last-of-type');
  }

  // ------------------------------------------------------------- build bar
  renderBuildBar() {
    const g = this.g;
    if (!g.ix) return;
    if (!g.ix.buildMode()) { this.buildbar.classList.add('hidden'); return; }
    this.buildbar.classList.remove('hidden');
    this.buildbar.innerHTML = PIECE_ORDER.map((t) => {
      const c = placeCost(t), cs = Object.entries(c).map(([k, v]) => `${v} ${ITEMS[k].name}`).join(', ');
      return `<div class="bp ${g.ix.bType === t ? 'on' : ''}" data-t="${t}"><div class="bg">${buildGlyph(t)}</div><b>${PIECES[t].name}</b><small>${cs}</small></div>`;
    }).join('');
    this.buildbar.querySelectorAll('.bp').forEach((el) => el.addEventListener('mousedown', (e) => { e.stopPropagation(); g.ix.setBuild(el.dataset.t); }));
  }

  // ------------------------------------------------------------- per-frame
  update(dt, cam) {
    const g = this.g, v = g.state.vit;
    const set = (k, val, max, txt, cls) => { const b = this.bars[k]; const p = Math.max(0, Math.min(1, val / max)); b.fill.style.width = p * 100 + '%'; b.txt.textContent = txt; b.el.classList.toggle('low', p < 0.25); };
    set('hp', v.hp, v.maxHp || 100, Math.ceil(v.hp)); set('food', v.food, 100, Math.ceil(v.food)); set('water', v.water, 100, Math.ceil(v.water));
    const tp = v.temp; set('temp', tp - 26, 14, tp.toFixed(1) + '°'); this.bars.temp.el.classList.toggle('cold', tp < 34.5); this.bars.temp.el.classList.toggle('hot', tp > 38.6);
    set('stam', v.stamina, v.maxSt || 100, Math.ceil(v.stamina));
    // xp
    const st = g.state; this.xp.querySelector('.lvl').textContent = st.level; this.xp.querySelector('.bar > i').style.width = (st.xpNext ? st.xp / st.xpNext * 100 : 0) + '%';
    this.xp.querySelector('span').textContent = `${st.xp} / ${st.xpNext} XP` + (st.points ? `  ·  ${st.points} skill point${st.points > 1 ? 's' : ''} (K)` : '');
    // low health vignette
    const low = v.hp / (v.maxHp || 100) < 0.3;
    this.vig.style.opacity = low ? 0.35 + Math.sin(performance.now() / 260) * 0.2 : g.underwater ? 0.5 : (v.temp < 33 ? 0.28 : 0);
    this.vig.style.background = g.underwater ? 'radial-gradient(transparent, rgba(20,80,120,.7))' : (v.temp < 33 ? 'radial-gradient(transparent 40%, rgba(120,190,255,.55))' : 'radial-gradient(transparent 40%, rgba(180,10,10,.75))');
    // compass
    this.drawCompass(g.me.yaw);
    // top info
    const h = g.hour, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    this.topinfo.innerHTML = `<b>Day ${g.worldInfo.day || 1}</b> · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${g.weatherLabel()}${g.net.rtt > 0 ? ` · <span class="${g.net.rtt > 220 ? 'bad' : g.net.rtt > 120 ? 'warn' : ''}">${Math.round(g.net.rtt)} ms</span>` : ''}`;
    // statuses
    const chips = [];
    if (v.food < 20) chips.push('<span class="chip bad">Hungry</span>'); if (v.water < 20) chips.push('<span class="chip bad">Thirsty</span>');
    if (v.temp < 34.5) chips.push('<span class="chip cold">Cold</span>'); if (v.temp > 38.6) chips.push('<span class="chip hot">Hot</span>');
    if (g.state.spawnPro) chips.push('<span class="chip good">Protected</span>'); if (g.me.swim) chips.push('<span class="chip cold">Swimming</span>');
    if (g.state.craftQ.length) { const c = g.state.craftQ[0]; chips.push(`<span class="chip">Crafting ${ITEMS[c.out || ''] ? '' : ''}×${c.n}</span>`); }
    const chipHtml = chips.join(''); if (chipHtml !== this.lastChips) { this.statuses.innerHTML = chipHtml; this.lastChips = chipHtml; }
    // reloading label refresh
    if (this.g.reloadingNow() !== this.lastReload) { this.lastReload = this.g.reloadingNow(); this.updateAmmo(); }
    // fps + debug
    this.frames++; this.fpsT += dt;
    if (this.fpsT >= 0.5) {
      this.fps = this.frames / this.fpsT; this.frames = 0; this.fpsT = 0;
      if (!this.debugEl.classList.contains('hidden') || require_setting('showFps')) {
        const inf = g.renderer.info;
        this.debugEl.classList.remove('hidden');
        this.debugEl.innerHTML = `FPS ${this.fps.toFixed(0)} · ping ${Math.round(g.net.rtt)}ms<br>pos ${g.me.x.toFixed(1)}, ${g.me.y.toFixed(1)}, ${g.me.z.toFixed(1)}<br>draw ${inf.render.calls} · tris ${(inf.render.triangles / 1000).toFixed(0)}k · chunks ${g.world.chunks.size}<br>players ${g.ent.players.size} · mobs ${g.ent.mobs.size} · pieces ${g.ent.pieces.size}<br>seed ${esc(g.worldInfo.seed)}`;
      }
    }
    // netwarn
    const silent = g.net.silentFor();
    if (g.netState === 'reconnecting') this.showNetwarn(`Connection lost — reconnecting… (attempt ${g.netAttempt})`);
    else if (g.net.joined && silent > 2500) this.showNetwarn('Waiting for server…');
    else this.netwarn.classList.add('hidden');
    // damage numbers
    for (const dn of [...this.dmgRoot.children]) { const t = (performance.now() - dn._t0) / 900; if (t > 1) { dn.remove(); continue; } const p = dn._p.clone(); p.y += t * 1.2; p.project(cam); dn.style.transform = `translate(${(p.x * 0.5 + 0.5) * innerWidth}px, ${(-p.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-50%)`; dn.style.opacity = 1 - t * t; dn.style.display = p.z > 1 ? 'none' : 'block'; }
  }
  setClickToPlay(on) { const v = on ? '' : 'none'; if (this.clickPlay.style.display !== v) this.clickPlay.style.display = v; }
  showNetwarn(t) { this.netwarn.textContent = t; this.netwarn.classList.remove('hidden'); }

  drawCompass(yaw) {
    const c = this.cc, x = c.getContext('2d'), W = c.width, H = c.height;
    x.clearRect(0, 0, W, H);
    // heading: yaw 0 faces -Z = North. bearing = -yaw (degrees, clockwise from N)
    let bearing = (-yaw * 180 / Math.PI) % 360; if (bearing < 0) bearing += 360;
    const pxPer = 4.2;
    x.font = 'bold 15px "Trebuchet MS", sans-serif'; x.textAlign = 'center';
    for (let a = -70; a <= 70; a += 5) {
      const deg = Math.round((bearing + a) / 5) * 5; const off = deg - bearing; const px = W / 2 + off * pxPer;
      if (px < 0 || px > W) continue;
      const d = ((deg % 360) + 360) % 360;
      const fade = 1 - Math.abs(off) / 80;
      x.globalAlpha = Math.max(0, fade);
      if (d % 45 === 0) { const l = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[d]; x.fillStyle = d === 0 ? '#ff8a3c' : '#f3ecd9'; x.fillText(l, px, 16); }
      else if (d % 15 === 0) { x.fillStyle = 'rgba(243,236,217,.7)'; x.fillRect(px - 0.5, 20, 1.5, 7); if (d % 30 === 0) { x.font = '11px sans-serif'; x.fillText(d, px, 15); x.font = 'bold 15px "Trebuchet MS", sans-serif'; } }
    }
    x.globalAlpha = 1;
    const wp = this.g.state.waypoint;
    if (wp) {
      const dx = wp.x - this.g.me.x, dz = wp.z - this.g.me.z; let b = Math.atan2(dx, -dz) * 180 / Math.PI; let off = b - bearing; while (off > 180) off -= 360; while (off < -180) off += 360;
      const px = W / 2 + Math.max(-75, Math.min(75, off)) * pxPer;
      x.fillStyle = '#5cc0e8'; x.beginPath(); x.moveTo(px, 26); x.lineTo(px - 7, 12); x.lineTo(px + 7, 12); x.closePath(); x.fill();
      x.fillStyle = '#fff'; x.font = '11px sans-serif'; x.fillText(Math.round(Math.hypot(dx, dz)) + 'm', px, 8);
    }
  }

  // ------------------------------------------------------------- feedback
  hitMarker(head, kill) {
    this.hitEl.className = ''; void this.hitEl.offsetWidth; this.hitEl.className = 'on' + (head ? ' head' : '') + (kill ? ' kill' : '');
  }
  damageNumber(pos, dmg, head) {
    if (!require_setting('damageNumbers')) return;
    const e = document.createElement('div'); e.className = 'dn' + (head ? ' head' : ''); e.textContent = dmg; e._p = pos.clone(); e._t0 = performance.now(); this.dmgRoot.appendChild(e);
  }
  hurt(angle) {
    const e = document.createElement('div'); e.className = 'hurt-dir';
    if (angle !== undefined) e.style.transform = `rotate(${angle}rad)`; else e.classList.add('all');
    this.hurtEl.appendChild(e); setTimeout(() => e.remove(), 700);
  }
  pickup(id, n) {
    const d = ITEMS[id]; if (!d) return;
    const last = this.pickEl.lastElementChild;
    if (last && last._id === id && performance.now() - last._t < 1500) { last._n += n; last.querySelector('b').textContent = `+${last._n}`; last._t = performance.now(); return; }
    const e = document.createElement('div'); e.className = 'pk'; e._id = id; e._n = n; e._t = performance.now();
    e.innerHTML = `${this.icon(id)}<b>+${n}</b><span>${d.name}</span>`; this.pickEl.appendChild(e);
    while (this.pickEl.children.length > 5) this.pickEl.firstElementChild.remove();
    setTimeout(() => e.remove(), 2600);
  }
  feedLine(html, cls = '') { const e = document.createElement('div'); e.className = 'fl ' + cls; e.innerHTML = html; this.feedEl.appendChild(e); while (this.feedEl.children.length > 6) this.feedEl.firstElementChild.remove(); setTimeout(() => e.remove(), 7000); }
  killFeed(ev) {
    const me = this.g.me.name;
    const w = ev.weapon && ITEMS[ev.weapon] ? ` <i>with ${esc(ITEMS[ev.weapon].name)}</i>` : '';
    const v = `<b class="${ev.victim === me ? 'me' : ''}">${esc(ev.victim)}</b>`;
    if (ev.killer) this.feedLine(`<b class="${ev.killer === me ? 'me' : ''}">${esc(ev.killer)}</b> ☠ ${v}${w}`, ev.killer === me || ev.victim === me ? 'mine' : '');
    else this.feedLine(`${v} ${CAUSE[ev.cause] || 'died'}`);
  }
  setScope(on) { if (this.scopeOn !== on) { this.scopeOn = on; this.scope.classList.toggle('hidden', !on); $('crosshair').style.opacity = on ? 0 : 1; } }

  // ------------------------------------------------------------- chat
  chatMsg(m) {
    const e = document.createElement('div'); e.className = 'cm ' + (m.ch || 'all');
    if (m.ch === 'sys') e.innerHTML = `<span class="sys">${esc(m.text)}</span>`;
    else if (m.ch === 'announce') e.innerHTML = `<span class="ann">📢 ${esc(m.text)}</span>`;
    else e.innerHTML = m.me ? `<i>* ${esc(m.from)} ${esc(m.text)}</i>` : `${m.ch === 'team' ? '<em>[Team]</em> ' : ''}<b>${esc(m.from)}</b>: ${esc(m.text)}`;
    this.chatLog.appendChild(e);
    while (this.chatLog.children.length > 60) this.chatLog.firstElementChild.remove();
    this.chatLog.scrollTop = 1e6;
    e._t = performance.now(); setTimeout(() => e.classList.add('old'), 9000);
    if (m.ch !== 'sys') this.g.audio.sfx('chat', null, 0.6);
  }
  openChat(prefill = '') { this.chatOpen = true; this.chatLog.classList.add('open'); this.chatIn.classList.remove('hidden'); this.chatIn.value = prefill; this.chatIn.focus(); }
  closeChat() { this.chatOpen = false; this.chatIn.classList.add('hidden'); this.chatIn.blur(); this.chatLog.classList.remove('open'); this.g.requestLock(); }

  // ------------------------------------------------------------- debug / emotes
  toggleDebug() { this.debugEl.classList.toggle('hidden'); if (this.debugEl.classList.contains('hidden')) this.debugEl.innerHTML = ''; }
  toggleEmoteWheel() {
    if (!this.emoteWheel.classList.contains('hidden')) { this.emoteWheel.classList.add('hidden'); return; }
    const list = [['wave', '👋', 'Wave'], ['cheer', '🙌', 'Cheer'], ['dance', '💃', 'Dance'], ['sit', '🪑', 'Sit'], ['point', '👉', 'Point']];
    this.emoteWheel.innerHTML = list.map(([id, ic, n]) => `<button data-e="${id}"><span>${ic}</span>${n}</button>`).join('');
    this.emoteWheel.classList.remove('hidden');
    this.emoteWheel.querySelectorAll('button').forEach((b) => b.addEventListener('mousedown', (e) => { e.stopPropagation(); this.g.controls.emote = b.dataset.e; this.g.controls.emoteUntil = performance.now() + 4500; this.emoteWheel.classList.add('hidden'); }));
    setTimeout(() => this.emoteWheel.classList.add('hidden'), 4000);
  }

  // ------------------------------------------------------------- code pad
  codePad({ title, onSubmit }) {
    const g = this.g;
    g.releaseLock();
    const back = document.createElement('div'); back.className = 'modal-back'; back.style.zIndex = 400;
    let code = '';
    back.innerHTML = `<div class="panel codepad"><div class="panel-h">${esc(title)}</div><div class="cp-screen">····</div><div class="cp-grid">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '✔'].map((k) => `<button class="btn" data-k="${k}">${k}</button>`).join('')}</div><div class="cp-foot"><button class="btn ghost small" data-k="X">Cancel</button></div></div>`;
    $('overlay-root').appendChild(back);
    g.modalOpen = (g.modalOpen || 0) + 1;
    const scr = back.querySelector('.cp-screen');
    const draw = () => { scr.textContent = (code + '····').slice(0, 4).split('').map((c, i) => (i < code.length ? '●' : '·')).join(' '); };
    const close = () => { back.remove(); g.modalOpen--; document.removeEventListener('keydown', kd, true); g.requestLock(); };
    const press = (k) => {
      g.audio.ui('tick');
      if (k === 'X') return close();
      if (k === 'C') { code = ''; return draw(); }
      if (k === '✔') { if (code.length === 4) { onSubmit(code); close(); } return; }
      if (code.length < 4) code += k; draw();
      if (code.length === 4 && title.startsWith('Enter')) { onSubmit(code); close(); }
    };
    const kd = (e) => { e.stopPropagation(); if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') { code = code.slice(0, -1); draw(); } else if (e.key === 'Enter') press('✔'); else if (e.key === 'Escape') close(); e.preventDefault(); };
    document.addEventListener('keydown', kd, true);
    back.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => press(b.dataset.k)));
    draw();
  }

  // ------------------------------------------------------------- death
  showDeath(info) {
    this.g.releaseLock();
    const bags = info.bags || [];
    const el = document.createElement('div'); el.className = 'death';
    const why = info.killer ? `Killed by <b>${esc(info.killer)}</b>` : `You ${CAUSE[info.cause] || 'died'}`;
    el.innerHTML = `<div class="dc"><h1>YOU DIED</h1><p>${why}</p><div class="dbtns"><button class="btn primary big" data-b="0" disabled>Respawn at the coast <span class="cd">3</span></button>${bags.map((b) => `<button class="btn big" data-b="${b.id}" ${b.cd ? 'disabled' : ''}>Sleeping bag · ${b.x}, ${b.z}${b.cd ? ` (${b.cd}s)` : ''}</button>`).join('')}</div><small>${this.g.worldInfo.rules?.deathDrop === 'all' ? 'Your belongings are in a loot bag where you fell — it lasts 15 minutes.' : 'You keep your items on this server.'}</small></div>`;
    $('overlay-root').appendChild(el); this.deathEl = el; this.g.audio.sfx('death');
    let left = 3; const cd = el.querySelector('.cd');
    const iv = setInterval(() => { left--; if (left <= 0) { clearInterval(iv); el.querySelectorAll('button').forEach((b) => { if (!b.textContent.includes('(')) b.disabled = false; }); cd.remove(); } else cd.textContent = left; }, 1000);
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { this.g.net.send({ t: 'respawn', bag: +b.dataset.b }); this.g.audio.ui('click'); }));
  }
  hideDeath() { if (this.deathEl) { this.deathEl.remove(); this.deathEl = null; } }
}

const _settings = () => import('./settings.js');
let _sv = null; _settings().then((m) => { _sv = m.settings; });
function require_setting(k) { return _sv ? _sv.get(k) : false; }

function buildGlyph(t) {
  const c = '#e8b26a', s = '#7a5a34';
  const svg = {
    foundation: `<path d="M8 40 L32 50 L56 40 L32 30Z" fill="${c}"/><path d="M8 40 v8 L32 58 v-8Z" fill="${s}"/><path d="M56 40 v8 L32 58 v-8Z" fill="#a17a48"/>`,
    wall: `<rect x="10" y="12" width="44" height="40" rx="2" fill="${c}"/><path d="M10 26h44M10 40h44M28 12v14M40 26v14M22 40v12" stroke="${s}" stroke-width="2"/>`,
    doorway: `<path d="M10 12h44v40H40V26H24v26H10z" fill="${c}"/><path d="M10 26h14M40 26h14" stroke="${s}" stroke-width="2"/>`,
    window: `<path d="M10 12h44v40H10z" fill="${c}"/><rect x="22" y="22" width="20" height="16" fill="#2a3a44"/><path d="M32 22v16M22 30h20" stroke="${c}" stroke-width="2"/>`,
    door: `<rect x="18" y="8" width="28" height="46" rx="2" fill="#a17a48"/><path d="M18 22h28M18 38h28" stroke="${s}" stroke-width="2"/><circle cx="40" cy="32" r="2.5" fill="#f2c94c"/>`,
    floor: `<path d="M8 34 L32 44 L56 34 L32 24Z" fill="${c}"/><path d="M8 34 v4 L32 48 v-4Z" fill="${s}"/><path d="M56 34 v4 L32 48 v-4Z" fill="#a17a48"/>`,
    stairs: `<path d="M8 50h48v-8H44v-8H32v-8H20v-8H8z" fill="${c}"/><path d="M8 50h48" stroke="${s}" stroke-width="3"/>`,
  }[t] || '';
  return `<svg viewBox="0 0 64 64">${svg}</svg>`;
}
