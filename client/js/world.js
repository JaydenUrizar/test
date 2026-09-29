// WorldView: renders terrain chunks, resource nodes, landmarks, water, sky, lights, weather.
import * as THREE from 'three';
import { WorldData, WORLD_HALF, WATER_LEVEL, BIOME, CELL } from '/shared/worldgen.js';
import { nodeGeometry, nodeMaterial, buildLandmarkMeshes } from './models.js';

const CH = 64;                       // chunk size in metres
const NCH = (WORLD_HALF * 2) / CH;   // chunks per side
const NODE_TYPES = ['tree_pine', 'tree_oak', 'tree_palm', 'tree_dead', 'cactus', 'rock', 'ore_iron', 'ore_sulfur', 'bush_berry', 'fiber_plant'];
const NODE_SCALE = { tree_pine: 1.0, tree_oak: 1.0, tree_palm: 1.0, tree_dead: 1.0, cactus: 1.0, rock: 1.0, ore_iron: 1.0, ore_sulfur: 1.0, bush_berry: 1.0, fiber_plant: 1.0 };

const C = (h) => new THREE.Color(h);
const COL = {
  sea: C('#3f6f7a'), sand: C('#e6d59a'), meadow: C('#86b85a'), meadow2: C('#6fa24a'), forest: C('#4f8a45'), forest2: C('#427a3c'), desert: C('#e2c47c'), desert2: C('#d4ae62'),
  snow: C('#eef3f6'), tundra: C('#dfe8ec'), rock: C('#8a9199'), rock2: C('#6f767e'), road: C('#b39d7a'), peak: C('#f4f7f9'), dirt: C('#8a6b48'),
};
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };

const SKY_KEYS = [
  // e = sun elevation sin; zenith, horizon, sun colour, sun intensity, hemi intensity, hemi sky, hemi ground
  { e: -1, z: '#03050f', h: '#0b1226', sun: '#7f98ff', si: 0.28, hi: 0.32, hs: '#3a4a8a', hg: '#151a26' },
  { e: -0.18, z: '#050a1e', h: '#141c38', sun: '#7f98ff', si: 0.3, hi: 0.34, hs: '#3a4a8a', hg: '#151a26' },
  { e: -0.04, z: '#2a2a5a', h: '#c8607a', sun: '#ff8a5a', si: 0.7, hi: 0.5, hs: '#7a6a9a', hg: '#3a3040' },
  { e: 0.08, z: '#4a6ab0', h: '#ffb37a', sun: '#ffb070', si: 1.7, hi: 0.72, hs: '#9ab0d8', hg: '#5a4a3a' },
  { e: 0.3, z: '#4a8ed8', h: '#bfe0f5', sun: '#fff0d6', si: 2.5, hi: 0.95, hs: '#b8d8f5', hg: '#6f6a55' },
  { e: 1, z: '#3f86d6', h: '#c4e4f8', sun: '#fff6e6', si: 2.8, hi: 1.05, hs: '#c0e0fa', hg: '#7a7660' },
];
function skyAt(e) {
  let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
  for (let i = 0; i < SKY_KEYS.length - 1; i++) if (e >= SKY_KEYS[i].e && e <= SKY_KEYS[i + 1].e) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
  const t = Math.min(1, Math.max(0, (e - a.e) / (b.e - a.e || 1)));
  const mix = (k) => new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), t);
  return { z: mix('z'), h: mix('h'), sun: mix('sun'), si: a.si + (b.si - a.si) * t, hi: a.hi + (b.hi - a.hi) * t, hs: mix('hs'), hg: mix('hg') };
}

const WEATHER = {
  clear: { cover: 0.18, fog: 1.0, dark: 0, rain: 0 },
  cloudy: { cover: 0.62, fog: 0.85, dark: 0.15, rain: 0 },
  rain: { cover: 0.88, fog: 0.62, dark: 0.35, rain: 1 },
  storm: { cover: 1.0, fog: 0.5, dark: 0.55, rain: 1.6 },
  fog: { cover: 0.55, fog: 0.16, dark: 0.15, rain: 0 },
};

