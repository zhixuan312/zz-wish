// The 3D scene: ten places, each with the spot inside it where a lamp is lit, the person's lamp, flame and camera.
// Ported from the index.html prototype. It owns its render loop; the UI drives it only through the exported functions.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FocusBlur } from './FocusBlur.js';
import { buildHall } from './architecture.js';
import { createPineBatch } from './NaturalPines.js';
import { loadNaturalAssets,scans,isScanTexture,naturalResources,addScannedRock,addScannedStump } from './NaturalAssets.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLORS, PRESET_SHAPES, lanternHeightMetres, shapeMinutes } from '../../../shared/rules.ts';
import { GAUZE_CANDLE_REFERENCE } from './baked/gauzeTransmission.js';
import { acquireNativeAgX, NativeAgXPass } from './baked/nativeAgX.js';
import visitorFabric from './baked/visitor-fabric.json';
import { WickPlume, addGauzeVent, createGauzeSmokePath, gauzeFlameSize, gauzeRibGeometry, gauzeThroat } from './WickPlume.js';
import { createPineTray, createPineWax, waxContactShadow } from './PineWax.js';

// ---------- Renderer ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// Reading shader logs blocks until each program links; only development needs them.
renderer.debug.checkShaderErrors = import.meta.env.DEV;
if(import.meta.env.DEV){window.__renderer=renderer;window.__visualWalkAvailable=true;}
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const touchPrimary = matchMedia('(pointer: coarse)');
let quality = innerWidth < 720 ? 'balanced' : 'high', powerSaver = false, phase = 'wish';
renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 1.75 : 1.25));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 900);
const pmrem = new THREE.PMREMGenerator(renderer);
// Reflections near the lamp: a near-black room with warm candle points and one cool window,
// so brass reads as metal catching flames instead of a white studio.
const spotEnv = (() => {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ color: 0x0a0605, side: THREE.BackSide })));
  const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 2.6, .8) }), dot = new THREE.SphereGeometry(.09, 8, 6);
  for (let i = 0; i < 28; i++) { const a = -1.1 + i / 27 * 2.2, r = 4 + (i % 3) * .6; const m = new THREE.Mesh(dot, warm); m.position.set(Math.sin(a) * r, -.3 + (i % 3) * .35, -Math.cos(a) * r); s.add(m); }
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(.5, .22, .08) })); glow.position.set(0, 1.5, -6); s.add(glow);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(.06, .08, .12), side: THREE.DoubleSide })); win.position.set(-5, 2, 3); win.lookAt(0, 1, 0); s.add(win);
  const warmFloor = new THREE.Mesh(new THREE.CircleGeometry(2.5, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(.12, .05, .02) })); warmFloor.rotation.x = -Math.PI / 2; warmFloor.position.y = -1; s.add(warmFloor);
  return pmrem.fromScene(s, .02).texture;
})();

const geometrySamples=(()=>{
  if(!renderer.capabilities.isWebGL2)return 0;
  const gl=renderer.getContext();
  const color=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES));
  const depth=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,gl.SAMPLES));
  return color.includes(2)&&depth.includes(2)?2:0;
})();
// Geometry coverage is resolved before grading. Canvas antialiasing alone
// cannot smooth geometry drawn into the composer's offscreen HDR targets.
const sceneTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:geometrySamples});
const composer = new EffectComposer(renderer,sceneTarget);
const renderPass = new RenderPass(new THREE.Scene(), camera);
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.9);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 p = (vUv - .5) * vec2(1., 1.12);
      float v = 1. - smoothstep(.3, .9, length(p)); c.rgb *= mix(.55, 1., v);
      gl_FragColor = c; }`,
});
const outputPass=new OutputPass();
composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(outputPass); composer.addPass(grade);
let nativeAgXPass,nativeAgXReady;
function ensureNativeAgX(){
  return nativeAgXReady??=(async()=>{
    const lease=await acquireNativeAgX({url:'/color/native-agx-57-f16.bin.zst',precision:'float16'});
    const pass=new NativeAgXPass(lease);pass.enabled=false;
    composer.insertPass(pass,composer.passes.indexOf(outputPass));
    nativeAgXPass=pass;
    return pass;
  })().catch(error=>{nativeAgXReady=null;throw error;});
}

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
const ease = (k) => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;

const softTex = canvasTex(128, 128, (g, w, h) => {
  const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.4, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});
const petalTex = canvasTex(32, 32, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(16, 16, 13, 7, .6, 0, Math.PI * 2); g.fill(); });
const materialImage = async (path) => { const img=new Image(); img.src=path; await img.decode(); return img; };
const [graniteImage,timberImage]=await Promise.all([materialImage('/materials/weathered-granite.jpg'),materialImage('/materials/old-timber.jpg')]);
function stoneTex(seed, base = [24, 9, 15]) {
  const rnd = mulberry32(seed);
  const t = canvasTex(1024, 1024, (g, w, h) => {
    const n = 4, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.drawImage(graniteImage,rnd()*200,rnd()*200,900,900,i*s,j*s,s,s);
      g.globalCompositeOperation="multiply"; const l = 70 + rnd()*20; g.fillStyle = `hsl(${base[0]} ${base[1]}% ${l}%)`; g.fillRect(i * s, j * s, s, s);g.globalCompositeOperation="source-over";
      for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${rnd() < .5 ? '255,240,220' : '0,0,0'},${rnd() * .06})`; g.fillRect(i * s + rnd() * s, j * s + rnd() * s, 2 + rnd() * 5, 2 + rnd() * 5); }
    }
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 5;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const pavingTex = stoneTex(7, [30, 6, 46]);
const grainTex = canvasTex(1024,1024,(g,w,h)=>{
  g.drawImage(timberImage,0,0,w,h);
  const data=g.getImageData(0,0,w,h);
  for(let i=0;i<data.data.length;i+=4){const v=(data.data[i]*.3+data.data[i+1]*.59+data.data[i+2]*.11); const n=Math.max(90,Math.min(250,205+(v-105)*1.1));data.data[i]=data.data[i+1]=data.data[i+2]=n;}
  g.putImageData(data,0,0);
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
// Wax with a warm glow near the burning top, standing in for light scattered inside the wax.
function waxMaterial(color, o = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: o.roughness ?? .48, clearcoat: o.clearcoat ?? .18, clearcoatRoughness: .3,
    sheen: .6, sheenRoughness: .5, sheenColor: new THREE.Color(0xffc3a0), envMapIntensity: .35 });
  m.userData.u = { uTop: { value: 1 }, uGlow: { value: 0 }, uFall: { value: o.fall ?? 110 }, uGlowColor: { value: new THREE.Color(o.glow ?? 0xffa650) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.u);
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    // Light scattered inside the wax: strongest just under the flame, with a long faint tail down the body,
    // and brighter at the silhouette where the light passes through less wax on its way out.
    sh.fragmentShader = 'uniform float uTop; uniform float uGlow; uniform float uFall; uniform vec3 uGlowColor; varying vec3 vWPos;\n' +
      sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float waxDepth = max(uTop - vWPos.y, 0.0);
      float scatter = exp(-waxDepth * uFall) + .16 * exp(-waxDepth * uFall * .18);
      float thin = .55 + .9 * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 1.6);
      totalEmissiveRadiance += uGlowColor * uGlow * scatter * thin;
      diffuseColor.rgb *= mix(1.0, .82, smoothstep(.0, .25, waxDepth * uFall * .1));`);
  };
  return m;
}

// Flame: a camera-facing quad that stays upright, drawn by a shader (blue base, hot core, orange skirt).
const flameVS = `
uniform float uScale; uniform float uSeedU; uniform float uPineFlame;
#ifdef USE_INSTANCING
attribute float aSeed; attribute float aScale;
#endif
varying vec2 vUv; varying float vSeed; varying float vViewSlope;
void main(){
  vUv = uv; float sc = uScale; float sd = uSeedU; vec4 c = modelMatrix * vec4(0., 0., 0., 1.);
  #ifdef USE_INSTANCING
  sc = aScale; sd = aSeed; c = modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.);
  #endif
  vSeed = sd;
  vec3 eye = cameraPosition - c.xyz;
  vViewSlope = clamp(eye.y / max(length(eye.xz), .001), -.9, .9);
  vec3 r = normalize(vec3(viewMatrix[0][0], 0., viewMatrix[2][0]));
  vec3 wp = c.xyz + r * position.x * sc * mix(.5, .66, uPineFlame)
    + vec3(0., 1., 0.) * (position.y + .5) * sc * mix(1., .86, uPineFlame);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}`;
const flameFS = `
uniform float uTime; uniform float uPower; uniform float uWind; uniform float uSoft; uniform float uRadiance; uniform float uPineFlame;
varying vec2 vUv; varying float vSeed; varying float vViewSlope;
float h1(float n){ return fract(sin(n) * 43758.5453); }
float vn(vec2 x){ vec2 p = floor(x), f = fract(x); f = f * f * (3. - 2. * f); float n = p.x + p.y * 57.;
  return mix(mix(h1(n), h1(n + 1.), f.x), mix(h1(n + 57.), h1(n + 58.), f.x), f.y); }
// Integrate emission through a swaying volume. The blue base rims a cooler,
// fuel-rich interior just above the wick.
float pineRadius(float y) {
  return .234 * smoothstep(-.052, .18, y) * sqrt(1. - smoothstep(.18, 1.02, y));
}
vec4 pineFlameVolume(vec2 uv) {
  float t = uTime + vSeed * 6.;
  float h = .73 + .100 * vn(vec2(t * 2.9, vSeed));
  float sway = (vn(vec2(t * 1.56, vSeed * 2.1)) - .5) * .16 + uWind * .28;
  float flutter = .91 + .16 * vn(vec2(t * 6.7, vSeed + 11.));
  float span = max(.032, pineRadius((uv.y - .015) / h) * 1.36);
  vec3 emission = vec3(0.);
  float transmission = 1.;
  for (int i = 0; i < 7; ++i) {
    float z = (float(i) - 3.) * (span / 3.5);
    float y = (uv.y + z * vViewSlope * .66 - .015) / h;
    float v = clamp(y, 0., 1.);
    float x = uv.x - .5 - sway * v * v - .05 * v;
    float r = length(vec2(x, z * .92)) / max(pineRadius(y), .007);
    float envelope = (1. - smoothstep(.78, 1.03, r)) * smoothstep(-.042, .035, y)
      * (1. - smoothstep(.92, 1.02, y));
    float inner = (1. - smoothstep(.37, .72, r)) * (1. - smoothstep(.24, .56, y));
    float blue = (1. - smoothstep(.068, .19, y)) * (.45 + .55 * smoothstep(.25, .9, r));
    float skirt = smoothstep(.34, .84, r);
    float hottest = (v - .46) / .20;
    float hot = exp(-hottest * hottest);
    vec3 core = mix(vec3(4.25, 2.14, .61), vec3(6.65, 4.95, 2.45), hot);
    vec3 gold = mix(core, vec3(2.60, .82, .095), skirt);
    gold *= mix(.064, 1., 1. - inner);
    vec3 spectrum = mix(gold, vec3(.07, .24, .78) * (.32 + .68 * skirt) * (1. - .53 * inner), blue);
    float density = envelope * (.66 + .34 * skirt);
    float interval = span * density;
    emission += spectrum * transmission * interval * 1.44;
    transmission *= 1. - interval * .71;
  }
  return vec4(emission * uRadiance * flutter, 1. - transmission);
}
vec4 flameAt(vec2 sampleUv){
  if(sampleUv.x<0.||sampleUv.x>1.||sampleUv.y<=0.||sampleUv.y>=1.)return vec4(0.);
  float t = uTime * mix(1., .32, uSoft) + vSeed * 17.;
  float y = sampleUv.y; float x = (sampleUv.x - .5) * 2.;
  float sway = (vn(vec2(t * 1.1, vSeed * 9.)) - .5) * .32 + (vn(vec2(t * 5.3, vSeed * 3.)) - .5) * .1;
  x -= (sway + uWind) * pow(y, 1.6);
  x += (vn(vec2(y * 7. - t * 3.1, t * .43)) - .5) * .07 * y;
  float stretch = (1. + (vn(vec2(t * 3.7, vSeed * 5.)) - .5) * mix(.16,.055,uSoft)) * mix(.35, 1., uPower);
  // Pine's flame opens around the wick. Its darker root still needs
  // geometric coverage below the brightest part of the teardrop.
  float py = (y - mix(.26, .19, uPineFlame)) / stretch; float up = max(py, 0.);
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
  float root = uPineFlame * (1. - smoothstep(.12, .34, y));
  vec3 innerRoot = mix(vec3(.11, .055, .027), vec3(.23, .29, .50), smoothstep(.16, .8, abs(x) / wid));
  col = mix(col, innerRoot, root);
  float alpha = a * uPower;
  return vec4(col * (1.15 + core * 1.1) * (.85 + .15 * vn(vec2(t * 3.7, vSeed * 5.))), alpha);
}
void main(){
  if (uPineFlame > .5) {
    gl_FragColor = pineFlameVolume(vUv) * uPower;
    return;
  }
  vec2 dx=dFdx(vUv),dy=dFdy(vUv);
  vec4 a=flameAt(vUv+.25*(dx+dy)),b=flameAt(vUv+.25*(dx-dy));
  vec4 c=flameAt(vUv+.25*(-dx+dy)),d=flameAt(vUv-.25*(dx+dy));
  float alpha=.25*(a.a+b.a+c.a+d.a);
  vec3 premultiplied=.25*(a.rgb*a.a+b.rgb*b.a+c.rgb*c.a+d.rgb*d.a);
  gl_FragColor=vec4((alpha>0.?premultiplied/alpha:vec3(0.))*uRadiance,alpha);
}`;
function flameMaterial(instanced) {
  return new THREE.ShaderMaterial({ vertexShader: flameVS, fragmentShader: flameFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uWind: { value: 0 }, uPower: { value: instanced ? .52 : 0 }, uScale: { value: .06 }, uSeedU: { value: .37 }, uSoft: { value: 0 },uRadiance:{value:1},uPineFlame:{value:0} } });
}
const flameMats = [];

// Smoke: recycled soft sprites. `k` scales speed for outdoor sizes.
class Smoke {
  constructor(scene, n, color, maxOp, k = 1, map = softTex) {
    this.parts = []; this.maxOp = maxOp; this.k = k; this.rnd = mulberry32(n * 7);
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, opacity: 0, fog: true }));
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
      if (this.curl) { const w = time * .7 + p.age * 1.9; p.v.x += Math.sin(w) * .012 * k * dt * 6; p.v.z += Math.cos(w * 1.3) * .008 * k * dt * 6; }
      p.s.position.addScaledVector(p.v, dt);
      const sc = p.size * (1 + k * 5); p.s.scale.set(sc, sc * 1.6, 1);
      p.s.material.opacity = this.maxOp * Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k);
    }
  }
}

// ---------- The spot: where the lamp is lit ----------
// Each place has its own corner where people there light lamps: a niche by a gate, a cloister shelf,
// a cliff gallery. It is rebuilt per place around the origin: the lamp stands (or hangs) at x = z = 0,
// and the open side faces +z.
// One world per place: the walk in and the lamp are in the same scene.
const outside = new THREE.Scene();
// The offering is the focal plane. Blur the distant scene before compositing it,
// keeping the flame's soft procedural edge and the person's own outline intact.
const previewFill = new THREE.DirectionalLight(0xe4dbc2, 0); previewFill.position.set(1, 2, 2); previewFill.layers.enableAll(); outside.add(previewFill);
const previewFillTarget=new THREE.Object3D();outside.add(previewFillTarget);previewFill.target=previewFillTarget;
const gauzePreviewIntensity=2.5;
let gauzePreviewBlend=0, previewFloor=0, pinePreviewFill=0;
function aimGauzePreview(light,target,centre,eye){
  const offset=eye.clone().sub(centre).normalize().add(V3(0,.18,0)).normalize();
  light.position.copy(light.parent.worldToLocal(centre.clone().add(offset)));
  target.position.copy(target.parent.worldToLocal(centre.clone()));target.updateMatrixWorld(true);
}
const focusBlur = new FocusBlur();
class OfferingPass extends RenderPass {
  render(renderer, write, read, delta, mask) {
    camera.layers.set(1);
    super.render(renderer, write, read, delta, mask);
    camera.layers.set(0);
  }
}
const offeringPass = new OfferingPass(outside, camera);
offeringPass.clear = false; offeringPass.clearDepth = true;
composer.insertPass(focusBlur, 1); composer.insertPass(offeringPass, 2);

const patina = canvasTex(256, 256, (g, w, h) => {
  const rnd = mulberry32(19); g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) { const v = 90 + rnd() * 120; g.fillStyle = `rgba(${v},${v},${v},.35)`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 1 + rnd() * 5, 0, 6.3); g.fill(); }
}, false);
patina.wrapS = patina.wrapT = THREE.RepeatWrapping; patina.repeat.set(3, 3);
// Fine crazing in a celadon glaze.
const crackleTex = canvasTex(512, 512, (g, w, h) => {
  const rnd = mulberry32(23); g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(40,40,40,.5)'; g.lineWidth = 1.2;
  for (let i = 0; i < 160; i++) { let x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - .5) * 60; y += (rnd() - .5) * 60; g.lineTo(x, y); } g.stroke(); }
}, false);
// Holes punched in a pottery hood, as an alpha map (white = solid).
const holesTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#000';
  for (let row = 0; row < 4; row++) for (let i = 0; i < 9; i++) { const x = (i + (row % 2) * .5) / 9 * w, y = h * (.3 + row * .13); g.beginPath(); g.arc(x, y, 4.5 - row * .5, 0, 6.3); g.fill(); }
}, false);
// Actual photographed weave/normal/roughness. The photograph contributes its
// measured yarn luminance; the person's chosen colour remains the cloth dye.
const gauzeTex=new THREE.Texture(),gauzeNormal=new THREE.Texture(),gauzeRoughness=new THREE.Texture();
let visitorFabricReady;
async function ensureVisitorFabric(){
  if(!visitorFabricReady)visitorFabricReady=Promise.all(Object.entries(visitorFabric.maps).map(async([role,file])=>{
    const loaded=await new THREE.TextureLoader().loadAsync(`${file.path}?v=${file.sha256}`);
    const texture=role==='weave'?gauzeTex:role==='normal'?gauzeNormal:gauzeRoughness;
    texture.image=loaded.image;texture.colorSpace=role==='weave'?THREE.SRGBColorSpace:THREE.NoColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(1.28,.96);
    texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;loaded.dispose();
  })).catch(error=>{visitorFabricReady=null;throw error;});
  await visitorFabricReady;
}
// Paper in a wooden lattice: the paper is lit, the bars are dark.
const paperLatticeTex = canvasTex(256, 384, (g, w, h) => {
  g.fillStyle = '#efe2c8'; g.fillRect(0, 0, w, h);
  const rnd = mulberry32(37); for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(150,120,80,${rnd() * .08})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 4, 1); }
  g.fillStyle = '#3a2416'; for (let x = 0; x <= w; x += w / 3) g.fillRect(x - 5, 0, 10, h); for (let y = 0; y <= h; y += h / 4) g.fillRect(0, y - 5, w, 10);
});

const brass = new THREE.MeshStandardMaterial({ color: 0xc09454, metalness: 1, roughness: .34, roughnessMap: patina, envMapIntensity: 1.1 });
const darkBrass = new THREE.MeshStandardMaterial({ color: 0x7a5a32, metalness: 1, roughness: .42, roughnessMap: patina, envMapIntensity: .9 });
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xf6f2ea, roughness: .03, transparent: true, opacity: .07, envMapIntensity: 1.2, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
const clayMat = new THREE.MeshStandardMaterial({ color: 0x8a5838, roughness: .92, bumpMap: patina, bumpScale: .0007, envMapIntensity: .15 });
const greyStoneMat = new THREE.MeshStandardMaterial({ color: 0x77736a, roughness: .9, bumpMap: patina, bumpScale: .0009, envMapIntensity: .12 });
const lotusMat = new THREE.MeshPhysicalMaterial({ color: 0xeadcd2, roughness: .32, clearcoat: .6, clearcoatRoughness: .2, envMapIntensity: .5, sheen: .5, sheenColor: new THREE.Color(0xffd6d0) });
// A lotus petal: pointed, cupped across, its tip curling a little outward. Concave side faces -z.
function petalGeo(w,h,cup){
  const columns=16,rows=20,vertices=[],uv=[],index=[];
  for(let side=0;side<2;side++)for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++){
    const u=i/columns-.5,v=j/rows,width=Math.pow(Math.max(0,Math.sin(Math.PI*v)),.65)*(1-.25*v);
    vertices.push(u*w*width,v*h,-cup*(1-4*u*u)*width+h*.22*v*v+(side?-.0008:.0008));uv.push(i/columns,v);
  }
  const layer=(columns+1)*(rows+1);
  for(let side=0;side<2;side++)for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){
    const a=side*layer+j*(columns+1)+i,b=a+columns+1;
    if(side)index.push(a,b,b+1,a,b+1,a+1);else index.push(a,b+1,b,a,a+1,b+1);
  }
  for(let j=0;j<rows;j++)for(const i of [0,columns]){const a=j*(columns+1)+i,b=a+columns+1;index.push(a,a+layer,b+layer,a,b+layer,b);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();return g;
}
const oilMat = new THREE.MeshPhysicalMaterial({ color: 0x2c1a08, roughness: .04, clearcoat: 1, envMapIntensity: .9 });
const lacquerBlack = new THREE.MeshPhysicalMaterial({ color: 0x140d0a, roughness: .36, clearcoat: .6, envMapIntensity: .4 });
const lampWood = new THREE.MeshStandardMaterial({ color: 0x5a3a24, map: grainTex, roughness: .66, envMapIntensity: .2 });
const cordMat = new THREE.MeshStandardMaterial({ color: 0x9a1810, roughness: .8 });
function visitorRibMaterial(color){
  const material=lampWood.clone(),cloth=new THREE.Color(color),maximum=Math.max(.0001,cloth.r,cloth.g,cloth.b);
  const throughput=new THREE.Color().setRGB(...[cloth.r,cloth.g,cloth.b].map(c=>.06*Math.pow(c/maximum,.7)));
  material.roughness=.9;material.envMapIntensity=.1;
  // An unlit or ended shade is backlit by nothing, so its bamboo ribs used to
  // flatten into a red silhouette. Give the ribs a small constant term of their
  // own colour: enough to count them at 100% crop, small enough that a burning
  // shade still reads as cloth glowing from within.
  material.emissive=new THREE.Color(color).multiplyScalar(.16);
  material.emissiveIntensity=1;
  material.onBeforeCompile=shader=>{
    shader.uniforms.uClothThroughput={value:throughput};
    shader.fragmentShader='uniform vec3 uClothThroughput;\n'+shader.fragmentShader.replace('#include <lights_fragment_begin>',THREE.ShaderChunk.lights_fragment_begin.replace('getPointLightInfo( pointLight, geometryPosition, directLight );',`getPointLightInfo( pointLight, geometryPosition, directLight );
      {float flameDistance2=dot(pointLight.position-geometryPosition,pointLight.position-geometryPosition);
      if(flameDistance2<1.)directLight.color*=uClothThroughput*flameDistance2/(flameDistance2+.0016);}`));
  };
  material.userData.lampOwned=true;
  material.customProgramCacheKey=()=> 'visitor-gauze-transmitted-ribs-2';return material;
}

// A shade lit from inside: paper, gauze or pottery that glows most where the flame is near.
function shellMaterial(color, o = {}) {
  const Material=o.cloth?THREE.MeshPhysicalMaterial:THREE.MeshStandardMaterial;
  const m = new Material({ color, roughness: o.rough ?? .85, map: o.map ?? null, alphaMap: o.alphaMap ?? null, alphaTest: o.alphaMap ? .5 : 0, side: THREE.DoubleSide, envMapIntensity: .15 });
  if(o.cloth){
    m.normalMap=gauzeNormal;m.normalScale.setScalar(o.winterWeave ? .67 : .38);m.roughnessMap=gauzeRoughness;
    m.sheen=.45;m.sheenRoughness=.85;m.sheenColor.copy(m.color);m.specularIntensity=.3;
  }
  m.userData.u = { uFlame: { value: V3(0, 0, 0) }, uGlow: { value: 0 }, uGlowColor: { value: new THREE.Color(o.glow ?? 0xffa050) }, uReach: { value: o.reach ?? 9 }, uBase: { value: o.base ?? .2 } };
  if(o.cloth){
    m.userData.cloth=true;
    Object.assign(m.userData.u,{uClothPhysical:{value:0},uClothIntensity:{value:0},uClothSourceRGB:{value:new THREE.Color()},uClothEmitterRadius:{value:.004},uClothTransmissionWeight:{value:.65},uClothReflectionWeight:{value:.35}});
  }
  m.userData.strength = o.strength ?? 1;
  m.userData.lampOwned=true;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.u);
    sh.vertexShader = 'varying vec3 vSPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform vec3 uFlame; uniform float uGlow; uniform vec3 uGlowColor; uniform float uReach; uniform float uBase; varying vec3 vSPos;\n'+(o.cloth?'uniform float uClothPhysical,uClothIntensity,uClothEmitterRadius,uClothTransmissionWeight,uClothReflectionWeight;uniform vec3 uClothSourceRGB;\n':'') + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float near = exp(-distance(vSPos, uFlame) * uReach);
      float transmissionShadow=1.,physicalTransmissionShadow=1.;
      #ifdef USE_STATIC_LAMP_SHADOW
        physicalTransmissionShadow*=getStaticLampVisibility(vSPos,inverseTransformDirection(normal,viewMatrix));
      #endif
      ${o.cloth?`#if defined(USE_SHADOWMAP) && NUM_POINT_LIGHT_SHADOWS > 0
        PointLightShadow ribShadow=pointLightShadows[0];
        physicalTransmissionShadow*=getPointShadow(pointShadowMap[0],ribShadow.shadowMapSize,ribShadow.shadowBias,ribShadow.shadowRadius,vPointShadowCoord[0],ribShadow.shadowCameraNear,ribShadow.shadowCameraFar);
        transmissionShadow=mix(.28,1.,physicalTransmissionShadow);
      #endif`:''}
      vec3 transmitted=${o.cloth?'mix(diffuseColor.rgb,pow(max(diffuseColor.rgb,vec3(0.)),vec3(.55)),.32)':'diffuseColor.rgb'};
      float clothSignedIncidence=${o.cloth?'dot(normal,normalize((viewMatrix*vec4(uFlame,1.)).xyz+vViewPosition))':'1.'};
      float clothIncidence=abs(clothSignedIncidence);
      ${o.cloth?`if(uClothPhysical>.5){
        // Thin-cloth diffuse transmission from the actual candle. The source
        // uses the same translucent weight. Emissive accumulation here is only
        // Three's outgoing-radiance accumulator; no independent glow gain.
        float sourceDistance2=dot(uFlame-vSPos,uFlame-vSPos);
        float irradiance=uClothIntensity*clothIncidence/max(sourceDistance2,uClothEmitterRadius*uClothEmitterRadius);
        totalEmissiveRadiance+=uClothSourceRGB*diffuseColor.rgb*(uClothTransmissionWeight/3.14159265359)*irradiance*physicalTransmissionShadow*(1.-step(0.,clothSignedIncidence));
      }else` : ''}{
        totalEmissiveRadiance += uGlowColor * uGlow * (uBase + near * clothIncidence) * transmitted * transmissionShadow;
      }`);
    if(o.cloth){
      sh.fragmentShader=sh.fragmentShader.replace('#include <lights_fragment_end>','#include <lights_fragment_end>\nif(uClothPhysical>.5){reflectedLight.directDiffuse*=uClothReflectionWeight;reflectedLight.indirectDiffuse*=uClothReflectionWeight;}');
      sh.uniforms.uWeaveMean={value:visitorFabric.meanLinearLuminance};
      sh.fragmentShader='uniform float uWeaveMean;\n'+sh.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
        vec3 photographedWeave=texture2D(map,vMapUv).rgb;
        float yarn=dot(photographedWeave,vec3(.2126,.7152,.0722))/uWeaveMean;
        diffuseColor.rgb*=clamp(${o.winterWeave ? '1. + (yarn - 1.) * 1.42' : 'yarn'},.66,1.24);
      #endif`);
    }
  };
  m.customProgramCacheKey=()=>`translucent-shell-${o.cloth?'woven':'plain'}-${o.winterWeave?'winter':'3'}`;
  return m;
}
const lathe = (pts, seg = 64) => new THREE.LatheGeometry(pts.map(([r, y]) => V2(r, y)), seg);
const solid = (g, geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = !m.transparent; o.receiveShadow = true; g.add(o); return o; };

