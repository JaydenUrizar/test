// Browser E2E: drives the real UI (host a server, join, build with the mouse, shoot, campfire). Run: node test/e2e.cjs
// Saves screenshots to $E2E_OUT (default /tmp/ew-e2e). Requires Playwright + Chromium.
const { startServer, launch } = require('./pw.cjs');
const fs = require('fs');
const OUT = process.env.E2E_OUT || '/tmp/ew-e2e'; fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`  ${ok ? '✔' : '✘'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) failed++; };
(async () => {
  const srv = await startServer(3580 + Math.floor(Math.random() * 300), '/tmp/ew-e2e-data-' + process.pid); const base = `http://127.0.0.1:${srv.port}/`;
  const { browser, page, errors } = await launch();
  const G = (fn, arg) => page.evaluate(fn, arg);
  const shot = async (n) => { await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}/${n}.png` }); };
  console.log('\nEmberwild browser E2E\n');
  await page.goto(base); await page.waitForTimeout(700);
  // ---- account + host a server through the UI
  await page.click('.tab[data-tab=register]'); await page.fill('#mn-name', 'E2E_' + Math.random().toString(36).slice(2, 8)); await page.fill('#mn-pass', 'secret123'); await page.fill('#mn-pass2', 'secret123');
  await page.click('button[type=submit]'); await page.waitForTimeout(900);
  check('registered and reached main menu', (await page.textContent('body')).includes('E2E_'));
  await page.click('[data-go=host]'); await page.waitForTimeout(500); await shot('01-host');
  await page.fill('#hs-name', 'E2E Playground'); await page.screenshot({ path: `${OUT}/02-host-filled.png` });
  await page.click('.mn-create'); await page.waitForTimeout(1200); await shot('03-hosted');
  const hosted = await G(async () => { const { api } = await import('/js/api.js'); return (await api.servers()).find((s) => s.name === 'E2E Playground'); });
  check('private server created with invite code', !!hosted && !!hosted.invite, hosted && hosted.invite);
  await G(async (s) => { await window.app.play(s); }, hosted); await page.waitForTimeout(3500);
  check('joined the world', await G(() => !!(window.__game && window.__game.welcomed)));
  // ---- items via owner command, then real key/mouse input
  const chat = async (t) => { await G((t) => window.__game.net.send({ t: 'chat', text: t }), t); await page.waitForTimeout(400); };  // chat is rate limited (~3/s)
  const kit = async () => { for (const g of ['hammer 1', 'wood 900', 'stone 300', 'revolver 1', 'pistol_ammo 60', 'campfire 1', 'iron_ingot 50', 'shotgun 1', 'shell 20', 'torch 1']) await chat('/give ' + g); await page.waitForTimeout(400); };
  await kit();
  await G(() => { window.__toasts = []; const ot = window.app.toast.bind(window.app); window.app.toast = (t, k) => { window.__toasts.push(t); ot(t, k); }; });
  await G(() => { const g = window.__game; g.locked = true; g.releaseLock = () => {}; g.controls.pitch = -0.55; const orig = g.net.send.bind(g.net); g.net.send = (m) => { if (m.t === 'mv') { if (window.__sendMv) orig(m); } else orig(m); }; window.__sendMv = true; });
  const slot = (id) => G((id) => window.__game.state.inv.findIndex((s) => s && s.id === id), id);
  // put an item on the hotbar (swap into slot 6 if it is in the backpack) and select it with the real number key
  const hot = async (id) => { let i = await slot(id); if (i > 5) { await G((i) => window.__game.net.send({ t: 'mv_item', a: ['inv', i], b: ['inv', 5] }), i); await page.waitForTimeout(600); i = await slot(id); } await page.keyboard.press('Digit' + (i + 1)); await page.waitForTimeout(700); };
  check('hammer landed on the hotbar', (await slot('hammer')) >= 0 && (await slot('hammer')) < 6);
  await hot('hammer');
  // spawn points are random coast spots: re-roll (die + respawn) until a foundation fits in front of us
  for (let tries = 0; tries < 10; tries++) {
    await G(() => { window.__game.controls.pitch = -0.55; }); await page.waitForTimeout(700);
    if (await G(() => !!(window.__game.ix.plan && window.__game.ix.plan.ok))) break;
    await chat('/kill'); await page.waitForTimeout(3600); await G(() => window.__game.net.send({ t: 'respawn', bag: 0 })); await page.waitForTimeout(1500);
    await G(() => { window.__game.locked = true; }); await kit(); await hot('hammer');
  }
  await shot('04-build-ghost');
  const ghostOk = await G(() => { const ix = window.__game.ix; return !!(ix.plan && ix.plan.ok); });
  check('build ghost is valid on open ground', ghostOk);
  for (let i = 0; i < 3; i++) { await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(350); }
  await page.waitForTimeout(1500);
  check('foundation placed by mouse click', (await G(() => window.__game.ent.pieces.size)) >= 1, 'pieces=' + await G(() => window.__game.ent.pieces.size) + ' toasts=' + JSON.stringify(await G(() => window.__toasts.slice(-3))) + ' plan=' + JSON.stringify(await G(() => { const p = window.__game.ix.plan; return p && { ok: p.ok, err: p.error }; })) + ' mouse=' + JSON.stringify(await G(() => ({ l: window.__game.controls.mouse.l, locked: window.__game.locked }))));
  // build wall & doorway using the piece bar (click) and wheel
  await G(() => window.__game.ix.setBuild('wall')); await page.waitForTimeout(900);
  await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(500);
  await shot('05-wall');
  check('walls follow foundations', (await G(() => window.__game.ent.pieces.size)) >= 2);
  // gun: select revolver, reload, shoot
  await hot('revolver');
  await page.keyboard.press('KeyR'); await page.waitForTimeout(2500); await G(() => new Promise((res) => { const t0 = Date.now(); const iv = setInterval(() => { if (!window.__game.reloadingNow() || Date.now() - t0 > 15000) { clearInterval(iv); res(); } }, 100); }));
  check('revolver reloaded (6 rounds)', (await G(() => window.__game.selItem().ammo)) === 6);
  await G(() => { window.__game.controls.pitch = 0.05; });
  await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up(); await page.waitForTimeout(700);
  await shot('06-shot');
  check('firing consumed ammo', (await G(() => window.__game.selItem().ammo)) < 6);
  // campfire: place, open, fuel, light
  await hot('campfire'); await G(() => { window.__game.controls.pitch = -0.5; }); await page.waitForTimeout(500);
  await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(700);
  await page.waitForTimeout(1200);
  check('campfire placed', (await G(() => window.__game.ent.deps.size)) >= 1);
  const fid = await G(() => [...window.__game.ent.deps.values()].find((d) => d.type === 'campfire').id);
  await G((id) => { window.__game.net.send({ t: 'use', k: 'dep', id }); }, fid); await page.waitForTimeout(600);
  await shot('07-campfire-ui');
  await G(() => { const g = window.__game; const inv = g.state.inv; g.net.send({ t: 'mv_item', a: ['inv', inv.findIndex((s) => s && s.id === 'wood')], b: ['c', 0], n: 20 }); }); await page.waitForTimeout(400);
  await G((id) => window.__game.net.send({ t: 'use', k: 'dep', id, tog: true }), fid); await page.waitForTimeout(800);
  check('campfire lit', await G((id) => window.__game.ent.deps.get(id).on === true, fid));
  await G(() => { const g = window.__game; g.net.send({ t: 'close' }); if (g.ui.inventory && g.ui.inventory.isOpen()) g.ui.inventory.close(); }); await page.waitForTimeout(500);
  await G(() => { window.__game.controls.pitch = 0.2; window.__game.controls.thirdPerson = true; }); await page.waitForTimeout(400);
  await G(() => { window.__fixedHour = 22.5; window.__game.hour = 22.5; Object.defineProperty(window.__game, 'hourServer', { get: () => 22.5, set() {} }); });
  await page.waitForTimeout(3500); await shot('08-night-fire');
  // weather visuals
  await G(() => { window.__game.weather = 'storm'; }); await page.waitForTimeout(4500); await shot('09-storm');
  const bad = errors.filter((e) => !/GPU stall|ReadPixels/.test(e));
  check('no console errors', bad.length === 0, bad.slice(0, 3).join(' | '));
  await browser.close(); await srv.stop();
  console.log(failed ? `\n${failed} check(s) failed\n` : '\nE2E passed\n');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
