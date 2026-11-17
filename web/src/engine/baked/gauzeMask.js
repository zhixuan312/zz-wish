// Exact CPU coverage of actual cloth; no Three/GPU/material/geometry retention.
// All triangle values and intermediate precomputations are Float64, preserving
// the baseline JS-number arithmetic and its determinant/barycentric thresholds.
const W=128,H=64,N=W*H;
const directions=new Float64Array(N*4*3);
{
 let k=0;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(const sy of[.25,.75])for(const sx of[.25,.75]){
  const azimuth=((x+sx)/W-.5)*2*Math.PI,polar=(y+sy)/H*Math.PI,s=Math.sin(polar);
  directions[k++]=Math.cos(azimuth)*s;directions[k++]=Math.cos(polar);directions[k++]=Math.sin(azimuth)*s;
 }
}

function canonicalGeometry(geometry){
 if(!geometry?.isBufferGeometry)throw Error('Actual cloth BufferGeometry required');
 const p=geometry.getAttribute('position'),positions=new Float64Array(p.count*3),sourceIndex=geometry.index?.array;
 for(let i=0;i<p.count;i++){const j=i*3;positions[j]=p.getX(i);positions[j+1]=p.getY(i);positions[j+2]=p.getZ(i);}
 const indices=sourceIndex?Uint32Array.from(sourceIndex):Uint32Array.from({length:p.count},(_,i)=>i);
 return{positions,indices};
}

