// CPU-only integration checks against the actual Three160 standard/physical
// shader templates. This does not claim browser GLSL or optical validation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import * as THREE from 'three';
import {createVisitorShadow} from '../../web/src/engine/baked/visitorShadow.js';
import {createGauzeTransmission} from '../../web/src/engine/baked/gauzeTransmission.js';

const position=new THREE.Vector3(1,2,3),state=createVisitorShadow({lightWorld:position,sourceRadius:.04});
const checks=[];
let provenKernel=null;
const scene=await readFile('web/src/engine/scene.js','utf8'),loader=await readFile('web/src/engine/baked/loadPlace.js','utf8');
const shellStart=scene.indexOf('function shellMaterial('),shellEnd=scene.indexOf('\nconst lathe',shellStart);
assert(shellStart>=0&&shellEnd>shellStart);
const shellFactory=new Function('THREE','V3','visitorFabric','gauzeNormal','gauzeRoughness',scene.slice(shellStart,shellEnd)+'\nreturn shellMaterial;')(THREE,(x,y,z)=>new THREE.Vector3(x,y,z),JSON.parse(await readFile('web/src/engine/baked/visitor-fabric.json')),new THREE.Texture(),new THREE.Texture());
const hallStart=scene.indexOf('function actualHallEnvironment('),hallEnd=scene.indexOf('\nconst presetOf',hallStart);assert(hallStart>=0&&hallEnd>hallStart);
const hallFactory=new Function('THREE',scene.slice(hallStart,hallEnd)+'\nreturn actualHallEnvironment;')(THREE);
const bakedStart=loader.indexOf('material.onBeforeCompile=shader=>{'),bakedEnd=loader.indexOf('      material.customProgramCacheKey=',bakedStart);assert(bakedStart>=0&&bakedEnd>bakedStart);
const bakedCompileFactory=new Function('THREE','perMaterial','indirectLamp','const material={};\n'+loader.slice(bakedStart,bakedEnd)+'\nreturn material.onBeforeCompile;');
const woven=shellFactory(0xa82a1c,{cloth:true,map:new THREE.Texture()});hallFactory(woven,new THREE.Texture());
const baked=new THREE.MeshStandardMaterial();baked.onBeforeCompile=bakedCompileFactory(THREE,{uLampPower:{value:1}},false);
const indirect=new THREE.MeshStandardMaterial();indirect.onBeforeCompile=bakedCompileFactory(THREE,{uLampPower:{value:1}},true);
for(const [name,material,template]of[['standard',new THREE.MeshStandardMaterial(),'standard'],['physical',new THREE.MeshPhysicalMaterial(),'physical'],['actual-woven-hall',woven,'physical'],['actual-baked-loader',baked,'standard'],['actual-indirect-loader',indirect,'standard']]){
  let chained=false;const previous=material.onBeforeCompile;
  material.onBeforeCompile=(shader,renderer)=>{chained=true;previous.call(material,shader,renderer);shader.uniforms.existing={value:7};};
  material.customProgramCacheKey=()=>`existing-${name}`;
  const shader={vertexShader:THREE.ShaderLib[template].vertexShader,fragmentShader:THREE.ShaderLib[template].fragmentShader,uniforms:{}};
  state.install(material);const installed=material.onBeforeCompile;state.install(material);assert.equal(material.onBeforeCompile,installed);
  const gauze=createGauzeTransmission();gauze.install(material);
  material.onBeforeCompile(shader,{});assert(chained);assert.equal(shader.uniforms.existing.value,7);
  assert(shader.fragmentShader.includes('getGauzeOriginalPointLightInfo'));
  assert(shader.fragmentShader.includes('light.color*=mix(vec3(1.),uGauzeFilterRGB,clothCoverage)'));
  assert.equal(shader.uniforms.uGauzeFilterEnabled,gauze.uniforms.uGauzeFilterEnabled);
  assert.equal(shader.uniforms.uVisitorShadowPosition.value,position);assert.equal(shader.uniforms.uVisitorSourceRadius.value,.04);
  assert.equal((shader.fragmentShader.match(/float getPointShadow\(/g)||[]).length,1);
  assert.equal((shader.fragmentShader.match(/float getVisitorOriginalPointShadow\(/g)||[]).length,1);
  assert.equal((shader.fragmentShader.match(/visibility\+=texture2DCompare/g)||[]).length,32);
  assert.equal((shader.fragmentShader.match(/blockers\+=visitorBlocker/g)||[]).length,3);
  assert(shader.fragmentShader.includes('centreStored=unpackRGBAToDepth'));
  assert(shader.fragmentShader.includes('(receiverDistance-shadowCameraNear)/depthRange+shadowBias'));
  assert(shader.fragmentShader.includes('shadowCameraNear+centreStored*depthRange'));
  assert(shader.vertexShader.includes('vVisitorShadowWorld=worldPosition.xyz'));
  const custom=shader.fragmentShader.slice(shader.fragmentShader.indexOf('float getPointShadow('));
  assert(custom.indexOf('dFdx(footprintDirection)')<custom.indexOf('if(uVisitorSourceRadius'));
  assert(custom.includes('float minimumBlocker=shadowCameraNear;'));
  assert(custom.includes('float physicalAngle=hasBlocker?'));
  assert(!custom.includes('if(blockers.y<.5)'));
  assert(custom.includes('receiverDistance<=max(shadowCameraNear,uVisitorSourceRadius)'));
  assert(custom.includes('SHADOWMAP_TYPE_VSM'));
  assert(!custom.includes('uVisitorOpticalNear'));
  const pixelOffsets=[...custom.matchAll(/shadowPixelDx\*([-\d.]+)\+shadowPixelDy\*([-\d.]+)/g)].map(match=>[+match[1],+match[2]]);
  assert.equal(pixelOffsets.length,32);assert.equal(new Set(pixelOffsets.map(v=>v.join(','))).size,32);
  for(let axis=0;axis<2;axis++)assert(Math.abs(pixelOffsets.reduce((sum,value)=>sum+value[axis],0))<1e-9);
  assert.equal((custom.match(/receiverDepth\+shadowDepthDx\*/g)||[]).length,32);
  if(process.env.PROVEN_SHADOW_HELPER&&!provenKernel){
    const proofBytes=await readFile(process.env.PROVEN_SHADOW_HELPER),proof=proofBytes.toString(),expected=proof.split('if(uVisitorOpticalNear>1.5){\n')[1]?.split('\nvisitorFiniteShadowCache=visibility/32.;')[0];
    assert(expected,'The optical candidate kernel anchor must exist.');
    const actual=custom.split('\n').map(line=>line.trim()).filter(line=>line.startsWith('visibility+=texture2DCompare')).join('\n');
    assert(actual===expected.trim(),'Production kernel must equal the actual optical32-tap candidate.');
    provenKernel={path:process.env.PROVEN_SHADOW_HELPER,sha256:createHash('sha256').update(proofBytes).digest('hex'),exact32TapMatch:true};
  }
  if(name==='actual-woven-hall'){assert(custom.includes('physicalTransmissionShadow*=getPointShadow('));assert(custom.includes('transmissionShadow=mix(.28,1.,physicalTransmissionShadow)'));assert(custom.includes('*irradiance*physicalTransmissionShadow*(1.-step(0.,clothSignedIncidence))'));assert(custom.includes('reflectedLight.directDiffuse*=1.-uClothTransmissionWeight')); assert(custom.includes('photographedWeave'));assert(custom.includes('Ambient is sampled from the actual hall.'));}
  if(name==='actual-indirect-loader'){assert(custom.includes('float away=1.;'));assert(custom.includes('isVisitor*1.'));assert(custom.includes('if(uLampPower>.0001&&false)'));}
  if(name==='actual-baked-loader')assert(custom.includes('movingShade=mix(1.,mix(.65,1.,ribShadow)'));
  assert(!/random|uTime|gl_FragCoord/.test(shader.fragmentShader.slice(shader.fragmentShader.indexOf('float visitorFiniteShadowCache'),shader.fragmentShader.indexOf('#endif',shader.fragmentShader.indexOf('float visitorFiniteShadowCache')))));
  assert(material.customProgramCacheKey().startsWith(`existing-${name}-visitor-finite`));
  const cloned=material.clone();state.install(cloned);assert.notEqual(cloned.onBeforeCompile,THREE.Material.prototype.onBeforeCompile);
  checks.push({name,actualThreeShaderTransformed:true,previousCompilePreserved:true,actualGauzePointFilterHookComposes:true,sharedUniformIdentity:true,idempotentInstall:true,cloneCanInstall:true,sourceRadiusMetres:.04,maximumDepthFetches:36,derivativesBeforeDivergence:true,pixelOffsetsUniqueAndZeroMean:true,originalFallbacksRetained:true});gauze.dispose();
}
state.setSourceRadius(.02);assert.equal(state.uniforms.uVisitorSourceRadius.value,.02);state.setSourceRadius(.04);
const parent=new THREE.Group(),light=new THREE.PointLight();parent.position.set(3,4,5);parent.add(light);light.position.set(1,2,3);parent.updateMatrixWorld(true);state.copyLightPosition(light);assert.deepEqual(position.toArray(),[4,6,8]);
assert.throws(()=>createVisitorShadow({lightWorld:position,sourceRadius:-1}));
state.setSourceRadius(0);assert.equal(state.uniforms.uVisitorSourceRadius.value,0);state.setSourceRadius(.04);
let footprintChecks=0;for(let i=1;i<=24;i++){
  const dx=new THREE.Vector3(Math.sin(i),Math.cos(i*.7),Math.sin(i*.3)).multiplyScalar(.01),dy=new THREE.Vector3(Math.sin(i*.4),Math.cos(i*.2),Math.sin(i*.8)).multiplyScalar(.02),bound=.5*Math.max(dx.clone().add(dy).length(),dx.clone().sub(dy).length());
  for(let u=-.5;u<=.5;u+=.1)for(let v=-.5;v<=.5;v+=.1){assert(dx.clone().multiplyScalar(u).addScaledVector(dy,v).length()<=bound+1e-12);footprintChecks++;}
}
const path='web/src/engine/baked/visitorShadow.js',bytes=await readFile(path),out=process.env.OUTPUT??'artifacts/full-review/round-1/visitor-shadow-cpu';await mkdir(out,{recursive:true});
await writeFile(`${out}/report.json`,JSON.stringify({threeRevision:THREE.REVISION,helper:{path,sha256:createHash('sha256').update(bytes).digest('hex')},actualShaderChainSources:{sceneSha256:createHash('sha256').update(scene).digest('hex'),loaderSha256:createHash('sha256').update(loader).digest('hex')},provenKernel,checks,lightWorldCopy:[4,6,8],sameUniformCanUpdateRadius:true,footprintChecks,browserGpuRuns:0,limits:'CPU template/hook validation only. The four-sample blocker search and single centre cube remain a bounded point-PCSS approximation. Receiver-inside-emitter/near/far/VSM and other-light cases retain the original Three filter. The isolated32-sample AA candidate has Chrome optical evidence; cleaned production helper WebKit and actual phone-budget acceptance remain pending.'},null,2)+'\n');
console.log('VISITOR_SHADOW_CPU_PASS',checks.length,out);