// Flame parts shared by every lit thing. Lamps left by others carry no light of their own.
function flameParts(g, o = {}) {
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(.0008, .001, .008, 8), new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: 1 })); wick.geometry.translate(.0007, .004, 0); g.add(wick);
  const ember = new THREE.Mesh(new THREE.SphereGeometry(.0009, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, .7, .15) })); g.add(ember);
  const fm = flameMaterial(false); fm.uniforms.uSeedU.value = Math.random() * 10; flameMats.push(fm);
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fm); flame.frustumCulled = false; g.add(flame);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0xff8a3a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.set(.2, .26, 1); g.add(halo);
  const light = o.light === false ? null : new THREE.PointLight(o.color ?? 0xffba78, 0, 0, 2); if (light) g.add(light);
  const size = o.size ?? 1;
  return { wick, ember, fm, flame, halo, light, size, soft: false,
    place(x, y, z = 0) { wick.position.set(x, y - .004, z); ember.position.set(x, y + .004, z); flame.position.set(x, y + .002, z); halo.position.set(x, y + .03 * this.size, z); light?.position.set(x, y + .019 * this.size, z); },
    tick(time, power, lightMax, wax, topY) {
      const seed = fm.uniforms.uSeedU.value;
      const f = this.soft ? .975 + .025 * noise2((time + seed * 17) * .48, seed * 5) : .85 + .15 * noise2((time + seed * 17) * 3.7, seed * 5);
      fm.uniforms.uSoft.value = this.soft ? 1 : 0;
      fm.uniforms.uTime.value = time; fm.uniforms.uPower.value = power; fm.uniforms.uScale.value = .038 * this.size * (.85 + .15 * f) * Math.max(.15, Math.sqrt(power));
      const pine = fm.uniforms.uPineFlame.value > .5;
      const field = pine ? .90 + .10 * noise2(time * 6.7 + seed * 17, seed * 5)
        : this.soft ? 1 : f;
      if (light) light.intensity = lightMax * power * field;
      halo.material.opacity = .025 * power * f; ember.visible = power > .02;
      for (const m of wax) { m.userData.u.uTop.value = topY; m.userData.u.uGlow.value = 1.1 * power * field; }
      return field;
    } };
}

// ---------- The lamps ----------
// Each place's own lamp. A builder returns the vessel and what the burn needs:
// wax lamps give a seat for the candle; oil lamps the inside of the vessel; shaded lamps their shells.
// frame: the height of the whole lamp and where its middle is, for framing the camera.
const cupVolume = (r, y0, y1, n = 40) => { const ys = [y0], cum = [0], dy = (y1 - y0) / n; let v = 0; for (let i = 1; i <= n; i++) { const y = y0 + dy * i, rr = r(y - dy / 2); v += Math.PI * rr * rr * dy; ys.push(y); cum.push(v); } return { ys, cum, vol: v, r }; };
// A profile from the person's rows, scaled, as [radius, height] pairs from the bottom up.
const scaled = (rows, s) => rows.map((q) => [Math.max(.002, q.r * s), q.y * s]);
// A shade is scaled up from the drawing, but never below what still holds its flame.
const shadeScale = (rows, s, minR) => Math.max(s, minR / Math.max(...rows.map((q) => q.r)));
const radiusAt = (P, y) => { let i = 1; while (i < P.length - 1 && P[i][1] < y) i++; const [r0, y0] = P[i - 1], [r1, y1] = P[i]; return r0 + (r1 - r0) * Math.min(1, Math.max(0, (y - y0) / (y1 - y0 || 1))); };
// A dish turned from an outline: the outside follows the drawing, the inside is a wall's thickness in, above a floor.
function dish(rows, s, m, o = {}) {
  const P = scaled(rows, s), top = P[P.length - 1][1], wall = o.wall ?? .0028, floor = Math.min(.006, top * .22);
  const inner = (y) => Math.max(.0015, radiusAt(P, y) - wall);
  const pts = [[0, 0], ...P, [inner(top), top]];
  for (let i = P.length - 1; i >= 0; i--) if (P[i][1] > floor && P[i][1] < top) pts.push([inner(P[i][1]), P[i][1]]);
  pts.push([inner(floor), floor], [0, floor]);
  const geo = lathe(pts, 72);
  if (o.spout) {
    // A pinched spout on +x where the wick lies.
    const p = geo.attributes.position, R = P[P.length - 1][0];
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = Math.exp(-a * a * 9) * Math.min(1, p.getY(i) / Math.max(top, .001)); p.setXYZ(i, x + k * R * .4 * Math.cos(a) - Math.abs(z) * k * .3, p.getY(i) + k * .003, z * (1 - k * .5)); }
    geo.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(geo, m); mesh.castShadow = !m.transparent; mesh.receiveShadow = true;
  return { mesh, top, rim: P[P.length - 1][0], vessel: cupVolume(inner, floor, top * .94) };
}
// The person's glaze: celadon and white porcelain shine, clay stays matte.
function dishMaterial(color, glass) {
  if (glass) return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xd8962e), .35), roughness: .05, transparent: true, opacity: .4, clearcoat: 1, envMapIntensity: 1.5, depthWrite: false, side: THREE.DoubleSide });
  const clay = color === 0x8a5838;
  return new THREE.MeshPhysicalMaterial({ color, roughness: clay ? .9 : .14, bumpMap: clay ? patina : crackleTex, bumpScale: clay ? .0007 : .00012, clearcoat: clay ? 0 : 1, clearcoatRoughness: .06, envMapIntensity: clay ? .15 : 1, side: THREE.DoubleSide });
}
const WAX_LAMPS = new Set(['niche', 'pineWax', 'lantern', 'lotus']);
// Metal, glaze and wax near a flame reflect a dark room with warm points, not the open sky.
const nearMaterials = new WeakSet();
function warmReflections(o) { for (const m of [o.material].flat()) if (m && 'envMap' in m && !nearMaterials.has(m)) { nearMaterials.add(m); m.envMap = spotEnv; m.needsUpdate = true; } }
function actualHallEnvironment(material,texture){
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
  material.envMap=texture;material.envMapIntensity=1;
  material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer);
    // Captured hall radiance already contains the ambient contribution.
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',THREE.ShaderChunk.lights_fragment_begin)
      .replace('irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );','/* Ambient is sampled from the actual hall. */');
  };
  material.customProgramCacheKey=()=>key()+'-actual-hall-environment-1';material.needsUpdate=true;
}
const presetOf = (kind) => ({ rows: PRESET_SHAPES[kind][0].rows, color: COLORS[kind][0] });
const LAMPS = {
  // A small rough stone dish in a niche.
  niche() {
    const g = new THREE.Group();
    solid(g, lathe([[0, 0], [.042, 0], [.05, .004], [.052, .013], [.047, .015], [.043, .007], [0, .007]], 40), greyStoneMat);
    return { g, kind: 'wax', seat: { y: .007, maxR: .045, maxH: .16 }, frame: { h: .2, cy: .08 }, lightMax: .3 };
  },
  pineWax({ refined = false, sculptNormal = null, sunShade = null } = {}) {
    const g = new THREE.Group();
    const seat = { y: .008, maxR: refined ? .039 : .045, maxH: .16, traceRadius: refined ? .046 : .056 };
    const holder = refined ? createPineTray(seat, sunShade)
      : new THREE.Mesh(lathe([[0, 0], [.057, 0], [.067, .004], [.069, .009], [.065, .012],
        [.06, .011], [.056, seat.y], [0, seat.y]], 56), greyStoneMat);
    holder.receiveShadow = true;
    g.add(holder);
    // The nearly vertical flame point produced two hard discs. Keep contact
    // under the wax and dish with short, soft falloff at their actual bases.
    holder.castShadow = false;
    const contactRadius = refined ? .064 : .082;
    const shelfContact = waxContactShadow(contactRadius, refined ? .64 : .53);
    g.add(shelfContact);
    const pineWax = createPineWax(seat, waxMaterial, { refined, sculptNormal, sunShade });
    pineWax.group.visible = false;
    g.add(pineWax.group);
    const setShape = shape => {
      pineWax.setShape(shape);
      if (!refined) return;
      const bounds = pineWax.profileBounds();
      const waxRadius = Math.max(-bounds.min.x, bounds.max.x);
      const holderScale = THREE.MathUtils.clamp((waxRadius + .007) / seat.traceRadius, .76, 1);
      holder.scale.set(holderScale, 1, holderScale);
      shelfContact.scale.setScalar(contactRadius * holderScale);
    };
    return { g, kind: 'wax', seat, pineWax, holder, shelfContact, setShape, sunShade,
      frame: { h: .2, cy: .08 }, lightMax: .05, light: 0xffbc82, flame: refined ? .91 : 1.13 };
  },
  // A brass-framed storm lantern hanging from a hook; the candle stands inside behind glass.
  lantern() {
    const g = new THREE.Group(), W = .075, top = -.07, bottom = -.31;
    solid(g, new THREE.TorusGeometry(.016, .0022, 8, 24), brass, 0, -.004, 0);
    solid(g, new THREE.CylinderGeometry(.012, .02, .03, 16), brass, 0, -.035, 0);
    const cap = solid(g, new THREE.ConeGeometry(W * 1.42, .045, 4, 1, true), brass, 0, top + .012, 0); cap.rotation.y = Math.PI / 4;
    solid(g, new THREE.BoxGeometry(W * 2 + .012, .008, W * 2 + .012), brass, 0, top - .012, 0);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) solid(g, new THREE.BoxGeometry(.007, top - bottom, .007), brass, x * W, (top + bottom) / 2, z * W);
    for (const [x, z, ry] of [[0, W, 0], [0, -W, 0], [W, 0, Math.PI / 2], [-W, 0, Math.PI / 2]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, top - bottom - .016), glassMat); p.position.set(x, (top + bottom) / 2, z); p.rotation.y = ry; p.renderOrder = 2; g.add(p); }
    solid(g, new THREE.BoxGeometry(W * 2 + .016, .012, W * 2 + .016), brass, 0, bottom, 0);
    solid(g, new THREE.BoxGeometry(W * 2 - .01, .004, W * 2 - .01), darkBrass, 0, bottom + .008, 0);
    for (const s of [-1, 1]) solid(g, new THREE.BoxGeometry(.004, .03, .004), brass, s * W * .9, bottom - .02, 0);
    return { g, kind: 'wax', seat: { y: bottom + .01, maxR: .055, maxH: .17 }, frame: { h: .36, cy: -.17 }, lightMax: .34, hang: true };
  },
  // A lotus seat: two rings of petals around a cup.
  lotus() {
    const g = new THREE.Group();
    solid(g, lathe([[0, 0], [.07, 0], [.072, .01], [.05, .016], [.04, .03], [0, .03]], 48), lotusMat);
    for (const [n, r, y, lean, s] of [[12, .046, .016, .62, 1], [10, .032, .026, .32, .84]]) for (let i = 0; i < n; i++) {
      const a = (i + (s < 1 ? .5 : 0)) / n * Math.PI * 2, m = new THREE.Mesh(petalGeo(.05 * s, .052 * s, .017 * s), lotusMat);
      m.position.set(Math.cos(a) * r, y, Math.sin(a) * r); m.rotation.set(lean, Math.PI / 2 - a, 0, 'YXZ'); m.castShadow = m.receiveShadow = true; g.add(m);
    }
    solid(g, lathe([[0, .03], [.032, .03], [.036, .05], [.033, .052], [.028, .04], [0, .04]], 40), lotusMat);
    return { g, kind: 'wax', seat: { y: .04, maxR: .05, maxH: .16 }, frame: { h: .22, cy: .09 }, lightMax: .3 };
  },
  // A glazed dish on the cloister shelf; the wick lies in the oil and rests on the rim.
  celadon(o = presetOf('oil')) {
    const g = new THREE.Group(), d = dish(o.rows, 1, dishMaterial(o.color)); g.add(d.mesh);
    return { g, kind: 'oil', vessel: d.vessel, wick: { at: V3(d.rim * .86, d.top + .004, 0) }, frame: { h: Math.max(.08, d.top + .05), cy: d.top * .5 }, lightMax: .24, flame: .85 };
  },
  // A clay dish with a pinched spout where the short wick lies.
  clay(o = presetOf('oil')) {
    const g = new THREE.Group(), d = dish(o.rows, 1, dishMaterial(o.color), { spout: true }); g.add(d.mesh);
    return { g, kind: 'oil', vessel: d.vessel, wick: { at: V3(d.rim * 1.32, d.top + .006, 0) }, frame: { h: Math.max(.08, d.top + .05), cy: d.top * .5 }, lightMax: .24, flame: .8 };
  },
  // The person's dish raised on a brass foot, a brass wick tube in the middle and a glass chimney over the flame.
  chimney(o = presetOf('oil')) {
    const g = new THREE.Group(), foot = .03;
    solid(g, lathe([[0, 0], [.045, 0], [.047, .005], [.03, .012], [.014, .02], [.012, .026], [.02, foot], [0, foot]], 48), brass);
    const d = dish(o.rows, 1, dishMaterial(o.color)); d.mesh.position.y = foot; g.add(d.mesh);
    const wy = foot + d.top + .01;
    solid(g, new THREE.CylinderGeometry(.004, .005, wy - foot - .006, 12), brass, 0, (wy + foot + .006) / 2, 0);
    solid(g, new THREE.TorusGeometry(.024, .0018, 8, 32).rotateX(Math.PI / 2), brass, 0, wy - .004, 0);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; solid(g, new THREE.BoxGeometry(.002, .012, .002), brass, Math.cos(a) * .024, wy - .01, Math.sin(a) * .024); }
    const ch = new THREE.Mesh(lathe([[.022, wy - .004], [.024, wy + .01], [.034, wy + .035], [.034, wy + .05], [.022, wy + .08], [.019, wy + .12]], 48), glassMat); ch.renderOrder = 3; g.add(ch);
    const vessel = { ...d.vessel, ys: d.vessel.ys.map((y) => y + foot), r: (y) => d.vessel.r(y - foot) };
    return { g, kind: 'oil', vessel, wick: { at: V3(0, wy, 0) }, frame: { h: wy + .12, cy: wy * .6 }, lightMax: .3, flame: .9 };
  },
  // A small dish of tinted glass; the wick floats on the oil.
  glass(o = presetOf('oil')) {
    const g = new THREE.Group(), d = dish(o.rows, 1, dishMaterial(o.color, true), { wall: .0018 }); d.mesh.renderOrder = 2; d.mesh.castShadow = false; g.add(d.mesh);
    return { g, kind: 'oil', vessel: d.vessel, wick: { float: .005 }, oilBody: true, frame: { h: Math.max(.08, d.top + .04), cy: d.top * .5 }, lightMax: .24, flame: .78 };
  },
  // A pottery hood pierced with small holes, over a clay cup; its outline is the person's.
  hood(o = presetOf('shade')) {
    const g = new THREE.Group(), P = scaled(o.rows, shadeScale(o.rows, 1.5, .045)), r0 = P[0][0], top = P[P.length - 1][1];
    solid(g, lathe([[0, 0], [r0 + .012, 0], [r0 + .016, .012], [r0 + .01, .014], [r0 + .006, .006], [0, .006]], 48), clayMat);
    solid(g, lathe([[0, .006], [.018, .006], [.022, .026], [.019, .028], [0, .022]], 32), clayMat);
    const shell = shellMaterial(o.color, { alphaMap: holesTex, glow: 0xff9040, reach: 18, rough: .95, base: .02, strength: .3 });
    solid(g, lathe(P.map(([r, y]) => [r, y + .012]), 48), shell);
    solid(g, new THREE.SphereGeometry(.012, 16, 10), clayMat, 0, top + .016, 0);
    return { g, kind: 'shade', shells: [shell], wick: { at: V3(0, .03, 0) }, frame: { h: top + .03, cy: top * .48 }, lightMax: .6, flame: .8, light: 0xffa048 };
  },
  // A gauze lantern hanging under the eaves, ribbed with bamboo, a tassel below; its outline is the person's.
  gauze(o = presetOf('shade')) {
    const topCx=o.rows[o.rows.length-1].cx;
    // The shade grows with the burning time the person chose: ten minutes
    // hangs 0.35 m, a full day 0.56 m, and the ceiling beam clears both. The
    // drawn outline keeps its proportions inside that envelope.
    const width=Math.max(...o.rows.map(row=>row.r+Math.abs(row.cx-topCx)));
    const envelope=lanternHeightMetres(shapeMinutes({ rows: o.rows })) / .56;
    const size=o.liveBaked?envelope*Math.min(.56/Math.max(.0001,o.rows.at(-1).y),.21/Math.max(.0001,width)):shadeScale(o.rows,3.8,.02);
    const lacquer=o.liveBaked?lacquerBlack.clone():lacquerBlack,suspension=o.liveBaked?cordMat.clone():cordMat;
    if(o.liveBaked){
      lacquer.userData.lampOwned=true;suspension.userData.lampOwned=true;suspension.color.setHex(0x746041);suspension.roughness=.95;
      // The visitor's lacquer rim faces the bright hall, and its clearcoat caught the
      // vent's specular as the walk swept past: the shade's measured mean brightness
      // rose 31% in one frame and fell back. A matte finish spreads that highlight
      // instead of concentrating it, without dimming the rim's own colour.
      lacquer.roughness=Math.max(lacquer.roughness,.9);lacquer.clearcoat=0;lacquer.envMapIntensity=Math.min(lacquer.envMapIntensity??1,.25);
    }
    const g = new THREE.Group(), P = scaled(o.rows,size), H = P[P.length - 1][1], y0 = -.066 - H;
    const centerAt=y=>{const q=ringAt(o.rows,Math.max(0,Math.min(H,(y-y0)))/size);return(q.cx-topCx)*size;};
    const bottomCx=centerAt(y0);
    const ribs=o.liveBaked?visitorRibMaterial(o.color):lampWood;
    // Cloth and its supporting ribs must follow the same profile. Previously
    // straight cloth panels crossed the curved ribs between the drawn rows.
    const outline=new THREE.CatmullRomCurve3(P.map(([r,y])=>V3(r,y0+y,0)));
    const prof=outline.getPoints(Math.max(64,P.length*2)).map(p=>[Math.max(.002,p.x),p.y]);
    const rTop=prof.at(-1)[0],rBot=prof[0][0];
    const smokeProfile=prof.map(([r,y])=>[r,y,centerAt(y)]);
    solid(g, new THREE.CylinderGeometry(o.liveBaked?.0025:.0015, o.liveBaked?.0025:.0015, .06, 8), suspension, 0, -.03, 0);
    const vent=addGauzeVent(g,{radius:rTop,topY:prof.at(-1)[1],material:lacquer,cordMaterial:suspension,cordRadius:o.liveBaked?.0025:.0015});
    const shell = shellMaterial(o.color, { map: gauzeTex, glow: 0xffb070, reach: 18, rough: .82, base: .025, strength: 1.05, cloth:true, winterWeave:o.winterWeave });
    const fabric=lathe(prof,96),fp=fabric.attributes.position;
    for(let i=0;i<fp.count;i++){
      const x=fp.getX(i),z=fp.getZ(i),y=fp.getY(i),r=Math.hypot(x,z),a=Math.atan2(z,x),q=(y-y0)/H;
      // A stretched cloth panel bows gently inward between the bamboo strips.
      // Its seam remains above the strip; the strip never paints the outside.
      const sag=gauzeThroat(r).sag*Math.sin(a*6)**2*Math.sin(Math.PI*q)*(.85+.15*Math.sin(a*5+q*2));
      const wovenRelief = o.winterWeave
        ? .002 * Math.sin(a * 6) ** 2 * Math.sin(q * Math.PI) * Math.sin(q * 9 + a * 3)
        : 0;
      const k=Math.max(.001,r-sag+wovenRelief)/r;fp.setXYZ(i,x*k+centerAt(y),y,z*k);
    }
    fabric.computeVertexNormals();
    const cloth=solid(g,fabric,shell);cloth.castShadow=false;cloth.userData.visitorCloth=true;
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, rib = new THREE.Mesh(gauzeRibGeometry(smokeProfile,a),ribs); rib.castShadow = true; rib.userData.visitorRib=true;g.add(rib); }
    // The bottom stays open. Three thin risers carry the small internal cup
    // from this bearing ring, leaving real paths for warm light around it.
    const bottomOpening=Math.max(.003,rBot-.008);
    const bottomRing=solid(g,lathe([[bottomOpening,y0],[rBot+.004,y0],[rBot+.008,y0-.01],[rBot+.004,y0-.018],[bottomOpening,y0-.018],[bottomOpening,y0]],48),lacquer,bottomCx);
    bottomRing.userData.gauzeTransportRole='bottom-ring';
    solid(g, new THREE.CylinderGeometry(.002, .002, .05, 6), cordMat, bottomCx, y0 - .043, 0);
    solid(g,new THREE.SphereGeometry(.0045,12,8),cordMat,bottomCx,y0-.066,0);
    for(let i=0;i<28;i++){
      const a=i*2.399,spread=.0025+Math.sqrt(i/28)*.006,length=.073+.016*Math.sin(i*1.7);
      const x=Math.cos(a)*spread,z=Math.sin(a)*spread;
      const strand=new THREE.CatmullRomCurve3([V3(bottomCx+x*.3,y0-.069,z*.3),V3(bottomCx+x*.75,y0-.105,z*.75),V3(bottomCx+x,y0-.069-length,z)]);
      solid(g,new THREE.TubeGeometry(strand,6,.00048,3,false),cordMat);
    }
    // The real wick sits in the lower-middle body, rather than in its bottom
    // throat. The existing suspension fit still preserves the world flame point.
    const wickY=y0+H*.32,wick=V3(centerAt(wickY+.004)-.0007,wickY,0),wickTip=wick.clone().add(V3(.0007,.004,0));
    const insideAt=y=>{
      let i=1;while(i<prof.length-1&&prof[i][1]<y)i++;
      const a=prof[i-1],b=prof[i],k=THREE.MathUtils.clamp((y-a[1])/(b[1]-a[1]||1),0,1),r=THREE.MathUtils.lerp(a[0],b[0],k),hardware=gauzeThroat(r);
      return Math.max(.0001,r-hardware.inset-hardware.ribRadius);
    };
    const cupHeight=Math.min(.012,H*.12),cupTop=wickY-Math.min(.002,H*.025),cupBottom=cupTop-cupHeight;
    const cupFree=Math.min(insideAt(cupBottom),insideAt(cupTop),...prof.filter(([,y])=>y>cupBottom&&y<cupTop).map(([,y])=>insideAt(y)));
    const cupFloor=Math.min(.003,cupHeight*.25),cupShoulder=Math.min(.002,cupHeight*.2);
    // An east-offset cup leaves the western foreground inside the real light
    // opening. Its short wick leans from the near rim to the fixed flame tip.
    const cupRadius=Math.min(.009,cupFree*.75),cupOffset=Math.min(.012,Math.max(0,cupFree-cupRadius-.001)),cup=lathe([[0,cupBottom],[cupRadius*.8,cupBottom],[cupRadius,cupBottom+cupShoulder],[cupRadius,cupTop],[cupRadius*.82,cupTop],[cupRadius*.72,cupBottom+cupFloor],[0,cupBottom+cupFloor]],24),cp=cup.attributes.position;
    for(let i=0;i<cp.count;i++)cp.setX(i,cp.getX(i)+centerAt(cp.getY(i))+cupOffset);cup.computeVertexNormals();solid(g,cup,clayMat).userData.gauzeTransportRole='clay-cup';
    for(let i=0;i<3;i++){
      const a=i*Math.PI*2/3,points=Array.from({length:16},(_,j)=>{
        const t=j/15,y=THREE.MathUtils.lerp(y0+.0004,cupBottom+.0004,t),r=j===0?bottomOpening+.003:Math.min(THREE.MathUtils.lerp(bottomOpening+.003,cupRadius*.65,t),insideAt(y)*.92);
        return V3(centerAt(y)+cupOffset*t+Math.cos(a)*r,y,Math.sin(a)*r);
      });
      const path=new THREE.CurvePath();for(let j=1;j<points.length;j++)path.add(new THREE.LineCurve3(points[j-1],points[j]));
      const riser=solid(g,new THREE.TubeGeometry(path,48,.0008,6),lacquer);riser.userData.gauzeTransportRole='cup-bearing-spoke';riser.userData.gauzeSupportKind='interior-riser-wire';
    }
    const wickMaterial=new THREE.MeshStandardMaterial({color:0x15100c,roughness:1});wickMaterial.userData.lampOwned=true;
    const wickPoints=Array.from({length:12},(_,i)=>{const t=i/11,y=THREE.MathUtils.lerp(cupTop-.001,wickTip.y,t);return V3(centerAt(y)+(cupOffset-cupRadius*.82)*(1-t),y,0);});
    const wickMesh=solid(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wickPoints),24,.00065,6),wickMaterial);
    const smokePath=createGauzeSmokePath(smokeProfile,wickTip,vent);
    const flameSize=gauzeFlameSize(smokeProfile,wick,vent.topY);
    return { g, kind: 'shade', shells: [shell], wick: { at:wick },wickMesh,smokePath,suspensionMaterial:suspension, frame: { h: H + .2, cy: -.07 - H * .5 }, lightMax: .9, flame: flameSize, light: 0xff6a3a, hang: true };
  },
  // A square lattice lamp with paper panels on a low wooden stand; its outline, turned square, is the person's.
  lattice(o = presetOf('shade')) {
    const g = new THREE.Group(), y0 = .5, P = scaled(o.rows, shadeScale(o.rows, 1.8, .05)).map(([r, y]) => [r * Math.SQRT2, y0 + .02 + y]), top = P[P.length - 1][1];
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) solid(g, new THREE.BoxGeometry(.022, y0, .022), lampWood, x * .11, y0 / 2, z * .11);
    solid(g, new THREE.BoxGeometry(.26, .02, .26), lampWood, 0, y0, 0);
    for (const y of [.1, .3]) for (const [w, d] of [[.24, .014], [.014, .24]]) for (const s of [-1, 1]) solid(g, new THREE.BoxGeometry(w, .016, d), lampWood, w > .1 ? 0 : s * .11, y, w > .1 ? s * .11 : 0);
    const paper = paperLatticeTex.clone(); paper.wrapS = THREE.RepeatWrapping; paper.repeat.set(4, 1); paper.needsUpdate = true;
    const shell = shellMaterial(o.color, { map: paper, glow: 0xffb070, reach: 9, rough: .9, base: .06, strength: .45 });
    const box4 = lathe(P, 4); box4.rotateY(Math.PI / 4); solid(g, box4, shell).castShadow = false;
    // Corner posts follow the outline; rails close it at the top and the bottom.
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2, post = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(P.map(([r, y]) => V3(Math.sin(a) * r, y, Math.cos(a) * r))), 16, .006, 4), lampWood); post.castShadow = true; g.add(post); }
    for (const [r, y] of [P[0], P[P.length - 1]]) { const ring = lathe([[r + .006, y - .008], [r + .006, y + .008]], 4); ring.rotateY(Math.PI / 4); solid(g, ring, lampWood); }
    solid(g, lathe([[0, y0 + .01], [.022, y0 + .01], [.024, y0 + .03], [.02, y0 + .032], [0, y0 + .026]], 32), clayMat);
    return { g, kind: 'shade', shells: [shell], wick: { at: V3(0, y0 + .036, 0) }, frame: { h: top - y0 + .08, cy: (y0 + top) / 2 }, lightMax: .8, flame: .85, light: 0xffaa60 };
  },
};

