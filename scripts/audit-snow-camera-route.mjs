// CPU geometry check: actual runtime curves against actual exported triangles.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import createPlace from '../web/src/engine/places/snow-roof-baked.js';
import {PRESET_SHAPES,sizedPreset,COLORS} from '../shared/rules.ts';
import {loadActualGauzeGeometry} from './load-gauze-geometry.mjs';

const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
if(!option('--raw')||!option('--out'))throw new Error('Supply immutable --raw GLB and separate --out JSON.');
const rawPath=resolve(option('--raw')),manifestPath=resolve(option('--manifest')??join(dirname(rawPath),'manifest.json')),out=resolve(option('--out')),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const rawBytes=await readFile(rawPath),manifestBytes=await readFile(manifestPath),manifest=JSON.parse(manifestBytes),tools=process.env.ONE_LIGHT_GLTF_TOOLS??'/tmp/one-light-gltf-tools';
const descriptorBytes=await readFile('web/src/engine/places/snow-roof-baked.js'),sceneSource=await readFile('web/src/engine/scene.js','utf8');
const {NodeIO}=await import(pathToFileURL(join(tools,'node_modules/@gltf-transform/core/dist/index.js')).href);
const document=await new NodeIO().read(rawPath),V3=(...p)=>new THREE.Vector3(...p),P=createPlace({V3}),N=P.nook,origin=N.at.pos;
if(N.at.ry)throw new Error('This route audit requires the current untranslated-axis nook.');
if(manifest.lampBasis?.transport?.type!=='actual-gauze')throw new Error('Use the actual Source16+ transport manifest.');
const actual=await loadActualGauzeGeometry();
if(actual.builderSha256!==manifest.lampBasis.transport.sourceRuntime.builderSha256||actual.helpersSha256!==manifest.lampBasis.transport.sourceRuntime.helpersSha256)throw new Error('Actual current geometry builder differs from the source transport descriptor.');
const world=p=>p.clone().add(origin),point=(m,p)=>V3(m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]);
function clause(start,end){const a=sceneSource.indexOf(start),b=sceneSource.indexOf(end,a);if(a<0||b<=a)throw Error('Actual runtime camera function boundary changed');return sceneSource.slice(a,b);}
const fitSource=clause('function fitShadeView(v){','\nconst chooseView ='),burnSource=clause('function burnView(){','\n// The person');
const spreadFovSource=sceneSource.split('\n').find(line=>line.trimStart().startsWith('if(!narrow())spread.fov='));
if(!spreadFovSource)throw new Error('Actual ignition spread FOV clause changed.');
const applySpreadFov=new Function('narrow','spread','N','mine','THREE',spreadFovSource);
const planned=[],fixtures=[],domain=new THREE.Box3();
for(const phone of [false,true])for(const preset of PRESET_SHAPES.shade)for(const minutes of [10,1440]){
 const rows=sizedPreset(preset.rows,minutes),parts=actual.build({rows,color:COLORS.shade[1],liveBaked:true}),nookG=new THREE.Group(),pivot=new THREE.Group(),g=new THREE.Group();
 nookG.position.copy(origin);pivot.position.copy(nookG.worldToLocal(V3(...N.hangingPoint)));nookG.add(pivot);pivot.add(g);g.add(parts.g);
 const basis=nookG.worldToLocal(V3(...manifest.lampBasis.position)).sub(pivot.position),top=parts.wick.at;
 g.position.set(basis.x-top.x,basis.y-.019*(parts.flame??1)-top.y,basis.z-top.z);nookG.updateMatrixWorld(true);
 const actualPoint=g.localToWorld(top.clone().add(V3(0,.019*(parts.flame??1),0)));
 if(actualPoint.distanceTo(V3(...manifest.lampBasis.position))>1e-6)throw Error('Actual lamp placement does not land on source basis');
 const mine={parts,g,offer:{rows}},place={P,nookG},narrow=()=>phone,viewOf=v=>({pos:nookG.localToWorld(v.pos.clone()),look:nookG.localToWorld(v.look.clone()),fov:v.fov});
 const fit=new Function('place','mine','V3','THREE','narrow',fitSource+';return fitShadeView;')(place,mine,V3,THREE,narrow);
 const burnFn=new Function('place','mine','THREE','narrow','viewOf',burnSource+';return burnView;')(place,mine,THREE,narrow,viewOf);
 const choose=fit(viewOf((phone&&N.choosePhone)||N.choose||N.wide)),arrival=viewOf((phone&&N.widePhone)||N.wide),entry=(phone&&P.viewPhone)||P.view;
 const chooseApproach=(phone&&N.chooseApproachPhone)||N.chooseApproach||[],burnWalk=(phone&&N.burnWalkPhone)||N.burnWalk||[];
 const walk=[entry.pos.clone(),...P.walk.map(p=>p.clone()),...(N.approach??[]).map(world),...(arrival.pos.z>choose.pos.z+.1?[arrival.pos]:[]),...chooseApproach.map(world),choose.pos];
 const spread=viewOf((phone&&N.spreadPhone)||N.spread),front=viewOf((phone&&N.burnPhone)||N.burn),far=viewOf((phone&&N.burnFarPhone)||N.burnFar),burn=burnFn();
 applySpreadFov(narrow,spread,N,mine,THREE);
 const orbit=[spread.pos,...burnWalk.map(world),...(burn.pos.distanceTo(front.pos)>.01?[front.pos]:[]),burn.pos];
 const prefix=`${phone?'phone':'desktop'}-${preset.id}-${minutes}`;
 for(const [suffix,points]of [['walk',walk],['ignition-retreat',[choose.pos,spread.pos]],['burn',orbit]]){
  const curve=new THREE.CatmullRomCurve3(points,false,'centripetal'),length=curve.getLength(),steps=Math.max(1,Math.ceil(length/.01)),samples=Array.from({length:steps+1},(_,i)=>curve.getPointAt(i/steps));
  for(const p of samples)domain.expandByPoint(p);planned.push({name:prefix+'-'+suffix,points,curve,length,samples});
 }
 const describe=v=>({positionWorld:v.pos.toArray(),lookWorld:v.look.toArray(),verticalFov:v.fov});
 fixtures.push({name:prefix,builderFrame:parts.frame,flameSize:parts.flame,actualPointWorld:actualPoint.toArray(),actualFrameCenterWorld:g.localToWorld(V3(0,parts.frame.cy,0)).toArray(),choose:describe(choose),spread:describe(spread),burn:describe(burn),nominalBurnFar:describe(far),chooseApproach:phone&&N.chooseApproachPhone?'chooseApproachPhone':'chooseApproach',burnWalk:phone&&N.burnWalkPhone?'burnWalkPhone':'burnWalk'});
}
// Derive the domain from actual fitted curves. Its padding exceeds both the
//0.15m capped clearance search and the10mm numerical curve sampling allowance.
domain.expandByScalar(.17);
const triangles=[];
for(const node of document.getRoot().listNodes())for(const primitive of node.getMesh()?.listPrimitives()??[]){
  const position=primitive.getAttribute('POSITION'),indices=primitive.getIndices()?.getArray(),matrix=node.getWorldMatrix();
  for(let i=0;i<(indices?.length??position.getCount());i+=3){
    const corners=[0,1,2].map(k=>point(matrix,position.getElement(indices?.[i+k]??i+k,[])));
    const box=new THREE.Box3().setFromPoints(corners);
    // All present camera centres are inside this broad domain. Exclude only
    // triangles farther away than the entire tested camera envelope.
    if(!box.intersectsBox(domain))continue;
    triangles.push({triangle:new THREE.Triangle(...corners),box,region:node.getExtras().lightmap_region,material:primitive.getMaterial()?.getName(),indices:[indices?.[i]??i,indices?.[i+1]??i+1,indices?.[i+2]??i+2]});
  }
}
const nearest=new THREE.Vector3(),report={raw:{path:rawPath,sha256:sha(rawBytes)},manifest:{path:manifestPath,sha256:sha(manifestBytes),sourceBlendSha256:manifest.bake?.sourceBlendSha256,lampBasis:manifest.lampBasis},descriptorSha256:sha(descriptorBytes),sceneSha256:sha(sceneSource),actualBuilderSha256:actual.builderSha256,actualHelpersSha256:actual.helpersSha256,fitShadeViewSha256:sha(fitSource),burnViewSha256:sha(burnSource),spreadFovClauseSha256:sha(spreadFovSource),method:'Actual current DOM-free lantern builder and exact extracted fitShadeView/burnView/ignition-FOV clauses; selected per-device approach and burn controls. Actual CatmullRom centripetal route locus against Source16 raw triangles. Numerical samples approximately10mm by runtime arc-length mapping plus chord crossing checks and at least10mm clearance allowance. Not a swept human-body or step-height simulation.',radiusMetres:.03,geometryDomain:{min:domain.min.toArray(),max:domain.max.toArray(),paddingMetres:.17,derivedFrom:'All actual fitted route samples; not fixed historical camera bounds.'},trianglesInCameraDomain:triangles.length,fixtures,routes:[],limits:['Arbitrary user drawings remain outside these six preset/duration envelopes.','Pose is rest-state; live suspension motion and visual occlusion need actual browser capture.','Actual continuous browser videos remain necessary for framing and motion.','Clearance is capped at0.15m; at least10mm is subtracted for numerical curve sampling.']};
// Spatial broadphase changes no triangles or tolerances. Query every grid cell
// touched by the exact0.15m search box or chord bounding box.
const grid=new Map(),cell=.5,key=(x,y,z)=>`${x},${y},${z}`;
function cells(box,visit){for(let x=Math.floor(box.min.x/cell);x<=Math.floor(box.max.x/cell);x++)for(let y=Math.floor(box.min.y/cell);y<=Math.floor(box.max.y/cell);y++)for(let z=Math.floor(box.min.z/cell);z<=Math.floor(box.max.z/cell);z++)visit(key(x,y,z));}
triangles.forEach((t,i)=>cells(t.box,k=>{if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);}));
function candidates(box){const ids=new Set();cells(box,k=>{for(const i of grid.get(k)??[])ids.add(i);});return ids;}
function evaluate({name,points,length,samples}){
  let minimum=.15,closest=null,maximumSampleSpacing=0;
  const searchBox=new THREE.Box3();
  for(let i=0;i<samples.length;i++){
    const p=samples[i];if(i)maximumSampleSpacing=Math.max(maximumSampleSpacing,p.distanceTo(samples[i-1]));searchBox.min.copy(p).addScalar(-.15);searchBox.max.copy(p).addScalar(.15);
    for(const id of candidates(searchBox)){const candidate=triangles[id];
      if(candidate.box.distanceToPoint(p)>=Math.min(minimum,.15))continue;
      const distance=candidate.triangle.closestPointToPoint(p,nearest).distanceTo(p);
      if(distance<minimum){minimum=distance;closest={sample:i,position:p.toArray(),surface:nearest.toArray(),region:candidate.region,material:candidate.material};}
    }
  }
  // A camera cannot tunnel between samples. Test the intervening chords against
  // every nearby triangle as well; the small curve/chord approximation is kept
  // explicit in the full-sample-spacing allowance below.
  const ray=new THREE.Ray(),direction=new THREE.Vector3(),hit=new THREE.Vector3();let intersections=0;
  for(let i=1;i<samples.length;i++){
    const a=samples[i-1],b=samples[i],distance=a.distanceTo(b),box=new THREE.Box3().setFromPoints([a,b]);direction.subVectors(b,a).normalize();ray.set(a,direction);
    for(const id of candidates(box)){const candidate=triangles[id];if(!candidate.box.intersectsBox(box))continue;const point=ray.intersectTriangle(candidate.triangle.a,candidate.triangle.b,candidate.triangle.c,false,hit);if(point&&point.distanceTo(a)<=distance+1e-9)intersections++;}
  }
  const curveSamplingAllowance=Math.max(.01,maximumSampleSpacing),conservativeClearance=minimum-curveSamplingAllowance,passed=intersections===0&&conservativeClearance>=report.radiusMetres;
  report.routes.push({name,controlPointsWorld:points.map(p=>p.toArray()),lengthMetres:length,samples:samples.length,maximumSampleSpacing,curveSamplingAllowance,cappedMinimumSampleClearanceMetres:minimum,conservativeClearanceMetres:conservativeClearance,chordIntersections:intersections,passed,closest});
}
for(const route of planned)evaluate(route);
report.passed=report.routes.every(route=>route.passed);
if(sha(await readFile(rawPath))!==report.raw.sha256||sha(await readFile(manifestPath))!==report.manifest.sha256)throw new Error('Read-only geometry input changed.');
if(sha(await readFile('web/src/engine/places/snow-roof-baked.js'))!==report.descriptorSha256)throw new Error('Actual camera descriptor changed during audit.');
const sceneSourceAfter=await readFile('web/src/engine/scene.js','utf8');
if(!sceneSourceAfter.includes(fitSource)||!sceneSourceAfter.includes(burnSource)||!sceneSourceAfter.includes(spreadFovSource))throw new Error('Actual runtime camera functions changed during audit.');
report.sceneSha256After=sha(sceneSourceAfter);
report.scriptSha256=sha(await readFile('scripts/audit-snow-camera-route.mjs'));
await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');
console.log('CAMERA_ROUTE_AUDIT',JSON.stringify({passed:report.passed,routes:report.routes.length,triangles:triangles.length,failures:report.routes.filter(route=>!route.passed)}));
if(!report.passed)process.exitCode=1;
