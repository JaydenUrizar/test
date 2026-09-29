// Emberwild — full-screen island map + circular minimap (Module C).
// The base image is generated progressively from WorldData into a cached offscreen canvas that both the
// MapUI and the Minimap share (module-level cache keyed by seed).
import { BIOME, BIOME_NAMES, WORLD_HALF } from '/shared/worldgen.js';

const SPAN = WORLD_HALF * 2;
const GRID_N = 640;                 // base image resolution (3.2 m / px)
const CELLM = SPAN / GRID_N;
const FRAME_BUDGET_MS = 9;          // CPU time spent generating per animation frame
const GRID_CELL = 256;              // lettered grid cell size (8 x 8)

// ---------------------------------------------------------------- palette (matches client/js/world.js COL)
const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const P = {
  seaShallow: rgb('#63b8bd'), seaDeep: rgb('#1c4466'), foam: rgb('#e6f5ee'),
  beach: rgb('#e9d79c'), meadow: rgb('#8cbf5c'), forest: rgb('#437f40'), desert: rgb('#e3c57c'),
  tundra: rgb('#e4edf0'), rock: rgb('#8c939b'), snow: rgb('#f6f9fb'),
};
export const BIOME_SWATCH = ['#2f6f8f', '#e9d79c', '#8cbf5c', '#437f40', '#e3c57c', '#e4edf0', '#8c939b'];
const LAND_PAL = [null, P.beach, P.meadow, P.forest, P.desert, P.tundra, P.rock];

export const LM_STYLE = {
  outpost: { color: '#e2554b', label: 'Outpost' },
  town: { color: '#f2c94c', label: 'Town' },
  lighthouse: { color: '#5cc0e8', label: 'Lighthouse' },
  mine: { color: '#b39bfa', label: 'Mine' },
  radio: { color: '#ff8a3c', label: 'Radio tower' },
  farmstead: { color: '#8fd25f', label: 'Farmstead' },
  camp: { color: '#e0946a', label: 'Raider camp' },
};
const LM_WEIGHT = { outpost: 6, town: 5, lighthouse: 4, mine: 4, radio: 3, farmstead: 2, camp: 1 };
const TEAM_COLORS = ['#7fd35a', '#5cc0e8', '#f2c94c', '#c39bff', '#ff9ec7', '#5be3c4', '#ffb25a', '#9fb4ff'];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const teamColor = (name) => TEAM_COLORS[hashStr(String(name || '?')) % TEAM_COLORS.length];

// ---------------------------------------------------------------- progressive base-image generation
const CACHE = new Map();

