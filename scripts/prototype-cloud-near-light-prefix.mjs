// Actual <=1m near XYZ prefix and phase-matched coarse boundary seeds. CPU only.
import fs from'node:fs';import path from'node:path';import crypto from'node:crypto';
import{makeCloudLiveReference}from'./lib/cloud-live-reference.mjs';
const out=process.argv[2]??'art/build/cloud-cliff-round1/source19-near-prefix-control';if(fs.existsSync(out))throw Error('New output required');fs.mkdirSync(out,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),inputs=[];
function read(p,json=false){const b=fs.readFileSync(p);inputs.push({path:p,bytes:b.length,sha256:sha(b)});return json?JSON.parse(b):b;}
function floats(p,expected){const b=read(p);if(b.length!==expected.bytes||sha(b)!==expected.sha256)throw Error('Measured global arrays changed');return new Float32Array(b.buffer,b.byteOffset,b.length/4);}
const source=read('art/build/cloud-cliff-round1/source19-cpu/saved-field/field.json',true),c=source.contract,globalDir='art/build/cloud-cliff-round1/source19-prefix128-array-control',global=read(path.join(globalDir,'receipt.json'),true),truth=read('art/build/cloud-cliff-round1/source19-live-transport-study/study.json',true);
if(global.source.sha256!==source.source.sha256||truth.source.sha256!==source.source.sha256)throw Error('Actual source mismatch');
const grho=floats(path.join(globalDir,'density-rho.f32'),global.arrays.find(f=>f.uri==='density-rho.f32')),gprefix=floats(path.join(globalDir,'prefix-xyz.f32'),global.arrays.find(f=>f.uri==='prefix-xyz.f32'));
const tables=['a','b'].map(name=>{const b=read(`art/build/cloud-cliff-round1/hash-lattice-source17-prototype/noise-corners-${name}.f16`);return new Uint16Array(b.buffer,b.byteOffset,b.length/2);}),field=makeCloudLiveReference(c,tables).sample;
const box={min:[-32,-42,-64],max:[112,1,64]},dims=[144,44,128],[nx,ny,nz]=dims,N=nx*ny*nz,spacing=dims.map((n,k)=>(box.max[k]-box.min[k])/n),index=(x,y,z)=>x+nx*(y+ny*z),world=at=>at.map((v,k)=>box.min[k]+(v+.5)*spacing[k]),rho=new Float32Array(N),began=performance.now();
for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)rho[index(x,y,z)]=field(world([x,y,z]),0);
let prefix=new Float32Array(N*3),next=new Float32Array(N*3);for(let i=0;i<N;i++)for(let k=0;k<3;k++)prefix[i*3+k]=Math.fround(rho[i]*spacing[k]);
let passes=0;for(let stride=1;stride<Math.max(...dims);stride*=2){for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const at=[x,y,z],i=index(...at);for(let k=0;k<3;k++){const p=at.slice();p[k]-=stride;next[i*3+k]=Math.fround(prefix[i*3+k]+(p[k]<0?0:prefix[index(...p)*3+k]));}}[prefix,next]=[next,prefix];passes++;}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),[gx,gy,gz]=global.dimensions,gdx=(global.worldBounds.max[0]-global.worldBounds.min[0])/gx,gdz=(global.worldBounds.max[2]-global.worldBounds.min[2])/gz,gi=(x,y,z)=>x+gx*(y+gy*z),lower=Math.round(gy*.25),gdy=y=>y<lower?global.yNodes[1]-global.yNodes[0]:global.yNodes.at(-1)-global.yNodes.at(-2);
function yIndex(y){const ys=global.yNodes;if(y<=ys[0])return 0;if(y>=ys.at(-1))return gy-1;let lo=0,hi=gy-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(ys[mid]<=y)lo=mid;else hi=mid;}return lo+(y-ys[lo])/(ys[hi]-ys[lo]);}
function globalT(p,lane){
  const q=[(p[0]-global.worldBounds.min[0])/gdx-.5,yIndex(p[1]),(p[2]-global.worldBounds.min[2])/gdz-.5],lo=q.map(Math.floor),f=q.map((v,k)=>v-lo[k]),axis=Math.floor(lane/2);let T=0;
  for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){
    const at=[x,y,z].map((v,k)=>clamp(lo[k]+v,0,global.dimensions[k]-1)),i=gi(...at),end=at.slice();end[axis]=global.dimensions[axis]-1;const own=.5*grho[i]*(axis===0?gdx:axis===1?gdy(at[1]):gdz),tau=lane%2===0?gprefix[gi(...end)*3+axis]-gprefix[i*3+axis]+own:gprefix[i*3+axis]-own;
    T+=Math.exp(-Math.max(0,tau))*(x?f[0]:1-f[0])*(y?f[1]:1-f[1])*(z?f[2]:1-f[2]);
  }return T;
}
// Each outside integral is constant along its grid-axis line. Generate only
// six2D faces, not a duplicate three-dimensional boundary volume.
const faces=[];
for(let lane=0;lane<6;lane++){
  const axis=Math.floor(lane/2),other=[0,1,2].filter(k=>k!==axis),data=new Float32Array(dims[other[0]]*dims[other[1]]);
  for(let v=0;v<dims[other[1]];v++)for(let u=0;u<dims[other[0]];u++){
    const at=[0,0,0];at[other[0]]=u;at[other[1]]=v;const p=world(at);p[axis]=box[lane%2===0?'max':'min'][axis];data[u+dims[other[0]]*v]=globalT(p,lane);
  }faces.push({axis,other,data});
}
function nodeT(at,lane){const i=index(...at),axis=Math.floor(lane/2),end=at.slice();end[axis]=dims[axis]-1;const own=.5*rho[i]*spacing[axis],tau=lane%2===0?prefix[index(...end)*3+axis]-prefix[i*3+axis]+own:prefix[i*3+axis]-own,face=faces[lane];return Math.exp(-Math.max(0,tau))*face.data[at[face.other[0]]+dims[face.other[0]]*at[face.other[1]]];}
function nearT(p,lane){
  const q=p.map((v,k)=>(v-box.min[k])/spacing[k]-.5),lo=q.map(Math.floor),f=q.map((v,k)=>v-lo[k]);let T=0;
  for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){const at=[x,y,z].map((v,k)=>clamp(lo[k]+v,0,dims[k]-1));T+=nodeT(at,lane)*(x?f[0]:1-f[0])*(y?f[1]:1-f[1])*(z?f[2]:1-f[2]);}return T;
}
const camera=[5.2,1.85,4.7],g=c.anisotropy,phase=v=>(1-g*g)/(4*Math.PI*Math.max(.001,1+g*g-2*g*v)**1.5),rows=[];
for(const row of truth.rows){
  const actual=row.samples.find(v=>v.time===0),p=row.point,inside=p.every((v,k)=>v>=box.min[k]&&v<=box.max[k]),ray=p.map((v,k)=>v-camera[k]),length=Math.hypot(...ray);for(let k=0;k<3;k++)ray[k]/=length;
  const weights=truth.sourceLighting.directions.slice(0,6).map(d=>phase(d.reduce((s,v,k)=>s+v*ray[k],0))),sum=weights.reduce((a,b)=>a+b,0),sourceRGB=T=>truth.sourceLighting.world.map((v,k)=>c.albedoLinear[k]*(v*T.reduce((s,t,i)=>s+t*weights[i],0)/sum+truth.sourceLighting.sun[k]*phase(truth.sourceLighting.directions[6].reduce((s,v,k)=>s+v*ray[k],0))*actual.actualDirectionalTransmission[6]));
  const T=Array.from({length:6},(_,lane)=>inside?nearT(p,lane):globalT(p,lane)),rgb=sourceRGB(T),reference=sourceRGB(actual.actualDirectionalTransmission.slice(0,6));
  rows.push({point:p,insideNear:inside,localDensity:actual.localDensity,transmission:T,maximumTError:Math.max(...T.map((v,k)=>Math.abs(v-actual.actualDirectionalTransmission[k]))),maximumSourceRGBError:Math.max(...rgb.map((v,k)=>Math.abs(v-reference[k]))),sourceRGB:rgb,referenceSourceRGB:reference});
}
const total=rows.reduce((s,r)=>s+r.localDensity,0),summary={maximumTError:Math.max(...rows.map(r=>r.maximumTError)),maximumSourceRGBError:Math.max(...rows.map(r=>r.maximumSourceRGBError)),localExtinctionWeightedMaximumRGBError:rows.reduce((s,r)=>s+r.localDensity*r.maximumSourceRGBError,0)/total};
for(const f of inputs)if(sha(fs.readFileSync(f.path))!==f.sha256)throw Error('Input drift');
const report={version:1,status:'ActualCPU neargrid prefix, not GPU/runtime adoption',source:source.source,sourceFieldSha256:source.contractTextSha256,inputs,dimensions:dims,worldBounds:box,spacingMetres:spacing,passes,boundaryFaces:faces.map(f=>({axis:f.axis,dimensions:f.other.map(k=>dims[k]),float32Bytes:f.data.byteLength,sha256:sha(Buffer.from(f.data.buffer))})),boundaryQuantity:'Phase-matched coarse MEDIUM-ONLY transmission after exiting nearbox; source0phase onbothgrids. Opaque visibility must remain separate, not inherited fromcoarse blockedT.',summary,rows,cpuSeconds:(performance.now()-began)/1000,scriptSha256:sha(fs.readFileSync(new URL(import.meta.url))),limits:['Eighteensourcepoints,not actualcamera-scatteringRGB orall-worldbound.','SUN heldsameexact1m reference acrosscandidates; actual nearSUN remainsseparate.','NearnodeT interpolation/cache-borderblend and GPUtyped/timingremainunproven.','Coarseboundaryspatialerror remains; no frozenT0/live adoption.']};
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(report,null,2)+'\n');console.log('ACTUAL_NEAR_PREFIX_READY',out,JSON.stringify({seconds:report.cpuSeconds,summary,spacing,boundaryBytes:faces.reduce((s,f)=>s+f.data.byteLength,0)}));
