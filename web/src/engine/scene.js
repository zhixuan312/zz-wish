// The 3D scene: hall, ten places, the person's candle or lamp, flame and camera.
// Ported from the index.html prototype. It owns its render loop; the UI drives it only through the exported functions.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FocusBlur } from './FocusBlur.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------- Content ----------
// Ten places: hall lacquer, plaque text and what is offered there (candle or butter lamp).
const TEMPLES = [
  { id: 'lingyin', plaque: '大雄宝殿', lacquer: 0x6e1a12, lamp: 'candle' },
  { id: 'shaolin', plaque: '大雄宝殿', lacquer: 0x5e1a14, lamp: 'candle' },
  { id: 'yonghe', plaque: '雍和宫', lacquer: 0x7a1a10, lamp: 'candle' },
  { id: 'jokhang', plaque: null, lacquer: 0x4a1612, lamp: 'butter' },
  { id: 'puji', plaque: '大圆通殿', lacquer: 0x6a1c14, lamp: 'candle' },
  { id: 'zixiao', plaque: '紫霄殿', lacquer: 0x5a1812, lamp: 'candle' },
  { id: 'qufu', plaque: '大成殿', lacquer: 0x6a1810, lamp: 'candle' },
  { id: 'meizhou', plaque: '湄洲祖庙', lacquer: 0x7a1c12, lamp: 'candle' },
  { id: 'guandi', plaque: '崇宁殿', lacquer: 0x681a12, lamp: 'candle' },
  { id: 'hongluo', plaque: '大雄宝殿', lacquer: 0x701b12, lamp: 'candle' },
];

// ---------- Renderer ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let quality = innerWidth < 720 ? 'balanced' : 'high', powerSaver = false, phase = 'wish';
renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 1.75 : 1.25));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 900);
const pmrem = new THREE.PMREMGenerator(renderer);
const roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(new THREE.Scene(), camera);
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.9);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 p = (vUv - .5) * vec2(1., 1.12);
      float v = 1. - smoothstep(.3, .9, length(p)); c.rgb *= mix(.55, 1., v);
      float n = fract(sin(dot(vUv * 913.7 + uTime, vec2(12.9898, 78.233))) * 43758.5453) - .5;
      c.rgb += n * .02; gl_FragColor = c; }`,
});
composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(new OutputPass()); composer.addPass(grade);

// ---------- Helpers ----------
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const V2 = (x, y) => new THREE.Vector2(x, y);
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const seedOf = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const noise2 = (x, y) => {
  const ix=Math.floor(x), iy=Math.floor(y), fx=x-ix, fy=y-iy, u=fx*fx*(3-2*fx), v=fy*fy*(3-2*fy);
  const hash=n=>{const k=Math.sin(n)*43758.5453;return k-Math.floor(k);};
  const n=ix+iy*57, a=hash(n)*(1-u)+hash(n+1)*u, b=hash(n+57)*(1-u)+hash(n+58)*u;
  return a*(1-v)+b*v;
};
const wobble = (t, s) => Math.sin(t * 1.7 + s) * .5 + Math.sin(t * 3.1 + s * 2.3) * .3 + Math.sin(t * 7.3 + s * .7) * .2;
const ease = (k) => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const SERIF = '"Noto Serif SC", "Songti SC", "STSong", serif';

const softTex = canvasTex(128, 128, (g, w, h) => {
  const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.4, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});
const petalTex = canvasTex(32, 32, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(16, 16, 13, 7, .6, 0, Math.PI * 2); g.fill(); });
function stoneTex(seed, base = [24, 9, 15]) {
  const rnd = mulberry32(seed);
  const t = canvasTex(1024, 1024, (g, w, h) => {
    const n = 4, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const l = base[2] + rnd() * 6; g.fillStyle = `hsl(${base[0]} ${base[1]}% ${l}%)`; g.fillRect(i * s, j * s, s, s);
      for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${rnd() < .5 ? '255,240,220' : '0,0,0'},${rnd() * .06})`; g.fillRect(i * s + rnd() * s, j * s + rnd() * s, 2 + rnd() * 5, 2 + rnd() * 5); }
    }
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 5;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const pavingTex = stoneTex(7, [30, 6, 46]);
const grainTex = canvasTex(512, 512, (g, w, h) => {
  const rnd = mulberry32(11); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(60,20,10,${.04 + rnd() * .08})`; g.lineWidth = 1 + rnd() * 3; g.beginPath(); const y = rnd() * h; g.moveTo(0, y); g.bezierCurveTo(w * .3, y + rnd() * 20 - 10, w * .7, y + rnd() * 20 - 10, w, y + rnd() * 10 - 5); g.stroke(); }
});
grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
// Roof tiles: channels running down the slope.
const tileTex = canvasTex(128, 64, (g, w, h) => {
  for (let x = 0; x < w; x += 8) { const grd = g.createLinearGradient(x, 0, x + 8, 0); grd.addColorStop(0, '#5a5a5a'); grd.addColorStop(.45, '#f2f2f2'); grd.addColorStop(1, '#6a6a6a'); g.fillStyle = grd; g.fillRect(x, 0, 8, h); }
  g.fillStyle = 'rgba(0,0,0,.22)'; for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 1);
});
tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping; tileTex.repeat.set(2.4, 2);
// Small waves for water, as a tiling normal map.
const waterTex = (() => {
  const N = 256, rnd = mulberry32(77), waves = Array.from({ length: 9 }, () => [1 + Math.floor(rnd() * 9), Math.floor(rnd() * 13) - 6, rnd() * 6.28, .4 + rnd()]);
  const H = (x, y) => waves.reduce((s, [fx, fy, ph, a]) => s + a * Math.sin(6.2832 * (fx * x + fy * y) / N + ph) / (fx + Math.abs(fy)), 0);
  return canvasTex(N, N, (g) => {
    const img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * 3, dy = (H(x, y + 1) - H(x, y - 1)) * 3, l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
      img.data[i] = (-dx / l * .5 + .5) * 255; img.data[i + 1] = (-dy / l * .5 + .5) * 255; img.data[i + 2] = (1 / l * .5 + .5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, false);
})();
waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping; waterTex.repeat.set(60, 60);
const clothTex = canvasTex(1024, 360, (g, w, h) => {
  g.fillStyle = '#7d1410'; g.fillRect(0, 0, w, h);
  const rnd = mulberry32(5); for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(255,${120 + rnd() * 60},80,${rnd() * .05})`; g.fillRect(rnd() * w, rnd() * h, 1, 3); }
  g.strokeStyle = '#c99a45'; g.lineWidth = 10; g.strokeRect(24, 18, w - 48, h - 36); g.lineWidth = 3; g.strokeRect(44, 36, w - 88, h - 72);
  g.save(); g.translate(w / 2, h / 2); g.strokeStyle = '#d4a650'; g.lineWidth = 4;
  for (let i = 0; i < 8; i++) { g.rotate(Math.PI / 4); g.beginPath(); g.ellipse(0, -48, 18, 44, 0, 0, Math.PI * 2); g.stroke(); }
  g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(0, 0, 100, 0, Math.PI * 2); g.stroke(); g.restore();
});
const latticeTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const cols = 4; const cw = w / cols;
  for (let c = 0; c < cols; c++) {
    const x0 = c * cw + 16, x1 = (c + 1) * cw - 16;
    const grd = g.createLinearGradient(0, 40, 0, h * .7); grd.addColorStop(0, '#fff'); grd.addColorStop(1, '#556');
    g.fillStyle = grd; g.fillRect(x0, 40, x1 - x0, h * .62);
    g.strokeStyle = '#000'; g.lineWidth = 5;
    for (let y = 40; y < 40 + h * .62; y += 22) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
    for (let x = x0; x < x1; x += 22) { g.beginPath(); g.moveTo(x, 40); g.lineTo(x, 40 + h * .62); g.stroke(); }
  }
});
const windowsTex = canvasTex(64, 128, (g, w, h) => {
  const rnd = mulberry32(31); g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let y = 4; y < h; y += 8) for (let x = 3; x < w; x += 7) if (rnd() < .35) { g.fillStyle = `rgba(255,${180 + rnd() * 50},${110 + rnd() * 60},${.5 + rnd() * .5})`; g.fillRect(x, y, 4, 4); }
});
const shaftTex = canvasTex(64, 256, (g, w, h) => {
  const a = g.createLinearGradient(0, 0, w, 0); a.addColorStop(0, 'rgba(255,255,255,0)'); a.addColorStop(.5, 'rgba(255,255,255,1)'); a.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = a; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  const b = g.createLinearGradient(0, 0, 0, h); b.addColorStop(0, 'rgba(0,0,0,.9)'); b.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = b; g.fillRect(0, 0, w, h);
});
const bannerTex = canvasTex(128, 512, (g, w, h) => {
  g.fillStyle = '#8a6a1c'; g.fillRect(0, 0, w, h); g.fillStyle = '#7a1612'; g.fillRect(10, 10, w - 20, h - 20);
  g.strokeStyle = '#d2a54d'; g.lineWidth = 3;
  for (let y = 40; y < h - 40; y += 64) { g.beginPath(); g.arc(w / 2, y + 20, 18, 0, Math.PI * 2); g.stroke(); }
});
function plaqueTex(text) {
  return canvasTex(1024, 320, (g, w, h) => {
    g.fillStyle = '#140c08'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b8893a'; g.lineWidth = 14; g.strokeRect(14, 14, w - 28, h - 28); g.lineWidth = 3; g.strokeRect(40, 40, w - 80, h - 80);
    if (!text) return;
    g.fillStyle = '#d9ae58'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const size = Math.min(170, (w - 160) / text.length); g.font = `700 ${size}px ${SERIF}`;
    const gap = (w - 140) / text.length;
    [...text].forEach((ch, i) => g.fillText(ch, 70 + gap * (i + .5), h / 2 + 6));
  });
}

// Wax with a warm glow near the burning top, standing in for light scattered inside the wax.
function waxMaterial(color, o = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: o.roughness ?? .52, clearcoat: o.clearcoat ?? .12, clearcoatRoughness: .35,
    sheen: .5, sheenColor: new THREE.Color(0xffc3a0), envMapIntensity: .08 });
  m.userData.u = { uTop: { value: 1 }, uGlow: { value: 0 }, uFall: { value: o.fall ?? 110 }, uGlowColor: { value: new THREE.Color(o.glow ?? 0xffa344) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.u);
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uTop; uniform float uGlow; uniform float uFall; uniform vec3 uGlowColor; varying vec3 vWPos;\n' +
      sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlowColor * uGlow * exp(-max(uTop - vWPos.y, 0.0) * uFall);');
  };
  return m;
}

// Flame: a camera-facing quad that stays upright, drawn by a shader (blue base, hot core, orange skirt).
const flameVS = `
uniform float uScale; uniform float uSeedU;
#ifdef USE_INSTANCING
attribute float aSeed; attribute float aScale;
#endif
varying vec2 vUv; varying float vSeed;
void main(){
  vUv = uv; float sc = uScale; float sd = uSeedU; vec4 c = modelMatrix * vec4(0., 0., 0., 1.);
  #ifdef USE_INSTANCING
  sc = aScale; sd = aSeed; c = modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.);
  #endif
  vSeed = sd;
  vec3 r = normalize(vec3(viewMatrix[0][0], 0., viewMatrix[2][0]));
  vec3 wp = c.xyz + r * position.x * sc * .5 + vec3(0., 1., 0.) * (position.y + .5) * sc;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}`;
