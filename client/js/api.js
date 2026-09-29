// REST client for accounts, profile and server browser.
const KEY = 'emberwild.token';
export const api = {
  token: (() => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } })(),
  setToken(t) { this.token = t || ''; try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch {} },
  async request(path, body, method) {
    const res = await fetch(path, {
      method: method || (body !== undefined ? 'POST' : 'GET'),
      headers: { 'content-type': 'application/json', ...(this.token ? { authorization: 'Bearer ' + this.token } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let j = {};
    try { j = await res.json(); } catch {}
    if (!res.ok) { const e = new Error(j.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
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
