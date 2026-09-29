// Browser test helper: spawns a scratch server + headless Chromium (WebGL via SwiftShader).
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }

async function startServer(port, dataDir) {
  fs.rmSync(dataDir, { recursive: true, force: true });
  const p = spawn('node', [path.join(__dirname, '../server/index.js')], { env: { ...process.env, PORT: String(port), DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/api/health`); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  return { proc: p, log: () => out, stop: () => new Promise((r) => { p.once('exit', r); p.kill('SIGINT'); setTimeout(() => { p.kill('SIGKILL'); r(); }, 3000); }) };
}
async function launch(opts = {}) {
  const browser = await playwright.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  return { browser, ctx, page, errors };
}
module.exports = { startServer, launch };