const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const SKY_FS = `
precision highp float;
varying vec3 vDir;
uniform vec3 uSun; uniform vec3 uZenith; uniform vec3 uHorizon; uniform float uTime; uniform float uCover; uniform float uNight; uniform vec3 uCloudLit; uniform vec3 uCloudDark;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float t = clamp(d.y, 0., 1.);
  vec3 col = mix(uHorizon, uZenith, pow(t, .5));
  if (d.y < 0.) col = mix(uHorizon, uHorizon*0.7, clamp(-d.y*3.,0.,1.));
  float sd = max(dot(d, uSun), 0.);
  vec3 sunCol = vec3(1.0,0.93,0.75);
  col += sunCol * (pow(sd, 700.) * 6.0 + pow(sd, 40.) * 0.35 + pow(sd, 6.) * 0.12) * (1.0 - uCover*0.85);
  float md = max(dot(d, -uSun), 0.);
  col += vec3(0.85,0.9,1.0) * (smoothstep(0.9993, 0.9998, md)) * uNight * (1.0 - uCover*0.7);
  col += vec3(0.5,0.6,1.0) * pow(md, 30.) * 0.08 * uNight;
  if (uNight > 0.02 && d.y > 0.) {
    vec2 sp = d.xz / (d.y + 0.25) * 60.;
    float s = h21(floor(sp)); float tw = 0.6 + 0.4*sin(uTime*2.0 + s*40.);
    col += vec3(1.,.95,.85) * step(0.985, s) * tw * uNight * smoothstep(0.0,0.2,d.y) * (1.0-uCover);
  }
  if (d.y > -0.02) {
    vec2 uv = d.xz / (d.y + 0.22) * 1.4 + vec2(uTime*0.012, uTime*0.004);
    float n = fbm(uv);
    float a = smoothstep(1.02 - uCover*0.95, 1.12 - uCover*0.7, n + 0.08);
    a *= smoothstep(-0.02, 0.12, d.y);
    float lit = clamp(0.55 + 0.6*dot(normalize(vec3(d.x,0.3,d.z)), normalize(vec3(uSun.x,0.3,uSun.z))), 0., 1.);
    vec3 cc = mix(uCloudDark, uCloudLit, lit);
    col = mix(col, cc, a * (0.95));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const WATER_VS = `
