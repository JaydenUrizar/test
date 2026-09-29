// Emberwild audio: everything is synthesised with WebAudio (no asset files). Spatialised sfx, ambience, music.
import { settings } from './settings.js';

class AudioEngine {
  constructor() {
    this.ctx = null; this.ready = false;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.weather = 'clear'; this.night = 0; this.underwater = false;
    this.lastStep = 0; this.nextBird = 0; this.nextCricket = 0; this.musicOn = false;
    settings.on(() => this.applyVolumes());
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.ambBus = c.createGain(); this.ambBus.connect(this.master);
    this.musBus = c.createGain(); this.musBus.connect(this.master);
    // shared reverb-ish delay for big sounds
    this.echo = c.createDelay(0.6); this.echo.delayTime.value = 0.23;
    const fb = c.createGain(); fb.gain.value = 0.28; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    this.echo.connect(lp); lp.connect(fb); fb.connect(this.echo);
    this.echoSend = c.createGain(); this.echoSend.gain.value = 0.35; this.echoSend.connect(this.echo); this.echo.connect(this.sfxBus);
    // noise buffers
    const mk = (secs, fn) => { const b = c.createBuffer(1, c.sampleRate * secs, c.sampleRate); const d = b.getChannelData(0); fn(d); return b; };
    this.white = mk(2, (d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
    this.pink = mk(4, (d) => { let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; } });
    this.applyVolumes();
    this.ready = true;
    this.startAmbient();
  }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.get('master'), t, 0.05);
    this.sfxBus.gain.setTargetAtTime(settings.get('sfx'), t, 0.05);
    this.ambBus.gain.setTargetAtTime(settings.get('ambience'), t, 0.05);
    this.musBus.gain.setTargetAtTime(settings.get('music') * 0.6, t, 0.2);
  }
  setListener(x, y, z, yaw) { this.listener.x = x; this.listener.y = y; this.listener.z = z; this.listener.yaw = yaw; }

  // ---------------------------------------------------------------- primitives
  // opts: { t: delay, dur, gain, noise: 'white'|'pink', osc: type, f0, f1, filter: [type,f0,f1,q], attack, pan, echo, dest }
  voice(o) {
    const c = this.ctx; if (!c) return;
    const t0 = c.currentTime + (o.t || 0), dur = o.dur || 0.1, att = o.attack ?? 0.002;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(o.gain ?? 0.5, t0 + att); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let src;
    if (o.noise) { src = c.createBufferSource(); src.buffer = o.noise === 'pink' ? this.pink : this.white; src.loop = true; src.playbackRate.value = o.rate || 1; src.start(t0, Math.random() * 1.5); }
    else { src = c.createOscillator(); src.type = o.osc || 'sine'; src.frequency.setValueAtTime(o.f0 || 440, t0); if (o.f1) src.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + dur); src.start(t0); }
    let node = src;
    if (o.filter) { const f = c.createBiquadFilter(); f.type = o.filter[0]; f.frequency.setValueAtTime(o.filter[1], t0); if (o.filter[2]) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.filter[2]), t0 + dur); f.Q.value = o.filter[3] || 1; node.connect(f); node = f; }
    node.connect(g);
    let out = g;
    if (o.pan) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); out = p; }
    out.connect(o.dest || this.sfxBus);
    if (o.echo) { const e = c.createGain(); e.gain.value = o.echo; out.connect(e); e.connect(this.echoSend); }
    src.stop(t0 + dur + 0.05);
  }
  spatial(pos) {
    if (!pos) return { vol: 1, pan: 0, lp: 22000 };
    const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z, dy = (pos.y ?? this.listener.y) - this.listener.y;
    const d = Math.hypot(dx, dy, dz);
    const vol = 1 / (1 + Math.pow(d / (pos.ref || 14), 1.6));
    // listener forward = (-sin yaw, -cos yaw); right = (cos yaw, -sin yaw)
    const rx = Math.cos(this.listener.yaw), rz = -Math.sin(this.listener.yaw);
    const pan = d < 1 ? 0 : (dx * rx + dz * rz) / d;
    return { vol, pan: pan * 0.85, lp: Math.max(500, 20000 / (1 + d / 40)), d };
  }

  // ---------------------------------------------------------------- public: sfx
  ui(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'click': this.voice({ osc: 'triangle', f0: 620, f1: 420, dur: 0.07, gain: 0.25 }); break;
      case 'hover': this.voice({ osc: 'sine', f0: 900, dur: 0.03, gain: 0.06 }); break;
      case 'back': this.voice({ osc: 'triangle', f0: 400, f1: 260, dur: 0.09, gain: 0.22 }); break;
      case 'success': [523, 659, 784].forEach((f, i) => this.voice({ osc: 'triangle', f0: f, dur: 0.22, gain: 0.22, t: i * 0.08 })); break;
      case 'error': this.voice({ osc: 'square', f0: 180, f1: 120, dur: 0.18, gain: 0.16 }); break;
      case 'tick': this.voice({ osc: 'square', f0: 1200, dur: 0.02, gain: 0.05 }); break;
      case 'open': this.voice({ noise: 'white', dur: 0.12, gain: 0.12, filter: ['bandpass', 800, 2400, 1.2] }); break;
      case 'levelup': [523, 659, 784, 1047].forEach((f, i) => this.voice({ osc: 'triangle', f0: f, dur: 0.5, gain: 0.25, t: i * 0.1, echo: 0.3 })); break;
    }
  }

  sfx(name, pos, vol = 1) {
    const c = this.ctx; if (!c) return;
    const s = this.spatial(pos);
    if (s.vol < 0.01) return;
    const V = vol * s.vol, pan = s.pan, lpf = s.lp;
    const v = (o) => this.voice({ pan, ...o, gain: (o.gain ?? 0.5) * V, filter: o.filter ? (lpf < 15000 && o.filter[0] === 'lowpass' ? [o.filter[0], Math.min(o.filter[1], lpf), o.filter[2] && Math.min(o.filter[2], lpf), o.filter[3]] : o.filter) : (lpf < 15000 ? ['lowpass', lpf, 0, 0.7] : null) });
    const R = Math.random;
    switch (name) {
      // footsteps
      case 'step_grass': v({ noise: 'pink', dur: 0.09, gain: 0.32, filter: ['bandpass', 500 + R() * 200, 300, 0.8], attack: 0.004 }); break;
      case 'step_sand': v({ noise: 'white', dur: 0.11, gain: 0.2, filter: ['bandpass', 1400, 800, 0.6] }); break;
      case 'step_stone': v({ noise: 'white', dur: 0.05, gain: 0.3, filter: ['bandpass', 1800 + R() * 400, 900, 1.5] }); v({ osc: 'sine', f0: 140, f1: 80, dur: 0.06, gain: 0.25 }); break;
      case 'step_wood': v({ osc: 'triangle', f0: 200 + R() * 40, f1: 120, dur: 0.07, gain: 0.45 }); v({ noise: 'white', dur: 0.04, gain: 0.15, filter: ['bandpass', 900, 500, 1] }); break;
      case 'step_snow': v({ noise: 'pink', dur: 0.13, gain: 0.3, filter: ['lowpass', 900, 400, 0.7], attack: 0.02 }); break;
      case 'step_water': v({ noise: 'white', dur: 0.2, gain: 0.3, filter: ['bandpass', 900, 500, 0.6], attack: 0.01 }); break;
      case 'jump': v({ noise: 'pink', dur: 0.1, gain: 0.2, filter: ['bandpass', 700, 400, 0.8] }); break;
      case 'land': v({ osc: 'sine', f0: 110, f1: 55, dur: 0.16, gain: 0.5 }); v({ noise: 'pink', dur: 0.12, gain: 0.3, filter: ['lowpass', 900, 300, 0.7] }); break;
      case 'splash': v({ noise: 'white', dur: 0.4, gain: 0.5, filter: ['bandpass', 1200, 400, 0.5], attack: 0.01 }); break;
      // gathering / melee
      case 'chop': v({ osc: 'triangle', f0: 170, f1: 70, dur: 0.14, gain: 0.7 }); v({ noise: 'white', dur: 0.06, gain: 0.5, filter: ['bandpass', 1400, 600, 1.2] }); v({ osc: 'sine', f0: 90, f1: 50, dur: 0.2, gain: 0.5, t: 0.01 }); break;
      case 'mine': v({ osc: 'square', f0: 1500 + R() * 400, f1: 1200, dur: 0.05, gain: 0.25 }); v({ noise: 'white', dur: 0.05, gain: 0.45, filter: ['highpass', 2500, 0, 0.7] }); v({ osc: 'sine', f0: 130, f1: 70, dur: 0.1, gain: 0.5 }); break;
      case 'leaf': v({ noise: 'pink', dur: 0.15, gain: 0.4, filter: ['bandpass', 3000, 1500, 0.8], attack: 0.01 }); break;
      case 'whoosh': v({ noise: 'pink', dur: 0.18, gain: 0.22, filter: ['bandpass', 500, 2200, 1.2], attack: 0.06 }); break;
      case 'hit_flesh': v({ osc: 'sine', f0: 140, f1: 60, dur: 0.14, gain: 0.7 }); v({ noise: 'pink', dur: 0.1, gain: 0.5, filter: ['lowpass', 900, 300, 0.8] }); break;
      case 'hit_dirt': v({ noise: 'pink', dur: 0.14, gain: 0.5, filter: ['lowpass', 700, 250, 0.7] }); break;
      case 'hit_stone': v({ noise: 'white', dur: 0.07, gain: 0.5, filter: ['highpass', 2000, 0, 0.7] }); v({ osc: 'square', f0: 900, f1: 600, dur: 0.05, gain: 0.15 }); break;
      case 'hit_wood': v({ osc: 'triangle', f0: 240, f1: 110, dur: 0.1, gain: 0.55 }); v({ noise: 'white', dur: 0.05, gain: 0.3, filter: ['bandpass', 1200, 700, 1] }); break;
      case 'hit_metal': v({ osc: 'square', f0: 1800, f1: 1400, dur: 0.12, gain: 0.2 }); v({ osc: 'sine', f0: 2400, dur: 0.25, gain: 0.15 }); v({ noise: 'white', dur: 0.04, gain: 0.35, filter: ['highpass', 3000, 0, 1] }); break;
      case 'break': v({ osc: 'square', f0: 500, f1: 90, dur: 0.3, gain: 0.35 }); v({ noise: 'white', dur: 0.25, gain: 0.5, filter: ['bandpass', 1500, 400, 0.7] }); break;
      case 'tree_fall': v({ noise: 'pink', dur: 1.2, gain: 0.6, filter: ['lowpass', 500, 150, 0.7], attack: 0.5 }); v({ osc: 'sine', f0: 70, f1: 30, dur: 0.5, gain: 0.8, t: 1.05 }); v({ noise: 'white', dur: 0.4, gain: 0.5, filter: ['lowpass', 900, 200, 0.8], t: 1.05 }); break;
      // items / crafting / building
      case 'pickup': v({ osc: 'sine', f0: 700, f1: 1100, dur: 0.09, gain: 0.3 }); break;
      case 'craft': [660, 880, 1320].forEach((f, i) => v({ osc: 'triangle', f0: f, dur: 0.25, gain: 0.25, t: i * 0.07, echo: 0.2 })); break;
      case 'eat': for (let i = 0; i < 3; i++) v({ noise: 'pink', dur: 0.08, gain: 0.5, filter: ['bandpass', 900, 500, 1], t: i * 0.16 }); break;
      case 'drink': for (let i = 0; i < 3; i++) { v({ osc: 'sine', f0: 300 + i * 90, f1: 600 + i * 90, dur: 0.1, gain: 0.35, t: i * 0.14 }); } break;
      case 'heal': [523, 659, 784].forEach((f, i) => v({ osc: 'sine', f0: f, dur: 0.4, gain: 0.25, t: i * 0.12, echo: 0.25 })); break;
      case 'plant': v({ noise: 'pink', dur: 0.2, gain: 0.5, filter: ['lowpass', 600, 250, 0.7] }); break;
      case 'build': v({ osc: 'triangle', f0: 190, f1: 90, dur: 0.16, gain: 0.7 }); v({ noise: 'white', dur: 0.06, gain: 0.5, filter: ['bandpass', 1100, 500, 1.2] }); v({ osc: 'sine', f0: 80, f1: 45, dur: 0.25, gain: 0.5, t: 0.02 }); break;
      case 'upgrade': [392, 523, 659].forEach((f, i) => v({ osc: 'square', f0: f, dur: 0.15, gain: 0.12, t: i * 0.07 })); v({ osc: 'triangle', f0: 200, f1: 90, dur: 0.2, gain: 0.5 }); break;
      case 'destroy': v({ noise: 'pink', dur: 0.9, gain: 0.8, filter: ['lowpass', 1400, 200, 0.7], attack: 0.01 }); v({ osc: 'sine', f0: 80, f1: 30, dur: 0.6, gain: 0.8 }); break;
      case 'door': v({ osc: 'triangle', f0: 130, f1: 70, dur: 0.22, gain: 0.5 }); v({ noise: 'pink', dur: 0.2, gain: 0.25, filter: ['bandpass', 500, 300, 1] }); break;
      case 'lock': v({ osc: 'square', f0: 800, f1: 500, dur: 0.06, gain: 0.25 }); v({ osc: 'square', f0: 600, dur: 0.08, gain: 0.25, t: 0.08 }); break;
      case 'unlock': v({ osc: 'square', f0: 500, f1: 900, dur: 0.07, gain: 0.25 }); v({ osc: 'triangle', f0: 1200, dur: 0.15, gain: 0.2, t: 0.08 }); break;
      case 'locked': v({ osc: 'square', f0: 160, f1: 110, dur: 0.14, gain: 0.3 }); break;
      case 'ignite': v({ noise: 'white', dur: 0.5, gain: 0.5, filter: ['bandpass', 2000, 600, 0.7], attack: 0.15 }); break;
      case 'fireoff': v({ noise: 'white', dur: 0.6, gain: 0.35, filter: ['lowpass', 2500, 300, 0.7], attack: 0.02 }); break;
      case 'crackle': v({ noise: 'white', dur: 0.03, gain: 0.35 * R(), filter: ['highpass', 2500, 0, 0.7] }); break;
      case 'open': v({ osc: 'triangle', f0: 200, f1: 320, dur: 0.14, gain: 0.35 }); v({ noise: 'pink', dur: 0.15, gain: 0.25, filter: ['bandpass', 800, 1400, 1] }); break;
      // guns — each weapon has its own voice
      case 'revolver': v({ noise: 'white', dur: 0.09, gain: 0.95, filter: ['lowpass', 5000, 800, 0.8], echo: 0.5 }); v({ osc: 'sine', f0: 190, f1: 45, dur: 0.28, gain: 1.0 }); v({ noise: 'white', dur: 0.35, gain: 0.3, filter: ['lowpass', 900, 200, 0.8], t: 0.02, echo: 0.6 }); break;
      case 'smg': v({ noise: 'white', dur: 0.05, gain: 0.85, filter: ['bandpass', 3200, 1200, 0.9] }); v({ osc: 'square', f0: 260, f1: 90, dur: 0.06, gain: 0.35 }); v({ osc: 'sine', f0: 140, f1: 60, dur: 0.09, gain: 0.55 }); break;
      case 'shotgun': v({ noise: 'white', dur: 0.32, gain: 1.15, filter: ['lowpass', 3500, 250, 0.8], echo: 0.65 }); v({ osc: 'sine', f0: 110, f1: 30, dur: 0.45, gain: 1.2 }); v({ noise: 'pink', dur: 0.5, gain: 0.5, filter: ['lowpass', 600, 120, 0.7], t: 0.03, echo: 0.6 }); break;
      case 'rifle': v({ noise: 'white', dur: 0.07, gain: 1.0, filter: ['highpass', 1500, 0, 0.7], echo: 0.7 }); v({ noise: 'white', dur: 0.5, gain: 0.7, filter: ['lowpass', 4500, 200, 0.7], echo: 0.8 }); v({ osc: 'sine', f0: 150, f1: 35, dur: 0.4, gain: 1.1 }); v({ noise: 'pink', dur: 1.1, gain: 0.25, filter: ['lowpass', 500, 100, 0.7], t: 0.08, echo: 0.9 }); break;
      case 'raider_gun': v({ noise: 'white', dur: 0.1, gain: 0.8, filter: ['bandpass', 2600, 900, 0.9], echo: 0.5 }); v({ osc: 'sine', f0: 170, f1: 55, dur: 0.15, gain: 0.7 }); break;
      case 'turret': v({ noise: 'white', dur: 0.06, gain: 0.7, filter: ['bandpass', 2800, 1400, 1] }); v({ osc: 'square', f0: 900, f1: 300, dur: 0.05, gain: 0.2 }); break;
      case 'bow': v({ osc: 'sawtooth', f0: 220, f1: 120, dur: 0.16, gain: 0.35 }); v({ noise: 'white', dur: 0.1, gain: 0.3, filter: ['highpass', 2500, 0, 0.7] }); v({ osc: 'sine', f0: 320, f1: 200, dur: 0.3, gain: 0.25, t: 0.03 }); break;
      case 'draw': v({ noise: 'pink', dur: 0.5, gain: 0.25, filter: ['bandpass', 400, 900, 2], attack: 0.3 }); break;
      case 'dry': v({ osc: 'square', f0: 700, f1: 500, dur: 0.03, gain: 0.3 }); v({ noise: 'white', dur: 0.03, gain: 0.3, filter: ['highpass', 3000, 0, 1] }); break;
      case 'reload': v({ osc: 'square', f0: 500, f1: 300, dur: 0.05, gain: 0.25 }); v({ noise: 'white', dur: 0.05, gain: 0.35, filter: ['highpass', 2500, 0, 1], t: 0.05 }); v({ osc: 'square', f0: 350, f1: 500, dur: 0.06, gain: 0.25, t: 0.55 }); v({ noise: 'white', dur: 0.05, gain: 0.35, filter: ['bandpass', 3000, 1500, 1], t: 0.6 }); break;
      case 'shell': v({ osc: 'triangle', f0: 800, f1: 400, dur: 0.06, gain: 0.3 }); v({ noise: 'white', dur: 0.04, gain: 0.3, filter: ['highpass', 2500, 0, 1], t: 0.05 }); break;
      case 'pump': v({ noise: 'white', dur: 0.06, gain: 0.5, filter: ['bandpass', 1400, 700, 1.5] }); v({ noise: 'white', dur: 0.06, gain: 0.5, filter: ['bandpass', 1800, 900, 1.5], t: 0.14 }); break;
      case 'bullet_whiz': v({ osc: 'sine', f0: 2500, f1: 900, dur: 0.12, gain: 0.25 }); break;
      case 'ricochet': v({ osc: 'sine', f0: 3000, f1: 800, dur: 0.25, gain: 0.25 }); v({ noise: 'white', dur: 0.05, gain: 0.3, filter: ['highpass', 3500, 0, 1] }); break;
      case 'boom': v({ noise: 'white', dur: 1.4, gain: 1.4, filter: ['lowpass', 2500, 100, 0.7], echo: 0.9 }); v({ osc: 'sine', f0: 90, f1: 22, dur: 1.2, gain: 1.6 }); v({ noise: 'pink', dur: 2.0, gain: 0.6, filter: ['lowpass', 400, 60, 0.7], t: 0.1, echo: 1 }); break;
      case 'beep': v({ osc: 'square', f0: 1400, dur: 0.06, gain: 0.25 }); break;
      // creatures & player
      case 'hurt': v({ osc: 'sawtooth', f0: 260, f1: 130, dur: 0.22, gain: 0.5, filter: ['lowpass', 1400, 400, 1] }); v({ noise: 'pink', dur: 0.15, gain: 0.3, filter: ['lowpass', 800, 300, 1] }); break;
      case 'death': v({ osc: 'sawtooth', f0: 220, f1: 50, dur: 1.0, gain: 0.5, filter: ['lowpass', 900, 150, 1] }); break;
      case 'hit_marker': v({ osc: 'triangle', f0: 1500, f1: 1100, dur: 0.06, gain: 0.35 }); break;
      case 'headshot': v({ osc: 'triangle', f0: 2000, f1: 1500, dur: 0.1, gain: 0.4 }); v({ osc: 'sine', f0: 1000, dur: 0.14, gain: 0.3, t: 0.02 }); break;
      case 'kill': v({ osc: 'triangle', f0: 900, dur: 0.1, gain: 0.35 }); v({ osc: 'triangle', f0: 1350, dur: 0.18, gain: 0.35, t: 0.08 }); break;
      case 'deer': v({ osc: 'sawtooth', f0: 500, f1: 380, dur: 0.3, gain: 0.3, filter: ['bandpass', 900, 0, 3] }); break;
      case 'boar': v({ osc: 'sawtooth', f0: 130, f1: 90, dur: 0.35, gain: 0.5, filter: ['lowpass', 500, 0, 2] }); v({ noise: 'pink', dur: 0.3, gain: 0.3, filter: ['bandpass', 400, 0, 2] }); break;
      case 'wolf': v({ osc: 'sawtooth', f0: 320, f1: 520, dur: 0.9, gain: 0.35, filter: ['bandpass', 700, 0, 3], attack: 0.15, echo: 0.5 }); v({ osc: 'sawtooth', f0: 520, f1: 300, dur: 0.6, gain: 0.3, t: 0.9, filter: ['bandpass', 700, 0, 3], echo: 0.5 }); break;
      case 'growl': v({ osc: 'sawtooth', f0: 70, f1: 60, dur: 0.6, gain: 0.55, filter: ['lowpass', 300, 0, 2] }); v({ noise: 'pink', dur: 0.6, gain: 0.35, filter: ['lowpass', 400, 200, 1] }); break;
      case 'bite': v({ noise: 'white', dur: 0.08, gain: 0.5, filter: ['bandpass', 1200, 600, 1] }); v({ osc: 'sine', f0: 120, f1: 60, dur: 0.12, gain: 0.5 }); break;
      case 'thunder': v({ noise: 'pink', dur: 3.2, gain: 1.2, filter: ['lowpass', 500, 80, 0.7], attack: 0.3, echo: 0.8 }); v({ osc: 'sine', f0: 60, f1: 28, dur: 2.5, gain: 1.0, attack: 0.2 }); break;
      case 'chat': v({ osc: 'sine', f0: 900, dur: 0.06, gain: 0.15 }); break;
      case 'notify': v({ osc: 'triangle', f0: 880, dur: 0.1, gain: 0.25 }); v({ osc: 'triangle', f0: 1175, dur: 0.16, gain: 0.25, t: 0.09 }); break;
    }
  }

  // ---------------------------------------------------------------- ambience & music
  startAmbient() {
    const c = this.ctx; if (!c || this.amb) return;
    const mkLoop = (buf, filterType, f, q, gain) => {
      const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random());
      const fl = c.createBiquadFilter(); fl.type = filterType; fl.frequency.value = f; fl.Q.value = q;
      const g = c.createGain(); g.gain.value = gain; s.connect(fl); fl.connect(g); g.connect(this.ambBus);
      return { s, fl, g };
    };
    this.amb = { wind: mkLoop(this.pink, 'lowpass', 500, 0.7, 0.0), rain: mkLoop(this.white, 'highpass', 2500, 0.6, 0.0), water: mkLoop(this.pink, 'bandpass', 700, 0.5, 0.0) };
    const lfo = c.createOscillator(); lfo.frequency.value = 0.11; const lg = c.createGain(); lg.gain.value = 250; lfo.connect(lg); lg.connect(this.amb.wind.fl.frequency); lfo.start();
    this.padGain = c.createGain(); this.padGain.gain.value = 0; this.padGain.connect(this.musBus);
    this.musicTimer = 0;
  }
  // called every frame with environment info
  updateAmbient(dt, env) {
    if (!this.amb) return;
    const c = this.ctx, t = c.currentTime;
    const windy = 0.16 + (env.altitude > 40 ? 0.15 : 0) + (this.weather === 'storm' ? 0.35 : this.weather === 'rain' ? 0.12 : 0);
    this.amb.wind.g.gain.setTargetAtTime(this.underwater ? 0.02 : windy * (env.indoors ? 0.3 : 1), t, 0.6);
    const rain = (this.weather === 'rain' ? 0.22 : this.weather === 'storm' ? 0.38 : 0) * (env.indoors ? 0.35 : 1);
    this.amb.rain.g.gain.setTargetAtTime(this.underwater ? 0.02 : rain, t, 0.8);
    this.amb.water.g.gain.setTargetAtTime(this.underwater ? 0.35 : Math.max(0, 1 - env.waterDist / 40) * 0.22, t, 0.5);
    this.master.gain.setTargetAtTime(settings.get('master') * (this.underwater ? 0.5 : 1), t, 0.1);
    // birds by day, crickets by night
    this.nextBird -= dt; this.nextCricket -= dt;
    if (env.biome !== 'sea' && !env.indoors) {
      if (this.night < 0.3 && this.weather !== 'storm' && this.nextBird <= 0) {
        this.nextBird = 2 + Math.random() * 7;
        if (env.biome === 'forest' || env.biome === 'meadow' || Math.random() < 0.3) this.bird(env.biome === 'beach');
      }
      if (this.night > 0.6 && this.nextCricket <= 0) { this.nextCricket = 0.9 + Math.random() * 1.5; this.cricket(); }
    }
    // music: slow generative pad
    this.musicTimer -= dt;
    if (this.musicTimer <= 0 && settings.get('music') > 0.01) { this.musicTimer = 14 + Math.random() * 6; this.playChord(); }
  }
  bird(sea) {
    const base = sea ? 1800 : 2600 + Math.random() * 1400, n = 2 + Math.floor(Math.random() * 4), pan = Math.random() * 1.6 - 0.8;
    for (let i = 0; i < n; i++) this.voice({ osc: 'sine', f0: base * (1 + Math.random() * 0.3), f1: base * (0.7 + Math.random() * 0.5), dur: 0.09, gain: 0.05, t: i * 0.13, pan, dest: this.ambBus });
  }
  cricket() {
    const pan = Math.random() * 1.6 - 0.8;
    for (let i = 0; i < 4; i++) this.voice({ osc: 'square', f0: 4300, dur: 0.03, gain: 0.012, t: i * 0.06, pan, dest: this.ambBus });
  }
  playChord() {
    const c = this.ctx; if (!c) return;
    const night = this.night > 0.5;
    const day = [[220, 277.2, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [196, 246.9, 329.6]];
    const nit = [[196, 233.1, 293.7], [174.6, 207.7, 261.6], [164.8, 196, 246.9]];
    const set = night ? nit : day, ch = set[Math.floor(Math.random() * set.length)];
    const t0 = c.currentTime;
    for (const f of ch) for (const det of [-3, 3]) {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = det;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.07, t0 + 4); g.gain.linearRampToValueAtTime(0.0001, t0 + 13);
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 900;
      o.connect(fl); fl.connect(g); g.connect(this.musBus); o.start(t0); o.stop(t0 + 13.5);
    }
    // sparse pluck melody
    const scale = night ? [392, 466.2, 523.3, 587.3] : [440, 523.3, 587.3, 659.3, 784];
    for (let i = 0; i < 3; i++) this.voice({ osc: 'sine', f0: scale[Math.floor(Math.random() * scale.length)], dur: 1.6, gain: 0.05, t: 3 + i * 2.2 + Math.random(), dest: this.musBus, echo: 0.5, attack: 0.01 });
  }
  setWeather(w) { this.weather = w; }
  setNight(n) { this.night = n; }
  setUnderwater(b) { this.underwater = b; }
}

export const audio = new AudioEngine();
// resume on first gesture
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => audio.init(), { once: false, passive: true });