function makeTrace({positions:p,indices},origin){
 const ox=origin.x,oy=origin.y,oz=origin.z,n=indices.length/3;
 // ex,ey,ez,fx,fy,fz,tx,ty,tz,qx,qy,qz,tNumerator
 const triangle=new Float64Array(n*13),bounds=new Float64Array(n*6),centres=new Float64Array(n*3);
 const rows=Int32Array.from({length:n},(_,i)=>i);
 for(let i=0;i<n;i++){
  const ai=indices[i*3]*3,bi=indices[i*3+1]*3,ci=indices[i*3+2]*3;
  const ax=p[ai],ay=p[ai+1],az=p[ai+2],bx=p[bi],by=p[bi+1],bz=p[bi+2],cx=p[ci],cy=p[ci+1],cz=p[ci+2];
  const ex=bx-ax,ey=by-ay,ez=bz-az,fx=cx-ax,fy=cy-ay,fz=cz-az,tx=ox-ax,ty=oy-ay,tz=oz-az;
  const qx=ty*ez-tz*ey,qy=tz*ex-tx*ez,qz=tx*ey-ty*ex,j=i*13,k=i*6,l=i*3;
  triangle[j]=ex;triangle[j+1]=ey;triangle[j+2]=ez;triangle[j+3]=fx;triangle[j+4]=fy;triangle[j+5]=fz;
  triangle[j+6]=tx;triangle[j+7]=ty;triangle[j+8]=tz;triangle[j+9]=qx;triangle[j+10]=qy;triangle[j+11]=qz;triangle[j+12]=fx*qx+fy*qy+fz*qz;
  bounds[k]=Math.min(ax,bx,cx);bounds[k+1]=Math.min(ay,by,cy);bounds[k+2]=Math.min(az,bz,cz);
  bounds[k+3]=Math.max(ax,bx,cx);bounds[k+4]=Math.max(ay,by,cy);bounds[k+5]=Math.max(az,bz,cz);
  centres[l]=(ax+bx+cx)/3;centres[l+1]=(ay+by+cy)/3;centres[l+2]=(az+bz+cz)/3;
 }
 // Packed node bounds, relative to this exact origin, avoid repeated subtraction.
 const nodeBounds=new Float64Array(n*12),nodeChildren=new Int32Array(n*4),ordered=new Int32Array(n);
 let nodes=0,orderedCount=0;
 function partition(start,end,middle,axis){
  // Hoare-style nth element: selecting the median replaces repeated full sorts
  // without changing any ray/triangle arithmetic or adding a spatial tolerance.
  while(end-start>1){
   const pivot=centres[rows[(start+end)>>1]*3+axis];let i=start,j=end-1;
   while(i<=j){while(centres[rows[i]*3+axis]<pivot)i++;while(centres[rows[j]*3+axis]>pivot)j--;if(i<=j){const v=rows[i];rows[i]=rows[j];rows[j]=v;i++;j--;}}
   if(middle<=j)end=j+1;else if(middle>=i)start=i;else return;
  }
 }
 function build(start,end){
  const id=nodes++,k=id*6,j=id*2;
  let lx=Infinity,ly=Infinity,lz=Infinity,hx=-Infinity,hy=-Infinity,hz=-Infinity;
  for(let r=start;r<end;r++){const a=rows[r]*6;lx=Math.min(lx,bounds[a]);ly=Math.min(ly,bounds[a+1]);lz=Math.min(lz,bounds[a+2]);hx=Math.max(hx,bounds[a+3]);hy=Math.max(hy,bounds[a+4]);hz=Math.max(hz,bounds[a+5]);}
  nodeBounds[k]=lx-ox;nodeBounds[k+1]=ly-oy;nodeBounds[k+2]=lz-oz;nodeBounds[k+3]=hx-ox;nodeBounds[k+4]=hy-oy;nodeBounds[k+5]=hz-oz;
  if(end-start<=8){nodeChildren[j]=-orderedCount-1;nodeChildren[j+1]=end-start;for(let r=start;r<end;r++)ordered[orderedCount++]=rows[r];return id;}
  const sx=hx-lx,sy=hy-ly,sz=hz-lz,axis=sx>=sy&&sx>=sz?0:sy>=sz?1:2;
  const middle=(start+end)>>1;partition(start,end,middle,axis);
  nodeChildren[j]=build(start,middle);nodeChildren[j+1]=build(middle,end);return id;
 }
 build(0,n);
 const stack=new Int32Array(nodes),abs=Math.abs;let lastTriangle=-1,lastLeaf=-1;
 function hit(i,dx,dy,dz){
  const ex=triangle[i],ey=triangle[i+1],ez=triangle[i+2],fx=triangle[i+3],fy=triangle[i+4],fz=triangle[i+5];
  const hx=dy*fz-dz*fy,hy=dz*fx-dx*fz,hz=dx*fy-dy*fx,det=ex*hx+ey*hy+ez*hz;
  if(abs(det)<1e-14)return false;
  const u=(triangle[i+6]*hx+triangle[i+7]*hy+triangle[i+8]*hz)/det;if(u< -1e-9||u>1+1e-9)return false;
  const v=(dx*triangle[i+9]+dy*triangle[i+10]+dz*triangle[i+11])/det;if(v< -1e-9||u+v>1+1e-9)return false;
  return triangle[i+12]/det>.000001;
 }
 function traceXYZ(dx,dy,dz){
  // Coherent angular samples commonly hit the same leaf. Retesting those real
  // triangles first only reorders exact predicates; it never assumes coverage.
  const previousLeaf=lastLeaf;
  if(lastTriangle>=0&&hit(lastTriangle,dx,dy,dz))return true;
  if(previousLeaf>=0){const j=previousLeaf*2,start=-nodeChildren[j]-1,end=start+nodeChildren[j+1];for(let t=start;t<end;t++){const i=ordered[t]*13;if(i!==lastTriangle&&hit(i,dx,dy,dz)){lastTriangle=i;return true;}}}
  let size=1;stack[0]=0;
  while(size){
   const id=stack[--size],k=id*6;
   let near=0,far=Infinity,a,b;
   if(abs(dx)<1e-15){if(0<nodeBounds[k]||0>nodeBounds[k+3])continue;}
   else{a=nodeBounds[k]/dx;b=nodeBounds[k+3]/dx;if(a>b){const swap=a;a=b;b=swap;}near=Math.max(near,a);far=Math.min(far,b);if(far<near)continue;}
   if(abs(dy)<1e-15){if(0<nodeBounds[k+1]||0>nodeBounds[k+4])continue;}
   else{a=nodeBounds[k+1]/dy;b=nodeBounds[k+4]/dy;if(a>b){const swap=a;a=b;b=swap;}near=Math.max(near,a);far=Math.min(far,b);if(far<near)continue;}
   if(abs(dz)<1e-15){if(0<nodeBounds[k+2]||0>nodeBounds[k+5])continue;}
   else{a=nodeBounds[k+2]/dz;b=nodeBounds[k+5]/dz;if(a>b){const swap=a;a=b;b=swap;}near=Math.max(near,a);far=Math.min(far,b);if(far<near)continue;}
   if(!(far>.000001))continue;
   const j=id*2,left=nodeChildren[j],right=nodeChildren[j+1];
   if(left>=0){stack[size++]=left;stack[size++]=right;continue;}
   if(id===previousLeaf)continue;
   const end=-left-1+right;
   for(let t=-left-1;t<end;t++){
    const i=ordered[t]*13;if(hit(i,dx,dy,dz)){lastTriangle=i;lastLeaf=id;return true;}
   }
  }
  return false;
 }
 return{traceXYZ,trace:d=>traceXYZ(d[0],d[1],d[2]),triangles:n,nodes};
}

