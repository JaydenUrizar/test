// Emberwild menus — login, main menu, server browser, hosting, character creator, settings, controls, pause & dialogs.
// Public API: initMenus(app) -> { show, hide, showPause, joinInvite, showConnecting, showError }
import { backend } from '../backend.js';
import { Backdrop } from './menus/backdrop.js';
import { CharacterPreview } from './menus/preview.js';
import { serverScreens } from './menus/servers.js';
import { characterScreen } from './menus/character.js';
import { settingsScreens } from './menus/settings.js';
import { $, $$, el, esc, icon, logoHTML, flameSVG, DEFS_SVG, friendly, fmtDuration, copyText, serverTagsHTML, ruleChipsHTML } from './menus/util.js';

const NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_ .-]{1,14}[A-Za-z0-9_]$/;
const TIPS = [
  'Nights are cold. Keep a campfire lit and stay close to its warmth.',
  'Same seed, same world — share a seed with friends to explore the same island.',
  'Gather wood and stone first, then craft a hatchet, pickaxe and workbench.',
  'Private servers are invite-only. Share your invite link and nobody else can find you.',
  'Team up: friends on your team appear on the map and the compass.',
  'Food, water and warmth all drain over time. Keep an eye on your vitals.',
  'Rebind every key from the Controls screen — swap keys with a single press.',
];