// Wax volume from the base up; the level animation reads it so the wax drops in step with real time.
function burnOf(rows) {
  const cum = [0]; let v = 0;
  for (let i = 1; i < rows.length; i++) { const a = rows[i - 1], b = rows[i]; v += Math.PI * (b.y - a.y) * (a.r * a.r + a.r * b.r + b.r * b.r) / 3; cum.push(v); }
  return { cum, total: v };
}
const ringAt = (R, y) => { let i = 1; while (i < R.length - 1 && R[i].y < y) i++; const a = R[i - 1], b = R[i], k = Math.min(1, Math.max(0, (y - a.y) / (b.y - a.y || 1))); return { y, cx: a.cx + (b.cx - a.cx) * k, r: a.r + (b.r - a.r) * k }; };
const findCum = (arr, tgt) => { let i = 1; while (i < arr.length - 1 && arr[i] < tgt) i++; return [i, Math.min(1, Math.max(0, (tgt - arr[i - 1]) / (arr[i] - arr[i - 1] || 1)))]; };
// A candle body from rows, cut flat at `cut` with a soft rim and a shallow dip where the pool sits.
function candleGeo(rows, cut, seg = 56) {
  const R = rows.filter((q) => q.y < cut - 1e-6); R.push(ringAt(rows, cut));
  if (R.length < 2) R.unshift({ ...R[0], y: 0 });
  const top = R[R.length - 1], pos = [], uv = [], idx = [];
  const ring = (cx, r, y) => { const s = pos.length / 3; for (let j = 0; j <= seg; j++) { const a = j / seg * Math.PI * 2; const grain = 1 + .006 * Math.sin(a * 7 + y * 180) + .003 * Math.sin(a * 19 - y * 310); const lip = y > cut - .004 ? Math.sin(a * 3 + .5) * .0003 + Math.sin(a * 7) * .00015 : 0; pos.push(cx + Math.cos(a) * r * grain, y + lip, Math.sin(a) * r * grain); uv.push(j / seg, y * 8); } return s; };
  const strip = (s0, s1) => { for (let j = 0; j < seg; j++) idx.push(s0 + j, s1 + j, s0 + j + 1, s0 + j + 1, s1 + j, s1 + j + 1); };
  let prev = ring(R[0].cx, R[0].r, R[0].y);
  for (let i = 1; i < R.length - 1; i++) { const s = ring(R[i].cx, R[i].r, R[i].y); strip(prev, s); prev = s; }
  const rim = Math.min(.0015, top.r * .2);
  for (const [rr, dy] of [[1, -rim], [.96, 0], [.82, -.0012], [.4, -.0026], [.001, -.003]]) { const s = ring(top.cx, top.r * rr, top.y + dy); strip(prev, s); prev = s; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals(); return g;
}
// The oil inside a clear vessel, from the bottom up to the level.
function oilBodyGeo(vessel, y) { const pts = [[0, vessel.ys[0]]]; for (const yy of vessel.ys) if (yy < y) pts.push([vessel.r(yy) * .97, yy]); pts.push([vessel.r(y) * .97, y], [0, y]); return lathe(pts, 40); }
function disposeTree(o) {
  const geometries=new Set(),materials=new Set();
  o.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    for(const material of [object.material].flat())if(material?.userData.lampOwned)materials.add(material);
  });
  for(const geometry of geometries)geometry.dispose();
  for(const material of materials){nearMaterials.delete(material);material.dispose();}
}

// The person's own lamp: whichever vessel this place uses, and its candle or oil.
const mine = (() => {
  const g = new THREE.Group(); outside.add(g);
  const candleG = new THREE.Group(); g.add(candleG);
  const wax = waxMaterial(0x8f1b12);
  const body = new THREE.Mesh(new THREE.BufferGeometry(), wax); body.castShadow = true; body.receiveShadow = true; candleG.add(body);
  const poolMat = waxMaterial(0xa02a1a, { roughness: .08, clearcoat: 1, fall: 30 });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), poolMat); candleG.add(pool);
  const drips = Array.from({ length: 7 }, (_, i) => {
    const mesh = new THREE.Mesh(lathe([[0, -1], [.65, -.96], [1, -.8], [.55, -.45], [.3, .25], [.2, 1], [0, 1]], 12), wax);
    mesh.visible = false; candleG.add(mesh); return { mesh, angle: i * 2.399, start: .015 + i * .025, reach: .006 + .014 * ((i * .618 + .17) % 1), width: .00065 + .0004 * ((i * .414 + .3) % 1) };
  });
  const oil = new THREE.Mesh(new THREE.CircleGeometry(1, 56).rotateX(-Math.PI / 2), oilMat); g.add(oil);
  const oilGlow = waxMaterial(0xb0761e, { roughness: .05, clearcoat: 1, glow: 0xffa040, fall: 30 });
  const oilBody = new THREE.Mesh(new THREE.BufferGeometry(), oilGlow); oilBody.renderOrder = 1; g.add(oilBody);
  const f = flameParts(g);
  const defaultSuspensionMaterial=new THREE.MeshStandardMaterial({color:0x746041,roughness:.95});
  const hanger=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,8),defaultSuspensionMaterial);
  hanger.visible=false;g.add(hanger);
  // Keep depth offsets below the measured submillimetre rib/cloth separation.
  f.light.castShadow = true; f.light.shadow.mapSize.set(1024, 1024); f.light.shadow.bias = -.00002; f.light.shadow.normalBias = .0001; f.light.shadow.radius = 2; f.light.shadow.camera.near = .008; f.light.shadow.camera.far = 6;
  f.light.shadow.camera.layers.enableAll(); // the lamp is drawn on layer 1; its own vessel and shade must still cast
  // A second flame, upside down in still water below, when the place has water.
  const mirror = flameParts(g, { light: false }); mirror.fm.uniforms.uSeedU.value = f.fm.uniforms.uSeedU.value; mirror.flame.visible = mirror.halo.visible = false; mirror.wick.visible = mirror.ember.visible = false;
  const world = V3(0, 0, 0);
  const pineShadowPoint = V3(0, 0, 0);
  const lastPineShadowPoint = V3(Infinity, Infinity, Infinity);
const api = { g, parts: null, partsKey: null, type: null, power: 0, lightPower: 0, lightBoost: 1, lightTint: null, offer: null, top: V3(0, 0, 0), lastCut: -1, scale: 1, mirrorY: null, lastOil: -1,
    waxState: 'unlit',
    // Builds this place's vessel; a dish or a shade takes the person's outline and colour.
    build(o) {
      const drawn = !WAX_LAMPS.has(this.type) && o,liveBaked=!!place?.P.bakedLighting;
      const winterWeave=this.type==='gauze' && !!place?.P.nook.winterWeave;
      const sculptNormal = this.type === 'pineWax' ? place?.baked?.waxNormal : null;
      const sunShade = this.type === 'pineWax' ? place?.baked?.sunShade : null;
      const key = this.type + (liveBaked?'|cycles':'') + (sculptNormal ? `|sculpt-${sculptNormal.id}` : '')
        + (sunShade ? '|shaded-sun' : '') + (winterWeave ? '|winter-weave' : '')
        + (drawn ? JSON.stringify([o.rows, o.color]) : '');
      if (key === this.partsKey && (!sunShade || this.parts?.sunShade === sunShade)) return;
      if (this.parts) { g.remove(this.parts.g); disposeTree(this.parts.g); }
      const input=drawn?{...o,liveBaked,winterWeave}:this.type==='gauze'?{...presetOf('shade'),liveBaked,winterWeave}:undefined;
      const p = this.type === 'pineWax' ? LAMPS.pineWax({ refined: liveBaked, sculptNormal, sunShade })
        : input ? LAMPS[this.type](input) : LAMPS[this.type]();
      this.parts = p; this.partsKey = key; g.add(p.g);
      hanger.material=p.suspensionMaterial??defaultSuspensionMaterial;
      f.wick.visible = !p.wickMesh && !p.pineWax;
      f.light.shadow.autoUpdate = !p.pineWax;
      f.light.shadow.normalBias = p.pineWax && liveBaked ? .0024 : .0001;
      f.light.shadow.radius = p.pineWax ? 4 : 2;
      f.light.distance = p.pineWax && liveBaked ? .42 : 0;
      const volumeFlame = p.pineWax && liveBaked;
      f.fm.uniforms.uPineFlame.value = volumeFlame ? 1 : 0;
      f.fm.blending = volumeFlame ? THREE.CustomBlending : THREE.AdditiveBlending;
      // The volume returns emitted light and the fraction of background light it absorbs.
      f.fm.blendSrc = THREE.OneFactor;
      f.fm.blendDst = THREE.OneMinusSrcAlphaFactor;
      f.fm.uniforms.uRadiance.value = p.pineWax && liveBaked ? .83 : 1;
      f.ember.scale.setScalar(p.pineWax && liveBaked ? .49 : 1);
      f.light.color.setHex(p.light ?? 0xffba78); f.size = p.flame ?? 1; mirror.size = f.size;
      g.traverse((c) => { c.layers.set(0); warmReflections(c); }); f.light.layers.enableAll();
      if(liveBaked&&place?.visitorEnvironment){
        // Reflect the actual opening and its surroundings. Pine keeps its
        // existing diffuse lighting. Snow samples ambient light from the hall.
        const materials=new Set();p.g.traverse(object=>{for(const material of [object.material].flat())if(material?.userData.lampOwned&&'envMap'in material)materials.add(material);});
        for(const material of materials) {
          if (p.pineWax) {
            material.envMap = place.visitorEnvironment.texture;
            material.needsUpdate = true;
          } else actualHallEnvironment(material,place.visitorEnvironment.texture);
        }
      }
      if(liveBaked&&place?.baked?.visitorShadow){
        const materials=new Set();p.g.traverse(object=>{for(const material of [object.material].flat())if(material?.userData.lampOwned)materials.add(material);});
        for(const material of materials){place.baked.visitorShadow.install(material);place.baked.staticLampShadow?.install(material);}
      }
      if(liveBaked&&place?.baked?.gauzeTransmission&&this.type==='gauze'){
        let cloth;p.g.traverse(object=>{if(object.userData.visitorCloth)cloth=object;});
        const pointLocal=p.wick.at.clone().add(V3(0,.019*(p.flame??1),0));
        cloth.material.sheen=0;cloth.material.specularIntensity=0;cloth.material.needsUpdate=true;
        place.baked.gauzeTransmission.configure({cloth,pointLocal,colour:input.color,shadowTransmissionScale:place.baked.manifest.lampBasis.transport.shadowTransmissionScale??.22,emitterRadius:place.baked.manifest.lampBasis.pointRadiusMetres??0,frame:g});
      }else place?.baked?.gauzeTransmission?.disable();
    },
    setType(type) {
      if (this.type === type) return;
      this.type = type; this.partsKey = null; this.build(null);
      if (this.offer) this.setOffer(this.offer);
    },
    setOffer(o) {
      this.offer = o; this.lastCut = -1; this.lastOil = -1;
      if (this.parts && this.parts.kind !== 'wax' && o.kind === this.parts.kind) this.build(o);
      const p = this.parts; if (!p) return;
      f.soft = !!place?.P.bakedLighting;
      const isWax = p.kind === 'wax';
      this.waxState = 'unlit';
      if (p.pineWax) {
        p.pineWax.group.visible = o.kind === 'candle';
        if (p.pineWax.group.visible) p.setShape(o);
      }
      candleG.visible = isWax && !p.pineWax; oil.visible = p.kind === 'oil'; oilBody.visible = !!p.oilBody;
      drips.forEach(({ mesh }) => { mesh.visible = false; });
      if (isWax && !p.pineWax && o.kind === 'candle') {
        wax.color.setHex(o.color); poolMat.color.setHex(o.color).lerp(new THREE.Color(0xffd0a0), .18);
        const R = o.rows, w = Math.max(...R.map((q) => q.r + Math.abs(q.cx))), h = R[R.length - 1].y;
        // A drawn candle keeps its shape; inside a lantern it is scaled to fit behind the glass.
        this.scale = Math.min(1, p.seat.maxR / w, p.seat.maxH / h); candleG.scale.setScalar(this.scale); candleG.position.y = p.seat.y;
      }
      this.setLevel(1);
    },
    setLevel(L) {
      const o = this.offer, p = this.parts; if (!o || !p) return;
      if (p.pineWax && o.kind === 'candle') {
        p.pineWax.update(L, this.waxState, this.top);
      } else if (p.kind === 'wax' && o.kind === 'candle') {
        const R = o.rows, [i, k] = findCum(o.burn.cum, L * o.burn.total);
        const cut = Math.max(R[i - 1].y + (R[i].y - R[i - 1].y) * k, .002);
        if (Math.abs(cut - this.lastCut) > .0003) {
          body.geometry.dispose(); body.geometry = candleGeo(R, cut); this.lastCut = cut;
          const q = ringAt(R, cut); pool.position.set(q.cx, cut - .0011, 0); pool.scale.setScalar(Math.max(q.r * .8, .0005));
          this.top.set(q.cx * this.scale, p.seat.y + cut * this.scale, 0);
        }
        for (const { mesh, angle, start, reach, width } of drips) {
          const grown = Math.min(1, Math.max(0, (1 - L - start) * 9));
          mesh.visible = grown > 0 && L > .03;
          const length = Math.min(reach * grown, this.lastCut * .65), y = Math.max(.002, this.lastCut - length * .55), q = ringAt(o.rows, y);
          mesh.position.set(q.cx + Math.cos(angle) * q.r, y, Math.sin(angle) * q.r);
          mesh.scale.set(width * grown, Math.max(.0001, length * .5), width * grown);
        }
      } else if (p.kind === 'oil') {
        // The vessel shows its oil on a gentler curve than volume, so a short burn still holds visible oil.
        const V = p.vessel, [i, k] = findCum(V.cum, L * V.vol), y = V.ys[i - 1] + (V.ys[i] - V.ys[i - 1]) * k;
        if (Math.abs(y - this.lastOil) > .0002) {
          this.lastOil = y; oil.position.y = y; oil.scale.setScalar(V.r(y));
          if (p.oilBody) { oilBody.geometry.dispose(); oilBody.geometry = oilBodyGeo(V, y); }
        }
        if (p.wick.float) this.top.set(0, y + p.wick.float, 0); else this.top.copy(p.wick.at);
      } else if (p.kind === 'shade') this.top.copy(p.wick.at);
      else this.top.set(0, p.seat.y, 0); // a wax lamp still holding the last place's oil offer, until the UI sends a candle
      hanger.visible=!!place?.baked&&p.kind==='shade';
      if(hanger.visible){
        // Size changes the shade, while the actual light stays on its Cycles
        // bake basis. Extend the suspension above a smaller lantern.
        const basis=place.nookG.worldToLocal(V3(...place.baked.manifest.lampBasis.position));
        const pivot=g.parent?.userData.visitorPivot?g.parent:null;
        if(pivot)basis.sub(pivot.position);
        g.position.set(basis.x-this.top.x,basis.y-.019*(p.flame??1)-this.top.y,basis.z-this.top.z);
        const hook=place.nookG.worldToLocal(V3(...(place.P.nook.hangingPoint??[place.baked.manifest.lampBasis.position[0],3.22,place.baked.manifest.lampBasis.position[2]])));
        if(pivot)hook.sub(pivot.position);
        const suspensionEnd=hook.clone().sub(g.position),length=suspensionEnd.length();
        hanger.visible=length>.001;hanger.position.copy(suspensionEnd).multiplyScalar(.5);hanger.scale.set(.0025,length,.0025);
        if(hanger.visible)hanger.quaternion.setFromUnitVectors(V3(0,1,0),suspensionEnd.normalize());
      }
      f.place(this.top.x, this.top.y, this.top.z);
      if (p.pineWax) {
        f.ember.position.copy(p.pineWax.wickTip);
        if (place?.P.bakedLighting) {
          f.ember.position.y += .0002;
          f.flame.position.copy(p.pineWax.wickTip);
          f.flame.position.y -= .0047;
          f.light.position.y = p.pineWax.wickTip.y + .0175;
        }
      }
    },
    flameWorld() { g.updateWorldMatrix(true, false); return g.localToWorld(world.copy(this.top)); },
    setShadowFar(far){
      lastPineShadowPoint.set(Infinity, Infinity, Infinity);
      f.light.shadow.camera.far=far;
      // Preserve the original0.12mm world bias when the indirect-light route
      // extends the shadow range. A fixed normalized bias hid thin rib shadows.
      f.light.shadow.bias=-.00012/(far-f.light.shadow.camera.near);
      f.light.shadow.camera.updateProjectionMatrix();
    },
    lightWorld() { f.light.updateWorldMatrix(true,false);return f.light.getWorldPosition(world); },
    update(time) {
      const p = this.parts; if (!p) return;
      if (place?.P.bakedLighting && !p.pineWax) {
        if(g.parent?.userData.visitorPivot){g.rotation.z=0;g.parent.rotation.z=Math.sin(time*.32)*.008;}
        else g.rotation.z=Math.sin(time*.32)*.0035;
      }
      f.fm.uniforms.uWind.value = wind;
      if(this.lightTint)f.light.color.copy(this.lightTint);
      // A shaded lamp's light draws in as it burns; a candle's dims as it nears its holder.
      const keep = p.pineWax ? .68 + .32 * Math.min(1, level * 3)
        : p.kind === 'shade' ? .35 + .65 * Math.min(1, level * 1.4)
        : p.kind === 'wax' ? Math.min(1, ((this.top.y - (p.seat?.y ?? 0) + .03) / .2) ** 2) : 1;
      const power = this.power * (lit ? Math.min(1, level * 25) : 1);
      const fw = this.flameWorld(), k = f.tick(time, power, p.lightMax * keep * this.lightBoost, p.pineWax?.materials ?? [wax, poolMat, oilGlow], fw.y);
      if (p.pineWax) {
        p.pineWax.updateLight(f.light, place?.baked?.manifest.lampBasis?.pointRadiusMetres, time, wind);
        if (f.light.intensity > .0001) {
          f.light.getWorldPosition(pineShadowPoint);
          // Only wick movement changes the shadow of the static stone niche.
          if (pineShadowPoint.distanceToSquared(lastPineShadowPoint) > .0008 ** 2) {
            f.light.shadow.needsUpdate = true;
            lastPineShadowPoint.copy(pineShadowPoint);
          }
        }
      }
      for (const material of p.pineWax?.materials ?? []) material.userData.u.uGlow.value *= .52;
      place?.baked?.gauzeTransmission?.update(f.light);
      this.lightPower = power * k * keep;
      oilGlow.userData.u.uGlow.value = .4 * power * k;
      // Burned down keeps its short power curve; a put-out shade cools on an
      // exponential in time, which holds a steady fractional step per frame.
      const cooling=clockTime<shadeCoolingUntil?(shadeCoolingTau>0?shadeCoolingGlow*Math.exp(-(clockTime-shadeCoolingStart)/shadeCoolingTau):shadeCoolingGlow*Math.pow((shadeCoolingUntil-clockTime)/5.2,1.5)):0;
      for (const m of p.shells ?? []) {
        const u=m.userData.u,transport=place?.baked?.gauzeTransmission;
        u.uFlame.value.copy(fw);u.uGlow.value=Math.max(2.4*m.userData.strength*power*k*keep,cooling*m.userData.strength);
        if(m.userData.cloth){
          const gauzeGlow=place?.P.nook.gauzeGlow;
          if(gauzeGlow){u.uBase.value=gauzeGlow.base;u.uReach.value=gauzeGlow.reach;}
          u.uClothPhysical.value=transport?1:0;
          if(transport){
            const basis=place.baked.manifest.lampBasis,emberIntensity=place.baked.lampCandela*cooling/2.4;
            u.uFlame.value.copy(transport.uniforms.uGauzeFilterPoint.value);
            u.uClothIntensity.value=Math.max(f.light.intensity,emberIntensity);
            u.uClothSourceRGB.value.copy(f.light.color);
            if(emberIntensity>f.light.intensity)u.uClothSourceRGB.value.setRGB(1,.15,.0146);
            u.uClothEmitterRadius.value=basis.pointRadiusMetres;
            u.uClothTransmissionWeight.value=basis.transport.diffuseTransmissionWeight??.65;
            u.uClothReflectionWeight.value=basis.transport.diffuseReflectionWeight??.35;
          }
        }
      }
      f.ember.visible = this.power > .02 || clockTime < emberUntil; f.ember.material.color.setRGB(2.4, .36, .035).multiplyScalar(clockTime < emberUntil ? Math.max(0, (emberUntil - clockTime) / 2.5) : 1);
      // The last ember: a small red glow at the wick that fades after the flame is gone.
      const embering = this.power < .02 && clockTime < emberUntil, fade = embering ? Math.max(0, (emberUntil - clockTime) / 2.5) : 0;
      f.halo.material.color.setHex(embering ? 0xff3a0a : 0xff8a3a);
      if (embering) { f.halo.material.opacity = .55 * fade; f.halo.scale.set(.02, .02, 1); } else f.halo.scale.set(.2, .26, 1);
      if (p.pineWax && place?.P.bakedLighting && !embering) {
        f.halo.material.opacity *= .35;
        f.halo.scale.set(.11, .15, 1);
        f.ember.material.color.setRGB(1.7 * k, .19 * k, .026 * k);
      }
      if (p.kind === 'shade') f.halo.material.opacity *= .3;
      // The reflection: same flame, flipped about the water, broken up a little by ripples.
      const on = false; // Pond reflections use the scene reflection, including the real flame and rail.
      mirror.flame.visible = mirror.halo.visible = on;
      if (on) {
        const my = 2 * (this.mirrorY - g.position.y) - this.top.y;
        mirror.place(this.top.x, my, this.top.z); mirror.tick(time, power * .55, 0, [], 0);
        mirror.fm.uniforms.uScale.value *= -1.6; mirror.fm.uniforms.uWind.value = wind + Math.sin(time * 2.3) * .25;
        mirror.halo.position.y = my - .02; mirror.halo.material.opacity *= 2.2; mirror.halo.scale.set(.1, .42, 1);
      }
    },
  };
  g.visible = false; return api;
})();

