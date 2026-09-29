// Character creator with a live 3D preview.
import { SKIN, HAIR, CLOTH, ACCENT, HAIR_STYLES, EYE_STYLES, HAT_STYLES } from '../../models.js';
import { CharacterPreview } from './preview.js';
import { $, $$, el, esc, icon, friendly } from './util.js';

const DEFAULT = { skin: 2, hair: 1, hairColor: 2, eyes: 0, shirt: 3, pants: 1, accent: 0, hat: 0 };
const TABS = [
  { id: 'face', label: 'Face', sections: [['skin', 'Skin tone', 'sw', SKIN], ['eyes', 'Eyes', 'chip', EYE_STYLES]] },
  { id: 'hair', label: 'Hair', sections: [['hair', 'Hair style', 'chip', HAIR_STYLES], ['hairColor', 'Hair colour', 'sw', HAIR]] },
  { id: 'outfit', label: 'Outfit', sections: [['hat', 'Headwear', 'chip', HAT_STYLES], ['shirt', 'Shirt', 'sw', CLOTH], ['pants', 'Trousers', 'sw', CLOTH], ['accent', 'Scarf & belt', 'sw', ACCENT]] },
];
const LIMITS = { skin: SKIN.length, hair: HAIR_STYLES.length, hairColor: HAIR.length, eyes: EYE_STYLES.length, shirt: CLOTH.length, pants: CLOTH.length, accent: ACCENT.length, hat: HAT_STYLES.length };

export function characterScreen(ctx) {
  return function character() {
    const start = { ...DEFAULT, ...((ctx.app.profile && ctx.app.profile.appearance) || {}) };
    const a = { ...start };
    let tab = 'face', saving = false;
    const dirty = () => Object.keys(DEFAULT).some((k) => a[k] !== start[k]);

    const node = el(`<div class="mn-screen mn-char"><div class="panel mn-frame">
      <div class="mn-head"><button type="button" class="btn small ghost mn-back">${icon('back', 'sm')} Back</button><h2>Your character</h2><div class="mn-head-r"><span class="mn-dirty hidden">Unsaved changes</span></div></div>
      <div class="mn-char-main">
        <div class="mn-char-view"><div class="mn-char-3d" tabindex="0" aria-label="Character preview — drag or use arrow keys to rotate"></div>
          <div class="mn-char-name">${esc((ctx.app.profile && ctx.app.profile.name) || 'Explorer')}</div>
          <div class="mn-char-rot"><button type="button" class="btn small ghost" data-rot="-1" aria-label="Rotate left">${icon('left', 'sm')}</button><span>Drag to rotate</span><button type="button" class="btn small ghost" data-rot="1" aria-label="Rotate right">${icon('right', 'sm')}</button></div></div>
        <div class="mn-char-pick"><div class="tabs" role="tablist">${TABS.map((t) => `<button type="button" class="tab" role="tab" data-tab="${t.id}">${t.label}</button>`).join('')}</div><div class="mn-pick-body"></div></div>
      </div>
      <div class="mn-foot"><div class="mn-err" role="alert"></div><span class="mn-sp"></span><button type="button" class="btn" data-act="random">${icon('dice', 'sm')} Randomize</button><button type="button" class="btn ghost" data-act="reset">Reset</button><button type="button" class="btn primary big" data-act="save">Save character</button></div>
    </div></div>`);
    const pickBody = $('.mn-pick-body', node), err = $('.mn-err', node), view = $('.mn-char-3d', node);
    const preview = new CharacterPreview(view, { appearance: a, autoRotate: true });

    function paintPick() {
      $$('.tab', node).forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      const T = TABS.find((t) => t.id === tab);
      pickBody.innerHTML = T.sections.map(([key, label, kind, opts]) => `<section class="mn-sec"><h4>${label}</h4><div class="mn-opts ${kind}" data-key="${key}" role="radiogroup" aria-label="${label}">${
        opts.map((o, i) => kind === 'sw'
          ? `<button type="button" class="mn-sw ${a[key] === i ? 'on' : ''}" style="--c:${o}" role="radio" aria-checked="${a[key] === i}" aria-label="${label} ${i + 1}" data-i="${i}"></button>`
          : `<button type="button" class="mn-chip ${a[key] === i ? 'on' : ''}" role="radio" aria-checked="${a[key] === i}" data-i="${i}">${esc(o)}</button>`).join('')}</div></section>`).join('');
    }
    function changed() {
      preview.setAppearance({ ...a });
      $('.mn-dirty', node).classList.toggle('hidden', !dirty());
      err.textContent = '';
    }
    pickBody.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      const key = b.closest('[data-key]').dataset.key; a[key] = +b.dataset.i;
      $$('[data-i]', b.parentElement).forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
      changed();
    });
    $$('.tab', node).forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; paintPick(); }));
    $$('[data-rot]', node).forEach((b) => b.addEventListener('click', () => preview.rotate(+b.dataset.rot)));
    view.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { preview.rotate(-1); e.preventDefault(); } else if (e.key === 'ArrowRight') { preview.rotate(1); e.preventDefault(); } });

    const rnd = (n) => Math.floor(Math.random() * n);
    $('[data-act=random]', node).addEventListener('click', () => {
      for (const k of Object.keys(LIMITS)) a[k] = rnd(LIMITS[k]);
      if (rnd(3) > 0) a.hat = 0; // most randoms go hatless so the hair shows
      paintPick(); changed();
    });
    $('[data-act=reset]', node).addEventListener('click', () => { Object.assign(a, start); paintPick(); changed(); });

    async function save() {
      if (saving) return;
      saving = true; const btn = $('[data-act=save]', node); btn.disabled = true; btn.innerHTML = '<span class="mn-spin dark"></span> Saving…'; err.textContent = '';
      try {
        const p = await ctx.api.saveProfile({ appearance: { ...a } });
        const ap = (p && p.appearance) || { ...a };
        if (ctx.app.profile) ctx.app.profile.appearance = ap; else ctx.app.profile = { appearance: ap };
        ctx.sfx('success'); ctx.toast('Character saved', 'good');
        ctx.show(ctx.backTarget());
      } catch (e) {
        saving = false; btn.disabled = false; btn.textContent = 'Save character';
        err.textContent = friendly(e, 'Could not save your character.'); ctx.sfx('error');
      }
    }
    $('[data-act=save]', node).addEventListener('click', save);

    async function leave() {
      if (dirty()) {
        const ok = await ctx.confirmBox({ title: 'Discard changes?', text: 'Your character has unsaved changes. Leave without saving?', ok: 'Discard', danger: true, cancel: 'Keep editing' });
        if (!ok) return;
      }
      ctx.show(ctx.backTarget());
    }
    $('.mn-back', node).addEventListener('click', leave);
    paintPick();
    return { el: node, back: leave, destroy() { preview.destroy(); } };
  };
}