const flameFS = `
uniform float uTime; uniform float uPower; uniform float uWind;
varying vec2 vUv; varying float vSeed;
float h1(float n){ return fract(sin(n) * 43758.5453); }
float vn(vec2 x){ vec2 p = floor(x), f = fract(x); f = f * f * (3. - 2. * f); float n = p.x + p.y * 57.;
  return mix(mix(h1(n), h1(n + 1.), f.x), mix(h1(n + 57.), h1(n + 58.), f.x), f.y); }
void main(){
  float t = uTime + vSeed * 17.;
  float y = vUv.y; float x = (vUv.x - .5) * 2.;
  float sway = (vn(vec2(t * 1.1, vSeed * 9.)) - .5) * .32 + (vn(vec2(t * 5.3, vSeed * 3.)) - .5) * .1;
  x -= (sway + uWind) * pow(y, 1.6);
  x += (vn(vec2(y * 7. - t * 3.1, t * .43)) - .5) * .07 * y;
  float stretch = (1. + (vn(vec2(t * 3.7, vSeed * 5.)) - .5) * .16) * mix(.35, 1., uPower);
  float py = (y - .26) / stretch; float up = max(py, 0.);
  float wid = .4 * max(1. - up * 1.08, .02) * (1. + (vn(vec2(t * 2.3 - y * 4., vSeed)) - .5) * .15);
  vec2 q = vec2(x / wid, py > 0. ? py / .66 : py / .2);
  float d = length(q);
  float a = (1. - smoothstep(.62, 1., d)) * smoothstep(0., .09, y);
  vec2 qc = vec2(x / (wid * .5), py > 0. ? (py + .02) / .4 : py / .12);
  float core = 1. - smoothstep(.15, 1., length(qc));
  float blue = (1. - smoothstep(-.2, .04, py)) * smoothstep(.1, .8, abs(x) / .4 + .25);
  vec3 col = mix(vec3(1., .36, .06), vec3(1., .64, .24), 1. - smoothstep(.4, 1., d));
  col = mix(col, vec3(1., .92, .76), core);
  col = mix(col, vec3(.04, .12, .42), clamp(blue, 0., 1.) * .75);
  float alpha = a * uPower;
  gl_FragColor = vec4(col * (1.15 + core * 1.1) * (.85 + .15 * vn(vec2(t * 3.7, vSeed * 5.))), alpha);
}`;
function flameMaterial(instanced) {
  return new THREE.ShaderMaterial({ vertexShader: flameVS, fragmentShader: flameFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uWind: { value: 0 }, uPower: { value: instanced ? .52 : 0 }, uScale: { value: .06 }, uSeedU: { value: .37 } } });
}
const flameMats = [];

// Smoke: recycled soft sprites. `k` scales speed for outdoor sizes.
class Smoke {
  constructor(scene, n, color, maxOp, k = 1) {
    this.parts = []; this.maxOp = maxOp; this.k = k; this.rnd = mulberry32(n * 7);
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color, transparent: true, depthWrite: false, opacity: 0, fog: true }));
      s.visible = false; scene.add(s); this.parts.push({ s, age: 0, life: 0, v: V3(0, 0, 0), seed: this.rnd() * 10 });
    }
  }
  puff(pos, spread = .002, size = .02) {
    const p = this.parts.find((q) => !q.s.visible); if (!p) return;
    const k = this.k;
    p.s.visible = true; p.age = 0; p.life = 2.6 + this.rnd() * 2; p.size = size;
    p.s.position.copy(pos).add(V3((this.rnd() - .5) * spread, 0, (this.rnd() - .5) * spread));
    p.v.set((this.rnd() - .5) * .01 * k, (.05 + this.rnd() * .04) * k, (this.rnd() - .5) * .01 * k);
  }
  update(dt, time) {
    for (const p of this.parts) {
      if (!p.s.visible) continue;
      p.age += dt; if (p.age > p.life) { p.s.visible = false; continue; }
      const k = p.age / p.life;
      p.v.x += Math.sin(time * 1.3 + p.seed + p.age * 2.1) * .006 * dt * this.k; p.v.z += Math.cos(time * .9 + p.seed) * .004 * dt * this.k;
      p.s.position.addScaledVector(p.v, dt);
      const sc = p.size * (1 + k * 5); p.s.scale.set(sc, sc * 1.6, 1);
      p.s.material.opacity = this.maxOp * Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k);
    }
  }
}

// ---------- The hall ----------
const hall = new THREE.Scene();
hall.background = new THREE.Color(0x090605);
hall.fog = new THREE.FogExp2(0x090605, .17);
hall.environment = roomEnv;
// The offering is the focal plane. Blur the distant hall before compositing it,
// keeping the flame's soft procedural edge and the person's own outline intact.
const focusBlur = new FocusBlur();
class OfferingPass extends RenderPass {
  render(renderer, write, read, delta, mask) {
    const background = hall.background; hall.background = null; camera.layers.set(1);
    super.render(renderer, write, read, delta, mask);
    camera.layers.set(0); hall.background = background;
  }
}
const offeringPass = new OfferingPass(hall, camera);
offeringPass.clear = false; offeringPass.clearDepth = true;
composer.insertPass(focusBlur, 1); composer.insertPass(offeringPass, 2);
const ALTAR_Y = .82;
const lacquer = new THREE.MeshPhysicalMaterial({ color: 0x241811, map: grainTex, roughness: .68, clearcoat: .12, clearcoatRoughness: .6, envMapIntensity: .08 });
const brass = new THREE.MeshStandardMaterial({ color: 0xb08a4e, metalness: 1, roughness: .32, envMapIntensity: .35 });
const darkIron = new THREE.MeshStandardMaterial({ color: 0x1c1714, metalness: .6, roughness: .6, envMapIntensity: .2 });
{
  const floorTex = stoneTex(3); floorTex.repeat.set(5, 5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ map: floorTex, roughness: .7, envMapIntensity: .2 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; hall.add(floor);
  const altar = new THREE.Mesh(new THREE.BoxGeometry(1.9, ALTAR_Y, .75), lacquer); altar.position.set(0, ALTAR_Y / 2, -.12); altar.receiveShadow = true; altar.castShadow = true; hall.add(altar);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.7, .6), new THREE.MeshStandardMaterial({ map: clothTex, roughness: .55, envMapIntensity: .2 }));
  cloth.position.set(0, ALTAR_Y - .32, .256); cloth.receiveShadow = true; hall.add(cloth);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(1.92, .018, .02), brass); trim.position.set(0, ALTAR_Y - .01, .255); hall.add(trim);
  const hemi = new THREE.HemisphereLight(0x3a2c22, 0x0a0705, .55); hall.add(hemi);
  const door = new THREE.DirectionalLight(0x7f95b0, .22); door.position.set(-2, 3, -6); hall.add(door);
  for (const x of [-2.1, 2.1]) for (const z of [-.7, -3.9]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.19, .2, 6, 32), lacquer); p.position.set(x, 3, z); p.castShadow = true; hall.add(p);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.3, .32, .2, 24), new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: .8 })); b.position.set(x, .1, z); hall.add(b);
  }
  for (const z of [-.7, -3.9]) { const beam = new THREE.Mesh(new THREE.BoxGeometry(4.8, .36, .3), lacquer); beam.position.set(0, 4.3, z); hall.add(beam); }
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), new THREE.MeshStandardMaterial({ color: 0x1a1210, emissive: 0x8ea6c4, emissiveMap: latticeTex, emissiveIntensity: .5, roughness: .9 }));
  wall.position.set(0, 3, -6); hall.add(wall);
  const statueGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0xffa64d, transparent: true, opacity: .08, depthWrite: false, blending: THREE.AdditiveBlending }));
  statueGlow.position.set(0, 2.4, -4.7); statueGlow.scale.set(3.6, 4.6, 1); hall.add(statueGlow);
  for (const [x, rot] of [[-1.05, .32], [.9, .28]]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(.9, 6.5), new THREE.MeshBasicMaterial({ map: shaftTex, color: 0xffe7c4, transparent: true, opacity: .055, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    s.position.set(x, 3.2, -2.8); s.rotation.set(0, 0, rot); hall.add(s);
  }
}
const plaqueMat = new THREE.MeshStandardMaterial({ roughness: .45, metalness: .2, emissive: 0xffffff, emissiveIntensity: .1 });
const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .34), plaqueMat); plaque.position.set(0, 2.7, -3.2); hall.add(plaque);
const banners = [-1.3, 1.3].map((x) => {
  const b = new THREE.Mesh(new THREE.PlaneGeometry(.42, 2.1), new THREE.MeshStandardMaterial({ map: bannerTex, roughness: .8, side: THREE.DoubleSide }));
  b.geometry.translate(0, -1.05, 0); b.position.set(x, 3.7, -2.1); hall.add(b); return b;
});
const dust = (() => {
  const n = 320, rnd = mulberry32(9), pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = (rnd() - .5) * 3.4; pos[i * 3 + 1] = .4 + rnd() * 3.4; pos[i * 3 + 2] = -3.2 + rnd() * 4; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ map: softTex, color: 0xffd7a0, size: .012, transparent: true, opacity: .45, depthWrite: false, blending: THREE.AdditiveBlending }));
  hall.add(p); return p;
})();

const incenseSmoke = new Smoke(hall, 60, 0xb8b0a8, .1);
const incenseTips = [];
{
  const burner = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [.07, 0], [.075, .01], [.06, .02], [.11, .05], [.115, .11], [.12, .118], [.105, .118], [.1, .1], [0, .1]].map(([x, y]) => V2(x, y)), 48),
    new THREE.MeshStandardMaterial({ color: 0x5a4630, metalness: 1, roughness: .45, envMapIntensity: .3 }));
  burner.position.set(-.56, ALTAR_Y, -.3); burner.castShadow = true; burner.receiveShadow = true; hall.add(burner);
  const ash = new THREE.Mesh(new THREE.CircleGeometry(.1, 32), new THREE.MeshStandardMaterial({ color: 0x8a847c, roughness: 1 })); ash.rotation.x = -Math.PI / 2; ash.position.set(-.56, ALTAR_Y + .104, -.3); hall.add(ash);
  for (const [dx, lean] of [[-.03, -.06], [0, 0], [.03, .07]]) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(.0018, .0018, .26, 6), new THREE.MeshStandardMaterial({ color: 0x8b2a1c, roughness: .8 }));
    st.position.set(-.56 + dx, ALTAR_Y + .23, -.3); st.rotation.z = lean; hall.add(st);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(.0032, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.1, .3) }));
    tip.position.set(-.56 + dx - Math.sin(lean) * .13, ALTAR_Y + .23 + Math.cos(lean) * .13, -.3); hall.add(tip); incenseTips.push(tip.position);
  }
}

// Flame parts shared by every lit thing.
function flameParts(g) {
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(.0008, .001, .008, 8), new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: 1 })); wick.geometry.translate(.0007, .004, 0); g.add(wick);
  const ember = new THREE.Mesh(new THREE.SphereGeometry(.00045, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, .7, .15) })); g.add(ember);
  const fm = flameMaterial(false); fm.uniforms.uSeedU.value = Math.random() * 10; flameMats.push(fm);
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fm); flame.frustumCulled = false; g.add(flame);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0xff8a3a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.set(.2, .26, 1); g.add(halo);
  const light = new THREE.PointLight(0xff9a48, 0, 0, 2); g.add(light);
  return { wick, ember, fm, flame, halo, light,
    place(x, y) { wick.position.set(x, y - .004, 0); ember.position.set(x, y + .004, 0); flame.position.set(x, y + .002, 0); halo.position.set(x, y + .03, 0); light.position.set(x, y + .019, 0); },
    tick(time, power, lightMax, wax, topY) {
      const seed = fm.uniforms.uSeedU.value;
      const f = .85 + .15 * noise2((time + seed * 17) * 3.7, seed * 5);
      fm.uniforms.uTime.value = time; fm.uniforms.uPower.value = power; fm.uniforms.uScale.value = .038 * (.85 + .15 * f) * Math.max(.15, Math.sqrt(power));
      light.intensity = lightMax * power * f; halo.material.opacity = .025 * power * f; ember.visible = power > .02;
      for (const m of wax) { m.userData.u.uTop.value = topY; m.userData.u.uGlow.value = .22 * power * f; }
    } };
}

