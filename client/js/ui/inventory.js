// Emberwild inventory, equipment, containers and crafting UI (Module B).
// Reads everything from game.state; sends intent messages via game.send and re-renders from state events.
import { ITEMS, RECIPES, HOTBAR, INV_SLOTS, EQUIP_SLOTS, SMELT, DEPLOY } from '/shared/items.js';
import { iconHTML, itemTip } from './icons.js';

const BACKPACK_START = HOTBAR;
const QUEUE_MAX = 8;
const EQ_LABEL = ['Head', 'Chest', 'Legs', 'Feet'];
const EQ_GHOST = ['cloth_hood', 'cloth_shirt', 'cloth_pants', 'cloth_boots'];

const CRAFT_CATS = [
  ['all', 'All'], ['tools', 'Tools'], ['weapons', 'Weapons'], ['ammo', 'Ammo'], ['armor', 'Armor'], ['deploy', 'Deployables'], ['survival', 'Survival'], ['mats', 'Materials'],
];
const CAT_TO_GROUP = { tool: 'tools', build: 'tools', melee: 'weapons', gun: 'weapons', bow: 'weapons', ammo: 'ammo', armor: 'armor', deploy: 'deploy', food: 'survival', med: 'survival', seed: 'survival', res: 'mats', bp: 'mats' };
const CAT_ACCENT = { gun: '#ff8a6a', bow: '#ff8a6a', melee: '#ff8a6a', armor: '#a78bfa', bp: '#4aa3e8', med: '#e2554b', ammo: '#d9a441', deploy: '#ffb457' };
const BENCH_NAME = ['Hand', 'Workbench I', 'Workbench II'];

// small inline glyphs (no emoji dependency)
const GL = {
  flame: '<svg viewBox="10 0 44 64" class="gl"><path d="M32 4c4 10 16 16 16 32a16 16 0 0 1-32 0c0-8 4-12 8-16 0 6 3 8 5 8-2-10 0-18 3-24z" fill="currentColor"/><path d="M32 30c3 5 8 8 8 14a8 8 0 0 1-16 0c0-4 3-6 5-9 0 3 1 4 3 4z" fill="#ffd25a"/></svg>',
  lock: '<svg viewBox="0 0 24 24" class="gl"><path d="M7 11V8a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><rect x="4.5" y="11" width="15" height="10.5" rx="2.5" fill="currentColor"/></svg>',
  clock: '<svg viewBox="0 0 24 24" class="gl"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 7v5.5l3.5 2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  star: '<svg viewBox="0 0 24 24" class="gl"><path d="M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L12 17.4 6.1 20.7l1.3-6.6L2.5 9.5l6.6-.8z" fill="currentColor"/></svg>',
  shield: '<svg viewBox="0 0 24 24" class="gl"><path d="M12 2.5l8 3v6.5c0 5-3.4 8.4-8 9.8-4.6-1.400-8-4.800-8-9.800V5.500z" fill="currentColor"/></svg>',
  therm: '<svg viewBox="0 0 24 24" class="gl"><path d="M10 3.500a2 2 0 0 1 4 0v9.200a4.500 4.500 0 1 1-4 0z" fill="currentColor"/></svg>',
  bench: '<svg viewBox="0 0 24 24" class="gl"><path d="M2.500 8.500h19v3h-19zM5 11.500h2.500V21H5zM16.500 11.500H19V21h-2.500z" fill="currentColor"/></svg>',
  x: '<svg viewBox="0 0 24 24" class="gl"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  search: '<svg viewBox="0 0 24 24" class="gl"><circle cx="10.500" cy="10.500" r="6.500" fill="none" stroke="currentColor" stroke-width="2.600"/><path d="M15.500 15.500L21 21" stroke="currentColor" stroke-width="2.800" stroke-linecap="round"/></svg>',
  box: '<svg viewBox="0 0 24 24" class="gl"><path d="M3 7.500L12 3l9 4.500v9L12 21l-9-4.500z" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linejoin="round"/><path d="M3 7.500L12 12l9-4.500M12 12v9" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linejoin="round"/></svg>',
  hammer: '<svg viewBox="0 0 24 24" class="gl"><path d="M14 4l6 6-3 3-6-6zM12 10L4 18l2 2 8-8z" fill="currentColor"/></svg>',
};

const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtN = (n) => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : String(n));
const fmtT = (s) => (s >= 60 ? Math.floor(s / 60) + 'm ' + Math.round(s % 60) + 's' : (Math.round(s * 10) / 10) + 's');
const sameRef = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];