function renderMask(tracer){
 const data=new Uint8Array(N);
 // Same 32,768 precomputed Float64 directions and coverage sum; visit each
 // subpixel row coherently. No ray count, integration weight or byte changes.
 for(let y=0;y<H;y++)for(let sy=0;sy<2;sy++)for(let x=0;x<W;x++)for(let sx=0;sx<2;sx++){
  const pixel=y*W+x,k=pixel*12+sy*6+sx*3;if(tracer.traceXYZ(directions[k],directions[k+1],directions[k+2]))data[pixel]++;
 }
 for(let i=0;i<N;i++)data[i]=Math.round(data[i]*255/4);
 return data;
}

const scope='Actual cloth triangles,128x64 angular mask with four fixed subpixel rays; apertures are real missing triangles. Linear/mip coverage approximates angular integration; no temporal noise or extra render target.';
function validate(geometry,origin,{width=W,height=H}={}){
 if(!geometry?.isBufferGeometry||!origin?.isVector3)throw Error('Actual cloth geometry and local point centre required');
 if(width!==W||height!==H)throw Error('Use the measured128x64 fixed coverage recipe');
}
function snapshotPoint(origin){return{x:origin.x,y:origin.y,z:origin.z};}
function result(canonical,point,data,initialTrace,cacheHit){
 let tracer=initialTrace;
 return{data,width:W,height:H,triangles:canonical.indices.length/3,cacheHit,scope,
  // Runtime uses bytes only. Diagnostic tracing lazily rebuilds a CPU BVH on a
  // cache hit; cache entries themselves retain no BVH or diagnostic closure.
  trace:d=>{tracer??=makeTrace(canonical,point);return tracer.trace(d);},
 };
}
export function buildGauzeMaskData(geometry,origin,options){
 validate(geometry,origin,options);
 const canonical=canonicalGeometry(geometry),point=snapshotPoint(origin),tracer=makeTrace(canonical,point);
 return result(canonical,point,renderMask(tracer),tracer,false);
}

// Small hash narrows candidates; an exact canonical-value comparison establishes
// identity. Cache entries retain CPU arrays only, never Geometry/Material/Texture.
function hash(canonical,origin){
 let h=2166136261;
 for(const array of[canonical.positions,canonical.indices]){
  const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
  for(let i=0;i<bytes.length;i++)h=Math.imul(h^bytes[i],16777619);
 }
 const v=new Float64Array([origin.x,origin.y,origin.z]),bytes=new Uint8Array(v.buffer);
 for(let i=0;i<bytes.length;i++)h=Math.imul(h^bytes[i],16777619);
 return h>>>0;
}
function equal(a,b){
 if(a.positions.length!==b.positions.length||a.indices.length!==b.indices.length)return false;
 for(let i=0;i<a.positions.length;i++)if(!Object.is(a.positions[i],b.positions[i]))return false;
 for(let i=0;i<a.indices.length;i++)if(a.indices[i]!==b.indices[i])return false;
 return true;
}
export function createGauzeMaskDataCache({maxEntries=6,maxBytes=2*1024*1024}={}){
 if(!Number.isInteger(maxEntries)||maxEntries<0||!Number.isFinite(maxBytes)||maxBytes<0)throw Error('Finite non-negative mask cache limits required');
 const entries=[];let bytes=0,hits=0,misses=0;
 return{
  get(geometry,origin,options){
   validate(geometry,origin,options);
   const canonical=canonicalGeometry(geometry),point=snapshotPoint(origin),key=hash(canonical,point);
   const at=entries.findIndex(e=>e.key===key&&Object.is(e.point.x,point.x)&&Object.is(e.point.y,point.y)&&Object.is(e.point.z,point.z)&&equal(e.canonical,canonical));
   if(at>=0){const entry=entries.splice(at,1)[0];entries.push(entry);hits++;return result(entry.canonical,entry.point,entry.data.slice(),null,true);}
   misses++;
   const tracer=makeTrace(canonical,point),data=renderMask(tracer),size=canonical.positions.byteLength+canonical.indices.byteLength+data.byteLength+24;
   if(size<=maxBytes&&maxEntries>0){
    while(entries.length&&(entries.length>=maxEntries||bytes+size>maxBytes))bytes-=entries.shift().size;
    entries.push({key,canonical,point,data:data.slice(),size});bytes+=size;
   }
   return result(canonical,point,data,tracer,false);
  },
  // Bytes count retained typed arrays plus three exact origin numbers. Object
  // overhead is bounded separately by maxEntries; the fixed ray table is shared.
  stats:()=>({hits,misses,entries:entries.length,bytes,maxEntries,maxBytes}),
  clear(){entries.length=0;bytes=0;},
 };
}
const defaultMaskDataCache=createGauzeMaskDataCache();
export function makeGauzeMaskData(geometry,origin,options){return defaultMaskDataCache.get(geometry,origin,options);}