// Two candles left by other people, already burning.
const others = [];
for (const [x, z, lv] of [[.5, -.32, .55], [-.3, -.42, .3]]) {
  const g = new THREE.Group(); g.position.set(x, ALTAR_Y, z); hall.add(g);
  const holder = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [.06, 0], [.064, .006], [.028, .014], [.02, .032], [.026, .046], [.074, .05], [.078, .058], [.07, .058], [0, .056]].map(([a, b]) => V2(a * .93, b)), 48), brass);
  holder.castShadow = true; g.add(holder);
  const wax = waxMaterial(0x8c1a12), h = .2 * (.1 + .9 * lv);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.028, .0283, h, 48), wax); body.position.y = .056 + h / 2; body.castShadow = true; g.add(body);
  const f = flameParts(g); f.place(0, .056 + h); f.light.castShadow = false;
  others.push({ g, f, wax: [wax] });
}

// ---------- The person's offering ----------
const PLATE_H = .046; // a short brass candlestick (.04) and its dish (.006)
// Resample a [height, radius] profile into rows every 2 mm.
function resample(prof, step = .002) {
  const top = prof[prof.length - 1][0], rows = [];
  const at = (y) => { let i = 1; while (i < prof.length - 1 && prof[i][0] < y) i++; const [y0, r0] = prof[i - 1], [y1, r1] = prof[i]; const k = Math.min(1, Math.max(0, (y - y0) / (y1 - y0 || 1))); return { y, cx: 0, r: r0 + (r1 - r0) * k }; };
  for (let y = 0; y < top - 1e-6; y += step) rows.push(at(y));
  rows.push(at(top)); return rows;
}
// Wax volume from the base up; the level animation reads it so the wax drops in step with real time.
function burnOf(rows) {
  const cum = [0]; let v = 0;
  for (let i = 1; i < rows.length; i++) { const a = rows[i - 1], b = rows[i]; v += Math.PI * (b.y - a.y) * (a.r * a.r + a.r * b.r + b.r * b.r) / 3; cum.push(v); }
  return { cum, total: v };
}
const CUP = { y0: .072, y1: .114 };
const cupR = (y) => Math.min(.028 + .022 * (y - .072) / .032, .052);
function butterOf() {
  const n = 40, ys = [CUP.y0], cum = [0], dy = (CUP.y1 - CUP.y0) / n; let v = 0;
  for (let i = 1; i <= n; i++) { const y = CUP.y0 + dy * i, r = cupR(y - dy / 2); v += Math.PI * r * r * dy; ys.push(y); cum.push(v); }
  return { ys, cum, vol: v };
}
const ringAt = (R, y) => { let i = 1; while (i < R.length - 1 && R[i].y < y) i++; const a = R[i - 1], b = R[i], k = Math.min(1, Math.max(0, (y - a.y) / (b.y - a.y || 1))); return { y, cx: a.cx + (b.cx - a.cx) * k, r: a.r + (b.r - a.r) * k }; };
// A candle body from rows, cut flat at `cut` with a soft rim and a shallow dip where the pool sits.
function candleGeo(rows, cut, seg = 56) {
  const R = rows.filter((q) => q.y < cut - 1e-6); R.push(ringAt(rows, cut));
  if (R.length < 2) R.unshift({ ...R[0], y: 0 });
  const top = R[R.length - 1], pos = [], uv = [], idx = [];
  const ring = (cx, r, y) => { const s = pos.length / 3; for (let j = 0; j <= seg; j++) { const a = j / seg * Math.PI * 2; const grain = 1 + .006 * Math.sin(a * 7 + y * 180) + .003 * Math.sin(a * 19 - y * 310); pos.push(cx + Math.cos(a) * r * grain, y, Math.sin(a) * r * grain); uv.push(j / seg, y * 8); } return s; };
  const strip = (s0, s1) => { for (let j = 0; j < seg; j++) idx.push(s0 + j, s1 + j, s0 + j + 1, s0 + j + 1, s1 + j, s1 + j + 1); };
  let prev = ring(R[0].cx, R[0].r, R[0].y);
  for (let i = 1; i < R.length - 1; i++) { const s = ring(R[i].cx, R[i].r, R[i].y); strip(prev, s); prev = s; }
  const rim = Math.min(.0015, top.r * .2);
  for (const [rr, dy] of [[1, -rim], [.96, 0], [.82, -.0012], [.4, -.0026], [.001, -.003]]) { const s = ring(top.cx, top.r * rr, top.y + dy); strip(prev, s); prev = s; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals(); return g;
}

const mine = (() => {
  const g = new THREE.Group(); g.position.set(0, ALTAR_Y, .06); hall.add(g);
  const satin = new THREE.MeshStandardMaterial({ color: 0x9a7642, metalness: .85, roughness: .52, envMapIntensity: .08 });
  const plate = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [.96, 0], [1, .0035], [1.06, .011], [1.03, .012], [.95, .0062], [0, .006]].map(([x, y]) => V2(x, y)), 64), satin);
  plate.position.y = .04; plate.castShadow = plate.receiveShadow = true; g.add(plate);
  const stand = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [.042, 0], [.044, .004], [.03, .008], [.014, .014], [.01, .03], [.016, .036], [.012, .0405], [0, .0405]].map(([x, y]) => V2(x, y)), 48), satin);
  stand.castShadow = stand.receiveShadow = true; g.add(stand);
  const wax = waxMaterial(0x8f1b12);
  const body = new THREE.Mesh(new THREE.BufferGeometry(), wax); body.position.y = PLATE_H; body.castShadow = true; body.receiveShadow = true; g.add(body);
  const poolMat = waxMaterial(0xa02a1a, { roughness: .08, clearcoat: 1, fall: 30 });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), poolMat); g.add(pool);
  const cupG = new THREE.Group(); g.add(cupG);
  const cup = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [.045, 0], [.046, .007], [.014, .02], [.011, .058], [.03, .068], [.054, .1], [.058, .116], [.054, .117], [.05, .104], [.028, .074], [0, .07]].map(([x, y]) => V2(x, y)), 64),
    new THREE.MeshStandardMaterial({ color: 0xc9a14f, metalness: .85, roughness: .42, envMapIntensity: .12 }));
  cup.castShadow = cup.receiveShadow = true; cupG.add(cup);
  const butterTexture = canvasTex(128, 128, (ctx,w,h) => {
    const rnd = mulberry32(42); ctx.fillStyle = '#b0a58c'; ctx.fillRect(0,0,w,h);
    for(let i=0;i<2400;i++){const v=130+rnd()*100;ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(rnd()*w,rnd()*h,1+rnd()*2,1+rnd()*2);}
  }, false);
  const fat = waxMaterial(0xe9cf8a, { roughness: .3, clearcoat: .6, glow: 0xff8a2a, fall: 25 });
  fat.bumpMap = butterTexture; fat.bumpScale = .0003;
  const surface = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), fat); cupG.add(surface);
  const liquid = new THREE.Mesh(new THREE.CircleGeometry(.016, 48).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({color:0xb58c37, roughness:.1, clearcoat:1, metalness:0, envMapIntensity:.15, transparent:true, opacity:.82})); cupG.add(liquid);
  const drips = Array.from({ length: 7 }, (_, i) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 12), wax);
    mesh.visible = false; g.add(mesh); return { mesh, angle: i * 2.399, start: .015 + i * .025 };
  });
  const f = flameParts(g);
  f.light.castShadow = true; f.light.shadow.mapSize.set(1024, 1024); f.light.shadow.bias = -.002; f.light.shadow.radius = 4; f.light.shadow.camera.near = .01;
  const api = { g, power: 0, lightMax: .10, offer: null, top: V3(0, 0, 0), lastCut: -1,
    setOffer(o) {
      this.offer = o; this.lastCut = -1; const isButter = o.kind === 'butter';
      drips.forEach(({mesh}) => { mesh.visible = false; });
      cupG.visible = isButter; plate.visible = stand.visible = body.visible = pool.visible = !isButter;
      if (isButter) cupG.scale.setScalar(o.cup);
      else {
        wax.color.setHex(o.color); poolMat.color.setHex(o.color).lerp(new THREE.Color(0xffd0a0), .18);
        stand.scale.set(Math.min(1, Math.max(.4, o.rows[0].r / .025)), 1, Math.min(1, Math.max(.4, o.rows[0].r / .025)));
        plate.scale.set(Math.max(...o.rows.slice(0, 4).map((q) => q.r)) + .014, 1, Math.max(...o.rows.slice(0, 4).map((q) => q.r)) + .014);
      }
      this.setLevel(1);
    },
    setLevel(L) {
      const o = this.offer; if (!o) return;
      const b = o.burn, find = (arr, tgt) => { let i = 1; while (i < arr.length - 1 && arr[i] < tgt) i++; return [i, Math.min(1, Math.max(0, (tgt - arr[i - 1]) / (arr[i] - arr[i - 1] || 1)))]; };
      if (o.kind === 'butter') {
        const [i, k] = find(b.cum, L * o.fill * b.vol), y = b.ys[i - 1] + (b.ys[i] - b.ys[i - 1]) * k;
        surface.position.y = y; surface.scale.setScalar(cupR(y)); liquid.position.y = y + .00015; liquid.scale.setScalar(Math.min(1, cupR(y) / .018)); this.top.set(0, y * o.cup, 0);
      } else {
        const R = o.rows, [i, k] = find(b.cum, L * b.total);
        const cut = Math.max(R[i - 1].y + (R[i].y - R[i - 1].y) * k, .002);
        if (Math.abs(cut - this.lastCut) > .0003) {
          body.geometry.dispose(); body.geometry = candleGeo(R, cut); this.lastCut = cut;
          const q = ringAt(R, cut); pool.position.set(q.cx, PLATE_H + cut - .0011, 0); pool.scale.setScalar(Math.max(q.r * .8, .0005)); this.top.set(q.cx, PLATE_H + cut, 0);
        }
      }
      if (o.kind !== 'butter') {
        for (const {mesh, angle, start} of drips) {
          const grown = Math.min(1, Math.max(0, (1 - L - start) * 9));
          mesh.visible = grown > 0 && L > .03;
          const length = Math.min(.018 * grown, this.lastCut * .65);
          const y = Math.max(.002, this.lastCut - length * .55);
          const q = ringAt(o.rows, y);
          mesh.position.set(q.cx + Math.cos(angle) * q.r, PLATE_H + y, Math.sin(angle) * q.r);
          mesh.scale.set(.0015 * grown, Math.max(.0001, length * .5), .0015 * grown);
        }
      }
      f.place(this.top.x, this.top.y);
    },
    // Rendering choice: dim the point light as the flame nears the altar, so the near surface does not blow out to white.
    update(time, topY) { f.fm.uniforms.uWind.value = wind; f.tick(time, this.power * (lit ? Math.min(1, level * 25) : 1), this.lightMax * Math.min(1, ((this.top.y + .03) / .2) ** 2), [wax, poolMat], topY); fat.userData.u.uTop.value = topY; fat.userData.u.uGlow.value = .12 * this.power; f.ember.visible = this.power > .02 || clockTime < emberUntil; f.ember.material.color.setRGB(2.4, .36, .035).multiplyScalar(clockTime < emberUntil ? Math.max(0, (emberUntil - clockTime) / 2.5) : 1); },
  };
  g.traverse((o) => o.layers.set(1)); f.light.layers.enableAll();
  g.visible = false; return api;
})();