/** Get (and lazily start generating) the shared map base image for a WorldData. */
export function getMapBase(data) {
  const key = String(data.seedRaw ?? data.seed);
  let e = CACHE.get(key);
  if (e) return e;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = GRID_N;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `rgb(${P.seaDeep})`; ctx.fillRect(0, 0, GRID_N, GRID_N);
  e = {
    key, data, N: GRID_N, canvas, ctx, done: false, progress: 0, ms: 0, frames: 0, wall: 0,
    H: new Float32Array(GRID_N * GRID_N), B: new Uint8Array(GRID_N * GRID_N),
    img: ctx.createImageData(GRID_N, GRID_N), rowH: 0, rowC: 0, flushed: 0, t0: performance.now(),
  };
  CACHE.set(key, e);
  const tick = () => {
    if (e.done) return;
    const t = performance.now();
    genStep(e, FRAME_BUDGET_MS);
    e.ms += performance.now() - t; e.frames++;
    if (e.done) { e.wall = performance.now() - e.t0; e.H = null; e.B = null; e.img = null; return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return e;
}

function genStep(e, budget) {
  const { N, data, H, B } = e;
  const T = data.terrain;
  const t0 = performance.now();
  while (e.rowH < N && performance.now() - t0 < budget) {
    const j = e.rowH, z = -WORLD_HALF + (j + 0.5) * CELLM;
    for (let i = 0; i < N; i++) {
      const x = -WORLD_HALF + (i + 0.5) * CELLM;
      const h = T.height(x, z);
      H[j * N + i] = h; B[j * N + i] = T.biome(x, z, h);
    }
    e.rowH++;
    if (j >= 1) colourRow(e, j - 1);
  }
  if (e.rowH >= N && e.rowC < N) { while (e.rowC < N) colourRow(e, e.rowC); }
  // flush finished rows to the canvas
  if (e.rowC > e.flushed) { e.ctx.putImageData(e.img, 0, 0, 0, e.flushed, N, e.rowC - e.flushed); e.flushed = e.rowC; }
  e.progress = e.rowH >= N ? 1 : e.rowH / N;
  if (e.flushed >= N) { e.done = true; e.progress = 1; }
}

function colourRow(e, j) {
  const { N, H, B, img } = e, d = img.data;
  const jm = Math.max(0, j - 1), jp = Math.min(N - 1, j + 1);
  const rowsOK = (jp < e.rowH);
  const jpp = rowsOK ? jp : j;
  for (let i = 0; i < N; i++) {
    const im = Math.max(0, i - 1), ip = Math.min(N - 1, i + 1);
    const k = j * N + i, h = H[k], b = B[k];
    let r, g, bl;
    if (b === BIOME.SEA) {
      // depth gradient + soft banding, foam along the shore
      const dep = clamp(-h / 15, 0, 1);
      const t = smooth(0, 1, dep);
      r = lerp(P.seaShallow[0], P.seaDeep[0], t); g = lerp(P.seaShallow[1], P.seaDeep[1], t); bl = lerp(P.seaShallow[2], P.seaDeep[2], t);
      const band = 0.965 + 0.035 * Math.cos(dep * Math.PI * 6);
      r *= band; g *= band; bl *= band;
      const nl = B[j * N + im], nr = B[j * N + ip], nu = B[jm * N + i], nd = B[jpp * N + i];
      const land = (nl !== 0) + (nr !== 0) + (nu !== 0) + (nd !== 0);
      if (land) { const f = 0.42 + 0.1 * land; r = lerp(r, P.foam[0], f); g = lerp(g, P.foam[1], f); bl = lerp(bl, P.foam[2], f); }
    } else {
      // biome colour, softly blended with land neighbours of a different biome
      const c0 = LAND_PAL[b];
      let sr = c0[0] * 0.6, sg = c0[1] * 0.6, sb = c0[2] * 0.6, wsum = 0.6;
      const nb = [B[j * N + im], B[j * N + ip], B[jm * N + i], B[jpp * N + i]];
      for (let q = 0; q < 4; q++) { const nbb = nb[q]; if (nbb === 0) continue; const c = LAND_PAL[nbb]; sr += c[0] * 0.1; sg += c[1] * 0.1; sb += c[2] * 0.1; wsum += 0.1; }
      r = sr / wsum; g = sg / wsum; bl = sb / wsum;
      // relief: light from the north-west
      const dx = (H[j * N + ip] - H[j * N + im]) / ((ip - im) * CELLM);
      const dz = (H[jpp * N + i] - H[jm * N + i]) / ((jpp - jm) * CELLM);
      const s = (dx + dz) * 0.7071;
      const grad = Math.hypot(dx, dz);
      // steep slopes turn to bare rock
      if (b !== BIOME.BEACH && grad > 0.5) { const t = clamp((grad - 0.5) * 1.3, 0, 0.6); r = lerp(r, P.rock[0], t); g = lerp(g, P.rock[1], t); bl = lerp(bl, P.rock[2], t); }
      if (b === BIOME.HIGHLAND) {
        const t = smooth(46, 74, h);
        r = lerp(r, P.snow[0], t); g = lerp(g, P.snow[1], t); bl = lerp(bl, P.snow[2], t);
      }
      // altitude tint (higher = a touch lighter)
      const alt = 0.95 + 0.11 * clamp(h / 55, 0, 1);
      let f = alt * (1 + clamp(s * 1.9, -0.42, 0.34));
      // contour lines (every 10 m, subtle)
      const hr = H[j * N + ip], hd = H[jpp * N + i];
      const cl = Math.floor(h / 10);
      if (h > 2.5 && (cl !== Math.floor(hr / 10) || cl !== Math.floor(hd / 10))) f *= b === BIOME.HIGHLAND ? 0.86 : 0.93;
      // beach: keep bright, add a hint of wet sand near waterline
      if (b === BIOME.BEACH) f *= 0.97 + 0.05 * clamp(h / 2, 0, 1);
      r *= f; g *= f; bl *= f;
    }
    const o = k * 4;
    d[o] = r > 255 ? 255 : r; d[o + 1] = g > 255 ? 255 : g; d[o + 2] = bl > 255 ? 255 : bl; d[o + 3] = 255;
  }
  e.rowC = j + 1;
}

// ---------------------------------------------------------------- drawing helpers (canvas 2D)
function label(ctx, txt, x, y, size = 12, color = '#f3ecd9', align = 'center') {
  ctx.font = `700 ${size}px "Trebuchet MS","Segoe UI",system-ui,sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 3.4; ctx.strokeStyle = 'rgba(8,14,17,.92)';
  ctx.strokeText(txt, x, y); ctx.fillStyle = color; ctx.fillText(txt, x, y);
}

/** Draw a landmark glyph centred on (0,0) within a ±10 box, in colour `c`, background `bg` for cut-outs. */
function glyph(ctx, type, c, bg) {
  ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (type) {
    case 'outpost':
      ctx.moveTo(-6, 6); ctx.lineTo(-6, -4.5); ctx.lineTo(-3.8, -4.5); ctx.lineTo(-3.8, -2.5); ctx.lineTo(-1.4, -2.5); ctx.lineTo(-1.4, -4.5);
      ctx.lineTo(1.4, -4.5); ctx.lineTo(1.4, -2.5); ctx.lineTo(3.8, -2.5); ctx.lineTo(3.8, -4.5); ctx.lineTo(6, -4.5); ctx.lineTo(6, 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(-1.8, 6); ctx.lineTo(-1.8, 2.2); ctx.arc(0, 2.2, 1.8, Math.PI, 0); ctx.lineTo(1.8, 6); ctx.closePath(); ctx.fill();
      break;
    case 'town':
      ctx.moveTo(-7.5, 6); ctx.lineTo(-7.5, 0.2); ctx.lineTo(-3.6, -3.8); ctx.lineTo(0.3, 0.2); ctx.lineTo(0.3, 6); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(1.2, 6); ctx.lineTo(1.2, -1.6); ctx.lineTo(4.5, -6); ctx.lineTo(7.8, -1.6); ctx.lineTo(7.8, 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = bg; ctx.fillRect(3.4, 1.8, 2.2, 4.2); ctx.fillRect(-4.6, 2.2, 2, 3.8);
      break;
    case 'lighthouse':
      ctx.moveTo(-2.8, 7); ctx.lineTo(-1.7, -2.4); ctx.lineTo(1.7, -2.4); ctx.lineTo(2.8, 7); ctx.closePath(); ctx.fill();
      ctx.fillRect(-2.2, -5.6, 4.4, 3.2);
      ctx.beginPath(); ctx.moveTo(-3, -5.6); ctx.lineTo(0, -8.6); ctx.lineTo(3, -5.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = bg; ctx.fillRect(-1.5, 0.2, 3, 1.6); ctx.fillRect(-1.1, 3.8, 2.2, 1.6);
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-3.6, -4.4); ctx.lineTo(-8, -6); ctx.moveTo(3.6, -4.4); ctx.lineTo(8, -6); ctx.moveTo(-3.6, -3.6); ctx.lineTo(-8, -2.2); ctx.moveTo(3.6, -3.6); ctx.lineTo(8, -2.2); ctx.stroke();
      break;
    case 'mine':
      ctx.lineWidth = 2.1; ctx.moveTo(-5.6, 7); ctx.lineTo(3.4, -3.4); ctx.stroke();
      ctx.lineWidth = 2.8; ctx.beginPath(); ctx.moveTo(-3.4, -6.4); ctx.quadraticCurveTo(4.6, -8, 7.4, 0.8); ctx.stroke();
      break;
    case 'radio':
      ctx.lineWidth = 1.8; ctx.moveTo(0, -3.4); ctx.lineTo(-4, 8); ctx.moveTo(0, -3.4); ctx.lineTo(4, 8); ctx.moveTo(-2.5, 3.2); ctx.lineTo(2.5, 3.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -4.2, 1.5, 0, 6.3); ctx.fill();
      ctx.lineWidth = 1.5; for (const rr of [4.2, 7.4]) { ctx.beginPath(); ctx.arc(0, -4.2, rr, -Math.PI * 0.86, -Math.PI * 0.14); ctx.stroke(); }
      break;
    case 'farmstead':
      ctx.moveTo(-6.6, 6.6); ctx.lineTo(-6.6, -1.4); ctx.lineTo(-3.2, -5.6); ctx.lineTo(3.2, -5.6); ctx.lineTo(6.6, -1.4); ctx.lineTo(6.6, 6.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = bg; ctx.fillRect(-2.6, 0.4, 5.2, 6.2);
      ctx.strokeStyle = c; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-2.6, 0.4); ctx.lineTo(2.6, 6.6); ctx.moveTo(2.6, 0.4); ctx.lineTo(-2.6, 6.6); ctx.stroke();
      break;
    case 'camp':
    default:
      ctx.moveTo(-7.6, 6.6); ctx.lineTo(0, -6.4); ctx.lineTo(7.6, 6.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(-2.4, 6.6); ctx.lineTo(0, 0.6); ctx.lineTo(2.4, 6.6); ctx.closePath(); ctx.fill();
  }
}

/** Landmark badge at (x,y) with radius r. */
function badge(ctx, type, x, y, r, discovered) {
  const st = LM_STYLE[type] || LM_STYLE.camp;
  ctx.save(); ctx.translate(x, y);
  if (!discovered) ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 1;
  ctx.fillStyle = discovered ? 'rgba(14,22,27,.92)' : 'rgba(14,22,27,.55)'; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = discovered ? 2 : 1.4; ctx.strokeStyle = discovered ? st.color : 'rgba(243,236,217,.4)'; ctx.stroke();
  if (discovered) { ctx.scale(r / 10 * 0.86, r / 10 * 0.86); glyph(ctx, type, st.color, 'rgb(14,22,27)'); }
  else { ctx.font = `800 ${Math.round(r * 1.25)}px "Trebuchet MS",system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(243,236,217,.6)'; ctx.fillText('?', 0, 1); }
  ctx.restore();
}

function playerArrow(ctx, x, y, ang, size, pulse = 0) {
  ctx.save(); ctx.translate(x, y);
  if (pulse) { ctx.beginPath(); ctx.arc(0, 0, size * (1.2 + pulse * 1.1), 0, 7); ctx.fillStyle = `rgba(255,138,60,${0.28 * (1 - pulse)})`; ctx.fill(); }
  ctx.rotate(ang); const u = size / 10;
  ctx.beginPath(); ctx.moveTo(0, -11 * u); ctx.lineTo(7.4 * u, 8 * u); ctx.lineTo(0, 4 * u); ctx.lineTo(-7.4 * u, 8 * u); ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 5;
  ctx.fillStyle = '#ff8a3c'; ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2; ctx.strokeStyle = '#1a0d04'; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -6.6 * u); ctx.lineTo(0, 2.6 * u); ctx.strokeStyle = 'rgba(255,240,200,.85)'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.restore();
}

function pinIcon(ctx, x, y, s = 1, color = '#ffb457') {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-3, -6, -8.5, -9, -8.5, -15); ctx.arc(0, -15, 8.5, Math.PI, 0); ctx.bezierCurveTo(8.5, -9, 3, -6, 0, 0); ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 5; ctx.fillStyle = color; ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2; ctx.strokeStyle = '#2a1200'; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -15, 3.2, 0, 7); ctx.fillStyle = '#2a1200'; ctx.fill();
  ctx.restore();
}