// Lamps other people lit here, already burning: the same vessel, a simpler candle, no light of their own.
function otherLamp(type, x, y, z, L = .6, ry = 0, power = .62) {
  const p = LAMPS[type](), g = p.g; g.position.set(x, y, z); g.rotation.y = ry; C.G.add(g);
  const wx = [];
  let top;
  if (p.kind === 'wax') {
    const h = .03 + .1 * L, r = Math.min(.022, p.seat.maxR * .6), m = waxMaterial([0x8c1a12, 0xdcc9a6, 0xc8922e][Math.floor(C.rnd() * 3)]);
    const b = new THREE.Mesh(candleGeo([{ y: 0, cx: 0, r }, { y: h, cx: 0, r }], h), m); b.position.y = p.seat.y; b.castShadow = true; g.add(b); wx.push(m);
    top = V3(0, p.seat.y + h, 0);
  } else if (p.kind === 'oil') {
    const V = p.vessel, yy = V.ys[0] + (V.ys[V.ys.length - 1] - V.ys[0]) * L, o = new THREE.Mesh(new THREE.CircleGeometry(V.r(yy), 40).rotateX(-Math.PI / 2), oilMat); o.position.y = yy; g.add(o);
    if (p.oilBody) { const ob = new THREE.Mesh(oilBodyGeo(V, yy), waxMaterial(0xb0761e, { glow: 0xffa040, fall: 30 })); g.add(ob); wx.push(ob.material); }
    top = p.wick.float ? V3(0, yy + p.wick.float, 0) : p.wick.at.clone();
  } else top = p.wick.at.clone();
  // Only the first two carry a light of their own; more would cost every surface another light to shade.
  g.traverse(warmReflections);
  const lightOwn = C.others.length < 2;
  const f = flameParts(g, { light: lightOwn, color: p.light, size: p.flame ?? 1 }); f.place(top.x, top.y, top.z);
  const fw = V3(0, 0, 0);
  const o = { g, f, p, tick(time) {
    g.updateMatrixWorld(); fw.copy(top).applyMatrix4(g.matrixWorld);
    const k = f.tick(time, power, p.lightMax * .55 * power / .62, wx, fw.y);
    for (const m of p.shells ?? []) { m.userData.u.uFlame.value.copy(fw); m.userData.u.uGlow.value = 1.6 * m.userData.strength * k; }
    if (p.kind === 'shade') f.halo.material.opacity *= .3;
  } };
  C.others.push(o); return o;
}

// Motes drifting in the lamplight, where the spot is sheltered enough to hold them.
const dust = (() => {
  const n = 220, rnd = mulberry32(9), pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = (rnd() - .5) * 2.4; pos[i * 3 + 1] = -.4 + rnd() * 3; pos[i * 3 + 2] = -1 + rnd() * 2.2; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ map: softTex, color: 0xffd7a0, size: .01, transparent: true, opacity: .4, depthWrite: false, blending: THREE.AdditiveBlending }));
  p.material.userData.soft={value:0};
  p.material.onBeforeCompile=shader=>{
    shader.uniforms.uDustSoft=p.material.userData.soft;
    shader.vertexShader='varying float vDustY;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvDustY=position.y;');
    shader.fragmentShader='varying float vDustY;uniform float uDustSoft;\n'+shader.fragmentShader.replace('#include <alphatest_fragment>','diffuseColor.a*=mix(1.,smoothstep(-.4,-.12,vDustY)*(1.-smoothstep(2.2,2.6,vDustY)),uDustSoft);\n#include <alphatest_fragment>');
  };
  p.frustumCulled = false; outside.add(p); return p;
})();

// ---------- Outside: each place and its temple ----------
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
  let scan=null;
  if(o.map?.image===pavingTex.image)scan=scans.stone_pavers;
  else if(o.map?.image===grainTex.image)scan=scans.weathered_planks;
  else if(o.map?.image===brickTex.image)scan=scans.dark_brick_wall;
  else if(o.map?.image===plasterTex.image)scan=scans.white_plaster_rough_01;
  const tint=new THREE.Color(color);if(scan&&scan!==scans.weathered_planks)tint.lerp(new THREE.Color(0xffffff),.6);
  const m=new THREE.MeshStandardMaterial({color:tint,roughness:rough,bumpMap:scan?null:patina,bumpScale:.008,...o,...(scan??{})}); if (C.snow) snowy(m, C.snow);
  const previous = m.onBeforeCompile;
  const projected=isScanTexture(m.map)||[pavingTex,brickTex,plasterTex,loessTex].some(t=>o.map?.image===t.image);
  const snowKey = C.snow;
  m.customProgramCacheKey = () => `weather-5-${projected}-${snowKey}`;
  m.onBeforeCompile = (sh, r) => {
    previous(sh, r);
    sh.vertexShader = 'varying vec3 vSurface; varying vec3 vSurfaceN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 surfacePosition=vec4(transformed,1.);vec3 surfaceNormal=objectNormal;\n#ifdef USE_INSTANCING\nsurfacePosition=instanceMatrix*surfacePosition;surfaceNormal=mat3(instanceMatrix)*surfaceNormal;\n#endif\nvSurface=(modelMatrix*surfacePosition).xyz;vSurfaceN=normalize(mat3(modelMatrix)*surfaceNormal);');
    sh.fragmentShader = `varying vec3 vSurface; varying vec3 vSurfaceN;
      float surfaceHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      float surfaceNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(surfaceHash(i),surfaceHash(i+vec3(1,0,0)),f.x),mix(surfaceHash(i+vec3(0,1,0)),surfaceHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(surfaceHash(i+vec3(0,0,1)),surfaceHash(i+vec3(1,0,1)),f.x),mix(surfaceHash(i+vec3(0,1,1)),surfaceHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      ` + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float weather = surfaceNoise(vSurface*3.7)*.55+surfaceNoise(vSurface*31.)*.3+surfaceNoise(vSurface*127.)*.15;
      diffuseColor.rgb *= .78 + weather*.36;
      float foot = exp(-abs(vSurface.y)*1.7);
      diffuseColor.rgb *= 1.-foot*.10;`);
    if(projected) sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
      vec3 axes = abs(normalize(vSurfaceN));
      vec2 surfaceUV = axes.y > max(axes.x,axes.z) ? vSurface.xz : axes.x > axes.z ? vSurface.zy : vSurface.xy;
      vec4 surfaceSample=texture2D(map,surfaceUV*.45);diffuseColor *= vec4(pow(surfaceSample.rgb,vec3(.65)),surfaceSample.a);`);
    if(projected){
      sh.fragmentShader=sh.fragmentShader.replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps.replaceAll('vNormalMapUv','(surfaceUV*.45)'));
      sh.fragmentShader=sh.fragmentShader.replace('#include <roughnessmap_fragment>',THREE.ShaderChunk.roughnessmap_fragment.replaceAll('vRoughnessMapUv','(surfaceUV*.45)'));
    }
    sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (weather-.5)*.12,.05,1.);');
  };
  C.materials.set(key, m); return m;
}
const roofMat = (color, glazed) => M(color, glazed ? .36 : .8, { map: tileTex, bumpMap:tileTex,bumpScale:.045,metalness:glazed?.08:0,side:THREE.DoubleSide });
// Static pieces are merged per material at the end of a build.
function put(geo, m, x = 0, y = 0, z = 0, ry = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo; if (ry) g.rotateY(ry); g.translate(x, y, z);
  if (!C.bat.has(m)) C.bat.set(m, []); C.bat.get(m).push(g);
}
const box = (w,h,d,m,x,y,z,ry=0) => put(Math.min(w,h,d)>.025 && Math.max(w,h,d)<16 ? new RoundedBoxGeometry(w,h,d,2,Math.min(.018,Math.min(w,h,d)*.12)) : new THREE.BoxGeometry(w,h,d),m,x,y,z,ry);
async function finishBatch() {
  for (const [m, list] of C.bat) {
    await pauseBuild();
    const geo = mergeGeometries(list.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; }));
    list.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; mesh.receiveShadow = true; C.G.add(mesh);
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
  const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*w*.14,uv.getY(i)*d*.14);
  g.computeVertexNormals(); return { g, ridge };
}
function ridgeBar(r, y, m, x, z, scale = 1) {
  box(r.ridge * 2 + .6 * scale, .5 * scale, .45 * scale, m, x, y + .1 * scale, z);
  for (const s of [-1, 1]) box(.45 * scale, 1.2 * scale, .5 * scale, m, x + s * (r.ridge + .3 * scale), y + .5 * scale, z);
}
// A Chinese hall: stone base, columns, glowing lattice doors, painted brackets, one or two eaves.
function hallB(o){return buildHall(o,{THREE,V3,M,box,put,roofGeo,roofMat,pavingTex,grainTex,latticeTex,context:C});}
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
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; g.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0); C.G.add(g); return g;
}
function water(y, color, o = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: o.rough ?? .06, metalness: 0, normalMap: waterTex, normalScale: V2(o.waves ?? .35, o.waves ?? .35), envMapIntensity: o.env ?? 1, clearcoat: .3 });
  let w;
  if(o.reflect){
    const shader={...Reflector.ReflectorShader,uniforms:{...Reflector.ReflectorShader.uniforms,uWaterTime:{value:0}},
      fragmentShader:Reflector.ReflectorShader.fragmentShader.replace('uniform vec3 color;','uniform vec3 color; uniform float uWaterTime;').replace('vec4 base = texture2DProj( tDiffuse, vUv );',`vec4 q=vUv;q.x+=sin(q.y*83.+uWaterTime*1.2)*.0005*q.w;q.y+=sin(q.x*127.+uWaterTime*.8)*.0008*q.w;vec4 base=texture2DProj(tDiffuse,q);`)};
    w=new Reflector(o.geo,{textureWidth:innerWidth<720?512:1024,textureHeight:innerWidth<720?512:1024,color:0x737c79,clipBias:.003,shader});
    w.material.depthWrite=true;C.up.push((dt,t)=>{w.material.uniforms.uWaterTime.value=t;});
    C.reflectors??=[];C.reflectors.push(w);
  } else w = new THREE.Mesh(o.geo ?? new THREE.PlaneGeometry(2400, 2400),m);
  w.rotation.x = -Math.PI / 2; w.position.set(o.x ?? 0,y,o.z ?? 0);C.G.add(w);
  if (!C.waterAnim) { C.waterAnim = true; C.up.push((dt) => { waterTex.offset.x += dt * .004; waterTex.offset.y += dt * .002; }); }
  return w;
}
// Mountains: a cone pushed about by noise, with a profile that can be sharp or domed.
function peakGeo(r, h, seed, sharp = 1.3) {
  const rnd = mulberry32(seed), ph = [rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6];
  const g = new THREE.CylinderGeometry(0, r, h, 72, 36, true); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), t = (p.getY(i) + h / 2) / h, a = Math.atan2(z, x), rad = Math.hypot(x, z);
    if (rad < 1e-6) { p.setY(i, h * .94); continue; }
    const n = Math.sin(a * 2 + ph[0] + t * 3) * .5 + Math.sin(a * 5 + ph[1] - t * 7) * .3 + Math.sin(a * 11 + ph[2] + t * 13) * .16 + Math.sin(a * 23 + ph[3] - t * 19) * .08;
    const prof = Math.pow(1 - t, sharp), k = r * prof * (1 + .3 * n) / rad;
    p.setXYZ(i, x * k, t * h * (1 + .06 * n), z * k);
  }
  g.computeVertexNormals(); return g;
}
function peak(x, y, z, r, h, m, seed, sharp) { put(peakGeo(r, h, seed, sharp), m, x, y, z); }
function rock(x,y,z,s,seed){
  if(addScannedRock(C.G,x,y,z,s,seed))return;
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
  list.forEach(([dist, base, amp, color, snow, back], i) => {
    const m = new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color(color).multiplyScalar(C.shade) }, uS: { value: new THREE.Color(0xf4f6fa).lerp(new THREE.Color(color), .25).multiplyScalar(C.shade) }, uLine: { value: snow ?? 1e5 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: 'uniform vec3 uC, uS; uniform float uLine; varying vec3 vP; void main(){ float s = smoothstep(uLine, uLine + 2., vP.y + sin(vP.x * .21) * 3. + sin(vP.x * .67) * 1.4); gl_FragColor = vec4(mix(uC, uS, s), 1.); }' });
    const mesh = new THREE.Mesh(ridgeGeo(1600, base, amp, 40 + i * 13 + C.seed), m); mesh.position.set(0, 0, back ? dist : -dist); if (back) mesh.rotation.y = Math.PI; C.G.add(mesh);
  });
}
// Foliage cutouts carry individual needles and leaves instead of solid cone silhouettes.
const foliageTexture = (pine) => canvasTex(256,256,(g,w,h)=>{
  const rnd=mulberry32(pine?88:89);g.clearRect(0,0,w,h);
  g.strokeStyle='#82917b';g.lineWidth=2;g.beginPath();g.moveTo(128,250);g.lineTo(128,30);g.stroke();
  for(let i=0;i<(pine?160:90);i++){
    const y=30+rnd()*200,side=rnd()<.5?-1:1,reach=(pine?30:65)*(1-Math.abs(y-120)/200)*( .4+rnd());
    const x=128+side*reach;g.strokeStyle=pine?'#81957c':'#728d66';g.lineWidth=pine?1.3:1.7;g.beginPath();g.moveTo(128,y+20);g.lineTo(x,y);g.stroke();
    if(pine){for(let k=0;k<8;k++){const q=k/8;g.strokeStyle=['#6b8166','#9cab8a','#425f43'][i%3];g.beginPath();g.moveTo(128+(x-128)*q,y+20-20*q);g.lineTo(128+(x-128)*q+side*(8+rnd()*9),y-5-20*q);g.stroke();}}
    else{g.fillStyle=['#526f47','#71905c','#8a9c68'][i%3];g.beginPath();g.ellipse(x,y,7+rnd()*5,3+rnd()*2,side*.5,0,6.283);g.fill();}
  }
});
const needleTex=foliageTexture(true),leafTex=foliageTexture(false);
const foliageGeo=new THREE.PlaneGeometry(1.8,1.8);
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
  if (C.free) return false;
  const a = C.cam, b = C.tgt, dx = b.x - a.x, dz = b.z - a.z, k = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
  const below = top < a.y + (b.y - a.y) * k - 1;
  return (!below && Math.hypot(x - a.x - dx * k, z - a.z - dz * k) < r) || (Math.abs(x) < 3.5 && z > -2 && z < 70);
}
function trees() {
  const pineBatch=createPineBatch({THREE,rnd:C.rnd,material:(color,rough)=>M(color,rough,{map:grainTex}),needleTexture:needleTex,group:C.G});
  const L = { blob: [], trunk: [], cone: [], needle: [], leaf: [] }, q = new THREE.Quaternion(), e = new THREE.Euler(), rnd = C.rnd;
  const add = (k, x, y, z, sx, sy, sz, color, rx = 0, rz = 0) => { e.set(rx, rnd() * 6.28, rz); q.setFromEuler(e); L[k].push([new THREE.Matrix4().compose(V3(x, y, z), q.clone(), V3(sx, sy, sz)), new THREE.Color(color)]); };
  const jit = (c, a = .12) => new THREE.Color(c).offsetHSL((rnd() - .5) * .03, (rnd() - .5) * a, (rnd() - .5) * a).getHex();
  const T = {
    broad(x,y,z,s,color){
      if(blocked(x,z,4+s*2,y+5*s))return;
      add('trunk',x,y,z,.2*s,3*s,.2*s,0x483e32);
      for(let k=0;k<6;k++){const a=rnd()*6.28,d=rnd()*1.3*s;add('blob',x+Math.cos(a)*d,y+3*s+rnd()*.7*s,z+Math.sin(a)*d,.7*s,.65*s,.7*s,jit(color));}
      for(let k=0;k<110;k++){const a=rnd()*6.28,v=rnd()*2-1,rr=(.9+rnd()*.6)*s;add('leaf',x+Math.cos(a)*rr*Math.sqrt(1-v*v),y+3.6*s+v*s,z+Math.sin(a)*rr*Math.sqrt(1-v*v),.7*s,.7*s,.7*s,jit(color),rnd()*2-1,rnd()*2-1);}
    },
    pine(x,y,z,s,color,keep){if(!keep&&blocked(x,z,3+s*1.5,y+7*s))return;pineBatch.add(x,y,z,s,color);},
    cypress(x, y, z, s, color) { if (blocked(x, z, 3 + s * 1.5, y + 8.5 * s)) return; const lean = (rnd() - .5) * .2; add('trunk', x, y, z, .3 * s, 3 * s, .3 * s, 0x4a3a2c, 0, lean); for (let k = 0; k < 5; k++) add('blob', x + Math.sin(lean) * k * .7 * s + (rnd() - .5) * .8 * s, y + (2.2 + k * 1.3) * s, z + (rnd() - .5) * .8 * s, (1.1 - k * .12) * s, .9 * s, (1.1 - k * .12) * s, jit(color, .06)); },
    bamboo(x,y,z,s,color){
      if(blocked(x,z,4,y+12*s))return;
      const lx=(rnd()-.5)*.14,lz=(rnd()-.5)*.14,h=(8+rnd()*4)*s;
      add('trunk',x,y,z,.035*s,h,.035*s,jit(0x697b46),lx,lz);
      for(let k=0;k<34;k++){const f=.55+rnd()*.45,a=rnd()*6.28,rr=rnd()*1.5*s;add('leaf',x-lz*h*f+Math.cos(a)*rr,y+h*f,z+lx*h*f+Math.sin(a)*rr,.62*s,.28*s,.6*s,jit(color,.1),rnd()*.8-.4,rnd()*.8-.4);}
    },
    blob(x, y, z, sx, sy, sz, color) { add('blob', x, y, z, sx, sy, sz, jit(color, .06)); },
    finish() {
      pineBatch.finish();
      for (const [k, geo, rough] of [['blob', blobGeo, .95], ['trunk', trunkGeo, 1], ['cone', coneGeo, .95], ['needle',foliageGeo,.9], ['leaf',foliageGeo,.9]]) {
        if (!L[k].length) continue;
        const fm = k === 'needle' || k === 'leaf' ? new THREE.MeshStandardMaterial({color:0xffffff,map:k==='needle'?needleTex:leafTex,alphaTest:.35,side:THREE.DoubleSide,roughness:.9}) : M(0xffffff,rough);
        const im = new THREE.InstancedMesh(geo, fm, L[k].length); im.castShadow = true; im.receiveShadow = true;
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
  const tint = new THREE.Color(o.color).multiplyScalar(Math.min(1, C.shade * 2));
  const obj = rain ? new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: o.opacity ?? .3, depthWrite: false }))
    : new THREE.Points(g, new THREE.PointsMaterial({ map: o.tex ?? softTex, color: tint, size: o.size, transparent: true, opacity: o.opacity ?? .9, depthWrite: false, alphaTest: o.tex ? .3 : 0, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending }));
  obj.frustumCulled = false; C.G.add(obj);
  const lo = cy - h / 2, hi = cy + h / 2;
  if(o.softEdges&&!rain){
    obj.material.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 vWeatherPosition;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvWeatherPosition=position;');
      shader.fragmentShader='varying vec3 vWeatherPosition;\n'+shader.fragmentShader.replace('#include <alphatest_fragment>',`
        float weatherFade=smoothstep(${lo.toFixed(3)},${(lo+.45).toFixed(3)},vWeatherPosition.y)*(1.-smoothstep(${(hi-.8).toFixed(3)},${hi.toFixed(3)},vWeatherPosition.y));
        weatherFade*=smoothstep(${(cx-w/2).toFixed(3)},${(cx-w/2+1).toFixed(3)},vWeatherPosition.x)*(1.-smoothstep(${(cx+w/2-1).toFixed(3)},${(cx+w/2).toFixed(3)},vWeatherPosition.x));
        weatherFade*=smoothstep(${(cz-d/2).toFixed(3)},${(cz-d/2+1).toFixed(3)},vWeatherPosition.z)*(1.-smoothstep(${(cz+d/2-1).toFixed(3)},${(cz+d/2).toFixed(3)},vWeatherPosition.z));
        diffuseColor.a*=weatherFade;
        #include <alphatest_fragment>`);
    };
  }
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
  const mat = new THREE.SpriteMaterial({ map: softTex, color: new THREE.Color(o.color).multiplyScalar(Math.min(1, C.shade ** 2 * 1.5)), transparent: true, opacity: o.opacity, depthWrite: false, fog: o.fog ?? true });
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
  const sm = new Smoke(C.G, o.n ?? 80, new THREE.Color(o.color ?? 0xd8d4cc).multiplyScalar(C.shade ** 2), (o.op ?? .28) * Math.min(1, C.shade * 2), o.k ?? 14);
  let pending=0;
  C.up.push((dt, t) => {
    if(o.perSecond){pending+=dt*o.perSecond;while(pending>=1){sm.puff(V3(x,y,z),o.spread??.4,o.size??.35);pending--;}}
    else if (rnd() < (o.rate ?? .6)) sm.puff(V3(x, y, z), o.spread ?? .4, o.size ?? .35);
    sm.update(dt,t);
  });
}
function burnerAt(x, z, s = 1) {
  const g = new THREE.LatheGeometry([[0, 0], [.5, 0], [.55, .1], [.4, .3], [.9, .7], [.95, 1.2], [1, 1.25], [.85, 1.25], [.8, 1], [0, 1]].map(([a, b]) => V2(a * s, b * s)), 32);
  put(g, M(0x4a3a28, .5, { metalness: .9 }), x, 0, z);
  smokeAt(x, 1.3 * s, z, { size: .25 * s, spread: .3 * s });
}
// Prayer flags on a sagging string; they flutter.
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
function archBridge(z, span, rise, width, m, y = 0, railSides = [-1,1]) {
  const sh = new THREE.Shape(), L = span / 2 + 2.5, N = 24;
  sh.moveTo(-L, 0); for (let i = 0; i <= N; i++) { const u = -L + 2 * L * i / N; sh.lineTo(u, rise * Math.cos(Math.PI * u / (2 * L)) ** 1.2 + .3); } sh.lineTo(L, 0);
  const hole = new THREE.Path(); hole.moveTo(span * .32, 0); hole.absarc(0, 0, span * .32, 0, Math.PI, false); hole.lineTo(span * .32, 0); sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false, curveSegments: 20 });
  g.translate(0, 0, -width / 2); g.rotateY(-Math.PI / 2); put(g, m, 0, y, z);
  for (const s of railSides) {
    const rail = new THREE.Shape(); rail.moveTo(-L, .3); for (let i = 0; i <= N; i++) { const u = -L + 2 * L * i / N; rail.lineTo(u, rise * Math.cos(Math.PI * u / (2 * L)) ** 1.2 + 1.1); } for (let i = N; i >= 0; i--) { const u = -L + 2 * L * i / N; rail.lineTo(u, rise * Math.cos(Math.PI * u / (2 * L)) ** 1.2 + .3); }
    const rg = new THREE.ExtrudeGeometry(rail, { depth: .2, bevelEnabled: false }); rg.translate(0, 0, -.1); rg.rotateY(-Math.PI / 2); put(rg, m, s * (width / 2 - .1), y, z);
  }
}
function lotus(x0, x1, z0, z1, y, n) {
  const pads = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 96, .3, 6).rotateX(-Math.PI / 2), M(0xffffff, .7, { side: THREE.DoubleSide }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) { const s = .35 + C.rnd() * .55; q.setFromEuler(new THREE.Euler(0, C.rnd() * 6.28, 0)); m.compose(V3(x0 + C.rnd() * (x1 - x0), y + C.rnd() * .03, z0 + C.rnd() * (z1 - z0)), q, V3(s, 1, s)); pads.setMatrixAt(i, m); pads.setColorAt(i, new THREE.Color(0x3d6a2c).offsetHSL((C.rnd() - .5) * .04, 0, (C.rnd() - .5) * .1)); }
  pads.instanceColor.needsUpdate = true; C.G.add(pads);
  const pink=M(0xcf9ca6,.84,{side:THREE.DoubleSide});
  for(let i=0;i<n/6;i++){
    const x=x0+C.rnd()*(x1-x0),z=z0+C.rnd()*(z1-z0);
    for(let ring=0;ring<2;ring++)for(let j=0;j<8;j++){
      const angle=(j+ring*.5)/8*Math.PI*2,g=petalGeo(.1-ring*.02,.18-ring*.035,.03);
      g.rotateX(.65-ring*.3);g.rotateY(angle);put(g,pink,x+Math.sin(angle)*.035,y+.06+ring*.035,z+Math.cos(angle)*.035);
    }
  }
}
function city(n, rMin, rMax, arc) {
  const m = new THREE.MeshStandardMaterial({ color: 0x15161c, emissive: 0xffffff, emissiveMap: windowsTex, emissiveIntensity: .9, roughness: .9 });
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0), m, n), mat = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) { const a = arc[0] + C.rnd() * (arc[1] - arc[0]), r = rMin + C.rnd() * (rMax - rMin), h = 10 + C.rnd() * 34; q.setFromEuler(new THREE.Euler(0, -a, 0)); mat.compose(V3(Math.cos(a) * r, 0, Math.sin(a) * r), q, V3(14 + C.rnd() * 18, h, 14 + C.rnd() * 10)); im.setMatrixAt(i, mat); }
  C.G.add(im);
}
const skyVS = 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const defaultDiscEdges = [.9992, .9996];
const skyFS = `uniform vec3 uTop, uHorizon, uGround, uSun, uDir, uLit, uDark; uniform float uGlow, uClouds, uStars, uTime, uDisc;
uniform vec2 uDiscEdges;
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
  c += uSun * (pow(s, 10.) * uGlow * .7 + pow(s, 2.5) * uGlow * .18) * (uDisc < 2.5 ? .025 : 1.);
  c += uSun * smoothstep(uDiscEdges.x, uDiscEdges.y, s) * uDisc;
  if (uClouds > 0.) {
    vec2 p = d.xz / max(h + .1, .03) * .8 + vec2(uTime * .004, 0.);
    float n = fbm(p * 1.4);
    float cov = smoothstep(1. - uClouds, 1. - uClouds + .28, n) * smoothstep(.0, .14, h);
    vec3 cc = mix(uDark, uLit, clamp(.4 + pow(s, 3.) * .8 + (n - .55) * 1.4, 0., 1.));
    c = mix(c, cc, cov);
  }
  if (uStars > 0.) { vec3 q = d*900.;float spot=1.-smoothstep(.08,.3,length(fract(q)-.5));c+=step(.9997,h3(floor(q)))*spot*uStars*.45*smoothstep(.08,.45,h); }
  c = mix(uGround, c, smoothstep(-.06, .0, h));
  gl_FragColor = vec4(c, 1.);
}`;

