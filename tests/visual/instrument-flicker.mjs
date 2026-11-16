// Capture-only edits to a frozen checkout; the main product tree is not modified.
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const target = resolve(process.argv[2] || '/tmp/one-light-snow-single-baseline');
if (!target.startsWith('/tmp/')) throw new Error('This instrumentation command only accepts a frozen /tmp checkout.');
const path = join(target, 'web/src/engine/scene.js');
let source = await readFile(path, 'utf8');
if (source.includes('createFlickerLab')) source = await readFile(path + '.uninstrumented', 'utf8');
else await copyFile(path, path + '.uninstrumented');
const original = source, hooks = [];
const sha = value => createHash('sha256').update(value).digest('hex');
let manifest = null;
try { manifest = await readFile(join(target, 'web/public/places/snow-roof/manifest.json')); }
catch (error) { if (error.code !== 'ENOENT' || process.env.ALLOW_PENDING_DELIVERY !== '1') throw error; }
const snapshotIdentity = { root: target, originalSceneSha256: sha(original), snowManifestSha256: manifest ? sha(manifest) : null, deliveryPending: !manifest };
function inject(name, search, replacement, required = true) {
  const next = source.replace(search, replacement);
  if (next === source && required) throw new Error(`Capture hook did not match: ${name}. The frozen source was not overwritten.`);
  hooks.push({ name, applied: next !== source, required }); source = next;
}
source = "import { createFlickerLab } from './flickerLab.js';\nimport { createPerformanceLab } from './performanceLab.js';\nimport { collectDeliveryInfo } from './deliveryInfo.js';\n" + source;
inject('Create capture helper', 'composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(new OutputPass()); composer.addPass(grade);', `composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(new OutputPass()); composer.addPass(grade);
window.__captureSnapshot=${JSON.stringify(snapshotIdentity)};
window.__captureDeliveryInfo=()=>collectDeliveryInfo({renderer,place});
const performanceLab=createPerformanceLab({renderer,camera,composer,getDeliveryInfo:window.__captureDeliveryInfo});
const flickerLab = createFlickerLab({ renderer, camera, grade, bloom, scene: () => outside, lamp: () => mine.g,
renderInfo:()=>{const gl=renderer.getContext();return {rgba16fSupportedSamples:gl.getInternalformatParameter?Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES)??[]):null,depth24SupportedSamples:gl.getInternalformatParameter?Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,gl.SAMPLES)??[]):null,composerSamples:[composer.renderTarget1.samples,composer.renderTarget2.samples],pixelRatio:renderer.getPixelRatio(),drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],powerSaver,quality};},
lampInfo: () => { const box=mine.parts?new THREE.Box3().setFromObject(mine.parts.g):null;let suspension=null;mine.g.traverse(object=>{if(object.userData.visualRole==='suspension')suspension={visible:object.visible,position:object.position.toArray(),scale:object.scale.toArray()};});return {visible:mine.g.visible,frame:mine.parts?.frame??null,offer:mine.offer?{kind:mine.offer.kind,color:mine.offer.color,rows:mine.offer.rows}:null,worldBounds:box?{min:box.min.toArray(),max:box.max.toArray()}:null,suspension};},
burnState: () => ({ level, targetLevel: typeof targetLevel === 'number' ? targetLevel : level, power: mine.power, lightPower: mine.lightPower, flameWorld:mine.flameWorld().toArray(),lightingState:place?.baked?.lightingState?.()??null }), placeInfo: () => ({ id: place?.id ?? null, baked: !!place?.P.bakedLighting, manifest: place?.baked?.manifest ?? null,lightingState:place?.baked?.lightingState?.()??null }), flamePosition: () => mine.g.visible ? mine.flameWorld() : place?.cover?.f.flame.getWorldPosition(new THREE.Vector3()) });`);
inject('Freeze physical clock', 'const dt = Math.min(elapsed / 1000, .1); lastRender = stamp;', 'let dt = Math.min(elapsed / 1000, .1); if (flickerLab.freezeScene) dt = 0; lastRender = stamp;');
inject('Hold camera tweens for inspection', 'for (let i = tweens.length - 1; i >= 0; i--) {', 'for (let i = flickerLab.pauseTweens ? -1 : tweens.length - 1; i >= 0; i--) {');
inject('Expose explicitly exploratory snapshot camera control', /const rig = ([^\n]+);/, `$&
window.__captureSetCamera=({position,look,fov})=>{const previous={position:rig.pos.toArray(),look:rig.look.toArray(),fov:rig.fov??camera.fov};rig.pos.set(...position);rig.look.set(...look);rig.fov=fov;camera.position.copy(rig.pos);camera.lookAt(rig.look);camera.fov=fov;camera.updateProjectionMatrix();return previous;};`);
inject('Expose pending camera/tween state for settled static captures', 'const tweens = [];', "const tweens = [];\nwindow.__captureCameraState=()=>({pendingTweens:tweens.length,position:rig.pos.toArray(),look:rig.look.toArray(),fov:rig.fov??camera.fov});");
inject('Expose controlled physical state for material-only A/B', /let clockTime = 0, lastRender = 0,[^\n]+;/, `$&
window.__captureSetPhysicalState=({time=17,fuel=1}={})=>{const previous={time:clockTime,fuel:level,targetFuel:targetLevel};clockTime=time;level=targetLevel=fuel;if(mine.g.visible&&mine.offer){mine.setLevel(level);mine.update(time);}return previous;};`);
inject('Remove camera drift', /const a = ([^\n;]+);(\n\s+camera.position.copy\(rig.pos\))/, 'const a = flickerLab.lockCamera ? 0 : ($1);$2');
inject('Freeze lamp fuel and animation', 'if (mine.g.visible && mine.offer) { mine.setLevel(level); mine.update(time); }', 'if (mine.g.visible && mine.offer && !flickerLab.freezeScene) { mine.setLevel(level); mine.update(time); }');
inject('Freeze flame clocks before intensity and graphics updates', 'tick(time, power, lightMax, wax, topY) {', 'tick(time, power, lightMax, wax, topY) {\n      time = flickerLab.flameTime(time);');
inject('Freeze shared flame graphic time', 'for (const m of flameMats) m.uniforms.uTime.value = time;', 'for (const m of flameMats) m.uniforms.uTime.value = flickerLab.flameTime(time);');
inject('Retain flame halo during particle control', 'g.add(halo);', "halo.userData.visualKeepForParticleControl = true; g.add(halo);");
inject('Identify physical suspension for camera/size evidence', 'hanger.visible=false;g.add(hanger);', "hanger.userData.visualRole='suspension';hanger.visible=false;g.add(hanger);", false);
inject('Hold lamp rotation independently', 'g.rotation.z=Math.sin(time*.32)*.0035;', 'g.rotation.z=Math.sin(flickerLab.lampTime(time)*.32)*.0035;', false);
inject('Hold smoothed fuel independently', 'level += (targetLevel-level)*(1-Math.exp(-dt*5));', 'if (!flickerLab.freezeFuel) level += (targetLevel-level)*(1-Math.exp(-dt*5));', false);
inject('Hold UI level updates independently', /export function setLevel\(L\) \{ ((?:targetLevel|level) = [^;]+;) \}/, 'export function setLevel(L) { if (!flickerLab.freezeFuel) $1 }');
inject('Hold quantized daylight independently', 'const light=daylight(),key=JSON.stringify(light);', 'const light=flickerLab.daylight(daylight()),key=JSON.stringify(light);', false);
inject('Hold continuous baked daylight independently', 'place.baked?.update(daylight(new Date(),true),', "place.baked?.update(flickerLab.daylight(daylight(new Date(),true),'continuous'),", false);
inject('Control bloom', 'bloom.enabled = !powerSaver;', 'flickerLab.applyBloom(!powerSaver);');
inject('Hold legacy temporal grade', 'grade.uniforms.uTime.value = time % 10;', 'grade.uniforms.uTime.value = flickerLab.gradeTime(time % 10);', false);
inject('Read raw framebuffer after late particle and shadow controls', 'if (!warming) composer.render();', 'if (!warming) { flickerLab.prepare(); performanceLab.beforeRender(stamp); composer.render(); performanceLab.afterRender(); flickerLab.afterRender(); }');
const helper = await readFile('tests/visual/flicker-lab.mjs');
const performanceHelper=await readFile('tests/visual/performance-lab.mjs');
const deliveryHelper=await readFile('tests/visual/delivery-info.mjs');
await writeFile(path, source);
await copyFile('tests/visual/flicker-lab.mjs', join(target, 'web/src/engine/flickerLab.js'));
await copyFile('tests/visual/performance-lab.mjs',join(target,'web/src/engine/performanceLab.js'));
await copyFile('tests/visual/delivery-info.mjs',join(target,'web/src/engine/deliveryInfo.js'));
await writeFile(join(target, 'visual-instrumentation.json'), JSON.stringify({ target, originalSceneSha256: sha(original), instrumentedSceneSha256: sha(source), helperSha256: sha(helper),performanceHelperSha256:sha(performanceHelper),deliveryHelperSha256:sha(deliveryHelper),snowManifestSha256:manifest?sha(manifest):null,deliveryPending:!manifest, hooks }, null, 2) + '\n');
console.log(JSON.stringify({ target, hooks }, null, 2));
