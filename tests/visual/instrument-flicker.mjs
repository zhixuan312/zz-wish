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
let coverManifest = null;
try { manifest = await readFile(join(target, 'web/public/places/snow-roof/manifest.json')); }
catch (error) { if (error.code !== 'ENOENT' || process.env.ALLOW_PENDING_DELIVERY !== '1') throw error; }
try { coverManifest = await readFile(join(target, 'web/public/places/cloud-cliff/manifest.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const snapshotIdentity = { root: target, originalSceneSha256: sha(original), snowManifestSha256: manifest ? sha(manifest) : null, coverManifestSha256: coverManifest ? sha(coverManifest) : null, deliveryPending: !manifest };
const descriptorPath = join(target, 'web/src/engine/places/snow-roof-baked.js');
let descriptor = null, originalDescriptor = null;
try {
  descriptor = await readFile(descriptorPath, 'utf8');
  if (descriptor.includes('captureSourceSmoke')) descriptor = await readFile(descriptorPath + '.uninstrumented', 'utf8');
  else await copyFile(descriptorPath, descriptorPath + '.uninstrumented');
  originalDescriptor = descriptor;
} catch (error) { if (error.code !== 'ENOENT') throw error; }
function inject(name, search, replacement, required = true) {
  const next = source.replace(search, replacement);
  if (next === source && required) throw new Error(`Capture hook did not match: ${name}. The frozen source was not overwritten.`);
  hooks.push({ name, applied: next !== source, required }); source = next;
}
source = "import { createFlickerLab } from './flickerLab.js';\nimport { createPerformanceLab } from './performanceLab.js';\nimport { collectDeliveryInfo } from './deliveryInfo.js';\n" + source;
const composerLine=source.includes('composer.addPass(outputPass)')?'composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(outputPass); composer.addPass(grade);':'composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(new OutputPass()); composer.addPass(grade);';
inject('Create capture helper', composerLine, `${composerLine}
window.__captureSnapshot=${JSON.stringify(snapshotIdentity)};
window.__captureColorView=()=>({native:${source.includes('let nativeAgXPass,nativeAgXReady;')?"nativeAgXPass?{enabled:nativeAgXPass.enabled,cameraExposureEV:nativeAgXPass.uniforms.cameraExposureEV.value,precision:nativeAgXPass.lease.metadata.declaredPrecision,lutSha256:nativeAgXPass.lease.metadata.assetSha256}:null":"null"},rendererToneMapping:renderer.toneMapping,rendererExposure:renderer.toneMappingExposure,thumbnail:${source.includes('async function makeThumbnailStage()')?"thumbnailStage?{cameraExposureEV:thumbnailStage.view.uniforms.cameraExposureEV.value,lutSha256:thumbnailStage.view.lease.metadata.assetSha256}:null":"null"}});
window.__captureDeliveryInfo=()=>collectDeliveryInfo({renderer,place});
window.__captureRenderLampThumbnail=typeof renderLampThumbnail==='function'?((shape,options)=>renderLampThumbnail(shape,options)):null;
window.__captureMaterialResources=()=>({geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,programs:renderer.info.programs.map(program=>({name:program.name,usedTimes:program.usedTimes})),retainedReflectionMaterials:nearMaterials.size??null});
window.__captureCoverLayers=patch=>{
  const cover=place?.cover;if(!cover)throw new Error('No active cover.');
  const find=name=>name?(cover.g.getObjectByName(name)||cover.g.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name))):null;
  const nodes={flame:cover.f?.flame,wick:find(cover.metadata?.wickObject),point:cover.light,glass:find(cover.metadata?.glassObject)};
  const previous={};for(const [name,node]of Object.entries(nodes)){
    previous[name]=node?node.visible:null;
    if(patch?.[name]!==undefined){if(!node)throw new Error('Missing actual cover layer: '+name);node.visible=patch[name];}
  }
  return{previous,nodes:Object.fromEntries(Object.entries(nodes).map(([name,node])=>[name,node?{name:node.name,visible:node.visible}:null]))};
};
window.__captureRuntimeAnchors=()=>{
 const root=place?.baked?.group,parse=value=>typeof value==='string'?JSON.parse(value):value;
 const source=root?{wicks:parse(root.userData.static_lamp_wicks_engine??null),smoke:parse(root.userData.static_incense_smoke_engine??null),smokeConfig:parse(root.userData.static_incense_smoke_config??null)}:null,actual=[];
 outside.updateMatrixWorld(true);outside.traverse(object=>{if(object.userData.captureRole||object.userData.captureSourceSmoke)actual.push({id:object.id,role:object.userData.captureRole??'source-incense-strand',world:object.getWorldPosition(new THREE.Vector3()).toArray(),sourceSmoke:object.userData.captureSourceSmoke??null});});
 return {source,actual};
};
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
inject('Hold lamp animation time while retaining functional updates', 'if (mine.g.visible && mine.offer) { mine.setLevel(level); mine.update(time); }', 'if (mine.g.visible && mine.offer) { mine.setLevel(level); mine.update(flickerLab.lampTime(time)); }');
inject('Freeze flame clocks before intensity and graphics updates', 'tick(time, power, lightMax, wax, topY) {', 'tick(time, power, lightMax, wax, topY) {\n      time = flickerLab.flameTime(time);');
inject('Freeze shared flame graphic time', 'for (const m of flameMats) m.uniforms.uTime.value = time;', 'for (const m of flameMats) m.uniforms.uTime.value = flickerLab.flameTime(time);');
inject('Retain flame halo during particle control', 'g.add(halo);', "halo.userData.visualKeepForParticleControl = true; g.add(halo);");
inject('Identify physical suspension for camera/size evidence', 'hanger.visible=false;g.add(hanger);', "hanger.userData.visualRole='suspension';hanger.visible=false;g.add(hanger);", false);
inject('Tag live fixture groups for read-only world-anchor evidence', /(function liveFlame\([^\n]+\{\n\s+const g=new THREE.Group\(\);)/, "$1g.userData.captureRole='static-fixture-live-flame';", false);
inject('Tag fixture specular lights for read-only world-anchor evidence', 'light.position.set(x,y,z);C.G.add(light);', "light.userData.captureRole='static-fixture-specular';light.position.set(x,y,z);C.G.add(light);", false);
inject('Record smoke emission inputs on their actual parent for world-anchor evidence', 'function smokeAt(x, y, z, o = {}) {', "function smokeAt(x, y, z, o = {}) {\n  (C.G.userData.captureSmokeEmitters??=[]).push({localPosition:[x,y,z]});", false);
inject('Hold lamp rotation independently', 'g.rotation.z=Math.sin(time*.32)*.0035;', 'g.rotation.z=Math.sin(flickerLab.lampTime(time)*.32)*.0035;', false);
inject('Hold authored suspension-pivot motion independently', 'g.parent.rotation.z=Math.sin(time*.32)*.008;', 'g.parent.rotation.z=Math.sin(flickerLab.lampTime(time)*.32)*.008;', false);
inject('Hold smoothed fuel independently', 'level += (targetLevel-level)*(1-Math.exp(-dt*5));', 'if (!flickerLab.freezeFuel) level += (targetLevel-level)*(1-Math.exp(-dt*5));', false);
inject('Hold UI level updates independently', /export function setLevel\(L\) \{ ((?:targetLevel|level) = [^;]+;) \}/, 'export function setLevel(L) { if (!flickerLab.freezeFuel) $1 }');
inject('Hold quantized daylight independently', 'const light=daylight(),key=JSON.stringify(light);', 'const light=flickerLab.daylight(daylight()),key=JSON.stringify(light);', false);
inject('Hold continuous baked daylight independently', 'place.baked?.update(daylight(new Date(),true),', "place.baked?.update(flickerLab.daylight(daylight(new Date(),true),'continuous'),", false);
inject('Control bloom', 'bloom.enabled = !powerSaver;', 'flickerLab.applyBloom(!powerSaver);');
inject('Hold legacy temporal grade', 'grade.uniforms.uTime.value = time % 10;', 'grade.uniforms.uTime.value = flickerLab.gradeTime(time % 10);', false);
if (source.includes('if (!warming) composer.render();')) inject('Read raw framebuffer after late particle and shadow controls', 'if (!warming) composer.render();', 'if (!warming) { flickerLab.prepare(); performanceLab.beforeRender(stamp); composer.render(); performanceLab.afterRender(); flickerLab.afterRender(); }');
else inject('Read raw framebuffer after late particle and shadow controls', /^ {2}composer.render\(\);$/m, '  flickerLab.prepare(); performanceLab.beforeRender(stamp); composer.render(); performanceLab.afterRender(); flickerLab.afterRender();');
if (descriptor !== null) {
  const before = descriptor;
  descriptor = descriptor.replace('mesh.userData.cast = false; C.G.add(mesh);', "mesh.userData.cast = false; mesh.userData.visualParticle=true; mesh.userData.captureSourceSmoke={sourceAnchor:[...config.anchor],strand,strandCount:config.strandCount}; C.G.add(mesh);");
  hooks.push({ name: 'Tag source-authored incense strands for late particle controls and world-anchor readback', applied: before !== descriptor, required: false });
}
const helper = await readFile('tests/visual/flicker-lab.mjs');
const performanceHelper=await readFile('tests/visual/performance-lab.mjs');
const deliveryHelper=await readFile('tests/visual/delivery-info.mjs');
await writeFile(path, source);
if (descriptor !== null && descriptor !== originalDescriptor) await writeFile(descriptorPath, descriptor);
await copyFile('tests/visual/flicker-lab.mjs', join(target, 'web/src/engine/flickerLab.js'));
await copyFile('tests/visual/performance-lab.mjs',join(target,'web/src/engine/performanceLab.js'));
await copyFile('tests/visual/delivery-info.mjs',join(target,'web/src/engine/deliveryInfo.js'));
await writeFile(join(target, 'visual-instrumentation.json'), JSON.stringify({ target, originalSceneSha256: sha(original), instrumentedSceneSha256: sha(source),originalSnowDescriptorSha256:originalDescriptor===null?null:sha(originalDescriptor),instrumentedSnowDescriptorSha256:descriptor===null?null:sha(descriptor), helperSha256: sha(helper),performanceHelperSha256:sha(performanceHelper),deliveryHelperSha256:sha(deliveryHelper),snowManifestSha256:manifest?sha(manifest):null,coverManifestSha256:coverManifest?sha(coverManifest):null,deliveryPending:!manifest, hooks }, null, 2) + '\n');
console.log(JSON.stringify({ target, hooks }, null, 2));