// ---------- Time of day ----------
// The places follow the visitor's local clock through six looks: dawn, morning, afternoon, dusk, evening, late night.
// n: 0 = the place's day look, 1 = its night look. g: low-sun warmth. blue: blue-hour lift of a night sky.
// lamp: lamplight spilling from the halls. haze: mist density. elev: sun height by day.
const DAY_KEYS = [
  [0, { n: 1, g: 0, blue: 0, lamp: .55, haze: 1.3, elev: 1 }],
  [4.5, { n: 1, g: 0, blue: .15, lamp: .55, haze: 1.5, elev: 1 }],
  [6, { n: .5, g: .8, blue: .5, lamp: .8, haze: 1.7, elev: .12 }],
  [7.5, { n: 0, g: .35, blue: 0, lamp: 0, haze: 2, elev: .28 }],
  [10, { n: 0, g: .1, blue: 0, lamp: 0, haze: 1.6, elev: .55 }],
  [13, { n: 0, g: 0, blue: 0, lamp: 0, haze: 1, elev: 1 }],
  [16, { n: 0, g: .3, blue: 0, lamp: 0, haze: 1, elev: .5 }],
  [18, { n: .5, g: 1, blue: .3, lamp: .9, haze: 1.1, elev: .05 }],
  [19.5, { n: .85, g: .25, blue: 1, lamp: 1, haze: 1, elev: 1 }],
  [21, { n: 1, g: 0, blue: .35, lamp: 1, haze: 1, elev: 1 }],
  [23, { n: 1, g: 0, blue: 0, lamp: .6, haze: 1.2, elev: 1 }],
  [24, { n: 1, g: 0, blue: 0, lamp: .55, haze: 1.3, elev: 1 }],
];
function daylight(date = new Date(), continuous = false) {
  const h = date.getHours() + date.getMinutes() / 60 + (continuous ? (date.getSeconds()+date.getMilliseconds()/1000)/3600 : 0);
  let i = 1; while (i < DAY_KEYS.length - 1 && DAY_KEYS[i][0] <= h) i++;
  const [h0, a] = DAY_KEYS[i - 1], [h1, b] = DAY_KEYS[i], t = Math.min(1, Math.max(0, (h - h0) / (h1 - h0))), k = t * t * (3 - 2 * t);
  const out = { dawn: h < 12 };
  for (const key of Object.keys(a)) { const value=a[key]+(b[key]-a[key])*k;out[key]=continuous?value:Math.round(value*20)/20; }
  return out;
}
const hexMix = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), Math.min(1, Math.max(0, k))).getHex();
function blendPlace(N, L) {
  const D = N.day, n = L.n, g = L.g, mix = (a, b) => a + (b - a) * n;
  const warm = L.dawn ? 0xeaa08a : 0xee8a46, sunWarm = L.dawn ? 0xffc6a0 : 0xff8c42;
  // Morning light comes from the other side of the court than afternoon light.
  const dDir = [D.sky.dir[0] * (L.dawn ? -1 : 1), Math.max(.02, D.sky.dir[1] * L.elev), D.sky.dir[2]];
  const sky = {
    top: hexMix(hexMix(D.sky.top, N.sky.top, n), 0x1c2c56, .55 * L.blue * n),
    horizon: hexMix(hexMix(hexMix(D.sky.horizon, N.sky.horizon, n), warm, .65 * g), 0x3a4a7a, .4 * L.blue * n),
    ground: hexMix(D.sky.ground, N.sky.ground, n),
    sun: hexMix(hexMix(D.sky.sun, N.sky.sun, n), sunWarm, g),
    dir: dDir.map((v, j) => v + (N.sky.dir[j] - v) * n),
    glow: mix(D.sky.glow, N.sky.glow) + .9 * g, clouds: mix(D.sky.clouds, N.sky.clouds),
    lit: hexMix(hexMix(D.sky.lit, N.sky.lit, n), warm, .5 * g), dark: hexMix(D.sky.dark, N.sky.dark, n),
    stars: (N.sky.stars ?? 0) * n * n * (1 - .6 * L.blue), disc: mix(D.sky.disc ?? 5, N.sky.disc ?? 0),
    discEdges: (D.sky.discEdges ?? defaultDiscEdges).map((edge, index) => mix(edge, (N.sky.discEdges ?? defaultDiscEdges)[index])),
  };
  const sunScale = n < .5 ? .35 + .65 * L.elev : 1;
  return {
    sky, exposure: mix(D.exposure ?? 1,N.exposure ?? 1)*(N.bakedLighting?1:1+1.2*n), shade: mix(1, N.shade ?? 1),
    fog: [hexMix(hexMix(D.fog[0], N.fog[0], n), warm, .18 * g), mix(D.fog[1], N.fog[1]) * L.haze * (1 - .3 * g)],
    sunL: [hexMix(hexMix(D.sunL[0], N.sunL[0], n), sunWarm, .7 * g), mix(D.sunL[1], N.sunL[1]) * sunScale],
    hemi: [hexMix(hexMix(D.hemi[0],N.hemi[0],n),0xa5b2c2,N.bakedLighting?0:n*.8),hexMix(D.hemi[1],N.hemi[1],n),Math.max(mix(D.hemi[2],N.hemi[2]),N.bakedLighting?0:n*2.4)],
    bloom: [mix(D.bloom[0], N.bloom[0]), mix(D.bloom[1], N.bloom[1])],
    porch: N.porch && L.lamp > 0 ? [N.porch[0], N.porch[1] * L.lamp] : null,
  };
}

// Each place: its weather, landmark and buildings, by day and by night, and the spot where its lamp is lit.
const placeModules = {
  'pine-gate': () => import('./places/pine-gate-baked.js'),
  'bamboo-rain': () => import('./places/bamboo-rain.js'),
  'cloud-cliff': () => import('./places/cloud-cliff-baked.js'),
  'lotus-pond': () => import('./places/lotus-pond.js'),
  'sea-tide': () => import('./places/sea-tide.js'),
  'snow-roof': () => import('./places/snow-roof-baked.js'),
  'loess-cliff': () => import('./places/loess-cliff.js'),
  'highland': () => import('./places/highland.js'),
  'bell-lane': () => import('./places/bell-lane.js'),
  'valley-pagoda': () => import('./places/valley-pagoda.js'),
};
const PLACES = {};
let lastBuildYield = 0;
async function pauseBuild() {
  if (performance.now() - lastBuildYield < 6) return;
  await new Promise(resolve => setTimeout(resolve, 0)); lastBuildYield = performance.now();
}
// ---------- Spot pieces: what stands close around a lamp ----------
// Rammed loess: ochre bands laid down layer by layer, with cracks.
const loessTex = canvasTex(512, 512, (g, w, h) => {
  const rnd = mulberry32(51); g.fillStyle = '#9a7448'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 4 + rnd() * 10) { g.fillStyle = `rgba(${rnd() < .5 ? '60,38,18' : '210,170,120'},${.05 + rnd() * .12})`; g.fillRect(0, y, w, 2 + rnd() * 6); }
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(40,24,10,${rnd() * .12})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1); }
  g.strokeStyle = 'rgba(30,18,8,.35)'; for (let i = 0; i < 18; i++) { let x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - .5) * 20; y += 8 + rnd() * 16; g.lineTo(x, y); } g.stroke(); }
});
loessTex.wrapS = loessTex.wrapT = THREE.RepeatWrapping;
// Grey bricks in running bond.
const brickTex = canvasTex(512, 512, (g, w, h) => {
  const rnd = mulberry32(53); g.fillStyle = '#2a2a2c'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 16; r++) for (let c = -1; c < 5; c++) { const l = 34 + rnd() * 12; g.fillStyle = `hsl(220 4% ${l}%)`; g.fillRect(c * 128 + (r % 2) * 64 + 3, r * 32 + 3, 122, 26); for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(0,0,0,${rnd() * .12})`; g.fillRect(c * 128 + (r % 2) * 64 + rnd() * 120, r * 32 + rnd() * 26, 2 + rnd() * 6, 2); } }
});
brickTex.wrapS = brickTex.wrapT = THREE.RepeatWrapping;
// Lime plaster on a wall, a little stained toward the ground.
const plasterTex = canvasTex(512, 512, (g, w, h) => {
  const rnd = mulberry32(57); g.fillStyle = '#e8e4da'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4000; i++) { const v = 150 + rnd() * 90; g.fillStyle = `rgba(${v},${v - 6},${v - 14},${rnd() * .08})`; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 8, 2 + rnd() * 8); }
  const s = g.createLinearGradient(0, h * .6, 0, h); s.addColorStop(0, 'rgba(90,90,80,0)'); s.addColorStop(1, 'rgba(70,72,60,.35)'); g.fillStyle = s; g.fillRect(0, 0, w, h);
});
plasterTex.wrapS = plasterTex.wrapT = THREE.RepeatWrapping;
// Red paper-cuts on a lattice window: round flowers and a border.
const papercutTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#efe0c2'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#b0140e';
  const flower = (cx, cy, r) => { for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.ellipse(cx + Math.cos(a) * r * .55, cy + Math.sin(a) * r * .55, r * .38, r * .14, a, 0, Math.PI * 2); g.fill(); } g.beginPath(); g.arc(cx, cy, r * .25, 0, Math.PI * 2); g.fill(); };
  flower(w / 2, h / 2, 120); for (const [x, y] of [[90, 90], [w - 90, 90], [90, h - 90], [w - 90, h - 90]]) flower(x, y, 60);
  g.fillStyle = '#3a2416'; for (let x = 0; x <= w; x += w / 4) g.fillRect(x - 6, 0, 12, h); for (let y = 0; y <= h; y += h / 4) g.fillRect(0, y - 6, w, 12);
});
// Soot left above a flame on stone: dark at the middle, fading out.
const sootTex = canvasTex(128, 128, (g, w, h) => {
  const r = g.createRadialGradient(w / 2, h * .62, 0, w / 2, h * .62, w * .55);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.5, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});
// A run of eaves seen from below: rafters, boards, a fascia, and a row of round tile ends with drip tiles.
function eave(o) {
  const x0 = o.x0, x1 = o.x1, w = x1 - x0, cx = (x0 + x1) / 2, d = o.depth ?? 1.6, rise = o.rise ?? .55, y = o.y, z = o.z;
  const slope = Math.atan2(rise, d), L = Math.hypot(d, rise);
  const wood = M(o.wood ?? 0x2e1e14, .8, { map: grainTex }), tile = roofMat(o.tile ?? 0x3e3e40), paint = o.paint ? M(o.paint, .7) : wood;
  const board = new THREE.BoxGeometry(w, .03, L); board.rotateX(slope); put(board, wood, cx, y + rise / 2 + .1, z - d / 2);
  const roof = new THREE.BoxGeometry(w + .2, .08, L + .1); roof.rotateX(slope); put(roof, tile, cx, y + rise / 2 + .2, z - d / 2);
  for (let x = x0 + .1; x <= x1; x += .22) { const r = new THREE.CylinderGeometry(.035, .035, L, 8); r.rotateX(Math.PI / 2 + slope); put(r, paint, x, y + rise / 2 + .05, z - d / 2 + .02); }
  box(w, .14, .08, paint, cx, y + .02, z);
  const end = new THREE.CylinderGeometry(.055, .055, .05, 14); end.rotateX(Math.PI / 2);
  for (let x = x0 + .1; x <= x1; x += .2) { put(end.clone(), tile, x, y + .2, z + .04); const drip = new THREE.ConeGeometry(.07, .08, 3); drip.rotateX(Math.PI); drip.rotateY(Math.PI / 6); put(drip, tile, x + .1, y + .12, z + .03); }
  if (o.snow) {
    const snowM = M(0xe8eef6, .95), sl = new THREE.BoxGeometry(w + .3, .16, L + .1); sl.rotateX(slope); put(sl, snowM, cx, y + rise / 2 + .32, z - d / 2);
    box(w + .3, .14, .16, snowM, cx, y + .34, z + .08);
    for (let x = x0 + .07; x <= x1; x += .09 + C.rnd() * .12) { const l = .04 + C.rnd() ** 2 * .3; const ic = new THREE.ConeGeometry(.012 + l * .04, l, 6); ic.rotateX(Math.PI); put(ic, M(0xd8e4f0, .15, { metalness: .1 }), x, y + .2 - l / 2, z + .1); }
  }
}
// A column on a stone drum.
function col(x, z, h, r, m, y = 0) { put(new THREE.CylinderGeometry(r, r * 1.04, h, 20), m, x, y + h / 2 + .08, z); put(new THREE.CylinderGeometry(r * 1.45, r * 1.6, .16, 20), C.stone, x, y + .08, z); }
// A wooden balustrade: posts, top rail, mid rail and close balusters.
function rail(x0, x1, z, h, m, y = 0) {
  box(x1 - x0, .06, .08, m, (x0 + x1) / 2, y + h, z); box(x1 - x0, .05, .06, m, (x0 + x1) / 2, y + h * .45, z); box(x1 - x0, .05, .07, m, (x0 + x1) / 2, y + .05, z);
  for (let x = x0; x <= x1 + 1e-6; x += .9) box(.09, h + .06, .09, m, x, y + (h + .06) / 2, z);
  for (let x = x0 + .1; x < x1; x += .1) box(.022, h * .4, .022, m, x, y + h * .67, z);
}
// A wall with openings, as one extruded slab: rectangles, or arches with a round top.
function wallWithHoles(o) {
  const s = new THREE.Shape(); s.moveTo(o.x0, o.y0); s.lineTo(o.x1, o.y0); s.lineTo(o.x1, o.y1); s.lineTo(o.x0, o.y1); s.lineTo(o.x0, o.y0);
  for (const hl of o.holes) {
    const p = new THREE.Path(), r = (hl.x1 - hl.x0) / 2, cx = (hl.x0 + hl.x1) / 2;
    p.moveTo(hl.x0, hl.y0); p.lineTo(hl.x1, hl.y0);
    if (hl.arch) { p.lineTo(hl.x1, hl.y1 - r); p.absarc(cx, hl.y1 - r, r, 0, Math.PI, false); } else { p.lineTo(hl.x1, hl.y1); p.lineTo(hl.x0, hl.y1); }
    p.lineTo(hl.x0, hl.y0); s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: o.depth, bevelEnabled: false, curveSegments: 18 });
  const pos = g.attributes.position, uv = g.attributes.uv, k = o.uv ?? 1;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + pos.getZ(i)) * k, pos.getY(i) * k);
  g.translate(0, 0, o.z - o.depth); put(g, o.m, 0, 0, 0);
}
// A sea of cloud far below, moving fast, lit from above by the sky.
function cloudSea(o) {
  const n = C.light.n;
  const u = { uTime: { value: 0 }, uTop: { value: new THREE.Color(hexMix(0xf6f4f0, 0x6c7890, n)) }, uDeep: { value: new THREE.Color(hexMix(0xa8b2c2, 0x0e131c, n)) }, uFar: { value: new THREE.Color(o.far ?? hexMix(0xdfe4ea, 0x1c2434, n)) }, uSpeed: { value: o.speed ?? 6 } };
  const m = new THREE.ShaderMaterial({ uniforms: u, fog: false, depthWrite: true,
    vertexShader: 'uniform float uTime,uSpeed; varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); float t=uTime*uSpeed*.03;w.y+=sin(w.x*.025+t)*sin(w.z*.018+t*.6)*2.5+sin(w.x*.063+w.z*.043+t)*.9;vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uTime, uSpeed; uniform vec3 uTop, uDeep, uFar; varying vec3 vW;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h2(i), h2(i + vec2(1., 0.)), f.x), mix(h2(i + vec2(0., 1.)), h2(i + vec2(1., 1.)), f.x), f.y); }
      float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 6; i++){ s += a * n2(p); p = p * 2.07 + vec2(1.7, 9.2); a *= .5; } return s; }
      void main(){
        vec2 p = vW.xz * .006 + vec2(uTime * uSpeed * .0012, uTime * uSpeed * .0004);
        float c = fbm(p) * .65 + fbm(p * 2.3 - vec2(uTime * uSpeed * .002, 0.)) * .35;
        float lit = smoothstep(.35, .75, c);
        vec3 col = mix(uDeep, uTop, lit);
        float d = length(vW.xz - cameraPosition.xz);
        gl_FragColor = vec4(mix(col, uFar, smoothstep(300., 1400., d)), 1.);
      }` });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000,240,240).rotateX(-Math.PI / 2), m); sea.position.y = o.y; sea.userData.cast = false; C.G.add(sea);
  C.up.push((dt, t) => { u.uTime.value = t; });
}
// A line of footprints across snow.
function footprints(from, to, n, m) {
  const step = to.clone().sub(from).divideScalar(n), yaw = Math.atan2(step.x, step.z);
  for (let i = 0; i < n; i++) { const p = from.clone().addScaledVector(step, i), side = i % 2 ? 1 : -1; const g = new THREE.CircleGeometry(1, 14); g.scale(.05, .13, 1); g.rotateX(-Math.PI / 2); g.rotateY(yaw); put(g, m, p.x + Math.cos(yaw) * side * .1, p.y + .005, p.z - Math.sin(yaw) * side * .1); }
}
// A bronze bell.
function bell(x, y, z, s, m) { put(lathe([[0, 0], [.42, 0], [.44, .08], [.38, .3], [.33, .7], [.3, .9], [.16, 1], [.05, 1.12], [0, 1.12]].map(([r, h]) => [r * s, -h * s]), 40), m, x, y, z); }
function liveFlame(x,y,z,options={}){
  const g=new THREE.Group();C.G.add(g);g.position.set(x,y,z);
  const f=flameParts(g,{light:false,size:options.size??1.3});f.soft=true;f.place(0,0,0);
  f.fm.uniforms.uRadiance.value=options.radiance??1;
  if(options.halo===false)f.halo.visible=false;
  const state={g,f,power:options.power??.86,flameWorld:()=>g.getWorldPosition(V3())};
  C.up.push((dt,time)=>{
    f.tick(time,state.power,0,[],0);
    // Source fixtures give the measured wick TIP. Remove the SDF's blank
    // bottom margin from this graphic only; the ordinary visitor uses a wick
    // BASE and retains its own placement. Soft stretch varies by <=0.28 mm.
    const baseUv=.26-.2*(.35+.65*state.power);
    f.flame.position.y=-baseUv*f.fm.uniforms.uScale.value;
    f.wick.visible=false;f.ember.visible=false;
  });
  return state;
}
function pineFixtureFlame(context, position, height, seed) {
  const material = flameMaterial(false);
  material.blending = THREE.CustomBlending;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  const uniforms = material.uniforms;
  uniforms.uPineFlame.value = 1;
  uniforms.uPower.value = .82;
  uniforms.uRadiance.value = .69;
  uniforms.uSeedU.value = seed;
  uniforms.uScale.value = height / (.86 * .80);
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  flame.position.copy(position);
  flame.frustumCulled = false;
  flame.name = 'Pine shrine fixture flame';
  context.G.add(flame);
  context.up.push((_dt, time) => {
    uniforms.uTime.value = time * .52;
  });
}
function fixtureSpecular(x,y,z,watts=8,linearColor=[1,173/255,102/255]){
  const baked=C.baked,light=new THREE.PointLight(new THREE.Color().fromArray(linearColor),watts/(4*Math.PI),12,2);
  light.intensity*=baked?.fixturePower()??1;
  light.position.set(x,y,z);C.G.add(light);
  C.up.push(()=>{light.intensity=watts/(4*Math.PI)*(baked?.fixturePower()??1);});
  return light;
}
// A local reflection probe samples actual lit construction. Clone the scene
// graph while sharing immutable geometry/materials so temporary visibility and
// shadow maps never alter the active place. The cube remains scene-linear HDR.
function captureLocalEnvironment({context=C,root=context.root,environment=context.environment,fog=context.fog,position,exclude=[],size=128,near=.004,far=30}){
  if(!root?.isObject3D||!Array.isArray(position)||position.length!==3||!position.every(Number.isFinite))throw new Error('A local probe requires an actual place and world position.');
  if(![64,128,256].includes(size)||near<=0||far<=near)throw new Error('Invalid bounded local probe.');
  const scene=new THREE.Scene(),pairs=new Map();
  root.updateWorldMatrix(true,true);
  const copy=root.clone(true);
  const pair=(original,clone)=>{pairs.set(original,clone);for(let i=0;i<original.children.length;i++)pair(original.children[i],clone.children[i]);};
  pair(root,copy);copy.matrixAutoUpdate=false;copy.matrix.copy(root.matrixWorld);
  scene.add(copy);scene.environment=environment;scene.background=environment;scene.fog=fog?.clone()??null;
  for(const original of exclude){const clone=pairs.get(original);if(!clone)throw new Error('Probe exclusion is outside its source place.');clone.visible=false;}
  const cube=new THREE.WebGLCubeRenderTarget(size,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,minFilter:THREE.LinearFilter,generateMipmaps:false});
  cube.texture.colorSpace=THREE.LinearSRGBColorSpace;
  const probe=new THREE.CubeCamera(near,far,cube);probe.position.set(...position);
  const state={target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),clear:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha(),autoClear:renderer.autoClear,xr:renderer.xr.enabled,tone:renderer.toneMapping,exposure:renderer.toneMappingExposure,colorSpace:renderer.outputColorSpace,shadowEnabled:renderer.shadowMap.enabled,shadowAuto:renderer.shadowMap.autoUpdate,shadowNeeds:renderer.shadowMap.needsUpdate};
  let target;
  try{
    renderer.xr.enabled=false;renderer.autoClear=true;renderer.setScissorTest(false);
    renderer.toneMapping=THREE.NoToneMapping;renderer.toneMappingExposure=1;renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
    renderer.shadowMap.autoUpdate=true;
    probe.update(renderer,scene);target=pmrem.fromCubemap(cube.texture);
  }catch(error){target?.dispose();throw error;}
  finally{
    cube.dispose();copy.traverse(object=>{if(object.isLight)object.shadow?.dispose();});
    renderer.setRenderTarget(state.target,state.face,state.mip);renderer.setViewport(state.viewport);renderer.setScissor(state.scissor);renderer.setScissorTest(state.scissorTest);renderer.setClearColor(state.clear,state.alpha);renderer.autoClear=state.autoClear;renderer.xr.enabled=state.xr;renderer.toneMapping=state.tone;renderer.toneMappingExposure=state.exposure;renderer.outputColorSpace=state.colorSpace;renderer.shadowMap.enabled=state.shadowEnabled;renderer.shadowMap.autoUpdate=state.shadowAuto;renderer.shadowMap.needsUpdate=state.shadowNeeds;
  }
  let disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;target.dispose();const index=context.disposers.indexOf(dispose);if(index>=0)context.disposers.splice(index,1);};
  context.disposers.push(dispose);
  return{texture:target.texture,dispose,metadata:{position:[...position],size,near,far,format:'linear RGBA16F cube → PMREM',sourceRoot:root.name,excluded:exclude.map(object=>object.name),scope:'One local reflection/indirect approximation from actual lit geometry; no extra light, exposure, gain or SH.'}};
}
const placeHelpers = { THREE, V3, V2, M, roofMat, ground, pave, hallB, gateB, compound, rock, trees, peak, ridges, mist, burnerAt, postLanterns, pagoda, stairs, paifang, wallRun, water, archBridge, lotus, box, city, fall, lanterns, put, tower, smokeAt, pavingTex, petalTex, pauseBuild, eave, col, rail, wallWithHoles, cloudSea, footprints, bell, otherLamp, lathe, hexMix, addStump:(x,y,z,scale,yaw)=>addScannedStump(C.G,x,y,z,scale,yaw),
  liveFlame,pineFixtureFlame,fixtureSpecular,captureLocalEnvironment,loessTex, brickTex, plasterTex, papercutTex, grainTex, latticeTex, sootTex, windowsTex, get renderer() { return renderer; }, get context() { return C; } };
