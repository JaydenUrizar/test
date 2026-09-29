// Visual QA: runs the server in-process, warps a browser player around the world and screenshots key scenes.
// Usage: node test/showcase.mjs [outDir]   (needs Playwright + Chromium)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from '../server/index.js';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = process.argv[2] || '/tmp/ew-show'; fs.mkdirSync(OUT, { recursive: true });
const dir = '/tmp/ew-showdata-' + process.pid; fs.rmSync(dir, { recursive: true, force: true });
const srv = createServer({ port: 0, host: '127.0.0.1', dataDir: dir });
const port = await srv.ready;
const browser = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${port}/`); await page.waitForTimeout(600);
const info = await page.evaluate(async () => {
  const { api } = await import('/js/api.js'); window.app.profile = await api.register('ShowOff', 'secret123');
  const s = await api.createServer({ name: 'Showcase', mode: 'survival', seed: 'SHOW1', private: true, maxPlayers: 4, rules: { mobs: true } });
  await window.app.play(s); return { id: s.id, uid: window.app.profile.uid };
});
await page.waitForTimeout(2500);
const world = () => srv.lobby.worlds.get(info.id); const me = () => world().byUid.get(info.uid);
const warp = async (x, z, { yaw = 0, pitch = 0, hour, weather, third = false, dy = 0.5 } = {}) => {
  const w = world(), p = me(), y = Math.max(w.data.height(x, z), 0.2) + dy; p.x = x; p.y = y; p.z = z; p.budget = 999; p.spawnPro = 60; p.hp = p.maxHp; p.food = p.water = 100; p.temp = 36.5; p.tempTarget = 36.5;
  w.emit(p, { e: 'corr', x, y, z, s: p.lastSeq, force: true });
  if (hour !== undefined) { w.hour = hour; w.emitAll({ e: 'time', h: hour, d: w.day }); }
  if (weather) { w.weather = { type: weather, next: w.clock + 9999 }; w.emitAll({ e: 'weather', type: weather }); }
  await page.evaluate(({ yaw, pitch, third }) => { const g = window.__game; g.locked = true; g.controls.yaw = yaw; g.controls.pitch = pitch; g.controls.thirdPerson = third; }, { yaw, pitch, third });
};
const shot = async (name, wait = 2200) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('  📸', name); };
const D = world().data;
const lm = (t) => D.landmarks.find((l) => l.type === t);
const ang = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
// --- kit
const w0 = world(), p0 = me(); for (const [id, n] of [['hammer', 1], ['wood', 500], ['stone', 300], ['revolver', 1], ['pistol_ammo', 90], ['shotgun', 1], ['shell', 20], ['rifle', 1], ['rifle_ammo', 20], ['smg', 1], ['torch', 1], ['bow', 1], ['arrow', 20], ['iron_chestplate', 1], ['iron_helmet', 1]]) w0.give(p0, id, n);
await page.waitForTimeout(500);
const slotOf = (id) => page.evaluate((id) => window.__game.state.inv.findIndex((s) => s && s.id === id), id);
const equipKey = async (id) => { let i = await slotOf(id); if (i > 5) { await page.evaluate((i) => window.__game.net.send({ t: 'mv_item', a: ['inv', i], b: ['inv', 5] }), i); for (let k = 0; k < 30 && (await slotOf(id)) > 5; k++) await page.waitForTimeout(150); i = await slotOf(id); } if (i > 5 || i < 0) throw new Error('cannot equip ' + id + ' slot=' + i); await page.keyboard.press('Digit' + (i + 1)); await page.waitForTimeout(900); };
// 1. raider outpost
const op = lm('outpost'); const rs = D.raiderSpawns.filter((r) => r.lm === op.id);
await warp(op.x + 30, op.z + 36, { yaw: ang({ x: op.x + 30, z: op.z + 36 }, op), pitch: 0.02, hour: 11 }); await shot('01-outpost-approach', 3500);
await warp(rs[0].x + 14, rs[0].z + 14, { yaw: ang({ x: rs[0].x + 14, z: rs[0].z + 14 }, rs[0]), pitch: 0, hour: 11 }); await shot('02-raiders', 3500);
// 2. gun in hand + muzzle flash (third person + first person)
await equipKey('rifle'); await warp(op.x + 30, op.z + 36, { yaw: ang({ x: op.x + 30, z: op.z + 36 }, op), pitch: 0.02, hour: 11 });
await page.keyboard.press('KeyR'); await page.waitForTimeout(3500);
await page.mouse.down(); await page.mouse.up(); await shot('03-rifle-shot', 350);
await page.evaluate(() => { window.__game.controls.mouse.r = true; }); await shot('04-rifle-scope', 1400); await page.evaluate(() => { window.__game.controls.mouse.r = false; });
await equipKey('shotgun'); await page.keyboard.press('KeyR'); await page.waitForTimeout(4500);
await page.evaluate(() => { window.__game.controls.thirdPerson = true; }); await page.mouse.down(); await page.mouse.up(); await shot('05-shotgun-third', 300);
// 3. town at dawn / dusk / night, animals
const town = lm('town');
await warp(town.x - 24, town.z + 26, { yaw: ang({ x: town.x - 24, z: town.z + 26 }, town), pitch: 0.0, hour: 7 }); await shot('06-town-dawn', 3000);
await warp(town.x - 10, town.z + 10, { yaw: ang({ x: town.x - 10, z: town.z + 10 }, town), pitch: -0.05, hour: 18.8 }); await shot('07-town-dusk', 3000);
await equipKey('torch'); await warp(town.x - 10, town.z + 10, { yaw: ang({ x: town.x - 10, z: town.z + 10 }, town), pitch: -0.05, hour: 22.5 }); await shot('08-town-night-torch', 4000);
const farm = lm('farmstead'); await warp(farm.x + 20, farm.z + 20, { yaw: ang({ x: farm.x + 20, z: farm.z + 20 }, farm), pitch: 0, hour: 15 }); await shot('09-farm', 3000);
const lh = lm('lighthouse'); await warp(lh.x + 30, lh.z + 30, { yaw: ang({ x: lh.x + 30, z: lh.z + 30 }, lh), pitch: 0.25, hour: 17 }); await shot('10-lighthouse', 3000);
const radio = lm('radio'); await warp(radio.x + 26, radio.z + 26, { yaw: ang({ x: radio.x + 26, z: radio.z + 26 }, radio), pitch: 0.4, hour: 12 }); await shot('11-radio-tower', 3000);
const mine = lm('mine'); await warp(mine.x + 22, mine.z + 22, { yaw: ang({ x: mine.x + 22, z: mine.z + 22 }, mine), pitch: 0, hour: 12 }); await shot('12-mine', 3000);
// 4. weather
await warp(town.x - 24, town.z + 26, { yaw: ang({ x: town.x - 24, z: town.z + 26 }, town), pitch: 0.0, hour: 14, weather: 'rain' }); await shot('13-rain', 5000);
await warp(town.x - 24, town.z + 26, { yaw: ang({ x: town.x - 24, z: town.z + 26 }, town), pitch: 0.05, hour: 16, weather: 'storm' }); await shot('14-storm', 5000);
await warp(town.x - 24, town.z + 26, { yaw: ang({ x: town.x - 24, z: town.z + 26 }, town), pitch: 0.0, hour: 9, weather: 'fog' }); await shot('15-fog', 5000);
// 5. biomes: desert, tundra/highlands, underwater
const find = (bio) => { for (let i = 0; i < 6000; i++) { const x = ((i * 7919) % 1800) - 900, z = ((i * 104729) % 1800) - 900; if (D.biome(x, z) === bio && D.height(x, z) > 3 && !D.landmarkAt(x, z, 30)) return { x, z }; } };
for (const [name, bio, hr] of [['16-desert', 4, 13], ['17-tundra', 5, 12], ['18-highlands', 6, 11]]) { const s = find(bio); if (s) { await warp(s.x, s.z, { yaw: 0.6, pitch: 0.05, hour: hr, weather: 'clear' }); await shot(name, 3000); } }
const beach = D.spawns[0]; await warp(beach.x, beach.z, { yaw: 0, pitch: 0.0, hour: 12, weather: 'clear' }); await shot('19-beach', 2500);
await page.evaluate(() => { const g = window.__game; g.controls.s.y = -1.0; }); await warp(beach.x + 6, beach.z, { yaw: 0, pitch: -0.1, hour: 12, dy: -1.4 }); await shot('20-swimming', 2500);
console.log('errors:', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).slice(0, 5));
await browser.close(); await srv.close(); fs.rmSync(dir, { recursive: true, force: true });
process.exit(0);
