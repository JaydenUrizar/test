// Animated dusk backdrop: gradient sky, twinkling stars, drifting clouds, layered low-poly mountains
// (pre-rendered tiles with parallax drift), pine silhouettes and rising embers. Pure canvas 2D.

const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// far -> near: [fill, lit, dark, haze, baseFrac, ampFrac, peaks, speed px/s]
const LAYERS = [
  { mid: '#7a4f7d', lit: '#a5688a', dark: '#5f3e70', haze: '#e88a6a', base: 0.60, amp: 0.30, n: 7, speed: 1.6, seed: 11 },
  { mid: '#573a66', lit: '#7d4c78', dark: '#432f5a', haze: '#cf7a72', base: 0.68, amp: 0.24, n: 9, speed: 3.2, seed: 23 },
  { mid: '#33304f', lit: '#4e3c62', dark: '#272844', haze: '#a2647a', base: 0.77, amp: 0.19, n: 10, speed: 5.5, seed: 37 },
  { mid: '#1b2a3d', lit: '#28384c', dark: '#152234', haze: '#5c4a6c', base: 0.86, amp: 0.14, n: 12, speed: 9, seed: 41 },
];

export class Backdrop {
  constructor(host) {
    this.host = host;
    this.el = document.createElement('div');
    this.el.className = 'mn-bg';
    this.el.innerHTML = '<div class="mn-sky"></div><canvas class="mn-canvas"></canvas><div class="mn-shade"></div>';
    host.appendChild(this.el);
    this.cv = this.el.querySelector('canvas');
    this.ctx = this.cv.getContext('2d');
    this.running = false; this.t = 0; this.raf = 0; this.last = 0;
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.glow = this.makeGlow();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  makeGlow() {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,236,170,1)'); gr.addColorStop(0.25, 'rgba(255,170,70,.75)'); gr.addColorStop(1, 'rgba(255,110,30,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    return c;
  }

  resize() {
    const r = this.el.getBoundingClientRect();
    const W = Math.max(320, Math.round(r.width || innerWidth)), H = Math.max(240, Math.round(r.height || innerHeight));
    if (W === this.W && H === this.H) return;
    this.W = W; this.H = H;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.cv.width = Math.round(W * this.dpr); this.cv.height = Math.round(H * this.dpr);
    this.build();
    if (!this.running) this.draw(0);
  }

  build() {
    const { W, H } = this;
    this.tile = Math.ceil(W * 1.3);
    this.layers = LAYERS.map((L, i) => this.renderLayer(L, i));
    this.fore = this.renderForeground();
    const rnd = rng(7);
    this.stars = Array.from({ length: 110 }, () => ({ x: rnd() * W, y: rnd() * H * 0.5, r: 0.5 + rnd() * 1.2, p: rnd() * 6.28, s: 0.6 + rnd() * 1.6 }));
    this.clouds = Array.from({ length: 5 }, (_, i) => ({ x: rnd() * W, y: H * (0.16 + rnd() * 0.3), w: 160 + rnd() * 260, h: 12 + rnd() * 16, v: 3 + rnd() * 5, a: 0.13 + rnd() * 0.12, i }));
    const count = Math.round(Math.min(70, Math.max(34, W / 22)));
    this.embers = Array.from({ length: count }, () => this.newEmber(true));
  }

  newEmber(init) {
    const { W, H } = this;
    return { x: Math.random() * W, y: init ? Math.random() * H : H + 10, vx: (Math.random() - 0.5) * 10, vy: -(14 + Math.random() * 34), r: 1.4 + Math.random() * 3, ph: Math.random() * 6.28, sw: 8 + Math.random() * 22, life: 0.35 + Math.random() * 0.65 };
  }

  renderLayer(L, idx) {
    const { H } = this, T = this.tile, dpr = this.dpr;
    const c = document.createElement('canvas'); c.width = Math.round(T * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const rnd = rng(L.seed + Math.round(this.W));
    const n = L.n, step = T / n, baseY = H * L.base, amp = H * L.amp;
    // vertices alternate peak / valley, wrapping on index so tiles are seamless
    const hs = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 0.55 + rnd() * 0.45 : 0.08 + rnd() * 0.22));
    const jit = Array.from({ length: n }, () => (rnd() - 0.5) * step * 0.35);
    const pt = (i) => { const k = ((i % n) + n) % n; return { x: i * step + jit[k], y: baseY + amp * 0.35 - hs[k] * amp, peak: k % 2 === 0 }; };
    const pts = []; for (let i = -2; i <= n + 2; i++) pts.push(pt(i));
    // body
    g.fillStyle = L.mid; g.beginPath(); g.moveTo(pts[0].x, H);
    for (const p of pts) g.lineTo(p.x, p.y);
    g.lineTo(pts[pts.length - 1].x, H); g.closePath(); g.fill();
    // facets: light triangle on the left of each peak, dark on the right, diagonal split
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i]; if (!p.peak) continue;
      const l = pts[i - 1], r = pts[i + 1];
      const foot = { x: p.x + (rnd() - 0.4) * step * 0.5, y: Math.min(H, p.y + (baseY - p.y) * 0.75 + amp * 0.7) };
      g.fillStyle = L.lit; g.beginPath(); g.moveTo(l.x, l.y); g.lineTo(p.x, p.y); g.lineTo(foot.x, foot.y); g.lineTo(l.x, Math.max(l.y + 4, foot.y)); g.closePath(); g.fill();
      g.fillStyle = L.dark; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(r.x, r.y); g.lineTo(r.x, Math.max(r.y + 4, foot.y)); g.lineTo(foot.x, foot.y); g.closePath(); g.fill();
      // snow / rim highlight on the tallest far peaks
      if (idx < 2 && p.y < baseY - amp * 0.5) {
        g.fillStyle = 'rgba(255,214,190,.42)'; g.beginPath(); g.moveTo(p.x, p.y);
        g.lineTo(p.x - step * 0.13, p.y + amp * 0.13); g.lineTo(p.x - step * 0.03, p.y + amp * 0.1); g.lineTo(p.x + step * 0.03, p.y + amp * 0.17); g.lineTo(p.x + step * 0.12, p.y + amp * 0.11); g.closePath(); g.fill();
      }
    }
    // atmospheric haze pooling at the foot of each layer
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(0, baseY - amp * 0.5, 0, baseY + amp * 0.45 + 30);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, hexA(L.haze, idx === 3 ? 0.35 : 0.6));
    g.fillStyle = gr; g.fillRect(0, 0, T, H);
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  renderForeground() {
    const { W, H } = this, dpr = this.dpr, T = this.tile;
    const c = document.createElement('canvas'); c.width = Math.round(T * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const rnd = rng(99 + Math.round(W));
    g.fillStyle = '#0c151d';
    g.beginPath(); g.moveTo(0, H);
    const n = 40, step = T / n;
    for (let i = 0; i <= n; i++) g.lineTo(i * step, H * 0.955 - Math.sin((i / n) * Math.PI * 6) * H * 0.012 - Math.sin((i / n) * Math.PI * 14 + 1) * H * 0.006);
    g.lineTo(T, H); g.closePath(); g.fill();
    // pines: stacked triangles
    const pines = Math.round(T / 34);
    for (let i = 0; i < pines; i++) {
      const x = (i / pines) * T + rnd() * 26, s = 0.55 + rnd() * 0.95, h = H * 0.11 * s, w = h * 0.42, by = H * 0.965;
      g.fillStyle = rnd() > 0.5 ? '#0a1219' : '#0e1922';
      for (let k = 0; k < 4; k++) {
        const ty = by - h + (k * h) / 4.2, ww = w * (0.45 + k * 0.28);
        g.beginPath(); g.moveTo(x, ty - h * 0.12); g.lineTo(x + ww, ty + h * 0.34); g.lineTo(x - ww, ty + h * 0.34); g.closePath(); g.fill();
      }
      g.fillRect(x - 1.5, by - h * 0.1, 3, h * 0.14);
    }
    return c;
  }

  start() {
    if (this.running) return;
    this.running = true; this.el.classList.add('live'); this.last = performance.now();
    this.resize();
    if (this.reduced) { this.draw(0); return; }
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      this.t += dt; this.draw(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { this.running = false; this.el.classList.remove('live'); cancelAnimationFrame(this.raf); }
  destroy() { this.stop(); window.removeEventListener('resize', this.onResize); this.el.remove(); }

  draw(dt) {
    const g = this.ctx, { W, H, t, dpr } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // stars
    for (const s of this.stars) {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.s + s.p)), fade = 1 - Math.min(1, s.y / (H * 0.42));
      g.fillStyle = `rgba(255,240,220,${(a * fade * 0.85).toFixed(3)})`; g.fillRect(s.x, s.y, s.r, s.r);
    }
    // sun glow on the horizon
    const sx = W * 0.68, sy = H * 0.6, pulse = 1 + Math.sin(t * 0.7) * 0.03;
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.9;
    g.drawImage(this.glow, sx - W * 0.55 * pulse, sy - H * 0.75 * pulse, W * 1.1 * pulse, H * 1.5 * pulse);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const sr = Math.min(W, H) * 0.075;
    const sg = g.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr * 1.4);
    sg.addColorStop(0, 'rgba(255,240,190,1)'); sg.addColorStop(0.55, 'rgba(255,190,110,.9)'); sg.addColorStop(1, 'rgba(255,150,80,0)');
    g.fillStyle = sg; g.beginPath(); g.arc(sx, sy, sr * 1.4, 0, 6.283); g.fill();
    // clouds — flat low-poly slabs
    for (const c of this.clouds) {
      c.x += c.v * dt; if (c.x - c.w > W) c.x = -c.w * 1.2;
      g.fillStyle = `rgba(255,170,140,${c.a})`;
      g.beginPath(); g.moveTo(c.x - c.w * 0.5, c.y + c.h); g.lineTo(c.x - c.w * 0.3, c.y); g.lineTo(c.x + c.w * 0.05, c.y - c.h * 0.4); g.lineTo(c.x + c.w * 0.32, c.y + c.h * 0.1); g.lineTo(c.x + c.w * 0.5, c.y + c.h); g.closePath(); g.fill();
    }
    // mountains (parallax)
    const T = this.tile;
    this.layers.forEach((c, i) => {
      const off = (t * LAYERS[i].speed) % T;
      g.drawImage(c, -off, 0, T, H); g.drawImage(c, T - off, 0, T, H);
      if (i === 1) this.drawEmbers(g, dt, 0.5);
    });
    const off = (t * 14) % T;
    g.drawImage(this.fore, -off, 0, T, H); g.drawImage(this.fore, T - off, 0, T, H);
    this.drawEmbers(g, dt, 1);
  }

  drawEmbers(g, dt, part) {
    const half = this.embers.length >> 1;
    const from = part === 0.5 ? 0 : half, to = part === 0.5 ? half : this.embers.length;
    g.globalCompositeOperation = 'lighter';
    for (let i = from; i < to; i++) {
      const e = this.embers[i];
      e.y += e.vy * dt; e.x += (e.vx + Math.sin(this.t * 0.9 + e.ph) * e.sw * 0.35) * dt;
      if (e.y < -20 || e.x < -30 || e.x > this.W + 30) { this.embers[i] = this.newEmber(false); continue; }
      const k = Math.max(0, Math.min(1, e.y / this.H)), fl = 0.65 + 0.35 * Math.sin(this.t * 6 + e.ph * 3);
      g.globalAlpha = Math.min(1, k * 1.4) * fl * e.life;
      const s = e.r * 5; g.drawImage(this.glow, e.x - s / 2, e.y - s / 2, s, s);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
