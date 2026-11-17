// Independent actual Three triangle-ray checks of the CPU angular BVH/mask.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadActualGauzeGeometry} from '../../scripts/load-gauze-geometry.mjs';
import {PRESET_SHAPES,sizedPreset,COLORS} from '../../shared/rules.ts';
import {makeGauzeDirectionMask,gauzeTransmissionColour,createGauzeTransmission} from '../../web/src/engine/baked/gauzeTransmission.js';
const actual=await loadActualGauzeGeometry(),rows=[],raycaster=new THREE.Raycaster(),out=process.env.OUTPUT??'artifacts/full-review/round-1/gauze-transmission-cpu';
for(const preset of PRESET_SHAPES.shade)for(const minutes of[10,1440]){
 const p=actual.build({rows:sizedPreset(preset.rows,minutes),color:COLORS.shade[1],liveBaked:true});p.g.updateMatrixWorld(true);
 let cloth;p.g.traverse(o=>{if(o.userData.visitorCloth)cloth=o;});assert(cloth);
 const origin=p.wick.at.clone().add(new THREE.Vector3(0,.019*p.flame,0)),began=performance.now(),mask=makeGauzeDirectionMask(cloth.geometry,origin),milliseconds=performance.now()-began;
 const directions=Array.from({length:256},(_,i)=>{const y=1-2*(i+.5)/256,r=Math.sqrt(1-y*y),a=i*2.399963229728653;return new THREE.Vector3(r*Math.cos(a),y,r*Math.sin(a));});
 directions.push(new THREE.Vector3(0,1,0),new THREE.Vector3(0,-1,0),new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0));
 for(const d of directions){raycaster.set(origin,d);raycaster.near=.000001;raycaster.far=10;assert.equal(mask.trace(d.toArray()),raycaster.intersectObject(cloth,false).length>0,'Independent actual cloth ray mismatch '+preset.id+'/'+minutes);}
 assert.equal(mask.trace([0,1,0]),false,'The true top aperture must not count as cloth');assert.equal(mask.trace([0,-1,0]),false,'The true bottom aperture must not count as cloth');assert.equal(mask.trace([1,0,0]),true,'A horizontal ray must cross actual gauze');
 assert(mask.data.some(v=>v===0)&&mask.data.some(v=>v===255));assert(mask.data.some(v=>v>0&&v<255),'Fixed subpixel coverage must measure real aperture edges');
 rows.push({preset:preset.id,minutes,triangles:mask.triangles,raysCompared:directions.length,exactRayAgreement:true,width:mask.width,height:mask.height,texelBytes:mask.data.length,localBuildMilliseconds:milliseconds,unfilteredApertureFraction:mask.data.reduce((s,v)=>s+(1-v/255),0)/mask.data.length,maskSha256:createHash('sha256').update(mask.data).digest('hex')});
 mask.texture.dispose();
}
const material=new THREE.MeshStandardMaterial(),state=createGauzeTransmission(),beforeKey=material.customProgramCacheKey();state.install(material);state.install(material);
const shader={vertexShader:'',fragmentShader:'#include <lights_pars_begin>',uniforms:{}};material.onBeforeCompile(shader,{});
assert(shader.fragmentShader.includes('getGauzeOriginalPointLightInfo'));assert(shader.fragmentShader.includes('getPointLightInfo(const in PointLight'));assert(shader.fragmentShader.includes('inverseTransformDirection'));assert.notEqual(material.customProgramCacheKey(),beforeKey);
assert.throws(()=>createGauzeTransmission().install(material),/cloned/);
const expected=[.22,.013008423338438501,.006524191775506214];gauzeTransmissionColour(COLORS.shade[1]).toArray().forEach((v,i)=>assert(Math.abs(v-expected[i])<1e-12));
state.dispose();
await mkdir(out,{recursive:true});const module='web/src/engine/baked/gauzeTransmission.js';
await writeFile(out+'/report.json',JSON.stringify({passed:true,scope:'CPU actual production triangle/BVH/mask check. No source bake, WebGL shader compilation, GPU FPS or near/far optical seam approval.',actualSceneSha256:actual.sourceSha256,actualBuilderSha256:actual.builderSha256,moduleSha256:createHash('sha256').update(await readFile(module)).digest('hex'),rows,throughput:guiColour(),materialsHookComposes:true,otherOwnerRejected:true,temporalSamples:false,extraRenderTargets:0},null,2)+'\n');
function guiColour(){return COLORS.shade.map(css=>({css,linearThroughput:gauzeTransmissionColour(css).toArray()}));}
console.log('GAUZE_TRANSMISSION_CPU_PASS',rows.length,rows.map(r=>({shape:r.preset,minutes:r.minutes,ms:Math.round(r.localBuildMilliseconds),aperture:r.unfilteredApertureFraction})));
