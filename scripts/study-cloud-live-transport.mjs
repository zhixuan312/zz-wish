// Bounded actual-source directional-transmission motion error. No CPU image,
// GPU work, source modification or production lighting adoption.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Vector3 } from 'three';
import { makeNativeGraphReference } from '../tests/visual/cloud-arithmetic-reference.mjs';
import { makeCloudLiveReference } from './lib/cloud-live-reference.mjs';
const args=process.argv.slice(2),get=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const sourceDir=get('--field','art/build/cloud-cliff-round1/source19-cpu/saved-field'),out=get('--out','art/build/cloud-cliff-round1/source19-live-transport-study');
if(fs.existsSync(out))throw Error('New study output required');fs.mkdirSync(out,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),inputs=[];
function read(p,json=false){const bytes=fs.readFileSync(p);inputs.push({path:p,bytes:bytes.length,sha256:sha(bytes)});return json?JSON.parse(bytes):bytes;}
const record=read(path.join(sourceDir,'field.json'),true),c=record.contract,graph=read(path.join(sourceDir,'native-graph.json'),true);
const lattice='art/build/cloud-cliff-round1/hash-lattice-source17-prototype';
const tables=['a','b'].map(name=>{const b=read(`${lattice}/noise-corners-${name}.f16`);return new Uint16Array(b.buffer,b.byteOffset,b.length/2);});
const reference=makeCloudLiveReference(c,tables),field=reference.sample,native=makeNativeGraphReference(graph,{float32:true,fused:true,mix:'affine'});
const manifest=read('art/build/cloud-cliff-round1/runtime-eval-v16-delivery/manifest.json',true);
const light=manifest.bake.sourceNightLighting,sun=light.lights.find(row=>row.type==='SUN'),sd=new Vector3(0,0,1);
for(let a=0;a<3;a++)sd.applyAxisAngle(new Vector3(...[0,1,2].map(i=>+(a===i))),sun.rotationBlender[a]);
const directions=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[sd.x,sd.z,-sd.y]],points=[];
for(let i=0;i<12;i++){
  const b=c.banks[i*4];points.push(b.centre.map((v,a)=>v+(a===1?b.radii[a]*.3:0)));
}
for(const w of c.nearWisps)for(const offset of[-.3,.3])points.push(w.centre.map((v,a)=>v+(a===1?w.radii[a]*offset:0)));
let maxNode=0;for(const p of points)maxNode=Math.max(maxNode,Math.abs(field(p,0)-native(p)));
if(maxNode>1e-6)throw Error('Actual saved DAG reference failed');
const along=(p,d,t)=>p.map((v,a)=>v+d[a]*t),extent=(p,d)=>Math.max(0,Math.min(...d.flatMap((v,a)=>Math.abs(v)>1e-12?[((v>0?c.bounds.max[a]:c.bounds.min[a])-p[a])/v]:[])));
function transmission(p,d,time,spacing){
  let tau=0,end=extent(p,d);
  for(let t=0;t<end;t+=spacing){const ds=Math.min(spacing,end-t);tau+=field(along(p,d,t+ds*.5),time)*ds;if(tau>16)break;}
  return Math.exp(-tau);
}
const phase=v=>(1-c.anisotropy**2)/(4*Math.PI*Math.max(.001,1+c.anisotropy**2-2*c.anisotropy*v)**1.5);
const world=light.world.backgrounds[0].colour.slice(0,3).map(v=>v*light.world.backgrounds[0].strength),sunRGB=sun.linearColour.map(v=>v*sun.energy);
const camera=[5.2,1.85,4.7],times=[0,1,10,60,600,3600],rows=[],started=performance.now();let maxConvergence=0;
for(const p of points){
  const ray=p.map((v,a)=>v-camera[a]),length=Math.hypot(...ray);for(let a=0;a<3;a++)ray[a]/=length;
  const weights=directions.slice(0,6).map(d=>phase(d.reduce((sum,v,a)=>sum+v*ray[a],0))),weightSum=weights.reduce((a,b)=>a+b,0),sunPhase=phase(directions[6].reduce((sum,v,a)=>sum+v*ray[a],0));
  const source=values=>world.map((v,a)=>c.albedoLinear[a]*(v*weights.reduce((sum,w,i)=>sum+w*values[i],0)/weightSum+sunRGB[a]*sunPhase*values[6]));
  const t0=directions.map(d=>transmission(p,d,0,1)),source0=source(t0),samples=[];
  for(const time of times){
    const actual=directions.map(d=>transmission(p,d,time,1)),radiance=source(actual),rho=field(p,time);
    samples.push({time,localDensity:rho,actualDirectionalTransmission:actual,absoluteDifferenceFromFrozenT0:actual.map((v,i)=>Math.abs(v-t0[i])),actualLinearSourceRGB:radiance,frozenT0LinearSourceRGB:source0,absoluteSourceRGBError:radiance.map((v,i)=>Math.abs(v-source0[i]))});
  }
  if(rows.length%5===0){const fine=directions.map(d=>transmission(p,d,0,.5));maxConvergence=Math.max(maxConvergence,...fine.map((v,i)=>Math.abs(v-t0[i])));}
  rows.push({point:p,t0Transmission:t0,samples});
}
const changes=rows.flatMap(row=>row.samples.filter(s=>s.time>0)),weight=changes.reduce((sum,row)=>sum+row.localDensity,0);
const summary={maximumTransmissionChange:Math.max(...changes.flatMap(s=>s.absoluteDifferenceFromFrozenT0)),maximumLinearSourceRGBError:Math.max(...changes.flatMap(s=>s.absoluteSourceRGBError)),localExtinctionWeightedMeanSourceRGBError:changes.reduce((sum,row)=>sum+row.localDensity*row.absoluteSourceRGBError.reduce((a,b)=>a+b,0)/3,0)/weight};
for(const binding of inputs)if(sha(fs.readFileSync(binding.path))!==binding.sha256)throw Error('Immutable input changed');
const report={version:1,source:record.source,inputs,sourceFieldSha256:record.contractTextSha256,actualSavedDagMaximumDensityDifference:maxNode,reference:{pointCount:points.length,spacingMetres:1,convergenceSubsetSpacingMetres:.5,maximumConvergenceSubsetTransmissionError:maxConvergence,arithmetic:reference.arithmetic},sourceLighting:{world,sun:sunRGB,directions,anisotropy:c.anisotropy,albedo:c.albedoLinear},times,summary,rows,cpuSeconds:(performance.now()-started)/1000,scriptSha256:sha(fs.readFileSync(new URL(import.meta.url))),limits:['Eighteen actual source bank/wisp points, not a rendered image or all-world bound.','The local extinction weight is a photometric diagnostic, not the full camera-ray opacity mass.','This intentionally measures whether frozen t0 directional fields are valid under real source motion; no T motion policy is adopted.','Six-axis HG/source SUN are the existing runtime illumination approximation, not a new native Cycles multiple-scattering claim.']};
fs.writeFileSync(path.join(out,'study.json'),JSON.stringify(report,null,2)+'\n');console.log('LIVE_TRANSPORT_STUDY_READY',out,JSON.stringify({seconds:report.cpuSeconds,summary,convergence:maxConvergence,maxNode}));