export class InventoryUI {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.opened = false;
    this.tab = 'craft'; // 'craft' | 'cont'
    this.dismissedObj = null;
    this.cat = 'all';
    this.search = '';
    this.onlyCraftable = false;
    this.selR = null;
    this.qty = 1;
    this.drag = null; this.pending = null; this.lastClick = null;
    this.hoverRef = null; this.hoverEl = null;
    this.contKey = '';
    this._html = {};
    this._qBase = { t: 0, at: 0 };
    this._raf = 0; this._dirty = false;
    this.unsubs = [];
    this._build();
    this._bind();
    for (const ev of ['inv', 'craftq', 'learned', 'level', 'perks', 'vit']) {
      this.unsubs.push(game.on(ev, () => { if (ev === 'craftq') this._qBase = { t: (this.S.craftQ && this.S.craftQ[0] ? this.S.craftQ[0].t : 0) || 0, at: performance.now() }; this._schedule(); }));
    }
    this.unsubs.push(game.on('cont', () => { this.dismissedObj = null; if (this.opened) { this.tab = 'cont'; } this._schedule(); }));
    this.unsubs.push(game.on('contx', () => { if (this.tab === 'cont') this.tab = 'craft'; this._schedule(); }));
    import('../app.js').then((m) => { this.app = m.app; }).catch(() => {});
  }

  get S() { return this.game.state; }
  isOpen() { return this.opened; }
  dispose() { this.unsubs.forEach((u) => u && u()); cancelAnimationFrame(this._raf); }

  // ------------------------------------------------------------------ open / close
  open(tab = 'inventory') {
    const was = this.opened;
    this.opened = true;
    this.root.classList.remove('hidden');
    if (tab === 'crafting') this.tab = 'craft';
    else if (this.hasCont()) this.tab = 'cont';
    else if (!was || this.tab === 'cont') this.tab = 'craft';
    if (!was) { try { this.game.uiOpened('inventory'); } catch (e) { /* ignore */ } this._snd('click'); }
    this.refresh(true);
    this._loop();
  }
  close() {
    if (!this.opened) return;
    this._cancelDrag(); this._hideMenu(); this._hideTip();
    this.opened = false;
    this.root.classList.add('hidden');
    if (this.S.cont) { this.game.send({ t: 'close' }); this.dismissedObj = this.S.cont; }
    try { this.game.uiClosed('inventory'); } catch (e) { /* ignore */ }
    this._snd('back');
  }
  toggle() { if (this.opened) this.close(); else this.open(); }
  hasCont() { return !!(this.S.cont && this.S.cont !== this.dismissedObj); }

  _snd(n) { try { this.app && this.app.audio && this.app.audio.ui(n); } catch (e) { /* ignore */ } }

  // ------------------------------------------------------------------ DOM build
  _build() {
    const r = this.root;
    r.classList.add('inv-root');
    r.innerHTML = `
    <div class="inv-back">
      <div class="inv-shell panel">
        <div class="inv-head">
          <div class="inv-title"><span class="brand">${GL.flame}</span><h2>Inventory</h2></div>
          <div class="inv-hint"><span><kbd>LMB</kbd> drag stack</span><span><kbd>RMB</kbd> drag half</span><span><kbd>Ctrl</kbd> drag one</span><span><kbd>Shift</kbd>/dbl-click quick move</span><span>Drop outside to throw</span></div>
          <button class="inv-x" data-act="close" title="Close (Esc)">${GL.x}</button>
        </div>
        <div class="inv-body">
          <section class="inv-left">
            <div class="inv-sec">
              <div class="sec-h"><span>Equipment</span></div>
              <div class="doll">
                <div class="eq-col"></div>
                <div class="doll-fig">${this._dollSVG()}</div>
                <div class="doll-stats"></div>
              </div>
            </div>
            <div class="inv-sec">
              <div class="sec-h"><span>Backpack</span><em class="pack-count"></em></div>
              <div class="grid pack"></div>
            </div>
            <div class="inv-sec">
              <div class="sec-h"><span>Hotbar</span></div>
              <div class="grid hot"></div>
            </div>
          </section>
          <section class="inv-right">
            <div class="tabs inv-tabs"></div>
            <div class="pane pane-craft"></div>
            <div class="pane pane-cont"></div>
          </section>
        </div>
      </div>
    </div>
    <div class="inv-tip hidden"></div>
    <div class="inv-menu hidden"></div>
    <div class="inv-ghost hidden"></div>`;
    const q = (s) => r.querySelector(s);
    this.el = {
      shell: q('.inv-shell'), eqCol: q('.eq-col'), stats: q('.doll-stats'), fig: q('.doll-fig'), pack: q('.pack'), hot: q('.hot'), packCount: q('.pack-count'),
      tabs: q('.inv-tabs'), craft: q('.pane-craft'), cont: q('.pane-cont'), tip: q('.inv-tip'), menu: q('.inv-menu'), ghost: q('.inv-ghost'),
    };
    // fixed slots
    this.slots = { inv: [], eq: [], c: [] };
    for (let i = 0; i < 4; i++) { const el = this._mkSlot('eq', i, { label: EQ_LABEL[i], ghost: EQ_GHOST[i] }); this.el.eqCol.appendChild(el); this.slots.eq[i] = el; }
    for (let i = BACKPACK_START; i < INV_SLOTS; i++) { const el = this._mkSlot('inv', i); this.el.pack.appendChild(el); this.slots.inv[i] = el; }
    for (let i = 0; i < HOTBAR; i++) { const el = this._mkSlot('inv', i, { key: i + 1 }); this.el.hot.appendChild(el); this.slots.inv[i] = el; }
    this._buildCraft();
  }

  _dollSVG() {
    return `<svg viewBox="0 0 80 190" class="doll-svg">
      <g class="d-feet"><path d="M18 178 Q18 168 26 166 L36 166 L36 178 Q36 184 30 184 L20 184 Q18 184 18 178Z"/><path d="M62 178 Q62 168 54 166 L44 166 L44 178 Q44 184 50 184 L60 184 Q62 184 62 178Z"/></g>
      <g class="d-legs"><path d="M22 96 H40 L39 168 H26Z"/><path d="M58 96 H40 L41 168 H54Z"/></g>
      <g class="d-chest"><path d="M24 48 H56 L60 62 L58 100 H22 L20 62Z"/><path d="M22 52 L8 58 L4 100 L14 102 L20 70Z"/><path d="M58 52 L72 58 L76 100 L66 102 L60 70Z"/></g>
      <g class="d-head"><rect x="34" y="38" width="12" height="12" rx="3"/><circle cx="40" cy="22" r="16"/></g>
    </svg>`;
  }

  _mkSlot(kind, i, o = {}) {
    const el = document.createElement('div');
    el.className = 'slot inv-slot';
    el.dataset.k = kind; el.dataset.i = i;
    let h = '';
    if (o.key) h += `<span class="key">${o.key}</span>`;
    if (o.label) h += `<span class="lab">${o.label}</span>`;
    if (o.tag) h += `<span class="lab">${o.tag}</span>`;
    h += '<div class="si"></div>';
    el.innerHTML = h;
    el._si = el.querySelector('.si');
    el._ghost = o.ghost || null;
    if (o.tip) el.dataset.tip = o.tip;
    if (kind === 'eq') el.dataset.tip = `${EQ_LABEL[i]} slot — accepts ${EQ_LABEL[i].toLowerCase()} armor`;
    return el;
  }

  // ------------------------------------------------------------------ painting
  _schedule() { if (!this.opened || this._dirty) return; this._dirty = true; requestAnimationFrame(() => { this._dirty = false; if (this.opened) this.refresh(); }); }

  refresh(force = false) {
    if (!this.opened) return;
    const S = this.S;
    if (this.tab === 'cont' && !this.hasCont()) this.tab = 'craft';
    if (this.drag) { const it = this._item(this.drag.ref); if (!it || it.id !== this.drag.item.id) this._cancelDrag(); }
    for (let i = 0; i < 4; i++) this._paintSlot(this.slots.eq[i], S.eq ? S.eq[i] : null);
    let used = 0;
    for (let i = 0; i < INV_SLOTS; i++) {
      const it = S.inv ? S.inv[i] : null;
      if (i >= BACKPACK_START && it) used++;
      this._paintSlot(this.slots.inv[i], it);
      if (i < HOTBAR) this.slots.inv[i].classList.toggle('sel', i === S.sel);
    }
    this.el.packCount.textContent = `${used}/${INV_SLOTS - BACKPACK_START}`;
    this._paintDoll();
    this._paintTabs();
    this.el.craft.classList.toggle('on', this.tab === 'craft');
    this.el.cont.classList.toggle('on', this.tab === 'cont');
    this._renderCraft(force);
    if (this.tab === 'cont') this._renderCont();
    this._refreshTip();
  }

  _paintSlot(el, it) {
    if (!el) return;
    const key = it ? `${it.id}|${it.n}|${it.dur}|${it.ammo}` : '';
    if (el._key !== key) {
      el._key = key;
      el.classList.toggle('filled', !!it);
      if (it && ITEMS[it.id]) {
        const d = ITEMS[it.id];
        let h = iconHTML(it.id, 'ico');
        if (it.n > 1) h += `<span class="cnt">${fmtN(it.n)}</span>`;
        if (d.dur && it.dur != null) {
          const p = clamp(it.dur / d.dur, 0, 1);
          h += `<span class="dur"><i style="width:${p * 100}%;background:${p > 0.5 ? 'var(--leaf)' : p > 0.25 ? 'var(--gold)' : 'var(--danger)'}"></i></span>`;
          el.classList.add('hasdur');
        } else el.classList.remove('hasdur');
        if (d.gun && d.gun.type === 'gun' && it.ammo != null) h += `<span class="ammo">${it.ammo}</span>`;
        el._si.innerHTML = h;
        el.style.setProperty('--cc', CAT_ACCENT[d.cat] || 'transparent');
        el.dataset.cat = d.cat;
      } else {
        el.classList.remove('hasdur');
        el._si.innerHTML = el._ghost ? `<span class="ghost">${iconHTML(el._ghost, 'ico')}</span>` : '';
        el.dataset.cat = '';
      }
    }
  }

  _paintDoll() {
    const S = this.S;
    let armor = 0, warm = 0;
    for (let i = 0; i < 4; i++) {
      const it = S.eq && S.eq[i];
      const d = it && ITEMS[it.id];
      if (d) { armor += d.armor || 0; warm += d.warmth || 0; }
      const g = this.el.fig.querySelector('.d-' + ['head', 'chest', 'legs', 'feet'][i]);
      if (g) { g.style.fill = d ? d.color : ''; g.classList.toggle('worn', !!d); }
    }
    const html = `<div class="ds"><span class="ds-ic shield">${GL.shield}</span><div><b>${Math.round(armor * 100)}%</b><small>Armor</small></div></div>
      <div class="ds"><span class="ds-ic warm">${GL.therm}</span><div><b>${warm > 0 ? '+' : ''}${warm}°</b><small>Warmth</small></div></div>
      <div class="ds"><span class="ds-ic lvl">${GL.star}</span><div><b>${S.level || 1}</b><small>Level</small></div></div>`;
    this._set('stats', this.el.stats, html);
  }

  _set(key, el, html) { if (this._html[key] !== html) { this._html[key] = html; el.innerHTML = html; return true; } return false; }

  _paintTabs() {
    const c = this.S.cont;
    let h = `<div class="tab ${this.tab === 'craft' ? 'on' : ''}" data-tab="craft">${GL.hammer}<span>Crafting</span></div>`;
    if (this.hasCont()) {
      h += `<div class="tab ${this.tab === 'cont' ? 'on' : ''}" data-tab="cont">${GL.box}<span>${esc(c.title || 'Container')}</span><button class="tab-x" data-act="closecont" title="Close container">${GL.x}</button></div>`;
    }
    this._set('tabs', this.el.tabs, h);
  }

  // ------------------------------------------------------------------ container panel
  _renderCont() {
    const S = this.S, c = S.cont;
    if (!c) return;
    const box = this.el.cont;
    const n = (c.slots || []).length;
    const key = `${c.k}:${c.id}:${c.kind}:${n}`;
    if (key !== this.contKey) {
      this.contKey = key;
      this.slots.c = [];
      this._html.contHead = null;
      box.innerHTML = '<div class="cont-h"></div><div class="cont-body"></div>';
      const body = box.querySelector('.cont-body');
      const mk = (i, o) => { const el = this._mkSlot('c', i, o); this.slots.c[i] = el; return el; };
      const wrap = (cls, inner) => { const d = document.createElement('div'); d.className = cls; if (inner) d.innerHTML = inner; return d; };
      if (c.kind === 'furnace' || c.kind === 'campfire') {
        const nIn = c.kind === 'furnace' ? 3 : 2;
        const dev = wrap('dev ' + c.kind);
        const fuel = wrap('dev-col dev-fuel', '<div class="dev-lbl">Fuel</div>'); fuel.appendChild(mk(0, { tip: 'Fuel — accepts Wood' })); fuel.insertAdjacentHTML('beforeend', '<div class="dev-note">Wood</div>');
        const inp = wrap('dev-col dev-in', `<div class="dev-lbl">${c.kind === 'furnace' ? 'Ore' : 'Raw food'}</div>`);
        for (let i = 1; i <= nIn; i++) inp.appendChild(mk(i, { tip: c.kind === 'furnace' ? 'Input — accepts Iron Ore' : 'Input — accepts Raw Meat' }));
        const mid = wrap('dev-mid', `<button class="flame-btn" data-act="flame"><span class="flame-ico">${GL.flame}</span><b></b></button><div class="prog"><i></i></div><small class="prog-t"></small><div class="fuelbar" title="Fuel remaining"><i></i></div>`);
        const out = wrap('dev-col dev-out', '<div class="dev-lbl">Output</div>');
        for (let i = nIn + 1; i < n; i++) out.appendChild(mk(i, { tip: 'Output — take items from here' }));
        dev.append(fuel, inp, mid, out);
        body.appendChild(dev);
        body.insertAdjacentHTML('beforeend', `<div class="dev-help">${c.kind === 'furnace' ? 'Add <b>Wood</b> as fuel and <b>Iron Ore</b> as input, then light the furnace. Ingots appear on the right.' : 'Add <b>Wood</b> as fuel and <b>Raw Meat</b> as input, then light the fire to cook.'}</div>`);
      } else if (c.kind === 'turret') {
        const dev = wrap('dev turret', '<div class="dev-lbl wide">Ammunition</div>');
        const row = wrap('dev-row');
        for (let i = 0; i < n; i++) row.appendChild(mk(i, { tip: 'Ammo — accepts 9mm Rounds' }));
        dev.appendChild(row);
        dev.insertAdjacentHTML('beforeend', '<div class="dev-note turret-note"></div>');
        body.appendChild(dev);
      } else {
        const cols = n <= 6 ? Math.max(1, n) : n === 8 ? 4 : n === 10 ? 5 : 6;
        const g = wrap('grid cgrid' + (n <= 10 ? ' big' : '')); g.style.setProperty('--cols', cols);
        for (let i = 0; i < n; i++) g.appendChild(mk(i));
        body.appendChild(g);
      }
    }
    for (let i = 0; i < n; i++) this._paintSlot(this.slots.c[i], c.slots[i]);
    // header
    const sub = c.sub || {};
    const plain = !['furnace', 'campfire', 'turret'].includes(c.kind);
    const cnt = (c.slots || []).filter(Boolean).length;
    const head = `<div class="cont-title">${esc(c.title || 'Container')}</div>
      ${sub.lk ? `<span class="lockbadge" title="Locked with a code lock">${GL.lock}<span>Locked</span></span>` : ''}
      <span class="cont-count">${cnt}/${n} slots</span>
      ${plain ? `<button class="btn small" data-act="takeall" ${cnt ? '' : 'disabled'}>Take all</button>` : ''}`;
    const bodyEl = box.querySelector('.cont-body');
    let em = bodyEl.querySelector('.cont-empty');
    if (plain && !cnt) { if (!em) { em = document.createElement('div'); em.className = 'cont-empty'; em.textContent = 'Empty'; bodyEl.appendChild(em); } } else if (em) em.remove();
    this._set('contHead', box.querySelector('.cont-h'), head);
    // device readouts
    if (c.kind === 'furnace' || c.kind === 'campfire') {
      const dev = box.querySelector('.dev');
      const nIn = c.kind === 'furnace' ? 3 : 2;
      let time = c.kind === 'furnace' ? 8 : 10;
      for (let i = 1; i <= nIn; i++) { const it = c.slots[i]; const s = it && SMELT[c.kind] && SMELT[c.kind][it.id]; if (s) { time = s[1]; break; } }
      const pct = sub.on ? clamp((sub.prog || 0) / time, 0, 1) : clamp((sub.prog || 0) / time, 0, 1);
      const burnMax = (DEPLOY[c.kind] && DEPLOY[c.kind].burn) || 10;
      const btn = box.querySelector('.flame-btn');
      btn.classList.toggle('on', !!sub.on);
      btn.querySelector('b').textContent = sub.on ? 'Extinguish' : 'Light';
      box.querySelector('.prog i').style.width = pct * 100 + '%';
      box.querySelector('.prog').classList.toggle('run', !!sub.on && pct > 0);
      box.querySelector('.prog-t').textContent = sub.on ? (pct > 0 ? `${Math.round(pct * 100)}%` : 'Burning') : 'Off';
      box.querySelector('.fuelbar i').style.width = clamp((sub.burn || 0) / burnMax, 0, 1) * 100 + '%';
      dev.classList.toggle('lit', !!sub.on);
    } else if (c.kind === 'turret') {
      let rounds = 0; for (const it of c.slots) if (it) rounds += it.n;
      box.querySelector('.turret-note').innerHTML = `<b>${rounds}</b> rounds loaded · shoots strangers on sight`;
    }
  }

  // ------------------------------------------------------------------ crafting
  _buildCraft() {
    this.el.craft.innerHTML = `
      <div class="cr-top">
        <div class="cr-search"><span class="si-ic">${GL.search}</span><input class="input" type="text" placeholder="Search recipes…" maxlength="24" spellcheck="false"><button class="cr-clear hidden" data-act="clearsearch">${GL.x}</button></div>
        <label class="cr-only"><input type="checkbox"><span>Craftable</span></label>
        <div class="cr-bench"></div>
      </div>
      <div class="cr-cats"></div>
      <div class="cr-main">
        <div class="cr-list"></div>
        <div class="cr-detail"></div>
      </div>
      <div class="cr-queue"></div>`;
    const c = this.el.craft;
    this.el.search = c.querySelector('.cr-search input');
    this.el.only = c.querySelector('.cr-only input');
    this.el.clear = c.querySelector('.cr-clear');
    this.el.bench = c.querySelector('.cr-bench');
    this.el.cats = c.querySelector('.cr-cats');
    this.el.list = c.querySelector('.cr-list');
    this.el.detail = c.querySelector('.cr-detail');
    this.el.queue = c.querySelector('.cr-queue');
    const stop = (e) => e.stopPropagation();
    this.el.search.addEventListener('keydown', (e) => { stop(e); if (e.key === 'Escape') { if (this.search) { this.search = ''; this.el.search.value = ''; this.el.clear.classList.add('hidden'); this._resetScroll = true; this._renderCraft(true); e.preventDefault(); } else this.el.search.blur(); } });
    this.el.search.addEventListener('keyup', stop);
    this.el.search.addEventListener('input', () => { this.search = this.el.search.value.trim().toLowerCase(); this.el.clear.classList.toggle('hidden', !this.search); this._resetScroll = true; this._renderCraft(true); });
    this.el.only.addEventListener('change', () => { this.onlyCraftable = this.el.only.checked; this._resetScroll = true; this._renderCraft(true); });
  }

  _have() {
    const m = {};
    for (const it of this.S.inv || []) if (it) m[it.id] = (m[it.id] || 0) + it.n;
    return m;
  }
  _status(r, have) {
    const S = this.S;
    let lock = null;
    const g = r.gate;
    if (g) {
      if (g.level && (S.level || 1) < g.level) lock = { short: `Level ${g.level}`, long: `Requires level ${g.level}` };
      else if (g.bp && !(S.learned || []).includes(g.bp)) lock = { short: 'Blueprint needed', long: `Requires the ${ITEMS[g.bp] ? ITEMS[g.bp].name : 'blueprint'}` };
    }
    let max = Infinity;
    for (const [id, n] of Object.entries(r.ing)) max = Math.min(max, Math.floor((have[id] || 0) / n));
    if (!isFinite(max)) max = 0;
    const benchOk = r.bench <= (S.benchTier || 0);
    const qFull = (S.craftQ || []).length >= QUEUE_MAX && !(S.craftQ || []).some((q) => q.r === r.id);
    const rank = lock ? 3 : (max > 0 && benchOk) ? 0 : max > 0 ? 1 : 2;
    return { lock, max, benchOk, qFull, rank, craftable: !lock && max > 0 && benchOk };
  }
  _craftTime(r) { return r.time * (1 - 0.1 * ((this.S.perks && this.S.perks.craft) || 0)); }

  _renderCraft(force) {
    if (this.tab !== 'craft' && !force) { /* still keep state fresh cheaply */ }
    const S = this.S;
    const have = this._have();
    // bench indicator
    const tier = S.benchTier || 0;
    this._set('bench', this.el.bench, `<span class="bench-ind t${tier}">${GL.bench}<span>${tier ? BENCH_NAME[tier] + ' nearby' : 'No workbench nearby'}</span></span>`);
    // build list
    const all = RECIPES.map((r, idx) => ({ r, idx, st: this._status(r, have), d: ITEMS[r.out] })).filter((x) => x.d);
    const counts = {};
    for (const x of all) { const g = CAT_TO_GROUP[x.d.cat] || 'mats'; x.g = g; counts[g] = (counts[g] || 0) + 1; }
    counts.all = all.length;
    this._set('cats', this.el.cats, CRAFT_CATS.map(([id, label]) => `<button class="chip-cat ${this.cat === id ? 'on' : ''} ${counts[id] ? '' : 'empty'}" data-cat="${id}">${label}<i>${counts[id] || 0}</i></button>`).join(''));
    let rows = all.filter((x) => (this.cat === 'all' || x.g === this.cat)
      && (!this.search || x.d.name.toLowerCase().includes(this.search) || x.r.id.includes(this.search) || Object.keys(x.r.ing).some((k) => (ITEMS[k] ? ITEMS[k].name.toLowerCase() : k).includes(this.search)))
      && (!this.onlyCraftable || x.st.craftable));
    rows.sort((a, b) => a.st.rank - b.st.rank || a.idx - b.idx);
    if (!rows.find((x) => x.r.id === this.selR)) this.selR = rows.length ? rows[0].r.id : null;
    const listHtml = rows.length ? rows.map((x) => this._rowHTML(x, have)).join('') : `<div class="cr-empty">${this.onlyCraftable ? 'Nothing craftable right now.<br><small>Gather more resources or find a workbench.</small>' : 'No recipes match.'}</div>`;
    const st = this.el.list.scrollTop;
    if (this._set('list', this.el.list, listHtml)) this.el.list.scrollTop = this._resetScroll ? 0 : st;
    this._resetScroll = false;
    // detail
    const sel = all.find((x) => x.r.id === this.selR);
    this._set('detail', this.el.detail, sel ? this._detailHTML(sel, have) : '<div class="cr-empty">Select a recipe</div>');
    this._renderQueue();
  }

  _rowHTML(x, have) {
    const { r, d, st } = x;
    const chips = Object.entries(r.ing).map(([id, n]) => {
      const ok = (have[id] || 0) >= n;
      return `<span class="chip ${ok ? 'ok' : 'no'}" title="${esc(ITEMS[id] ? ITEMS[id].name : id)}: ${have[id] || 0}/${n}">${iconHTML(id, 'ci')}<b>${n}</b></span>`;
    }).join('');
    const cls = ['rc', this.selR === r.id ? 'sel' : '', st.lock ? 'locked' : st.craftable ? 'ok' : 'lack'].join(' ');
    const benchBadge = r.bench ? `<span class="badge bench ${st.benchOk ? 'ok' : 'no'}" title="${BENCH_NAME[r.bench]}">${GL.bench}<span>${r.bench === 1 ? 'I' : 'II'}</span></span>` : '';
    return `<div class="${cls}" data-r="${r.id}">
      <div class="rc-ico">${iconHTML(r.out, 'ico')}${st.lock ? `<span class="lk">${GL.lock}</span>` : ''}${r.n > 1 ? `<span class="rn">×${r.n}</span>` : ''}</div>
      <div class="rc-main"><div class="rc-name">${esc(d.name)}</div>
        ${st.lock ? `<div class="rc-lock">${GL.lock}<span>${st.lock.short}</span></div>` : `<div class="rc-ing">${chips}</div>`}</div>
      <div class="rc-side">${benchBadge}<span class="badge time">${GL.clock}<span>${fmtT(this._craftTime(r))}</span></span></div>
    </div>`;
  }

  _detailHTML(x, have) {
    const { r, d, st } = x;
    const ings = Object.entries(r.ing).map(([id, n]) => {
      const h = have[id] || 0; const ok = h >= n;
      return `<div class="ing ${ok ? 'ok' : 'no'}">${iconHTML(id, 'ci')}<span class="in">${esc(ITEMS[id] ? ITEMS[id].name : id)}</span><b>${fmtN(h)}<i>/</i>${n}</b></div>`;
    }).join('');
    const maxN = clamp(st.max, 0, 20);
    const want = this.qty === 'max' ? Math.max(1, maxN) : this.qty;
    const n = clamp(Math.min(want, Math.max(1, maxN)), 1, 20);
    const bench = r.bench ? `${BENCH_NAME[r.bench]}` : 'Anywhere';
    const total = this._craftTime(r) * n;
    let reason = '';
    if (st.lock) reason = st.lock.long;
    else if (!st.benchOk) reason = `Stand near a ${BENCH_NAME[r.bench]}`;
    else if (st.max < 1) reason = 'Missing ingredients';
    else if (st.qFull) reason = 'Crafting queue is full';
    const can = !reason;
    const qtys = [[1, '1'], [5, '5'], [10, '10'], ['max', 'Max']].map(([v, l]) => `<button class="qty ${this.qty === v ? 'on' : ''}" data-q="${v}">${l}${v === 'max' && st.max > 0 ? `<i>${maxN}</i>` : ''}</button>`).join('');
    const btn = `<button class="btn primary big craft-btn ${can ? '' : 'why'}" data-act="craft" ${can ? '' : 'disabled'}>${can ? `Craft${n > 1 ? ' ×' + n : ''}` : (st.lock ? GL.lock : '') + '<span>' + esc(reason) + '</span>'}</button>`;
    const tip = itemTip(r.out, null).replace('tip-name', 'tip-name big');
    const i1 = tip.indexOf('<div class="tip-rows">');
    const tipHead = i1 < 0 ? tip : tip.slice(0, i1), tipRows = i1 < 0 ? '' : tip.slice(i1);
    return `<div class="dt-scroll">${tipHead}
      <div class="dt-sec"><div class="dt-h">Ingredients</div><div class="ings">${ings}</div></div>
      <div class="dt-meta">
        <span title="Crafting time">${GL.clock}<b>${fmtT(this._craftTime(r))}</b></span>
        <span class="${st.benchOk ? '' : 'bad'}" title="Bench required">${GL.bench}<b>${bench}</b></span>
        <span title="Experience">${GL.star}<b>${r.xp || 0} XP</b></span>
        ${r.n > 1 ? `<span class="mk">Makes <b>×${r.n}</b></span>` : ''}
      </div>
      ${tipRows ? `<div class="dt-sec"><div class="dt-h">Stats</div>${tipRows}</div>` : ''}</div>
      <div class="dt-foot">
        <div class="qtys">${qtys}<span class="tot">${GL.clock} ${fmtT(total)}</span></div>
        ${btn}
      </div>`;
  }

  _renderQueue() {
    const S = this.S, q = S.craftQ || [];
    const items = q.map((c, i) => {
      const r = RECIPES.find((x) => x.id === c.r); if (!r) return '';
      return `<div class="qi ${i === 0 ? 'head' : ''}" data-qi="${i}" title="${esc(ITEMS[r.out].name)} ×${c.n * r.n}">${iconHTML(r.out, 'ico')}<span class="qn">×${c.n}</span>${i === 0 ? '<span class="qbar"><i></i></span>' : ''}<button class="qx" data-cq="${i}" title="Cancel and refund">${GL.x}</button></div>`;
    }).join('');
    const html = `<div class="q-h"><span>Queue</span><em>${q.length ? `${q.length}/${QUEUE_MAX}` : ''}</em></div><div class="q-items">${items || '<span class="q-empty">Nothing crafting — pick a recipe and hit Craft.</span>'}</div>`;
    if (this._set('queue', this.el.queue, html)) this._qHead = this.el.queue.querySelector('.qi.head .qbar i');
    this._tickQueue();
  }

  _tickQueue() {
    const q = this.S.craftQ || [];
    if (!q.length) return;
    const c = q[0], r = RECIPES.find((x) => x.id === c.r);
    if (!r) return;
    const need = this._craftTime(r);
    const paused = r.bench > (this.S.benchTier || 0);
    const t = paused ? c.t || 0 : (this._qBase.t || 0) + (performance.now() - this._qBase.at) / 1000;
    const bar = this.el.queue.querySelector('.qi.head .qbar i');
    if (bar) bar.style.width = clamp(t / need, 0, 1) * 100 + '%';
    const qi = this.el.queue.querySelector('.qi.head');
    if (qi) qi.classList.toggle('paused', paused);
  }

  _loop() {
    cancelAnimationFrame(this._raf);
    const f = () => {
      if (!this.opened) return;
      this._tickQueue();
      this._raf = requestAnimationFrame(f);
    };
    this._raf = requestAnimationFrame(f);
  }

  // ------------------------------------------------------------------ events
  _bind() {
    const r = this.root;
    r.addEventListener('contextmenu', (e) => e.preventDefault());
    r.addEventListener('pointerdown', (e) => this._down(e));
    r.addEventListener('click', (e) => this._click(e));
    r.addEventListener('dblclick', (e) => {
      const rc = e.target.closest('.rc');
      if (rc && !this.drag) { const rec = RECIPES.find((x) => x.id === rc.dataset.r); if (rec && this._status(rec, this._have()).craftable) this._craft(rec.id, 1); }
    });
    r.addEventListener('pointerover', (e) => this._over(e));
    r.addEventListener('pointerout', (e) => { const s = e.target.closest && e.target.closest('.slot[data-k]'); if (s && !s.contains(e.relatedTarget)) { this.hoverRef = null; this.hoverEl = null; this._hideTip(); } });
    r.addEventListener('pointermove', (e) => { this._mx = e.clientX; this._my = e.clientY; if (!this.drag && this.el.tip && !this.el.tip.classList.contains('hidden')) this._placeTip(e.clientX, e.clientY); });
    window.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', (e) => this._up(e));
    window.addEventListener('pointercancel', () => this._cancelDrag());
    window.addEventListener('blur', () => this._cancelDrag());
    window.addEventListener('keydown', (e) => {
      if (!this.opened || e.key !== 'Escape') return;
      if (this.drag || this.pending) { this._cancelDrag(); e.stopPropagation(); e.preventDefault(); }
      else if (!this.el.menu.classList.contains('hidden')) { this._hideMenu(); e.stopPropagation(); e.preventDefault(); }
    }, true);
    window.addEventListener('pointerdown', (e) => { if (!this.el.menu.classList.contains('hidden') && !e.target.closest('.inv-menu')) this._hideMenu(); }, true);
    r.addEventListener('wheel', () => this._hideMenu(), { passive: true });
  }

  _click(e) {
    const t = e.target;
    const act = t.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'close') return this.close();
      if (a === 'closecont') { e.stopPropagation(); return this._closeCont(); }
      if (a === 'takeall') return this._takeAll();
      if (a === 'flame') { const c = this.S.cont; if (c) this.game.send({ t: 'use', k: 'dep', id: c.id, tog: true }); return; }
      if (a === 'craft') { const rec = RECIPES.find((x) => x.id === this.selR); if (rec) { const st = this._status(rec, this._have()); const maxN = clamp(st.max, 1, 20); const n = this.qty === 'max' ? maxN : Math.min(this.qty, maxN); this._craft(rec.id, n); } return; }
      if (a === 'clearsearch') { this._resetScroll = true; this.search = ''; this.el.search.value = ''; this.el.clear.classList.add('hidden'); return this._renderCraft(true); }
    }
    const tab = t.closest('[data-tab]');
    if (tab) { this.tab = tab.dataset.tab; this.refresh(true); return; }
    const cat = t.closest('[data-cat]');
    if (cat) { this.cat = cat.dataset.cat; this._resetScroll = true; this._renderCraft(true); return; }
    const q = t.closest('[data-q]');
    if (q) { this.qty = q.dataset.q === 'max' ? 'max' : +q.dataset.q; this._renderCraft(true); return; }
    const cq = t.closest('[data-cq]');
    if (cq) { this.game.send({ t: 'cancelcraft', i: +cq.dataset.cq }); this._snd('click'); return; }
    const rc = t.closest('.rc');
    if (rc) { this.selR = rc.dataset.r; this._renderCraft(true); this._snd('click'); }
  }

  _craft(id, n) { this.game.send({ t: 'craft', r: id, n }); this._snd('click'); }

  _closeCont() {
    this.game.send({ t: 'close' });
    this.dismissedObj = this.S.cont; this.tab = 'craft'; this.refresh(true);
  }

  _takeAll() {
    const c = this.S.cont; if (!c) return;
    const idx = []; c.slots.forEach((it, i) => { if (it) idx.push(i); });
    idx.forEach((i, k) => setTimeout(() => { if (this.S.cont === c || (this.S.cont && this.S.cont.id === c.id)) this.game.send({ t: 'qm', a: ['c', i] }); }, k * 60));
  }

  // ------------------------------------------------------------------ item / slot helpers
  _refOf(el) { const s = el && el.closest && el.closest('.slot[data-k]'); return s ? [s.dataset.k, +s.dataset.i] : null; }
  _item(ref) {
    if (!ref) return null;
    const S = this.S;
    if (ref[0] === 'inv') return (S.inv && S.inv[ref[1]]) || null;
    if (ref[0] === 'eq') return (S.eq && S.eq[ref[1]]) || null;
    if (ref[0] === 'c') return (S.cont && S.cont.slots && S.cont.slots[ref[1]]) || null;
    return null;
  }
  _slotEl(ref) { return ref && this.slots[ref[0]] ? this.slots[ref[0]][ref[1]] : null; }
  // mirror of server slotAccepts (only used to hint / pre-filter; server validates)
  _accepts(ref, id) {
    const d = ITEMS[id]; if (!d) return false;
    if (ref[0] === 'eq') return d.cat === 'armor' && EQUIP_SLOTS[ref[1]] === d.slot;
    if (ref[0] === 'c') {
      const kind = this.S.cont && this.S.cont.kind, i = ref[1];
      if (kind === 'furnace') { if (i === 0) return id === 'wood'; return i >= 1 && i <= 3 && id === 'iron_ore'; }
      if (kind === 'campfire') { if (i === 0) return id === 'wood'; return (i === 1 || i === 2) && id === 'raw_meat'; }
      if (kind === 'turret') return id === 'pistol_ammo';
    }
    return true;
  }
  _restricted(ref) {
    if (ref[0] === 'eq') return true;
    if (ref[0] === 'c') { const k = this.S.cont && this.S.cont.kind; return k === 'furnace' || k === 'campfire' || k === 'turret'; }
    return false;
  }

  // ------------------------------------------------------------------ drag & drop
  _down(e) {
    if (e.button !== 0 && e.button !== 2) return;
    if (e.target.closest('.inv-menu')) return;
    const slot = e.target.closest('.slot[data-k]');
    if (!slot || !this.root.contains(slot)) return;
    const ref = this._refOf(slot), it = this._item(ref);
    if (!it) return;
    this._hideMenu();
    this.pending = { ref, item: it, btn: e.button, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, x: e.clientX, y: e.clientY, id: e.pointerId };
    e.preventDefault();
  }

  _move(e) {
    this._mx = e.clientX; this._my = e.clientY;
    const p = this.pending;
    if (p && !this.drag) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 5) this._startDrag(e);
    }
    if (this.drag) { this._updateDrag(e); }
  }

  _startDrag(e) {
    const p = this.pending;
    const it = this._item(p.ref);
    if (!it) { this.pending = null; return; }
    let n = it.n;
    if (p.btn === 2) n = Math.max(1, Math.ceil(it.n / 2));
    else if (p.ctrl) n = 1;
    this.drag = { ref: p.ref, item: it, n, btn: p.btn };
    this.pending = null;
    this._hideTip(); this._hideMenu();
    const g = this.el.ghost;
    g.innerHTML = `${iconHTML(it.id, 'ico')}${n > 1 ? `<span class="cnt">${fmtN(n)}</span>` : ''}<span class="gl-drop">Drop</span>`;
    g.classList.remove('hidden', 'drop');
    this.root.classList.add('dragging');
    const src = this._slotEl(p.ref); if (src) src.classList.add('dragging');
    // mark targets
    for (const k of ['eq', 'inv', 'c']) {
      (this.slots[k] || []).forEach((el, i) => {
        if (!el) return;
        const ref = [k, i];
        if (!this._restricted(ref)) return;
        el.classList.add(this._accepts(ref, it.id) ? 'tgt-ok' : 'tgt-no');
      });
    }
    this._updateDrag(e);
  }

  _updateDrag(e) {
    const g = this.el.ghost;
    g.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const inShell = under && under.closest('.inv-shell');
    g.classList.toggle('drop', !inShell);
    const ref = under && inShell ? this._refOf(under) : null;
    if (!sameRef(ref, this.drag.over)) {
      const old = this._slotEl(this.drag.over); if (old) old.classList.remove('over-ok', 'over-bad');
      this.drag.over = ref;
      const el = this._slotEl(ref);
      if (el) { const ok = !sameRef(ref, this.drag.ref) && this._accepts(ref, this.drag.item.id); if (!sameRef(ref, this.drag.ref)) el.classList.add(ok ? 'over-ok' : 'over-bad'); }
    }
  }

  _endDragUI() {
    const d = this.drag;
    this.root.classList.remove('dragging');
    this.el.ghost.classList.add('hidden');
    this.root.querySelectorAll('.tgt-ok,.tgt-no,.over-ok,.over-bad,.dragging').forEach((el) => el.classList.remove('tgt-ok', 'tgt-no', 'over-ok', 'over-bad', 'dragging'));
    this.drag = null;
    return d;
  }
  _cancelDrag() { this.pending = null; if (this.drag) this._endDragUI(); }

  _up(e) {
    if (!this.opened) { this.pending = null; return; }
    if (this.drag) {
      const d = this.drag;
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const inShell = under && under.closest('.inv-shell');
      this._endDragUI();
      if (!inShell) {
        // outside every panel: throw into the world
        if (under && under.closest('.inv-tip,.inv-menu')) return;
        this.game.send({ t: 'drop', a: d.ref, n: d.n });
        this._snd('click');
        return;
      }
      const to = this._refOf(under);
      if (!to || sameRef(to, d.ref)) return;
      if (!this._accepts(to, d.item.id)) { const el = this._slotEl(to); if (el) { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 350); } this._snd('error'); return; }
      this.game.send({ t: 'mv_item', a: d.ref, b: to, n: d.n });
      const el = this._slotEl(to); if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 400); }
      this._snd('click');
      return;
    }
    const p = this.pending;
    this.pending = null;
    if (!p) return;
    // a click (no drag)
    const it = this._item(p.ref);
    if (!it) return;
    if (p.btn === 2) return this._showMenu(p.ref, e.clientX, e.clientY);
    if (p.shift) { this._quickMove(p.ref); return; }
    const now = performance.now();
    if (this.lastClick && sameRef(this.lastClick.ref, p.ref) && now - this.lastClick.t < 380) { this.lastClick = null; this._quickMove(p.ref); return; }
    this.lastClick = { ref: p.ref, t: now };
    if (p.ref[0] === 'inv' && p.ref[1] < HOTBAR && this.S.sel !== p.ref[1]) this.game.send({ t: 'sel', i: p.ref[1] });
  }

  _quickMove(ref) { this.game.send({ t: 'qm', a: ref }); this._snd('click'); }

  // ------------------------------------------------------------------ context menu
  _firstEmpty(from, to) { const inv = this.S.inv || []; for (let i = from; i < to; i++) if (!inv[i]) return i; return -1; }

  _showMenu(ref, x, y) {
    const it = this._item(ref); if (!it) return;
    const d = ITEMS[it.id];
    const items = [];
    const S = this.S;
    if (ref[0] === 'inv') {
      if (d.cat === 'armor') items.push(['Equip', () => this._quickMove(ref), 'primary']);
      else if (d.cat === 'food' || d.cat === 'med') items.push(['Use', () => this._hold(ref, true), 'primary']);
      else if (d.cat === 'bp') items.push(['Learn blueprint', () => this._hold(ref, true), 'primary']);
      else if (d.deploy || d.cat === 'seed') items.push(['Hold to place', () => this._hold(ref, true), 'primary']);
      else if (d.melee || d.gun || d.power || d.cat === 'build' || d.cat === 'tool') items.push(['Hold in hand', () => this._hold(ref, false), 'primary']);
      if (it.n > 1) items.push(['Split stack', () => this._split(ref)]);
      if (ref[1] >= HOTBAR) { const e = this._firstEmpty(0, HOTBAR); items.push([e >= 0 ? 'Move to hotbar' : 'Hotbar full', e >= 0 ? () => this._mv(ref, ['inv', e], it.n) : null]); }
      else { const e = this._firstEmpty(HOTBAR, INV_SLOTS); items.push([e >= 0 ? 'Move to backpack' : 'Backpack full', e >= 0 ? () => this._mv(ref, ['inv', e], it.n) : null]); }
      if (this.hasCont() && S.cont) items.push([`Move to ${S.cont.title ? S.cont.title.toLowerCase() : 'container'}`, () => this._quickMove(ref)]);
    } else if (ref[0] === 'eq') {
      items.push(['Unequip', () => this._quickMove(ref), 'primary']);
    } else {
      items.push(['Take', () => this._quickMove(ref), 'primary']);
      if (it.n > 1) items.push(['Take half', () => { const e = this._firstEmpty(BACKPACK_START, INV_SLOTS); if (e >= 0) this._mv(ref, ['inv', e], Math.ceil(it.n / 2)); }]);
    }
    if (it.n > 1) items.push([`Drop 1`, () => this.game.send({ t: 'drop', a: ref, n: 1 }), 'danger']);
    items.push([it.n > 1 ? `Drop all (${it.n})` : 'Drop', () => this.game.send({ t: 'drop', a: ref, n: it.n }), 'danger']);
    const m = this.el.menu;
    m.innerHTML = `<div class="mh">${iconHTML(it.id, 'ci')}<span>${esc(d.name)}</span></div>` + items.map((a, i) => `<button class="mi ${a[2] || ''}" data-mi="${i}" ${a[1] ? '' : 'disabled'}>${esc(a[0])}</button>`).join('');
    m._items = items;
    m.classList.remove('hidden');
    m.querySelectorAll('.mi').forEach((b) => b.addEventListener('click', () => { const f = items[+b.dataset.mi][1]; this._hideMenu(); if (f) f(); }));
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = clamp(x + 2, 6, innerWidth - w - 6) + 'px';
    m.style.top = clamp(y + 2, 6, innerHeight - h - 6) + 'px';
    this._hideTip();
  }
  _hideMenu() { this.el.menu.classList.add('hidden'); }

  _mv(a, b, n) { this.game.send({ t: 'mv_item', a, b, n }); }
  _split(ref) { const it = this._item(ref); const e = this._firstEmpty(BACKPACK_START, INV_SLOTS) >= 0 ? this._firstEmpty(BACKPACK_START, INV_SLOTS) : this._firstEmpty(0, HOTBAR); if (e < 0 || !it) return; this._mv(ref, ['inv', e], Math.floor(it.n / 2) || 1); }
  // put an item in hand: select its hotbar slot (moving it there first when it lives in the backpack)
  _hold(ref, closeAfter) {
    let i = ref[1];
    if (i >= HOTBAR) {
      let e = this._firstEmpty(0, HOTBAR);
      if (e < 0) e = this.S.sel || 0; // swap with the currently selected slot
      this._mv(ref, ['inv', e], this._item(ref).n);
      i = e;
    }
    this.game.send({ t: 'sel', i });
    if (closeAfter) this.close();
  }

  // ------------------------------------------------------------------ tooltip
  _over(e) {
    if (this.drag) return;
    const slot = e.target.closest && e.target.closest('.slot[data-k]');
    if (!slot) return;
    this.hoverEl = slot; this.hoverRef = [slot.dataset.k, +slot.dataset.i];
    this._showTip(e.clientX, e.clientY);
  }
  _refreshTip() { if (this.hoverEl && !this.drag && this.el.menu.classList.contains('hidden')) this._showTip(this._mx || 0, this._my || 0, true); }
  _showTip(x, y, keep) {
    if (!this.hoverRef || !this.hoverEl || !this.hoverEl.isConnected) { this._hideTip(); return; }
    const it = this._item(this.hoverRef);
    let html;
    if (it && ITEMS[it.id]) html = itemTip(it.id, it);
    else if (this.hoverEl.dataset.tip) html = `<div class="tip-desc only">${esc(this.hoverEl.dataset.tip)}</div>`;
    else { this._hideTip(); return; }
    const t = this.el.tip;
    if (t._h !== html) { t.innerHTML = html; t._h = html; }
    t.classList.remove('hidden');
    if (!keep || t._placed !== true) this._placeTip(x, y);
    t._placed = true;
  }
  _placeTip(x, y) {
    const t = this.el.tip;
    const w = t.offsetWidth, h = t.offsetHeight, m = 10;
    let px = x + 18, py = y + 18;
    if (px + w > innerWidth - m) px = x - w - 14;
    if (py + h > innerHeight - m) py = y - h - 14;
    t.style.left = clamp(px, m, Math.max(m, innerWidth - w - m)) + 'px';
    t.style.top = clamp(py, m, Math.max(m, innerHeight - h - m)) + 'px';
  }
  _hideTip() { this.el.tip.classList.add('hidden'); this.el.tip._placed = false; this.hoverRef = null; this.hoverEl = null; }
}
