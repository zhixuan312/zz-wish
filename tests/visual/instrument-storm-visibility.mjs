// Capture-only existing-instance controls. No second scene import/renderer.
import{readFile,writeFile}from'node:fs/promises';import{createHash}from'node:crypto';import{join}from'node:path';
const root=process.env.SOURCE_ROOT;if(!root?.startsWith('/tmp/'))throw Error('Use an isolated /tmp clone.');
const path=join(root,'web/src/engine/scene.js'),before=await readFile(path,'utf8');if(before.includes('window.__captureStormVisibility='))throw Error('Already instrumented.');
const hook=`
const stormVisibility={original:null,mode:'normal'};
window.__captureStormVisibility=(mode='metadata')=>{
 const cover=place?.cover;if(!cover?.g||!cover?.f?.flame)throw Error('Actual storm cover is unavailable.');
 const flame=cover.f.flame,glass=[],wax=[];cover.g.traverse(o=>{if(o.isMesh){const m=[o.material].flat();if(m.some(m=>m.transmission>.5))glass.push(o);if(m.some(m=>m.name==='Storm warm used tallow'))wax.push(o);}});
 if(!stormVisibility.original)stormVisibility.original={hero:cover.g.visible,depthTest:flame.material.depthTest,glass:glass.map(o=>o.visible),wax:wax.map(o=>o.visible)};
 const original=stormVisibility.original;
 if(mode!=='metadata'){
  if(!['normal','no-glass','no-wax','depth-test-off'].includes(mode))throw Error('Unknown storm visibility diagnostic.');
  cover.g.visible=original.hero;flame.material.depthTest=original.depthTest;glass.forEach((o,i)=>o.visible=original.glass[i]);wax.forEach((o,i)=>o.visible=original.wax[i]);
  if(mode==='no-glass')glass.forEach(o=>o.visible=false);if(mode==='no-wax')wax.forEach(o=>o.visible=false);if(mode==='depth-test-off')flame.material.depthTest=false;
  stormVisibility.mode=mode;
 }
 outside.updateMatrixWorld(true);
 const world=o=>o.getWorldPosition(V3()).toArray(),material=m=>({name:m.name,type:m.type,visible:m.visible,transparent:m.transparent,depthTest:m.depthTest,depthWrite:m.depthWrite,side:m.side,blending:m.blending,transmission:m.transmission??0,opacity:m.opacity,renderClass:m.transmission>0?'transmissive':m.transparent?'transparent':'opaque'});
 const glassInfo=glass.map(o=>({name:o.name,visible:o.visible,layers:o.layers.mask,renderOrder:o.renderOrder,world:world(o),materials:[o.material].flat().map(material)})),waxInfo=wax.map(o=>({name:o.name,visible:o.visible,layers:o.layers.mask,world:world(o),materials:[o.material].flat().map(material)}));
 const u=flame.material.uniforms;
 return{mode:stormVisibility.mode,sourceWickTip:cover.metadata.wickTip,sourceFlame:cover.metadata.flame,sourceLampBasis:cover.metadata.lampBasis,flame:{visible:flame.visible,parentVisible:flame.parent.visible,layers:flame.layers.mask,world:world(flame),matrixWorld:flame.matrixWorld.toArray(),material:material(flame.material),uniforms:Object.fromEntries(['uTime','uPower','uScale','uSeedU','uWind','uSoft'].map(k=>[k,u[k]?.value??null]))},point:{watts:cover.light.power,world:world(cover.light),visible:cover.light.visible},glass:glassInfo,wax:waxInfo,camera:{layers:camera.layers.mask,world:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray(),position:camera.position.toArray(),fov:camera.fov}};
};
`;
if(!before.includes('\nfunction resize() {'))throw Error('Source anchor missing.');
const after=before.replace('\nfunction resize() {','\n'+hook+'\nfunction resize() {').replace(/window\.__captureSnapshot=(\{[^\n]+\});/,(_,json)=>'window.__captureSnapshot='+JSON.stringify({...JSON.parse(json),root})+';');await writeFile(path,after);
const manifestPath=join(root,'visual-instrumentation.json'),manifest=JSON.parse(await readFile(manifestPath));manifest.target=root;manifest.instrumentedSceneSha256=createHash('sha256').update(after).digest('hex');manifest.stormVisibility={beforeSha256:createHash('sha256').update(before).digest('hex'),scope:'Existing-instance layer/depth diagnostics only; depth-test-off is not a fix.'};await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');console.log('STORM_VISIBILITY_READY',root,manifest.instrumentedSceneSha256);