const cachedPlaces = new Map();
const sharedTextures = new Set([needleTex, leafTex, pavingTex, grainTex, tileTex, waterTex, latticeTex, softTex, petalTex, windowsTex, patina, crackleTex, holesTex, gauzeTex,gauzeNormal,gauzeRoughness, paperLatticeTex, loessTex, brickTex, plasterTex, papercutTex, sootTex]);
// Materials are left to the garbage collector rather than disposed: disposing them would also
// release their shader programs, and the next place would stall recompiling the same variants.
// The program set is bounded by the variants the ten places use.
function disposePlace(old) {
  for(const dispose of [...(old.disposers??[])])dispose();
  old.baked?.dispose();
  const materials = new Set(), textures = new Set();
  old.G.traverse(o => { if (o.geometry && !naturalResources.geometries.has(o.geometry) && ![blobGeo, trunkGeo, coneGeo, foliageGeo].includes(o.geometry)) o.geometry.dispose(); if (o.material) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) materials.add(m); });
  for (const m of materials) for (const v of Object.values(m)) if (v?.isTexture && !sharedTextures.has(v) && !naturalResources.textures.has(v)) textures.add(v);
  for (const texture of textures) texture.dispose();
  for(const r of old.reflectors??[])r.getRenderTarget().dispose();
  old.envTarget.dispose();
}

const preparingPlaces = new Map();
let preparationQueue = Promise.resolve();
function queuePlaceBuild(id) {
  const pending = preparationQueue.then(() => buildPlaceNow({ id }));
  preparationQueue = pending.catch(() => {});
  return pending;
}

export function preparePlace(id) {
  if (cachedPlaces.has(id)) return Promise.resolve(cachedPlaces.get(id));
  if (!preparingPlaces.has(id)) {
    // The baked package has its own construction context.
    const pending = id === 'pine-gate' ? buildPlaceNow({ id }, true) : queuePlaceBuild(id);
    preparingPlaces.set(id, pending);
    pending.finally(() => preparingPlaces.delete(id)).catch(() => {});
  }
  return preparingPlaces.get(id);
}
function trimPlaceCache(protectedIds) {
  while (cachedPlaces.size > 2) {
    const id = [...cachedPlaces.keys()].find(id => !protectedIds.includes(id));
    if (!id) break;
    disposePlace(cachedPlaces.get(id));
    cachedPlaces.delete(id);
  }
}
async function buildPlace(t) {
  const next = await preparePlace(t.id);
  mine.g.removeFromParent(); outside.add(mine.g);
  if (place) outside.remove(place.G);
  place = next;
  outside.add(place.G); outside.environment = place.env;
  outside.fog = new THREE.FogExp2(...place.P.fog);
  cachedPlaces.delete(t.id); cachedPlaces.set(t.id, place);
  trimPlaceCache([t.id]);
  attachMine();
}
async function buildPlaceNow(t, isolated = false) {
  const light = daylight(), lightKey = JSON.stringify(light);
  if (cachedPlaces.has(t.id)) return cachedPlaces.get(t.id);
  PLACES[t.id] ??= await (await placeModules[t.id]()).default(placeHelpers);
  if(PLACES[t.id].bakedLighting)await ensureNativeAgX();
  if(t.id==='snow-roof')await ensureVisitorFabric();
  if(!PLACES[t.id].bakedLighting)await loadNaturalAssets();
  const P = { ...PLACES[t.id], ...blendPlace(PLACES[t.id], light) }, G = new THREE.Group();
  // `shade` dims the unlit pieces (backdrop ridges, mist, smoke, rain) to match the night light.
  const context = { G, root:G, disposers:[], up: [], others: [], cover: null, bat: new Map(), seed: seedOf(t.id), rnd: mulberry32(seedOf(t.id)), snow: P.snow ?? 0, shade: P.shade ?? 1, cam: P.view.pos, tgt: P.view.look, light };
  if (!isolated) {
    C = context;
    C.materials = new Map();
    C.stone = M(0x9c968c, .85, { map: pavingTex }); C.pave = M(0xa8a296, .85, { map: pavingTex });
    C.red = M(0x8a2a1e, .9); C.col = M(0x6e1a12, .5); C.paint = M(0x2c4a52, .8); C.dark = M(0x1c1714, .6, { metalness: .5 });
  }
  const s = P.sky, dir = V3(...s.dir).normalize(), col = (h) => new THREE.Color(h);
  const u = { uTop: { value: col(s.top) }, uHorizon: { value: col(s.horizon) }, uGround: { value: col(s.ground) }, uSun: { value: col(s.sun) }, uDir: { value: dir },
    uLit: { value: col(s.lit) }, uDark: { value: col(s.dark) }, uGlow: { value: s.glow }, uClouds: { value: s.clouds }, uStars: { value: s.stars ?? 0 }, uTime: { value: 0 }, uDisc: { value: s.disc ?? 5 },
    uDiscEdges: { value: new THREE.Vector2(...(s.discEdges ?? defaultDiscEdges)) } };
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: u, vertexShader: skyVS, fragmentShader: skyFS });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), skyMat); sky.renderOrder = -1; G.add(sky);
  const skyScene = new THREE.Scene(); skyScene.add(new THREE.Mesh(sky.geometry, skyMat));
  await pauseBuild();
  const envTarget = pmrem.fromScene(skyScene, 0, .1, 1000), env = envTarget.texture;
  context.environment=env;context.fog=new THREE.FogExp2(...P.fog);
  try {
  const sun = new THREE.DirectionalLight(P.sunL[0], P.sunL[1]); sun.position.copy(dir).multiplyScalar(100);
  sun.castShadow = !P.bakedLighting; sun.shadow.mapSize.set(innerWidth<720?1024:2048,innerWidth<720?1024:2048);
  Object.assign(sun.shadow.camera,{left:-45,right:45,top:45,bottom:-45,near:.5,far:260});
  sun.shadow.bias = -.00025; sun.shadow.normalBias = .025; sun.shadow.radius = 3; G.add(sun);
  const hemi = new THREE.HemisphereLight(...P.hemi); G.add(hemi);
  await P.build(t, context);
  if (!isolated) await finishBatch();
  context.baked?.updateWaxSun?.(dir);
  // The spot where the lamp is lit, built in its own frame and set into the place.
  const N = P.nook, nookG = new THREE.Group(); nookG.position.copy(N.at.pos); nookG.rotation.y = N.at.ry ?? 0; G.add(nookG); nookG.updateMatrixWorld(true);
  context.G = nookG; context.bat = new Map(); context.cover = null;
  await N.build(placeHelpers, context);
  if (!isolated) await finishBatch();
  nookG.traverse((o) => { if (o.isMesh && !o.material.transparent && !o.isInstancedMesh) { o.receiveShadow = true; if (o.userData.cast !== false) o.castShadow = true; } if (o.isLight) o.layers.enableAll(); });
  G.traverse((o) => { if (o.isLight) o.layers.enableAll(); });
  context.G = G;
  context.up.push((dt, time) => { u.uTime.value = time; });
  const candidate = { G, disposers:context.disposers, up: context.up, sky, env, envTarget, P, id: t.id, lightKey, daylight: light, nookG, others: context.others, cover: context.cover, baked:context.baked, reflectors:context.reflectors, hemi, sun, hemiBase: hemi.intensity, sunBase: sun.intensity };
  const streamsSnowInterior = t.id === 'snow-roof'
    && context.baked?.manifest.snowCourt && context.baked.manifest.walkLightmaps;
  if (context.baked?.staticLampShadow) {
    const capture = () => context.baked.staticLampShadow.capture(renderer, context.baked.group);
    // The road preview has no visitor light. Capture its indoor shadow as
    // part of entry, before the visitor can light the lantern.
    if (streamsSnowInterior) candidate.prepareStaticLampShadow = capture;
    else await capture();
  }
  const stage = new THREE.Scene(); stage.environment = env; stage.fog = new THREE.FogExp2(...P.fog); stage.add(G);
  stage.add(previewFill.clone());
  const stageCamera = camera.clone(); stageCamera.position.copy(P.view.pos); stageCamera.lookAt(P.view.look);
  stageCamera.far = P.cameraFar ?? 1500; stageCamera.updateProjectionMatrix();
  // Never leave a render target bound across an await: the live cover's next
  // frame must still reach its normal framebuffer while shaders link.
  let visitorPreview;
  const target = renderer.getRenderTarget(), warm = new THREE.WebGLRenderTarget(4, 4);
  try {
    // A streamed Snow Court opens on the road. Its visitor lamp shaders can
    // link with the actual lamp when the player reaches the hall.
    await renderer.compileAsync(stage, stageCamera);
    if (P.bakedLighting && P.nook.lamp === 'gauze' && !streamsSnowInterior) {
      visitorPreview = LAMPS.gauze({ ...presetOf('shade'), liveBaked: true });
      const basis = context.baked.manifest.lampBasis.position;
      visitorPreview.g.position.set(...basis); stage.add(visitorPreview.g);
      const point = new THREE.PointLight(0xffb070, 1, 6, 2);
      point.position.set(...basis); point.castShadow = true; point.shadow.mapSize.set(512, 512); stage.add(point);
      await renderer.compileAsync(stage, stageCamera);
    }
    renderer.setRenderTarget(warm); renderer.render(stage, stageCamera);
  }
  finally {
    renderer.setRenderTarget(target); warm.dispose(); stage.remove(G);
    if(visitorPreview)disposeTree(visitorPreview.g);
    stage.traverse(object => object.shadow?.dispose());
  }
  const pineOpening = N.lamp === 'pineWax' && context.baked?.waxNormal;
  if(P.bakedLighting&&context.baked&&(N.lamp==='gauze'||pineOpening)){
    const basis=context.baked.manifest.lampBasis.position;
    const probe = () => {
      context.baked.update(candidate.daylight, 0, V3(...basis));
      // A prepared place may already own the hidden visitor pivot. Exclude
      // it and the distant projection from the deferred room probe.
      const exclude = streamsSnowInterior
        ? [context.baked.backdrop.group, candidate.visitorPivot].filter(Boolean)
        : [];
      return captureLocalEnvironment({ context, root: G, environment: env, fog: stage.fog,
        position: [...basis], exclude, size: 64, near: .01, far: pineOpening ? stageCamera.far : 30 });
    };
    if (streamsSnowInterior) candidate.prepareVisitorEnvironment = probe;
    else candidate.visitorEnvironment = probe();
  }
  cachedPlaces.set(t.id, candidate);
  // Preserve a prepared Pine Gate while the cover is still on screen.
  // Attaching either choice trims the transitional cache back to two.
  const protectedIds = [place?.id, t.id];
  if (place?.id === COVER) protectedIds.push('pine-gate');
  trimPlaceCache(protectedIds);
  return candidate;
  } catch (error) {
    cachedPlaces.delete(t.id);
    disposePlace({ G, envTarget, disposers:context.disposers, baked: context.baked, reflectors: context.reflectors });
    throw error;
  }
}

// ---------- Camera rig and tweens ----------
const rig = { pos: V3(0, 1.35, 2.3), look: V3(0, 1, -1), amp: .006, fov: null };
let cameraJourneyVersion=0;
let choiceCameraVersion=0;
const active = outside;
const tweens = [];
function tween(dur, fn, finishWhenDue = false) {
  if (reducedMotion.matches) { fn(1); return Promise.resolve(); }
  return new Promise(res => {
    const tw = { t: 0, dur, fn, res, skip: false };
    tweens.push(tw);
    if (finishWhenDue) tw.deadline = setTimeout(() => {
      const index = tweens.indexOf(tw);
      if (index === -1) return;
      tweens.splice(index, 1);
      fn(1);
      res();
    }, dur * 1000);
  });
}
function skipTweens() { for (const tw of tweens) tw.skip = true; }
function moveCam(pos, look, dur, fov) {
  const p0 = rig.pos.clone(), l0 = rig.look.clone(),f0=rig.fov??camera.fov,f1=fov??(narrow()?44:32);
  return tween(dur, (k) => { const e = ease(k); rig.pos.lerpVectors(p0, pos, e); rig.look.lerpVectors(l0, look, e);rig.fov=THREE.MathUtils.lerp(f0,f1,e); });
}
const fadeEl = document.getElementById('fade');
const fadeTo = (o, ms = 600) => new Promise((res) => { if (reducedMotion.matches) ms = 80; fadeEl.style.transitionDuration = ms + 'ms'; fadeEl.style.opacity = o; setTimeout(res, ms); });

// ---------- Views around the lamp ----------
// Views at the lamp are written in the spot's own frame; these turn them into the world.
const COVER = 'cloud-cliff';
const narrow = () => innerWidth < 720;
const toWorld = (v) => place.nookG.localToWorld(v.clone());
const viewOf = (v) => {
  const pos = toWorld(v.pos), look = toWorld(v.look);
  if (!narrow() || place.P.bakedLighting || place.P.nook.lamp === 'pineWax') return { pos, look, fov:v.fov };
  // A narrow screen pulls the same view back along its line.
  return { pos: look.clone().add(pos.sub(look).multiplyScalar(1.45)), look };
};
const coverView = () => viewOf(narrow()&&place.P.nook.coverPhone?place.P.nook.coverPhone:place.P.nook.cover);
// Framing uses the full-day lamp as a fixed reference, so choosing a shorter
// burn changes the shade but never moves the camera: the size difference stays
// visible instead of being cancelled by a refit.
const LANTERN_REFERENCE = { h: .76, cy: -.35 };
// `exact` places the camera at the distance the reference demands, so the
// cloth fills the requested fraction of the frame. Without it the authored
// viewpoint only pulls back if it would otherwise be too close.
function fitShadeView(v,desktopFraction=.45,desktopSubjectY=.36,exact=false,phoneYaw=0){
  if (!place.P.bakedLighting || place.P.nook.lamp !== 'gauze' || !mine.parts?.frame) return v;
  const c=mine.g.localToWorld(V3(0,LANTERN_REFERENCE.cy,0));
  const offset=V3(v.pos.x-c.x,0,v.pos.z-c.z),base=offset.length();
  // On a phone the sheet covers the lower two thirds, so the lamp must sit in
  // the visible band with its cord and tassel above the altar stand rather than
  // over it. Raising the subject within the frame gives that gap without
  // touching the stand, the shade or any asset.
  const fraction=narrow()?.21:desktopFraction,subjectY=narrow()?.17:desktopSubjectY;
  const tangent=Math.tan(THREE.MathUtils.degToRad(v.fov/2));
  const wanted=LANTERN_REFERENCE.h/(2*tangent*fraction);
  const distance=exact?wanted:Math.max(base,wanted);offset.setLength(distance);
  // The phone stand sits directly under the shade, so raising the subject cannot
  // separate them. Swing the camera around the lamp instead: the shade and its
  // tassel move off the stand's screen column while the stand stays put.
  if(narrow()&&phoneYaw)offset.applyAxisAngle(V3(0,1,0),phoneYaw);
  v.pos.x=c.x+offset.x;v.pos.z=c.z+offset.z;
  const pitch=Math.atan2(c.y-v.pos.y,distance)-Math.atan((1-2*subjectY)*tangent);
  v.look.set(c.x,v.pos.y+Math.tan(pitch)*distance,c.z);return v;
}
// B5: the phone choose view swings this far around the lamp so the shade and
// its tassel clear the altar stand's screen column.
const CHOOSE_PHONE_YAW=.22;
const chooseView = () => {
  const N = place.P.nook;
  if (N.lamp === 'pineWax' && narrow()) {
    // The phone sheet starts 300 pixels down. Frame the front of the holder
    // just above it, backing up only as much as the tallest profiles need.
    const pos = N.choosePhone.pos.clone(), look = N.choosePhone.look.clone(), fov = N.choosePhone.fov;
    const wax = mine.parts?.pineWax;
    pos.z = Math.max(pos.z, (wax?.fullHeight() ?? .08) * 6.5) * Math.max(1, innerHeight / 844);
    const shelfPixel = Math.min(272, innerHeight * .38);
    const seatY = mine.parts?.seat?.y ?? .008;
    const elevation = Math.atan2(N.y + seatY - pos.y, Math.hypot(pos.x, pos.z - .065));
    const screenAngle = Math.atan((1 - 2 * shelfPixel / innerHeight) * Math.tan(THREE.MathUtils.degToRad(fov / 2)));
    look.y = pos.y + Math.tan(elevation - screenAngle) * Math.hypot(pos.x, pos.z);
    return viewOf({ pos, look, fov });
  }
  const v=viewOf((narrow()&&N.choosePhone)||N.choose||N.wide);
  if (N.steadyIgnition) return v;
  if(narrow()&&!place.P.bakedLighting&&N.lamp!=='pineWax')v.look.y-=v.pos.distanceTo(v.look)*.10;
  return fitShadeView(v, undefined, undefined, false, CHOOSE_PHONE_YAW);
};
function burnView(){
  const N=place.P.nook,v=viewOf((narrow()&&N.burnPhone)||N.burn);
  if (place.P.bakedLighting && mine.parts?.pineWax) {
    const candle = mine.parts.pineWax;
    const profile = candle.profileBounds();
    const bodyHeight = candle.fullHeight();
    const subjectHeight = bodyHeight + .040;
    const center = mine.g.localToWorld(V3((profile.min.x + profile.max.x) / 2,
      mine.parts.seat.y + subjectHeight * (bodyHeight < .028 ? .43 : .5), 0));
    const direction = v.pos.clone().sub(center).normalize();
    const bodyFacingCamera = bodyHeight * Math.hypot(direction.x, direction.z);
    const halfFov = THREE.MathUtils.degToRad(v.fov / 2);
    const fraction = bodyHeight > .125 ? .211 : .225;
    const distance = Math.max(narrow() ? .43 : .36, bodyFacingCamera / (2 * Math.tan(halfFov) * fraction));
    // Compose from the original wax alone. Reserve space for the intact flame,
    // and keep very wide hand-drawn shapes inside the phone's narrower frame.
    const tangent = Math.max(bodyFacingCamera / (2 * distance * fraction),
      (profile.max.x - profile.min.x) / (2 * distance * camera.aspect * .79), subjectHeight / (2 * distance * .84));
    v.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tangent));
    v.pos.copy(center).addScaledVector(direction, distance);
    v.look.copy(center);
    return v;
  }
  if(!N.burnFar)return v;
  const fuelProfile=mine.offer?.rows?.at(-1)?.y;
  const originalSize=fuelProfile?fuelProfile*3.8+.2:mine.parts.frame.h;
  const far=viewOf((narrow()&&N.burnFarPhone)||N.burnFar),k=THREE.MathUtils.clamp((originalSize-.45)/.32,0,1);
  v.pos.lerp(far.pos,k);v.look.lerp(far.look,k);v.fov=THREE.MathUtils.lerp(v.fov,far.fov,k);
  // J5: on a wide screen the settled burning view showed the lantern cloth at
  // about 15% of frame height, so the floor dominated. The reference frame is
  // 0.76 m tall and its cloth is the top 0.56 m, so requesting 0.33 of the
  // frame puts the full-day cloth near 24% and the ten-minute cloth near 15%.
  // Only the camera moves; the authored direction out of the altar stays.
  return narrow()?v:fitShadeView(v,.33,.34,true);
}
// The person's lamp lives in the current place's spot.
function attachMine() {
  const N = place.P.nook;
  if(place.baked&&N.lamp==='gauze'){
    place.visitorPivot??=new THREE.Group();place.visitorPivot.userData.visitorPivot=true;
    const basis=place.baked.manifest.lampBasis.position;
    place.visitorPivot.position.copy(place.nookG.worldToLocal(V3(...(N.hangingPoint??[basis[0],3.22,basis[2]]))));
    place.visitorPivot.rotation.set(0,0,0);place.nookG.add(place.visitorPivot);place.visitorPivot.add(mine.g);
  }else place.nookG.add(mine.g);
  mine.g.position.set(0, N.y, 0);
  mine.g.rotation.set(0,0,0);
  mine.setType(N.lamp);
  const fixedIndirectBasis = place.baked?.manifest.bake?.lampPassQuantity === 'indirect-diffuse-radiance-per-unit-albedo';
  mine.setShadowFar(fixedIndirectBasis && N.lamp !== 'pineWax' ? 80 : 6);
  mine.mirrorY = N.mirror ?? null;
  mine.lightBoost = place.baked ? place.baked.lampCandela / mine.parts.lightMax : 1;
  mine.lightTint = place.baked?.lampColor ?? null;
}

