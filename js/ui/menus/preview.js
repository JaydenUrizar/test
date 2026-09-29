// Small dedicated WebGL viewport that shows a buildCharacter() model on a ground disc.
// Slow auto-rotate, drag to rotate. Fully disposable.
import * as THREE from 'three';
import { buildCharacter } from '../../models.js';

export class CharacterPreview {
  constructor(host, opts = {}) {
    this.host = host;
    this.opts = { campfire: false, autoRotate: true, interactive: true, ...opts };
    this.yaw = this.opts.campfire ? 0.5 : 0.35; this.vel = 0; this.idle = this.opts.sway ? 3 : 0; this.drag = null;
    this.t = 0; this.dead = false; this.own = []; // things we dispose ourselves
    this.ok = true;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch (e) { this.ok = false; host.classList.add('nogl'); host.innerHTML = '<div class="mn-nogl">3D preview unavailable</div>'; return; }
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setClearColor(0x000000, 0);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.className = 'mn-preview-canvas';
    host.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.buildStage();
    this.setAppearance(opts.appearance || {});

    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host);
    this.resize();
    if (this.opts.interactive) {
      const el = r.domElement;
      this.onDown = (e) => { this.drag = { x: e.clientX, id: e.pointerId }; this.vel = 0; try { el.setPointerCapture(e.pointerId); } catch {} el.classList.add('grab'); };
      this.onMove = (e) => { if (!this.drag) return; const dx = e.clientX - this.drag.x; this.drag.x = e.clientX; this.yaw += dx * 0.011; this.vel = dx * 0.011 * 60; this.idle = 0; };
      this.onUp = () => { this.drag = null; el.classList.remove('grab'); };
      el.addEventListener('pointerdown', this.onDown); el.addEventListener('pointermove', this.onMove);
      el.addEventListener('pointerup', this.onUp); el.addEventListener('pointercancel', this.onUp);
    }
    this.last = performance.now();
    const loop = (now) => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      this.tick(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  track(o) { this.own.push(o); return o; }

  buildStage() {
    const S = this.scene, campfire = this.opts.campfire;
    S.add(this.track(new THREE.HemisphereLight(0xa9b8ff, 0x3a2a22, 0.95)));
    const key = new THREE.DirectionalLight(0xffdcb0, 2.4); key.position.set(2.4, 4.2, 3.2); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -2; key.shadow.camera.right = 2; key.shadow.camera.top = 3; key.shadow.camera.bottom = -1; key.shadow.bias = -0.0008;
    S.add(key); this.key = key;
    const rim = new THREE.DirectionalLight(0x6db6ff, 1.5); rim.position.set(-3, 2.5, -3); S.add(rim);
    // ground disc + glowing rim
    const gm = this.track(new THREE.MeshStandardMaterial({ color: 0x2a3a34, roughness: 1, flatShading: true }));
    const disc = new THREE.Mesh(this.track(new THREE.CylinderGeometry(1.25, 1.4, 0.16, 32)), gm); disc.position.y = -0.08; disc.receiveShadow = true; S.add(disc);
    const top = new THREE.Mesh(this.track(new THREE.CylinderGeometry(1.1, 1.14, 0.03, 32)), this.track(new THREE.MeshStandardMaterial({ color: 0x3f5a3a, roughness: 1, flatShading: true })));
    top.position.y = 0.005; top.receiveShadow = true; S.add(top);
    const ring = new THREE.Mesh(this.track(new THREE.TorusGeometry(1.3, 0.028, 6, 48)), this.track(new THREE.MeshBasicMaterial({ color: 0xff8a3c })));
    ring.rotation.x = Math.PI / 2; ring.position.y = -0.01; S.add(ring);
    // a few chunky rocks for character
    const rockM = this.track(new THREE.MeshStandardMaterial({ color: 0x59656b, roughness: 1, flatShading: true }));
    [[-0.95, 0.2, 0.18], [0.85, -0.7, 0.13], [-0.55, -0.85, 0.1]].forEach(([x, z, s]) => {
      const m = new THREE.Mesh(this.track(new THREE.IcosahedronGeometry(s, 0)), rockM); m.position.set(x, s * 0.5, z); m.rotation.set(x, z, 0); m.castShadow = true; S.add(m);
    });
    this.holder = new THREE.Group(); S.add(this.holder);
    if (campfire) {
      const fire = new THREE.Group(); fire.position.set(1.05, 0, 0.35); S.add(fire);
      const logM = this.track(new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 1, flatShading: true }));
      const lg = this.track(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6));
      for (let i = 0; i < 3; i++) { const pg = new THREE.Group(); pg.rotation.y = (i / 3) * Math.PI * 2 + 0.4; const l = new THREE.Mesh(lg, logM); l.rotation.z = Math.PI / 2 - 0.3; l.position.set(0.14, 0.1, 0); l.castShadow = true; pg.add(l); fire.add(pg); }
      const fm = this.track(new THREE.MeshBasicMaterial({ color: 0xff7a26 })), fm2 = this.track(new THREE.MeshBasicMaterial({ color: 0xffd25a }));
      this.flames = [[0, 0.32, 0.13, fm], [0.07, 0.22, 0.09, fm2], [-0.07, 0.2, 0.08, fm]].map(([x, h, r, m], i) => {
        const c = new THREE.Mesh(this.track(new THREE.ConeGeometry(r, h * 1.6, 5)), m); c.position.set(x, 0.1 + h * 0.8, i * 0.02); c.userData = { h, p: i * 2.1 }; fire.add(c); return c;
      });
      this.fireLight = new THREE.PointLight(0xff8a3c, 6, 5, 2); this.fireLight.position.set(1.0, 0.55, 0.5); S.add(this.fireLight);
      this.fire = fire;
    }
  }

  setAppearance(a) {
    if (!this.ok) return;
    this.appearance = a;
    if (this.char) { this.holder.remove(this.char); this.disposeTree(this.char); }
    const c = buildCharacter(a);
    c.rotation.y = Math.PI; // model faces -Z, camera looks from +Z
    c.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    if (this.opts.campfire) c.position.x = -0.25;
    this.holder.add(c); this.char = c;
  }

  disposeTree(root) {
    // Materials in models.js are shared/cached — only geometries are ours to free.
    root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }

  rotate(dir) { this.vel += dir * 5; this.idle = 0; }

  resize() {
    if (!this.ok) return;
    const w = Math.max(40, this.host.clientWidth), h = Math.max(40, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h;
    // fit a ~2.45 m tall / ~2.9 m wide subject
    const t = Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2));
    const wide = this.opts.campfire ? 3.7 : 3.3, tall = this.opts.campfire ? 2.5 : 3.05;
    const dist = Math.max(tall / (2 * t), (wide / this.cam.aspect) / (2 * t));
    this.cam.position.set(0, 1.25 + dist * 0.07, dist);
    this.cam.lookAt(this.opts.campfire ? 0.15 : 0, this.opts.campfire ? 0.98 : 0.9, 0);
    this.cam.updateProjectionMatrix();
    this.draw();
  }

  tick(dt) {
    this.t += dt;
    if (!this.drag) {
      this.yaw += this.vel * dt; this.vel *= Math.pow(0.02, dt);
      this.idle += dt;
      if (this.opts.autoRotate && this.idle > 2.2 && Math.abs(this.vel) < 0.3) this.yaw += dt * 0.42;
      else if (this.opts.sway && this.idle > 2.2) this.yaw += (0.55 + Math.sin(this.t * 0.5) * 0.45 - this.yaw) * Math.min(1, dt * 1.2);
    }
    this.holder.rotation.y = this.yaw;
    const p = this.char && this.char.userData.parts;
    if (p) {
      const b = Math.sin(this.t * 1.8);
      p.body.position.y = b * 0.008; p.armL.rotation.z = 0.05 + b * 0.03; p.armR.rotation.z = -0.05 - b * 0.03;
    }
    if (this.flames) {
      for (const f of this.flames) { const s = 1 + Math.sin(this.t * 9 + f.userData.p) * 0.18; f.scale.set(1 / s, s, 1 / s); f.rotation.y += dt * 2; }
      this.fireLight.intensity = 5.5 + Math.sin(this.t * 11) * 1 + Math.sin(this.t * 23) * 0.6;
    }
    this.draw();
  }

  draw() {
    if (this.dead || !this.ok || !this.host.isConnected || this.host.clientWidth === 0) return;
    this.renderer.render(this.scene, this.cam);
  }

  destroy() {
    if (this.dead) return;
    this.dead = true; cancelAnimationFrame(this.raf);
    if (!this.ok) return;
    this.ro.disconnect();
    const el = this.renderer.domElement;
    if (this.opts.interactive) { el.removeEventListener('pointerdown', this.onDown); el.removeEventListener('pointermove', this.onMove); el.removeEventListener('pointerup', this.onUp); el.removeEventListener('pointercancel', this.onUp); }
    if (this.char) this.disposeTree(this.char);
    this.scene.traverse((o) => { if (o.shadow && o.shadow.map) o.shadow.map.dispose(); });
    for (const o of this.own) { try { o.dispose && o.dispose(); } catch {} }
    this.renderer.dispose();
    try { this.renderer.forceContextLoss(); } catch {}
    el.remove();
    this.scene.clear();
  }
}
