// Particles, tracers, flashes and explosions.
import * as THREE from 'three';

const VS = `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; varying float vA; varying vec3 vC;
void main(){ vA = aAlpha; vC = aColor; vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv; gl_PointSize = aSize * (320.0 / max(1.0,-mv.z)); }`;
const FS = `varying float vA; varying vec3 vC; void main(){ vec2 c = gl_PointCoord-.5; float d = length(c); if (d>0.5) discard; float a = smoothstep(.5,.15,d) * vA; gl_FragColor = vec4(vC, a); }`;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const N = 900; this.N = N; this.n = 0;
    this.p = { x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N), vx: new Float32Array(N), vy: new Float32Array(N), vz: new Float32Array(N), life: new Float32Array(N), max: new Float32Array(N), size: new Float32Array(N), size1: new Float32Array(N), g: new Float32Array(N), drag: new Float32Array(N), r: new Float32Array(N), gr: new Float32Array(N), b: new Float32Array(N) };
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 3); this.sz = new Float32Array(N); this.al = new Float32Array(N); this.col = new Float32Array(N * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); geo.setAttribute('aSize', new THREE.BufferAttribute(this.sz, 1)); geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.al, 1)); geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false; this.points.renderOrder = 6;
    scene.add(this.points);
    this.tracers = [];
    this.tracerMat = new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1); this.tracerGeo.translate(0, 0, -0.5);
    this.flash = new THREE.PointLight('#ffb050', 0, 14, 2); scene.add(this.flash); this.flashT = 0;
    this.booms = []; this.rings = [];
    this.tmp = new THREE.Color();
  }
  emit(x, y, z, vx, vy, vz, life, size, size1, color, g = 9, drag = 1) {
    if (this.n >= this.N) return;
    const i = this.n++, p = this.p;
    p.x[i] = x; p.y[i] = y; p.z[i] = z; p.vx[i] = vx; p.vy[i] = vy; p.vz[i] = vz; p.life[i] = life; p.max[i] = life; p.size[i] = size; p.size1[i] = size1; p.g[i] = g; p.drag[i] = drag;
    this.tmp.set(color); p.r[i] = this.tmp.r; p.gr[i] = this.tmp.g; p.b[i] = this.tmp.b;
  }
  burst(x, y, z, count, o = {}) {
    const sp = o.speed ?? 4, life = o.life ?? 0.6, cols = Array.isArray(o.color) ? o.color : [o.color || '#ffffff'];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u);
      const s = sp * (0.4 + Math.random() * 0.8);
      this.emit(x, y, z, Math.cos(a) * r * s + (o.dx || 0), u * s * (o.up ?? 1) + (o.dy || 0) + (o.lift || 0), Math.sin(a) * r * s + (o.dz || 0), life * (0.6 + Math.random() * 0.6), (o.size ?? 0.12) * (0.7 + Math.random() * 0.6), o.size1 ?? 0.02, cols[(Math.random() * cols.length) | 0], o.g ?? 9, o.drag ?? 1.2);
    }
  }
  // themed impacts
  hit(kind, x, y, z, nx = 0, nz = 0) {
    switch (kind) {
      case 'wood': case 'tree': case 'plank': this.burst(x, y, z, 10, { color: ['#a8743f', '#c9955a', '#7a5028'], speed: 3.5, life: 0.7, size: 0.1 }); break;
      case 'stone': case 'rock': case 'static': this.burst(x, y, z, 12, { color: ['#c9ced3', '#8b9299', '#ffe9a8'], speed: 4.5, life: 0.5, size: 0.08 }); break;
      case 'metal': this.burst(x, y, z, 14, { color: ['#ffe9a8', '#ffd25a', '#ffffff'], speed: 6, life: 0.35, size: 0.06, g: 14 }); break;
      case 'terrain': case 'dirt': this.burst(x, y, z, 9, { color: ['#8a6b48', '#6f5538', '#9a7c55'], speed: 3, life: 0.6, size: 0.12 }); this.burst(x, y, z, 3, { color: '#b8a888', speed: 1, life: 1.0, size: 0.3, size1: 0.6, g: -0.5, up: 0.3 }); break;
      case 'flesh': this.burst(x, y, z, 12, { color: ['#c0202a', '#8a141c', '#e0343c'], speed: 3.2, life: 0.55, size: 0.09 }); break;
      case 'leaf': this.burst(x, y, z, 8, { color: ['#4c9a3f', '#7fbf5a', '#3f8a3f'], speed: 3, life: 0.8, size: 0.1, g: 3 }); break;
      default: this.burst(x, y, z, 6, { color: '#cccccc', speed: 2, life: 0.4, size: 0.08 });
    }
  }
  dust(x, y, z) { this.burst(x, y + 0.05, z, 4, { color: '#c9b98c', speed: 1, life: 0.6, size: 0.2, size1: 0.5, g: -0.3, up: 0.2 }); }
  smoke(x, y, z, color = '#555') { this.emit(x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3, 1.6 + Math.random(), 0.25, 0.9, color, -0.2, 0.6); }
  spark(x, y, z) { this.emit(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.8, 1.4 + Math.random() * 1.4, (Math.random() - 0.5) * 0.8, 0.9 + Math.random() * 0.6, 0.06, 0.01, '#ffb050', -1, 0.8); }
  muzzle(x, y, z, dx, dy, dz, big = 1) {
    this.flash.position.set(x + dx * 0.4, y + dy * 0.4, z + dz * 0.4); this.flash.intensity = 6 * big; this.flashT = 0.06;
    for (let i = 0; i < 6 * big; i++) this.emit(x + dx * 0.5, y + dy * 0.5, z + dz * 0.5, dx * 6 + (Math.random() - 0.5) * 2, dy * 6 + (Math.random() - 0.5) * 2, dz * 6 + (Math.random() - 0.5) * 2, 0.12, 0.25 * big, 0.02, i % 2 ? '#ffd25a' : '#ff9a3c', 0, 3);
    this.emit(x + dx * 0.3, y + dy * 0.3, z + dz * 0.3, dx, dy + 0.3, dz, 0.9, 0.12, 0.6, '#9a9a9a', -0.3, 0.8);
  }
  tracer(ox, oy, oz, ex, ey, ez, life = 0.09, color) {
    const m = new THREE.Mesh(this.tracerGeo, color ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }) : this.tracerMat.clone());
    const dx = ex - ox, dy = ey - oy, dz = ez - oz, L = Math.hypot(dx, dy, dz);
    m.position.set(ox, oy, oz); m.lookAt(ex, ey, ez); m.scale.set(1, 1, Math.min(L, 60)); 
    const start = Math.min(1, 1.5 / L);
    m.position.set(ox + dx * start, oy + dy * start, oz + dz * start); m.scale.z = L * (1 - start);
    this.scene.add(m); this.tracers.push({ m, t: 0, life, ox, oy, oz, ex, ey, ez, L });
  }
  explosion(x, y, z, r) {
    this.flash.position.set(x, y + 1, z); this.flash.intensity = 40; this.flash.distance = 40; this.flashT = 0.25;
    for (let i = 0; i < 60; i++) { const a = Math.random() * 6.28, u = Math.random() * 2 - 1, rr = Math.sqrt(1 - u * u), s = 3 + Math.random() * 8; this.emit(x, y, z, Math.cos(a) * rr * s, Math.abs(u) * s + 2, Math.sin(a) * rr * s, 0.6 + Math.random() * 0.6, 0.6 + Math.random() * 0.6, 0.1, ['#ff7a1c', '#ffd25a', '#ff4a1c'][i % 3], 4, 1.5); }
    for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28; this.emit(x, y + 0.5, z, Math.cos(a) * 3, 2 + Math.random() * 3, Math.sin(a) * 3, 2 + Math.random() * 1.5, 0.8, 2.4, '#4a4a4a', -0.5, 1.2); }
    for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28, s = 6 + Math.random() * 9; this.emit(x, y, z, Math.cos(a) * s, 4 + Math.random() * 8, Math.sin(a) * s, 1 + Math.random(), 0.16, 0.05, '#7a5a3a', 14, 0.6); }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.8, 24), new THREE.MeshBasicMaterial({ color: '#ffe0a0', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, y + 0.1, z); this.scene.add(ring); this.rings.push({ m: ring, t: 0 });
  }
  update(dt) {
    const p = this.p;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      p.life[i] -= dt;
      if (p.life[i] <= 0) continue;
      const k = Math.exp(-p.drag[i] * dt);
      p.vx[i] *= k; p.vz[i] *= k; p.vy[i] = p.vy[i] * k - p.g[i] * dt;
      p.x[i] += p.vx[i] * dt; p.y[i] += p.vy[i] * dt; p.z[i] += p.vz[i] * dt;
      if (w !== i) for (const key in p) p[key][w] = p[key][i];
      w++;
    }
    this.n = w;
    for (let i = 0; i < w; i++) {
      const t = 1 - p.life[i] / p.max[i];
      this.pos[i * 3] = p.x[i]; this.pos[i * 3 + 1] = p.y[i]; this.pos[i * 3 + 2] = p.z[i];
      this.sz[i] = p.size[i] + (p.size1[i] - p.size[i]) * t;
      this.al[i] = Math.min(1, (1 - t) * 1.6);
      this.col[i * 3] = p.r[i]; this.col[i * 3 + 1] = p.gr[i]; this.col[i * 3 + 2] = p.b[i];
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.aSize.needsUpdate = g.attributes.aAlpha.needsUpdate = g.attributes.aColor.needsUpdate = true;
    g.setDrawRange(0, w);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { this.flash.intensity = 0; this.flash.distance = 14; } else this.flash.intensity *= 0.82; }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]; t.t += dt;
      t.m.material.opacity = Math.max(0, 0.9 * (1 - t.t / t.life));
      if (t.t >= t.life) { this.scene.remove(t.m); t.m.material.dispose(); this.tracers.splice(i, 1); }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt; const s = 1 + r.t * 16; r.m.scale.set(s, s, s); r.m.material.opacity = Math.max(0, 0.8 - r.t * 1.8);
      if (r.t > 0.5) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
  }
}
