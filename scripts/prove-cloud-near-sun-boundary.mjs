// Whole sourceward ray/support-AABB separation, not sampled visibility.
import fs from'node:fs';import crypto from'node:crypto';
const out=process.argv[2]??'art/build/cloud-cliff-round1/source19-near-sun-boundary.json';if(fs.existsSync(out))throw Error('Fresh output required');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),fieldFile='art/build/cloud-cliff-round1/source19-cpu/saved-field/field.json',sunFile='art/build/cloud-cliff-round1/source19-sun-prefix-control/receipt.json',field=JSON.parse(fs.readFileSync(fieldFile)),sun=JSON.parse(fs.readFileSync(sunFile)),c=field.contract;
if(field.source.sha256!==sun.source.sha256)throw Error('Actual source mismatch');
const basis=sun.basisWorldRows,D=basis[2],near={min:[-32,-42,-64],max:[112,1,64]},corners=[];for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++)corners.push([x,y,z].map((v,k)=>near[v?'max':'min'][k]));
const dot=(p,q)=>p.reduce((s,v,k)=>s+v*q[k],0),bounds={min:basis.map(v=>Math.min(...corners.map(p=>dot(p,v)))),max:basis.map(v=>Math.max(...corners.map(p=>dot(p,v))))},dimensions=[192,128];
const ulp=v=>2**(Math.floor(Math.log2(Math.max(Math.abs(v),2**-126)))-23),supports=[];
for(const bank of c.banks){const pad=[0,1,2].map(k=>16*ulp(Math.abs(Math.fround(bank.centre[k]))+Math.fround(bank.radii[k])+Math.max(Math.abs(c.domainWarp.sampleOffsetBounds.min[k]),Math.abs(c.domainWarp.sampleOffsetBounds.max[k]))));supports.push({id:'child'+bank.id,min:bank.centre.map((v,k)=>Math.fround(v)-Math.fround(bank.radii[k])-c.domainWarp.sampleOffsetBounds.max[k]-pad[k]),max:bank.centre.map((v,k)=>Math.fround(v)+Math.fround(bank.radii[k])-c.domainWarp.sampleOffsetBounds.min[k]+pad[k]),numericPaddingMetres:pad});}
for(const wisp of c.nearWisps){const pad=wisp.centre.map((v,k)=>16*ulp(Math.abs(Math.fround(v))+Math.fround(wisp.radii[k])));supports.push({id:wisp.id,min:wisp.centre.map((v,k)=>Math.fround(v)-Math.fround(wisp.radii[k])-pad[k]),max:wisp.centre.map((v,k)=>Math.fround(v)+Math.fround(wisp.radii[k])+pad[k]),numericPaddingMetres:pad});}
function possible(origin,box){let lo=0,hi=Infinity;for(let k=0;k<3;k++){if(Math.abs(D[k])<1e-12){if(origin[k]<box.min[k]||origin[k]>box.max[k])return false;}else{const a=(box.min[k]-origin[k])/D[k],b=(box.max[k]-origin[k])/D[k];lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));}}return hi>=lo;}
const facePadding=bounds.max.map((v,k)=>16*ulp(Math.max(Math.abs(v),Math.abs(bounds.min[k])))),continuousPossible=[];
for(const support of supports){
  const corners=[];for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++)corners.push([x,y,z].map((v,k)=>support[v?'max':'min'][k]));
  const projected={min:basis.map(v=>Math.min(...corners.map(p=>dot(p,v)))),max:basis.map(v=>Math.max(...corners.map(p=>dot(p,v))))};
  const overlaps=projected.max[2]>=bounds.max[2]-facePadding[2]&&[0,1].every(k=>projected.max[k]>=bounds.min[k]-facePadding[k]&&projected.min[k]<=bounds.max[k]+facePadding[k]);
  if(overlaps)continuousPossible.push({id:support.id,projected});
}
const ambiguous=[];let clearAbove=0,clearSupport=0,minY=Infinity,maxY=-Infinity;
for(let y=0;y<dimensions[1];y++)for(let x=0;x<dimensions[0];x++){
  const q=[bounds.min[0]+(x+.5)*(bounds.max[0]-bounds.min[0])/dimensions[0],bounds.min[1]+(y+.5)*(bounds.max[1]-bounds.min[1])/dimensions[1],bounds.max[2]],world=[0,1,2].map(k=>q.reduce((s,v,i)=>s+v*basis[i][k],0));minY=Math.min(minY,world[1]);maxY=Math.max(maxY,world[1]);
  if(D[1]>0&&world[1]>c.bounds.max[1]){clearAbove++;continue;}
  const hits=supports.filter(box=>possible(world,box));if(!hits.length)clearSupport++;else ambiguous.push({texel:[x,y],world,possibleDynamicSupports:hits.map(v=>v.id)});
}
const report={version:1,source:field.source,sourceFieldSha256:field.contractTextSha256,inputs:[{path:fieldFile,sha256:sha(fs.readFileSync(fieldFile))},{path:sunFile,sha256:sha(fs.readFileSync(sunFile))}],queryBounds:near,sunBasisWorldRows:basis,orientedBounds:bounds,boundaryDimensions:dimensions,boundaryWorldYRange:[minY,maxY],clearAboveGlobalBox:clearAbove,clearOfEveryDynamicSupport:clearSupport,possibleDynamicCount:ambiguous.length,possibleDynamicExamples:ambiguous.slice(0,32),allBoundaryNodeRaysOnlyStaticSubstrate:ambiguous.length===0,
  continuousFacePrism:{allBoundaryFootprintsOnlyStaticSubstrate:continuousPossible.length===0,possibleDynamicSupports:continuousPossible,faceLocalAxisNumericPadding:facePadding,method:'Project every padded source-supportAABB into Sunbasis; its conservative orientedAABB must miss the entire continuous face rectangle extruded semi-infinitely toward SUN. This covers all interpolation footprints, not just24,576 texel-centre rays.'},
  method:'Full semi-infinite sourceward rays intersected with every conservative fixed child/wisp supportAABB, usingactualFloat32 centre/radii and16 local-axisULP padding; no radiance/opacity threshold or sampled camera visibility.',
  staticBoundary:'Where certified, only the saved static lower substrate can contribute after the near SUN-grid exit; use its separately verified exact polynomial line integral.',
  limits:['The whole-face claim requires continuousFacePrism.allBoundaryFootprintsOnlyStaticSubstrate, separately from the node count.','LocalULP padding is a conservative field-support numeric guard, not a relaxation of source physical contact limits.','Any possible-support prism remains uncertified and needs actual global dynamic transmission.'],scriptSha256:sha(fs.readFileSync(new URL(import.meta.url)))};
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log('NEAR_SUN_BOUNDARY_PROOF',out,JSON.stringify({clearAbove,clearSupport,possibleDynamic:ambiguous.length,minY,maxY}));
