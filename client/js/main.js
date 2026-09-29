// Boot: menus, session restore, deep links.
import { app } from './app.js';
import { api } from './api.js';
import { initBackend, backend } from './backend.js';
import { initMenus } from './ui/menus.js';

async function boot() {
  await initBackend();
  app.menus = initMenus(app);
  window.app = app;
  const code = new URLSearchParams(location.search).get('join');
  if (code) app.pendingInvite = code.trim();
  if (api.token) {
    try { app.onLoggedIn(await api.me()); }
    catch { api.setToken(''); app.menus.show('login'); }
  } else app.menus.show('login');
  if (code) history.replaceState({}, '', location.pathname);
}
boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:20px;color:#f88;z-index:999">Failed to start: ${e.message}</pre>`); });
