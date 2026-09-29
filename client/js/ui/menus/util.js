// Small DOM helpers, inline icons and the logo shared by every menu screen.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

/** Build an element from an HTML string. */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const ICON_PATHS = {
  play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  host: '<path d="M5 21V4"/><path d="M5 5h13l-3 4 3 4H5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.2"/><path d="M12 2v2.6M12 19.4V22M2 12h2.6M19.4 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  starfill: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="currentColor"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" stroke-width="3"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V6a2 2 0 012-2h9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.6 3-6 7-6s7 2.4 7 6"/><path d="M16.5 4.6a3.5 3.5 0 010 6.8M22 20c0-2.6-1.6-4.6-4-5.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0011 18.7l1-1"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><path d="M4 4l16 16"/>',
  warn: '<path d="M12 3.5l10 17.5H2z"/><path d="M12 10v5M12 18h.01"/>',
  logout: '<path d="M9 4H5a1 1 0 00-1 1v14a1 1 0 001 1h4"/><path d="M16 8l4 4-4 4M20 12H9"/>',
  left: '<path d="M14 6l-6 6 6 6"/>',
  right: '<path d="M10 6l6 6-6 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3.5"/>',
  mouse: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
export function icon(name, cls = '') {
  return `<svg class="mn-i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}

/** Flame mark — gradients are defined once by defsSVG() so ids resolve everywhere. */
export const DEFS_SVG = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<linearGradient id="mnfl1" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#d63a16"/><stop offset=".5" stop-color="#ff7a2e"/><stop offset="1" stop-color="#ffc45a"/></linearGradient>
<linearGradient id="mnfl2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff9a3a"/><stop offset="1" stop-color="#fff0a8"/></linearGradient>
</defs></svg>`;
export function flameSVG(cls = '') {
  return `<svg class="mn-flame logo-flame ${cls}" viewBox="0 0 64 64" aria-hidden="true">
<path class="fl-outer" d="M32 2c4.5 10.5 17.5 16.5 17.5 33.5a17.5 17.5 0 0 1-35 0c0-8.5 4.200-13.500 8.500-17.500.2 6.200 3.200 8.200 5.200 8.200C26.700 16.700 28 9 32 2z" fill="url(#mnfl1)"/>
<path class="fl-inner" d="M32 27c3.200 5.200 9.500 8.500 9.500 15.500a9.500 9.500 0 0 1-19 0c0-4.500 3.200-7.500 5.400-10.700.2 3.300 1.200 5.200 4.100 5.200z" fill="url(#mnfl2)"/>
<ellipse class="fl-core" cx="32" cy="49" rx="4" ry="5" fill="#fffbe0" opacity=".85"/></svg>`;
}
export function logoHTML(size = 'big', tagline = true) {
  return `<div class="mn-logo ${size}">${flameSVG()}<div class="mn-wordmark">EMBERWILD</div>${tagline ? '<div class="mn-tagline">Light a fire. Claim the wild.</div>' : ''}</div>`;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}

/** Turn thrown network/API errors into friendly text. */
export function friendly(e, fallback = 'Something went wrong. Please try again.') {
  const m = (e && e.message) || '';
  if (!m) return fallback;
  if (/failed to fetch|networkerror|load failed|network request/i.test(m)) return "Can't reach the Emberwild servers. Check your connection and try again.";
  if (e.status === 401) return 'Your session has expired. Please sign in again.';
  if (e.status === 429) return 'Too many attempts — wait a moment and try again.';
  if (e.status >= 500) return 'The server had a problem. Please try again in a moment.';
  return m;
}

export function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m` : 'just started';
}
export const modeShort = (label = '') => label.replace(/\s*\(.*\)\s*$/, '');
export const modeParen = (label = '') => (label.match(/\((.*)\)/) || [])[1] || '';
export const isPvp = (s) => !!(s.rules && s.rules.pvp);

export function serverTagsHTML(s) {
  const t = [];
  if (s.official) t.push('<span class="tag official">Official</span>');
  t.push(isPvp(s) ? '<span class="tag pvp">PvP</span>' : '<span class="tag pve">PvE</span>');
  if (s.private) t.push('<span class="tag lock">Private</span>');
  else if (s.hasPassword) t.push(`<span class="tag lock">${icon('lock', 'sm')} Password</span>`);
  return t.join('');
}
const num = (v) => (Math.round(v * 100) / 100).toString().replace(/\.0+$/, '');
export function ruleChipsHTML(r = {}) {
  const b = (on, label) => `<span class="mn-rule ${on ? 'on' : 'off'}">${label}</span>`;
  return [
    b(r.pvp, 'PvP'), b(r.raiding, 'Raiding'), r.pvp ? b(r.friendlyFire, 'Friendly fire') : '', b(r.mobs, 'Wildlife'),
    `<span class="mn-rule">${r.deathDrop === 'none' ? 'Keep gear on death' : 'Drop gear on death'}</span>`,
    `<span class="mn-rule">Gather ×${num(r.gatherRate ?? 1)}</span>`, `<span class="mn-rule">Loot ×${num(r.lootRate ?? 1)}</span>`,
    `<span class="mn-rule">Day ${Math.round((r.dayLength ?? 1200) / 60)} min</span>`,
  ].join('');
}

export function fillRange(inp) {
  const min = +inp.min || 0, max = +inp.max || 100, v = +inp.value;
  inp.style.setProperty('--fill', `${clamp(((v - min) / (max - min)) * 100, 0, 100)}%`);
}
export const fillAll = (root) => $$('input[type=range]', root).forEach(fillRange);
