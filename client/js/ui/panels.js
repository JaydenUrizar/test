// Emberwild — Skills and Team panels (Module C). Both mount into #panel-root; only one is visible at a time.
import { PERKS, xpForLevel } from '/shared/items.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const AV = ['#7fd35a', '#5cc0e8', '#f2c94c', '#c39bff', '#ff9ec7', '#5be3c4', '#ffb25a', '#9fb4ff'];
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const avatarColor = (name) => AV[hashStr(String(name || '?').toLowerCase()) % AV.length];
const fmtPlay = (s) => { s = Math.floor(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };

// ---- shared open/close coordination (one panel visible at a time)
const ACTIVE = { cur: null };
function showPanel(ui) {
  if (ACTIVE.cur && ACTIVE.cur !== ui) ACTIVE.cur.close();
  ACTIVE.cur = ui;
  ui.root.classList.remove('hidden');
}
function hidePanel(ui) {
  if (ACTIVE.cur === ui) ACTIVE.cur = null;
  if (!ACTIVE.cur) ui.root.classList.add('hidden');
}

const PERK_ICON = {
  gather: '<path d="M8 25C6 14 13 6 26 5c1 12-5 19-15 19" fill="currentColor" opacity=".9"/><path d="M6 27c4-7 8-11 14-15" stroke="#1a2a10" stroke-width="2" fill="none" stroke-linecap="round"/>',
  vital: '<path d="M16 27C6 20 4 14 4 10.5A6.5 6.5 0 0 1 16 8a6.5 6.5 0 0 1 12 2.5C28 14 26 20 16 27z" fill="currentColor"/><path d="M8 12.5c0-2 1.5-3.4 3.2-3.4" stroke="#fff" stroke-opacity=".5" stroke-width="2" fill="none" stroke-linecap="round"/>',
  endure: '<path d="M18 3 7 18h7l-2 11 13-16h-8z" fill="currentColor"/>',
  brawn: '<path d="M25 4l3 3-13 13-3-3z" fill="currentColor"/><path d="M11 17l4 4-4.5 4.5-2.4-.4-.4-2.4z" fill="currentColor" opacity=".8"/><path d="M6 23l3 3M4 28l2-2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M7 5l3-1 14 14-1 3z" fill="currentColor" opacity=".55"/>',
  craft: '<path d="M4 9l9-5 5 3-2 3 4 4 3-2 3 3-6 9-4-1-10-10z" fill="currentColor" opacity="0"/><rect x="14.4" y="12" width="4" height="17" rx="1.6" transform="rotate(-38 16 20)" fill="currentColor" opacity=".7"/><path d="M6 10.5 14 4l6.5 6.5-3 3.2-2-2-8.3 7.5z" fill="currentColor"/>',
  scav: '<circle cx="13" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="3.4"/><path d="M19 19l9 9" stroke="currentColor" stroke-width="4.2" stroke-linecap="round"/><path d="M9.5 11a4 4 0 0 1 4-3.2" stroke="#fff" stroke-opacity=".55" stroke-width="2" fill="none" stroke-linecap="round"/>',
};
const PERK_COLOR = { gather: '#8fd25f', vital: '#ff6f61', endure: '#ffd15c', brawn: '#ff9c4d', craft: '#5cc0e8', scav: '#c39bff' };
// per-rank effect numbers (mirrors the descriptions in shared/items.js)
const PERK_FX = {
  gather: (r) => `+${r * 12}% resources`, vital: (r) => `+${r * 8} max health`, endure: (r) => `+${r * 10} max stamina`,
  brawn: (r) => `+${r * 5}% weapon damage`, craft: (r) => `−${r * 10}% crafting time`, scav: (r) => `+${r * 10}% container loot`,
};

// ================================================================= Skills
export class SkillsUI {
  constructor(game, root) {
    this.game = game; this.root = root; this.opened = false;
    this.el = el(`<div class="pnl-back skills-back"><div class="pnl skills panel">
      <div class="pnl-h"><span class="pnl-t"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="m12 2 2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.1 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>Skills</span>
        <span class="pnl-k">Level up to earn points · spend them on perks</span>
        <button class="btn small pnl-x">Close <kbd>Esc</kbd></button></div>
      <div class="sk-top">
        <div class="lvl-badge"><small>LEVEL</small><b class="sk-lvl">1</b></div>
        <div class="sk-xp"><div class="sk-xp-row"><span>Experience</span><span class="sk-xp-n"></span></div><div class="bar sk-bar"><i></i></div><div class="sk-xp-sub"></div></div>
        <div class="pts"><b class="sk-pts">0</b><small>points<br>to spend</small></div>
      </div>
      <div class="perk-grid"></div>
      <div class="sk-foot"></div>
    </div></div>`);
    this.el.classList.add('hidden'); root.appendChild(this.el);
    this.$lvl = this.el.querySelector('.sk-lvl'); this.$bar = this.el.querySelector('.sk-bar i'); this.$xpn = this.el.querySelector('.sk-xp-n');
    this.$xps = this.el.querySelector('.sk-xp-sub'); this.$pts = this.el.querySelector('.sk-pts'); this.$ptsBox = this.el.querySelector('.pts');
    this.$grid = this.el.querySelector('.perk-grid'); this.$foot = this.el.querySelector('.sk-foot');
    this.el.querySelector('.pnl-x').addEventListener('click', () => this.close());
    this.el.addEventListener('pointerdown', (e) => { if (e.target === this.el) this.close(); });
    this.$grid.addEventListener('click', (e) => {
      const b = e.target.closest('.perk-plus'); if (!b || b.disabled) return;
      this.game.send({ t: 'perk', id: b.dataset.id });
      this.game.audio && this.game.audio.ui && this.game.audio.ui('click');
    });
    // build the cards once, update in place
    this.cards = {};
    for (const [id, p] of Object.entries(PERKS)) {
      const c = PERK_COLOR[id] || '#ff8a3c';
      const card = el(`<div class="perk" style="--pc:${c}">
        <div class="perk-ico"><svg viewBox="0 0 32 32" width="34" height="34" style="color:${c}">${PERK_ICON[id] || ''}</svg></div>
        <div class="perk-m"><div class="perk-n">${esc(p.name)}</div><div class="perk-d">${esc(p.desc)}</div>
          <div class="perk-fx"></div>
          <div class="pips">${Array.from({ length: p.max }, () => '<i></i>').join('')}</div></div>
        <div class="perk-r"><span class="perk-rank"></span><button class="perk-plus" data-id="${id}" title="Spend a skill point">+</button></div>
      </div>`);
      this.$grid.appendChild(card);
      this.cards[id] = { card, pips: [...card.querySelectorAll('.pips i')], rank: card.querySelector('.perk-rank'), fx: card.querySelector('.perk-fx'), plus: card.querySelector('.perk-plus'), max: p.max };
    }
    this._unsub = [];
    if (game.on) for (const ev of ['perks', 'level', 'vit']) this._unsub.push(game.on(ev, () => { if (this.opened) this.refresh(); }));
  }
  isOpen() { return this.opened; }
  toggle() { this.opened ? this.close() : this.open(); }
  open() {
    if (this.opened) return;
    this.opened = true; showPanel(this);
    this.game.uiOpened && this.game.uiOpened('panel');
    this.refresh();
  }
  close() {
    if (!this.opened) return;
    this.opened = false; this.el.classList.add('hidden');
    hidePanel(this);
    this.game.uiClosed && this.game.uiClosed('panel');
  }
  refresh() {
    const s = this.game.state, perks = s.perks || {};
    this.el.classList.remove('hidden');
    const lvl = s.level || 1, xp = s.xp || 0, next = s.xpNext || xpForLevel(lvl), pts = s.points || 0;
    this.$lvl.textContent = lvl;
    this.$bar.style.width = Math.max(2, Math.min(100, (xp / next) * 100)) + '%';
    this.$xpn.textContent = `${Math.floor(xp).toLocaleString()} / ${next.toLocaleString()} XP`;
    this.$xps.textContent = `${Math.max(0, next - xp).toLocaleString()} XP to level ${lvl + 1}`;
    this.$pts.textContent = pts; this.$ptsBox.classList.toggle('has', pts > 0);
    for (const [id, c] of Object.entries(this.cards)) {
      const r = perks[id] || 0;
      c.pips.forEach((p, i) => p.classList.toggle('on', i < r));
      c.rank.textContent = `${r}/${c.max}`;
      const fx = PERK_FX[id];
      c.fx.innerHTML = fx ? (r >= c.max ? `<b>${fx(r)}</b> · maxed` : r ? `Now <b>${fx(r)}</b> → ${fx(r + 1)}` : `Rank 1: ${fx(1)}`) : '';
      c.plus.disabled = pts <= 0 || r >= c.max;
      c.card.classList.toggle('maxed', r >= c.max); c.card.classList.toggle('can', pts > 0 && r < c.max);
    }
    // optional stats
    const st = s.stats || this.game.stats || {};
    const kills = st.kills ?? s.kills, deaths = st.deaths ?? s.deaths, play = st.playSeconds ?? s.playSeconds;
    const items = [];
    if (kills != null) items.push(['Kills', kills]); if (deaths != null) items.push(['Deaths', deaths]); if (play != null) items.push(['Time played', fmtPlay(play)]);
    this.$foot.innerHTML = items.length ? items.map(([k, v]) => `<div class="st"><b>${esc(v)}</b><span>${k}</span></div>`).join('') : '<span class="dim">Perks apply instantly and are kept when you die.</span>';
  }
}

// ================================================================= Team
export class TeamUI {
  constructor(game, root) {
    this.game = game; this.root = root; this.opened = false; this.confirmLeave = 0;
    this.el = el(`<div class="pnl-back team-back"><div class="pnl team panel">
      <div class="pnl-h"><span class="pnl-t"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 1.9 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z"/></svg>Team</span>
        <span class="pnl-k">Teammates share the map and can't hurt each other</span>
        <button class="btn small pnl-x">Close <kbd>Esc</kbd></button></div>
      <div class="tm-body">
        <section class="tm-col tm-mine"></section>
        <section class="tm-col tm-online"></section>
      </div>
    </div></div>`);
    this.el.classList.add('hidden'); root.appendChild(this.el);
    this.$mine = this.el.querySelector('.tm-mine'); this.$online = this.el.querySelector('.tm-online');
    this.el.querySelector('.pnl-x').addEventListener('click', () => this.close());
    this.el.addEventListener('pointerdown', (e) => { if (e.target === this.el) this.close(); });
    this.el.addEventListener('click', (e) => this._click(e));
    this.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) { const b = e.target.closest('.tm-form').querySelector('button'); b && b.click(); } if (e.target.matches('input') && e.key !== 'Escape') e.stopPropagation(); });
    this.el.addEventListener('keyup', (e) => { if (e.target.matches('input')) e.stopPropagation(); });

    // floating invite banner (visible during play as well; game may call acceptInvite()/declineInvite() from keys)
    this.banner = el(`<div class="team-invite hidden"><div class="ti-ico">✉</div>
      <div class="ti-t"><b class="ti-from"></b> invited you to join <b class="ti-team"></b>
        <div class="ti-s">Open the Team panel to answer, or press <kbd>Y</kbd> accept · <kbd>N</kbd> decline</div></div>
      <button class="btn small primary ti-a">Accept</button><button class="btn small ti-d">Decline</button><i class="ti-timer"></i></div>`);
    (document.getElementById('overlay-root') || document.body).appendChild(this.banner);
    this.banner.querySelector('.ti-a').addEventListener('click', () => this.acceptInvite());
    this.banner.querySelector('.ti-d').addEventListener('click', () => this.declineInvite());
    this.inviteAt = 0; this._inv = null;

    this._unsub = [];
    if (game.on) for (const ev of ['team', 'players', 'invite']) this._unsub.push(game.on(ev, () => { this._syncInvite(); if (this.opened) this.refresh(); }));
    this._tick = setInterval(() => this._syncInvite(), 500);
    this._onKey = (e) => {
      if (!this.hasInvite() || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target; if (t && /input|textarea/i.test(t.tagName)) return;
      if (e.code === 'KeyY') this.acceptInvite(); else if (e.code === 'KeyN') this.declineInvite();
    };
    window.addEventListener('keydown', this._onKey);
    this._syncInvite();
  }

  // ---- identity helpers (lead may set game.uid / game.selfName / game.myEid)
  _self() {
    const g = this.game, s = g.state;
    return { uid: g.uid ?? s.uid ?? g.me?.uid, name: g.selfName ?? g.name ?? s.name ?? g.me?.name, eid: g.myEid ?? g.eid ?? s.eid ?? g.me?.eid };
  }
  _iAmLeader(team) {
    const me = this._self();
    if (me.uid != null) return team.leader === me.uid;
    const lead = team.members.find((m) => m.uid === team.leader);
    if (lead && me.name) return lead.name.toLowerCase() === String(me.name).toLowerCase();
    if (lead && me.eid) return lead.eid === me.eid;
    return true; // unknown identity — the server enforces leadership anyway
  }
  _isMe(m) {
    const me = this._self();
    if (me.uid != null && m.uid != null) return m.uid === me.uid;
    if (me.eid && m.eid) return m.eid === me.eid;
    return !!(me.name && m.name && m.name.toLowerCase() === String(me.name).toLowerCase());
  }

  // ---- invite
  _syncInvite() {
    const inv = this.game.state.invite;
    if (inv !== this._inv) { this._inv = inv; this.inviteAt = inv ? performance.now() : 0; }
    const live = inv && performance.now() - this.inviteAt < 60000;
    this.banner.classList.toggle('hidden', !live || this.opened);
    if (live) {
      this.banner.querySelector('.ti-from').textContent = inv.from; this.banner.querySelector('.ti-team').textContent = `“${inv.team}”`;
      this.banner.querySelector('.ti-timer').style.width = Math.max(0, 100 - (performance.now() - this.inviteAt) / 600) + '%';
    }
  }
  hasInvite() { const inv = this.game.state.invite; return !!(inv && performance.now() - this.inviteAt < 60000); }
  acceptInvite() { if (!this.hasInvite()) return; this.game.send({ t: 'team', op: 'accept' }); this.game.state.invite = null; this._syncInvite(); if (this.opened) this.refresh(); }
  declineInvite() { if (!this.hasInvite()) return; this.game.send({ t: 'team', op: 'decline' }); this.game.state.invite = null; this._syncInvite(); if (this.opened) this.refresh(); }

  isOpen() { return this.opened; }
  toggle() { this.opened ? this.close() : this.open(); }
  open() {
    if (this.opened) return;
    this.opened = true; showPanel(this);
    this.game.uiOpened && this.game.uiOpened('panel');
    this.confirmLeave = 0; this._syncInvite(); this.refresh();
  }
  close() {
    if (!this.opened) return;
    this.opened = false; this.el.classList.add('hidden');
    hidePanel(this); this._syncInvite();
    this.game.uiClosed && this.game.uiClosed('panel');
  }
  destroy() { clearInterval(this._tick); window.removeEventListener('keydown', this._onKey); this._unsub.forEach((f) => f && f()); this.banner.remove(); }

  _send(op, name) { const m = { t: 'team', op }; if (name != null) m.name = name; this.game.send(m); this.game.audio && this.game.audio.ui && this.game.audio.ui('click'); }
  _click(e) {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const a = b.dataset.act;
    if (a === 'create') { const v = this.el.querySelector('.tm-name').value.trim(); this._send('create', v); }
    else if (a === 'invite') { this._send('invite', b.dataset.name); }
    else if (a === 'invite-box') { const i = this.el.querySelector('.tm-inv'); const v = i.value.trim(); if (v) { this._send('invite', v); i.value = ''; } }
    else if (a === 'kick') this._send('kick', b.dataset.name);
    else if (a === 'accept') this.acceptInvite();
    else if (a === 'decline') this.declineInvite();
    else if (a === 'leave') {
      if (this.confirmLeave) { this.confirmLeave = 0; clearTimeout(this._cl); this._send('leave'); }
      else { this.confirmLeave = 1; this._cl = setTimeout(() => { this.confirmLeave = 0; this.refresh(); }, 3000); this.refresh(); }
    }
  }

  refresh() {
    const s = this.game.state, team = s.team;
    this.el.classList.remove('hidden');
    // keep typed text / focus across re-render
    const keep = {}; for (const i of this.el.querySelectorAll('input')) keep[i.className] = [i.value, document.activeElement === i, i.selectionStart];
    // ---- left: your team
    let h = '';
    if (this.hasInvite()) {
      const inv = s.invite;
      h += `<div class="tm-invite"><div class="ti-big">✉</div><div><b>${esc(inv.from)}</b> invited you to join <b>“${esc(inv.team)}”</b></div>
        <div class="row"><button class="btn primary small" data-act="accept">Accept</button><button class="btn small" data-act="decline">Decline</button></div></div>`;
    }
    if (!team) {
      h += `<div class="tm-h">Your team</div>
        <div class="tm-empty"><svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="24" r="10" fill="#3a4f58"/><path d="M12 54c0-11 9-18 20-18s20 7 20 18z" fill="#3a4f58"/><path d="M50 8v12M44 14h12" stroke="#ff8a3c" stroke-width="4" stroke-linecap="round"/></svg>
        <p>You're flying solo. Start a team to see your friends on the map, share the wild and keep friendly fire off.</p></div>
        <div class="tm-form"><label class="field">Team name</label><div class="row"><input class="input tm-name" maxlength="20" placeholder="${esc((this._self().name || 'My') + '’s crew')}" autocomplete="off"><button class="btn primary" data-act="create">Create team</button></div></div>`;
    } else {
      const leader = this._iAmLeader(team), n = team.members.length;
      h += `<div class="tm-h">Your team</div>
        <div class="tm-name-card"><div class="tn-badge">${esc(team.name.slice(0, 1).toUpperCase())}</div><div><div class="tn-n">${esc(team.name)}</div><div class="tn-s">${n} / 8 members · ${team.members.filter((m) => m.online).length} online</div></div></div>
        <div class="tm-list">${team.members.map((m) => {
    const isLead = m.uid === team.leader, me = this._isMe(m);
    return `<div class="tm-row ${m.online ? '' : 'off'}"><span class="av" style="background:${avatarColor(m.name)}">${esc(m.name.slice(0, 1).toUpperCase())}<i class="dot ${m.online ? 'on' : ''}"></i></span>
            <span class="nm">${esc(m.name)}${me ? ' <em>you</em>' : ''}</span>${isLead ? '<span class="tag crown">★ Leader</span>' : ''}<span class="grow"></span>
            ${leader && !me ? `<button class="btn small danger" data-act="kick" data-name="${esc(m.name)}">Kick</button>` : ''}</div>`;
  }).join('')}</div>`;
      if (leader) h += `<div class="tm-form"><label class="field">Invite by name</label><div class="row"><input class="input tm-inv" maxlength="24" placeholder="Player name…" autocomplete="off"><button class="btn" data-act="invite-box">Invite</button></div></div>`;
      else h += `<div class="tm-note">Only the team leader can invite or kick.</div>`;
      h += `<div class="tm-foot"><button class="btn small ${this.confirmLeave ? 'danger' : 'ghost'}" data-act="leave">${this.confirmLeave ? 'Click again to leave' : 'Leave team'}</button></div>`;
    }
    this.$mine.innerHTML = h;

    // ---- right: players online
    const players = [...(s.players ? s.players.entries() : [])].map(([eid, p]) => ({ eid, name: p.name, team: p.team }));
    players.sort((a, b) => a.name.localeCompare(b.name));
    const me = this._self(), leader = team && this._iAmLeader(team);
    const memberNames = new Set(team ? team.members.map((m) => m.name.toLowerCase()) : []);
    let o = `<div class="tm-h">Players online <span class="tag">${players.length}</span></div><div class="tm-list scroll">`;
    if (!players.length) o += `<div class="tm-note">Nobody else is here yet. Share your invite code!</div>`;
    for (const p of players) {
      const isMe = (me.eid && p.eid === me.eid) || (me.name && p.name.toLowerCase() === String(me.name).toLowerCase());
      const mate = memberNames.has(p.name.toLowerCase());
      let act = '';
      if (isMe) act = '';
      else if (mate) act = '<span class="tag mate">Teammate</span>';
      else if (p.team) act = '<span class="tag">In a team</span>';
      else if (leader) act = `<button class="btn small" data-act="invite" data-name="${esc(p.name)}">Invite</button>`;
      else act = `<button class="btn small" disabled title="${team ? 'Only the leader can invite' : 'Create a team first'}">Invite</button>`;
      o += `<div class="tm-row"><span class="av" style="background:${avatarColor(p.name)}">${esc(p.name.slice(0, 1).toUpperCase())}<i class="dot on"></i></span><span class="nm">${esc(p.name)}${isMe ? ' <em>you</em>' : ''}</span><span class="grow"></span>${act}</div>`;
    }
    o += '</div>';
    if (!team) o += `<div class="tm-note">Create a team on the left, then invite players from this list.</div>`;
    this.$online.innerHTML = o;
    // restore inputs
    for (const i of this.el.querySelectorAll('input')) { const k = keep[i.className]; if (k) { i.value = k[0]; if (k[1]) { i.focus(); try { i.setSelectionRange(k[2], k[2]); } catch {} } } }
  }
}
