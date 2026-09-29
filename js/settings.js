// Persistent client settings + rebindable controls.
export const ACTIONS = [
  { id: 'forward', label: 'Move forward', def: 'KeyW' }, { id: 'back', label: 'Move backward', def: 'KeyS' },
  { id: 'left', label: 'Move left', def: 'KeyA' }, { id: 'right', label: 'Move right', def: 'KeyD' },
  { id: 'jump', label: 'Jump', def: 'Space' }, { id: 'sprint', label: 'Sprint', def: 'ShiftLeft' },
  { id: 'crouch', label: 'Crouch', def: 'KeyC' }, { id: 'use', label: 'Interact / Pick up (hold)', def: 'KeyE' },
  { id: 'light', label: 'Light / extinguish fire', def: 'KeyF' }, { id: 'reload', label: 'Reload / Repair (hammer)', def: 'KeyR' },
  { id: 'inventory', label: 'Inventory & crafting', def: 'Tab' }, { id: 'map', label: 'Map', def: 'KeyM' },
  { id: 'skills', label: 'Skills', def: 'KeyK' }, { id: 'team', label: 'Team & players', def: 'KeyP' },
  { id: 'chat', label: 'Chat', def: 'Enter' }, { id: 'view', label: 'Toggle 1st / 3rd person', def: 'KeyV' },
  { id: 'emote', label: 'Emotes', def: 'KeyG' }, { id: 'rotate', label: 'Rotate build piece', def: 'KeyZ' },
  { id: 'remove', label: 'Remove build piece (hold)', def: 'KeyX' }, { id: 'debug', label: 'Toggle stats overlay', def: 'F3' },
];
const DEFAULTS = {
  master: 0.8, sfx: 1, music: 0.35, ambience: 0.8, sensitivity: 1, adsSensitivity: 0.6, fov: 75, viewDistance: 380, shadows: 'medium',
  invertY: false, headBob: true, showFps: false, damageNumbers: true, crosshair: true, hintTips: true, keys: {},
};
const KEY = 'emberwild.settings.v1';
export const PRESETS = {
  low: { viewDistance: 240, shadows: 'off' },
  medium: { viewDistance: 380, shadows: 'medium' },
  high: { viewDistance: 520, shadows: 'high' },
};
class Settings {
  constructor() {
    this.v = { ...DEFAULTS, keys: {} };
    this.fns = new Set();
    try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); Object.assign(this.v, s); this.v.keys = { ...(s.keys || {}) }; } catch {}
  }
  get(k) { return this.v[k]; }
  all() { return this.v; }
  set(k, val) { this.v[k] = val; this.save(); this.fns.forEach((f) => f(k, val)); }
  applyPreset(name) { const p = PRESETS[name]; if (!p) return; Object.assign(this.v, p); this.save(); this.fns.forEach((f) => f('preset', name)); }
  on(fn) { this.fns.add(fn); return () => this.fns.delete(fn); }
  key(action) { return this.v.keys[action] || ACTIONS.find((a) => a.id === action)?.def; }
  rebind(action, code) {
    for (const a of ACTIONS) if (a.id !== action && this.key(a.id) === code) this.v.keys[a.id] = this.key(action); // swap on conflict
    this.v.keys[action] = code; this.save(); this.fns.forEach((f) => f('keys', action));
  }
  resetKeys() { this.v.keys = {}; this.save(); this.fns.forEach((f) => f('keys')); }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch {} }
}
export const settings = new Settings();
const KEYNAMES = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', Tab: 'Tab', Enter: 'Enter', Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`' };
export const keyLabel = (code) => KEYNAMES[code] || String(code || '').replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
