// Accounts: scrypt password hashes, hashed session tokens, per-account appearance & profile.
import crypto from 'node:crypto';
import path from 'node:path';
import { JsonStore } from './store.js';
import { rid, sha256, cleanText } from './util.js';

export const DEFAULT_APPEARANCE = { skin: 2, hair: 1, hairColor: 2, eyes: 0, shirt: 3, pants: 1, accent: 0, hat: 0 };
const SKIN_N = 8, HAIR_N = 8, HAIRCOL_N = 10, EYES_N = 6, COLOR_N = 12, ACC_N = 8, HAT_N = 5;

export function sanitizeAppearance(a) {
  const d = { ...DEFAULT_APPEARANCE };
  if (!a || typeof a !== 'object') return d;
  const f = (k, n) => { const v = Number.isInteger(a[k]) ? a[k] : d[k]; return ((v % n) + n) % n; };
  return { skin: f('skin', SKIN_N), hair: f('hair', HAIR_N), hairColor: f('hairColor', HAIRCOL_N), eyes: f('eyes', EYES_N), shirt: f('shirt', COLOR_N), pants: f('pants', COLOR_N), accent: f('accent', ACC_N), hat: f('hat', HAT_N) };
}

export class Accounts {
  constructor(dir) {
    this.store = new JsonStore(path.join(dir, 'accounts.json'), { users: {}, sessions: {}, nextUid: 1 });
    this.d = this.store.data;
    this.d.users ||= {}; this.d.sessions ||= {}; this.d.nextUid ||= 1;
    this.pruneSessions();
  }
  pruneSessions() {
    const now = Date.now();
    for (const [k, s] of Object.entries(this.d.sessions)) if (s.exp < now) delete this.d.sessions[k];
  }
  static validName(n) { return typeof n === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_ .-]{1,14}[A-Za-z0-9_]$/.test(n); }
  hash(pw, salt) { return crypto.scryptSync(pw, salt, 32).toString('hex'); }
  register(name, password) {
    name = cleanText(name, 16);
    if (!Accounts.validName(name)) throw new Error('Name must be 3-16 characters: letters, numbers, _ - . or spaces');
    if (typeof password !== 'string' || password.length < 6 || password.length > 100) throw new Error('Password must be at least 6 characters');
    const key = name.toLowerCase();
    if (this.d.users[key]) throw new Error('That name is already taken');
    const salt = rid(16);
    const user = { uid: 'u' + this.d.nextUid++, name, salt, hash: this.hash(password, salt), created: Date.now(), appearance: { ...DEFAULT_APPEARANCE }, tutorialDone: false, playSeconds: 0, settings: {} };
    this.d.users[key] = user;
    this.store.touch(100);
    return this.newSession(user);
  }
  login(name, password) {
    const user = this.d.users[cleanText(name, 16).toLowerCase()];
    // always hash to keep timing similar
    const salt = user ? user.salt : 'x'.repeat(32);
    const h = this.hash(String(password || ''), salt);
    if (!user || !crypto.timingSafeEqual(Buffer.from(h), Buffer.from(user.hash))) throw new Error('Wrong name or password');
    return this.newSession(user);
  }
  newSession(user) {
    const token = rid(32);
    this.d.sessions[sha256(token)] = { uid: user.uid, exp: Date.now() + 30 * 86400e3 };
    this.store.touch(100);
    return { token, user };
  }
  byToken(token) {
    if (typeof token !== 'string' || token.length < 20) return null;
    const s = this.d.sessions[sha256(token)];
    if (!s || s.exp < Date.now()) return null;
    return this.byUid(s.uid);
  }
  byUid(uid) {
    for (const u of Object.values(this.d.users)) if (u.uid === uid) return u;
    return null;
  }
  logout(token) { delete this.d.sessions[sha256(token)]; this.store.touch(100); }
  profile(u) { return { uid: u.uid, name: u.name, appearance: u.appearance, tutorialDone: u.tutorialDone, playSeconds: u.playSeconds, settings: u.settings || {} }; }
  update(u, patch) {
    if (patch.appearance) u.appearance = sanitizeAppearance(patch.appearance);
    if (typeof patch.tutorialDone === 'boolean') u.tutorialDone = patch.tutorialDone;
    if (patch.settings && typeof patch.settings === 'object') u.settings = JSON.parse(JSON.stringify(patch.settings));
    this.store.touch(300);
  }
}
