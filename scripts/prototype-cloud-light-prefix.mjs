// CPU-only numeric prefix/quadrature control. Arrays are light-volume data,
// never a rendered image. No runtime/source mutation or GPU execution.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DataUtils } from 'three';
import { makeCloudLiveReference } from './lib/cloud-live-reference.mjs';
const args=process.argv.slice(2),get=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const out=get('--out','art/build/cloud-cliff-round1/source19-prefix64-control'),dims=get('--dimensions','64,48,96').split(',').map(Number);
const dumpArrays=args.includes('--dump-arrays');
if(dims.length!==3||dims.some(n=>!Number.isInteger(n)||n<8||n>256)||fs.existsSync(out))throw Error('Fresh output and bounded dimensions required');
fs.mkdirSync(out,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),inputs=[];
function read(p,json=false){const bytes=fs.readFileSync(p);inputs.push({path:p,bytes:bytes.length,sha256:sha(bytes)});return json?JSON.parse(bytes):bytes;}
const saved=read('art/build/cloud-cliff-round1/source19-cpu/saved-field/field.json',true),c=saved.contract;
const tables=['a','b'].map(name=>{const b=read(`art/build/cloud-cliff-round1/hash-lattice-source17-prototype/noise-corners-${name}.f16`);return new Uint16Array(b.buffer,b.byteOffset,b.length/2);});
const field=makeCloudLiveReference(c,tables).sample,truth=read('art/build/cloud-cliff-round1/source19-live-transport-study/study.json',true);
if(truth.source.sha256!==saved.source.sha256)throw Error('Actual source mismatch');
const [nx,ny,nz]=dims,N=nx*ny*nz,b=c.bounds,lower=Math.round(ny*.25),split=-88;
const dx=(b.max[0]-b.min[0])/nx,dz=(b.max[2]-b.min[2])/nz;
const ys=Array.from({length:ny},(_,i)=>i<lower?b.min[1]+(i+.5)*(split-b.min[1])/lower:split+(i-lower+.5)*(b.max[1]-split)/(ny-lower));
const dys=ys.map((_,i)=>i<lower?(split-b.min[1])/lower:(b.max[1]-split)/(ny-lower));
const index=(x,y,z)=>x+nx*(y+ny*z),rho=new Float32Array(N),sizes=[dx,dys,dz],started=performance.now();
for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)rho[index(x,y,z)]=field([b.min[0]+(x+.5)*dx,ys[y],b.min[2]+(z+.5)*dz],0);
const half=v=>DataUtils.fromHalfFloat(DataUtils.toHalfFloat(v));
let f32=new Float32Array(N*3),f16=new Float32Array(N*3),next32=new Float32Array(N*3),next16=new Float32Array(N*3);
for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const i=index(x,y,z);for(let k=0;k<3;k++){const value=Math.fround(rho[i]*(k===1?dys[y]:sizes[k]));f32[i*3+k]=value;f16[i*3+k]=half(value);}}
let passes=0;
for(let stride=1;stride<Math.max(...dims);stride*=2){
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    const i=index(x,y,z),at=[x,y,z];
    for(let k=0;k<3;k++){
      const previous=at.slice();previous[k]-=stride;const j=previous[k]>=0?index(...previous):-1;
      next32[i*3+k]=Math.fround(f32[i*3+k]+(j<0?0:f32[j*3+k]));
      next16[i*3+k]=half(f16[i*3+k]+(j<0?0:f16[j*3+k]));
    }
  }
  [f32,next32]=[next32,f32];[f16,next16]=[next16,f16];passes++;
}
// Independent direct sums prove the actual parallel-doubling association and
// expose HALF cancellation separately from spatial quadrature/interpolation.
let directError32=0,directError16=0,maxCancellationTError=0;
for(const at of[[0,0,0],[nx-1,ny-1,nz-1],[nx>>1,ny>>1,nz>>1],[nx-2,ny-2,nz-2]])for(let axis=0;axis<3;axis++){
  let sum=0;for(let q=0;q<=at[axis];q++){const p=at.slice();p[axis]=q;sum+=rho[index(...p)]*(axis===1?dys[p[1]]:sizes[axis]);}
  const id=index(...at)*3+axis;directError32=Math.max(directError32,Math.abs(sum-f32[id]));directError16=Math.max(directError16,Math.abs(sum-f16[id]));
}
const exactPrefix=new Float64Array(N*3);
for(let axis=0;axis<3;axis++){
  const other=[0,1,2].filter(k=>k!==axis);
  for(let a=0;a<dims[other[0]];a++)for(let b=0;b<dims[other[1]];b++){
    const at=[0,0,0];at[other[0]]=a;at[other[1]]=b;let sum=0;
    for(let q=0;q<dims[axis];q++){at[axis]=q;const i=index(...at);sum+=rho[i]*(axis===1?dys[at[1]]:sizes[axis]);exactPrefix[i*3+axis]=sum;}
  }
}
const allNodeStorageError={checkedDirectionalValues:N*6,float32MaximumTError:0,half16MaximumTError:0};
for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)for(let axis=0;axis<3;axis++){
  const i=index(x,y,z),at=[x,y,z],end=at.slice();end[axis]=dims[axis]-1;
  const own=.5*rho[i]*(axis===1?dys[y]:sizes[axis]);
  for(const positive of[false,true]){
    const value=prefix=>Math.exp(-Math.max(0,positive?prefix[index(...end)*3+axis]-prefix[i*3+axis]+own:prefix[i*3+axis]-own));
    const reference=value(exactPrefix);allNodeStorageError.float32MaximumTError=Math.max(allNodeStorageError.float32MaximumTError,Math.abs(value(f32)-reference));allNodeStorageError.half16MaximumTError=Math.max(allNodeStorageError.half16MaximumTError,Math.abs(value(f16)-reference));
  }
}
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function yIndex(y){if(y<=ys[0])return 0;if(y>=ys.at(-1))return ny-1;let lo=0,hi=ny-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(ys[mid]<=y)lo=mid;else hi=mid;}return lo+(y-ys[lo])/(ys[hi]-ys[lo]);}
function transmissionAtNode(x,y,z,prefix,axis,positive,quantize=false){
  const i=index(x,y,z),at=[x,y,z],end=at.slice();end[axis]=dims[axis]-1;
  const own=.5*rho[i]*(axis===1?dys[y]:sizes[axis]),tau=positive?Math.max(0,prefix[index(...end)*3+axis]-prefix[i*3+axis]+own):Math.max(0,prefix[i*3+axis]-own);
  const T=Math.exp(-tau);return quantize?Math.round(T*255)/255:T;
}
function cached(p,prefix,quantize=false){
  const q=[(p[0]-b.min[0])/dx-.5,yIndex(p[1]),(p[2]-b.min[2])/dz-.5],lo=q.map(Math.floor),f=q.map((v,i)=>v-lo[i]),T=new Array(6).fill(0);
  for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){
    const weight=(x?f[0]:1-f[0])*(y?f[1]:1-f[1])*(z?f[2]:1-f[2]),at=[clamp(lo[0]+x,0,nx-1),clamp(lo[1]+y,0,ny-1),clamp(lo[2]+z,0,nz-1)];
    for(let k=0;k<6;k++)T[k]+=transmissionAtNode(...at,prefix,Math.floor(k/2),k%2===0,quantize)*weight;
  }
  return T;
}
const phase=v=>(1-c.anisotropy**2)/(4*Math.PI*Math.max(.001,1+c.anisotropy**2-2*c.anisotropy*v)**1.5),camera=[5.2,1.85,4.7];
const nearBounds={min:[-32,-42,-64],max:[112,1,64]};
function idealNear(p){
  const result=cached(p,f32);
  if(p.some((v,k)=>v<nearBounds.min[k]||v>nearBounds.max[k]))return result;
  for(let k=0;k<6;k++){
    const axis=Math.floor(k/2),sign=k%2===0?1:-1,end=(sign>0?nearBounds.max[axis]-p[axis]:p[axis]-nearBounds.min[axis]),exit=p.slice();exit[axis]+=sign*end;
    let tau=0;for(let distance=0;distance<end;distance+=1){const ds=Math.min(1,end-distance),point=p.slice();point[axis]+=sign*(distance+ds*.5);tau+=field(point,0)*ds;}
    result[k]=cached(exit,f32)[k]*Math.exp(-tau);
  }
  return result;
}
const rows=[];let weightedError32=0,weightedError16=0,totalWeight=0;
for(const row of truth.rows){
  const actual=row.samples.find(s=>s.time===0),ray=row.point.map((v,k)=>v-camera[k]),length=Math.hypot(...ray);for(let k=0;k<3;k++)ray[k]/=length;
  const weights=truth.sourceLighting.directions.slice(0,6).map(d=>phase(d.reduce((s,v,k)=>s+v*ray[k],0))),weightSum=weights.reduce((s,v)=>s+v,0);
  const sourceRGB=T=>truth.sourceLighting.world.map((v,k)=>c.albedoLinear[k]*(v*T.reduce((s,t,i)=>s+t*weights[i],0)/weightSum+truth.sourceLighting.sun[k]*phase(truth.sourceLighting.directions[6].reduce((s,v,k)=>s+v*ray[k],0))*actual.actualDirectionalTransmission[6]));
  const modes={float32:cached(row.point,f32),half16:cached(row.point,f16),float32ToT8:cached(row.point,f32,true),idealNear1mWithCoarseBoundary:idealNear(row.point)},reference=sourceRGB(actual.actualDirectionalTransmission.slice(0,6));
  const values={};for(const [mode,T]of Object.entries(modes)){const rgb=sourceRGB(T);values[mode]={transmission:T,maximumTError:Math.max(...T.map((v,i)=>Math.abs(v-actual.actualDirectionalTransmission[i]))),linearSourceRGB:rgb,maximumRGBError:Math.max(...rgb.map((v,i)=>Math.abs(v-reference[i])))};}
  maxCancellationTError=Math.max(maxCancellationTError,...modes.float32.map((v,i)=>Math.abs(v-modes.half16[i])));
  weightedError32+=actual.localDensity*values.float32.maximumRGBError;weightedError16+=actual.localDensity*values.half16.maximumRGBError;totalWeight+=actual.localDensity;
  rows.push({point:row.point,localDensity:actual.localDensity,referenceTransmission:actual.actualDirectionalTransmission.slice(0,6),referenceSourceRGB:reference,candidates:values});
}
for(const entry of inputs)if(sha(fs.readFileSync(entry.path))!==entry.sha256)throw Error('Immutable input changed');
const summary={float32:{maximumTError:Math.max(...rows.map(r=>r.candidates.float32.maximumTError)),maximumSourceRGBError:Math.max(...rows.map(r=>r.candidates.float32.maximumRGBError)),localExtinctionWeightedMeanMaximumRGBError:weightedError32/totalWeight},half16:{maximumTError:Math.max(...rows.map(r=>r.candidates.half16.maximumTError)),maximumSourceRGBError:Math.max(...rows.map(r=>r.candidates.half16.maximumRGBError)),localExtinctionWeightedMeanMaximumRGBError:weightedError16/totalWeight},halfVsFloat32MaximumTError:maxCancellationTError,
  idealNear1mWithCoarseBoundary:{maximumTError:Math.max(...rows.map(r=>r.candidates.idealNear1mWithCoarseBoundary.maximumTError)),maximumSourceRGBError:Math.max(...rows.map(r=>r.candidates.idealNear1mWithCoarseBoundary.maximumRGBError)),localExtinctionWeightedMeanMaximumRGBError:rows.reduce((sum,row)=>sum+row.localDensity*row.candidates.idealNear1mWithCoarseBoundary.maximumRGBError,0)/totalWeight}};