function skullIcon(ctx, x, y, r) {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fillStyle = 'rgba(58,14,12,.94)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#e2554b'; ctx.stroke();
  const u = r / 10; ctx.scale(u, u);
  ctx.fillStyle = '#f3ecd9'; ctx.beginPath(); ctx.arc(0, -1.6, 5.2, 0, 7); ctx.fill(); ctx.fillRect(-3, 1.6, 6, 4.4);
  ctx.fillStyle = '#3a0e0c'; ctx.beginPath(); ctx.arc(-2.1, -1.4, 1.5, 0, 7); ctx.arc(2.1, -1.4, 1.5, 0, 7); ctx.fill();
  ctx.fillRect(-0.5, 1.2, 1, 1.5); ctx.fillRect(-1.6, 3.4, 0.9, 2.6); ctx.fillRect(0.7, 3.4, 0.9, 2.6);
  ctx.restore();
}

function bagIcon(ctx, x, y, r) {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fillStyle = 'rgba(16,36,22,.94)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#8fd25f'; ctx.stroke();
  const u = r / 10; ctx.scale(u, u);
  ctx.fillStyle = '#8fd25f';
  ctx.beginPath(); ctx.moveTo(-6.4, 3.6); ctx.lineTo(-6.4, -2.4); ctx.quadraticCurveTo(-6.4, -4.4, -4.4, -4.4); ctx.lineTo(4.4, -4.4); ctx.quadraticCurveTo(6.4, -4.4, 6.4, -2.4); ctx.lineTo(6.4, 3.6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(16,36,22,.9)'; ctx.fillRect(-1.2, -4.4, 0.9, 8); ctx.fillRect(1.6, -4.4, 0.9, 8);
  ctx.fillStyle = '#f3ecd9'; ctx.beginPath(); ctx.ellipse(-4, -0.4, 1.9, 2.3, 0, 0, 7); ctx.fill();
  ctx.restore();
}

function drawRoads(ctx, data, scale, casing, main, alpha = 1) {
  const lines = data.terrain.roadLines;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = alpha;
  for (const pass of [0, 1]) {
    ctx.lineWidth = (pass ? main : casing) / scale;
    ctx.strokeStyle = pass ? '#f3e3bd' : 'rgba(62,42,22,.55)';
    ctx.beginPath();
    for (const pts of lines) { ctx.moveTo(pts[0].x, pts[0].z); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].z); }
    ctx.stroke();
  }
  ctx.restore();
}