// The rack behind the altar: rows of candles, or butter lamps, left by others.
const RACK_N = 66;
const rackBodies = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 18).translate(0, .5, 0), waxMaterial(0x8a1a12, { roughness: .45 }), RACK_N);
const rackCups = new THREE.InstancedMesh(new THREE.LatheGeometry([[0, 0], [.03, 0], [.012, .015], [.01, .04], [.036, .07], [.04, .08], [.03, .06], [0, .05]].map(([x, y]) => V2(x, y)), 20),
  new THREE.MeshStandardMaterial({ color: 0xc19a4c, metalness: 1, roughness: .3, envMapIntensity: .4 }), RACK_N);
const rackFlames = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), flameMaterial(true), RACK_N);
rackFlames.frustumCulled = false; flameMats.push(rackFlames.material);
const aSeed = new Float32Array(RACK_N), aScale = new Float32Array(RACK_N);
rackFlames.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
rackFlames.geometry.setAttribute('aScale', new THREE.InstancedBufferAttribute(aScale, 1));
hall.add(rackBodies, rackCups, rackFlames);
for (let tier = 0; tier < 3; tier++) {
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.3, .04, .22), darkIron); shelf.position.set(0, .72 + tier * .2, -1.15 - tier * .26); shelf.receiveShadow = true; hall.add(shelf);
  for (const x of [-1.6, 1.6]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(.03, .72 + tier * .2, .03), darkIron); leg.position.set(x, (.72 + tier * .2) / 2, -1.15 - tier * .26); hall.add(leg); }
}
const rackLights = [-1, 0, 1].map((x) => { const l = new THREE.PointLight(0xff9040, .45, 0, 2); l.position.set(x, 1.6, -.8); hall.add(l); return l; });
function layoutRack(kind) {
  const rnd = mulberry32(kind === 'butter' ? 21 : 13); const m = new THREE.Matrix4(); let i = 0;
  for (let tier = 0; tier < 3; tier++) {
    const y = .74 + tier * .2, z = -1.15 - tier * .26, per = RACK_N / 3;
    for (let k = 0; k < per; k++, i++) {
      const x = -1.5 + 3 * (k + .5) / per + (rnd() - .5) * .02;
      if (kind === 'butter') {
        m.makeTranslation(x, y, z); rackCups.setMatrixAt(i, m);
        m.makeTranslation(x, y + .066, z); rackFlames.setMatrixAt(i, m); aScale[i] = .03 + rnd() * .012;
      } else {
        const h = .04 + rnd() * .12, r = .016 + rnd() * .008, lit = rnd() > .22;
        m.compose(V3(x, y, z), new THREE.Quaternion(), V3(r, h, r)); rackBodies.setMatrixAt(i, m);
        m.makeTranslation(x, y + h + .004, z); rackFlames.setMatrixAt(i, m); aScale[i] = lit ? .042 + rnd() * .016 : 0;
      }
      aSeed[i] = rnd() * 10;
    }
  }
  rackBodies.visible = kind !== 'butter'; rackCups.visible = kind === 'butter';
  for (const im of [rackBodies, rackCups, rackFlames]) im.instanceMatrix.needsUpdate = true;
  rackFlames.geometry.attributes.aSeed.needsUpdate = true; rackFlames.geometry.attributes.aScale.needsUpdate = true;
}

