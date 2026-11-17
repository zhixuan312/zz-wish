// Continuous static substrate only. No banks, wisps, noise, opaque visibility or radiance.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

export const CLOUD_SUBSTRATE_SOURCE19=Object.freeze({
 sourceBlendSha256:'ee3f9f065a72a102867d0bfe7ea9233761cd7db62e98711c993d38cba324bda0',
 sourceFieldSha256:'6aacf69c6964989e485f3f1a78401a10133738aa491b7e5fd7b4d71975c26f47',
 savedFieldJSONSha256:'eb24f1c42ec8790e4ef65b0181867aa34d8ced12944064a9373b8a81d2ef3d69',
});
const defaultField='art/build/cloud-cliff-round1/source19-cpu/saved-field/field.json';
const nodes=[-.8611363115940526,-.3399810435848563,.3399810435848563,.8611363115940526];
const weights=[.3478548451374538,.6521451548625461,.6521451548625461,.3478548451374538];
const finiteVector=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

function boxInterval(origin,direction,bounds,maximumDistance){
 let start=0,end=maximumDistance;
 for(let k=0;k<3;k++){
  if(direction[k]===0){if(origin[k]<bounds.min[k]||origin[k]>bounds.max[k])return null;continue;}
  let a=(bounds.min[k]-origin[k])/direction[k],b=(bounds.max[k]-origin[k])/direction[k];if(a>b)[a,b]=[b,a];start=Math.max(start,a);end=Math.min(end,b);if(end<=start)return null;
 }
 return{start,end};
}