export function initMenus(app) {
  const mount = document.getElementById('screen-root') || document.body;
  mount.querySelectorAll(':scope > .mn-root').forEach((n) => n.remove());
  const root = el(`<div class="mn-root off">${DEFS_SVG}<div class="mn-stage"></div><div class="mn-modals"></div></div>`);
  mount.appendChild(root);
  const stage = $('.mn-stage', root), modalLayer = $('.mn-modals', root);
  const backdrop = new Backdrop(root); root.prepend(backdrop.el);

  const state = { cur: null, inGame: false, pauseOpts: null, pending: null, pausedAt: 0, capturing: false, modals: [], connText: '' };
  const api = () => app.api;
  const sfx = (n) => { try { app.audio && app.audio.ui && app.audio.ui(n); } catch {} };
  const toast = (t, k) => { try { app.toast(t, k); } catch {} };

  // ------------------------------------------------------------------ modals
  function modal({ title = '', body = '', buttons = [], cls = '', icon: ic = '', onClose, dismiss = true }) {
    const back = el(`<div class="modal-back mn-modal-back"><form class="modal panel mn-modal ${cls}" role="dialog" aria-modal="true" novalidate>
      <div class="panel-h"><span class="mn-modal-title">${ic}${esc(title)}</span>${dismiss ? `<button type="button" class="mn-x" aria-label="Close">${icon('close')}</button>` : ''}</div>
      <div class="body"></div><div class="mn-modal-foot"></div></form></div>`);
    const form = $('form', back), bodyEl = $('.body', back), foot = $('.mn-modal-foot', back);
    if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.appendChild(body);
    const m = { el: back, form, body: bodyEl, closed: false, busy: false };
    m.close = (val) => { if (m.closed) return; m.closed = true; back.remove(); state.modals = state.modals.filter((x) => x !== m); if (prevFocus && prevFocus.isConnected) try { prevFocus.focus(); } catch {} onClose && onClose(val); };
    m.dismiss = () => { if (dismiss && !m.busy) m.close('dismiss'); };
    const prevFocus = document.activeElement;
    let primary = null;
    buttons.forEach((b) => {
      const btn = el(`<button type="${b.primary ? 'submit' : 'button'}" class="btn ${b.primary ? 'primary' : ''} ${b.kind || ''}">${b.label}</button>`);
      if (b.primary) primary = btn;
      btn.addEventListener('click', async (e) => {
        if (b.primary) e.preventDefault();
        if (!b.onClick) { m.close(b.value); return; }
        if (m.busy) return;
        m.busy = true; btn.disabled = true;
        let r; try { r = await b.onClick(m); } catch (err) { r = false; toast(friendly(err), 'bad'); }
        m.busy = false; btn.disabled = false;
        if (r !== false) m.close(b.value);
      });
      foot.appendChild(btn);
    });
    form.addEventListener('submit', (e) => { e.preventDefault(); primary && primary.click(); });
    back.addEventListener('mousedown', (e) => { if (e.target === back) m.dismiss(); });
    if (!buttons.length) foot.remove();
    $('.mn-x', back)?.addEventListener('click', () => m.dismiss());
    modalLayer.appendChild(back); state.modals.push(m);
    root.classList.remove('off');
    setTimeout(() => { const f = $('input:not([type=hidden]),select', bodyEl) || primary || $('.btn', back); f && f.focus && f.focus(); }, 30);
    return m;
  }
  const confirmBox = ({ title, text, ok = 'Confirm', danger = false, cancel = 'Cancel' }) => new Promise((res) => {
    modal({ title, body: `<p class="mn-p">${text}</p>`, cls: 'small', onClose: (v) => res(v === true),
      buttons: [{ label: cancel, kind: 'ghost', value: false }, { label: ok, primary: true, kind: danger ? 'danger' : '', value: true }] });
  });

  // ------------------------------------------------------------------ joining
  function passwordPrompt(s) {
    return new Promise((res) => {
      let out = null;
      const body = el(`<div><p class="mn-p"><b>${esc(s.name)}</b> is protected by a password.</p><label class="field" for="mn-pw">Server password</label><input id="mn-pw" class="input" type="password" maxlength="100" autocomplete="off"><div class="mn-err" role="alert"></div></div>`);
      modal({ title: 'Password required', body, cls: 'small', icon: icon('lock', 'sm'), onClose: () => res(out),
        buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Join', primary: true, onClick: (m) => { const v = $('input', body).value; if (!v) { $('.mn-err', body).textContent = 'Enter the server password.'; return false; } out = v; } }] });
    });
  }
  async function joinServer(s, extra = {}) {
    if (s.players >= s.maxPlayers) { sfx('error'); toast('That server is full right now.', 'warn'); return; }
    let password;
    if (s.hasPassword && !s.mine) { password = await passwordPrompt(s); if (password == null) return; }
    sfx('success');
    const invite = extra.invite ?? (s.mine ? s.invite : undefined);
    app.play(s, { password, invite });
  }
  function cleanUrl() { try { const u = new URL(location.href); if (u.searchParams.has('join')) { u.searchParams.delete('join'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); } } catch {} }

  async function joinInvite(code) {
    code = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    cleanUrl();
    if (!code) return;
    if (!app.profile) { state.pending = code; show('login'); return; }
    if (!state.cur || state.cur.name === 'login') show('main');
    const wait = modal({ title: 'Invite', body: `<div class="mn-wait"><span class="mn-spin"></span> Looking up invite <b>${esc(code)}</b>…</div>`, cls: 'small', dismiss: true });
    let r;
    try { r = await api().lookupInvite(code); } catch (e) { wait.close(); sfx('error'); showError('Invite not found', friendly(e, 'That invite code does not match any server.')); return; }
    if (wait.closed) return; // user cancelled
    wait.close();
    const s = r.server;
    const body = el(`<div class="mn-invite"><p class="mn-p">You've been invited to join</p><h3 class="mn-invite-name">${esc(s.name)}</h3><div class="mn-tags">${serverTagsHTML(s)}</div>
      ${s.desc ? `<p class="mn-p muted">${esc(s.desc)}</p>` : ''}
      <div class="mn-stats"><div><span>Players</span><b>${s.players}/${s.maxPlayers}</b></div><div><span>Host</span><b>${esc(s.owner)}</b></div><div><span>Seed</span><b>${esc(s.seed)}</b></div><div><span>World day</span><b>${s.day ? 'Day ' + s.day : 'Not started'}</b></div></div>
      <div class="mn-rules">${ruleChipsHTML(s.rules)}</div>${s.hasPassword ? `<p class="mn-p muted">${icon('lock', 'sm')} This server also needs its password.</p>` : ''}</div>`);
    modal({ title: 'Server invite', body, icon: icon('link', 'sm'), buttons: [{ label: 'Not now', kind: 'ghost' }, { label: 'Join server', primary: true, onClick: () => { joinServer(s, { invite: r.invite || code }); } }] });
  }

  // ------------------------------------------------------------------ core context shared with screen modules
  const ctx = {
    app, root, stage, sfx, toast, modal, confirmBox, joinServer, joinInvite, copyText,
    get api() { return app.api; }, get settings() { return app.settings; },
    show: (n, a) => show(n, a), back: () => goBack(), backTarget: () => (state.inGame ? 'pause' : 'main'),
    setCapturing: (v) => { state.capturing = v; },
    async copy(text, what = 'Copied') { const ok = await copyText(text); sfx(ok ? 'success' : 'error'); toast(ok ? `${what} copied to clipboard` : 'Could not copy — select the text and press Ctrl+C', ok ? 'good' : 'warn'); return ok; },
    get inGame() { return state.inGame; },
  };
  const modules = { ...serverScreens(ctx), character: characterScreen(ctx), ...settingsScreens(ctx) };

  // ------------------------------------------------------------------ screens: login / main / pause / credits / connecting
  function loginScreen(arg) {
    const startTab = arg && arg.tab === 'register' ? 'register' : 'login';
    let tab = startTab, busy = false, lastName = '';
    try { lastName = localStorage.getItem('emberwild.lastName') || ''; } catch {}
    const node = el(`<div class="mn-screen mn-login"><div class="mn-center">${logoHTML('big')}
      <form class="panel mn-auth" novalidate>
        <div class="tabs" role="tablist"><button type="button" class="tab" role="tab" data-tab="login">Sign in</button><button type="button" class="tab" role="tab" data-tab="register">Create account</button></div>
        <div class="body">
          ${state.pending ? `<div class="mn-banner">${icon('link', 'sm')}<span>You've been invited to a server. Sign in or create an account to continue.</span></div>` : ''}
          <label class="field" for="mn-name">Explorer name</label>
          <input id="mn-name" class="input" name="name" maxlength="16" autocomplete="username" spellcheck="false" placeholder="e.g. Ember_Fox" value="${esc(lastName)}">
          <label class="field" for="mn-pass">Password</label>
          <div class="mn-pw"><input id="mn-pass" class="input" name="password" type="password" maxlength="100" autocomplete="current-password" placeholder="At least 6 characters"><button type="button" class="mn-eye" aria-label="Show password" tabindex="-1">${icon('eye')}</button></div>
          <div class="mn-confirm"><label class="field" for="mn-pass2">Confirm password</label><input id="mn-pass2" class="input" name="password2" type="password" maxlength="100" autocomplete="new-password"></div>
          <div class="mn-err" role="alert" aria-live="polite"></div>
          <button class="btn primary big mn-submit" type="submit"></button>
          <p class="mn-hint"></p>
        </div></form>
      ${backend.mode === 'local' ? `<div class="mn-banner">${icon('link', 'sm')}<span><b>Offline mode</b> — the game server runs inside this browser tab (single-player). Your account, characters and worlds are saved in this browser only.${backend.persisted ? '' : ' <b>Storage is blocked here, so progress will not persist.</b>'}${backend.reason ? ' ' + esc(backend.reason) : ''}</span></div>` : ''}
      <div class="mn-foot-note">Free to play · runs in your browser · ${esc(backend.label)}</div></div></div>`);
    const form = $('form', node), err = $('.mn-err', node), submit = $('.mn-submit', node), name = $('[name=name]', node), pass = $('[name=password]', node), pass2 = $('[name=password2]', node), hint = $('.mn-hint', node);
    const setTab = (t) => {
      tab = t; err.textContent = '';
      $$('.tab', node).forEach((b) => { const on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      form.classList.toggle('reg', t === 'register');
      submit.textContent = t === 'login' ? 'Sign in' : 'Create account';
      pass.autocomplete = t === 'login' ? 'current-password' : 'new-password';
      hint.textContent = t === 'login' ? 'New here? Create an account in a few seconds — no email needed.' : 'Names are 3–16 characters (letters, numbers, spaces, _ - .). Your name is what other players see.';
    };
    $$('.tab', node).forEach((b) => b.addEventListener('click', () => { setTab(b.dataset.tab); (name.value ? pass : name).focus(); }));
    $('.mn-eye', node).addEventListener('click', (e) => { const show = pass.type === 'password'; pass.type = show ? 'text' : 'password'; pass2.type = pass.type; e.currentTarget.innerHTML = icon(show ? 'eyeoff' : 'eye'); e.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); });
    const fail = (msg, field) => { err.textContent = msg; err.classList.remove('shake'); void err.offsetWidth; err.classList.add('shake'); sfx('error'); form.classList.remove('bad'); void form.offsetWidth; form.classList.add('bad'); field && field.focus(); };
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); if (busy) return;
      const n = name.value.trim().replace(/\s+/g, ' '), pw = pass.value;
      if (!n) return fail('Enter your explorer name.', name);
      if (tab === 'register' && !NAME_RE.test(n)) return fail('Name must be 3–16 characters: letters, numbers, spaces, _ - .', name);
      if (!pw) return fail('Enter your password.', pass);
      if (tab === 'register') {
        if (pw.length < 6) return fail('Password must be at least 6 characters.', pass);
        if (pw !== pass2.value) return fail("The two passwords don't match.", pass2);
      }
      busy = true; err.textContent = ''; submit.disabled = true; submit.innerHTML = `<span class="mn-spin dark"></span> ${tab === 'login' ? 'Signing in…' : 'Creating account…'}`;
      try {
        const profile = tab === 'login' ? await api().login(n, pw) : await api().register(n, pw);
        try { localStorage.setItem('emberwild.lastName', profile.name || n); } catch {}
        sfx('success');
        app.profile = profile;
        if (typeof app.onLoggedIn === 'function') app.onLoggedIn(profile); else show('main');
      } catch (ex) {
        busy = false; submit.disabled = false; setTab(tab);
        fail(friendly(ex, tab === 'login' ? 'Could not sign in.' : 'Could not create your account.'), tab === 'login' ? pass : name);
      }
    });
    setTab(startTab);
    setTimeout(() => (name.value ? pass : name).focus(), 60);
    return { el: node, back: null };
  }

  function mainScreen() {
    const p = app.profile || {};
    const node = el(`<div class="mn-screen mn-main">
      <div class="mn-main-left">${logoHTML('big')}
        <nav class="mn-menu" aria-label="Main menu">
          <button class="btn primary big mn-mbtn" data-go="servers">${icon('play')}<span>Play</span></button>
          <button class="btn mn-mbtn" data-go="host">${icon('host')}<span>Host a Server</span></button>
          <button class="btn mn-mbtn" data-go="character">${icon('user')}<span>Character</span></button>
          <div class="mn-menu-row">
            <button class="btn mn-mbtn" data-go="settings">${icon('gear')}<span>Settings</span></button>
            <button class="btn mn-mbtn" data-go="controls">${icon('keyboard')}<span>Controls</span></button>
          </div>
          <button class="btn ghost mn-mbtn sm" data-go="credits">${icon('star')}<span>Credits</span></button>
        </nav>
      </div>
      <div class="mn-main-right"><div class="mn-hero"></div>
        <div class="mn-you"><div class="mn-you-name">${esc(p.name || 'Explorer')}</div><div class="mn-you-sub">${p.playSeconds ? 'Played ' + fmtDuration(p.playSeconds) : 'Ready for your first night'}</div>
          <div class="mn-you-btns"><button class="btn small ghost" data-go="character">${icon('user', 'sm')} Edit look</button><button class="btn small ghost" data-act="logout">${icon('logout', 'sm')} Log out</button></div></div>
      </div>
      <div class="mn-tip"><span class="mn-tip-i">${icon('bulb', 'sm')}</span><span class="mn-tip-t"></span></div></div>`);
    $$('[data-go]', node).forEach((b) => b.addEventListener('click', () => show(b.dataset.go)));
    $('[data-act=logout]', node).addEventListener('click', async () => {
      await api().logout(); app.profile = null; try { app.onLoggedOut && app.onLoggedOut(); } catch {}
      toast('Signed out. See you in the wild!'); show('login');
    });
    const hero = $('.mn-hero', node);
    const preview = new CharacterPreview(hero, { appearance: p.appearance || {}, campfire: true, sway: true, autoRotate: false });
    let ti = Math.floor(Math.random() * TIPS.length); const tipT = $('.mn-tip-t', node);
    const setTip = () => { tipT.classList.remove('in'); void tipT.offsetWidth; tipT.textContent = TIPS[ti++ % TIPS.length]; tipT.classList.add('in'); };
    setTip(); const tipTimer = setInterval(setTip, 8000);
    const menu = $('.mn-menu', node);
    const onKey = (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const bs = $$('.mn-mbtn', menu), i = bs.indexOf(document.activeElement);
      e.preventDefault(); bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus();
    };
    menu.addEventListener('keydown', onKey);
    setTimeout(() => { if (!state.modals.length) $('.mn-mbtn', node)?.focus(); }, 80);
    return { el: node, back: null, destroy() { preview.destroy(); clearInterval(tipTimer); } };
  }

  function pauseScreen() {
    const gi = (app.game && app.game.worldInfo) || null;
    const info = gi ? `<div class="mn-stats"><div><span>World</span><b>${esc(gi.name || '—')}</b></div><div><span>Seed</span><b>${esc(gi.seed ?? '—')}</b></div><div><span>Day</span><b>${gi.day ? 'Day ' + gi.day : '—'}</b></div></div>
       ${gi.invite ? `<div class="mn-invite-mini"><span>Invite code</span><b>${esc(gi.invite)}</b><button type="button" class="btn small ghost" data-act="copyinv">${icon('copy', 'sm')} Copy link</button></div>` : ''}` : '';
    const node = el(`<div class="mn-screen mn-pause"><div class="panel mn-pause-card"><div class="mn-pause-h">${flameSVG('sm')}<h2>Paused</h2></div>${info}
      <div class="mn-pause-btns">
        <button class="btn primary big" data-act="resume">${icon('play')}<span>Resume</span></button>
        <button class="btn" data-go="settings">${icon('gear')}<span>Settings</span></button>
        <button class="btn" data-go="controls">${icon('keyboard')}<span>Controls</span></button>
        <button class="btn danger" data-act="leave">${icon('logout')}<span>Leave server</span></button>
      </div></div></div>`);
    const o = state.pauseOpts || {};
    const resume = () => { hide(); o.onResume && o.onResume(); };
    $('[data-act=resume]', node).addEventListener('click', resume);
    $('[data-act=leave]', node).addEventListener('click', () => { hide(); o.onLeave ? o.onLeave() : app.leaveGame && app.leaveGame(); });
    $$('[data-go]', node).forEach((b) => b.addEventListener('click', () => show(b.dataset.go)));
    $('[data-act=copyinv]', node)?.addEventListener('click', () => ctx.copy(`${location.origin}${location.pathname}?join=${gi.invite}`, 'Invite link'));
    setTimeout(() => $('[data-act=resume]', node)?.focus(), 60);
    return { el: node, back: () => { if (performance.now() - state.pausedAt > 300) resume(); } };
  }

  function creditsScreen() {
    const node = el(`<div class="mn-screen mn-credits"><div class="panel mn-frame small">
      <div class="mn-head"><button class="btn small ghost mn-back">${icon('back', 'sm')} Back</button><h2>Credits</h2><span></span></div>
      <div class="mn-credits-body">${logoHTML('mid', true)}
        <div class="mn-cred-grid">
          <div><h4>Game</h4><p>Emberwild — a multiplayer survival game built to run entirely in your browser.</p></div>
          <div><h4>Tech</h4><p>Three.js for rendering · Node.js &amp; WebSockets for the authoritative multiplayer servers · procedural worlds, models and sounds generated in code.</p></div>
          <div><h4>Worlds</h4><p>Every seed grows the same island for everyone. Host your own server, pick your rules, and share the invite code.</p></div>
          <div><h4>Thanks</h4><p>To every explorer who lit a first fire, survived a first night, and told a friend.</p></div>
        </div><p class="mn-foot-note">Light a fire. Claim the wild.${backend.mode === 'local' ? ' · <b>Offline mode</b> (single-player, saved in this browser)' : ''}</p></div></div></div>`);
    $('.mn-back', node).addEventListener('click', goBack);
    setTimeout(() => $('.mn-back', node).focus(), 60);
    return { el: node, back: () => show(state.inGame ? 'pause' : 'main') };
  }

  function connectingScreen(arg) {
    const node = el(`<div class="mn-screen mn-connecting"><div class="mn-conn-card">${flameSVG('conn')}<div class="mn-conn-text" role="status" aria-live="polite"></div><div class="mn-dots"><i></i><i></i><i></i></div>${arg.onCancel ? `<button class="btn ghost small" data-act="cancel">Cancel</button>` : ''}</div></div>`);
    $('.mn-conn-text', node).textContent = arg.text || 'Connecting…';
    $('[data-act=cancel]', node)?.addEventListener('click', () => { arg.onCancel(); });
    return { el: node, back: arg.onCancel || null };
  }

  const builders = {
    login: loginScreen, main: mainScreen, pause: pauseScreen, credits: creditsScreen, connecting: connectingScreen,
    servers: modules.servers, host: modules.host, hosted: modules.hosted, myservers: modules.myservers,
    character: modules.character, settings: modules.settings, controls: modules.controls,
  };

  // ------------------------------------------------------------------ router
  function show(name, arg) {
    if (name === 'register') { name = 'login'; arg = { tab: 'register' }; }
    const build = builders[name];
    if (!build) { console.warn('[menus] unknown screen', name); return; }
    if (!['settings', 'controls', 'pause'].includes(name)) state.inGame = false;
    if (name === 'connecting' && state.cur && state.cur.name === 'connecting') {
      $('.mn-conn-text', state.cur.el).textContent = arg.text || 'Connecting…'; return;
    }
    if ((name !== 'login' && name !== 'main' && name !== 'connecting') && !app.profile && !(name === 'settings' || name === 'controls' || name === 'credits')) name = 'login', arg = undefined;
    teardown();
    root.classList.remove('off');
    root.classList.toggle('mn-ingame', state.inGame);
    root.dataset.screen = name;
    if (state.inGame) backdrop.stop(); else backdrop.start();
    const s = build(arg) || {};
    s.name = name;
    s.el.classList.add('mn-in');
    stage.appendChild(s.el);
    state.cur = s;
    if (name === 'main' && state.pending && app.profile) { const c = state.pending; state.pending = null; setTimeout(() => joinInvite(c), 120); }
  }
  function teardown() {
    if (state.cur) { try { state.cur.destroy && state.cur.destroy(); } catch (e) { console.error(e); } state.cur = null; }
    state.capturing = false;
    stage.textContent = '';
  }
  function hide() {
    teardown();
    state.modals.slice().forEach((m) => m.close());
    state.inGame = false;
    backdrop.stop();
    root.classList.add('off');
    root.classList.remove('mn-ingame');
  }
  function goBack() {
    const s = state.cur; if (!s) return;
    if (s.back) { sfx('back'); s.back(); return; }
    if (['settings', 'controls', 'credits', 'servers', 'host', 'character', 'myservers', 'hosted'].includes(s.name)) { sfx('back'); show(state.inGame ? 'pause' : 'main'); }
  }
  function showPause(opts = {}) {
    state.pauseOpts = opts; state.inGame = true; state.pausedAt = performance.now();
    show('pause');
  }
  function showConnecting(text = 'Connecting…', opts = {}) {
    state.inGame = false;
    show('connecting', { text, onCancel: opts.onCancel });
  }
  function showError(title = 'Something went wrong', text = '', opts = {}) {
    sfx('error');
    if (root.classList.contains('off') && !app.game) { show(app.profile ? 'main' : 'login'); }
    else root.classList.remove('off');
    const body = el(`<div class="mn-error"><div class="mn-error-i">${icon('warn')}</div><p class="mn-p"></p></div>`);
    $('p', body).textContent = text;
    modal({ title, body, cls: 'small err',
      onClose: () => { if (state.cur && state.cur.name === 'connecting') show(app.profile ? 'main' : 'login'); else if (!state.cur && !app.game) show(app.profile ? 'main' : 'login'); else if (!state.cur && app.game) hide(); },
      buttons: [{ label: opts.retry ? 'Cancel' : 'OK', kind: opts.retry ? 'ghost' : '', primary: !opts.retry }, ...(opts.retry ? [{ label: 'Try again', primary: true, onClick: () => { setTimeout(opts.retry, 0); } }] : [])] });
  }

  // ------------------------------------------------------------------ global keys, sounds
  window.addEventListener('keydown', (e) => {
    if (root.classList.contains('off') || state.capturing) return;
    if (e.key === 'Escape') {
      const m = state.modals[state.modals.length - 1];
      if (m) { e.preventDefault(); e.stopPropagation(); m.dismiss(); return; }
      if (state.cur) { e.preventDefault(); goBack(); }
      return;
    }
    if (e.key === 'Tab') {
      const m = state.modals[state.modals.length - 1]; if (!m) return;
      const f = $$('button:not(:disabled),input,select,textarea,[tabindex]:not([tabindex="-1"])', m.el).filter((x) => x.offsetParent);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  }, true);
  let lastHover = null;
  root.addEventListener('click', (e) => { if (e.target.closest('.btn,.tab,.mn-chip,.mn-sw,.mn-mode,.mn-row-srv')) sfx('click'); });
  root.addEventListener('mouseover', (e) => { const b = e.target.closest('.btn:not(:disabled)'); if (b && b !== lastHover) { lastHover = b; sfx('hover'); } else if (!b) lastHover = null; });

  return { show, hide, showPause, joinInvite, showConnecting, showError };
}