function getMarkers(game) {
  try { const m = game.mapMarkers && game.mapMarkers(); return Array.isArray(m) ? m : []; } catch { return []; }
}
function teamMates(game) {
  const out = [], tp = game.state && game.state.teamPos;
  if (tp && tp.forEach) tp.forEach((v, eid) => { if (v && Number.isFinite(v.x)) out.push({ eid, x: v.x, z: v.z, name: v.name || '?' }); });
  return out;
}
const gridName = (x, z) => {
  const c = clamp(Math.floor((x + WORLD_HALF) / GRID_CELL), 0, 7), r = clamp(Math.floor((z + WORLD_HALF) / GRID_CELL), 0, 7);
  return String.fromCharCode(65 + c) + (r + 1);
};
const compass8 = (dx, dz) => ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'][Math.round(((Math.atan2(dz, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
const fmtDist = (m) => (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m');
const pad2 = (n) => String(n).padStart(2, '0');
function fmtClock(hour) { if (!Number.isFinite(hour)) return ''; const h = Math.floor(hour) % 24, m = Math.floor((hour % 1) * 60); return `${pad2(h)}:${pad2(m)}`; }

const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

// ================================================================= Full map
export class MapUI {
  constructor(game, root) {
    this.game = game; this.root = root; this.opened = false;
    this.data = game.world.data;
    this.base = getMapBase(this.data);
    this.view = { cx: 0, cz: 0, z: 0.3, zt: 0.3, anchor: null, ct: null };
    this.mouse = null; this.drag = null; this.raf = 0; this.last = 0; this.t = 0;
    this.W = 10; this.H = 10; this.dpr = 1; this.hoverLm = null;
    this.legendOpen = true;
    this._build();
    this._onKey = (e) => this._key(e);
    this._unsub = [];
  }

  _build() {
    const info = this.game.worldInfo || {};
    const root = this.root;
    this.back = el(`<div class="map-back"><div class="map-panel panel">
      <div class="map-head">
        <div class="map-title"><svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M9 3 3 5.2v15.6L9 18.6l6 2.4 6-2.2V3.2L15 5.4 9 3zm0 2.3 4.6 1.8v11.6L9 16.4V5.3zM5 6.6l2-.8v10.6l-2 .8V6.6zm14 10.8-2 .7V6.4l2-.7v11.7z"/></svg>Island map</div>
        <div class="map-world"><span class="mw-name"></span></div>
        <div class="map-time"></div>
        <button class="btn small map-x" title="Close (Esc)">Close <kbd>Esc</kbd></button>
      </div>
      <div class="map-body">
        <aside class="map-side">
          <div class="seed-card" title="Click to copy the seed">
            <div class="seed-k">World seed</div>
            <div class="seed-v"></div>
            <div class="seed-h">Same seed = same world</div>
          </div>
          <div class="side-sec"><div class="side-h">Terrain</div><div class="lg-grid lg-terrain"></div></div>
          <div class="side-sec"><div class="side-h">Places</div><div class="lg-grid lg-places"></div></div>
          <div class="side-sec"><div class="side-h">Markers</div><div class="lg-grid lg-marks"></div></div>
        </aside>
        <div class="map-view">
          <canvas class="map-cv"></canvas>
          <div class="mv-you"><i class="dot"></i><span></span></div>
          <div class="mv-wp hidden"><span class="wp-txt"></span><button class="btn small ghost wp-clear">Clear</button></div>
          <div class="mv-zoom">
            <button class="mz-btn" data-a="in" title="Zoom in (+)">+</button>
            <button class="mz-btn" data-a="out" title="Zoom out (−)">−</button>
            <button class="mz-btn" data-a="me" title="Centre on me (C)"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm-1-6v3.1A7 7 0 0 0 5.1 11H2v2h3.1A7 7 0 0 0 11 18.9V22h2v-3.1a7 7 0 0 0 5.9-5.9H22v-2h-3.1A7 7 0 0 0 13 5.1V2h-2zm1 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"/></svg></button>
            <button class="mz-btn" data-a="fit" title="Show whole island (0)"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z"/></svg></button>
          </div>
          <div class="mv-read"><span class="rd-xy"></span><span class="rd-sep">·</span><span class="rd-bio"></span><span class="rd-sep">·</span><span class="rd-grid"></span><span class="rd-extra"></span></div>
          <div class="mv-hint"><div><b>Drag</b> pan</div><div><b>Wheel</b> zoom</div><div><b>Click</b> set waypoint</div><div><b>Right-click</b> clear</div></div>
          <div class="mv-prog hidden"><div class="mp-t">Charting the island…</div><div class="bar"><i></i></div></div>
        </div>
      </div>
    </div></div>`);
    root.appendChild(this.back);
    const q = (s) => this.back.querySelector(s);
    this.cv = q('.map-cv'); this.ctx = this.cv.getContext('2d');
    this.viewEl = q('.map-view');
    this.$name = q('.mw-name'); this.$time = q('.map-time'); this.$seed = q('.seed-v');
    this.$you = q('.mv-you span'); this.$wp = q('.mv-wp'); this.$wpTxt = q('.wp-txt');
    this.$rdXY = q('.rd-xy'); this.$rdBio = q('.rd-bio'); this.$rdGrid = q('.rd-grid'); this.$rdEx = q('.rd-extra');
    this.$prog = q('.mv-prog'); this.$progBar = q('.mv-prog .bar i'); this.$progT = q('.mp-t');
    this.$name.textContent = info.name || 'Unnamed world';
    this.$seed.textContent = String(info.seed ?? this.data.seedRaw ?? '—');

    // legend
    const lgT = q('.lg-terrain');
    [1, 2, 3, 4, 5, 6, 0].forEach((b) => { lgT.appendChild(el(`<div class="lg-i"><i class="sw" style="background:${BIOME_SWATCH[b]}"></i>${BIOME_NAMES[b]}</div>`)); });
    const lgP = q('.lg-places');
    for (const [type, st] of Object.entries(LM_STYLE)) lgP.appendChild(this._iconRow(st.label, (c) => badge(c, type, 11, 11, 9.5, true)));
    const lgM = q('.lg-marks');
    lgM.appendChild(this._iconRow('You', (c) => playerArrow(c, 11, 11, 0, 8)));
    lgM.appendChild(this._iconRow('Waypoint', (c) => pinIcon(c, 11, 19, 0.75)));
    lgM.appendChild(this._iconRow('Teammate', (c) => { c.beginPath(); c.arc(11, 11, 6, 0, 7); c.fillStyle = '#7fd35a'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#0d1a10'; c.stroke(); }));
    lgM.appendChild(this._iconRow('Death', (c) => skullIcon(c, 11, 11, 9.5)));
    lgM.appendChild(this._iconRow('Sleeping bag', (c) => bagIcon(c, 11, 11, 9.5)));
    lgM.appendChild(this._iconRow('Unexplored', (c) => badge(c, 'camp', 11, 11, 9.5, false)));
    lgM.appendChild(this._iconRow('Road', (c) => { c.lineCap = 'round'; c.lineWidth = 5; c.strokeStyle = 'rgba(62,42,22,.6)'; c.beginPath(); c.moveTo(3, 15); c.quadraticCurveTo(11, 4, 19, 8); c.stroke(); c.lineWidth = 2.6; c.strokeStyle = '#f3e3bd'; c.stroke(); }));

    // events
    q('.map-x').addEventListener('click', () => this.close());
    this.back.addEventListener('pointerdown', (e) => { if (e.target === this.back) this.close(); });
    q('.seed-card').addEventListener('click', () => {
      const v = this.$seed.textContent;
      try { navigator.clipboard.writeText(v); } catch {}
      const k = q('.seed-k'); k.textContent = 'Seed copied!'; clearTimeout(this._cp); this._cp = setTimeout(() => { k.textContent = 'World seed'; }, 1200);
    });
    q('.wp-clear').addEventListener('click', () => this._setWaypoint(null));
    q('.mv-zoom').addEventListener('click', (e) => {
      const b = e.target.closest('.mz-btn'); if (!b) return; const a = b.dataset.a;
      if (a === 'in') this._zoomBy(1.6); else if (a === 'out') this._zoomBy(1 / 1.6); else if (a === 'me') this.centerOnMe(); else this.fit();
    });
    const cv = this.cv;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => this._pdown(e));
    cv.addEventListener('pointermove', (e) => this._pmove(e));
    cv.addEventListener('pointerup', (e) => this._pup(e));
    cv.addEventListener('pointercancel', (e) => this._pup(e, true));
    cv.addEventListener('pointerleave', () => { if (!this.drag) this.mouse = null; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); this._zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0016 * (e.deltaMode === 1 ? 16 : 1))); }, { passive: false });
    if (window.ResizeObserver) { this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(this.viewEl); }
  }

  _iconRow(text, draw) {
    const c = document.createElement('canvas'); const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = 22 * dpr; c.height = 22 * dpr; c.style.width = c.style.height = '22px';
    const x = c.getContext('2d'); x.scale(dpr, dpr); draw(x);
    const row = el(`<div class="lg-i"></div>`); row.appendChild(c); row.appendChild(document.createTextNode(text));
    return row;
  }

  isOpen() { return this.opened; }
  toggle() { this.opened ? this.close() : this.open(); }
  open() {
    if (this.opened) return;
    this.opened = true;
    this.root.classList.remove('hidden');
    this.game.uiOpened && this.game.uiOpened('map');
    window.addEventListener('keydown', this._onKey, true);
    this._resize();
    this.fit(true);
    this.last = performance.now();
    const loop = (t) => { if (!this.opened) return; this._frame(t); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  close() {
    if (!this.opened) return;
    this.opened = false; cancelAnimationFrame(this.raf);
    this.drag = null;
    window.removeEventListener('keydown', this._onKey, true);
    this.root.classList.add('hidden');
    this.game.uiClosed && this.game.uiClosed('map');
  }

  _key(e) {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    const k = e.key;
    if (k === '+' || k === '=') { this._zoomBy(1.5); e.preventDefault(); }
    else if (k === '-' || k === '_') { this._zoomBy(1 / 1.5); e.preventDefault(); }
    else if (k === '0') { this.fit(); e.preventDefault(); }
    else if (k === 'c' || k === 'C') { this.centerOnMe(); e.preventDefault(); }
    else if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      const v = this.view, st = 90 / v.z; v.anchor = null; v.ct = null;
      if (k === 'ArrowLeft') v.cx -= st; if (k === 'ArrowRight') v.cx += st; if (k === 'ArrowUp') v.cz -= st; if (k === 'ArrowDown') v.cz += st;
      this._clampView(); e.preventDefault();
    }
  }

  // ---- view control
  _fitScale() { return Math.min(this.W, this.H) / (SPAN * 1.03); }
  _limits() { const f = this._fitScale(); return [f * 0.8, 1.15]; }
  fit(instant) {
    const v = this.view, f = this._fitScale(); v.anchor = null; v.zt = f; v.ct = { x: 0, z: 0 };
    if (instant) { v.z = f; v.cx = 0; v.cz = 0; v.ct = null; }
  }
  centerOnMe() {
    const me = this.game.me || {}; const v = this.view; v.anchor = null;
    v.ct = { x: me.x || 0, z: me.z || 0 }; v.zt = clamp(Math.max(v.zt, 0.7), ...this._limits());
  }
  _zoomBy(f) { this._zoomAt(this.W / 2, this.H / 2, f); }
  _zoomAt(sx, sy, f) {
    const v = this.view; const [lo, hi] = this._limits();
    const nz = clamp(v.zt * f, lo, hi); if (nz === v.zt) return;
    v.zt = nz; v.ct = null;
    v.anchor = { sx, sy, wx: v.cx + (sx - this.W / 2) / v.z, wz: v.cz + (sy - this.H / 2) / v.z };
  }
  _clampView() { const v = this.view, m = WORLD_HALF * 1.02; v.cx = clamp(v.cx, -m, m); v.cz = clamp(v.cz, -m, m); }
  _resize() {
    const r = this.viewEl.getBoundingClientRect();
    if (r.width < 4) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const first = this.W <= 10;
    this.W = Math.floor(r.width); this.H = Math.floor(r.height); this.dpr = dpr;
    this.cv.width = Math.floor(this.W * dpr); this.cv.height = Math.floor(this.H * dpr);
    this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px';
    const v = this.view; const [lo, hi] = this._limits(); v.z = clamp(v.z, lo, hi); v.zt = clamp(v.zt, lo, hi);
    if (first && this.opened) this.fit(true);
    // vignette
    const g = this.ctx.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.42, this.W / 2, this.H / 2, Math.hypot(this.W, this.H) * 0.56);
    g.addColorStop(0, 'rgba(6,12,16,0)'); g.addColorStop(1, 'rgba(6,12,16,.55)'); this.vig = g;
  }
  w2s(x, z) { const v = this.view; return [this.W / 2 + (x - v.cx) * v.z, this.H / 2 + (z - v.cz) * v.z]; }
  s2w(sx, sy) { const v = this.view; return [v.cx + (sx - this.W / 2) / v.z, v.cz + (sy - this.H / 2) / v.z]; }

  // ---- pointer
  _pos(e) { const r = this.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  _pdown(e) {
    const [sx, sy] = this._pos(e);
    this.cv.setPointerCapture && this.cv.setPointerCapture(e.pointerId);
    this.drag = { sx, sy, x0: sx, y0: sy, btn: e.button, moved: false };
    e.preventDefault();
  }
  _pmove(e) {
    const [sx, sy] = this._pos(e); this.mouse = [sx, sy];
    const d = this.drag;
    if (d) {
      if (!d.moved && Math.hypot(sx - d.x0, sy - d.y0) > 4) d.moved = true;
      if (d.moved) {
        const v = this.view; v.cx -= (sx - d.sx) / v.z; v.cz -= (sy - d.sy) / v.z; v.anchor = null; v.ct = null; this._clampView();
        this.cv.classList.add('grabbing');
      }
      d.sx = sx; d.sy = sy;
    }
  }
  _pup(e, cancel) {
    const d = this.drag; this.drag = null; this.cv.classList.remove('grabbing');
    if (!d || cancel || d.moved) return;
    const [sx, sy] = this._pos(e);
    if (d.btn === 2) { this._setWaypoint(null); return; }
    if (d.btn !== 0) return;
    const lm = this._landmarkAt(sx, sy);
    const [wx, wz] = lm ? [lm.x, lm.z] : this.s2w(sx, sy);
    if (Math.abs(wx) > WORLD_HALF || Math.abs(wz) > WORLD_HALF) return;
    this._setWaypoint({ x: Math.round(wx), z: Math.round(wz) });
  }
  _setWaypoint(wp) {
    const g = this.game; g.state.waypoint = wp;
    try { g.emit && g.emit('waypoint', wp); } catch {}
    g.audio && g.audio.ui && g.audio.ui(wp ? 'click' : 'back');
  }
  _landmarkAt(sx, sy) {
    let best = null, bd = 16 * 16;
    for (const lm of this.data.landmarks) { const [x, y] = this.w2s(lm.x, lm.z); const d = (x - sx) ** 2 + (y - sy) ** 2; if (d < bd) { bd = d; best = lm; } }
    return best;
  }

  // ---- frame
  _frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now; this.t += dt;
    const v = this.view, k = 1 - Math.exp(-dt * 11);
    if (Math.abs(v.zt - v.z) > 1e-5) { v.z += (v.zt - v.z) * k; if (Math.abs(v.zt - v.z) < v.zt * 0.002) v.z = v.zt; }
    if (v.anchor) {
      v.cx = v.anchor.wx - (v.anchor.sx - this.W / 2) / v.z; v.cz = v.anchor.wz - (v.anchor.sy - this.H / 2) / v.z;
      if (v.z === v.zt) v.anchor = null;
    }
    if (v.ct) { v.cx += (v.ct.x - v.cx) * k; v.cz += (v.ct.z - v.cz) * k; if (Math.hypot(v.ct.x - v.cx, v.ct.z - v.cz) < 0.5 / v.z) { v.cx = v.ct.x; v.cz = v.ct.z; v.ct = null; } }
    this._clampView();
    this._draw();
    this._updateDom();
  }

  _draw() {
    const { ctx, W, H, dpr, view: v, data, game } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#18415f'; ctx.fillRect(0, 0, W, H);
    // base image
    const [ix, iy] = this.w2s(-WORLD_HALF, -WORLD_HALF), isz = SPAN * v.z;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.base.canvas, ix, iy, isz, isz);
    // world-space overlays
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(v.z, v.z); ctx.translate(-v.cx, -v.cz);
    this._drawGridLines(ctx);
    drawRoads(ctx, data, v.z, 4.2, 2.2, 0.95);
    ctx.restore();
    this._drawGridLabels(ctx);
    this._drawMarkers(ctx);
    // frame + vignette
    if (this.vig) { ctx.fillStyle = this.vig; ctx.fillRect(0, 0, W, H); }
    this._drawScale(ctx);
  }

  _drawGridLines(ctx) {
    const v = this.view;
    ctx.lineWidth = 1 / v.z;
    // fine grid when zoomed in
    if (GRID_CELL / 4 * v.z > 42) {
      ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.beginPath();
      for (let g = -WORLD_HALF; g <= WORLD_HALF; g += GRID_CELL / 4) { ctx.moveTo(g, -WORLD_HALF); ctx.lineTo(g, WORLD_HALF); ctx.moveTo(-WORLD_HALF, g); ctx.lineTo(WORLD_HALF, g); }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.beginPath();
    for (let g = -WORLD_HALF; g <= WORLD_HALF; g += GRID_CELL) { ctx.moveTo(g, -WORLD_HALF); ctx.lineTo(g, WORLD_HALF); ctx.moveTo(-WORLD_HALF, g); ctx.lineTo(WORLD_HALF, g); }
    ctx.stroke();
    // world border
    ctx.setLineDash([10 / v.z, 8 / v.z]); ctx.lineWidth = 1.6 / v.z; ctx.strokeStyle = 'rgba(255,138,60,.55)';
    ctx.strokeRect(-WORLD_HALF, -WORLD_HALF, SPAN, SPAN); ctx.setLineDash([]);
  }

  _drawGridLabels(ctx) {
    const v = this.view, W = this.W, H = this.H;
    ctx.font = '800 11px "Trebuchet MS",system-ui,sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    for (let c = 0; c < 8; c++) {
      const x0 = -WORLD_HALF + c * GRID_CELL, x1 = x0 + GRID_CELL; const [a] = this.w2s(x0, 0), [b] = this.w2s(x1, 0);
      const ma = Math.max(a, 0), mb = Math.min(b, W); if (mb - ma < 24) continue; const cx = (ma + mb) / 2;
      this._chip(ctx, String.fromCharCode(65 + c), cx, 10, 'top');
    }
    for (let r = 0; r < 8; r++) {
      const z0 = -WORLD_HALF + r * GRID_CELL, z1 = z0 + GRID_CELL; const [, a] = this.w2s(0, z0), [, b] = this.w2s(0, z1);
      const ma = Math.max(a, 0), mb = Math.min(b, H); if (mb - ma < 24) continue;
      this._chip(ctx, String(r + 1), 10, (ma + mb) / 2, 'left');
    }
  }
  _chip(ctx, txt, x, y) {
    ctx.fillStyle = 'rgba(10,18,22,.72)'; const w = 18, h = 16;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h / 2, w, h, 5) : ctx.rect(x - w / 2, y - h / 2, w, h); ctx.fill();
    ctx.fillStyle = 'rgba(243,236,217,.9)'; ctx.fillText(txt, x, y + 0.5);
  }

  _drawMarkers(ctx) {
    const { game, data, view: v } = this;
    const disc = (game.state && game.state.disc) || new Set();
    const placed = [];
    // landmarks (labels declutter by priority)
    const lms = data.landmarks.map((lm) => ({ lm, d: disc.has ? disc.has(lm.id) : false })).sort((a, b) => (b.d - a.d) || (LM_WEIGHT[b.lm.type] - LM_WEIGHT[a.lm.type]));
    const rBadge = clamp(8 + v.z * 5, 9, 14);
    const drawn = [];
    for (const { lm, d } of lms) {
      const [x, y] = this.w2s(lm.x, lm.z);
      if (x < -40 || y < -40 || x > this.W + 40 || y > this.H + 40) continue;
      drawn.push({ lm, d, x, y });
    }
    // badges first (undiscovered under discovered), then labels
    for (const o of drawn.slice().reverse()) badge(ctx, o.lm.type, o.x, o.y, rBadge, o.d);
    for (const o of drawn) placed.push({ x: o.x - rBadge, y: o.y - rBadge, w: rBadge * 2, h: rBadge * 2 });
    ctx.font = '700 12px "Trebuchet MS",system-ui,sans-serif';
    for (const o of drawn) {
      if (!o.d) continue;
      const w = ctx.measureText(o.lm.name).width + 6, rect = { x: o.x - w / 2, y: o.y + rBadge + 1, w, h: 16 };
      if (placed.some((p) => rect.x < p.x + p.w && rect.x + rect.w > p.x && rect.y < p.y + p.h && rect.y + rect.h > p.y)) continue;
      placed.push(rect); label(ctx, o.lm.name, o.x, o.y + rBadge + 9, 12, LM_STYLE[o.lm.type].color);
    }
    // custom markers (death / bag)
    for (const m of getMarkers(game)) {
      if (m.kind === 'wp') continue;
      const [x, y] = this.w2s(m.x, m.z);
      if (m.kind === 'death') skullIcon(ctx, x, y, 11); else if (m.kind === 'bag') bagIcon(ctx, x, y, 10);
      if (m.label) label(ctx, m.label, x, y + 20, 11, m.kind === 'death' ? '#ff9c92' : '#b9ea96');
    }
    // teammates
    for (const t of teamMates(game)) {
      const [x, y] = this.w2s(t.x, t.z), c = teamColor(t.name);
      ctx.beginPath(); ctx.arc(x, y, 6.5, 0, 7); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = '#0d1a10'; ctx.stroke();
      label(ctx, t.name, x, y - 15, 11, c);
    }
    // waypoint
    const wp = game.state && game.state.waypoint;
    const me = game.me || { x: 0, z: 0, yaw: 0 };
    if (wp) {
      const [x, y] = this.w2s(wp.x, wp.z);
      // dashed line from me
      const [mx, my] = this.w2s(me.x, me.z);
      ctx.save(); ctx.setLineDash([7, 7]); ctx.lineDashOffset = -this.t * 16; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,180,87,.85)';
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(x, y); ctx.stroke(); ctx.restore();
      pinIcon(ctx, x, y, 1.05);
      label(ctx, fmtDist(Math.hypot(wp.x - me.x, wp.z - me.z)), x, y + 11, 11, '#ffd9a8');
    }
    // me
    const [mx, my] = this.w2s(me.x, me.z);
    playerArrow(ctx, mx, my, -(me.yaw || 0), 11, (this.t % 1.6) / 1.6);
    label(ctx, 'You', mx, my + 22, 11, '#ffb457');
  }

  _drawScale(ctx) {
    const v = this.view; const cands = [10, 25, 50, 100, 250, 500, 1000]; let m = 100;
    for (const c of cands) { if (c * v.z >= 70) { m = c; break; } m = c; }
    const px = m * v.z, x = 16, y = this.H - 16;
    ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,14,17,.9)'; ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + px, y); ctx.lineTo(x + px, y - 5); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#f3ecd9'; ctx.stroke(); ctx.restore();
    label(ctx, fmtDist(m), x + px / 2, y - 12, 11, '#f3ecd9');
  }

  _updateDom() {
    const { game, data } = this;
    const info = game.worldInfo || {};
    // header
    const day = info.day, hr = info.hour;
    const tm = (day != null ? `Day ${day}` : '') + (Number.isFinite(hr) ? `${day != null ? ' · ' : ''}${fmtClock(hr)}` : '');
    if (this.$time.textContent !== tm) this.$time.textContent = tm;
    // progress
    const b = this.base;
    this.$prog.classList.toggle('hidden', b.done);
    if (!b.done) { this.$progBar.style.width = Math.round(b.progress * 100) + '%'; this.$progT.textContent = `Charting the island… ${Math.round(b.progress * 100)}%`; }
    // you are here
    const me = game.me || { x: 0, z: 0 };
    if (!this._yt || this.t - this._yt > 0.25) {
      this._yt = this.t;
      this.$you.innerHTML = `You are here: <b>${BIOME_NAMES[data.biome(me.x, me.z)]}</b> · ${Math.round(me.x)}, ${Math.round(me.z)} · ${gridName(me.x, me.z)}`;
      const wp = game.state.waypoint;
      this.$wp.classList.toggle('hidden', !wp);
      if (wp) { const dx = wp.x - me.x, dz = wp.z - me.z; this.$wpTxt.innerHTML = `Waypoint <b>${fmtDist(Math.hypot(dx, dz))}</b> ${compass8(dx, dz)}`; }
    }
    // cursor readout
    if (this.mouse) {
      const [sx, sy] = this.mouse, [wx, wz] = this.s2w(sx, sy);
      const inside = Math.abs(wx) <= WORLD_HALF && Math.abs(wz) <= WORLD_HALF;
      const lm = this._landmarkAt(sx, sy);
      this.cv.style.cursor = this.drag && this.drag.moved ? 'grabbing' : lm ? 'pointer' : 'crosshair';
      this.$rdXY.textContent = `X ${Math.round(wx)}  Z ${Math.round(wz)}`;
      if (inside) {
        const h = data.height(wx, wz);
        this.$rdBio.textContent = BIOME_NAMES[data.terrain.biome(wx, wz, h)];
        this.$rdGrid.textContent = 'Grid ' + gridName(wx, wz);
        const disc = game.state.disc; const found = lm && disc && disc.has && disc.has(lm.id);
        this.$rdEx.textContent = (lm ? ` · ${found ? lm.name : 'Unexplored place'}` : '') + ` · ${fmtDist(Math.hypot(wx - me.x, wz - me.z))} away`;
      } else { this.$rdBio.textContent = 'Beyond the edge'; this.$rdGrid.textContent = ''; this.$rdEx.textContent = ''; }
    } else { this.$rdXY.textContent = 'Move the cursor over the map'; this.$rdBio.textContent = ''; this.$rdGrid.textContent = ''; this.$rdEx.textContent = ''; }
  }
}

