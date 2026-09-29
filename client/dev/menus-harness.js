// Throw-away harness: real menus + real settings, mock app singleton. Not linked from the game.
// ?mock=1 -> fake API data (servers etc.).  Default -> real REST API on this origin.
// ?screen=NAME[&as=user] jumps to a screen after (optionally) logging in as a throw-away user.
import { initMenus } from '/js/ui/menus.js';
import { settings } from '/js/settings.js';
import { api as realApi } from '/js/api.js';

const q = new URLSearchParams(location.search);
const useMock = q.has('mock');
const now = Date.now();
const fakeServers = [
  { id: 'official-coop', name: 'Emberwild Official · Cooperative', desc: 'Friendly PvE. Build, explore and survive together.', mode: 'cooperative', modeLabel: 'Cooperative (PvE)', official: true, players: 23, maxPlayers: 40, seed: 'EMBER-COOP', private: false, hasPassword: false, owner: 'Emberwild', mine: false, rules: { pvp: false, raiding: false, friendlyFire: false, mobs: true, deathDrop: 'all', gatherRate: 1.5, lootRate: 1.25, dayLength: 1200 }, day: 14, created: now },
  { id: 'official-pvp', name: 'Emberwild Official · Survival PvP', desc: 'Full PvP and base raiding. Trust no one.', mode: 'survival', modeLabel: 'Survival (PvP)', official: true, players: 40, maxPlayers: 40, seed: 'ASHFALL-PVP', private: false, hasPassword: false, owner: 'Emberwild', mine: false, rules: { pvp: true, raiding: true, friendlyFire: false, mobs: true, deathDrop: 'all', gatherRate: 1, lootRate: 1, dayLength: 1200 }, day: 31, created: now },
  { id: 'official-relaxed', name: 'Emberwild Official · Relaxed', desc: 'Boosted gathering, keep your gear on death.', mode: 'relaxed', modeLabel: 'Relaxed (PvE, keep gear)', official: true, players: 6, maxPlayers: 40, seed: 'HOLLOW-CHILL', private: false, hasPassword: false, owner: 'Emberwild', mine: false, rules: { pvp: false, raiding: false, friendlyFire: false, mobs: true, deathDrop: 'none', gatherRate: 2.5, lootRate: 2, dayLength: 1800 }, day: 3, created: now },
  { id: 's1', name: 'Frostbite Frontier', desc: 'Hardcore weekends. No cheaters.', mode: 'hardcore', modeLabel: 'Hardcore (PvP, raid)', official: false, players: 9, maxPlayers: 16, seed: 'FROST-9A3C', private: false, hasPassword: true, owner: 'Kestrel', mine: false, rules: { pvp: true, raiding: true, friendlyFire: true, mobs: true, deathDrop: 'all', gatherRate: 0.7, lootRate: 0.8, dayLength: 900 }, day: 7, created: now },
  { id: 's2', name: "Mira's Homestead", desc: '', mode: 'cooperative', modeLabel: 'Cooperative (PvE)', official: false, players: 2, maxPlayers: 8, seed: 'PINE-0B11EE', private: false, hasPassword: false, owner: 'Mira', mine: false, rules: { pvp: false, raiding: false, friendlyFire: false, mobs: true, deathDrop: 'all', gatherRate: 1.5, lootRate: 1.25, dayLength: 1200 }, day: undefined, created: now },
];
const mockApi = {
  token: 'mock',
  async login(n) { await sleep(300); return { uid: 'u1', name: n, appearance: {}, playSeconds: 4200 }; },
  async register(n) { await sleep(300); return { uid: 'u1', name: n, appearance: {}, playSeconds: 0 }; },
  async logout() {}, async me() { return app.profile; },
  async saveProfile(p) { await sleep(200); return { ...app.profile, ...p }; },
  async servers() { await sleep(150); return fakeServers.map((s) => ({ ...s, players: Math.max(0, Math.min(s.maxPlayers, s.players + Math.round((Math.random() - .5) * 2))) })); },
  async createServer(c) { await sleep(300); return { ...fakeServers[4], id: 'new', name: c.name, invite: 'A1B2C3', mine: true, seed: c.seed || 'EMBER-1A2B3C', private: c.private, maxPlayers: c.maxPlayers }; },
  async deleteServer() { await sleep(100); return { ok: true }; },
  async lookupInvite(code) { await sleep(200); if (code === 'NOPE00') throw new Error('No server found for that invite code'); return { server: { ...fakeServers[3], hasPassword: false, private: true }, invite: code }; },
  async modes() { return (await fetch('/api/modes').then((r) => r.json())).modes; },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

window.__sounds = []; window.__played = []; window.__toasts = [];
const app = {
  api: useMock ? mockApi : realApi,
  settings,
  audio: { ui: (n) => window.__sounds.push(n) },
  profile: null,
  game: null,
  toast(text, kind = 'info') {
    window.__toasts.push(text);
    const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = text;
    document.getElementById('toast-root').appendChild(t); setTimeout(() => t.remove(), 3500);
  },
  play(server, opts) { window.__played.push({ id: server.id, ...opts }); app.menus.showConnecting('Connecting to ' + server.name + '…', { onCancel: () => app.menus.show('main') }); },
  leaveGame() { app.game = null; app.menus.show('main'); },
  onLoggedIn(p) { app.profile = p; app.menus.show('main'); },
};
window.__app = app;
app.menus = window.__menus = initMenus(app);

(async () => {
  const screen = q.get('screen') || 'login';
  if (q.get('as') || screen !== 'login') {
    const name = q.get('as') || 'Tester_' + Math.random().toString(36).slice(2, 6);
    if (useMock) app.profile = await mockApi.login(name);
    else {
      try { app.profile = await realApi.login(name, 'secret12'); } catch { app.profile = await realApi.register(name, 'secret12'); }
    }
  }
  if (q.has('game')) app.game = { worldInfo: { name: 'Frostbite Frontier', seed: 'FROST-9A3C', day: 7, hour: 9, invite: 'A1B2C3' } };
  if (screen === 'pause') app.menus.showPause({ onResume() { window.__resumed = true; }, onLeave() { window.__left = true; app.leaveGame(); } });
  else if (screen === 'connecting') app.menus.showConnecting('Connecting to Emberwild Official…', { onCancel() { app.menus.show('main'); } });
  else if (screen === 'error') app.menus.showError('Connection lost', 'The server closed the connection. Check your network and try again.', { retry() { window.__retried = true; } });
  else if (screen === 'invite') app.menus.joinInvite(q.get('code') || 'ABC123');
  else app.menus.show(screen);
})();
