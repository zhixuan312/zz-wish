// CPU prototype only: exact advected source noise and a measured static
// smooth-envelope cache. No renderer, source edit, bake or public activation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { zstdCompressSync, constants } from 'node:zlib';
import { DataUtils } from 'three';
import { arithmetic, makeNativeGraphReference } from '../tests/visual/cloud-arithmetic-reference.mjs';

const args=process.argv.slice(2);
const option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const input=path.resolve(option('--field','art/build/cloud-cliff-round1/source18-cpu/saved-field'));
const output=path.resolve(option('--out','art/build/cloud-cliff-round1/source18-live-envelope-prototype'));
const verticalSpacing=Number(option('--vertical-spacing','2'));
const rayFile=option('--rays',null);
if(![.5,1,2].includes(verticalSpacing))throw Error('Bounded prototype vertical spacing must be .5,1 or2 metres');
if(fs.existsSync(output))throw Error('Fresh prototype output required');
fs.mkdirSync(output,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const bindings=[];
function read(file,json=false){const bytes=fs.readFileSync(file);bindings.push({path:file,bytes:bytes.length,sha256:sha(bytes)});return json?JSON.parse(bytes):bytes;}
const record=read(path.join(input,'field.json'),true),c=record.contract;
const graph=read(path.join(input,'native-graph.json'),true);
if(record.source.sha256!==graph.source.sha256||c.version!==7||c.banks.length!==48||c.nearWisps.length!==3)throw Error('Actual matching v7 source field required');
const fp=arithmetic({float32:true,fused:true,mix:'affine'});
const {r,add,sub,mul,div,mad,blend}=fp;
const native=makeNativeGraphReference(graph,{float32:true,fused:true,mix:'affine'});
const lattice='art/build/cloud-cliff-round1/hash-lattice-source17-prototype';
const latticeProof=read(`${lattice}/proof.json`,true);
const cornerData=latticeProof.files.map(file=>{
  const bytes=read(path.join(lattice,file.uri));
  if(sha(bytes)!==file.sha256)throw Error('Noise lattice binding changed');
  return Float32Array.from(new Uint16Array(bytes.buffer,bytes.byteOffset,bytes.length/2),DataUtils.fromHalfFloat);
});
const mod=(x,n)=>x-n*Math.floor(x/n);
function noise(p){
  const cell=p.map(Math.floor),f=p.map((v,i)=>sub(v,cell[i]));
  const u=f.map(v=>mul(mul(mul(v,v),v),mad(v,mad(6,v,-15),10)));
  const address=mod(cell[0],17)+17*(mod(cell[1],17)+17*mod(cell[0]+cell[1]+cell[2],289));
  const corner=(x,y,z)=>div(cornerData[z][address*4+x+2*y],288);
  return blend(blend(blend(corner(0,0,0),corner(1,0,0),u[0]),blend(corner(0,1,0),corner(1,1,0),u[0]),u[1]),blend(blend(corner(0,0,1),corner(1,0,1),u[0]),blend(corner(0,1,1),corner(1,1,1),u[0]),u[1]),u[2]);
}
const bank=b=>({...b,centre:b.centre.map(r),radii:b.radii.map(r),density:r(b.density),edge:r((1-b.edgeWidth)**2)});
const banks=c.banks.map(bank),wisps=c.nearWisps.map(bank),substrate=bank(c.substrate);
if(!banks.every(b=>b.density===banks[0].density))throw Error('Max-envelope factorization requires equal actual bank densities');
function envelope(p,b){
  const q=p.map((v,i)=>div(sub(v,b.centre[i]),b.radii[i]));
  // Actual saved nodes use Blender XYZ = engine X,-Z,Y, in that dot order.
  const q2=add(add(mul(q[0],q[0]),mul(q[2],q[2])),mul(q[1],q[1]));
  const t=fp.clamp(div(sub(q2,b.edge),sub(1,b.edge)));
  return sub(1,mul(mul(t,t),sub(3,mul(2,t))));
}
const base=r(c.breakup.thresholdBase),amplitude=r(c.breakup.noiseAmplitude),norm=r(c.breakup.normalization);
function maximumEnvelope(p){let value=0;for(const b of banks){if(p.some((v,i)=>Math.abs(v-b.centre[i])>b.radii[i]))continue;value=Math.max(value,envelope(p,b));}return value;}
function field(p,time=0,sampleEnvelope=null){
  p=p.map(r);
  if(p.some((v,i)=>v<c.bounds.min[i]||v>c.bounds.max[i]))return 0;
  const haze=mul(substrate.density,envelope(p,substrate));
  const nearEnvelope=Math.max(...wisps.map(b=>mul(b.density,envelope(p,b))));
  const active=c.bankGroups.some(g=>p.every((v,i)=>v>=g.expandedCullBounds.min[i]&&v<=g.expandedCullBounds.max[i]));
  if(!active&&nearEnvelope===0)return haze;
  const advected=p.map((v,i)=>add(v,mul(r(c.flowEngine[i]),sub(r(time),r(c.timeOrigin)))));
  const n=c.noise.octaves.map(o=>fp.clamp(noise(advected.map((v,i)=>mad(v,r(o.frequency),r(o.offset[i]))))));
  const F=fp.clamp(add(add(mul(n[0],r(c.noise.octaves[0].weight)),mul(n[1],r(c.noise.octaves[1].weight))),mul(n[2],r(c.noise.octaves[2].weight))));
  const mixtures=c.domainWarp.octaveMixturesEngine.map(weights=>weights.reduce((sum,w,i)=>w?(sum===null?mul(n[i],r(w)):add(sum,mul(n[i],r(w)))):sum,null));
  const warped=p.map((v,i)=>add(v,mad(mixtures[i],r(c.domainWarp.scaleEngine[i]),r(c.domainWarp.offsetEngine[i]))));
  const E=active?(sampleEnvelope?sampleEnvelope(warped):maximumEnvelope(warped)):0;
  const child=mul(banks[0].density,fp.clamp(div(sub(E,sub(base,mul(F,amplitude))),norm)));
  const near=mul(nearEnvelope,mad(F,r(c.nearWispModulation.scale),r(c.nearWispModulation.base)));
  return add(Math.max(child,near),haze);
}
const began=performance.now(),index=(x,y,z,d)=>x+d[0]*(y+d[1]*z),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function makeCache(spacing,minimum,maximum,name){
  spacing=Array.isArray(spacing)?spacing:[spacing,spacing,spacing];
  const lo=minimum.map((v,i)=>Math.floor(v/spacing[i])*spacing[i]-spacing[i]),hi=maximum.map((v,i)=>Math.ceil(v/spacing[i])*spacing[i]+spacing[i]);
  const dims=hi.map((v,i)=>Math.round((v-lo[i])/spacing[i])),bytes=new Uint8Array(dims.reduce((a,b)=>a*b,1));
  for(const b of banks){
    const low=b.centre.map((v,i)=>clamp(Math.floor((v-b.radii[i]-lo[i])/spacing[i]-.5),0,dims[i]-1));
    const high=b.centre.map((v,i)=>clamp(Math.ceil((v+b.radii[i]-lo[i])/spacing[i]-.5),0,dims[i]-1));
    for(let z=low[2];z<=high[2];z++)for(let y=low[1];y<=high[1];y++)for(let x=low[0];x<=high[0];x++){
      const p=[x,y,z].map((v,i)=>lo[i]+(v+.5)*spacing[i]),code=Math.round(envelope(p,b)*255),id=index(x,y,z,dims);
      if(code>bytes[id])bytes[id]=code;
    }
  }
  const raw=Buffer.from(bytes),encoded=zstdCompressSync(raw,{params:{[constants.ZSTD_c_compressionLevel]:12}});
  fs.writeFileSync(path.join(output,`${name}.r8`),raw);fs.writeFileSync(path.join(output,`${name}.zstd`),encoded);
  return{lo,hi,dims,spacing,bytes,files:[{uri:`${name}.r8`,bytes:raw.length,sha256:sha(raw)},{uri:`${name}.zstd`,bytes:encoded.length,sha256:sha(encoded)}]};
}
const low=[0,1,2].map(i=>Math.min(...banks.map(b=>b.centre[i]-b.radii[i]))),high=[0,1,2].map(i=>Math.max(...banks.map(b=>b.centre[i]+b.radii[i])));
const coarse=makeCache([2,verticalSpacing,2],low,high,'envelope-coarse');
const near=makeCache(1,[-48,-56,-420],[176,2,-80],'envelope-near1m');
function sample(cache,p){
  if(p.some((v,i)=>v<cache.lo[i]||v>cache.hi[i]))return 0;
  const q=p.map((v,i)=>(v-cache.lo[i])/cache.spacing[i]-.5),a=q.map(Math.floor),f=q.map((v,i)=>v-a[i]);let value=0;
  for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++)value+=cache.bytes[index(clamp(a[0]+x,0,cache.dims[0]-1),clamp(a[1]+y,0,cache.dims[1]-1),clamp(a[2]+z,0,cache.dims[2]-1),cache.dims)]/255*(x?f[0]:1-f[0])*(y?f[1]:1-f[1])*(z?f[2]:1-f[2]);
  return r(value);
}
function cachedEnvelope(p){
  const global=sample(coarse,p),edge=Math.min(...p.flatMap((v,i)=>[v-near.lo[i],near.hi[i]-v]));
  const t=clamp(edge/8,0,1),weight=t*t*(3-2*t);
  return r(global+(sample(near,p)-global)*weight);
}
let seed=0x18beef17;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const points=[];
for(let i=0;i<5000;i++){
  const b=i%5===0?wisps[i%3]:banks[i%48];points.push(b.centre.map((v,a)=>v+(random()*2-1)*b.radii[a]*1.1));
}
let nodeMaximum=0,nodeFailures=0;
for(const p of points.slice(0,1500)){const e=Math.abs(field(p,0)-native(p));nodeMaximum=Math.max(nodeMaximum,e);if(e>1e-6)nodeFailures++;}
if(nodeFailures)throw Error(`Saved actual source-DAG reference differs: ${nodeFailures},${nodeMaximum}`);
const stats=values=>{values.sort((a,b)=>a-b);return{count:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,p95:values[Math.floor(values.length*.95)],maximum:values.at(-1)}};
const times=[0,1,10,60,600,3600],errors=[];
for(const time of times){const differences=points.map((p,index)=>({index,p,exact:field(p,time),cached:field(p,time,cachedEnvelope)})).map(row=>({...row,error:Math.abs(row.cached-row.exact)}));errors.push({time,densityAbsolute:stats(differences.map(row=>row.error)),worstSamples:differences.sort((a,b)=>b.error-a.error).slice(0,5)});}
const rayResults=[];
if(rayFile){
  const rays=read(rayFile,true);
  if(rays.source.sha256!==record.source.sha256)throw Error('Actual ray/source binding mismatch');
  for(const time of times)for(const ray of rays.rays){
    let exactTau=0,cachedTau=0;
    for(let distance=ray.volumeStart;distance<ray.clippedEnd;distance+=.5){
      const ds=Math.min(.5,ray.clippedEnd-distance),p=ray.origin.map((v,i)=>v+ray.direction[i]*(distance+ds*.5));
      exactTau+=field(p,time)*ds;cachedTau+=field(p,time,cachedEnvelope)*ds;
    }
    const exactAlpha=1-Math.exp(-exactTau),cachedAlpha=1-Math.exp(-cachedTau);
    rayResults.push({view:ray.view,pixelCss:ray.pixelCss,time,opaqueOwner:ray.opaqueOwner,active:ray.activeVolume,exactTau,cachedTau,exactAlpha,cachedAlpha,absoluteAlphaError:Math.abs(exactAlpha-cachedAlpha)});
  }
}
for(const binding of bindings)if(sha(fs.readFileSync(binding.path))!==binding.sha256)throw Error('Immutable source/reference input changed');
const metadata=cache=>({bounds:{min:cache.lo,max:cache.hi},dimensions:cache.dims,spacingMetres:cache.spacing,quantity:'max_i smooth child envelope E_i at unwarped WORLD p; banks all have the same actual density',format:'R8_UNORM',filter:'trilinear',mipLevels:1,files:cache.files,gpuLogicalTexelBytes:cache.bytes.length});
const report={version:1,status:'CPU live-field feasibility only; no source, runtime or GPU activation',source:record.source,inputs:bindings,
  scriptSha256:sha(fs.readFileSync(new URL(import.meta.url))),
  fieldPolicy:'Three exact existing source noise evaluations at p+flow*t via original integer-corner lookup; fixed smooth child-envelope cache sampled at actual warped position. Actual near-wisp envelopes/modulation and substrate remain analytic; supports never drift.',
  factorization:'All48 actual child densities are identical. max_i rho*clamp((E_i-threshold)/normalization)=rho*clamp((max_i E_i-threshold)/normalization). This identity is exact before envelope interpolation/storage.',
  coarse:metadata(coarse),near:metadata(near),blendMetres:8,noiseLookupGpuBytes:latticeProof.gpuTexelBytes,
  envelopeGpuLogicalBytes:coarse.bytes.length+near.bytes.length,encodedEnvelopeBytes:coarse.files[1].bytes+near.files[1].bytes,
  sourceDagReference:{actualNodes:graph.nodes.length,samples:1500,maximumDensityDifference:nodeMaximum,failuresAt1e6:nodeFailures,arithmetic:'Float32 with explicit MULTIPLY_ADD/FMA and actual Blender XYZ dot order; execution is a CPU reference, not native intermediate GPU readback'},
  empiricalDensityErrors:errors,actualRayResults:rayResults,actualRayAbsoluteAlphaError:rayResults.length?stats(rayResults.filter(row=>row.active).map(row=>row.absoluteAlphaError)):null,
  threeExistingNoiseEvaluations:true,analyticChildEvaluationsInRuntime:0,cpuSeconds:(performance.now()-began)/1000,
  limits:['No all-world small interpolation-error claim; published spacing and measured points are explicit.','Actual GPU integer-hash/lookup/source-DAG1e-6 parity remains required before use.','Transport T fields are still t0 controls; this prototype does not claim live directional-light accuracy.','Ray-integral/opaque-depth/performance/byte-budget and optical review remain separate gates.']};
fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(report,null,2)+'\n');
console.log('LIVE_ENVELOPE_CPU_READY',output,JSON.stringify({seconds:report.cpuSeconds,gpuBytes:report.envelopeGpuLogicalBytes,encodedBytes:report.encodedEnvelopeBytes,nodeMaximum,errors}));