// Wick smoke uses a wide, centreless puff so overlapping puffs read as one thread, not a string of beads.
const smokeTex = canvasTex(64, 64, (g, w, h) => {
  const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  r.addColorStop(0, 'rgba(255,255,255,.55)'); r.addColorStop(.5, 'rgba(255,255,255,.28)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});
const wickPlume=new WickPlume({scene:outside,map:smokeTex});
let pineDiagnosticView = null;
if (import.meta.env.DEV) {
  window.__visualWickPlume = () => wickPlume.state();
  window.__visualPineWax = () => {
    if (!mine.g.visible || mine.offer?.kind !== 'candle' || !mine.parts?.pineWax) return null;
    const wax = mine.parts.pineWax;
    const state = wax.state();
    camera.updateMatrixWorld();
    const body = wax.group.getObjectByName('Pine wax body');
    const positions = body.geometry.getAttribute('position');
    let framedFraction = 0;
    if (body.visible && positions?.count) {
      body.updateWorldMatrix(true, false);
      const point = V3();
      let bottom = Infinity, top = -Infinity;
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const y = point.fromBufferAttribute(positions, vertex)
          .applyMatrix4(body.matrixWorld).project(camera).y;
        bottom = Math.min(bottom, y);
        top = Math.max(top, y);
      }
      framedFraction = (top - bottom) / 2;
    }
    return { ...state, baked: !!place?.baked, framedFraction };
  };
  window.__visualPineCloseup = () => { pineDiagnosticView = 'closeup'; };
  window.__visualPineFarView = () => { pineDiagnosticView = 'far'; };
  window.__visualPineContactView = () => { pineDiagnosticView = 'contact'; };
  window.__visualPineCloseupRestore = () => { pineDiagnosticView = null; };
}
let shadeCoolingUntil=0,shadeCoolingGlow=0,shadeCoolingStart=0,shadeCoolingTau=0, emberUntil = 0, wind = 0, roomLight = 1, ignitionFill=0;
let pointerX = 0, pointerY = 0, previousPointerX = 0;
window.addEventListener('pointermove', (e) => {
  pointerX = e.clientX / innerWidth * 2 - 1; pointerY = 1 - e.clientY / innerHeight * 2;
  if (lit) { const p = mine.flameWorld().clone().project(camera);
    const near = Math.max(0, 1 - Math.hypot(pointerX - p.x, pointerY - p.y) / .5);
    wind = Math.max(-.5, Math.min(.5, wind + (pointerX - previousPointerX) * near * 4)); }
  previousPointerX = pointerX;
}, { passive: true });

// ---------- Public API ----------
// On the cover the lamp already burning there is the subject, drawn sharp in front of the blurred scene.
function coverLayers() { place?.cover?.g.traverse((o) => { if (!o.isLight) o.layers.set(0); }); }
export function setPhase(next) { phase = next; coverLayers(); }
export function setPowerSaver(on) { powerSaver = on; resize(); }

let level = 1, targetLevel = 1, lit = false, wanted = null, previewTask = null, skipNextTravel = false;
let waxFuel = null;

function toOffer(shape) {
  if (!shape) return null;
  return { kind: shape.kind, rows: shape.rows, color: shape.color, burn: burnOf(shape.rows) };
}
/** Show the person's candle or lamp (or hide it with null), full. */
export function setOffer(shape) {
  const o=toOffer(shape);level=targetLevel=1;mine.g.visible=!!o&&atLamp;
  waxFuel = null;
  if(o)mine.setOffer(o);else mine.offer=null;
  if(o&&atLamp&&phase==='candle'&&(place?.P.bakedLighting||(mine.parts?.pineWax&&narrow()))){
    const v=chooseView(),version=++choiceCameraVersion;
    if(rig.pos.distanceTo(v.pos)>.015||rig.look.distanceTo(v.look)>.015){
      const p0=rig.pos.clone(),l0=rig.look.clone(),f0=rig.fov??camera.fov;
      void tween(1.2,k=>{if(version!==choiceCameraVersion||phase!=='candle')return;const e=ease(k);rig.pos.lerpVectors(p0,v.pos,e);rig.look.lerpVectors(l0,v.look,e);rig.fov=THREE.MathUtils.lerp(f0,v.fov,e);});
    }
  }
}
let atLamp = false; // the person has walked in and stands at their lamp
/** Remaining fraction of the wax or oil, 1 = untouched. */
export function setLevel(L) { targetLevel = Math.max(0, Math.min(1, L)); }

let thumbnailStage, thumbnailQueue=Promise.resolve();
const thumbnailCache=new Map();
async function makeThumbnailStage(){
  const lease=await acquireNativeAgX({url:'/color/native-agx-57-f16.bin.zst',precision:'float16'});
  const view=new NativeAgXPass(lease,{cameraExposureEV:0});
  const scene=new THREE.Scene(),group=new THREE.Group();scene.add(group);
  scene.background=new THREE.Color(0x171410);scene.environment=spotEnv;
  scene.add(new THREE.HemisphereLight(0xdacbb9,0x30251d,.85));
  const soft=new THREE.PointLight(0xffd9ae,.65,0,2);soft.position.set(-.5,.7,.8);scene.add(soft);
  const gauzeKey=new THREE.DirectionalLight(0xe4dbc2,gauzePreviewIntensity),gauzeTarget=new THREE.Object3D();scene.add(gauzeKey,gauzeTarget);gauzeKey.target=gauzeTarget;
  const waxKey = new THREE.DirectionalLight(0xf7e7d0, 2.2);
  waxKey.position.set(-.55, .75, .9);
  scene.add(waxKey);
  const rim=new THREE.PointLight(0xa4b6ca,.12,0,2);rim.position.set(.6,.4,-.5);scene.add(rim);
  const flame=flameParts(group);flame.soft=true;flame.fm.uniforms.uSeedU.value=2.1;
  const camera=new THREE.PerspectiveCamera(30,2/3,.005,20);
  const linear=new THREE.WebGLRenderTarget(120,180,{type:THREE.HalfFloatType,samples:geometrySamples});
  const mapped=new THREE.WebGLRenderTarget(120,180,{type:THREE.HalfFloatType});
  const output=new THREE.WebGLRenderTarget(120,180);
  const pass=new OutputPass();pass.renderToScreen=false;
  return{scene,group,flame,camera,soft,gauzeKey,gauzeTarget,waxKey,linear,mapped,output,pass,view,parts:null,key:null};
}
async function drawLampThumbnail(shape,{state,remaining,width,height}){
  thumbnailStage??=await makeThumbnailStage();
  const stage=thumbnailStage,w=Math.max(32,Math.min(256,Math.round(width))),h=Math.max(32,Math.min(256,Math.round(height)));
  const key=JSON.stringify([shape.kind,shape.color,shape.rows]);
  if(stage.key!==key){
    if(stage.parts){
      stage.group.remove(stage.parts.g);
      disposeTree(stage.parts.g);
    }
    const input={...shape,liveBaked:true};
    stage.parts = shape.kind === 'shade' ? LAMPS.gauze(input) : shape.kind === 'oil' ? LAMPS.glass(input)
      : LAMPS.pineWax({ refined: true });
    if (stage.parts.pineWax) {
      stage.parts.setShape(shape);
      stage.parts.pineWax.group.visible = true;
    }
    stage.group.add(stage.parts.g);stage.parts.g.traverse(warmReflections);stage.key=key;
  }
  const parts=stage.parts,power=state==='burning'?1:0,fuel=Math.max(0,Math.min(1,remaining));
  stage.flame.wick.visible = !parts.wickMesh && !parts.pineWax;
  let wick=parts.wick?.at?.clone()??V3(0,.03,0);
  const waxProfile = !!parts.pineWax && state === 'unlit';
  if (parts.pineWax) {
    parts.holder.visible = parts.shelfContact.visible = !waxProfile;
    parts.pineWax.update(fuel, state, wick);
  } else if(parts.kind==='oil'&&parts.wick.float){
    const V=parts.vessel,[i,k]=findCum(V.cum,fuel*V.vol);wick=V3(0,THREE.MathUtils.lerp(V.ys[i-1],V.ys[i],k)+parts.wick.float,0);
  }
  stage.flame.place(wick.x,wick.y,wick.z);stage.flame.size=parts.flame??1;
  const reference=shape.kind==='shade'?GAUZE_CANDLE_REFERENCE:null;
  stage.view.uniforms.cameraExposureEV.value=reference?.cameraExposureEV??0;
  const shadeKeep=.35+.65*Math.min(1,fuel*1.4);
  if (reference) stage.flame.light.color.fromArray(reference.linearColor);
  else stage.flame.light.color.setHex(parts.light ?? 0xffba78);
  stage.flame.tick(17,power,reference?reference.watts*reference.cameraPreExposure/(4*Math.PI)*shadeKeep:(parts.lightMax??.9),parts.pineWax?.materials ?? [],wick.y);
  parts.pineWax?.updateLight(stage.flame.light);
  for (const material of parts.pineWax?.materials ?? []) material.userData.u.uGlow.value *= .52;
  stage.flame.flame.visible=stage.flame.halo.visible=power>0;stage.flame.ember.visible=false;
  stage.flame.wick.material.color.setHex(state==='unlit'?0x4c3d2b:0x15100c);
  stage.group.updateMatrixWorld(true);
  for(const material of parts.shells??[]){
    const u=material.userData.u;u.uFlame.value.copy(wick);u.uGlow.value=2.4*material.userData.strength*power;
    if(material.userData.cloth&&reference){
      material.sheen=0;material.specularIntensity=0;
      u.uClothPhysical.value=1;stage.flame.light.getWorldPosition(u.uFlame.value);u.uClothIntensity.value=stage.flame.light.intensity;u.uClothSourceRGB.value.copy(stage.flame.light.color);
      u.uClothEmitterRadius.value=reference.pointRadiusMetres;u.uClothTransmissionWeight.value=reference.transport?.diffuseTransmissionWeight??GAUZE_CANDLE_REFERENCE.diffuseTransmissionWeight;
      u.uClothReflectionWeight.value=reference.diffuseReflectionWeight??.35;
    }
  }
  stage.group.updateMatrixWorld(true);
  // Framing follows the original wax, so two portraits of the same candle show the height difference.
  const bounds = waxProfile ? parts.pineWax.profileBounds()
    : parts.pineWax ? new THREE.Box3(V3(-.07, 0, -.07), V3(.07, parts.seat.y + parts.pineWax.fullHeight() + .043, .07))
    : new THREE.Box3().setFromObject(parts.g);
  const size=bounds.getSize(V3()),center=bounds.getCenter(V3());
  const tangent=Math.tan(Math.PI/12),distance=Math.max(size.y/(2*tangent*.82),size.x/(2*tangent*(w/h)*.82));
  stage.camera.aspect=w/h;stage.camera.position.copy(center).add(V3(distance*.25,distance*.10,distance));stage.camera.lookAt(center);stage.camera.updateProjectionMatrix();
  stage.waxKey.visible = !!parts.pineWax && state !== 'burning';
  stage.scene.background.setHex(parts.pineWax ? 0x25201d : 0x171410);
  stage.soft.visible=shape.kind!=='shade';stage.gauzeKey.visible=shape.kind==='shade'&&state!=='burning';
  stage.gauzeKey.intensity=gauzePreviewIntensity*(state==='unlit'?1:.55);
  if(stage.gauzeKey.visible)aimGauzePreview(stage.gauzeKey,stage.gauzeTarget,center,stage.camera.position);
  stage.flame.flame.quaternion.copy(stage.camera.quaternion);
  stage.linear.setSize(w,h);stage.mapped.setSize(w,h);stage.output.setSize(w,h);
  const target=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel(),viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest();
  const clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
  const tone=renderer.toneMapping,exposure=renderer.toneMappingExposure;
  const bytes=new Uint8Array(w*h*4);
  try{
    renderer.toneMapping=THREE.NoToneMapping;renderer.toneMappingExposure=1;
    renderer.setScissorTest(false);renderer.setRenderTarget(stage.linear);renderer.clear();renderer.render(stage.scene,stage.camera);
    stage.view.render(renderer,stage.mapped,stage.linear);
    stage.pass.render(renderer,stage.output,stage.mapped);
    renderer.readRenderTargetPixels(stage.output,0,0,w,h,bytes);
  }finally{
    renderer.toneMapping=tone;renderer.toneMappingExposure=exposure;
    renderer.setRenderTarget(target,face,mip);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);renderer.setClearColor(clear,alpha);
  }
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const pixels=new Uint8ClampedArray(bytes.length);
  for(let y=0;y<h;y++)pixels.set(bytes.subarray(y*w*4,(y+1)*w*4),(h-1-y)*w*4);
  canvas.getContext('2d').putImageData(new ImageData(pixels,w,h),0,0);
  return canvas.toDataURL('image/png');
}
/** Portraits use the same vessel builders and materials as the actual lamp. */
export function renderLampThumbnail(shape,options){
  const fuelKey = shape.kind === 'candle' ? options.remaining : Math.round(options.remaining * 100);
  const key=JSON.stringify([GAUZE_CANDLE_REFERENCE.revision,shape,options.state,fuelKey,options.width,options.height]);
  if(thumbnailCache.has(key))return thumbnailCache.get(key);
  const request=thumbnailQueue.then(()=>{ if (shape.kind === 'shade') return ensureVisitorFabric(); }).then(()=>new Promise(resolve=>requestAnimationFrame(resolve))).then(()=>drawLampThumbnail(shape,options));
  thumbnailQueue=request.catch(()=>{});thumbnailCache.set(key,request);
  request.catch(()=>thumbnailCache.delete(key));
  while(thumbnailCache.size>64)thumbnailCache.delete(thumbnailCache.keys().next().value);
  return request;
}

async function showPlace(id) {
  if (place?.id !== id) await buildPlace({ id });
  attachMine(); coverLayers();
}
/** Show a place from outside while it is being chosen. */
export function previewPlace(id) {
  cameraJourneyVersion++;choiceCameraVersion++;
  wanted = id;
  // A new choice can arrive while an earlier fade is in progress. Keep both
  // callers waiting for the scene that finally appears.
  previewTask ??= Promise.resolve().then(showRequestedPreview);
  return previewTask;
}
async function showRequestedPreview() {
  try {
    while (wanted && (place?.id !== wanted || rig.amp < 1)) {
      const w = wanted;
      await preparePlace(w);
      if (wanted !== w) continue;
      await fadeTo(1, 200);
      atLamp = false; mine.g.visible = false;
      await showPlace(w);
      const p=PLACES[w],v=(narrow()&&p.viewPhone)||p.view;rig.pos.copy(v.pos);rig.look.copy(v.look);rig.amp=1;rig.fov=v.fov??null;
      await fadeTo(0, 400);
    }
  } finally { previewTask = null; }
}

/** Back to the cover: the cliff gallery over the clouds, one lamp already burning (the wish screen). */
export async function toCover() {
  cameraJourneyVersion++;choiceCameraVersion++;
  wanted = null; while (previewTask) await previewTask.catch(() => {}); roomLight = 1;
  await fadeTo(1, 400);
  atLamp = false; mine.g.visible = false;
  await showPlace(COVER);
  rig.amp = .006; const v = coverView(); rig.fov=v.fov??null; rig.pos.copy(v.pos); rig.look.copy(v.look);
  await fadeTo(0, 600);
}

/** Walk in from outside, through the place, to its lamp, ready to choose. One continuous walk. */
export async function travel(id) {
  cameraJourneyVersion++;
  skipNextTravel = false;
  wanted = null; while (previewTask) await previewTask.catch(() => {});
  if (place?.id !== id) {
    await fadeTo(1, 200); await showPlace(id);
    const p=PLACES[id],v=(narrow()&&p.viewPhone)||p.view;rig.pos.copy(v.pos);rig.look.copy(v.look);rig.amp=1;rig.fov=v.fov??null;await fadeTo(0,267);
  }
  if (place.prepareStaticLampShadow) {
    await place.prepareStaticLampShadow();
    place.prepareStaticLampShadow = null;
  }
  if (place.prepareVisitorEnvironment && !place.visitorEnvironment) {
    // Sample the hall after the road is usable and before the route moves.
    // Refresh the existing offer so it uses the same indoor reflection from
    // the first frame in the chooser.
    place.visitorEnvironment = place.prepareVisitorEnvironment();
    if (mine.offer) {
      mine.partsKey = null;
      mine.setOffer(mine.offer);
    }
  }
  place.baked?.startWalkLightmaps?.();
  place.baked?.backdrop?.startWalk();
  if (!narrow() && !touchPrimary.matches && !powerSaver) {
    const entering = place, started = performance.now();
    entering.baked?.backdrop?.startDesktopHigh();
    // On the closed forest ascent the site across the ridge is still hidden.
    entering.baked?.highTrees?.start(() => place === entering && phase === 'travel'
      && rig.pos.z > 14 && performance.now() - started < 8000);
  }
  const P = place.P, N = P.nook, arrival=viewOf((narrow()&&N.widePhone)||N.wide),end=P.bakedLighting?chooseView():arrival;
  const pts = [rig.pos.clone(), ...P.walk, ...(N.approach ?? []).map(toWorld), ...(P.bakedLighting&&arrival.pos.z>end.pos.z+.1?[arrival.pos]:[]),...(((narrow()&&N.chooseApproachPhone)||N.chooseApproach)??[]).map(toWorld),end.pos];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const lookPts = [P.doors.clone(), ...(N.approach ?? []).map((q) => toWorld(q.clone().add(V3(0, 0, -2)))), end.look];
  const l0 = rig.look.clone(), a0 = rig.amp,f0=rig.fov??camera.fov;
  atLamp = !P.offerAfterTravel; mine.g.visible = atLamp && !!mine.offer;
  const authoredWalk = P.createWalk?.({ pos: rig.pos.clone(), look: l0, fov: f0 }, end, narrow());
  if(import.meta.env.DEV)window.__walkProgress={id,progress:0,state:'walking',position:rig.pos.toArray()};
  const walk = tween(P.walkSeconds ?? 14, (k) => {
    if (authoredWalk) {
      authoredWalk(k, rig);
      if(import.meta.env.DEV)window.__walkProgress={id,progress:k,state:'walking',position:rig.pos.toArray()};
      return;
    }
    // Arc length keeps each metre at the same walking speed. Short ramps start
    // and stop the walk without the rush through the middle of a cubic ease.
    const r=.08, steady=k<r?k*k/(2*r*(1-r)):k>1-r?1-(1-k)*(1-k)/(2*r*(1-r)):(k-r*.5)/(1-r);
    const e = P.bakedLighting ? steady : ease(k);
    rig.pos.copy(P.bakedLighting ? curve.getPointAt(e) : curve.getPoint(e));
    // Look ahead toward the gate first, then along the way in, then at the lamp.
    const seg = Math.min(lookPts.length - 1, e * (lookPts.length - .2)), i = Math.floor(seg), f = seg - i;
    const target = lookPts[i].clone().lerp(lookPts[Math.min(lookPts.length - 1, i + 1)], f);
    if(P.bakedLighting){
      const forward=curve.getTangentAt(Math.min(.999,e));
      target.copy(rig.pos).addScaledVector(forward,6);target.y=rig.pos.y+.08;
      if (N.lamp === 'gauze') {
        // The turn from the walking heading to the chooser heading is spread over the
        // last fifth of the walk; compressed into the final second it swung the camera
        // by roughly 70 CSS px per frame and read as a cut.
        target.lerp(arrival.look,smooth(.70,.86,e));target.lerp(end.look,smooth(.84,1,e));
        // Distance-driven fov: from the last stretch of the walk the field of view
        // grows exactly as fast as the camera closes in, so the shade keeps a constant
        // size on screen instead of shrinking, and it arrives at the chooser's fov by
        // the time the walk ends. Clamped between the walking fov and the chooser fov.
        const lampC=mine.g.getWorldPosition(V3()), dNow=Math.hypot(rig.pos.x-lampC.x,rig.pos.z-lampC.z);
        const dEnd=Math.hypot(end.pos.x-lampC.x,end.pos.z-lampC.z);
        const fovEnd=end.fov??f0;
        const wanted=fovEnd===f0?f0:2*Math.atan(Math.tan(THREE.MathUtils.degToRad(fovEnd/2))*dEnd/Math.max(.001,dNow))*180/Math.PI;
        rig.fov=Math.min(Math.max(f0,fovEnd),Math.max(Math.min(f0,fovEnd),wanted));
      } else {
        target.lerp(arrival.look,smooth(.78,.92,e));target.lerp(end.look,smooth(.93,1,e));
        const contextFov=THREE.MathUtils.lerp(f0,arrival.fov??f0,smooth(.72,.88,e));
        rig.fov=THREE.MathUtils.lerp(contextFov,end.fov??f0,smooth(.91,1,e));
      }
      rig.look.lerpVectors(l0,target,Math.min(1,e*7));rig.amp=0;
    }else{
      rig.look.lerpVectors(l0,target,Math.min(1,e*4));rig.amp=a0*(1-Math.min(1,k*3))+.006;
    }
    if(import.meta.env.DEV)window.__walkProgress={id,progress:e,state:'walking',position:rig.pos.toArray()};
  });
  if (skipNextTravel) skipTweens();
  await walk;
  if(import.meta.env.DEV)window.__walkProgress={id,progress:1,state:'done',position:rig.pos.toArray()};
  if (P.createChooseEntry) {
    const entry = P.createChooseEntry({ pos: rig.pos.clone(), look: rig.look.clone(), fov: rig.fov ?? camera.fov }, end);
    if (skipNextTravel || reducedMotion.matches) entry(1, rig);
    else await tween(P.entrySeconds, progress => entry(progress, rig), true);
  } else if (P.chooseEntry) {
    // The court reveal belongs to the walk. Approaching the lamp table is a
    // separate, continuous move that keeps the doorway on the sightline.
    const entry = new THREE.CatmullRomCurve3([rig.pos.clone(), ...P.chooseEntry, end.pos],
      false, 'centripetal');
    const entryLook = rig.look.clone(), entryFov = rig.fov ?? camera.fov;
    const settle = t => {
      rig.pos.copy(entry.getPointAt(t));
      rig.look.lerpVectors(entryLook, end.look, smooth(0, 1, t));
      rig.fov = THREE.MathUtils.lerp(entryFov, end.fov ?? entryFov, t);
    };
    if (skipNextTravel || reducedMotion.matches) settle(1);
    // Even when the last frame misses its display slot, finish the handoff
    // at the authored pose so the chooser does not wait for another frame.
    else await tween(5.6, settle, true);
  }
  if(!P.bakedLighting){const c = chooseView(); await moveCam(c.pos, c.look,2.4,c.fov);}
  if (P.offerAfterTravel && place?.P === P) {
    atLamp = true;
    mine.g.visible = !!mine.offer;
  }
}
export function skip() { skipNextTravel = true; skipTweens(); }
let ignitionTaper;
function makeIgnitionTaper(){
  const g=new THREE.Group();outside.add(g);g.visible=false;
  solid(g,new THREE.CylinderGeometry(.003,.004,.19,12),new THREE.MeshStandardMaterial({color:0xdfc9a3,roughness:.86}),0,-.10,0);
  solid(g,new THREE.CylinderGeometry(.007,.008,.055,12),new THREE.MeshStandardMaterial({color:0x71563a,metalness:.65,roughness:.48}),0,-.2,0);
  solid(g,new THREE.CylinderGeometry(.005,.007,1.18,12),lampWood,0,-.8,0);
  const casters = g.children.filter(child => child.castShadow);
  const f=flameParts(g,{light:false,size:.55});f.soft=true;f.place(0,0);
  // The lighting pole enters from the right; its grip remains beyond the frame.
  g.rotation.set(-.22,0,-.95);
  return { g, f, casters };
}
/** Light the flame (animation only; the burn clock lives in the UI). */
export async function ignite({onCatch, remainingFuel}={}) {
  const journey=++cameraJourneyVersion;
  const mark = (state, progress, evidence) => {
    if (import.meta.env.DEV) window.__visualIgnition = { state, progress, journey,
      position: rig.pos.toArray(), look: rig.look.toArray(), fov: rig.fov ?? camera.fov, ...evidence };
  };
  lit=true;emberUntil=0;wickPlume.clear();shadeCoolingUntil=0;shadeCoolingGlow=0;shadeCoolingStart=0;shadeCoolingTau=0;roomLight=1;ignitionFill=place.P.bakedLighting?1:0;previewFloor=1;mark('igniting',0);
  const pine = !!mine.parts?.pineWax;
  if (pine) waxFuel = remainingFuel ?? null;
  if (!place.P.bakedLighting) {
    const start = pine ? { pos: rig.pos.clone(), look: rig.look.clone(), fov: rig.fov } : null;
    const burn = pine ? burnView() : null;
    let caught = false;
    await tween(1.6, k => {
      if (!lit || journey !== cameraJourneyVersion) return;
      mine.power = k < .18 ? k * .35 : Math.min(1.15, ease((k - .18) / .82) + Math.sin(k * Math.PI) * .22);
      if (burn) {
        rig.pos.lerpVectors(start.pos, burn.pos, ease(k));
        rig.look.lerpVectors(start.look, burn.look, ease(k));
        rig.fov = THREE.MathUtils.lerp(start.fov ?? camera.fov, burn.fov, ease(k));
      }
      if (!caught && k >= .28) {
        caught = true;
        if (pine) mine.waxState = 'burning';
        onCatch?.();
      }
    });
    if (lit && journey === cameraJourneyVersion) mark('settled', 1);
    return;
  }
  const N=place.P.nook,burn=burnView();
  const spread = N.steadyIgnition ? burn : viewOf((narrow() && N.spreadPhone) || N.spread);
  if (!N.steadyIgnition && !narrow()) {
    spread.fov = Math.min(N.lampFovMax ?? Infinity, spread.fov + 12 * THREE.MathUtils.clamp((mine.parts.frame.h - .45) / .32, 0, 1));
  }
  const cameraStart=rig.pos.clone(),lookStart=rig.look.clone(),fovStart=rig.fov??camera.fov;
  const active=()=>lit&&journey===cameraJourneyVersion;
  ignitionTaper??=makeIgnitionTaper();
  const { g, f, casters } = ignitionTaper;
  // The moving lighting pole remains visible without stamping a stripe into
  // the Pine candle's cached static shadow map.
  for (const part of casters) part.castShadow = !pine;
  const wickWorld = () => pine ? mine.g.localToWorld(mine.parts.pineWax.wickTip.clone()) : mine.flameWorld().clone();
  const tip = wickWorld();
  const right = V3(1, 0, 0).applyQuaternion(camera.quaternion);
  const start = tip.clone().addScaledVector(right, .27).add(V3(0, -.34, .22));
  const contactOffset = pine ? f.flame.position.clone().applyQuaternion(g.quaternion).negate()
    : V3(.004, -.006, .012);
  mine.power = 0;
  g.visible = true;
  let caught=false;
  await tween(3.2,k=>{
    if(!active())return;
    if (!N.steadyIgnition) {
      const retreat = ease(Math.min(1, k * 3.2 / 1.0));
      rig.pos.lerpVectors(cameraStart, spread.pos, retreat);
      rig.look.lerpVectors(lookStart, spread.look, retreat);
      rig.fov = THREE.MathUtils.lerp(fovStart, spread.fov, retreat);
    }
    const wick = pine ? wickWorld() : tip;
    const contact = wick.clone().add(contactOffset);
    if(k<.3)g.position.lerpVectors(start,contact,ease(k/.3));
    else if(k<.58)g.position.copy(contact);
    else g.position.lerpVectors(contact,start.clone().add(V3(.12,-.35,.18)),ease((k-.58)/.42));
    const catchPower=smooth(.29,.57,k);
    if (!caught && catchPower >= .18) {
      caught = true;
      if (pine) mine.waxState = 'burning';
      onCatch?.();
    }
    ignitionFill=1-catchPower;
    mine.power=catchPower*(1+.06*Math.sin(Math.PI*smooth(.3,.75,k)));
    f.tick(clockTime,k>.88?smooth(1,.88,k):1,0,[],0);
    const evidence = import.meta.env.DEV && pine ? {
      wickContactMetres: f.flame.getWorldPosition(V3(0, 0, 0)).distanceTo(wick),
    } : undefined;
    mark('igniting', k * .18, evidence);
  });
  if(journey===cameraJourneyVersion)g.visible=false;
  if(!active())return;
  mine.power=1;mark('spreading',.18);
  await tween(.8,()=>{});if(!active())return;
  if (N.steadyIgnition) {
    await tween(9, k => { if (active()) mark('spreading', .18 + .82 * k); });
    if (active()) mark('settled', 1);
    return;
  }
  const routeStart = rig.pos.clone();
  const front = pine ? burn.pos : viewOf((narrow() && N.burnPhone) || N.burn).pos;
  const burnWalk = pine ? [.34, .67].map((fraction, i) =>
    routeStart.clone().lerp(burn.pos, fraction).add(V3((i === 0 ? .035 : .025), .012, 0)))
    : ((narrow() && N.burnWalkPhone) || N.burnWalk).map(toWorld);
  const route = new THREE.CatmullRomCurve3([routeStart, ...burnWalk,
    ...(burn.pos.distanceTo(front) > .01 ? [front] : []), burn.pos], false, 'centripetal');
  const follow = pine ? burn.look : mine.g.localToWorld(V3(0, mine.parts.frame.cy, 0));
  const orbitLookStart = rig.look.clone();
  await tween(9,k=>{
    if(!active())return;
    const r=.08,e=k<r?k*k/(2*r*(1-r)):k>1-r?1-(1-k)*(1-k)/(2*r*(1-r)):(k-r*.5)/(1-r);
    rig.pos.copy(route.getPointAt(e));rig.look.lerpVectors(orbitLookStart,follow,smooth(0,.2,k)).lerp(burn.look,smooth(.75,1,k));
    rig.fov=THREE.MathUtils.lerp(spread.fov,burn.fov,smooth(.60,1,k));
    mark('walking',.18+.82*k);
  });
  if(active())mark('settled',1);
}
/** Put the flame out with a thread of smoke. */
export async function snuff(done = false, remaining) {
  // Only visuals: settlement and persistence have already happened synchronously.
  const lastPower=mine.power*(lit?Math.min(1,level*25):1);
  const lastGlow=Math.max(0,...(mine.parts?.shells??[]).map(material=>material.userData.u.uGlow.value/material.userData.strength));
  lit = false;
  shadeCoolingUntil=done?clockTime+5.2:0;shadeCoolingGlow=done?Math.min(.65,Math.max(.12,lastGlow*.55)):0;
  ignitionFill=0;
  const journey = ++cameraJourneyVersion;
  if(import.meta.env.DEV)window.__visualIgnition={state:'cancelled',journey};
  if(ignitionTaper)ignitionTaper.g.visible=false;
  const endingParts = mine.parts;
  if (endingParts?.pineWax) {
    const fuel = done ? 0 : THREE.MathUtils.clamp(remaining ?? waxFuel?.() ?? level, 0, 1);
    waxFuel = null;
    level = targetLevel = fuel;
    mine.waxState = done ? 'burned_down' : 'went_out';
    mine.setLevel(fuel);
    if (narrow()) {
      const start = rig.look.y;
      const end = Math.min(start, burnView().look.y - .08);
      void tween(.65, k => {
        if (journey === cameraJourneyVersion) rig.look.y = THREE.MathUtils.lerp(start, end, ease(k));
      });
    }
  } else if (done) { level = targetLevel = 0; mine.setLevel(0); }
  const wickTip = endingParts?.pineWax?.wickTip.clone() ?? mine.top.clone().add(V3(.0007,.004,0));
  wickPlume.start({ time: clockTime, done, frame: mine.g, path: endingParts?.smokePath, wickTip,
    variant: endingParts?.pineWax ? 'pine' : undefined, valid: () => mine.parts === endingParts });
  emberUntil = clockTime + (done ? 3.8 : .35);
  // Went out: sudden, and the place keeps less of its light. Burned down: it stays as it was.
  if (!done && !place.P.bakedLighting) void tween(1.6, (k) => { roomLight = 1 - .3 * ease(k); });
  const p0=done?Math.min(.24,Math.max(.015,lastPower)):mine.power;mine.power=p0;
  // Putting a lamp out stays sudden for the flame, its light and the smoke: only
  // the cloth holds heat. The cloth starts from the glow it had a frame before
  // and cools exponentially, so it never flashes or cuts.
  // The cloth's own glow is what cools, and it sits around 2.4 * strength * power
  // while lit; start from that so the first cooled frame matches the last lit one.
  if(!done&&endingParts?.shells?.length){shadeCoolingStart=clockTime;shadeCoolingGlow=Math.max(.02,Math.min(2.4,lastGlow*.9));shadeCoolingUntil=clockTime+16;shadeCoolingTau=2.6;}
  await tween(done?2.6:.12,k=>{mine.power=p0*Math.pow(1-k,done?1.35:1)*(done?.78+.22*Math.sin(k*17)**2:1);});mine.power=0;
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, powerSaver ? 1 : quality === 'high' ? 1.75 : 1.25));
  composer.setPixelRatio(renderer.getPixelRatio());
  renderer.setSize(w, h, false); composer.setSize(w, h);
  for(const target of [composer.renderTarget1,composer.renderTarget2]){
    const samples=powerSaver?0:geometrySamples;
    if(target.samples!==samples){target.samples=samples;target.dispose();}
  }
  renderer.shadowMap.enabled = !powerSaver;
  const size = quality === 'high' ? 1024 : 512; mine.g.traverse(o => { if (o.isLight && o.shadow) o.shadow.mapSize.set(size, size); });
  camera.aspect = w / h; camera.fov = rig.fov??(w / h < .8 ? 44 : 32); camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();