// ================================================================= Minimap
export class Minimap {
  constructor(canvas, game) {
    this.cv = canvas; this.game = game; this.ctx = canvas.getContext('2d');
    this.data = game.world.data; this.base = getMapBase(this.data);
    this.range = 140;            // metres from centre to rim
    this.t = 0; this._bt = 0; this._bio = '';
    this.coordsEl = document.getElementById('minimap-coords');
    // crisp on hi-dpi without changing layout size
    const dpr = Math.min(2, window.devicePixelRatio || 1), css = canvas.width;
    this.size = css; this.dpr = dpr;
    if (dpr > 1) { canvas.style.width = canvas.style.width || css + 'px'; canvas.style.height = canvas.style.height || css + 'px'; canvas.width = css * dpr; canvas.height = css * dpr; }
  }
  setRange(m) { this.range = clamp(m, 60, 600); }
  draw(x, z, yaw, dt = 0.016) {
    const { ctx, size: S, dpr, data, game } = this; const R = S / 2;
    this.t += dt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, S, S);
    const k = (R - 3) / this.range;            // px per metre
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#18415f'; ctx.fillRect(0, 0, S, S);
    // world layer, rotated so the view direction is up
    ctx.save(); ctx.translate(R, R); ctx.rotate(yaw); ctx.scale(k, k); ctx.translate(-x, -z);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'medium';
    const span = this.range * 1.5, sx0 = clamp(x - span, -WORLD_HALF, WORLD_HALF), sx1 = clamp(x + span, -WORLD_HALF, WORLD_HALF);
    const sz0 = clamp(z - span, -WORLD_HALF, WORLD_HALF), sz1 = clamp(z + span, -WORLD_HALF, WORLD_HALF);
    if (sx1 - sx0 > 1 && sz1 - sz0 > 1) {
      const f = GRID_N / SPAN;
      ctx.drawImage(this.base.canvas, (sx0 + WORLD_HALF) * f, (sz0 + WORLD_HALF) * f, (sx1 - sx0) * f, (sz1 - sz0) * f, sx0, sz0, sx1 - sx0, sz1 - sz0);
    }
    drawRoads(ctx, data, k, 3.2, 1.7, 0.9);
    ctx.restore();

