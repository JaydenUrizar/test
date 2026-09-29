// Browser E2E: drives the real UI (host a server, join, build with the mouse, shoot, campfire). Run: node test/e2e.cjs
// Saves screenshots to $E2E_OUT (default /tmp/ew-e2e). Requires Playwright + Chromium.
const { startServer, launch } = require('./pw.cjs');
const fs = require('fs');
const OUT = process.env.E2E_OUT || '/tmp/ew-e2e'; fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`  ${ok ? '✔' : '✘'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) failed++; };
(async () => {
  const srv = await startServer(3580, '/tmp/ew-e2e-data');
  const { browser, page, errors } = await launch();
  const G = (fn, arg) => page.evaluate(fn, arg);
  const shot = async (n) => { await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}/${n}.png` }); };
  console.log('\nEmberwild browser E2E\n');
  await page.goto('http://127.0.0.1:3580/'); await page.waitForTimeout(700);
  // ---- account + host a server through the UI
  await page.click('.tab[data-tab=register]'); await page.fill('#mn-name', 'E2E_Hero'); await page.fill('#mn-pass', 'secret123'); await page.fill('#mn-pass2', 'secret123');
  await page.click('button[type=submit]'); await page.waitForTimeout(900);
  check('registered and reached main menu', (await page.textContent('body')).includes('E2E_Hero'));
  await page.click('[data-go=host]'); await page.waitForTimeout(500); await shot('01-host');
  await page.fill('#hs-name', 'E2E Playground'); await page.screenshot({ path: `${OUT}/02-host-filled.png` });
  const create = page.getByRole('button', { name: /create/i }).last(); await create.click(); await page.waitForTimeout(1200); await shot('03-hosted');
  const hosted = await G(async () => { const { api } = await import('/js/api.js'); return (await api.servers()).find((s) => s.name === 'E2E Playground'); });
  check('private server created with invite code', !!hosted && !!hosted.invite, hosted && hosted.invite);
  await G(async (s) => { await window.app.play(s); }, hosted); await page.waitForTimeout(3500);
  check('joined the world', await G(() => !!(window.__game && window.__game.welcomed)));
  // ---- items via owner command, then real key/mouse input
  const chat = async (t) => { await G((t) => window.__game.net.send({ t: 'chat', text: t }), t); await page.waitForTimeout(120); };
  for (const g of ['hammer 1', 'wood 900', 'stone 300', 'revolver 1', 'pistol_ammo 60', 'campfire 1', 'iron_ingot 50', 'shotgun 1', 'shell 20', 'torch 1']) await chat('/give ' + g);
  await page.waitForTimeout(500);
  await G(() => { const g = window.__game; g.locked = true; g.releaseLock = () => {}; g.controls.pitch = -0.55; const orig = g.net.send.bind(g.net); g.net.send = (m) => { if (m.t === 'mv') { if (window.__sendMv) orig(m); } else orig(m); }; window.__sendMv = true; });
  const slot = (id) => G((id) => window.__game.state.inv.findIndex((s) => s && s.id === id), id);
  check('hammer landed on the hotbar', (await slot('hammer')) >= 0 && (await slot('hammer')) < 6);
  await page.keyboard.press('Digit' + ((await slot('hammer')) + 1)); await page.waitForTimeout(700);
  await shot('04-build-ghost');
  const ghostOk = await G(() => { const ix = window.__game.ix; return !!(ix.plan && ix.plan.ok); });
  check('build ghost is valid on open ground', ghostOk);
  for (let i = 0; i < 3; i++) { await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(350); }
  check('foundation placed by mouse click', (await G(() => window.__game.ent.pieces.size)) >= 1, 'pieces=' + await G(() => window.__game.ent.pieces.size));
  // build wall & doorway using the piece bar (click) and wheel
  await G(() => window.__game.ix.setBuild('wall')); await G(() => { window.__game.controls.pitch = 0.0; }); await page.waitForTimeout(600);
  await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(500);
  await shot('05-wall');
  check('walls follow foundations', (await G(() => window.__game.ent.pieces.size)) >= 2);
  // gun: select revolver, reload, shoot
  await page.keyboard.press('Digit' + ((await slot('revolver')) + 1)); await page.waitForTimeout(600);
  await page.keyboard.press('KeyR'); await page.waitForTimeout(2900);
  check('revolver reloaded (6 rounds)', (await G(() => window.__game.selItem().ammo)) === 6);
  await G(() => { window.__game.controls.pitch = 0.05; });
  await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up(); await page.waitForTimeout(250);
  await shot('06-shot');
  check('firing consumed ammo', (await G(() => window.__game.selItem().ammo)) < 6);
  // campfire: place, open, fuel, light
  await page.keyboard.press('Digit' + ((await slot('campfire')) + 1)); await page.waitForTimeout(600); await G(() => { window.__game.controls.pitch = -0.5; }); await page.waitForTimeout(500);
  await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(700);
  check('campfire placed', (await G(() => window.__game.ent.deps.size)) >= 1);
  const fid = await G(() => [...window.__game.ent.deps.values()][0].id);
  await G((id) => { window.__game.net.send({ t: 'use', k: 'dep', id }); }, fid); await page.waitForTimeout(600);
  await shot('07-campfire-ui');
  await G(() => { const g = window.__game; const inv = g.state.inv; g.net.send({ t: 'mv_item', a: ['inv', inv.findIndex((s) => s && s.id === 'wood')], b: ['c', 0], n: 20 }); }); await page.waitForTimeout(400);
  await G((id) => window.__game.net.send({ t: 'use', k: 'dep', id, tog: true }), fid); await page.waitForTimeout(800);
  check('campfire lit', await G((id) => window.__game.ent.deps.get(id).on === true, fid));
  await page.keyboard.press('Tab'); await page.waitForTimeout(500);
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