let clockTime = 0, lastRender = 0, renderDeadline = 0, renderCadence = 0, sampleFrames = 0, slowFrames = 0, nextClockCheck = 0;
const tmp = V3(0, 0, 0), local = V3(0, 0, 0);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function frame(stamp = performance.now()) {
  requestAnimationFrame(frame);
  const interval = 1000 / (powerSaver ? 15 : phase === 'burning' || phase === 'result' ? 30 : 60);
  if (renderCadence !== interval) { renderCadence = interval; renderDeadline = stamp; }
  // Display timestamps can arrive slightly before their nominal slot.
  if (stamp < renderDeadline - 3) return;
  // Keep late callbacks from shifting every following frame. Missed slots are
  // skipped; physics still receives time since the actual previous render.
  renderDeadline += (Math.floor((Math.max(0, stamp - renderDeadline) + 1e-6) / interval) + 1) * interval;
  const elapsed = stamp - lastRender;
  const dt = Math.min(elapsed / 1000, .1); lastRender = stamp;
  if (sampleFrames < 180 && phase !== 'travel' && phase !== 'burning' && phase !== 'result' && !powerSaver) {
    sampleFrames++; if (elapsed > 27) slowFrames++;
    if (sampleFrames === 180 && slowFrames > 45 && quality === 'high') { quality = 'balanced'; resize(); }
  }
  wind *= Math.exp(-dt * 2.8); clockTime += dt>0?Math.max(0,elapsed/1000):0; const time = clockTime;
  for (let i = tweens.length - 1; i >= 0; i--) {
    // Camera/story durations use elapsed wall time. Particle stability's100ms
    // step cap must not turn a slow browser frame into a slow-motion walk.
    const tw = tweens[i]; tw.t += Math.max(0,elapsed/1000); const k = tw.skip ? 1 : Math.min(1, tw.t / tw.dur); tw.fn(k);
    if (k >= 1) { clearTimeout(tw.deadline); tweens.splice(i, 1); tw.res(); }
  }
  // A slow drift so the view breathes like a held camera; wider outside.
  const a = reducedMotion.matches || place?.P.bakedLighting || (import.meta.env.DEV && window.__visualFreezeCamera) ? 0 : rig.amp;
  camera.position.copy(rig.pos).add(tmp.set(Math.sin(time * .13) * a, Math.sin(time * .09) * a * .35, Math.cos(time * .11) * a * .5));
  camera.lookAt(rig.look);
  let lens = rig.fov ?? (innerWidth / innerHeight < .8 ? 44 : 32);
  if (import.meta.env.DEV && pineDiagnosticView && mine.g.visible && mine.parts?.pineWax && atLamp) {
    const detail = burnView();
    if (pineDiagnosticView === 'far') {
      detail.pos.sub(detail.look).multiplyScalar(1.06).add(detail.look);
      lens = detail.fov;
    } else if (pineDiagnosticView === 'contact') {
      const seat = mine.g.localToWorld(V3(0, mine.parts.seat.y, 0));
      detail.look.lerp(seat, .78);
      const dishRadius = .059 * mine.parts.holder.scale.x;
      const nearEdge = Math.max(detail.pos.distanceTo(seat) - dishRadius, .001);
      const dishFov = THREE.MathUtils.radToDeg(2 * Math.atan(dishRadius / (nearEdge * camera.aspect * .86)));
      lens = Math.max(detail.fov * .63, dishFov);
    } else {
      lens = detail.fov * .48;
    }
    camera.position.copy(detail.pos);
    camera.lookAt(detail.look);
  }
  if(Math.abs(camera.fov-lens)>.001){camera.fov=lens;camera.updateProjectionMatrix();}
  if (place) {
    if(time>nextClockCheck){
      nextClockCheck=time+15;
      const light=daylight(),key=JSON.stringify(light);
      if(key!==place.lightKey){
        place.P={...PLACES[place.id],...blendPlace(PLACES[place.id],light)};place.lightKey=key;place.daylight=light;
        const p=place.P,u=place.sky.material.uniforms;
        for(const [name,value] of Object.entries({uTop:p.sky.top,uHorizon:p.sky.horizon,uGround:p.sky.ground,uSun:p.sky.sun,uLit:p.sky.lit,uDark:p.sky.dark}))u[name].value.setHex(value);
        u.uDir.value.set(...p.sky.dir).normalize();u.uGlow.value=p.sky.glow;u.uClouds.value=p.sky.clouds;u.uStars.value=p.sky.stars;u.uDisc.value=p.sky.disc;
        u.uDiscEdges.value.set(...p.sky.discEdges);
        if (place.id === 'pine-gate') {
          place.sun.position.copy(u.uDir.value).multiplyScalar(100);
          place.baked?.updateWaxSun?.(u.uDir.value);
        }
        place.sun.color.setHex(p.sunL[0]);place.sunBase=p.sunL[1];place.hemi.color.setHex(p.hemi[0]);place.hemi.groundColor.setHex(p.hemi[1]);place.hemiBase=p.hemi[2];outside.fog.color.setHex(p.fog[0]);outside.fog.density=p.fog[1];
      }
    }
    const P = place.P, N = P.nook;
    for (const f of place.up) f(dt, time, place.daylight);
    place.sky.position.copy(camera.position);
    for (const m of flameMats) m.uniforms.uTime.value = time;
    for (const o of place.others) o.tick(time);
    // Near the lamp the view takes the spot's own exposure, bloom and depth range; inside a hall the sky's light falls away.
    const lamp = mine.g.getWorldPosition(tmp), d = camera.position.distanceTo(lamp), near = smooth(7, 1.5, d);
    local.copy(camera.position); place.nookG.worldToLocal(local);
    const I = N.interior, inside = I ? smooth(-.3, .3, Math.min(local.x - I.min[0], I.max[0] - local.x, local.y - I.min[1], I.max[1] - local.y, local.z - I.min[2], I.max[2] - local.z)) : 0;
    place.hemi.intensity = place.hemiBase * (P.bakedLighting?1:1-.8*inside); place.sun.intensity = place.sunBase * (1 - .9 * inside);
    // Baked radiance, source lights and emission already include the common
    // camera pre-exposure. Only the remaining camera multiplier belongs here.
    const cameraMultiplier=roomLight*(P.exposure??1)*(1+((N.exposure??1)-1)*near);
    if(nativeAgXPass){
      nativeAgXPass.enabled=!!P.bakedLighting;
      nativeAgXPass.uniforms.cameraExposureEV.value=Math.log2(Math.max(1e-8,cameraMultiplier))+(place.baked?.residualCameraExposureEV??0);
    }
    renderer.toneMapping = P.bakedLighting ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = P.bakedLighting ? 1 : cameraMultiplier;
    bloom.strength = P.bloom[0] + ((N.bloom ?? P.bloom)[0] - P.bloom[0]) * near; bloom.threshold = P.bloom[1] + ((N.bloom ?? P.bloom)[1] - P.bloom[1]) * near;
    const wantNear = Math.min(.3, Math.max(.01, d * .012));
    const wantFar=P.cameraFar??1500;
    if (Math.abs(camera.near - wantNear) > .002||camera.far!==wantFar) { camera.near = wantNear; camera.far = wantFar; camera.updateProjectionMatrix(); }
    if (mine.parts?.pineWax) level = THREE.MathUtils.clamp(waxFuel?.() ?? targetLevel, 0, 1);
    else level += (targetLevel-level)*(1-Math.exp(-dt*5));
    if (mine.g.visible && mine.offer) { mine.setLevel(level); mine.update(time); }
    const cover=!atLamp&&place.cover;
    place.baked?.update(daylight(new Date(),true),mine.g.visible?mine.lightPower:cover?(cover.power??1):0,mine.g.visible?mine.lightWorld():cover?.light?.getWorldPosition(V3()));
    if(P.bakedLighting&&mine.parts?.frame&&!mine.parts.pineWax){
      const centre=mine.g.localToWorld(V3(0,mine.parts.frame.cy,0));
      aimGauzePreview(previewFill,previewFillTarget,centre,camera.position);
    } else if (mine.parts?.pineWax) {
      previewFill.position.copy(toWorld(V3(.24, 1.46, .83)));
      previewFillTarget.position.copy(toWorld(V3(0, 1.09, 0)));
    }else{previewFill.position.set(1,2,2);previewFillTarget.position.set(0,0,0);}
    // The chosen lamp keeps a small fill so its cloth and rim read while unlit. When
    // the walk ends and the chooser takes over, the target steps from .55 to 1; at
    // five per second that step covers half its range inside one 200 ms sample and
    // the rim flashes. Only the walk-to-chooser rise is eased at the target, so
    // ignition and put-out keep their own timing.
    const previewTarget=mine.g.visible&&atLamp?(phase==='candle'?1:!lit?.55:ignitionFill):0;
    const risingToChooser=phase==='candle'&&!lit;
    if(risingToChooser)previewFloor+=(previewTarget-previewFloor)*(1-Math.exp(-dt*1.2));
    else previewFloor=previewTarget;
    gauzePreviewBlend+=(previewFloor-gauzePreviewBlend)*(1-Math.exp(-dt*5));
    if (P.bakedLighting && mine.parts?.pineWax && atLamp) {
      const fillTarget = phase === 'candle' || lit
        ? THREE.MathUtils.lerp(1.35, .19, THREE.MathUtils.clamp(mine.power, 0, 1))
        : .34;
      pinePreviewFill += (fillTarget - pinePreviewFill) * (1 - Math.exp(-dt * 2.5));
      previewFill.intensity = pinePreviewFill;
    } else {
      pinePreviewFill = 0;
      if (mine.parts?.pineWax && atLamp) previewFill.intensity = phase === 'candle' ? 1.35 : lit ? .29 : .74;
      else previewFill.intensity = P.bakedLighting ? gauzePreviewIntensity * gauzePreviewBlend : phase === 'candle' ? .7 : 0;
    }
    wickPlume.update(time);
    dust.visible = !!N.dust && atLamp && !powerSaver && !reducedMotion.matches;
    dust.material.userData.soft.value=P.bakedLighting?1:0;
    dust.material.size=P.bakedLighting ? .005 : .01;
    dust.material.opacity=P.bakedLighting ? .04+.1*mine.lightPower : .4;
    if (dust.visible) {
      const dp = dust.geometry.attributes.position;
      for (let i = 0; i < dp.count; i++) { let y = dp.getY(i) + dt * .02; if (y > 2.6) y = -.4; dp.setY(i, y); dp.setX(i, dp.getX(i) + Math.sin(time * .3 + i) * dt * .004); }
      dp.needsUpdate = true; dust.position.copy(lamp);
    }
  }
  renderPass.scene = active; offeringPass.scene = active;
  offeringPass.enabled = false;
  focusBlur.enabled = false;
  focusBlur.amount = phase === 'wish' ? 1 : phase === 'burning' || phase === 'result' ? .55 : .3;
  bloom.enabled = !powerSaver;
  grade.enabled=!place?.P.bakedLighting;
  composer.render();
}

// ---------- Start ----------
let startupAttempt = null, frameStarted = false;
export function ensureReady() {
  if (!startupAttempt) startupAttempt = (async () => {
    setPhase('wish');
    await showPlace(COVER);
    rig.amp = .006; const v = coverView(); rig.fov=v.fov??null; rig.pos.copy(v.pos); rig.look.copy(v.look);
    try { camera.layers.set(1); await renderer.compileAsync(outside, camera); }
    finally { camera.layers.set(0); }
    if (!frameStarted) { frameStarted = true; frame(); }
    const poster = document.getElementById('cover-poster');
    if (poster) {
      fadeEl.style.transitionDuration = '0ms';
      fadeEl.style.opacity = '0';
      requestAnimationFrame(() => {
        poster.dataset.ready = 'true';
        setTimeout(() => poster.remove(), 700);
      });
    } else fadeTo(0, 1067);
  })().catch(error => { startupAttempt = null; throw error; });
  return startupAttempt;
}
export const ready = ensureReady();
// Asset errors are presented by the form's preparation/retry state. The facade
// retries ensureReady and resolves its public barrier after the first success.
void ready.catch(() => {});