    // markers (rotated positions, upright glyphs)
    const rot = (px, pz) => { const dx = px - x, dz = pz - z, c = Math.cos(yaw), s = Math.sin(yaw); return [R + (dx * c - dz * s) * k, R + (dx * s + dz * c) * k]; };
    const lim = R - 9;
    const disc = (game.state && game.state.disc) || new Set();
    for (const lm of data.landmarks) {
      const [px, py] = rot(lm.x, lm.z); if (Math.hypot(px - R, py - R) > R - 6) continue;
      const found = disc.has && disc.has(lm.id), st = LM_STYLE[lm.type];
      if (found) { ctx.beginPath(); ctx.arc(px, py, 5, 0, 7); ctx.fillStyle = st.color; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(8,14,17,.9)'; ctx.stroke(); }
      else { ctx.font = '800 10px "Trebuchet MS",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(243,236,217,.45)'; ctx.fillText('?', px, py); }
    }
    for (const m of getMarkers(game)) {
      if (m.kind === 'wp') continue; const [px, py] = rot(m.x, m.z); if (Math.hypot(px - R, py - R) > R - 6) continue;
      if (m.kind === 'death') skullIcon(ctx, px, py, 6.5); else if (m.kind === 'bag') bagIcon(ctx, px, py, 6);
    }
    for (const t of teamMates(game)) {
      let [px, py] = rot(t.x, t.z); const d = Math.hypot(px - R, py - R), c = teamColor(t.name);
      if (d > lim) { px = R + (px - R) / d * lim; py = R + (py - R) / d * lim; }
      ctx.beginPath(); ctx.arc(px, py, 4.4, 0, 7); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = '#0d1a10'; ctx.stroke();
    }
    const wp = game.state && game.state.waypoint;
    if (wp) {
      let [px, py] = rot(wp.x, wp.z); const d = Math.hypot(px - R, py - R);
      if (d > lim) {   // edge arrow
        const a = Math.atan2(py - R, px - R); px = R + Math.cos(a) * (R - 8); py = R + Math.sin(a) * (R - 8);
        ctx.save(); ctx.translate(px, py); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4.5, -5.6); ctx.lineTo(-2, 0); ctx.lineTo(-4.5, 5.6); ctx.closePath();
        ctx.fillStyle = '#ffb457'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = '#2a1200'; ctx.stroke(); ctx.restore();
      } else pinIcon(ctx, px, py, 0.7);
    }
    ctx.restore();