// ---------- Outside: each temple in its own place ----------
const outside = new THREE.Scene();
let place = null;
let C = null; // the place being built
function snowy(m, amt) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vWN;\n' + sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = 'varying vec3 vWN;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(.86, .89, .95), smoothstep(.42, .72, vWN.y) * ${amt.toFixed(2)});`);
  };
}
function M(color, rough = .85, o = {}) {
  const key = JSON.stringify([color, rough, Object.entries(o).map(([k,v]) => [k, v?.isTexture ? v.uuid : v])]);
  if (C.materials.has(key)) return C.materials.get(key);
  const m = new THREE.MeshStandardMaterial({color, roughness: rough, ...o}); if (C.snow) snowy(m, C.snow);
  C.materials.set(key, m); return m;
}
const roofMat = (color, glazed) => M(color, glazed ? .36 : .8, { map: tileTex, metalness: glazed ? .25 : .05, side: THREE.DoubleSide });
// Static pieces are merged per material at the end of a build.
function put(geo, m, x = 0, y = 0, z = 0, ry = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo; if (ry) g.rotateY(ry); g.translate(x, y, z);
  if (!C.bat.has(m)) C.bat.set(m, []); C.bat.get(m).push(g);
}
const box = (w, h, d, m, x, y, z, ry = 0) => put(new THREE.BoxGeometry(w, h, d), m, x, y, z, ry);
async function finishBatch() {
  for (const [m, list] of C.bat) {
    await pauseBuild();
    const geo = mergeGeometries(list.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; }));
    list.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(geo, m); C.G.add(mesh);
  }
}
function roofGeo(w, d, h, lift) {
  const g = new THREE.PlaneGeometry(w, d, 60, 30); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, ridge = Math.max(w / 2 - d / 2, w * .12);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const az = Math.abs(z) / (d / 2), ax = Math.max(0, Math.abs(x) - ridge) / (w / 2 - ridge);
    const t = Math.min(1, Math.max(az, ax));
    p.setY(i, h * Math.pow(1 - t, 1.7) + lift * Math.pow(t, 4) * (.25 + .75 * Math.pow(Math.min(ax, az) + .0001, 1.5)));
  }
  g.computeVertexNormals(); return { g, ridge };
}
function ridgeBar(r, y, m, x, z, scale = 1) {
  box(r.ridge * 2 + .6 * scale, .5 * scale, .45 * scale, m, x, y + .1 * scale, z);
  for (const s of [-1, 1]) box(.45 * scale, 1.2 * scale, .5 * scale, m, x + s * (r.ridge + .3 * scale), y + .5 * scale, z);
}
// A Chinese hall: stone base, columns, glowing lattice doors, painted brackets, one or two eaves.
function hallB(o) {
  const x = o.x ?? 0, y = o.y ?? 0, z = o.z ?? 0, w = o.w, d = o.d, h = o.h, base = o.base ?? 1.2, lift = o.lift ?? .8;
  box(w + 3.2, base, d + 3.2, o.baseM ?? C.stone, x, y + base / 2, z);
  const yb = y + base;
  box(w, h, d, o.wall, x, yb + h / 2, z - .5);
  const n = Math.max(4, Math.round(w / 2.8) + 1), colG = new THREE.CylinderGeometry(.26, .28, h, 14);
  for (let i = 0; i < n; i++) put(colG.clone(), C.col, x - w / 2 + w * i / (n - 1), yb + h / 2, z + d / 2 + .3);
  if (o.glow !== 0) {
    const dm = new THREE.MeshStandardMaterial({ color: 0x1a0a06, emissive: o.glowColor ?? 0xffa04a, emissiveMap: latticeTex, emissiveIntensity: o.glow ?? 1.2 });
    const dp = new THREE.Mesh(new THREE.PlaneGeometry(w * .62, h * .78), dm); dp.position.set(x, yb + h * .42, z + d / 2 - .48); C.G.add(dp);
  }
  box(w + 1, .8, d + 1, C.paint, x, yb + h + .4, z - .3);
  let ry = yb + h + .8; const rh = o.eaves === 2 ? h * .3 : h * .6;
  const r1 = roofGeo(w + 4.6, d + 4.6, rh, lift); put(r1.g, o.roof, x, ry, z - .3);
  let top = ry + rh, last = r1;
  if (o.eaves === 2) {
    const w2 = w * .74, d2 = d * .62, h2 = h * .42;
    box(w2, h2 + 1, d2, o.wall, x, ry + h2 / 2 + .5, z - .3);
    box(w2 + .8, .6, d2 + .8, C.paint, x, ry + h2 + .8, z - .3);
    ry += h2 + 1.1; const r2 = roofGeo(w2 + 4, d2 + 4, h * .55, lift); put(r2.g, o.roof, x, ry, z - .3);
    top = ry + h * .55; last = r2;
  }
  ridgeBar(last, top, o.roof, x, z - .3);
  return { top, front: z + d / 2 + 1.6, doors: V3(x, yb + h * .45, z + d / 2) };
}
// A tall pavilion of several floors.
function tower(o) {
  const x = o.x ?? 0, z = o.z ?? 0; let y = o.y ?? 0, w = o.w, d = o.d;
  box(w + 3, 1.4, d + 3, o.baseM ?? C.stone, x, y + .7, z); y += 1.4;
  for (let f = 0; f < o.floors; f++) {
    const last = f === o.floors - 1;
    box(w, o.fh, d, o.wall, x, y + o.fh / 2, z);
    if (f === 0 && o.glow !== 0) { const dp = new THREE.Mesh(new THREE.PlaneGeometry(w * .5, o.fh * .7), new THREE.MeshStandardMaterial({ color: 0x1a0a06, emissive: 0xffa04a, emissiveMap: latticeTex, emissiveIntensity: o.glow ?? 1 })); dp.position.set(x, y + o.fh * .38, z + d / 2 + .02); C.G.add(dp); }
    box(w + .8, .6, d + .8, C.paint, x, y + o.fh + .3, z);
    const rh = last ? o.fh * .5 : 1.3, r = roofGeo(w + 4, d + 4, rh, .8); put(r.g, o.roof, x, y + o.fh + .6, z);
    if (last) ridgeBar(r, y + o.fh + .6 + rh, o.roof, x, z);
    y += o.fh + .9; w *= .84; d *= .84;
  }
}
function gateB(o) {
  const y = o.y ?? 0, z = o.z, w = o.w ?? 10, h = o.h ?? 4.6, open = 2.8, side = (w - open) / 2;
  for (const s of [-1, 1]) box(side, h, 2.4, o.wall, s * (open / 2 + side / 2), y + h / 2, z);
  box(open, h - 3.6, 2.4, o.wall, 0, y + 3.6 + (h - 3.6) / 2, z);
  box(w + .6, .6, 2.8, C.paint, 0, y + h + .3, z);
  const r = roofGeo(w + 3, 5.4, 1.9, o.lift ?? .6); put(r.g, o.roof, 0, y + h + .6, z); ridgeBar(r, y + h + 2.5, o.roof, 0, z, .7);
  if (o.text) { const tx = plaqueTex(o.text); const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.9, .6), new THREE.MeshStandardMaterial({ map: tx, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: .25, roughness: .5 })); pl.position.set(0, y + h - .5, z + 1.22); C.G.add(pl); }
}
function wallRun(x1, z1, x2, z2, h, m, cap, y = 0) {
  const len = Math.hypot(x2 - x1, z2 - z1), ry = -Math.atan2(z2 - z1, x2 - x1);
  box(len, h, .7, m, (x1 + x2) / 2, y + h / 2, (z1 + z2) / 2, ry);
  box(len + .3, .4, 1.3, cap, (x1 + x2) / 2, y + h + .2, (z1 + z2) / 2, ry);
}
function compound(gz, back, half, h, wall, cap) {
  wallRun(-half, gz, -5.2, gz, h, wall, cap); wallRun(5.2, gz, half, gz, h, wall, cap);
  wallRun(-half, gz, -half, back, h, wall, cap); wallRun(half, gz, half, back, h, wall, cap);
}
function stairs(x, y, z, n, rise, run, w, m) { for (let i = 0; i < n; i++) box(w, rise * (i + 1), run, m, x, y + rise * (i + 1) / 2, z - run * (i + .5)); }
function paifang(z, w, h, post, roof, y = 0) {
  const xs = [-w / 2, -w / 6, w / 6, w / 2];
  for (const x of xs) box(.7, h, .7, post, x, y + h / 2, z);
  box(w + 1.2, .9, .7, post, 0, y + h - 1.6, z);
  xs.slice(0, 3).forEach((x, i) => { const bw = w / 3, mid = i === 1, r = roofGeo(bw + 1.6, 2, .9, .5); put(r.g, roof, x + bw / 2, y + h + (mid ? .7 : 0), z); box(bw + .2, .3, .5, roof, x + bw / 2, y + h + (mid ? .7 : 0) + .9, z); if (mid) box(bw, .7, .6, C.paint, x + bw / 2, y + h + .35, z); });
}
function pave(x, z, w, d, y = 0, m = C.pave) { box(w, .12, d, m, x, y + .06, z); }
function ground(color, o = {}) {
  const m = M(color, o.rough ?? 1, o.mat ?? {});
  const g = new THREE.Mesh(o.r ? new THREE.CircleGeometry(o.r, 96) : new THREE.PlaneGeometry(1600, 1600), m);
  g.rotation.x = -Math.PI / 2; g.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0); C.G.add(g); return g;
}
function water(y, color, o = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: o.rough ?? .06, metalness: 0, normalMap: waterTex, normalScale: V2(o.waves ?? .35, o.waves ?? .35), envMapIntensity: o.env ?? 1, clearcoat: .3 });
  const w = new THREE.Mesh(o.geo ?? new THREE.PlaneGeometry(2400, 2400), m); w.rotation.x = -Math.PI / 2; w.position.set(o.x ?? 0, y, o.z ?? 0); C.G.add(w);
  if (!C.waterAnim) { C.waterAnim = true; C.up.push((dt) => { waterTex.offset.x += dt * .004; waterTex.offset.y += dt * .002; }); }
  return w;
}
// Mountains: a cone pushed about by noise, with a profile that can be sharp or domed.
function peakGeo(r, h, seed, sharp = 1.3) {
  const rnd = mulberry32(seed), ph = [rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6];
  const g = new THREE.CylinderGeometry(0, r, h, 72, 36, true); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), t = (p.getY(i) + h / 2) / h, a = Math.atan2(z, x), rad = Math.hypot(x, z);
    if (rad < 1e-6) { p.setY(i, h); continue; }
    const n = Math.sin(a * 2 + ph[0] + t * 3) * .5 + Math.sin(a * 5 + ph[1] - t * 7) * .3 + Math.sin(a * 11 + ph[2] + t * 13) * .16 + Math.sin(a * 23 + ph[3] - t * 19) * .08;
    const prof = Math.pow(1 - t, sharp), k = r * prof * (1 + .3 * n) / rad;
    p.setXYZ(i, x * k, t * h * (1 + .06 * n), z * k);
  }
  g.computeVertexNormals(); return g;
}
function peak(x, y, z, r, h, m, seed, sharp) { put(peakGeo(r, h, seed, sharp), m, x, y, z); }
function rock(x, y, z, s, seed) {
  const rnd = mulberry32(seed), ph = Array.from({ length: 6 }, () => rnd() * 6);
  let g = new THREE.IcosahedronGeometry(1, 5); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const p = g.attributes.position, col = [];
  for (let i = 0; i < p.count; i++) {
    const v = V3(p.getX(i), p.getY(i), p.getZ(i));
    const n = Math.sin(v.x * 3 + ph[0]) * Math.sin(v.y * 4 + ph[1]) * .22 + Math.sin(v.z * 7 + ph[2] + v.y * 5) * .1 + Math.sin(v.x * 13 + ph[3]) * Math.sin(v.z * 11 + ph[4]) * .05;
    v.multiplyScalar(1 + n); if (v.y < -.2) v.y = -.2; p.setXYZ(i, v.x * s[0], v.y * s[1], v.z * s[2]);
  }
  g.computeVertexNormals(); const nm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { const moss = Math.min(1, Math.max(0, (nm.getY(i) - .25) * 2)), c = new THREE.Color(0x77756c).lerp(new THREE.Color(0x3c4a2a), moss * .85); col.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(g, M(0xffffff, .95, { vertexColors: true })); mesh.position.set(x, y, z); C.G.add(mesh);
}
// Backdrop ridges, far away, with an optional snow line.
function ridgeGeo(width, base, amp, seed) {
  const r = mulberry32(seed), s = new THREE.Shape(), ph = [r() * 6, r() * 6, r() * 6, r() * 6], n = 160;
  s.moveTo(-width / 2, -60);
  for (let i = 0; i <= n; i++) {
    const u = i / n; const v = Math.sin(u * 3.1 + ph[0]) * .5 + Math.sin(u * 7.3 + ph[1]) * .28 + Math.sin(u * 17 + ph[2]) * .14 + Math.sin(u * 41 + ph[3]) * .06;
    s.lineTo(-width / 2 + width * u, base + amp * (.5 + .5 * v));
  }
  s.lineTo(width / 2, -60); return new THREE.ShapeGeometry(s);
}
function ridges(list) {
  list.forEach(([dist, base, amp, color, snow], i) => {
    const m = new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color(color) }, uS: { value: new THREE.Color(0xf4f6fa).lerp(new THREE.Color(color), .25) }, uLine: { value: snow ?? 1e5 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: 'uniform vec3 uC, uS; uniform float uLine; varying vec3 vP; void main(){ float s = smoothstep(uLine, uLine + 2., vP.y + sin(vP.x * .21) * 3. + sin(vP.x * .67) * 1.4); gl_FragColor = vec4(mix(uC, uS, s), 1.); }' });
    const mesh = new THREE.Mesh(ridgeGeo(1600, base, amp, 40 + i * 13 + C.seed), m); mesh.position.set(0, 0, -dist); C.G.add(mesh);
  });
}
// Trees as instanced pieces: lumpy foliage blobs, trunks, cones, culms.
const blobGeo = (() => {
  let g = new THREE.IcosahedronGeometry(1, 2); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = V3(p.getX(i), p.getY(i), p.getZ(i)); v.multiplyScalar(1 + .16 * Math.sin(v.x * 5.1 + v.y * 3.3) + .12 * Math.sin(v.y * 7.7 - v.z * 4.1) + .08 * Math.sin(v.z * 11.3 + v.x * 6.7)); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); return g;
})();
const trunkGeo = new THREE.CylinderGeometry(.6, 1, 1, 7).translate(0, .5, 0);
const coneGeo = new THREE.ConeGeometry(1, 1, 9).translate(0, .5, 0);
// True when a spot would stand between the overview camera and the temple, or on the walk.
// `top` is how tall the thing is; anything that stays below the line of sight is fine.
function blocked(x, z, r = 7, top = Infinity) {
  const a = C.cam, b = C.tgt, dx = b.x - a.x, dz = b.z - a.z, k = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
  const below = top < a.y + (b.y - a.y) * k - 1;
  return (!below && Math.hypot(x - a.x - dx * k, z - a.z - dz * k) < r) || (Math.abs(x) < 3.5 && z > -2 && z < 70);
}
function trees() {
  const L = { blob: [], trunk: [], cone: [] }, q = new THREE.Quaternion(), e = new THREE.Euler(), rnd = C.rnd;
  const add = (k, x, y, z, sx, sy, sz, color, rx = 0, rz = 0) => { e.set(rx, rnd() * 6.28, rz); q.setFromEuler(e); L[k].push([new THREE.Matrix4().compose(V3(x, y, z), q.clone(), V3(sx, sy, sz)), new THREE.Color(color)]); };
  const jit = (c, a = .12) => new THREE.Color(c).offsetHSL((rnd() - .5) * .03, (rnd() - .5) * a, (rnd() - .5) * a).getHex();
  const T = {
    broad(x, y, z, s, color) { if (blocked(x, z, 4 + s * 2, y + 5 * s)) return; add('trunk', x, y, z, .22 * s, 2.6 * s, .22 * s, 0x3a2e24); for (let k = 0; k < 6; k++) { const a = rnd() * 6.28, d = rnd() * 1.4 * s; add('blob', x + Math.cos(a) * d, y + 2.6 * s + rnd() * 1.6 * s, z + Math.sin(a) * d, (1 + rnd() * .6) * s, (.8 + rnd() * .5) * s, (1 + rnd() * .6) * s, jit(color)); } },
    pine(x, y, z, s, color, keep) { if (!keep && blocked(x, z, 3 + s * 1.5, y + 5.2 * s)) return; add('trunk', x, y, z, .14 * s, 2 * s, .14 * s, 0x3a2a20); for (let k = 0; k < 3; k++) add('cone', x, y + (1 + k * 1.15) * s, z, (1.6 - k * .38) * s, 1.9 * s, (1.6 - k * .38) * s, jit(color, .08)); },
    cypress(x, y, z, s, color) { if (blocked(x, z, 3 + s * 1.5, y + 8.5 * s)) return; const lean = (rnd() - .5) * .2; add('trunk', x, y, z, .3 * s, 3 * s, .3 * s, 0x4a3a2c, 0, lean); for (let k = 0; k < 5; k++) add('blob', x + Math.sin(lean) * k * .7 * s + (rnd() - .5) * .8 * s, y + (2.2 + k * 1.3) * s, z + (rnd() - .5) * .8 * s, (1.1 - k * .12) * s, .9 * s, (1.1 - k * .12) * s, jit(color, .06)); },
    bamboo(x, y, z, s, color) { if (blocked(x, z, 4, y + 12 * s)) return; const lx = (rnd() - .5) * .14, lz = (rnd() - .5) * .14, h = (8 + rnd() * 4) * s; add('trunk', x, y, z, .07 * s, h, .07 * s, jit(0x7a9a48), lx, lz); for (let k = 0; k < 3; k++) add('blob', x - lz * h * .9 + (rnd() - .5) * 1.2, y + h * (.75 + k * .1), z + lx * h * .9 + (rnd() - .5) * 1.2, (.9 + rnd() * .5) * s, .45 * s, (.9 + rnd() * .5) * s, jit(color, .1)); },
    blob(x, y, z, sx, sy, sz, color) { add('blob', x, y, z, sx, sy, sz, jit(color, .06)); },
    finish() {
      for (const [k, geo, rough] of [['blob', blobGeo, .95], ['trunk', trunkGeo, 1], ['cone', coneGeo, .95]]) {
        if (!L[k].length) continue;
        const im = new THREE.InstancedMesh(geo, M(0xffffff, rough), L[k].length);
        L[k].forEach(([m, c], i) => { im.setMatrixAt(i, m); im.setColorAt(i, c); });
        im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; C.G.add(im);
      }
    } };
  return T;
}
// Falling or drifting particles: snow, rain, petals, leaves, motes.
function fall(o) {
  const n = Math.round(o.n * (quality === 'high' ? 1 : .45)), [cx, cy, cz] = o.at, [w, h, d] = o.box, rnd = C.rnd, rain = o.kind === 'rain', st = rain ? 6 : 3;
  const pos = new Float32Array(n * st), seeds = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = cx + (rnd() - .5) * w, y = cy + (rnd() - .5) * h, z = cz + (rnd() - .5) * d; seeds[i] = rnd() * 100; pos.set(rain ? [x, y, z, x + .05, y + .7, z] : [x, y, z], i * st); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const obj = rain ? new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: o.color, transparent: true, opacity: o.opacity ?? .3, depthWrite: false }))
    : new THREE.Points(g, new THREE.PointsMaterial({ map: o.tex ?? softTex, color: o.color, size: o.size, transparent: true, opacity: o.opacity ?? .9, depthWrite: false, alphaTest: o.tex ? .3 : 0, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending }));
  obj.frustumCulled = false; C.G.add(obj);
  const lo = cy - h / 2, hi = cy + h / 2;
  C.up.push((dt, t) => {
    obj.visible = !powerSaver && !reducedMotion.matches; if (!obj.visible) return;
    for (let i = 0; i < n; i++) {
      const j = i * st; let y = pos[j + 1] - o.vy * dt * (.7 + .6 * ((seeds[i] * 7) % 1));
      pos[j] += Math.sin(t * .9 + seeds[i]) * o.sway * dt + (o.wind ?? 0) * dt; pos[j + 2] += Math.cos(t * .7 + seeds[i] * 1.3) * o.sway * dt;
      if (y < lo) y = hi; if (y > hi) y = lo; pos[j + 1] = y;
      if (pos[j] > cx + w / 2) pos[j] -= w; if (pos[j] < cx - w / 2) pos[j] += w;
      if (rain) { pos[j + 3] = pos[j] + .05; pos[j + 4] = y + .7; pos[j + 5] = pos[j + 2]; }
    }
    g.attributes.position.needsUpdate = true;
  });
}
function mist(o) {
  const mat = new THREE.SpriteMaterial({ map: softTex, color: o.color, transparent: true, opacity: o.opacity, depthWrite: false, fog: o.fog ?? true });
  const list = [];
  for (let i = 0; i < o.n; i++) {
    const s = new THREE.Sprite(mat); const k = .6 + C.rnd() * .9;
    s.position.set(o.at[0] + (C.rnd() - .5) * o.box[0], o.at[1] + (C.rnd() - .5) * o.box[1], o.at[2] + (C.rnd() - .5) * o.box[2]);
    s.scale.set(o.size * k * 1.8, o.size * k * .6, 1); C.G.add(s); list.push(s);
  }
  C.up.push((dt) => { for (const s of list) { s.position.x += dt * (o.drift ?? .4); if (s.position.x > o.at[0] + o.box[0] / 2) s.position.x -= o.box[0]; } });
}
function lanterns(list, s = 1) {
  const m = new THREE.MeshStandardMaterial({ color: 0x5a1008, emissive: 0xff4a18, emissiveIntensity: 3.2, roughness: .6 }), cap = M(0x2a1a10, .6, { metalness: .5 });
  for (const [x, y, z] of list) { const sp = new THREE.SphereGeometry(.42 * s, 16, 12); sp.scale(1, 1.18, 1); put(sp, m, x, y, z); box(.36 * s, .1 * s, .36 * s, cap, x, y + .5 * s, z); box(.36 * s, .1 * s, .36 * s, cap, x, y - .5 * s, z); }
}
function postLanterns(zs, xoff, h = 3, s = 1) { const pts = []; for (const z of zs) for (const x of [-xoff, xoff]) { box(.12, h, .12, C.dark, x, h / 2, z); box(.9, .1, .1, C.dark, x * .93, h, z); pts.push([x * .86, h - .6, z]); } lanterns(pts, s); }
function smokeAt(x, y, z, o = {}) {
  const rnd = C.rnd;
  const sm = new Smoke(C.G, o.n ?? 80, o.color ?? 0xd8d4cc, o.op ?? .28, o.k ?? 14);
  C.up.push((dt, t) => { if (rnd() < (o.rate ?? .6)) sm.puff(V3(x, y, z), o.spread ?? .4, o.size ?? .35); sm.update(dt, t); });
}
function burnerAt(x, z, s = 1) {
  const g = new THREE.LatheGeometry([[0, 0], [.5, 0], [.55, .1], [.4, .3], [.9, .7], [.95, 1.2], [1, 1.25], [.85, 1.25], [.8, 1], [0, 1]].map(([a, b]) => V2(a * s, b * s)), 32);
  put(g, M(0x4a3a28, .5, { metalness: .9 }), x, 0, z);
  smokeAt(x, 1.3 * s, z, { size: .25 * s, spread: .3 * s });
}
// Prayer flags on a sagging string; they flutter.
function flags(a, b, n, sag) {
  const cols = [0x2a5ab8, 0xf0efe6, 0xc0302a, 0x2a9a50, 0xf0c020];
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(.5, .4).translate(0, -.22, 0), M(0xffffff, .9, { side: THREE.DoubleSide }), n);
  const pts = [], yaw = -Math.atan2(b.z - a.z, b.x - a.x), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), m = new THREE.Matrix4(), one = V3(1, 1, 1);
  for (let i = 0; i < n; i++) { const k = (i + .5) / n, p = a.clone().lerp(b, k); p.y -= sag * 4 * k * (1 - k); pts.push(p); im.setColorAt(i, new THREE.Color(cols[i % 5])); }
  const lp = []; for (let i = 0; i <= 24; i++) { const k = i / 24, p = a.clone().lerp(b, k); p.y -= sag * 4 * k * (1 - k); lp.push(p); }
  C.G.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(lp), new THREE.LineBasicMaterial({ color: 0x3a3028 })));
  im.instanceColor.needsUpdate = true; C.G.add(im);
  C.up.push((dt, t) => { for (let i = 0; i < n; i++) { e.set(Math.sin(t * 2.4 + i * .7) * .5 + .25, yaw, 0); q.setFromEuler(e); m.compose(pts[i], q, one); im.setMatrixAt(i, m); } im.instanceMatrix.needsUpdate = true; });
}
function ribbons(cx, cy, cz, n, spread) {
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(.08, .9).translate(0, -.45, 0), new THREE.MeshStandardMaterial({ color: 0xc8141a, emissive: 0x5a0606, roughness: .7, side: THREE.DoubleSide }), n);
  const pts = Array.from({ length: n }, () => V3(cx + (C.rnd() - .5) * spread, cy + (C.rnd() - .5) * spread * .4, cz + (C.rnd() - .5) * spread));
  const q = new THREE.Quaternion(), e = new THREE.Euler(), m = new THREE.Matrix4(), one = V3(1, 1, 1);
  C.G.add(im); C.up.push((dt, t) => { pts.forEach((p, i) => { e.set(Math.sin(t * 1.7 + i) * .25, i, Math.sin(t * 1.3 + i * 2) * .2); q.setFromEuler(e); m.compose(p, q, one); im.setMatrixAt(i, m); }); im.instanceMatrix.needsUpdate = true; });
}
function pagoda(x, z, tiers, s, m) {
  if (blocked(x, z, 3 + s * 2, (4.5 + tiers * .7) * s)) return;
  const hex = (r, h) => new THREE.CylinderGeometry(r, r, h, 6);
  let y = 0, r = .8 * s;
  put(hex(1.15 * s, .7 * s), m, x, y + .35 * s, z); y += .7 * s;
  put(hex(r, 2.1 * s), m, x, y + 1.05 * s, z); y += 2.1 * s;
  for (let i = 0; i < tiers; i++) { put(hex(r * 1.3, .2 * s), m, x, y + .1 * s, z); y += .2 * s; const hh = .5 * s; r *= .92; put(hex(r, hh), m, x, y + hh / 2, z); y += hh; }
  put(new THREE.ConeGeometry(r * 1.25, .8 * s, 6), m, x, y + .4 * s, z); y += .8 * s;
  put(new THREE.CylinderGeometry(.06 * s, .1 * s, .9 * s, 6), m, x, y + .45 * s, z); put(new THREE.SphereGeometry(.16 * s, 8, 6), m, x, y + .95 * s, z);
}
function tibetan(o) {
  const { w, d, h } = o, x = o.x ?? 0, z = o.z ?? 0;
  const white = M(0xeee6d4, .95), band = M(0x4a1a14, 1), dark = M(0x15110f, .9), gold = M(0xd9a43a, .26, { metalness: 1 });
  box(w, h, d, white, x, h / 2, z);
  box(w + .3, 1.7, d + .3, band, x, h - 1.05, z); box(w + .5, .35, d + .5, dark, x, h + .02, z);
  const trap = new THREE.Shape(); trap.moveTo(-.8, -1); trap.lineTo(.8, -1); trap.lineTo(.6, 1); trap.lineTo(-.6, 1); trap.closePath();
  const tg = new THREE.ShapeGeometry(trap), win = M(0x2a1810, .7);
  for (const yy of [2.4, 5.2]) for (let xx = -w / 2 + 2.4; xx < w / 2 - 1.5; xx += 3.4) { if (Math.abs(xx) < 6.5) continue; put(tg.clone(), dark, x + xx, yy, z + d / 2 + .02); box(.75, 1.2, .05, win, x + xx, yy - .05, z + d / 2 + .05); box(1.5, .14, .5, band, x + xx, yy + 1.1, z + d / 2 + .25); }
  // Porch with red columns and a dark yak-hair curtain.
  for (let i = 0; i < 6; i++) put(new THREE.CylinderGeometry(.28, .3, h - 2, 12), C.col, x - 6 + i * 2.4, (h - 2) / 2, z + d / 2 + 2.6);
  box(14, .7, 3.4, band, x, h - 1.65, z + d / 2 + 1.7); box(10, h - 2.6, .1, M(0x1b1512, 1), x, (h - 2.6) / 2, z + d / 2 + .1);
  for (let i = 0; i < 4; i++) box(.18, h - 3, .04, M(0xe8e0cc, 1), x - 3 + i * 2, (h - 3) / 2 + .2, z + d / 2 + .16);
  // Upper storey and gilded roofs.
  box(w * .55, 4, d * .5, white, x, h + 2, z - d * .15); box(w * .55 + .2, 1.1, d * .5 + .2, band, x, h + 3.4, z - d * .15);
  for (const [xx, s] of [[-7, .8], [0, 1.15], [7, .8]]) { const r = roofGeo(5.5 * s, 4.4 * s, 2.1 * s, .7 * s); put(r.g, gold, x + xx, h + 4.2, z - d * .2); ridgeBar(r, h + 4.2 + 2.1 * s, gold, x + xx, z - d * .2, .6 * s); put(new THREE.CylinderGeometry(.12, .3, 1.3, 10), gold, x + xx, h + 4.2 + 2.1 * s + .9, z - d * .2); }
  // Dharma wheel with two deer on the front parapet.
  const wy = h + 1.6, wz = z + d / 2 - .4;
  put(new THREE.TorusGeometry(1, .13, 10, 40), gold, x, wy, wz); put(new THREE.CylinderGeometry(.25, .25, .2, 16).rotateX(Math.PI / 2), gold, x, wy, wz);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI; box(.07, 1.9, .07, gold, x, wy, wz); C.bat.get(gold).at(-1).translate(-x, -wy, -wz).rotateZ(a).translate(x, wy, wz); }
  box(.4, .9, .4, gold, x, h + .45, wz);
  for (const s of [-1, 1]) { box(1, .55, .4, gold, x + s * 1.8, h + .65, wz); box(.28, .7, .28, gold, x + s * 1.35, h + 1.1, wz); box(.2, .6, .2, gold, x + s * 2.15, h + .2, wz); }
  for (const [cx, cz] of [[-w / 2, d / 2], [w / 2, d / 2], [-w / 2, -d / 2], [w / 2, -d / 2]]) put(new THREE.CylinderGeometry(.35, .5, 2, 12), gold, x + cx, h + 1.2, z + cz);
}
function archBridge(z, span, rise, width, m, y = 0) {
  const sh = new THREE.Shape(), L = span / 2 + 2.5, N = 24;
  sh.moveTo(-L, 0); for (let i = 0; i <= N; i++) { const u = -L + 2 * L * i / N; sh.lineTo(u, rise * Math.cos(Math.PI * u / (2 * L)) ** 1.2 + .3); } sh.lineTo(L, 0);
  const hole = new THREE.Path(); hole.moveTo(span * .32, 0); hole.absarc(0, 0, span * .32, 0, Math.PI, false); hole.lineTo(span * .32, 0); sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false, curveSegments: 20 });
  g.translate(0, 0, -width / 2); g.rotateY(-Math.PI / 2); put(g, m, 0, y, z);
  for (const s of [-1, 1]) {
    const rail = new THREE.Shape(); rail.moveTo(-L, .3); for (let i = 0; i <= N; i++) { const u = -L + 2 * L * i / N; rail.lineTo(u, rise * Math.cos(Math.PI * u / (2 * L)) ** 1.2 + 1.1); } for (let i = N; i >= 0; i--) { const u = -L + 2 * L * i / N; rail.lineTo(u, rise * Math.cos(Math.PI * u / (2 * L)) ** 1.2 + .3); }
    const rg = new THREE.ExtrudeGeometry(rail, { depth: .2, bevelEnabled: false }); rg.translate(0, 0, -.1); rg.rotateY(-Math.PI / 2); put(rg, m, s * (width / 2 - .1), y, z);
  }
}
function lotus(x0, x1, z0, z1, y, n) {
  const pads = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20, .3, 6).rotateX(-Math.PI / 2), M(0xffffff, .7, { side: THREE.DoubleSide }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) { const s = .35 + C.rnd() * .55; q.setFromEuler(new THREE.Euler(0, C.rnd() * 6.28, 0)); m.compose(V3(x0 + C.rnd() * (x1 - x0), y + C.rnd() * .03, z0 + C.rnd() * (z1 - z0)), q, V3(s, 1, s)); pads.setMatrixAt(i, m); pads.setColorAt(i, new THREE.Color(0x3d6a2c).offsetHSL((C.rnd() - .5) * .04, 0, (C.rnd() - .5) * .1)); }
  pads.instanceColor.needsUpdate = true; C.G.add(pads);
  const pink = M(0xf0a0b8, .6, { emissive: 0x3a1018 });
  for (let i = 0; i < n / 6; i++) { const g = new THREE.LatheGeometry([[0, 0], [.12, .04], [.2, .2], [.1, .32], [0, .3]].map(([a, b]) => V2(a, b)), 7); put(g, pink, x0 + C.rnd() * (x1 - x0), y + .2, z0 + C.rnd() * (z1 - z0)); }
}
function statue(x, y, z, h, m) {
  const s = h / 13;
  put(new THREE.CylinderGeometry(3.6 * s, 4.2 * s, 2 * s, 8), C.stone, x, y + 1 * s, z);
  put(new THREE.LatheGeometry([[0, 0], [2.4, 0], [2.3, 1], [1.9, 4.5], [1.55, 8], [1.75, 9.6], [1.2, 10.4], [.55, 10.6], [0, 10.6]].map(([a, b]) => V2(a * s, b * s)), 40), m, x, y + 2 * s, z);
  put(new THREE.SphereGeometry(.85 * s, 24, 18), m, x, y + 13.3 * s, z); box(1.8 * s, .35 * s, 1.5 * s, m, x, y + 14.3 * s, z);
  box(2.4 * s, .7 * s, 1 * s, m, x, y + 10 * s, z + 1.2 * s);
}
function city(n, rMin, rMax, arc) {
  const m = new THREE.MeshStandardMaterial({ color: 0x15161c, emissive: 0xffffff, emissiveMap: windowsTex, emissiveIntensity: .9, roughness: .9 });
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0), m, n), mat = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) { const a = arc[0] + C.rnd() * (arc[1] - arc[0]), r = rMin + C.rnd() * (rMax - rMin), h = 10 + C.rnd() * 34; q.setFromEuler(new THREE.Euler(0, -a, 0)); mat.compose(V3(Math.cos(a) * r, 0, Math.sin(a) * r), q, V3(14 + C.rnd() * 18, h, 14 + C.rnd() * 10)); im.setMatrixAt(i, mat); }
  C.G.add(im);
}
const skyVS = 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const skyFS = `uniform vec3 uTop, uHorizon, uGround, uSun, uDir, uLit, uDark; uniform float uGlow, uClouds, uStars, uTime, uDisc;
varying vec3 vD;
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h2(i), h2(i + vec2(1., 0.)), f.x), mix(h2(i + vec2(0., 1.)), h2(i + vec2(1., 1.)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * n2(p); p *= 2.03; a *= .5; } return s; }
void main(){
  vec3 d = normalize(vD); float h = d.y;
  vec3 c = mix(uHorizon, uTop, pow(smoothstep(0., .75, h), .6));
  float s = max(dot(d, uDir), 0.);
  c += uSun * (pow(s, 10.) * uGlow * .7 + pow(s, 2.5) * uGlow * .18);
  c += uSun * smoothstep(.9992, .9996, s) * uDisc;
  if (uClouds > 0.) {
    vec2 p = d.xz / max(h + .1, .03) * .8 + vec2(uTime * .004, 0.);
    float n = fbm(p * 1.4);
    float cov = smoothstep(1. - uClouds, 1. - uClouds + .28, n) * smoothstep(.0, .14, h);
    vec3 cc = mix(uDark, uLit, clamp(.4 + pow(s, 3.) * .8 + (n - .55) * 1.4, 0., 1.));
    c = mix(c, cc, cov);
  }
  if (uStars > 0.) { vec3 q = floor(d * 420.); c += step(.9984, h3(q)) * uStars * smoothstep(.08, .45, h); }
  c = mix(uGround, c, smoothstep(-.06, .0, h));
  gl_FragColor = vec4(c, 1.);
}`;

// Each place: its time of day, weather, landmark and buildings. Hall at the origin facing +z.
const placeModules = {
  lingyin: () => import('./places/lingyin.js'),
  shaolin: () => import('./places/shaolin.js'),
  yonghe: () => import('./places/yonghe.js'),
  jokhang: () => import('./places/jokhang.js'),
  puji: () => import('./places/puji.js'),
  zixiao: () => import('./places/zixiao.js'),
  qufu: () => import('./places/qufu.js'),
  meizhou: () => import('./places/meizhou.js'),
  guandi: () => import('./places/guandi.js'),
  hongluo: () => import('./places/hongluo.js')
};
const PLACES = {};
let lastBuildYield = 0;
async function pauseBuild() {
  if (performance.now() - lastBuildYield < 6) return;
  await new Promise(resolve => setTimeout(resolve, 0)); lastBuildYield = performance.now();
}
const placeHelpers = { THREE, V3, V2, M, roofMat, ground, pave, hallB, gateB, compound, rock, trees, peak, ridges, mist, burnerAt, postLanterns, pagoda, stairs, paifang, wallRun, tibetan, flags, water, archBridge, lotus, statue, box, city, ribbons, fall, lanterns, put, tower, smokeAt, pavingTex, petalTex, pauseBuild, get context() { return C; } };
const cachedPlaces = new Map();
const sharedTextures = new Set([pavingTex, grainTex, tileTex, waterTex, latticeTex, softTex, petalTex, windowsTex]);
function disposePlace(old) {
  const materials = new Set(), textures = new Set();
  old.G.traverse(o => { if (o.geometry && ![blobGeo, trunkGeo, coneGeo].includes(o.geometry)) o.geometry.dispose(); if (o.material) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) materials.add(m); });
  for (const m of materials) { for (const v of Object.values(m)) if (v?.isTexture && !sharedTextures.has(v)) textures.add(v); m.dispose(); }
  for (const texture of textures) texture.dispose();
  old.envTarget.dispose();
}

async function buildPlace(t) {
  if (place) outside.remove(place.G);
  if (cachedPlaces.has(t.id)) {
    place = cachedPlaces.get(t.id); cachedPlaces.delete(t.id); cachedPlaces.set(t.id, place);
    outside.add(place.G); outside.environment = place.env; outside.fog = new THREE.FogExp2(...place.P.fog); return;
  }
  PLACES[t.id] ??= (await placeModules[t.id]()).default(placeHelpers);
  const P = PLACES[t.id], G = new THREE.Group(); outside.add(G);
  C = { G, up: [], bat: new Map(), seed: seedOf(t.id), rnd: mulberry32(seedOf(t.id)), snow: P.snow ?? 0, cam: P.view.pos, tgt: P.view.look };
  C.materials = new Map();
  C.stone = M(0x9c968c, .85, { map: pavingTex }); C.pave = M(0xa8a296, .85, { map: pavingTex });
  C.red = M(0x8a2a1e, .9); C.col = M(0x6e1a12, .5); C.paint = M(0x2c4a52, .8); C.dark = M(0x1c1714, .6, { metalness: .5 });
  const s = P.sky, dir = V3(...s.dir).normalize(), col = (h) => new THREE.Color(h);
  const u = { uTop: { value: col(s.top) }, uHorizon: { value: col(s.horizon) }, uGround: { value: col(s.ground) }, uSun: { value: col(s.sun) }, uDir: { value: dir },
    uLit: { value: col(s.lit) }, uDark: { value: col(s.dark) }, uGlow: { value: s.glow }, uClouds: { value: s.clouds }, uStars: { value: s.stars ?? 0 }, uTime: { value: 0 }, uDisc: { value: s.disc ?? 5 } };
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: u, vertexShader: skyVS, fragmentShader: skyFS });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), skyMat); sky.renderOrder = -1; G.add(sky);
  const skyScene = new THREE.Scene(); skyScene.add(new THREE.Mesh(sky.geometry, skyMat));
  await pauseBuild();
  const envTarget = pmrem.fromScene(skyScene, 0, .1, 1000), env = envTarget.texture; outside.environment = env;
  outside.fog = new THREE.FogExp2(P.fog[0], P.fog[1]);
  const sun = new THREE.DirectionalLight(P.sunL[0], P.sunL[1]); sun.position.copy(dir).multiplyScalar(100); G.add(sun);
  G.add(new THREE.HemisphereLight(...P.hemi));
  await P.build(t); await finishBatch();
  await renderer.compileAsync(outside, camera);
  C.up.push((dt, time) => { u.uTime.value = time; });
  place = { G, up: C.up, sky, env, envTarget, P, id: t.id };
  cachedPlaces.set(t.id, place);
  // Retain a bounded two-place working set. Eviction releases every owned resource.
  while (cachedPlaces.size > 2) { const id = cachedPlaces.keys().next().value; disposePlace(cachedPlaces.get(id)); cachedPlaces.delete(id); }
}

// ---------- Camera rig and tweens ----------
const rig = { pos: V3(0, 1.35, 2.3), look: V3(0, 1, -1), amp: .006 };
let active = hall;
function switchTo(scene) {
  active = scene; const out = scene === outside, P = place?.P;
  camera.near = out ? .3 : .01; camera.far = out ? 1200 : 60; camera.updateProjectionMatrix();
  renderer.toneMappingExposure = out ? P.exposure ?? 1 : 1;
  const [st, th] = out ? P.bloom : [.24, 1.15]; bloom.strength = st; bloom.threshold = th;
}
const tweens = [];
function tween(dur, fn) { if (reducedMotion.matches) { fn(1); return Promise.resolve(); } return new Promise((res) => { tweens.push({ t: 0, dur, fn, res, skip: false }); }); }
function skipTweens() { for (const tw of tweens) tw.skip = true; }
function moveCam(pos, look, dur) {
  const p0 = rig.pos.clone(), l0 = rig.look.clone();
  return tween(dur, (k) => { const e = ease(k); rig.pos.lerpVectors(p0, pos, e); rig.look.lerpVectors(l0, look, e); });
}
const fadeEl = document.getElementById('fade');
const fadeTo = (o, ms = 900) => new Promise((res) => { if (reducedMotion.matches) ms = 80; fadeEl.style.transitionDuration = ms + 'ms'; fadeEl.style.opacity = o; setTimeout(res, ms); });


const WIDE = { pos: V3(0, 1.32, 2.3), look: V3(0, 1.02, -1) };
const chooseView = () => ({ pos: V3(0, ALTAR_Y + .3, .82), look: V3(0, ALTAR_Y - .01, -.02) });
function closeView() { const x = mine.top.x, top = ALTAR_Y + mine.top.y; const butter = mine.offer?.kind === 'butter'; const distance = Math.max(butter ? .40 : .38, mine.top.y * 2.3); return { pos: V3(x + .025, top + (butter ? .18 : .065), distance), look: V3(x, top - .012, .02) }; }
const hallTones = {
  lingyin: [0x839b87,0x090d0b], shaolin: [0xaaa18a,0x100d09], yonghe: [0xa5b7d4,0x090d14],
  jokhang: [0xc9a562,0x100c08], puji: [0x7c9eaa,0x080f12], zixiao: [0x72958f,0x08110e],
  qufu: [0xb6aa80,0x111009], meizhou: [0x7e93b0,0x080c14], guandi: [0x9a9690,0x0e0f0e], hongluo: [0xb58f80,0x100a09],
};
function applyTemple(t) {
  const [light, night] = hallTones[t.id];
  hall.background.setHex(night); hall.fog.color.setHex(night);
  hall.children.find(o => o.isDirectionalLight).color.setHex(light);
  banners.forEach(b => { b.visible = t.id !== 'jokhang'; });
  lacquer.color.setHex(t.lacquer).multiplyScalar(.3);
  plaqueMat.map?.dispose(); plaqueMat.map = plaqueTex(t.plaque); plaqueMat.emissiveMap = plaqueMat.map; plaqueMat.needsUpdate = true; plaque.visible = !!t.plaque;
  layoutRack(t.lamp);
  const isButter = t.lamp === 'butter';
  for (const l of rackLights) { l.color.setHex(isButter ? 0xffae50 : 0xff9040); l.intensity = isButter ? .055 : .035; }
}

// Step 3: one of ours, or one you draw.
const wickSmoke = new Smoke(hall, 70, 0xcfc8c0, .2);
wickSmoke.parts.forEach(({s}) => s.layers.set(1));
hall.traverse(o => { if (o.isLight) o.layers.enableAll(); });
let smokeUntil = 0, emberUntil = 0, ending = 'out', wind = 0;
let pointerX = 0, pointerY = 0, previousPointerX = 0;
window.addEventListener('pointermove', (e) => {
  pointerX = e.clientX / innerWidth * 2 - 1; pointerY = 1 - e.clientY / innerHeight * 2;
  if (lit) { const p = mine.top.clone(); p.y += ALTAR_Y; p.z += mine.g.position.z; p.project(camera);
    const near = Math.max(0, 1 - Math.hypot(pointerX - p.x, pointerY - p.y) / .5);
    wind = Math.max(-.5, Math.min(.5, wind + (pointerX - previousPointerX) * near * 4)); }
  previousPointerX = pointerX;
}, { passive: true });

// ---------- Public API ----------
export function setPhase(next) { phase = next; }
export function setPowerSaver(on) { powerSaver = on; resize(); }

const TEMPLE = Object.fromEntries(TEMPLES.map((t) => [t.id, t]));
const LAMP_CUP = .72;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let level = 1, lit = false, wanted = null, busy = false;

function toOffer(shape) {
  if (!shape) return null;
  if (shape.kind === 'lamp') return { kind: 'butter', cup: LAMP_CUP, fill: shape.fill, burn: butterOf() };
  return { kind: 'candle', rows: shape.rows, color: shape.color, burn: burnOf(shape.rows) };
}
/** Show the person's candle or lamp (or hide it with null), full. */
export function setOffer(shape) { const o = toOffer(shape); level = 1; mine.g.visible = !!o; if (o) mine.setOffer(o); }
/** Remaining fraction of the wax, 1 = untouched. */
export function setLevel(L) { level = Math.max(0, Math.min(1, L)); }

/** Show a place from outside while it is being chosen. */
export async function previewPlace(id) {
  wanted = TEMPLE[id];
  if (busy) return; busy = true;
  while (wanted && (place?.id !== wanted.id || active !== outside)) {
    const w = wanted; await fadeTo(1, active === outside ? 260 : 700);
    if (place?.id !== w.id) await buildPlace(w);
    switchTo(outside); const v = PLACES[w.id].view; rig.pos.copy(v.pos); rig.look.copy(v.look); rig.amp = 1;
    await fadeTo(0, 600);
  }
  busy = false;
}

/** Back to the hall's wide view (the wish screen). */
export async function toHall() {
  wanted = null; while (busy) await sleep(50);
  if (active !== hall) { await fadeTo(1, 600); switchTo(hall); }
  mine.g.visible = false; rig.amp = .006;
  if (rig.pos.distanceTo(WIDE.pos) > .01) { rig.pos.copy(WIDE.pos); rig.look.copy(WIDE.look); }
  await fadeTo(0, 800);
}

/** Walk into the place and end at the altar, ready to choose a candle. */
export async function travel(id) {
  const t = TEMPLE[id];
  wanted = null; while (busy) await sleep(50);
  if (place?.id !== id || active !== outside) {
    await fadeTo(1, 300); if (place?.id !== id) await buildPlace(t);
    switchTo(outside); const v = PLACES[id].view; rig.pos.copy(v.pos); rig.look.copy(v.look); rig.amp = 1; await fadeTo(0, 400);
  }
  const P = PLACES[id];
  const curve = new THREE.CatmullRomCurve3([rig.pos.clone(), ...P.walk], false, 'centripetal');
  const l0 = rig.look.clone(), a0 = rig.amp;
  await tween(10, (k) => { const e = ease(k); rig.pos.copy(curve.getPoint(e)); rig.look.lerpVectors(l0, P.doors, Math.min(1, e * 1.25)); rig.amp = a0 * (1 - Math.min(1, k * 3)); });
  await fadeTo(1, 900);
  applyTemple(t); switchTo(hall); rig.amp = .006;
  rig.pos.copy(WIDE.pos); rig.look.copy(WIDE.look);
  await fadeTo(0, 1000);
  const c = chooseView(); await moveCam(c.pos, c.look, 2.4);
}
export const skip = skipTweens;
/** Close in on the person's candle before lighting. */
export function closeUp() { const c = closeView(); return moveCam(c.pos, c.look, 2.6); }
/** Back from the close-up to the choosing view. */
export function backToChoose() { const c = chooseView(); return moveCam(c.pos, c.look, 1.6); }
/** Light the flame (animation only; the burn clock lives in the UI). */
export async function ignite() { lit = true; emberUntil = 0; smokeUntil = 0; await tween(1.6, (k) => { if (lit) mine.power = k < .18 ? k * .35 : Math.min(1.15, ease((k - .18) / .82) + Math.sin(k * Math.PI) * .22); }); }
/** Put the flame out with a thread of smoke. */
export async function snuff(done = false) {
  // Only visuals: settlement and persistence have already happened synchronously.
  lit = false; ending = done ? 'done' : 'out';
  if (done) { level = 0; mine.setLevel(0); }
  smokeUntil = clockTime + (done ? 3.4 : 4.8); emberUntil = clockTime + (done ? 2.5 : .35);
  const p0 = mine.power; await tween(done ? .55 : .09, (k) => { mine.power = p0 * (1 - k); }); mine.power = 0;
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, powerSaver ? 1 : quality === 'high' ? 1.75 : 1.25));
  composer.setPixelRatio(renderer.getPixelRatio());
  renderer.setSize(w, h, false); composer.setSize(w, h);
  renderer.shadowMap.enabled = !powerSaver;
  mine.g.traverse(o => { if (o.isLight && o.shadow) { o.shadow.mapSize.set(quality === 'high' ? 1024 : 512, quality === 'high' ? 1024 : 512); } });
  camera.aspect = w / h; camera.fov = w / h < .8 ? 44 : 32; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();
let clockTime = 0, lastRender = 0, sampleFrames = 0, slowFrames = 0;
const tmp = V3(0, 0, 0);
function frame(stamp = performance.now()) {
  requestAnimationFrame(frame);
  const interval = 1000 / (powerSaver ? 15 : phase === 'burning' || phase === 'result' ? 30 : 60);
  if (stamp - lastRender < interval - .6) return;
  const elapsed = stamp - lastRender;
  const dt = Math.min(elapsed / 1000, .1); lastRender = stamp;
  if (sampleFrames < 180 && phase !== 'travel' && phase !== 'burning' && phase !== 'result' && !powerSaver) {
    sampleFrames++; if (elapsed > 27) slowFrames++;
    if (sampleFrames === 180 && slowFrames > 45 && quality === 'high') { quality = 'balanced'; resize(); }
  }
  wind *= Math.exp(-dt * 2.8); clockTime += dt; const time = clockTime;
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]; tw.t += dt; const k = tw.skip ? 1 : Math.min(1, tw.t / tw.dur); tw.fn(k);
    if (k >= 1) { tweens.splice(i, 1); tw.res(); }
  }
  if (active === hall) {
    if (mine.g.visible && mine.offer) mine.setLevel(level);
    for (const m of flameMats) m.uniforms.uTime.value = time;
    const topY = ALTAR_Y + mine.top.y;
    mine.update(time, topY);
    for (const o of others) { o.f.tick(time, .65, .012, o.wax, o.g.position.y + o.f.flame.position.y); }
    if (time < smokeUntil && Math.random() < (ending === 'done' ? .3 : .7)) wickSmoke.puff(tmp.set(mine.top.x, topY + .004, mine.g.position.z), .002, ending === 'done' ? .003 : .009);
    wickSmoke.update(dt, time);
    if (Math.random() < .5) incenseSmoke.puff(incenseTips[Math.floor(Math.random() * 3)], .001, .01);
    incenseSmoke.update(dt, time);
    dust.visible = !powerSaver && !reducedMotion.matches;
    const dp = dust.geometry.attributes.position;
    for (let i = 0; i < dp.count; i++) { let y = dp.getY(i) + dt * .02; if (y > 3.8) y = .4; dp.setY(i, y); dp.setX(i, dp.getX(i) + Math.sin(time * .3 + i) * dt * .004); }
    dp.needsUpdate = true;
    banners.forEach((b, i) => { b.rotation.z = Math.sin(time * .4 + i * 2) * .012; });
  } else if (place) {
    for (const f of place.up) f(dt, time);
  }
  // A slow drift so the view breathes like a held camera; wider outside.
  const a = reducedMotion.matches ? 0 : rig.amp;
  camera.position.copy(rig.pos).add(tmp.set(Math.sin(time * .13) * a, Math.sin(time * .09) * a * .35, Math.cos(time * .11) * a * .5));
  camera.lookAt(rig.look);
  if (place) place.sky.position.copy(camera.position);
  renderPass.scene = active;
  offeringPass.enabled = active === hall && mine.g.visible;
  focusBlur.enabled = offeringPass.enabled && !powerSaver;
  bloom.enabled = !powerSaver;
  grade.uniforms.uTime.value = time % 10;
  composer.render();
}


// ---------- Start ----------
export const ready = (async () => {
  try { await Promise.race([document.fonts.load(`700 80px ${SERIF}`, '大雄宝殿'), new Promise((r) => setTimeout(r, 2500))]); } catch { /* fallback serif */ }
  applyTemple(TEMPLES[0]); switchTo(hall);
  rig.pos.copy(WIDE.pos); rig.look.copy(WIDE.look);
  frame();
  fadeTo(0, 1600);
})();