const report={version:1,status:'CPU prefix/quadrature control only; no runtime/GPU adoption',source:saved.source,inputs,sourceFieldSha256:saved.contractTextSha256,dimensions:dims,yNodes:ys,passes,worldBounds:b,rawRhoSha256:sha(Buffer.from(rho.buffer)),directParallelPrefixError:{float32:directError32,half16:directError16},allNodeStorageError,summary,rows,
  hypotheticalGpuBytes:{float32PrefixPingpongRGBA:N*16*2,half16PrefixPingpongRGBA:N*8*2,completedDoubleBufferedSixAxisT8:N*4*4},
  nearRefinementControl:{bounds:nearBounds,method:'Ideal direct1m actual-source local ray quadrature plus existing coarse prefix transmission at its exact exit. This isolates the benefit and inherited boundary error; it is not a claim that an actual1m voxel prefix has been implemented or is exact.'},
  cpuSeconds:(performance.now()-started)/1000,scriptSha256:sha(fs.readFileSync(new URL(import.meta.url))),limits:['Six axis medium-only transmission; actual opaque light blockers are not represented.','Source SUN uses unchanged exact1m truth on every candidate to isolate this axis-prefix test; no SUN-prefix claim.','Spatial source-density quadrature and T interpolation errors are distinct from prefix/storage error.','Eighteen source points and local-extinction weights are not an image/full opacity-weighted ray proof.','GPU cost, one-pass-per-frame phase lag, crossfade and actual near-wisp grid remain future gates.']};
if(dumpArrays){report.arrays=[];for(const[name,data]of[['density-rho.f32',rho],['prefix-xyz.f32',f32]]){const bytes=Buffer.from(data.buffer);fs.writeFileSync(path.join(out,name),bytes);report.arrays.push({uri:name,bytes:bytes.length,sha256:sha(bytes),type:'FLOAT32_LE'});}}
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(report,null,2)+'\n');console.log('LIGHT_PREFIX_CPU_READY',out,JSON.stringify({seconds:report.cpuSeconds,dimensions:dims,passes,summary,direct:report.directParallelPrefixError,bytes:report.hypotheticalGpuBytes}));
