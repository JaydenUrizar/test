// REST client for accounts, profile and server browser. Routes through js/backend.js (same origin, remote server, or the in-browser worker).
import { backend } from './backend.js';
const KEY = 'emberwild.token';
export const api = {
  token: (() => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } })(),
  setToken(t) { this.token = t || ''; try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch {} },
  async request(path, body, method) {
    method = method || (body !== undefined ? 'POST' : 'GET');
    const auth = this.token ? 'Bearer ' + this.token : '';
    let ok, status, j = {};
    if (backend.mode === 'local') {
      const r = await backend.api(path, method, body === undefined ? {} : JSON.parse(JSON.stringify(body)), auth);
      ok = r.code < 400; status = r.code; j = r.body || {};
    } else {
      const res = await fetch(backend.url(path), { method, headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
      ok = res.ok; status = res.status;
      try { j = await res.json(); } catch {}
    }
    if (!ok) { const e = new Error(j.error || `Request failed (${status})`); e.status = status; throw e; }
    return j;
  },
  async register(name, password) { const j = await this.request('/api/register', { name, password }); this.setToken(j.token); return j.profile; },
  async login(name, password) { const j = await this.request('/api/login', { name, password }); this.setToken(j.token); return j.profile; },
  async logout() { try { await this.request('/api/logout', {}); } catch {} this.setToken(''); },
  async me() { return (await this.request('/api/me')).profile; },
  async saveProfile(patch) { return (await this.request('/api/profile', patch)).profile; },
  async servers() { return (await this.request('/api/servers')).servers; },
  async createServer(cfg) { return (await this.request('/api/servers', cfg)).server; },
  async deleteServer(id) { return this.request('/api/servers/' + encodeURIComponent(id), undefined, 'DELETE'); },
  async lookupInvite(code) { return this.request('/api/servers/invite', { code }); },
  async modes() { return (await this.request('/api/modes')).modes; },
};
