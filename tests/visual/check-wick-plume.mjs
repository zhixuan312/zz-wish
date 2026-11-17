// CPU-only checks against the actual gauze builder and plume implementation.
import assert from 'node:assert/strict';
import{readFile,mkdir,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import * as THREE from 'three';
import{PRESET_SHAPES,sizedPreset,COLORS}from'../../shared/rules.ts';
import{WickPlume,addGauzeVent,createGauzeSmokePath,gauzeRibGeometry,gauzeThroat,gauzeFlameSize,gauzeFlameEnvelope,GAUZE_FLAME_BOUNDS}from'../../web/src/engine/WickPlume.js';
const path='web/src/engine/scene.js',source=await readFile(path,'utf8'),start=source.indexOf('  gauze(o = presetOf('),end=source.indexOf('  // A square lattice',start);assert(start>=0&&end>start);
const material=()=>new THREE.MeshStandardMaterial({side:THREE.DoubleSide}),V3=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),lathe=(p,n=64)=>new THREE.LatheGeometry(p.map(p=>new THREE.Vector2(...p)),n),scaled=(rows,s)=>rows.map(p=>[Math.max(.002,p.r*s),p.y*s]);
const ringAt=(R,y)=>{let i=1;while(i<R.length-1&&R[i].y<y)i++;const a=R[i-1],b=R[i],k=THREE.MathUtils.clamp((y-a.y)/(b.y-a.y||1),0,1);return{cx:THREE.MathUtils.lerp(a.cx,b.cx,k),r:THREE.MathUtils.lerp(a.r,b.r,k)};};
const solid=(g,geo,m,x=0,y=0,z=0)=>{const object=new THREE.Mesh(geo,m);object.position.set(x,y,z);g.add(object);return object;};
let builtProfile;
const names=['THREE','V3','lathe','scaled','shadeScale','ringAt','solid','visitorRibMaterial','lampWood','cordMat','lacquerBlack','shellMaterial','gauzeTex','clayMat','addGauzeVent','createGauzeSmokePath','gauzeRibGeometry','gauzeThroat','gauzeFlameSize'];
const values=[THREE,V3,lathe,scaled,()=>1,ringAt,solid,material,material(),material(),material(),()=>material(),new THREE.Texture(),material(),addGauzeVent,(profile,...args)=>{builtProfile=profile;return createGauzeSmokePath(profile,...args);},gauzeRibGeometry,gauzeThroat,gauzeFlameSize];
const build=new Function(...names,'return ({'+source.slice(start,end)+'}).gauze;')(...values),fixtures=[];
for(const preset of PRESET_SHAPES.shade)for(const minutes of[10,1440])fixtures.push({name:preset.id+'-'+minutes,rows:sizedPreset(preset.rows,minutes)});
fixtures.push({name:'2mm-waist',rows:[{y:0,r:.04,cx:0},{y:.06,r:.0004,cx:.006},{y:.14,r:.04,cx:0}]},{name:'short-wide-drawn',rows:[{y:0,r:.05,cx:0},{y:.01,r:.05,cx:0}]},{name:'asymmetric-neck',rows:[{y:0,r:.03,cx:0},{y:.04,r:.004,cx:.012},{y:.1,r:.02,cx:-.004},{y:.14,r:.008,cx:0}]},{name:'2mm-low-neck',rows:[{y:0,r:.04,cx:0},{y:.018,r:.0004,cx:0},{y:.14,r:.04,cx:0}]});
assert(source.includes('r * position.x * sc * .5')&&source.includes('(position.y + .5) * sc'),'Actual SDF quad envelope changed.');
assert(source.includes('.038 * this.size')&&source.includes('Math.sqrt(power)')&&source.includes('catchPower*(1+.06*'),'Actual flame scale/catch bound changed.');
assert(source.includes('Math.sin(time*.32)*.008'),'Actual lantern sway bound changed.');
const flameResults=[];
const results=[];let representative;
for(const fixture of fixtures){
  const parts=build({rows:fixture.rows,color:COLORS.shade[1],liveBaked:true});parts.g.updateMatrixWorld(true);const flow=parts.smokePath,meshes=[];parts.g.traverse(o=>{if(o.isMesh&&o!==parts.wickMesh)meshes.push(o);});
  assert(flow.length>0);assert(flow.clearances.every(c=>c>0));assert(flow.points[0].distanceTo(parts.wick.at.clone().add(V3(.0007,.004,0)))<1e-10);
  let crossings=0,clearanceCrossings=0;const ray=new THREE.Raycaster(),direction=new THREE.Vector3(),side=new THREE.Vector3(),up=new THREE.Vector3();
  for(let i=1;i<flow.points.length;i++){
    const a=flow.points[i-1],b=flow.points[i],length=a.distanceTo(b);if(length<.00002)continue;
    direction.subVectors(b,a).normalize();ray.set(a,direction);ray.near=.000005;ray.far=length-.000005;
    const hits=ray.intersectObjects(meshes,false);if(hits.length){crossings++;console.error('PLUME_PATH_CROSS',fixture.name,i,hits[0].object.userData,hits[0].distance);}
    // A plume has width. Check eight parallel traces at the conservative
    // clearance radius as well as its centreline, using the real triangles.
    side.crossVectors(direction,V3(0,0,1)).normalize();up.crossVectors(direction,side).normalize();
    // The sprite's longest half-axis is .8*width. Actual width is capped
    // at1.2mm, and at1.2*clearance in narrow sections.
    const radius=Math.min(.0012,Math.min(flow.clearances[i-1],flow.clearances[i])*1.2)*.8;
    for(let j=0;j<8;j++){
      const offset=side.clone().multiplyScalar(Math.cos(j*Math.PI/4)*radius).addScaledVector(up,Math.sin(j*Math.PI/4)*radius);
      ray.set(a.clone().add(offset),direction);const finiteHits=ray.intersectObjects(meshes,false);if(finiteHits.length){clearanceCrossings++;console.error('PLUME_WIDTH_CROSS',fixture.name,i,j,radius,finiteHits[0].object.userData,finiteHits[0].distance);}
    }
  }
  assert.equal(crossings,0,'Actual profile/cord/cap/holder path collision: '+fixture.name);
  assert.equal(clearanceCrossings,0,'Finite-width plume clearance collision: '+fixture.name);
  const capMeshes=meshes.filter(o=>o.userData.wickVent),exit=new THREE.Vector3(...flow.vent.exit),entry=exit.clone();entry.y=flow.vent.topY-.001;ray.set(entry,V3(0,1,0));ray.near=0;ray.far=.020;assert.equal(ray.intersectObjects(capMeshes,false).length,0);
  ray.set(V3(0,flow.vent.topY-.001,0),V3(0,1,0));ray.far=.08;assert(ray.intersectObjects(meshes,false).length>0,'Central cord/hub must really obstruct the central route.');
  if(fixture.name==='2mm-waist')assert(flow.minimumThroatRadius<=.002001,'The fixture must exercise the actual 2mm throat.');
  const opening=Math.max(.003,builtProfile[0][0]-.008),bottomY=builtProfile[0][1],bottomCx=builtProfile[0][2];
  let realOpenBottom=false;
  if(opening>.029){
    const radius=(.026+opening)*.5,a=Math.PI/3;
    ray.set(V3(bottomCx+Math.cos(a)*radius,bottomY+.008,Math.sin(a)*radius),V3(0,-1,0));ray.near=.000001;ray.far=.040;
    assert.equal(ray.intersectObjects(meshes,false).length,0,'A ray through the actual annular bottom must reach below the lantern.');realOpenBottom=true;
    assert.equal(meshes.filter(o=>o.userData.gauzeTransportRole==='cup-bearing-spoke').length,3,'Three real spokes support the cup.');
  }
  const flameSize=gauzeFlameSize(builtProfile,parts.wick.at,flow.vent.topY),envelope=gauzeFlameEnvelope(flameSize,parts.wick.at);
  assert.equal(parts.flame,flameSize,'The actual builder must use the checked profile-limited flame size.');
  if(flameResults.length<6)assert.equal(flameSize,.9,'An ordinary preset should retain its actual .9 flame size.');
  if(['short-wide-drawn','2mm-low-neck'].includes(fixture.name))assert(flameSize<.9,'The colliding drawn profile must limit the flame.');
  const cylinderDistance=(x,y,z)=>Math.hypot(Math.max(0,Math.hypot(x-envelope.x,z-envelope.z)-envelope.radius),Math.max(0,envelope.minY-y,y-envelope.maxY));
  let clothDistance=Infinity,ribDistance=Infinity;
  for(let i=1;i<builtProfile.length;i++)for(let j=0;j<=8;j++){
    const a=builtProfile[i-1],b=builtProfile[i],t=j/8,r=THREE.MathUtils.lerp(a[0],b[0],t),y=THREE.MathUtils.lerp(a[1],b[1],t),cx=THREE.MathUtils.lerp(a[2],b[2],t),hardware=gauzeThroat(r);
    for(let k=0;k<16;k++){
      const angle=k*Math.PI/8,cloth=(r-hardware.sag)*Math.cos(Math.PI/96),rib=r-hardware.inset;
      clothDistance=Math.min(clothDistance,cylinderDistance(cx+Math.cos(angle)*cloth,y,Math.sin(angle)*cloth));
      ribDistance=Math.min(ribDistance,cylinderDistance(cx+Math.cos(angle)*rib,y,Math.sin(angle)*rib)-hardware.ribRadius);
    }
  }
  const capDistance=flow.vent.topY-envelope.maxY;
  if(flameSize>0){assert(capDistance>=.002-1e-9);assert(clothDistance>=.002-1e-9,'Sampled cloth must have2mm Euclidean clearance.');assert(ribDistance>=.002-1e-9,'Sampled rib tube must have2mm Euclidean clearance.');}
  flameResults.push({name:fixture.name,nominalSize:.9,limitedSize:flameSize,envelope,capDistanceMetres:capDistance,sampledClothDistanceMetres:clothDistance,sampledRibDistanceMetres:ribDistance,flameEnabled:flameSize>0});
  results.push({name:fixture.name,height:parts.frame.h-.2,pathLengthMetres:flow.length,minimumThroatRadiusMetres:flow.minimumThroatRadius,minimumParticleRadiusBoundMetres:Math.min(...flow.clearances),actualTrianglePathCrossings:crossings,finiteWidthTriangleCrossings:clearanceCrossings,openDiagonalAperture:true,centralCordReallyOpaque:true,realOpenBottom,naturalTransitSeconds:flow.length/.13,suddenTransitSeconds:flow.length/.32});
  representative??=parts;
}
function simulate(hz,done){
  const group=new THREE.Group(),plume=new WickPlume({scene:group,map:new THREE.Texture()}),frame=new THREE.Group();frame.position.set(-3.3,3.1,1.2);frame.updateMatrixWorld(true);
  plume.start({time:0,done,frame,path:representative.smokePath,wickTip:representative.smokePath.wickTip});const until=done?4.8:1.3;
  for(let t=0;t<until;t+=1/hz)plume.update(t);plume.update(until);
  const result={state:plume.state(),parts:plume.parts.map(p=>({visible:p.s.visible,position:p.s.position.toArray(),opacity:p.s.material.opacity}))};plume.update(until);assert.deepEqual(plume.parts.map(p=>({visible:p.s.visible,position:p.s.position.toArray(),opacity:p.s.material.opacity})),result.parts);plume.dispose();return result;
}
const rate=[];
for(const done of[true,false]){
  const slow=simulate(2,done),fast=simulate(60,done);assert.deepEqual(slow.parts,fast.parts);assert.equal(slow.state.rate,done?36:96);rate.push({mode:done?'natural':'sudden',sameAt2And60Hz:true,rate:slow.state.rate,particleCount:slow.state.particleCount,visibleAtSample:slow.state.visibleSprites,transitSeconds:slow.state.transitSeconds,externalVisibleSeconds:slow.state.outsideVisibleSeconds});
}
const out=process.env.OUTPUT??'artifacts/full-review/round-1/wick-plume-cpu';await mkdir(out,{recursive:true});await writeFile(out+'/report.json',JSON.stringify({passed:true,source:{path,sha256:createHash('sha256').update(source).digest('hex')},module:{path:'web/src/engine/WickPlume.js',sha256:createHash('sha256').update(await readFile('web/src/engine/WickPlume.js')).digest('hex')},results,rate,flameBounds:GAUZE_FLAME_BOUNDS,flameResults,gpuBrowserRuns:0,limits:'Actual builder/mesh ray tests, analytic transport and conservative full-quad flame limits. Independent dense radial samples check the source profile/sag and rib capsule distances. No browser opacity/readability or natural/SDF/glow pacing acceptance is claimed.'},null,2)+'\n');console.log('WICK_PLUME_CPU_PASS',results.length,out);