    // player arrow at centre
    playerArrow(ctx, R, R, 0, 7.2, 0);
    // rim + inner shadow
    const g = ctx.createRadialGradient(R, R, R * 0.7, R, R, R - 2); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.beginPath(); ctx.arc(R, R, R - 2, 0, 7); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#0f1519'; ctx.beginPath(); ctx.arc(R, R, R - 2.5, 0, 7); ctx.stroke();
    ctx.lineWidth = 1.6; ctx.strokeStyle = '#ff8a3c'; ctx.beginPath(); ctx.arc(R, R, R - 4, 0, 7); ctx.stroke();
    // generation progress (thin arc on rim)
    if (!this.base.done) { ctx.lineWidth = 3; ctx.strokeStyle = '#ffd9a8'; ctx.beginPath(); ctx.arc(R, R, R - 4, -Math.PI / 2, -Math.PI / 2 + this.base.progress * Math.PI * 2); ctx.stroke(); }
    // compass letters (N,E,S,W) rotate with the world
    ctx.font = '800 11px "Trebuchet MS",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [['N', 0, -1, '#ff6a4d'], ['E', 1, 0, '#f3ecd9'], ['S', 0, 1, '#f3ecd9'], ['W', -1, 0, '#f3ecd9']].forEach(([c, dx, dz, col]) => {
      const cs = Math.cos(yaw), sn = Math.sin(yaw), rx = dx * cs - dz * sn, rz = dx * sn + dz * cs;
      const px = R + rx * (R - 14), py = R + rz * (R - 14);
      ctx.beginPath(); ctx.arc(px, py, 7.5, 0, 7); ctx.fillStyle = 'rgba(12,19,23,.82)'; ctx.fill();
      ctx.fillStyle = col; ctx.fillText(c, px, py + 0.5);
    });
    // coordinates label
    if (this.coordsEl) {
      this._bt -= dt;
      if (this._bt <= 0) { this._bt = 0.35; this._bio = BIOME_NAMES[data.biome(x, z)]; }
      const txt = `${Math.round(x)}, ${Math.round(z)} · ${this._bio}`;
      if (txt !== this._lastTxt) { this.coordsEl.textContent = txt; this._lastTxt = txt; }
    }
  }
}
