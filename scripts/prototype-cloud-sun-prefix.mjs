// CPU-only SUN-oriented prefix quadrature/storage control; no image or GPU.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import { DataUtils,Vector3 } from 'three';
import { makeCloudLiveReference } from './lib/cloud-live-reference.mjs';
const args=process.argv.slice(2),get=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const out=get('--out','art/build/cloud-cliff-round1/source19-sun-prefix-control'),dims=get('--dimensions','128,64,192').split(',').map(Number);
if(fs.existsSync(out)||dims.length!==3||dims.some(n=>!Number.isInteger(n)||n<8||n>256))throw Error('New output and bounded dimensions required');fs.mkdirSync(out,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),inputs=[];
function read(p,json=false){const b=fs.readFileSync(p);inputs.push({path:p,bytes:b.length,sha256:sha(b)});return json?JSON.parse(b):b;}
const record=read('art/build/cloud-cliff-round1/source19-cpu/saved-field/field.json',true),c=record.contract;
const tables=['a','b'].map(name=>{const b=read(`art/build/cloud-cliff-round1/hash-lattice-source17-prototype/noise-corners-${name}.f16`);return new Uint16Array(b.buffer,b.byteOffset,b.length/2);});
const field=makeCloudLiveReference(c,tables).sample,truth=read('art/build/cloud-cliff-round1/source19-live-transport-study/study.json',true);
if(truth.source.sha256!==record.source.sha256)throw Error('Actual source mismatch');
const D=new Vector3(...truth.sourceLighting.directions[6]).normalize(),U=new Vector3().crossVectors(D,Math.abs(D.y)<.99?new Vector3(0,1,0):new Vector3(1,0,0)).normalize(),V=new Vector3().crossVectors(D,U).normalize(),basis=[U,V,D].map(v=>v.toArray());
const dot=(p,q)=>p.reduce((s,v,i)=>s+v*q[i],0),points=[];
for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++)points.push([x,y,z].map((v,k)=>c.bounds[v?'max':'min'][k]));
const bounds={min:basis.map(v=>Math.min(...points.map(p=>dot(p,v)))),max:basis.map(v=>Math.max(...points.map(p=>dot(p,v))))},[nx,ny,nz]=dims,N=nx*ny*nz,spacing=dims.map((n,k)=>(bounds.max[k]-bounds.min[k])/n),index=(x,y,z)=>x+nx*(y+ny*z),world=q=>[0,1,2].map(k=>q.reduce((sum,v,a)=>sum+v*basis[a][k],0));
const rho=new Float32Array(N),own32=new Float32Array(N),own16=new Float32Array(N),half=v=>DataUtils.fromHalfFloat(DataUtils.toHalfFloat(v)),began=performance.now();
for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
  const i=index(x,y,z),p=world([x,y,z].map((v,k)=>bounds.min[k]+(v+.5)*spacing[k]));rho[i]=field(p,0);own32[i]=Math.fround(rho[i]*spacing[2]);own16[i]=half(own32[i]);
}
let prefix32=own32.slice(),prefix16=own16.slice(),next32=new Float32Array(N),next16=new Float32Array(N),passes=0;
for(let stride=1;stride<nz;stride*=2){
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    const i=index(x,y,z),j=z+stride<nz?index(x,y,z+stride):-1;
    next32[i]=Math.fround(prefix32[i]+(j<0?0:prefix32[j]));
    // Positive SUN uses the direct incoming prefix: no subtraction of two
    // large cumulative totals, so clipping belowexp(-16) is bounded.
    next16[i]=half(Math.min(16,prefix16[i]+(j<0?0:prefix16[j])));
  }
  [prefix32,next32]=[next32,prefix32];[prefix16,next16]=[next16,prefix16];passes++;
}
let maxT32=0,maxT16=0;
for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
  let tau=0;for(let z=nz-1;z>=0;z--){const i=index(x,y,z);tau+=rho[i]*spacing[2];const actual=Math.exp(-Math.max(0,tau-.5*rho[i]*spacing[2]));maxT32=Math.max(maxT32,Math.abs(Math.exp(-Math.max(0,prefix32[i]-.5*own32[i]))-actual));maxT16=Math.max(maxT16,Math.abs(Math.exp(-Math.max(0,prefix16[i]-.5*own16[i]))-actual));}
}
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function cached(p,halfMode=false,quantize=false){
  const q=basis.map((v,k)=>(dot(p,v)-bounds.min[k])/spacing[k]-.5),lo=q.map(Math.floor),f=q.map((v,k)=>v-lo[k]);let T=0;
  for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){
    const at=[x,y,z].map((v,k)=>clamp(lo[k]+v,0,dims[k]-1)),i=index(...at),tau=(halfMode?prefix16[i]-.5*own16[i]:prefix32[i]-.5*own32[i]);let t=Math.exp(-Math.max(0,tau));if(quantize)t=Math.round(t*255)/255;
    T+=t*(x?f[0]:1-f[0])*(y?f[1]:1-f[1])*(z?f[2]:1-f[2]);
  }return T;
}
const g=c.anisotropy,phase=v=>(1-g*g)/(4*Math.PI*Math.max(.001,1+g*g-2*g*v)**1.5),camera=[5.2,1.85,4.7],rows=[];
for(const row of truth.rows){
  const point=row.point,actual=row.samples.find(v=>v.time===0),ray=point.map((v,k)=>v-camera[k]),length=Math.hypot(...ray);for(let k=0;k<3;k++)ray[k]/=length;
  const scale=truth.sourceLighting.sun.map((v,k)=>v*c.albedoLinear[k]*phase(dot(ray,basis[2]))),modes={float32:cached(point),half16Direct:cached(point,true),half16ToT8:cached(point,true,true)};
  rows.push({point,localDensity:actual.localDensity,referenceTransmission:actual.actualDirectionalTransmission[6],candidates:Object.fromEntries(Object.entries(modes).map(([name,T])=>[name,{transmission:T,absoluteTError:Math.abs(T-actual.actualDirectionalTransmission[6]),maximumLinearSourceRGBError:Math.max(...scale.map(v=>v*Math.abs(T-actual.actualDirectionalTransmission[6])))}]))});
}
for(const binding of inputs)if(sha(fs.readFileSync(binding.path))!==binding.sha256)throw Error('Input drift');
const summary=Object.fromEntries(['float32','half16Direct','half16ToT8'].map(mode=>[mode,{maximumTError:Math.max(...rows.map(r=>r.candidates[mode].absoluteTError)),maximumLinearSourceRGBError:Math.max(...rows.map(r=>r.candidates[mode].maximumLinearSourceRGBError)),localExtinctionWeightedRGBError:rows.reduce((sum,r)=>sum+r.localDensity*r.candidates[mode].maximumLinearSourceRGBError,0)/rows.reduce((s,r)=>s+r.localDensity,0)}]));
const report={version:1,status:'CPU SUN quadrature component only; no GPU/source/public activation',source:record.source,inputs,sourceFieldSha256:record.contractTextSha256,dimensions:dims,basisWorldRows:basis,orientedBounds:bounds,spacingMetres:spacing,passes,allNodeStorageError:{samples:N,float32MaximumTError:maxT32,half16DirectMaximumTError:maxT16,half16TauClip:16},summary,rows,hypotheticalRgbaTargetBytes:{float32Pingpong:N*16*2,half16Pingpong:N*8*2},cpuSeconds:(performance.now()-began)/1000,scriptSha256:sha(fs.readFileSync(new URL(import.meta.url))),limits:['Oriented source-density cell quadrature/interpolation error is separate from prefix arithmetic.','Direct positive-SUN HALF prefix avoids the measured XYZ lineend-subtraction failure; this does not approve HALF XYZ storage.','No actual opaque-light blockers, near-refined SUN grid, phase scheduling or GPU performance proof.','Source1m truth uses the same frozen sourceSUN direction; multiple scattering/native Cycles equivalence is not claimed.']};
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(report,null,2)+'\n');console.log('SUN_PREFIX_CPU_READY',out,JSON.stringify({seconds:report.cpuSeconds,spacing,passes,allNodes:report.allNodeStorageError,summary}));
