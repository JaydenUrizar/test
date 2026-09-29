// Throw-away harness: mock `game` with a tiny local server simulation so drag/drop and crafting visibly work.
import { ITEMS, RECIPE, INV_SLOTS, EQUIP_SLOTS, HOTBAR, SMELT, DEPLOY } from '/shared/items.js';
import { InventoryUI } from '/js/ui/inventory.js';
import { iconHTML } from '/js/ui/icons.js';

const qs = new URLSearchParams(location.search);

if (qs.get('sheet')) {
  const d = document.createElement('div'); d.id = 'sheet';
  d.innerHTML = '<div class="g">' + Object.keys(ITEMS).map((id) => `<div class="c"><div class="row">${iconHTML(id, 'big')}<div class="slot filled">${iconHTML(id, 'ico')}</div></div><span>${id}</span></div>`).join('') + '</div>';
  document.body.appendChild(d); window.ready = true;
} else {
  const mk = (id, n = 1) => { const d = ITEMS[id]; const it = { id, n: Math.min(n, d.stack) }; if (d.dur) it.dur = d.dur; if (d.gun && d.gun.mag) it.ammo = d.gun.mag; return it; };
  const inv = Array(INV_SLOTS).fill(null);
  const put = (i, id, n) => { inv[i] = mk(id, n); };
  put(0, 'stone_hatchet'); inv[0].dur = 90; put(1, 'revolver'); inv[1].dur = 300; inv[1].ammo = 4; put(2, 'bandage', 5); put(3, 'torch'); put(4, 'cooked_meat', 12); put(5, 'pistol_ammo', 87);
  put(6, 'wood', 640); put(7, 'stone', 210); put(8, 'fiber', 55); put(9, 'cloth', 33); put(10, 'iron_ingot', 42); put(11, 'scrap', 18); put(12, 'gunpowder', 25);
  put(13, 'iron_ore', 64); put(14, 'raw_meat', 9); put(15, 'iron_helmet'); put(16, 'cloth_shirt'); put(17, 'iron_boots'); put(18, 'medkit', 2); put(19, 'bp_revolver'); put(20, 'water_bottle', 4);
  put(21, 'hide', 6); put(22, 'sulfur_ore', 30); put(23, 'workbench_1', 1); put(24, 'campfire', 2); put(25, 'corn_seed', 14); put(26, 'smg'); put(27, 'rifle_ammo', 40); put(28, 'shell', 12); put(29, 'iron_greaves');
  const state = {
    inv, eq: [null, null, null, null], sel: 0, cont: null, craftQ: [], learned: [], level: +(qs.get('level') || 3), xp: 120, xpNext: 400, points: 1, perks: { craft: 1 },
    vit: {}, benchTier: +(qs.get('bench') || 1), disc: new Set(), team: null, invite: null, players: new Map(), teamPos: new Map(), waypoint: null,
  };
  const subs = {};
  const game = {
    state, sent: [],
    on(ev, fn) { (subs[ev] ||= new Set()).add(fn); return () => subs[ev].delete(fn); },
    emit(ev) { (subs[ev] || []).forEach((f) => f()); },
    uiOpened(n) { log('uiOpened ' + n); }, uiClosed(n) { log('uiClosed ' + n); },
    send(m) { game.sent.push(m); log(JSON.stringify(m)); sim(m); },
  };
  const logEl = document.getElementById('log');
  function log(t) { logEl.innerHTML = (t + '<br>' + logEl.innerHTML).slice(0, 2500); }

  // ---- tiny server simulation (mirrors server/inventory.js semantics closely enough)
  const maxStack = (id) => ITEMS[id].stack || 1;
  function accepts(kind, i, id) {
    const d = ITEMS[id]; if (!d) return false;
    if (kind === 'eq') return d.cat === 'armor' && EQUIP_SLOTS[i] === d.slot;
    if (kind === 'furnace') { if (i === 0) return id === 'wood'; return i >= 1 && i <= 3 && id === 'iron_ore'; }
    if (kind === 'campfire') { if (i === 0) return id === 'wood'; return (i === 1 || i === 2) && id === 'raw_meat'; }
    if (kind === 'turret') return id === 'pistol_ammo';
    return true;
  }
  function moveSlot(fs, fi, ts, ti, n, okFrom, okTo) {
    const a = fs[fi]; if (!a) return false; if (fs === ts && fi === ti) return false; if (!okTo(a.id)) return false;
    n = Math.max(1, Math.min(n || a.n, a.n)); const b = ts[ti];
    if (!b) { if (n === a.n) { ts[ti] = a; fs[fi] = null; } else { ts[ti] = { ...a, n }; a.n -= n; } return true; }
    if (b.id === a.id && maxStack(a.id) > 1) { const t = Math.min(n, maxStack(a.id) - b.n); if (t <= 0) return false; b.n += t; a.n -= t; if (a.n <= 0) fs[fi] = null; return true; }
    if (n === a.n && okFrom(b.id)) { ts[ti] = a; fs[fi] = b; return true; }
    return false;
  }
  const ref = (r) => {
    if (r[0] === 'inv') return { slots: state.inv, i: r[1], kind: 'inv' };
    if (r[0] === 'eq') return { slots: state.eq, i: r[1], kind: 'eq' };
    if (r[0] === 'c' && state.cont) return { slots: state.cont.slots, i: r[1], kind: state.cont.kind };
    return null;
  };
  const count = (id) => state.inv.reduce((s, it) => s + (it && it.id === id ? it.n : 0), 0);
  function give(id, n) { for (let i = 0; i < INV_SLOTS && n > 0; i++) { const s = state.inv[i]; if (s && s.id === id && s.n < maxStack(id)) { const t = Math.min(n, maxStack(id) - s.n); s.n += t; n -= t; } } for (let i = 0; i < INV_SLOTS && n > 0; i++) if (!state.inv[i]) { const t = Math.min(n, maxStack(id)); state.inv[i] = mk(id, t); n -= t; } }
  function take(id, n) { for (let i = INV_SLOTS - 1; i >= 0 && n > 0; i--) { const s = state.inv[i]; if (s && s.id === id) { const t = Math.min(n, s.n); s.n -= t; n -= t; if (s.n <= 0) state.inv[i] = null; } } }
  const ev = (...e) => e.forEach((x) => game.emit(x));

  function sim(m) {
    switch (m.t) {
      case 'mv_item': { const a = ref(m.a), b = ref(m.b); if (!a || !b) return; if (moveSlot(a.slots, a.i, b.slots, b.i, m.n, (id) => accepts(a.kind, a.i, id), (id) => accepts(b.kind, b.i, id))) ev('inv', 'cont'); break; }
      case 'drop': { const a = ref(m.a); if (!a || !a.slots[a.i]) return; const it = a.slots[a.i]; const n = Math.min(m.n || it.n, it.n); it.n -= n; if (it.n <= 0) a.slots[a.i] = null; log(`dropped ${n}x ${it.id}`); ev('inv', 'cont'); break; }
      case 'sel': state.sel = m.i; ev('inv'); break;
      case 'qm': {
        const a = ref(m.a); if (!a || !a.slots[a.i]) return; const it = a.slots[a.i]; const d = ITEMS[it.id];
        let target;
        if (a.kind === 'inv') { if (state.cont) target = { slots: state.cont.slots, kind: state.cont.kind, r: [0, state.cont.slots.length] }; else if (d.cat === 'armor') { const si = EQUIP_SLOTS.indexOf(d.slot); if (moveSlot(a.slots, a.i, state.eq, si, it.n, () => true, (id) => accepts('eq', si, id))) return ev('inv'); } else if (a.i >= HOTBAR) target = { slots: state.inv, kind: 'inv', r: [0, HOTBAR] }; else target = { slots: state.inv, kind: 'inv', r: [HOTBAR, INV_SLOTS] }; }
        else target = { slots: state.inv, kind: 'inv', r: [0, INV_SLOTS] };
        if (!target) return; let left = it.n;
        for (let pass = 0; pass < 2 && left > 0; pass++) for (let i = target.r[0]; i < target.r[1] && left > 0; i++) {
          if (!accepts(target.kind, i, it.id)) continue; const s = target.slots[i];
          if (pass === 0 && s && s.id === it.id && maxStack(it.id) > 1) { const t = Math.min(left, maxStack(it.id) - s.n); s.n += t; left -= t; }
          else if (pass === 1 && !s) { target.slots[i] = { ...it, n: left }; left = 0; }
        }
        if (left === it.n) return; if (left <= 0) a.slots[a.i] = null; else it.n = left; ev('inv', 'cont'); break;
      }
      case 'craft': {
        const r = RECIPE[m.r]; if (!r) return; const n = Math.max(1, Math.min(20, m.n | 0));
        if (r.gate && ((r.gate.level && state.level < r.gate.level) || (r.gate.bp && !state.learned.includes(r.gate.bp)))) return log('locked');
        if (r.bench > state.benchTier) return log('need bench');
        for (const [id, c] of Object.entries(r.ing)) if (count(id) < c * n) return log('missing');
        for (const [id, c] of Object.entries(r.ing)) take(id, c * n);
        const last = state.craftQ[state.craftQ.length - 1];
        if (last && last.r === r.id) last.n += n; else state.craftQ.push({ r: r.id, n, t: 0 });
        ev('inv', 'craftq'); break;
      }
      case 'cancelcraft': { const c = state.craftQ[m.i]; if (!c) return; const r = RECIPE[c.r]; for (const [id, cnt] of Object.entries(r.ing)) give(id, cnt * c.n); state.craftQ.splice(m.i, 1); ev('inv', 'craftq'); break; }
      case 'use': if (m.tog && state.cont && state.cont.sub) { state.cont.sub.on = !state.cont.sub.on; if (state.cont.sub.on && !state.cont.slots[0]) { state.cont.sub.on = false; log('add wood first'); } ev('cont'); } break;
      case 'close': log('container closed'); state.cont = null; break;
    }
  }
  // crafting + furnace ticks
  setInterval(() => {
    const q = state.craftQ[0];
    if (q) {
      const r = RECIPE[q.r];
      if (r.bench <= state.benchTier) {
        q.t += 0.25;
        if (q.t >= r.time * 0.9) { q.t = 0; q.n--; give(r.out, r.n); if (q.n <= 0) state.craftQ.shift(); ev('inv'); }
        ev('craftq');
      }
    }
    const c = state.cont;
    if (c && c.sub && c.sub.on && (c.kind === 'furnace' || c.kind === 'campfire')) {
      const nIn = c.kind === 'furnace' ? 3 : 2;
      c.sub.burn = Math.max(0, (c.sub.burn || 0) - 0.25);
      if (c.sub.burn <= 0) { if (c.slots[0]) { c.slots[0].n--; if (c.slots[0].n <= 0) c.slots[0] = null; c.sub.burn = DEPLOY[c.kind].burn; } else c.sub.on = false; }
      let src = -1; for (let i = 1; i <= nIn; i++) if (c.slots[i] && SMELT[c.kind][c.slots[i].id]) { src = i; break; }
      if (src >= 0) {
        const [out, t] = SMELT[c.kind][c.slots[src].id];
        c.sub.prog += 0.25;
        if (c.sub.prog >= t) { c.sub.prog = 0; c.slots[src].n--; if (c.slots[src].n <= 0) c.slots[src] = null; for (let i = nIn + 1; i < c.slots.length; i++) { if (c.slots[i] && c.slots[i].id === out) { c.slots[i].n++; break; } if (!c.slots[i]) { c.slots[i] = mk(out, 1); break; } } }
      } else c.sub.prog = 0;
      ev('cont');
    }
  }, 250);

  function openCont(kind) {
    const S = (n) => Array(n).fill(null);
    const m = (arr) => { const s = S(arr.n); arr.items.forEach(([i, id, n]) => { s[i] = mk(id, n); }); return s; };
    if (kind === 'furnace') state.cont = { k: 'dep', id: 1, kind, title: 'Furnace', slots: m({ n: 7, items: [[0, 'wood', 40], [1, 'iron_ore', 30], [4, 'iron_ingot', 6]] }), sub: { on: true, burn: 6, prog: 3, lk: false } };
    else if (kind === 'campfire') state.cont = { k: 'dep', id: 2, kind, title: 'Campfire', slots: m({ n: 5, items: [[0, 'wood', 12], [1, 'raw_meat', 5], [3, 'cooked_meat', 2]] }), sub: { on: false, burn: 0, prog: 0, lk: false } };
    else if (kind === 'turret') state.cont = { k: 'dep', id: 3, kind, title: 'Auto Turret', slots: m({ n: 3, items: [[0, 'pistol_ammo', 60], [1, 'pistol_ammo', 24]] }), sub: { on: false, burn: 0, prog: 0, lk: true } };
    else if (kind === 'box') state.cont = { k: 'dep', id: 4, kind, title: 'Storage Box', slots: m({ n: 18, items: [[0, 'wood', 200], [1, 'scrap', 40], [2, 'canned_beans', 3], [5, 'medkit', 1], [7, 'bp_smg', 1]] }), sub: { on: false, burn: 0, prog: 0, lk: true } };
    else if (kind === 'bag') state.cont = { k: 'dep', id: 6, kind, title: "Rex's belongings", slots: m({ n: 36, items: [[0, 'rifle', 1], [1, 'rifle_ammo', 20], [2, 'cloth_hood', 1], [3, 'iron_chestplate', 1], [4, 'berries', 20]] }) };
    else state.cont = { k: 'crate', id: 5, kind: 'crate', title: 'Supply Crate', slots: m({ n: 8, items: [[0, 'scrap', 8], [1, 'iron_ingot', 5], [2, 'bandage', 3], [3, 'bp_iron_tools', 1], [4, 'pistol_ammo', 12], [6, 'revolver', 1]] }) };
    game.emit('cont');
  }

  const ui = new InventoryUI(game, document.getElementById('inv-root'));
  window.H = { game, ui, openCont };
  const tab = qs.get('tab') === 'crafting' ? 'crafting' : 'inventory';
  if (qs.get('cont')) openCont(qs.get('cont'));
  if (qs.get('open') !== '0') ui.open(tab);
  addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); ui.toggle(); } else if (e.key === 'Escape' && ui.isOpen()) ui.close(); });
  window.ready = true;
}
