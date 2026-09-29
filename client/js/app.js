// App singleton: shared services + the flow between menus and the running game.
import { api } from './api.js';
import { settings } from './settings.js';
import { audio } from './audio.js';

const $ = (id) => document.getElementById(id);

export const app = {
  api, settings, audio, profile: null, game: null, menus: null, pendingInvite: null,

  toast(text, kind = 'info') {
    const root = $('toast-root');
    const el = document.createElement('div'); el.className = 'toast ' + (kind === 'bad' ? 'bad' : kind);
    el.textContent = text; root.appendChild(el);
    while (root.children.length > 4) root.firstElementChild.remove();
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 420); }, 4200);
  },
  bigToast(title, sub) {
    const root = $('overlay-root');
    const el = document.createElement('div'); el.className = 'bigtoast';
    el.innerHTML = `<small>${title}</small><b>${sub}</b>`; root.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  },

  onLoggedIn(profile) {
    this.profile = profile;
    if (this.pendingInvite) { const c = this.pendingInvite; this.pendingInvite = null; this.menus.show('main'); this.menus.joinInvite(c); return; }
    this.menus.show('main');
  },

  async play(server, opts = {}) {
    if (this.game) return;
    audio.init();
    this.menus.showConnecting(`Joining ${server.name}…`);
    // fresh canvas per session (clean WebGL context)
    const old = $('game'); const canvas = old.cloneNode(false); old.replaceWith(canvas);
    let game;
    try {
      const { Game } = await import('./game.js');
      game = new Game(this);
      this.game = game;
      await game.join(server, opts);
      await game.loadUI();
      game.start();
      this.menus.hide();
      const hint = $('overlay-root'); const el = document.createElement('div'); el.className = 'bigtoast'; el.innerHTML = `<small>${server.official ? 'Official server' : 'Welcome to'}</small><b>${escapeHtml(server.name)}</b>`; hint.appendChild(el); setTimeout(() => el.remove(), 3500);
      window.__game = game;
    } catch (e) {
      console.error(e);
      if (game) { try { game.stop(); } catch {} }
      this.game = null;
      this.menus.showError('Could not join server', e.message || String(e), {});
    }
  },

  leaveGame() {
    const g = this.game;
    if (g) { this.game = null; try { g.stop(); } catch (e) { console.error(e); } }
    window.__game = null;
    const old = $('game'); const canvas = old.cloneNode(false); old.replaceWith(canvas);
    this.menus.show('main');
  },

  onDisconnected(title, text, opts = {}) {
    const g = this.game; if (!g) return;
    const server = g.serverInfo;
    this.game = null; try { g.stop(); } catch {}
    const old = $('game'); old.replaceWith(old.cloneNode(false));
    this.menus.showError(title, text, opts.retry ? { retry: () => this.play(server) } : {});
  },
};
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
