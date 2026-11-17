// CPU coverage of actual cloth; no Three/GPU/material/geometry retention.
// All triangle values and intermediate precomputations are Float64, preserving
// the baseline JS-number arithmetic and its determinant/barycentric thresholds.
const W=128,H=64,N=W*H;
// Equal-area inner/outer disk rings, each with four opposing samples. The
// projected emitter has zero mean offset and isotropic second moment R²/4.
const diagonal=Math.sqrt(.375),emitterSamples=new Float64Array([.5,0,0,.5,-.5,0,0,-.5,diagonal,diagonal,-diagonal,diagonal,-diagonal,-diagonal,diagonal,-diagonal]);
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

function segmentDistanceSquared(tx,ty,tz,ex,ey,ez){
 const length2=ex*ex+ey*ey+ez*ez,t=length2?Math.max(0,Math.min(1,(tx*ex+ty*ey+tz*ez)/length2)):0;
 const x=tx-t*ex,y=ty-t*ey,z=tz-t*ez;return x*x+y*y+z*z;
}
function finiteEmitter(canonical,point,requestedEmitterRadius){
 if(!requestedEmitterRadius)return{requestedEmitterRadius:0,emitterRadius:0,clothClearance:null};
 const {positions:p,indices}=canonical;let nearest2=Infinity;
 // One linear closest-triangle pass per miss. Unlike a box or fitted radius,
 // this also catches a pinched/drawn cloth region close to the actual source.
 for(let i=0;i<indices.length;i+=3){
  const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
  const ex=p[b]-p[a],ey=p[b+1]-p[a+1],ez=p[b+2]-p[a+2],fx=p[c]-p[a],fy=p[c+1]-p[a+1],fz=p[c+2]-p[a+2];
  const tx=point.x-p[a],ty=point.y-p[a+1],tz=point.z-p[a+2],ee=ex*ex+ey*ey+ez*ez,ef=ex*fx+ey*fy+ez*fz,ff=fx*fx+fy*fy+fz*fz;
  const nx=ey*fz-ez*fy,ny=ez*fx-ex*fz,nz=ex*fy-ey*fx,den=nx*nx+ny*ny+nz*nz;
  let distance2;
  if(den>0){
   const te=tx*ex+ty*ey+tz*ez,tf=tx*fx+ty*fy+tz*fz,u=(ff*te-ef*tf)/den,v=(ee*tf-ef*te)/den;
   if(u>=0&&v>=0&&u+v<=1){const x=tx-u*ex-v*fx,y=ty-u*ey-v*fy,z=tz-u*ez-v*fz;distance2=x*x+y*y+z*z;}
  }
  distance2??=Math.min(segmentDistanceSquared(tx,ty,tz,ex,ey,ez),segmentDistanceSquared(tx,ty,tz,fx,fy,fz),segmentDistanceSquared(tx-ex,ty-ey,tz-ez,fx-ex,fy-ey,fz-ez));
  nearest2=Math.min(nearest2,distance2);
 }
 const clothClearance=Math.sqrt(nearest2);
 return{requestedEmitterRadius,emitterRadius:Math.min(requestedEmitterRadius,.8*clothClearance),clothClearance};
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
 function hitOffset(i,dx,dy,dz,sx,sy,sz){
  const ex=triangle[i],ey=triangle[i+1],ez=triangle[i+2],fx=triangle[i+3],fy=triangle[i+4],fz=triangle[i+5];
  const hx=dy*fz-dz*fy,hy=dz*fx-dx*fz,hz=dx*fy-dy*fx,det=ex*hx+ey*hy+ez*hz;
  if(abs(det)<1e-14)return false;
  const u=((triangle[i+6]+sx)*hx+(triangle[i+7]+sy)*hy+(triangle[i+8]+sz)*hz)/det;
  if(u< -1e-9||u>1+1e-9)return false;
  const qx=triangle[i+9]+sy*ez-sz*ey,qy=triangle[i+10]+sz*ex-sx*ez,qz=triangle[i+11]+sx*ey-sy*ex;
  const v=(dx*qx+dy*qy+dz*qz)/det;if(v< -1e-9||u+v>1+1e-9)return false;
  return(fx*qx+fy*qy+fz*qz)/det>.000001;
 }
 function traceOffsetXYZ(dx,dy,dz,sx,sy,sz){
  const previousLeaf=lastLeaf;
  if(lastTriangle>=0&&hitOffset(lastTriangle,dx,dy,dz,sx,sy,sz))return true;
  if(previousLeaf>=0){const j=previousLeaf*2,start=-nodeChildren[j]-1,end=start+nodeChildren[j+1];for(let t=start;t<end;t++){const i=ordered[t]*13;if(i!==lastTriangle&&hitOffset(i,dx,dy,dz,sx,sy,sz)){lastTriangle=i;return true;}}}
  let size=1;stack[0]=0;
  while(size){
   const id=stack[--size],k=id*6;
   let near=0,far=Infinity,a,b;
   if(abs(dx)<1e-15){if(sx<nodeBounds[k]||sx>nodeBounds[k+3])continue;}
   else{a=(nodeBounds[k]-sx)/dx;b=(nodeBounds[k+3]-sx)/dx;if(a>b){const swap=a;a=b;b=swap;}near=Math.max(near,a);far=Math.min(far,b);if(far<near)continue;}
   if(abs(dy)<1e-15){if(sy<nodeBounds[k+1]||sy>nodeBounds[k+4])continue;}
   else{a=(nodeBounds[k+1]-sy)/dy;b=(nodeBounds[k+4]-sy)/dy;if(a>b){const swap=a;a=b;b=swap;}near=Math.max(near,a);far=Math.min(far,b);if(far<near)continue;}
   if(abs(dz)<1e-15){if(sz<nodeBounds[k+2]||sz>nodeBounds[k+5])continue;}
   else{a=(nodeBounds[k+2]-sz)/dz;b=(nodeBounds[k+5]-sz)/dz;if(a>b){const swap=a;a=b;b=swap;}near=Math.max(near,a);far=Math.min(far,b);if(far<near)continue;}
   if(!(far>.000001))continue;
   const j=id*2,left=nodeChildren[j],right=nodeChildren[j+1];
   if(left>=0){stack[size++]=left;stack[size++]=right;continue;}
   if(id===previousLeaf)continue;
   const end=-left-1+right;
   for(let t=-left-1;t<end;t++){
    const i=ordered[t]*13;if(hitOffset(i,dx,dy,dz,sx,sy,sz)){lastTriangle=i;lastLeaf=id;return true;}
   }
  }
  return false;
 }
 return{traceXYZ,traceOffsetXYZ,trace:d=>traceXYZ(d[0],d[1],d[2]),triangles:n,nodes};
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

function renderFiniteMask(tracer,radius){
 const data=new Uint8Array(N);
 for(let y=0;y<H;y++)for(let sy=0;sy<2;sy++)for(let x=0;x<W;x++)for(let sx=0;sx<2;sx++){
  const pixel=y*W+x,k=pixel*12+sy*6+sx*3,dx=directions[k],dy=directions[k+1],dz=directions[k+2],horizontal=Math.hypot(dx,dz);
  // Orthonormal disk perpendicular to this ray, in actual cloth-local metres.
  const ux=horizontal>1e-12?dz/horizontal:1,uz=horizontal>1e-12?-dx/horizontal:0;
  const vx=dy*uz,vy=dz*ux-dx*uz,vz=-dy*ux;
  for(let i=0;i<emitterSamples.length;i+=2){
   const u=radius*emitterSamples[i],v=radius*emitterSamples[i+1];
   if(tracer.traceOffsetXYZ(dx,dy,dz,ux*u+vx*v,vy*v,uz*u+vz*v))data[pixel]++;
  }
 }
 for(let i=0;i<N;i++)data[i]=Math.round(data[i]*255/32);
 return data;
}
function maskData(tracer,emitterRadius){return emitterRadius>0?renderFiniteMask(tracer,emitterRadius):renderMask(tracer);}

const scope='Actual cloth triangles,128x64 angular mask with four fixed subpixel rays; apertures are real missing triangles. Linear/mip coverage approximates angular integration; no temporal noise or extra render target.';
function validate(geometry,origin,{width=W,height=H,emitterRadius=0}={}){
 if(!geometry?.isBufferGeometry||!origin?.isVector3)throw Error('Actual cloth geometry and local point centre required');
 if(width!==W||height!==H)throw Error('Use the measured128x64 fixed coverage recipe');
 if(!Number.isFinite(emitterRadius)||emitterRadius<0)throw Error('Finite non-negative emitter radius required');
 return emitterRadius||0;
}
function snapshotPoint(origin){return{x:origin.x,y:origin.y,z:origin.z};}
function result(canonical,point,data,initialTrace,cacheHit,sampling){
 const {emitterRadius}=sampling;
 let tracer=initialTrace;
 return{data,width:W,height:H,triangles:canonical.indices.length/3,cacheHit,...sampling,emitterSamples:emitterRadius>0?8:1,scope:scope+(emitterRadius>0?' Each subpixel direction averages eight deterministic symmetric projected-disk source origins; effective radius is capped at80% of nearest actual cloth clearance. This is a finite-emitter quadrature approximation.':''),
  // Runtime uses bytes only. Diagnostic tracing lazily rebuilds a CPU BVH on a
  // cache hit; cache entries themselves retain no BVH or diagnostic closure.
  // Diagnostic trace remains the exact centre-origin triangle classification.
  trace:d=>{tracer??=makeTrace(canonical,point);return tracer.trace(d);},
 };
}
export function buildGauzeMaskData(geometry,origin,options){
 const requestedEmitterRadius=validate(geometry,origin,options);
 const canonical=canonicalGeometry(geometry),point=snapshotPoint(origin),sampling=finiteEmitter(canonical,point,requestedEmitterRadius),tracer=makeTrace(canonical,point);
 return result(canonical,point,maskData(tracer,sampling.emitterRadius),tracer,false,sampling);
}

// Small hash narrows candidates; an exact canonical-value comparison establishes
// identity. Cache entries retain CPU arrays only, never Geometry/Material/Texture.
function hash(canonical,origin,emitterRadius){
 let h=2166136261;
 for(const array of[canonical.positions,canonical.indices]){
  const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
  for(let i=0;i<bytes.length;i++)h=Math.imul(h^bytes[i],16777619);
 }
 const v=new Float64Array([origin.x,origin.y,origin.z,emitterRadius]),bytes=new Uint8Array(v.buffer);
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
   const requestedEmitterRadius=validate(geometry,origin,options);
   const canonical=canonicalGeometry(geometry),point=snapshotPoint(origin),key=hash(canonical,point,requestedEmitterRadius);
   const at=entries.findIndex(e=>e.key===key&&Object.is(e.sampling.requestedEmitterRadius,requestedEmitterRadius)&&Object.is(e.point.x,point.x)&&Object.is(e.point.y,point.y)&&Object.is(e.point.z,point.z)&&equal(e.canonical,canonical));
   if(at>=0){const entry=entries.splice(at,1)[0];entries.push(entry);hits++;return result(entry.canonical,entry.point,entry.data.slice(),null,true,entry.sampling);}
   misses++;
   const sampling=finiteEmitter(canonical,point,requestedEmitterRadius),tracer=makeTrace(canonical,point),data=maskData(tracer,sampling.emitterRadius),size=canonical.positions.byteLength+canonical.indices.byteLength+data.byteLength+48;
   if(size<=maxBytes&&maxEntries>0){
    while(entries.length&&(entries.length>=maxEntries||bytes+size>maxBytes))bytes-=entries.shift().size;
    entries.push({key,canonical,point,sampling,data:data.slice(),size});bytes+=size;
   }
   return result(canonical,point,data,tracer,false,sampling);
  },
  // Bytes conservatively count typed arrays plus origin/radii/clearance numbers. Object
  // overhead is bounded separately by maxEntries; the fixed ray table is shared.
  stats:()=>({hits,misses,entries:entries.length,bytes,maxEntries,maxBytes}),
  clear(){entries.length=0;bytes=0;},
 };
}
const defaultMaskDataCache=createGauzeMaskDataCache();
export function makeGauzeMaskData(geometry,origin,options){return defaultMaskDataCache.get(geometry,origin,options);}
