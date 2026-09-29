import crypto from 'node:crypto';
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export const int = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : d);
export const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
export const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const rid = (n = 16) => crypto.randomBytes(n).toString('hex');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const rnd = (a, b) => a + Math.random() * (b - a);
export const rndi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// token-bucket limiter: allow(cost) returns true if permitted
export class Bucket {
  constructor(rate, burst) { this.rate = rate; this.burst = burst; this.tokens = burst; this.t = Date.now(); }
  allow(cost = 1) {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.t) / 1000) * this.rate);
    this.t = now;
    if (this.tokens >= cost) { this.tokens -= cost; return true; }
    return false;
  }
}
export function cleanText(s, max = 120) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}
export function weightedPick(entries) {
  let total = 0; for (const e of entries) total += e[1];
  let r = Math.random() * total;
  for (const e of entries) { r -= e[1]; if (r <= 0) return e; }
  return entries[entries.length - 1];
}
