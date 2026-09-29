// Server browser, host-a-server form, "server ready" screen and My Servers.
import { MODES as FALLBACK_MODES } from '/shared/items.js';
import { $, $$, el, esc, icon, friendly, serverTagsHTML, ruleChipsHTML, modeShort, modeParen, isPvp, fillAll } from './util.js';

const MODE_DESC = {
  survival: 'Full PvP and base raiding. Trust no one.',
  cooperative: 'Friendly PvE. Build, explore and survive together.',
  relaxed: 'Boosted gathering, keep your gear when you die.',
  hardcore: 'Short days, scarce loot, friendly fire. Brutal.',
};
const inviteLink = (code) => `${location.origin}/?join=${code}`;
const SEED_WORDS = ['EMBER', 'ASH', 'COVE', 'PINE', 'DUSK', 'RAVEN', 'FROST', 'MOSS', 'CRAG', 'TIDE', 'HOLLOW', 'GLEAM', 'BRIAR', 'FLINT', 'WILLOW', 'THORN'];
const randomSeed = () => SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)] + '-' + Math.floor(Math.random() * 0xffffff).toString(16).toUpperCase().padStart(6, '0');
const fmtRel = (ms) => { const s = Math.round(ms / 1000); return s < 3 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`; };
const head = (title, right = '') => `<div class="mn-head"><button type="button" class="btn small ghost mn-back">${icon('back', 'sm')} Back</button><h2>${title}</h2><div class="mn-head-r">${right}</div></div>`;

export function serverScreens(ctx) {
  const { app } = ctx;
  const bindBack = (node, fn) => $('.mn-back', node).addEventListener('click', fn || (() => ctx.back()));

  // ================================================================== browser
  function servers() {
    const st = { list: null, loading: false, err: '', q: '', mode: 'all', room: false, nopw: false, sel: null, at: 0, sig: '' };
    let alive = true, timer = 0, tick = 0;
    const node = el(`<div class="mn-screen mn-browser"><div class="panel mn-frame">
      ${head('Find a server', `<button type="button" class="btn small" data-go="myservers">${icon('host', 'sm')} My servers</button><button type="button" class="btn small primary" data-go="host">${icon('plus', 'sm')} Host a server</button>`)}
      <div class="mn-toolbar">
        <div class="mn-search">${icon('search')}<input class="input" type="search" placeholder="Search name, seed or host…" aria-label="Search servers" maxlength="40" spellcheck="false"></div>
        <div class="mn-chips" role="group" aria-label="Filters">
          <button type="button" class="mn-chip on" data-f="all" aria-pressed="true">All</button>
          <button type="button" class="mn-chip" data-f="pvp" aria-pressed="false">PvP</button>
          <button type="button" class="mn-chip" data-f="pve" aria-pressed="false">PvE</button>
          <span class="mn-vsep"></span>
          <button type="button" class="mn-chip" data-f="room" aria-pressed="false">Has room</button>
          <button type="button" class="mn-chip" data-f="nopw" aria-pressed="false">No password</button>
        </div>
        <span class="mn-sp"></span><span class="mn-updated" aria-live="off"></span>
        <button type="button" class="btn small ghost mn-refresh" aria-label="Refresh server list" title="Refresh">${icon('refresh')}</button>
      </div>
      <div class="mn-browser-main">
        <div class="mn-list-wrap"><div class="mn-list-h"><span>Server</span><span>Mode</span><span>Players</span><span>Day</span><span></span></div><div class="mn-list" role="listbox" aria-label="Servers" tabindex="-1"></div></div>
        <aside class="mn-side" aria-live="polite"></aside>
      </div>
      <form class="mn-invite-bar" novalidate>${icon('link')}<span>Got an invite code?</span><input class="input code" maxlength="12" placeholder="e.g. 4F7A2C" aria-label="Invite code" autocomplete="off" spellcheck="false"><button type="submit" class="btn small">Join with code</button></form>
    </div></div>`);
    const listEl = $('.mn-list', node), side = $('.mn-side', node), updated = $('.mn-updated', node), refreshBtn = $('.mn-refresh', node), search = $('.mn-search input', node);
    bindBack(node);
    $$('[data-go]', node).forEach((b) => b.addEventListener('click', () => ctx.show(b.dataset.go)));

    const visible = () => {
      const q = st.q.trim().toLowerCase();
      return (st.list || []).filter((s) => {
        if (st.mode === 'pvp' && !isPvp(s)) return false;
        if (st.mode === 'pve' && isPvp(s)) return false;
        if (st.room && s.players >= s.maxPlayers) return false;
        if (st.nopw && s.hasPassword) return false;
        if (q && !(`${s.name} ${s.seed} ${s.owner} ${s.modeLabel} ${s.desc}`.toLowerCase().includes(q))) return false;
        return true;
      }).sort((a, b) => (b.official - a.official) || ((a.players >= a.maxPlayers) - (b.players >= b.maxPlayers)) || (b.mine - a.mine) || (b.players - a.players));
    };

    function renderList() {
      const vis = visible();
      if (st.sel && !vis.some((s) => s.id === st.sel)) st.sel = null;
      if (!st.sel && vis.length) st.sel = (vis.find((s) => s.official) || vis[0]).id;
      const focusId = document.activeElement && document.activeElement.dataset && listEl.contains(document.activeElement) ? document.activeElement.dataset.id : null;
      const top = listEl.scrollTop;
      if (!st.list) {
        listEl.innerHTML = st.err
          ? `<div class="mn-empty">${icon('warn')}<b>Couldn't load servers</b><p>${esc(st.err)}</p><button type="button" class="btn" data-retry>Try again</button></div>`
          : Array.from({ length: 5 }, () => '<div class="mn-row-srv skel"><div class="c-name"><b>&nbsp;</b><small>&nbsp;</small></div></div>').join('');
      } else if (!vis.length) {
        listEl.innerHTML = `<div class="mn-empty">${icon('search')}<b>No servers match</b><p>${st.list.length ? 'Try clearing your filters or search.' : 'No servers are online yet — be the first to host one!'}</p>${st.list.length ? '<button type="button" class="btn small" data-clear>Clear filters</button>' : '<button type="button" class="btn primary small" data-host>Host a server</button>'}</div>`;
      } else {
        listEl.innerHTML = vis.map((s) => {
          const pct = Math.round((s.players / Math.max(1, s.maxPlayers)) * 100), full = s.players >= s.maxPlayers;
          return `<div class="mn-row-srv ${s.id === st.sel ? 'sel' : ''} ${full ? 'full' : ''}" role="option" aria-selected="${s.id === st.sel}" tabindex="0" data-id="${esc(s.id)}">
            <div class="c-name"><b>${s.official ? `<span class="mn-star" title="Official server">${icon('starfill', 'sm')}</span>` : ''}${esc(s.name)}${s.mine ? ' <em class="mn-yours">yours</em>' : ''}</b><small>${esc(s.desc || 'Hosted by ' + s.owner)}</small></div>
            <div class="c-mode">${isPvp(s) ? '<span class="tag pvp">PvP</span>' : '<span class="tag pve">PvE</span>'}<small>${esc(modeShort(s.modeLabel))}</small></div>
            <div class="c-pl"><b>${s.players}<i>/${s.maxPlayers}</i>${full ? ' <em>FULL</em>' : ''}</b><div class="bar"><i style="width:${pct}%"></i></div></div>
            <div class="c-day">${s.day ? 'Day ' + s.day : '—'}</div>
            <div class="c-lock">${s.hasPassword || s.private ? `<span title="${s.private ? 'Private' : 'Password protected'}">${icon('lock', 'sm')}</span>` : ''}</div></div>`;
        }).join('');
      }
      listEl.scrollTop = top;
      if (focusId) { const f = $(`[data-id="${CSS.escape(focusId)}"]`, listEl); f && f.focus({ preventScroll: true }); }
      renderSide();
    }

    function renderSide() {
      const s = (st.list || []).find((x) => x.id === st.sel);
      if (!s) { side.innerHTML = `<div class="mn-side-empty">${icon('users')}<p>Select a server to see its rules and join.</p></div>`; return; }
      const full = s.players >= s.maxPlayers;
      side.innerHTML = `<div class="mn-side-in"><div class="mn-side-scroll"><div class="mn-side-title">${s.official ? `<span class="mn-star">${icon('starfill', 'sm')}</span>` : ''}<h3>${esc(s.name)}</h3></div>
        <div class="mn-tags">${serverTagsHTML(s)}</div>
        <p class="mn-side-desc">${esc(s.desc || 'No description.')}</p>
        <div class="mn-stats"><div><span>Players</span><b>${s.players} / ${s.maxPlayers}</b></div><div><span>Mode</span><b>${esc(modeShort(s.modeLabel))}</b></div><div><span>World day</span><b>${s.day ? 'Day ' + s.day : 'Not started'}</b></div><div><span>Host</span><b>${esc(s.owner)}</b></div>
          <div class="wide"><span>Seed</span><b class="seed">${esc(s.seed)}</b><button type="button" class="mn-mini" data-copyseed title="Copy seed" aria-label="Copy seed">${icon('copy', 'sm')}</button></div></div>
        <div class="mn-rules">${ruleChipsHTML(s.rules)}</div></div>
        <button type="button" class="btn primary big mn-join" ${full ? 'disabled' : ''}>${full ? 'Server full' : (s.hasPassword && !s.mine ? icon('lock', 'sm') + ' Enter password' : 'Join server')}</button></div>`;
      $('.mn-join', side).addEventListener('click', () => ctx.joinServer(s));
      $('[data-copyseed]', side).addEventListener('click', () => ctx.copy(String(s.seed), 'Seed'));
    }

    async function load(manual) {
      if (st.loading || !alive) return;
      st.loading = true; refreshBtn.classList.add('spin');
      try {
        const list = await ctx.api.servers();
        if (!alive) return;
        st.err = ''; st.at = Date.now();
        const sig = JSON.stringify(list.map((s) => [s.id, s.players, s.maxPlayers, s.day, s.name, s.hasPassword, s.mine, s.invite]));
        const changed = sig !== st.sig || !st.list; st.sig = sig; st.list = list;
        if (changed) renderList();
        if (manual) ctx.toast(`${list.length} server${list.length === 1 ? '' : 's'} online`, 'info');
      } catch (e) {
        if (!alive) return;
        st.err = friendly(e, 'Could not reach the server list.');
        if (st.list) ctx.toast('Refresh failed — showing the last known list.', 'warn'); else renderList();
        if (e.status === 401) { ctx.toast('Please sign in again.', 'warn'); app.profile = null; ctx.show('login'); }
      } finally { st.loading = false; refreshBtn.classList.remove('spin'); paintUpdated(); }
    }
    const paintUpdated = () => { updated.textContent = st.at ? `Updated ${fmtRel(Date.now() - st.at)}` : (st.err ? 'Offline' : 'Loading…'); updated.classList.toggle('bad', !!st.err && !!st.list); };

    // events
    listEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-retry]')) { st.err = ''; renderList(); load(true); return; }
      if (e.target.closest('[data-clear]')) { st.q = ''; st.mode = 'all'; st.room = st.nopw = false; search.value = ''; syncChips(); renderList(); return; }
      if (e.target.closest('[data-host]')) { ctx.show('host'); return; }
      const r = e.target.closest('.mn-row-srv[data-id]'); if (!r) return;
      st.sel = r.dataset.id; $$('.mn-row-srv', listEl).forEach((x) => { const on = x === r; x.classList.toggle('sel', on); x.setAttribute('aria-selected', on); }); renderSide();
    });
    listEl.addEventListener('dblclick', (e) => { const r = e.target.closest('.mn-row-srv[data-id]'); const s = r && st.list.find((x) => x.id === r.dataset.id); if (s) ctx.joinServer(s); });
    listEl.addEventListener('keydown', (e) => {
      const r = e.target.closest('.mn-row-srv[data-id]'); if (!r) return;
      if (e.key === 'Enter') { e.preventDefault(); const s = st.list.find((x) => x.id === r.dataset.id); s && ctx.joinServer(s); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = e.key === 'ArrowDown' ? r.nextElementSibling : r.previousElementSibling; if (n && n.dataset.id) { n.focus(); n.click(); } }
    });
    const syncChips = () => $$('.mn-chip', node).forEach((c) => { const f = c.dataset.f; const on = f === 'room' ? st.room : f === 'nopw' ? st.nopw : st.mode === f; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
    $$('.mn-chip', node).forEach((c) => c.addEventListener('click', () => {
      const f = c.dataset.f;
      if (f === 'room') st.room = !st.room; else if (f === 'nopw') st.nopw = !st.nopw; else st.mode = f;
      syncChips(); renderList();
    }));
    search.addEventListener('input', () => { st.q = search.value; renderList(); });
    refreshBtn.addEventListener('click', () => { ctx.sfx('click'); load(true); });
    $('.mn-invite-bar', node).addEventListener('submit', (e) => {
      e.preventDefault(); const inp = $('.code', node); const code = inp.value.trim();
      if (!code) { ctx.toast('Type an invite code first.', 'warn'); ctx.sfx('error'); inp.focus(); return; }
      ctx.joinInvite(code);
    });
    $('.mn-invite-bar .code', node).addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

    renderList(); paintUpdated(); load();
    timer = setInterval(() => { if (!document.hidden && !document.querySelector('.mn-modal-back')) load(); }, 6000);
    tick = setInterval(paintUpdated, 1000);
    setTimeout(() => search.focus(), 80);
    return { el: node, back: () => ctx.show('main'), destroy() { alive = false; clearInterval(timer); clearInterval(tick); } };
  }

  // ================================================================== host
  function host() {
    let modes = JSON.parse(JSON.stringify(FALLBACK_MODES));
    const defName = `${(app.profile && app.profile.name) || 'Explorer'}'s World`.slice(0, 32);
    const f = { name: defName, desc: '', mode: 'cooperative', seed: '', private: false, password: '', maxPlayers: 16, rules: {} };
    let mineCount = 0, busy = false, advOpen = false;
    const preset = () => { const p = { ...(modes[f.mode] || modes.cooperative) }; delete p.label; return p; };
    f.rules = preset();

    const node = el(`<div class="mn-screen mn-host"><form class="panel mn-frame" novalidate>
      ${head('Host a server', `<button type="button" class="btn small" data-go="myservers">${icon('host', 'sm')} My servers <span class="mn-badge"></span></button>`)}
      <div class="mn-form-scroll"><div class="mn-form">
        <div class="mn-col">
          <label class="field" for="hs-name">Server name</label><input id="hs-name" class="input" maxlength="32" autocomplete="off" placeholder="Give your world a name">
          <div class="mn-ferr" data-for="name"></div>
          <label class="field" for="hs-desc">Description <span class="dim">(optional)</span></label><input id="hs-desc" class="input" maxlength="80" autocomplete="off" placeholder="Rules, vibe, who's welcome…">
          <label class="field">Game mode</label><div class="mn-modes" role="radiogroup" aria-label="Game mode"></div>
          <label class="field" for="hs-seed">World seed</label>
          <div class="mn-seed"><input id="hs-seed" class="input" maxlength="32" autocomplete="off" spellcheck="false" placeholder="Leave empty for a random world"><button type="button" class="btn mn-dice" title="Random seed" aria-label="Random seed">${icon('dice')}</button><button type="button" class="btn ghost mn-clear" title="Clear seed" aria-label="Clear seed">${icon('close', 'sm')}</button></div>
          <p class="mn-note">${icon('bulb', 'sm')} <span><b>Same seed = same world.</b> Anyone using this seed gets the identical island — terrain, towns and landmarks.</span></p>
        </div>
        <div class="mn-col">
          <div class="mn-card"><h4>Access</h4>
            <label class="check"><input type="checkbox" id="hs-priv"><span><b>Private server</b><small>Hidden from the browser. Join by invite code or link only.</small></span></label>
            <label class="field" for="hs-pw">Password <span class="dim">(optional)</span></label><input id="hs-pw" class="input" type="password" maxlength="60" autocomplete="new-password" placeholder="No password">
            <label class="field" for="hs-max">Max players <b class="mn-val" data-v="max"></b></label><input id="hs-max" type="range" min="2" max="32" step="1">
          </div>
          <div class="mn-card"><div class="mn-card-h"><h4>Rules</h4><span class="tag custom hidden">Custom</span><span class="mn-sp"></span><button type="button" class="mn-link" data-reset hidden>Reset to preset</button><button type="button" class="mn-link mn-adv" aria-expanded="false">Advanced ▾</button></div>
            <div class="mn-rules mn-rule-sum"></div>
            <div class="mn-adv-body hidden">
              <div class="mn-toggles"></div>
              <label class="field" for="r-dd">On death</label><select id="r-dd" class="input"><option value="all">Drop everything</option><option value="none">Keep gear</option></select>
              <label class="field" for="r-gr">Gather rate <b class="mn-val" data-v="gatherRate"></b></label><input id="r-gr" type="range" min="0.25" max="5" step="0.25">
              <label class="field" for="r-lr">Loot rate <b class="mn-val" data-v="lootRate"></b></label><input id="r-lr" type="range" min="0.25" max="5" step="0.25">
              <label class="field" for="r-dl">Day length <b class="mn-val" data-v="dayLength"></b></label><input id="r-dl" type="range" min="5" max="60" step="1">
            </div>
          </div>
        </div>
      </div></div>
      <div class="mn-foot"><div class="mn-err" role="alert" aria-live="polite"></div><span class="mn-sp"></span><button type="button" class="btn ghost" data-act="cancel">Cancel</button><button type="submit" class="btn primary big mn-create">Create server</button></div>
    </form></div>`);
    const form = $('form', node), err = $('.mn-err', node), create = $('.mn-create', node);
    bindBack(node); $('[data-act=cancel]', node).addEventListener('click', () => ctx.show('main'));
    $$('[data-go]', node).forEach((b) => b.addEventListener('click', () => ctx.show(b.dataset.go)));
    const inName = $('#hs-name', node), inDesc = $('#hs-desc', node), inSeed = $('#hs-seed', node), inPriv = $('#hs-priv', node), inPw = $('#hs-pw', node), inMax = $('#hs-max', node);
    inName.value = f.name; inMax.value = f.maxPlayers;

    const RULE_TOGGLES = [['pvp', 'PvP', 'Players can damage each other'], ['raiding', 'Raiding', 'Bases can be damaged and destroyed'], ['friendlyFire', 'Friendly fire', 'Teammates can hurt each other'], ['mobs', 'Wildlife', 'Animals and hostiles roam the world'], ['decay', 'Base decay', 'Unused structures slowly rot away']];
    $('.mn-toggles', node).innerHTML = RULE_TOGGLES.map(([k, l, d]) => `<label class="check"><input type="checkbox" data-r="${k}"><span><b>${l}</b><small>${d}</small></span></label>`).join('');

    const fmtVal = { max: () => `${f.maxPlayers}`, gatherRate: () => `×${f.rules.gatherRate}`, lootRate: () => `×${f.rules.lootRate}`, dayLength: () => `${Math.round(f.rules.dayLength / 60)} min` };
    function paintRules() {
      const p = preset();
      $$('[data-r]', node).forEach((c) => { c.checked = !!f.rules[c.dataset.r]; });
      $('#r-dd', node).value = f.rules.deathDrop === 'none' ? 'none' : 'all';
      $('#r-gr', node).value = f.rules.gatherRate; $('#r-lr', node).value = f.rules.lootRate; $('#r-dl', node).value = Math.round(f.rules.dayLength / 60);
      $$('.mn-val', node).forEach((v) => { v.textContent = fmtVal[v.dataset.v]?.() ?? ''; });
      const custom = Object.keys(p).some((k) => f.rules[k] !== p[k]);
      $('.tag.custom', node).classList.toggle('hidden', !custom); $('[data-reset]', node).hidden = !custom;
      $('.mn-rule-sum', node).innerHTML = ruleChipsHTML(f.rules);
      fillAll(node);
    }
    function paintModes() {
      const box = $('.mn-modes', node);
      box.innerHTML = Object.entries(modes).map(([k, m]) => `<button type="button" class="mn-mode ${k === f.mode ? 'on' : ''}" role="radio" aria-checked="${k === f.mode}" data-m="${k}">
        <span class="mn-mode-t"><b>${esc(modeShort(m.label))}</b>${modeParen(m.label) ? `<span class="tag ${m.pvp ? 'pvp' : 'pve'}">${esc(modeParen(m.label).split(',')[0])}</span>` : ''}</span><small>${esc(MODE_DESC[k] || '')}</small></button>`).join('');
    }
    $('.mn-modes', node).addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]'); if (!b || b.dataset.m === f.mode) return;
      f.mode = b.dataset.m; f.rules = preset(); paintModes(); paintRules();
    });
    $('[data-reset]', node).addEventListener('click', () => { f.rules = preset(); paintRules(); });
    $('.mn-adv', node).addEventListener('click', (e) => {
      advOpen = !advOpen; $('.mn-adv-body', node).classList.toggle('hidden', !advOpen); $('.mn-rule-sum', node).classList.toggle('hidden', advOpen);
      e.currentTarget.textContent = advOpen ? 'Hide ▴' : 'Advanced ▾'; e.currentTarget.setAttribute('aria-expanded', advOpen);
      if (advOpen) $('.mn-form-scroll', node).scrollTo({ top: 9999, behavior: 'smooth' });
    });
    $$('[data-r]', node).forEach((c) => c.addEventListener('change', () => { f.rules[c.dataset.r] = c.checked; if (c.dataset.r === 'pvp' && !c.checked) f.rules.friendlyFire = false; paintRules(); }));
    $('#r-dd', node).addEventListener('change', (e) => { f.rules.deathDrop = e.target.value; paintRules(); });
    $('#r-gr', node).addEventListener('input', (e) => { f.rules.gatherRate = +e.target.value; paintRules(); });
    $('#r-lr', node).addEventListener('input', (e) => { f.rules.lootRate = +e.target.value; paintRules(); });
    $('#r-dl', node).addEventListener('input', (e) => { f.rules.dayLength = +e.target.value * 60; paintRules(); });
    inMax.addEventListener('input', () => { f.maxPlayers = +inMax.value; $('[data-v=max]', node).textContent = f.maxPlayers; fillAll(node); });
    $('.mn-dice', node).addEventListener('click', () => { inSeed.value = randomSeed(); f.seed = inSeed.value; inSeed.focus(); });
    $('.mn-clear', node).addEventListener('click', () => { inSeed.value = ''; f.seed = ''; inSeed.focus(); });
    inSeed.addEventListener('input', () => { f.seed = inSeed.value; });

    const ferr = (msg) => { const e = $('[data-for=name]', node); e.textContent = msg || ''; inName.classList.toggle('bad', !!msg); };
    inName.addEventListener('input', () => ferr(''));
    const setErr = (m) => { err.textContent = m; err.classList.remove('shake'); void err.offsetWidth; if (m) err.classList.add('shake'); };

    form.addEventListener('submit', async (e) => {
      e.preventDefault(); if (busy) return;
      const name = inName.value.trim().replace(/\s+/g, ' ');
      setErr(''); ferr('');
      if (name.length < 3) { ferr('Server name must be at least 3 characters.'); ctx.sfx('error'); inName.focus(); return; }
      if (mineCount >= 3) { setErr('You can host up to 3 servers. Delete one from My servers first.'); ctx.sfx('error'); return; }
      const p = preset(), rules = {};
      for (const k of Object.keys(p)) if (f.rules[k] !== p[k]) rules[k] = f.rules[k];
      const cfg = { name, mode: f.mode, seed: inSeed.value.trim(), desc: inDesc.value.trim(), private: inPriv.checked, maxPlayers: f.maxPlayers, rules };
      if (inPw.value) cfg.password = inPw.value;
      busy = true; create.disabled = true; create.innerHTML = '<span class="mn-spin dark"></span> Creating…';
      try {
        const s = await ctx.api.createServer(cfg);
        ctx.sfx('success'); ctx.show('hosted', s);
      } catch (ex) {
        busy = false; create.disabled = false; create.textContent = 'Create server';
        setErr(friendly(ex, 'Could not create the server.')); ctx.sfx('error');
      }
    });

    paintModes(); paintRules();
    (async () => {
      try {
        const m = await ctx.api.modes();
        if (m && Object.keys(m).length && JSON.stringify(m) !== JSON.stringify(modes)) { modes = m; if (!modes[f.mode]) f.mode = Object.keys(modes)[0]; f.rules = preset(); paintModes(); paintRules(); }
      } catch {}
      try {
        const l = await ctx.api.servers(); mineCount = l.filter((s) => s.mine).length;
        const b = $('.mn-badge', node); if (b) { b.textContent = mineCount ? `${mineCount}/3` : ''; b.classList.toggle('on', mineCount > 0); }
        if (mineCount >= 3) setErr('You are hosting the maximum of 3 servers. Delete one to create another.');
      } catch {}
    })();
    setTimeout(() => { inName.focus(); inName.select(); }, 80);
    return { el: node, back: () => ctx.show('main') };
  }

  // ================================================================== "server ready"
  function hosted(s) {
    const link = inviteLink(s.invite);
    const node = el(`<div class="mn-screen mn-hosted"><div class="panel mn-hosted-card">
      <div class="mn-ready-i">${icon('check')}</div>
      <h2>Your server is ready!</h2>
      <p class="mn-p"><b>${esc(s.name)}</b> is live${s.private ? ' and private — only people with the invite can join' : ''}. Share the invite with friends:</p>
      <div class="mn-code-box"><span class="mn-code-l">Invite code</span><div class="mn-code" aria-label="Invite code">${esc(s.invite)}</div><button type="button" class="btn small" data-copy="code">${icon('copy', 'sm')} Copy code</button></div>
      <div class="mn-linkrow"><input class="input" readonly value="${esc(link)}" aria-label="Invite link"><button type="button" class="btn small" data-copy="link">${icon('link', 'sm')} Copy link</button></div>
      <div class="mn-tags">${serverTagsHTML(s)}<span class="tag">Seed ${esc(s.seed)}</span><span class="tag">Up to ${s.maxPlayers} players</span></div>
      <div class="mn-hosted-btns"><button type="button" class="btn primary big" data-act="join">Join now</button><button type="button" class="btn" data-go="myservers">My servers</button><button type="button" class="btn ghost" data-go="main">Main menu</button></div>
    </div></div>`);
    $('[data-copy=code]', node).addEventListener('click', () => ctx.copy(s.invite, 'Invite code'));
    $('[data-copy=link]', node).addEventListener('click', () => ctx.copy(link, 'Invite link'));
    $('input', node).addEventListener('focus', (e) => e.target.select());
    $('[data-act=join]', node).addEventListener('click', () => ctx.joinServer(s, { invite: s.invite }));
    $$('[data-go]', node).forEach((b) => b.addEventListener('click', () => ctx.show(b.dataset.go)));
    setTimeout(() => $('[data-act=join]', node).focus(), 80);
    return { el: node, back: () => ctx.show('main') };
  }

  // ================================================================== my servers
  function myservers() {
    let alive = true, list = null;
    const node = el(`<div class="mn-screen mn-mine"><div class="panel mn-frame small">
      ${head('My servers', `<span class="mn-quota"></span><button type="button" class="btn small primary" data-go="host">${icon('plus', 'sm')} Host new</button>`)}
      <div class="mn-mine-list"><div class="mn-wait"><span class="mn-spin"></span> Loading your servers…</div></div></div></div>`);
    bindBack(node, () => ctx.show('main'));
    $$('[data-go]', node).forEach((b) => b.addEventListener('click', () => ctx.show(b.dataset.go)));
    const box = $('.mn-mine-list', node);
    function paint() {
      $('.mn-quota', node).textContent = `${list.length}/3 used`;
      if (!list.length) { box.innerHTML = `<div class="mn-empty">${icon('host')}<b>You aren't hosting anything yet</b><p>Create your own world, choose the rules and invite your friends.</p><button type="button" class="btn primary" data-go="host">Host a server</button></div>`; $('[data-go]', box).addEventListener('click', () => ctx.show('host')); return; }
      box.innerHTML = list.map((s) => `<div class="mn-mine-row" data-id="${esc(s.id)}">
        <div class="mn-mine-main"><b>${esc(s.name)}</b><div class="mn-tags">${serverTagsHTML(s)}<span class="tag">${s.players}/${s.maxPlayers} online</span><span class="tag">Seed ${esc(s.seed)}</span></div></div>
        <div class="mn-mine-inv"><span>Invite</span><b>${esc(s.invite || '—')}</b><button type="button" class="mn-mini" data-a="code" title="Copy code" aria-label="Copy invite code">${icon('copy', 'sm')}</button><button type="button" class="mn-mini" data-a="link" title="Copy invite link" aria-label="Copy invite link">${icon('link', 'sm')}</button></div>
        <div class="mn-mine-btns"><button type="button" class="btn small primary" data-a="join">Join</button><button type="button" class="btn small danger" data-a="del" aria-label="Delete ${esc(s.name)}">${icon('trash', 'sm')}</button></div></div>`).join('');
    }
    box.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const s = list.find((x) => x.id === b.closest('.mn-mine-row').dataset.id); if (!s) return;
      const a = b.dataset.a;
      if (a === 'code') ctx.copy(s.invite, 'Invite code');
      else if (a === 'link') ctx.copy(inviteLink(s.invite), 'Invite link');
      else if (a === 'join') ctx.joinServer(s, { invite: s.invite });
      else if (a === 'del') {
        const ok = await ctx.confirmBox({ title: 'Delete server?', text: `<b>${esc(s.name)}</b> and its entire world will be permanently deleted. Anyone playing will be disconnected. This can't be undone.`, ok: 'Delete forever', danger: true });
        if (!ok || !alive) return;
        try { await ctx.api.deleteServer(s.id); list = list.filter((x) => x.id !== s.id); ctx.sfx('success'); ctx.toast('Server deleted', 'good'); paint(); } catch (ex) { ctx.sfx('error'); ctx.toast(friendly(ex, 'Could not delete the server.'), 'bad'); }
      }
    });
    (async () => {
      try { list = (await ctx.api.servers()).filter((s) => s.mine); if (alive) paint(); }
      catch (e) { if (alive) box.innerHTML = `<div class="mn-empty">${icon('warn')}<b>Couldn't load your servers</b><p>${esc(friendly(e))}</p><button type="button" class="btn" data-retry>Try again</button></div>`; $('[data-retry]', box)?.addEventListener('click', () => ctx.show('myservers')); }
    })();
    return { el: node, back: () => ctx.show('main'), destroy() { alive = false; } };
  }

  return { servers, host, hosted, myservers };
}