export function createCloudSubstrateOpticalDepth(record,{savedFieldJSONSha256}={}){
 const c=record?.contract,b=c?.substrate;
 if(record?.source?.sha256!==CLOUD_SUBSTRATE_SOURCE19.sourceBlendSha256||record?.contractTextSha256!==CLOUD_SUBSTRATE_SOURCE19.sourceFieldSha256||c?.version!==7)throw Error('Actual saved Source19/source7 field identity required');
 if(savedFieldJSONSha256!==undefined&&savedFieldJSONSha256!==CLOUD_SUBSTRATE_SOURCE19.savedFieldJSONSha256)throw Error('Saved Source19 field JSON changed');
 if(!same(b?.centre,[160,-160,-570])||!same(b?.radii,[650,150,1000])||b?.density!==.006||b?.edgeWidth!==.32||!same(c.bounds?.min,[-490,-310,-1570])||!same(c.bounds?.max,[810,.7000000000000028,430]))throw Error('Actual static Source19 substrate/bounds changed');
 const centre=b.centre.map(Math.fround),radii=b.radii.map(Math.fround),density=Math.fround(b.density),edge=Math.fround((1-b.edgeWidth)**2),width=1-edge,bounds=Object.freeze({min:Object.freeze(c.bounds.min.slice()),max:Object.freeze(c.bounds.max.slice())});
 const identity=Object.freeze({...CLOUD_SUBSTRATE_SOURCE19,savedFieldJSONSha256:savedFieldJSONSha256??null});
 const model=Object.freeze({centre:Object.freeze(centre),radii:Object.freeze(radii),density,edgeStart:edge,shellDenominator:width,edgeWidthSource:b.edgeWidth,bounds,quantity:'Integral of saved static substrate extinction field over world metres; no light/radiance/albedo/HG factor.',arithmetic:'Float32 saved socket constants (including edgeStart=f32((1-edgeWidth)^2)), followed by Double continuous q²/smoothstep and four-point Gauss. Not per-operation native Float32/GPU exact.'});
 function envelope(q2){const u=Math.max(0,Math.min(1,(q2-edge)/width));return 1-u*u*(3-2*u);}
 function densityAt(point){
  if(!finiteVector(point))throw TypeError('Finite world point required');
  if(point.some((v,k)=>v<bounds.min[k]||v>bounds.max[k]))return 0;
  return density*envelope(point.reduce((sum,v,k)=>sum+((v-centre[k])/radii[k])**2,0));
 }
 function integrate({origin,direction,maximumDistance=Infinity}){
  if(!finiteVector(origin)||!finiteVector(direction))throw TypeError('Finite world origin and normalized direction required');
  const length=Math.hypot(...direction);if(!Number.isFinite(length)||Math.abs(length-1)>1e-6)throw RangeError('World ray direction must be normalized');
  if(!(maximumDistance>=0)||maximumDistance!==Infinity&&!Number.isFinite(maximumDistance))throw RangeError('Maximum distance must be finite nonnegative or Infinity');
  const d=direction.map(v=>v/length),interval=boxInterval(origin,d,bounds,maximumDistance);
  const empty=()=>({tau:0,transmission:1,segments:[],interval:null,identity});
  if(!interval)return empty();
  // Rebase at the finite source-box entry. This keeps all ordinary source-domain
  // quadratic coefficients bounded, even when the ray starts far from the cloud.
  const entry=origin.map((v,k)=>v+d[k]*interval.start),span=interval.end-interval.start,q=entry.map((v,k)=>(v-centre[k])/radii[k]),velocity=d.map((v,k)=>v/radii[k]);
  const A=velocity.reduce((s,v)=>s+v*v,0),closest=-q.reduce((s,v,k)=>s+v*velocity[k],0)/A,perpendicular=q.map((v,k)=>v+velocity[k]*closest),minimum=perpendicular.reduce((s,v)=>s+v*v,0);
  const crossing=level=>{const difference=level-minimum;if(difference<0)return null;const delta=Math.sqrt(difference/A);return[closest-delta,closest+delta];};
  const outer=crossing(1);if(!outer)return empty();
  const start=Math.max(0,outer[0]),end=Math.min(span,outer[1]);if(!(end>start))return empty();
  const inner=crossing(edge),cuts=[start,end,...(inner??[]).filter(v=>v>start&&v<end)].sort((a,b)=>a-b),segments=[];
  let tau=0,correction=0;
  for(let i=1;i<cuts.length;i++){
   const a=cuts[i-1],z=cuts[i];if(!(z>a))continue;
   const mid=a+(z-a)/2,half=(z-a)/2,qMid=minimum+A*(mid-closest)**2,kind=qMid<edge?'core':'shell';
   let segmentTau;
   if(kind==='core')segmentTau=density*(z-a);
   else{let sum=0;for(let j=0;j<4;j++){const at=mid+half*nodes[j],q2=minimum+A*(at-closest)**2;sum+=weights[j]*density*envelope(q2);}segmentTau=half*sum;}
   // Positive segment contributions, accumulated with compensated summation.
   const adjusted=segmentTau-correction,next=tau+adjusted;correction=(next-tau)-adjusted;tau=next;
   segments.push({kind,start:interval.start+a,end:interval.start+z,localStart:a,localEnd:z,length:z-a,tau:segmentTau,gaussSamples:kind==='core'?0:4});
  }
  return{tau,transmission:Math.exp(-tau),segments,interval:{start:interval.start,end:interval.end},identity,numerics:{entryReconstructionScaleMetres:Number.EPSILON*Math.max(1,...origin.map(Math.abs),Math.abs(interval.start)),meaning:'Scale of Double entry reconstruction rounding; not a certified total integral error bound. Very distant origins can lose world-scale precision.'}};
 }
 return{identity,model,densityAt,integrate};
}

export function loadCloudSubstrateOpticalDepth(path=defaultField){
 const bytes=readFileSync(path),sha256=createHash('sha256').update(bytes).digest('hex'),evaluator=createCloudSubstrateOpticalDepth(JSON.parse(bytes),{savedFieldJSONSha256:sha256});
 return{...evaluator,input:{path,bytes:bytes.length,sha256}};
}