varying vec3 vWorld; varying float vFogDepth;
uniform float uTime;
void main(){
  vec4 wp = modelMatrix * vec4(position,1.0);
  float w = sin(wp.x*0.35+uTime*1.2)*0.06 + sin(wp.z*0.28+uTime*0.9)*0.06 + sin((wp.x+wp.z)*0.6+uTime*1.7)*0.03;
  wp.y += w;
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp; vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const WATER_FS = `
precision highp float;
varying vec3 vWorld; varying float vFogDepth;
uniform float uTime; uniform vec3 uSun; uniform vec3 uColor; uniform vec3 uDeep; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform float uLight; uniform float uOpacity;
void main(){
  vec3 V = normalize(cameraPosition - vWorld);
  vec2 p = vWorld.xz;
  float nx = sin(p.x*0.9+uTime*1.3)*0.5 + sin(p.y*0.7-uTime*1.1 + p.x*0.3)*0.5 + sin((p.x+p.y)*2.1+uTime*2.4)*0.25;
  float nz = cos(p.y*0.8+uTime*1.0)*0.5 + cos(p.x*0.6+uTime*1.6 - p.y*0.4)*0.5 + cos((p.x-p.y)*1.9-uTime*2.1)*0.25;
  vec3 N = normalize(vec3(nx*0.09, 1.0, nz*0.09));
  float fres = pow(1.0 - max(dot(V,N),0.0), 3.0);
  vec3 R = reflect(-V, N);
  float spec = pow(max(dot(R, uSun),0.0), 90.0) * 1.6 * uLight;
  vec3 col = mix(uColor, uDeep, 0.25 + 0.25*sin(p.x*0.05)*sin(p.y*0.05));
  col = mix(col, uFogColor*0.85 + vec3(0.1,0.15,0.2), fres*0.55);
  col += vec3(1.0,0.95,0.8)*spec;
  col *= (0.35 + 0.65*uLight);
  float f = smoothstep(uFogNear, uFogFar, vFogDepth);
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, uOpacity * (1.0 - f*0.0));
}`;

export class WorldView {
  constructor(scene, seed, settings) {
    this.scene = scene;
    this.data = new WorldData(seed);
    this.settings = settings;
    this.chunks = new Map();
    this.queue = [];
    this.nodeIndex = new Map();     // node id -> { mesh, idx, node }
    this.depleted = new Set();
    this.landmarkGroups = new Map();
    this.fallers = [];
    this.weather = 'clear';
    this.wcur = { ...WEATHER.clear };
    this.hour = 9;
    this.viewDist = settings.viewDistance || 380;
    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.build();
  }

  build() {
    const scene = this.scene;
    scene.background = new THREE.Color('#9ec5e8');
    scene.fog = new THREE.Fog('#bcdcf2', 60, this.viewDist);
    // lights
    this.hemi = new THREE.HemisphereLight('#b8d8f5', '#6f6a55', 0.95);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff0d6', 2.5);
    this.sun.castShadow = this.settings.shadows !== 'off';
    const sz = this.settings.shadows === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sz, sz);
    const sc = this.sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 420;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.5;
    scene.add(this.sun); scene.add(this.sun.target);
    // sky dome
    this.skyU = {
      uSun: { value: new THREE.Vector3(0, 1, 0) }, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uTime: { value: 0 }, uCover: { value: 0.2 }, uNight: { value: 0 },
      uCloudLit: { value: new THREE.Color('#ffffff') }, uCloudDark: { value: new THREE.Color('#9aa5b5') },
    };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }));
    this.sky.frustumCulled = false; this.sky.renderOrder = -10;
    scene.add(this.sky);
    // water
    this.waterU = { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uColor: { value: new THREE.Color('#2f9bb0') }, uDeep: { value: new THREE.Color('#1a5f86') }, uFogColor: { value: new THREE.Color('#bcdcf2') }, uFogNear: { value: 60 }, uFogFar: { value: 400 }, uLight: { value: 1 }, uOpacity: { value: 0.78 } };
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600, 120, 120).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: this.waterU, vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: true, depthWrite: false }));
    this.water.position.y = WATER_LEVEL; this.water.renderOrder = 1; this.water.frustumCulled = false;
    scene.add(this.water);
    // ocean floor huge plane (beyond the island) so the sea has a bottom
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#2a6a80' }));
    floor.position.y = -30; floor.frustumCulled = false; scene.add(floor); this.oceanFloor = floor;
    this.buildWeatherFx();
    // landmark groups created lazily
  }

  buildWeatherFx() {
    const N = 2600;
    const seed = new Float32Array(N * 2 * 3), end = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = Math.random(), y = Math.random(), z = Math.random();
      for (let k = 0; k < 2; k++) { seed.set([x, y, z], (i * 2 + k) * 3); end[i * 2 + k] = k; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.rainU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAlpha: { value: 0 }, uWind: { value: 4 } };
    this.rain = new THREE.LineSegments(g, new THREE.ShaderMaterial({
      uniforms: this.rainU, transparent: true, depthWrite: false,
      vertexShader: `attribute vec3 aSeed; attribute float aEnd; uniform float uTime; uniform vec3 uCam; uniform float uWind; varying float vA;
        void main(){ vec3 box = vec3(50.,36.,50.); vec3 p = aSeed*box; p.y = mod(p.y - uTime*26., box.y);
          vec3 w = uCam + vec3(mod(p.x - uCam.x, box.x)-box.x*.5, p.y-6., mod(p.z - uCam.z, box.z)-box.z*.5);
          w += vec3(uWind*aEnd*0.05, 0.9*aEnd, 0.0); vA = 1.0 - aEnd*0.6;
          gl_Position = projectionMatrix*viewMatrix*vec4(w,1.); }`,
      fragmentShader: `uniform float uAlpha; varying float vA; void main(){ gl_FragColor = vec4(0.72,0.8,0.9, 0.42*uAlpha*vA); }`,
    }));
    this.rain.frustumCulled = false; this.rain.visible = false; this.rain.renderOrder = 5;
    this.scene.add(this.rain);
    // snow
    const M = 1800; const sp = new Float32Array(M * 3);
    for (let i = 0; i < M; i++) sp.set([Math.random(), Math.random(), Math.random()], i * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * 3), 3)); sg.setAttribute('aSeed', new THREE.BufferAttribute(sp, 3));
    this.snowU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAlpha: { value: 0 } };
    this.snow = new THREE.Points(sg, new THREE.ShaderMaterial({
      uniforms: this.snowU, transparent: true, depthWrite: false,
      vertexShader: `attribute vec3 aSeed; uniform float uTime; uniform vec3 uCam; void main(){ vec3 box = vec3(50.,30.,50.); vec3 p = aSeed*box; p.y = mod(p.y - uTime*2.4, box.y); p.x += sin(uTime*0.7 + aSeed.z*20.)*1.2;
          vec3 w = uCam + vec3(mod(p.x - uCam.x, box.x)-box.x*.5, p.y-6., mod(p.z - uCam.z, box.z)-box.z*.5);
          vec4 mv = viewMatrix*vec4(w,1.); gl_Position = projectionMatrix*mv; gl_PointSize = 2.2 + 90.0/(-mv.z + 1.0); }`,
      fragmentShader: `uniform float uAlpha; void main(){ vec2 c = gl_PointCoord-.5; float a = smoothstep(.5,.1,length(c)); gl_FragColor = vec4(1.,1.,1., a*0.85*uAlpha); }`,
    }));
    this.snow.frustumCulled = false; this.snow.visible = false; this.snow.renderOrder = 5;
    this.scene.add(this.snow);
  }

  // ---------------------------------------------------------------- terrain chunks
  chunkKey(cx, cz) { return cx * 64 + cz; }

  buildChunk(cx, cz, lod) {
    const D = this.data, T = D.terrain;
    const seg = lod === 0 ? 32 : 16, step = CH / seg;
    const ox = -WORLD_HALF + cx * CH, oz = -WORLD_HALF + cz * CH;
    const n = seg + 3; // margin of 1 on each side
    const H = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) H[j * n + i] = T.height(ox + (i - 1) * step, oz + (j - 1) * step);
    const vn = seg + 1;
    const pos = new Float32Array(vn * vn * 3), nor = new Float32Array(vn * vn * 3), col = new Float32Array(vn * vn * 3);
    const tmp = new THREE.Color();
    for (let j = 0; j < vn; j++) for (let i = 0; i < vn; i++) {
      const k = j * vn + i, x = ox + i * step, z = oz + j * step;
      const h = H[(j + 1) * n + (i + 1)];
      pos[k * 3] = i * step; pos[k * 3 + 1] = h; pos[k * 3 + 2] = j * step;
      const hl = H[(j + 1) * n + i], hr = H[(j + 1) * n + i + 2], hd = H[j * n + i + 1], hu = H[(j + 2) * n + i + 1];
      let nx = hl - hr, ny = 2 * step, nz = hd - hu; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
      this.terrainColor(x, z, h, ny, tmp);
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
    }
    const idx = new Uint16Array(seg * seg * 6);
    let q = 0;
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
      const a = j * vn + i, b = a + 1, c = a + vn, d = c + 1;
      if ((i + j) & 1) { idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
      else { idx[q++] = a; idx[q++] = c; idx[q++] = d; idx[q++] = a; idx[q++] = d; idx[q++] = b; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    const mesh = new THREE.Mesh(g, this.terrainMat);
    mesh.position.set(ox, 0, oz); mesh.receiveShadow = true;
    const grp = new THREE.Group(); grp.add(mesh);
    this.scene.add(grp);
    return { cx, cz, lod, grp, mesh, nodes: null, ox, oz };
  }

  terrainColor(x, z, h, ny, out) {
    const T = this.data.terrain;
    const bio = T.biome(x, z, h);
    const v = hash(Math.floor(x / 3), Math.floor(z / 3));
    const v2 = hash(x * 0.37, z * 0.41);
    switch (bio) {
      case BIOME.SEA: out.copy(COL.sea).lerp(COL.sand, Math.max(0, Math.min(1, (h + 6) / 6)) * 0.6); break;
      case BIOME.BEACH: out.copy(COL.sand).multiplyScalar(0.93 + v * 0.1); break;
      case BIOME.MEADOW: out.copy(COL.meadow).lerp(COL.meadow2, v).multiplyScalar(0.94 + v2 * 0.1); break;
      case BIOME.FOREST: out.copy(COL.forest).lerp(COL.forest2, v).multiplyScalar(0.92 + v2 * 0.1); break;
      case BIOME.DESERT: out.copy(COL.desert).lerp(COL.desert2, v).multiplyScalar(0.95 + v2 * 0.08); break;
      case BIOME.TUNDRA: out.copy(COL.tundra).multiplyScalar(0.94 + v2 * 0.08); break;
      default: out.copy(COL.rock).lerp(COL.rock2, v).multiplyScalar(0.92 + v2 * 0.12); if (h > 62) out.lerp(COL.peak, Math.min(1, (h - 62) / 12)); break;
    }
    if (ny < 0.8 && bio !== BIOME.SEA) out.lerp(COL.rock, Math.min(1, (0.8 - ny) * 3.2));
    if (bio !== BIOME.SEA) { const rd = T.roadDist(x, z); if (rd < 3.2) out.lerp(COL.road, Math.min(1, (3.2 - rd) / 1.6) * 0.92); }
    const lm = this.data.landmarkAt(x, z, 0);
    if (lm && bio !== BIOME.SEA) { const d = Math.hypot(x - lm.x, z - lm.z); if (d < lm.r) out.lerp(COL.dirt, 0.45 * (1 - d / lm.r) + 0.15); }
  }

  ensureNodes(ch) {
    if (ch.nodes) return;
    ch.nodes = [];
    const byType = {};
    for (let cx = 0; cx < CH / CELL; cx++) for (let cz = 0; cz < CH / CELL; cz++) {
      const wx = ch.ox + cx * CELL + 1, wz = ch.oz + cz * CELL + 1;
      for (const n of this.data.nodesAt(wx, wz)) (byType[n.type] ||= []).push(n);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const [type, list] of Object.entries(byType)) {
      const im = new THREE.InstancedMesh(nodeGeometry(type), nodeMaterial(), list.length);
      im.castShadow = type.startsWith('tree') || type === 'rock' || type.startsWith('ore');
      im.receiveShadow = false;
      list.forEach((n, i) => {
        const sc = n.s * NODE_SCALE[type];
        p.set(n.x, n.y - 0.05, n.z); q.setFromAxisAngle(up, n.r); const on = !this.depleted.has(n.id); s.set(on ? sc : 0, on ? sc : 0, on ? sc : 0);
        m.compose(p, q, s); im.setMatrixAt(i, m);
        this.nodeIndex.set(n.id, { mesh: im, idx: i, node: n });
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      ch.grp.add(im); ch.nodes.push(im);
    }
  }
  dropNodes(ch) {
    if (!ch.nodes) return;
    for (const im of ch.nodes) { ch.grp.remove(im); im.dispose(); }
    for (const [id, e] of this.nodeIndex) if (ch.nodes.includes(e.mesh)) this.nodeIndex.delete(id);
    ch.nodes = null;
  }

  setDepleted(id, on) {
    if (on) this.depleted.add(id); else this.depleted.delete(id);
    const e = this.nodeIndex.get(id);
    if (!e) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const n = e.node, sc = on ? 0 : n.s;
    p.set(n.x, n.y - 0.05, n.z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), n.r); s.set(sc, sc, sc);
    m.compose(p, q, s); e.mesh.setMatrixAt(e.idx, m); e.mesh.instanceMatrix.needsUpdate = true;
  }

  // temporary falling tree animation
  fellTree(id, yaw) {
    const n = this.data.nodes[id];
    if (!n || !n.type.startsWith('tree')) return;
    const mesh = new THREE.Mesh(nodeGeometry(n.type), nodeMaterial());
    mesh.position.set(n.x, n.y, n.z); mesh.scale.setScalar(n.s); mesh.rotation.y = n.r; mesh.castShadow = true;
    const g = new THREE.Group(); g.position.set(n.x, n.y, n.z); mesh.position.set(0, 0, 0); g.add(mesh);
    this.scene.add(g);
    this.fallers.push({ g, t: 0, dir: yaw + Math.PI });
  }

  update(dt, cam, hour, weatherType, focus) {
    this.hour = hour;
    // ---- chunk streaming
    const px = cam.position.x, pz = cam.position.z;
    const view = this.viewDist;
    const rc = Math.ceil(view / CH) + 1;
    const ccx = Math.floor((px + WORLD_HALF) / CH), ccz = Math.floor((pz + WORLD_HALF) / CH);
    const want = new Set();
    for (let dx = -rc; dx <= rc; dx++) for (let dz = -rc; dz <= rc; dz++) {
      const cx = ccx + dx, cz = ccz + dz;
      if (cx < 0 || cz < 0 || cx >= NCH || cz >= NCH) continue;
      const d = Math.hypot(dx, dz);
      if (d > rc + 0.4) continue;
      want.add(this.chunkKey(cx, cz));
      const ch = this.chunks.get(this.chunkKey(cx, cz));
      const lod = d < 3.2 ? 0 : 1;
      if (!ch) { if (!this.queue.some((e) => e.cx === cx && e.cz === cz)) this.queue.push({ cx, cz, lod, d }); }
      else if (ch.lod !== lod && !this.queue.some((e) => e.cx === cx && e.cz === cz && e.rebuild)) this.queue.push({ cx, cz, lod, d, rebuild: true });
    }
    this.queue.sort((a, b) => a.d - b.d);
    let budget = focus ? 2 : 4, t0 = performance.now();
    while (this.queue.length && budget > 0 && performance.now() - t0 < 9) {
      const job = this.queue.shift();
      const key = this.chunkKey(job.cx, job.cz);
      if (!want.has(key)) continue;
      const old = this.chunks.get(key);
      if (old && !job.rebuild) continue;
      if (old) this.disposeChunk(old);
      const ch = this.buildChunk(job.cx, job.cz, job.lod);
      this.chunks.set(key, ch); budget--;
    }
    for (const [key, ch] of this.chunks) {
      if (!want.has(key)) { this.disposeChunk(ch); this.chunks.delete(key); continue; }
      const d = Math.hypot(ch.ox + CH / 2 - px, ch.oz + CH / 2 - pz);
      if (d < Math.min(view, 300) + CH * 0.7) { if (!ch.nodes) this.ensureNodes(ch); for (const im of ch.nodes) im.castShadow = d < 110 && (im.geometry === nodeGeometry('rock') || true); }
      else if (ch.nodes) this.dropNodes(ch);
    }
    // landmarks
    for (const lm of this.data.landmarks) {
      const d = Math.hypot(lm.x - px, lm.z - pz);
      let g = this.landmarkGroups.get(lm.id);
      if (d < 520 && !g) { g = buildLandmarkMeshes(lm); this.scene.add(g); this.landmarkGroups.set(lm.id, g); }
      else if (g && d > 680) { this.scene.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); this.landmarkGroups.delete(lm.id); }
    }
    // ---- sky / light
    this.updateSky(dt, cam, hour, weatherType);
    // falling trees
    for (let i = this.fallers.length - 1; i >= 0; i--) {
      const f = this.fallers[i]; f.t += dt;
      const a = Math.min(1, f.t / 1.3), ang = a * a * 1.5;
      f.g.rotation.set(0, 0, 0); f.g.rotateY(f.dir); f.g.rotateX(-ang);
      if (f.t > 1.6) { this.scene.remove(f.g); this.fallers.splice(i, 1); }
    }
  }

  disposeChunk(ch) {
    this.dropNodes(ch);
    ch.mesh.geometry.dispose();
    this.scene.remove(ch.grp);
  }

  updateSky(dt, cam, hour, weatherType) {
    const wt = WEATHER[weatherType] || WEATHER.clear;
    for (const k of ['cover', 'fog', 'dark', 'rain']) this.wcur[k] += (wt[k] - this.wcur[k]) * Math.min(1, dt * 0.4);
    const w = this.wcur;
    const ang = ((hour - 6) / 24) * Math.PI * 2;
    const e = Math.sin(ang);
    const sunDir = new THREE.Vector3(Math.cos(ang) * 0.85, e, 0.5).normalize();
    const k = skyAt(e);
    const gray = new THREE.Color().setHSL(0.6, 0.05, Math.max(0.08, 0.5 * (0.3 + 0.7 * Math.max(0, e + 0.3))));
    const cover = w.cover;
    const zen = k.z.clone().lerp(gray, cover * 0.7), hor = k.h.clone().lerp(gray, cover * 0.6);
    this.skyU.uZenith.value.copy(zen); this.skyU.uHorizon.value.copy(hor);
    this.skyU.uSun.value.copy(sunDir);
    this.skyU.uCover.value = cover;
    const night = Math.max(0, Math.min(1, (0.12 - e) / 0.25));
    this.skyU.uNight.value = night;
    this.skyU.uTime.value += dt;
    this.skyU.uCloudLit.value.copy(new THREE.Color('#ffffff').lerp(k.sun, 0.35).multiplyScalar(0.35 + 0.65 * Math.min(1, e + 0.5)));
    this.skyU.uCloudDark.value.copy(new THREE.Color('#8f9bb0').lerp(hor, 0.4).multiplyScalar(0.25 + 0.75 * Math.min(1, Math.max(0.05, e + 0.5))));
    this.sky.position.copy(cam.position);
    // light
    const day = e > 0 ? 1 : 0;
    const dirLight = e > -0.05 ? sunDir : sunDir.clone().negate();
    const li = (e > -0.05 ? k.si : k.si) * (1 - w.dark * 0.7);
    this.sun.color.copy(k.sun);
    this.sun.intensity = li * Math.min(1, Math.max(0.15, (e + 0.1) * 4 + (e < -0.05 ? 0.4 : 0)));
    if (this.sun.intensity < 0.3) this.sun.intensity = 0.3;
    this.hemi.color.copy(k.hs).lerp(gray, cover * 0.4); this.hemi.groundColor.copy(k.hg);
    this.hemi.intensity = k.hi * (1 - w.dark * 0.35);
    // shadow follow (snap to texel)
    const foc = cam.position;
    const snap = 140 / this.sun.shadow.mapSize.x;
    const cx = Math.round(foc.x / snap) * snap, cy = Math.round(foc.y / snap) * snap, cz = Math.round(foc.z / snap) * snap;
    this.sun.target.position.set(cx, cy, cz);
    this.sun.position.set(cx + dirLight.x * 180, cy + dirLight.y * 180, cz + dirLight.z * 180);
    this.sun.target.updateMatrixWorld();
    // fog & background
    const fogFar = this.viewDist * (0.55 + 0.45 * w.fog) * (weatherType === 'fog' ? 1 : 1);
    const fogNear = Math.max(15, fogFar * (0.05 + 0.2 * w.fog));
    this.scene.fog.color.copy(hor).multiplyScalar(0.98);
    this.scene.fog.near = fogNear; this.scene.fog.far = fogFar;
    this.scene.background.copy(hor);
    // underwater tint handled by Game
    this.waterU.uTime.value += dt;
    this.waterU.uSun.value.copy(sunDir);
    this.waterU.uFogColor.value.copy(this.scene.fog.color); this.waterU.uFogNear.value = fogNear; this.waterU.uFogFar.value = fogFar;
    this.waterU.uLight.value = Math.max(0.12, Math.min(1, e * 1.6 + 0.35)) * (1 - w.dark * 0.4);
    this.water.position.x = Math.round(cam.position.x / 20) * 20; this.water.position.z = Math.round(cam.position.z / 20) * 20;
    this.oceanFloor.position.x = cam.position.x; this.oceanFloor.position.z = cam.position.z;
    // precipitation
    const bio = this.data.biome(cam.position.x, cam.position.z);
    const snowy = bio === BIOME.TUNDRA || (bio === BIOME.HIGHLAND && cam.position.y > 55);
    const intensity = w.rain;
    this.rain.visible = intensity > 0.05 && !snowy; this.snow.visible = intensity > 0.05 && snowy;
    this.rainU.uTime.value += dt; this.rainU.uCam.value.copy(cam.position); this.rainU.uAlpha.value = Math.min(1, intensity); this.rainU.uWind.value = weatherType === 'storm' ? 14 : 4;
    this.snowU.uTime.value += dt; this.snowU.uCam.value.copy(cam.position); this.snowU.uAlpha.value = Math.min(1, intensity);
    this.sunElevation = e; this.night = night;
  }

  setViewDistance(d) { this.viewDist = d; }
  setShadows(mode) { this.sun.castShadow = mode !== 'off'; const sz = mode === 'high' ? 2048 : 1024; if (this.sun.shadow.mapSize.x !== sz) { this.sun.shadow.mapSize.set(sz, sz); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; } }
}
