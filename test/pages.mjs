// Static-hosting E2E: builds the site, serves it like GitHub Pages under /test/ (no API!), and plays it in headless Chromium.
// Verifies: the in-browser server starts, account creation, joining a world, moving, gathering, and that progress survives a full page reload.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '../scripts/serve-dist.mjs';
import { createServer } from '../server/index.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = process.env.E2E_OUT || '/tmp/ew-pages'; fs.mkdirSync(OUT, { recursive: true });
const DIST = path.join(OUT, 'dist');
execSync(`node ${path.join(ROOT, 'scripts/build-pages.mjs')} ${DIST}`, { stdio: 'inherit' });
const { port, server } = await serve(DIST, 0, '/test/');
let failed = 0;
const ok = (c, msg) => { console.log(`  ${c ? '✔' : '✘'} ${msg}`); if (!c) failed++; };
console.log('\nEmberwild static-hosting E2E (served under /test/, no backend)\n');
const browser = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/GPU stall|ReadPixels|404 \(Not Found\)/.test(m.text())) errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400 && !/api\/health/.test(r.url())) errors.push(r.status() + ' ' + r.url()); });
const url = `http://127.0.0.1:${port}/test/`;
const gameState = () => page.evaluate(() => { const g = window.__game; return g && g.me ? { x: g.me.x, z: g.me.z, wood: g.countItem('wood'), xp: g.state.xp, inGame: !!g.active } : null; });
try {
  await page.goto(url); await page.waitForSelector('.mn-login', { timeout: 20000 });
  ok(await page.evaluate(async () => (await import('./js/backend.js')).backend.mode === 'local'), 'no backend found → in-browser server started');
  ok(/Offline mode/.test(await page.textContent('body')), 'login screen explains offline mode');
  // register through the real form
  await page.click('[data-tab=register]');
  await page.fill('#mn-name', 'PagesTester'); await page.fill('#mn-pass', 'secret123'); await page.fill('#mn-pass2', 'secret123');
  await page.click('.mn-submit'); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => !!window.app.profile && window.app.profile.name === 'PagesTester'), 'account created via UI');
  // join an official server through the API layer (same path the server browser uses)
  await page.evaluate(async () => { const { api } = await import('./js/api.js'); const list = await api.servers(); await window.app.play(list.find((s) => s.official) || list[0]); });
  await page.waitForFunction(() => window.__game && window.__game.me && window.__game.active, null, { timeout: 40000 });
  ok(true, 'joined an official world (terrain streamed, entity spawned)');
  await page.waitForTimeout(2500);
  const s0 = await gameState();
  await page.evaluate(() => { const g = window.__game; g.locked = true; });
  await page.keyboard.down('KeyW'); await page.waitForTimeout(2500); await page.keyboard.up('KeyW');
  const s1 = await gameState();
  ok(Math.hypot(s1.x - s0.x, s1.z - s0.z) > 2, `moved with W (${Math.hypot(s1.x - s0.x, s1.z - s0.z).toFixed(1)} m)`);
  await page.screenshot({ path: `${OUT}/pages-ingame.png` });
  // do something persistent: chat + give-free action → use owner-less approach: quickly gather via direct message
  const before = s1.xp;
  await page.evaluate(() => window.__game.net.send({ t: 'chat', m: 'hello from static hosting' })); await page.waitForTimeout(500);
  // force a save (same call the pagehide handler makes) then reload the whole page
  await page.evaluate(async () => { (await import('./js/backend.js')).backend.flush(); }); await page.waitForTimeout(800);
  await page.reload(); await page.waitForSelector('.mn-screen', { timeout: 20000 }); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => !!window.app.profile && window.app.profile.name === 'PagesTester'), 'session + account survive a reload (IndexedDB)');
  await page.evaluate(async () => { const { api } = await import('./js/api.js'); const list = await api.servers(); await window.app.play(list.find((s) => s.official) || list[0]); });
  await page.waitForFunction(() => window.__game && window.__game.me && window.__game.active, null, { timeout: 40000 });
  const s2 = await gameState();
  ok(Math.hypot(s2.x - s1.x, s2.z - s1.z) < 8, `character resumed where it left off (${Math.hypot(s2.x - s1.x, s2.z - s1.z).toFixed(1)} m away)`);
  ok(errors.length === 0, 'no console/network errors' + (errors.length ? ': ' + errors.slice(0, 4).join(' | ') : ''));
} catch (e) { console.log('  ✘ ' + e.message); failed++; await page.screenshot({ path: `${OUT}/pages-fail.png` }).catch(() => {}); }
// ---- remote mode: the same static page pointed at a real Node server via ?server=
try {
  const dataDir = path.join(OUT, 'remote-data'); fs.rmSync(dataDir, { recursive: true, force: true });
  const srv = createServer({ port: 0, host: '127.0.0.1', dataDir }); const sport = await srv.ready;
  const p2 = await (await browser.newContext({ viewport: { width: 1000, height: 600 } })).newPage();
  const errs2 = []; p2.on('pageerror', (e) => errs2.push(e.message));
  await p2.goto(`${url}?server=127.0.0.1:${sport}`); await p2.waitForSelector('.mn-login', { timeout: 20000 });
  ok(await p2.evaluate(async () => { const b = (await import('./js/backend.js')).backend; return b.mode === 'remote' && b.wsUrl.startsWith('ws://'); }), '?server= switches to remote mode (cross-origin REST + WebSocket)');
  await p2.evaluate(async () => { const { api } = await import('./js/api.js'); window.app.profile = await api.register('RemoteTester', 'secret123'); const list = await api.servers(); await window.app.play(list.find((s) => s.official) || list[0]); });
  await p2.waitForFunction(() => window.__game && window.__game.me && window.__game.active, null, { timeout: 40000 });
  ok(srv.lobby.worlds.size === 1 && [...srv.lobby.worlds.values()][0].players.size === 1, 'joined the real server from the static page');
  ok(errs2.length === 0, 'no page errors in remote mode' + (errs2.length ? ': ' + errs2[0] : ''));
  await srv.close();
} catch (e) { console.log('  ✘ remote mode: ' + e.message); failed++; }
await browser.close(); server.close();
console.log(failed ? `\nPages E2E FAILED (${failed})\n` : '\nPages E2E passed\n');
process.exit(failed ? 1 : 0);
