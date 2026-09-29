// Settings (tabs) and the controls guide with click-to-rebind.
import { ACTIONS, PRESETS, keyLabel } from '../../settings.js';
import { $, $$, el, esc, icon } from './util.js';

const head = (title, right = '') => `<div class="mn-head"><button type="button" class="btn small ghost mn-back">${icon('back', 'sm')} Back</button><h2>${title}</h2><div class="mn-head-r">${right}</div></div>`;
const pct = (v) => `${Math.round(v * 100)}%`;

export function settingsScreens(ctx) {
  const S = () => ctx.settings;

  // ================================================================== settings
  const TABS = [
    { id: 'graphics', label: 'Graphics', rows: [
      { type: 'preset' },
      { k: 'viewDistance', type: 'range', label: 'View distance', desc: 'How far you can see. Lower this if the game stutters.', min: 150, max: 700, step: 10, fmt: (v) => `${v} m` },
      { k: 'shadows', type: 'seg', label: 'Shadows', desc: 'Dynamic shadows are the most demanding effect.', opts: [['off', 'Off'], ['medium', 'Medium'], ['high', 'High']] },
      { k: 'fov', type: 'range', label: 'Field of view', desc: 'A wider view shows more of the world around you.', min: 60, max: 110, step: 1, fmt: (v) => `${v}°` },
    ] },
    { id: 'audio', label: 'Audio', rows: [
      { k: 'master', type: 'range', label: 'Master volume', desc: 'Overall loudness.', min: 0, max: 1, step: 0.01, fmt: pct, tick: true },
      { k: 'sfx', type: 'range', label: 'Effects', desc: 'Footsteps, tools, weapons and interface sounds.', min: 0, max: 1, step: 0.01, fmt: pct, tick: true },
      { k: 'music', type: 'range', label: 'Music', desc: 'Ambient score.', min: 0, max: 1, step: 0.01, fmt: pct },
      { k: 'ambience', type: 'range', label: 'Ambience', desc: 'Wind, birds, crackling fires and night sounds.', min: 0, max: 1, step: 0.01, fmt: pct },
    ] },
    { id: 'gameplay', label: 'Gameplay', rows: [
      { k: 'sensitivity', type: 'range', label: 'Mouse sensitivity', desc: 'How fast the camera turns.', min: 0.2, max: 3, step: 0.05, fmt: (v) => `${(+v).toFixed(2)}×` },
      { k: 'adsSensitivity', type: 'range', label: 'Aim sensitivity', desc: 'Multiplier applied while aiming down sights.', min: 0.2, max: 1.5, step: 0.05, fmt: (v) => `${(+v).toFixed(2)}×` },
      { k: 'invertY', type: 'switch', label: 'Invert Y axis', desc: 'Move the mouse up to look down.' },
      { k: 'headBob', type: 'switch', label: 'Head bob', desc: 'Camera sway while walking and running.' },
      { k: 'damageNumbers', type: 'switch', label: 'Damage numbers', desc: 'Floating numbers when you hit something.' },
      { k: 'showFps', type: 'switch', label: 'FPS counter', desc: 'Show frames per second on screen.' },
      { k: 'crosshair', type: 'switch', label: 'Crosshair', desc: 'Show the aiming dot in first person.' },
      { k: 'hintTips', type: 'switch', label: 'Hints & tips', desc: 'Show tutorial hints as you play.' },
    ] },
  ];

  function settingsScreen() {
    let tab = 'graphics';
    const node = el(`<div class="mn-screen mn-settings"><div class="panel mn-frame small">
      ${head('Settings')}
      <div class="tabs" role="tablist">${TABS.map((t) => `<button type="button" class="tab" role="tab" data-tab="${t.id}">${t.label}</button>`).join('')}</div>
      <div class="mn-set-body"></div>
      <div class="mn-foot"><span class="mn-note">${icon('check', 'sm')}<span>Changes are saved automatically.</span></span><span class="mn-sp"></span><button type="button" class="btn primary" data-act="done">Done</button></div>
    </div></div>`);
    const body = $('.mn-set-body', node);
    $('.mn-back', node).addEventListener('click', () => ctx.back());
    $('[data-act=done]', node).addEventListener('click', () => ctx.back());

    function paint() {
      $$('.tab', node).forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      const T = TABS.find((t) => t.id === tab);
      body.innerHTML = T.rows.map((r, i) => {
        if (r.type === 'preset') return `<div class="mn-set-row"><div class="mn-set-l"><b>Quality preset</b><small>One-click defaults for view distance and shadows.</small></div><div class="mn-set-r"><div class="mn-seg" data-preset>${Object.keys(PRESETS).map((p) => `<button type="button" data-p="${p}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}<button type="button" data-p="custom" disabled>Custom</button></div></div></div>`;
        const id = `st-${r.k}`;
        let ctl = '';
        if (r.type === 'range') ctl = `<input type="range" id="${id}" data-k="${r.k}" min="${r.min}" max="${r.max}" step="${r.step}" aria-label="${esc(r.label)}"><b class="mn-val" data-vk="${r.k}"></b>`;
        else if (r.type === 'switch') ctl = `<label class="mn-switch"><input type="checkbox" id="${id}" data-k="${r.k}" aria-label="${esc(r.label)}"><i></i></label>`;
        else if (r.type === 'seg') ctl = `<div class="mn-seg" data-k="${r.k}" role="radiogroup" aria-label="${esc(r.label)}">${r.opts.map(([v, l]) => `<button type="button" data-v="${v}" role="radio">${l}</button>`).join('')}</div>`;
        return `<div class="mn-set-row"><label class="mn-set-l" for="${r.type === 'seg' ? '' : id}"><b>${r.label}</b><small>${r.desc}</small></label><div class="mn-set-r">${ctl}</div></div>`;
      }).join('');
      sync();
    }
    function sync() {
      const T = TABS.find((t) => t.id === tab), s = S();
      for (const r of T.rows) {
        if (r.type === 'preset') {
          const cur = Object.keys(PRESETS).find((p) => PRESETS[p].viewDistance === s.get('viewDistance') && PRESETS[p].shadows === s.get('shadows')) || 'custom';
          $$('[data-p]', body).forEach((b) => { const on = b.dataset.p === cur; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.disabled = b.dataset.p === 'custom' && cur !== 'custom'; if (b.dataset.p === 'custom') b.classList.toggle('hidden', cur !== 'custom'); });
          continue;
        }
        const v = s.get(r.k);
        if (r.type === 'range') { const inp = $(`[data-k="${r.k}"]`, body); if (inp && document.activeElement !== inp) inp.value = v; const o = $(`[data-vk="${r.k}"]`, body); if (o) o.textContent = r.fmt(v); if (inp) inp.style.setProperty('--fill', `${((v - r.min) / (r.max - r.min)) * 100}%`); }
        else if (r.type === 'switch') { const inp = $(`[data-k="${r.k}"]`, body); if (inp) inp.checked = !!v; }
        else if (r.type === 'seg') $$(`[data-k="${r.k}"] [data-v]`, body).forEach((b) => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
      }
    }
    body.addEventListener('input', (e) => {
      const k = e.target.dataset && e.target.dataset.k; if (!k) return;
      if (e.target.type !== 'range') return;
      S().set(k, +e.target.value);
      sync();
    });
    body.addEventListener('change', (e) => {
      const k = e.target.dataset && e.target.dataset.k; if (!k) return;
      if (e.target.type === 'checkbox') { S().set(k, e.target.checked); ctx.sfx('click'); }
      const r = TABS.flatMap((t) => t.rows).find((x) => x.k === k);
      if (r && r.tick) ctx.sfx('click');
      sync();
    });
    body.addEventListener('click', (e) => {
      const p = e.target.closest('[data-p]'); if (p && p.dataset.p !== 'custom') { S().applyPreset(p.dataset.p); sync(); return; }
      const v = e.target.closest('[data-v]'); if (v) { S().set(v.parentElement.dataset.k, v.dataset.v); sync(); }
    });
    $$('.tab', node).forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; paint(); }));
    const off = S().on(() => sync());
    paint();
    return { el: node, back: () => ctx.show(ctx.backTarget()), destroy() { off && off(); } };
  }

  // ================================================================== controls
  function controlsScreen() {
    let listening = null, cleanupCap = null;
    const node = el(`<div class="mn-screen mn-controls"><div class="panel mn-frame">
      ${head('Controls', `<button type="button" class="btn small ghost" data-act="reset">Reset to defaults</button>`)}
      <div class="mn-ctl-main">
        <div class="mn-ctl-keys"><p class="mn-note">${icon('bulb', 'sm')}<span>Click an action, then press the new key. <b>Esc</b> cancels. Pressing a key that's already used swaps the two.</span></p><div class="mn-keygrid"></div></div>
        <div class="mn-ctl-side">
          <section><h4>${icon('mouse', 'sm')} Mouse</h4>
            <div class="mn-mrow"><kbd>Move</kbd><span>Look around</span></div>
            <div class="mn-mrow"><kbd>Left click</kbd><span>Attack, use the held item, place a piece</span></div>
            <div class="mn-mrow"><kbd>Right click</kbd><span>Aim down sights</span></div>
            <div class="mn-mrow"><kbd>Wheel</kbd><span>Cycle the hotbar</span></div>
            <div class="mn-mrow"><kbd>1 – 6</kbd><span>Select a hotbar slot (fixed)</span></div>
          </section>
          <section><h4>${icon('keyboard', 'sm')} Inventory</h4>
            <div class="mn-mrow"><kbd>Drag</kbd><span>Move a stack · right-drag moves half</span></div>
            <div class="mn-mrow"><kbd>Ctrl + drag</kbd><span>Move a single item</span></div>
            <div class="mn-mrow"><kbd>Shift-click</kbd><span>Quick-move · double-click works too</span></div>
            <div class="mn-mrow"><kbd>Drop outside</kbd><span>Throw the item into the world</span></div>
          </section>
          <section><h4>${icon('bulb', 'sm')} Survival tips</h4>
            <ul class="mn-tips"><li>Craft a hatchet and pickaxe first — trees and rocks are your starter kit.</li><li>Keep an eye on food, water and warmth. A lit campfire is a lifesaver at night.</li><li>Build a workbench to unlock better recipes, then a shelter with a door.</li><li>Team up (<kbd>P</kbd>) — teammates show on your map and compass.</li></ul>
          </section>
        </div>
      </div>
    </div></div>`);
    const grid = $('.mn-keygrid', node);
    const s = S();
    function paint() {
      grid.innerHTML = ACTIONS.map((a) => {
        const k = s.key(a.id), mod = k !== a.def;
        return `<button type="button" class="mn-keyrow ${mod ? 'mod' : ''} ${listening === a.id ? 'listen' : ''}" data-a="${a.id}" aria-label="${esc(a.label)}: ${keyLabel(k)}. Click to rebind"><span>${esc(a.label)}</span><kbd>${listening === a.id ? 'Press a key…' : esc(keyLabel(k))}</kbd></button>`;
      }).join('');
    }
    function stop() {
      if (cleanupCap) { cleanupCap(); cleanupCap = null; }
      listening = null; ctx.setCapturing(false); paint();
    }
    function listen(id) {
      if (listening) stop();
      listening = id; ctx.setCapturing(true); paint();
      const onKey = (e) => {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        if (e.repeat) return;
        if (e.code === 'Escape') { ctx.sfx('back'); stop(); return; }
        const conflict = ACTIONS.find((a) => a.id !== id && s.key(a.id) === e.code);
        s.rebind(id, e.code);
        ctx.sfx('success');
        if (conflict) ctx.toast(`Swapped with “${conflict.label}”`, 'info');
        stop();
      };
      const onDown = (e) => { if (!e.target.closest('.mn-keyrow')) stop(); };
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('pointerdown', onDown, true);
      cleanupCap = () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onDown, true); };
    }
    grid.addEventListener('click', (e) => { const b = e.target.closest('.mn-keyrow'); if (!b) return; if (listening === b.dataset.a) { stop(); return; } listen(b.dataset.a); });
    $('[data-act=reset]', node).addEventListener('click', () => { stop(); s.resetKeys(); ctx.sfx('success'); ctx.toast('Controls reset to defaults', 'good'); paint(); });
    $('.mn-back', node).addEventListener('click', () => ctx.back());
    paint();
    return { el: node, back: () => { if (listening) { stop(); return; } ctx.show(ctx.backTarget()); }, destroy() { if (cleanupCap) cleanupCap(); ctx.setCapturing(false); } };
  }

  return { settings: settingsScreen, controls: controlsScreen };
}
