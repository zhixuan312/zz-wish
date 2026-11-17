import * as THREE from 'three';

const smooth=(a,b,x)=>{const k=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return k*k*(3-2*k);};
export function gauzeThroat(radius){
  return {inset:Math.min(.0024,radius*.3),ribRadius:Math.min(.00225,radius*.175),sag:Math.min(.0011,radius*.18)};
}
function profileAt(profile,y){
  let i=1;while(i<profile.length-1&&profile[i][1]<y)i++;
  const a=profile[i-1],b=profile[i],k=THREE.MathUtils.clamp((y-a[1])/(b[1]-a[1]||1),0,1);
  return {r:THREE.MathUtils.lerp(a[0],b[0],k),cx:THREE.MathUtils.lerp(a[2],b[2],k),slope:(b[2]-a[2])/(b[1]-a[1]||1)};
}
export const GAUZE_FLAME_BOUNDS=Object.freeze({nominalSize:.9,scaleMetres:.038,catchPower:1.06,clearanceMetres:.002,maxSwayRadians:.008,quadHalfWidth:.25,clothRadialSegments:96});
export function gauzeFlameEnvelope(size,wickBase){
  const b=GAUZE_FLAME_BOUNDS,height=b.scaleMetres*Math.max(0,size)*Math.sqrt(b.catchPower),halfWidth=height*b.quadHalfWidth,sway=Math.sin(b.maxSwayRadians);
  // flameVS constructs an upright world quad. In the lantern's swaying local
  // frame its swept envelope is slightly wider/taller than an upright cylinder.
  return {x:wickBase.x,z:wickBase.z??0,radius:halfWidth+height*sway,minY:wickBase.y+.002-halfWidth*sway,maxY:wickBase.y+.002+height+halfWidth*sway,height};
}
/** Largest size certified by these conservative bounds; zero means none fits.
 * profile is the actual sampled cloth [radius,y,centreX] in lantern coordinates.
 * Sway/wind/stretch deform fragment alpha inside flameVS's quad, never its
 * vertices: the full swept quad bounds every phase without inventing a shape.
 */
export function gauzeFlameSize(profile,wickBase,capY){
  if(!Array.isArray(profile)||profile.length<2||!Number.isFinite(capY)||![wickBase?.x,wickBase?.y,wickBase?.z??0].every(Number.isFinite))return 0;
  if(profile.some((row,i)=>!Array.isArray(row)||row.length<3||!row.every(Number.isFinite)||row[0]<=0||(i&&row[1]<=profile[i-1][1])))return 0;
  const b=GAUZE_FLAME_BOUNDS,margin=b.clearanceMetres,facet=Math.cos(Math.PI/b.clothRadialSegments);
  const clear=size=>{
    const e=gauzeFlameEnvelope(size,wickBase);
    if(e.maxY>capY-margin||e.minY<profile[0][1]+margin)return false;
    // A rib is a swept tube, so include its radius in the vertical search as
    // well as its perpendicular distance; sharp/asymmetric throats cannot
    // borrow clearance from a neighbouring wider row.
    const low=e.minY-margin-.0011,high=e.maxY+margin+.0011;
    for(let i=1;i<profile.length;i++){
      const a=profile[i-1],c=profile[i],y0=Math.max(low,a[1]),y1=Math.min(high,c[1]);if(y1<y0)continue;
      const p=profileAt(profile,y0),q=profileAt(profile,y1),dr=(c[0]-a[0])/(c[1]-a[1]),dc=(c[2]-a[2])/(c[1]-a[1]),normalFactor=Math.hypot(1,Math.abs(dr)+Math.abs(dc));
      const hp=gauzeThroat(p.r),hq=gauzeThroat(q.r),offset=Math.max(Math.hypot(e.x-p.cx,e.z),Math.hypot(e.x-q.cx,e.z));
      const cloth=Math.min((p.r-hp.sag)*facet,(q.r-hq.sag)*facet)-offset-e.radius;
      if(cloth<margin*normalFactor)return false;
      const rib=Math.min(p.r-hp.inset,q.r-hq.inset)-offset-e.radius;
      if(rib<(margin+Math.max(hp.ribRadius,hq.ribRadius))*normalFactor)return false;
    }
    return true;
  };
  if(clear(b.nominalSize))return b.nominalSize;
  if(!clear(0))return 0;
  let low=0,high=b.nominalSize;for(let i=0;i<40;i++){const mid=(low+high)/2;if(clear(mid))low=mid;else high=mid;}
  return low*(1-1e-10);
}
export function gauzeRibGeometry(profile,angle){
  const low=profile[0][1],high=profile.at(-1)[1];
  class RibCurve extends THREE.Curve{
    getPoint(t,target=new THREE.Vector3()){
      const y=THREE.MathUtils.lerp(low,high,t),p=profileAt(profile,y),r=p.r-gauzeThroat(p.r).inset;
      return target.set(p.cx+Math.cos(angle)*r,y,Math.sin(angle)*r);
    }
  }
  const curve=new RibCurve(),geometry=new THREE.TubeGeometry(curve,64,.00225,6),positions=geometry.attributes.position,point=new THREE.Vector3(),centre=new THREE.Vector3();
  for(let i=0;i<=64;i++){
    curve.getPointAt(i/64,centre);const scale=gauzeThroat(profileAt(profile,centre.y).r).ribRadius/.00225;
    for(let j=0;j<=6;j++){const index=i*7+j;point.fromBufferAttribute(positions,index).sub(centre).multiplyScalar(scale).add(centre);positions.setXYZ(index,point.x,point.y,point.z);}
  }
  geometry.computeVertexNormals();return geometry;
}
export function addGauzeVent(group,{radius,topY,material,cordMaterial,cordRadius=.0015}){
  const hole=.006,hub=.0024,sectorRadius=.0042,spokeWidth=.0008,outer=Math.max(radius+.004,.010);
  const add=(geometry,mat,x=0,y=0,z=0)=>{const object=new THREE.Mesh(geometry,mat);object.position.set(x,y,z);object.castShadow=object.receiveShadow=true;group.add(object);return object;};
  // A true annulus, not an alpha mask. Four load-bearing spokes join the
  // suspension hub to the cap while leaving four unobstructed smoke sectors.
  add(new THREE.LatheGeometry([[hole,topY+.016],[outer,topY+.016],[outer+.004,topY+.008],[outer,topY],[hole,topY],[hole,topY+.016]].map(p=>new THREE.Vector2(...p)),48),material).userData.wickVent='annulus';
  add(new THREE.CylinderGeometry(hub,hub,.003,20),cordMaterial,0,topY+.0145).userData.wickVent='supported-hub';
  for(let i=0;i<4;i++){
    const angle=i*Math.PI/2,length=hole+.001-hub,object=add(new THREE.BoxGeometry(length,.0015,spokeWidth),material,Math.cos(angle)*(hub+length/2),topY+.014,Math.sin(angle)*(hub+length/2));object.rotation.y=-angle;object.userData.wickVent='load-bearing-spoke';
  }
  return {topY,holeRadius:hole,hubRadius:hub,spokeWidth,cordRadius,cordBottomY:-.06,sectorAngle:Math.PI/4,sectorRadius,exit:[sectorRadius/Math.SQRT2,topY+.017,sectorRadius/Math.SQRT2],outerRadius:outer};
}
export function createGauzeSmokePath(profile,wickTip,vent){
  const points=[],clearances=[];
  const add=(point,clearance)=>{if(points.length&&point.distanceTo(points.at(-1))<1e-9)return;points.push(point);clearances.push(clearance);};
  const bodyTop=vent.topY,span=Math.max(.0001,bodyTop-wickTip.y),startCentre=profileAt(profile,wickTip.y).cx;
  for(let i=0;i<=96;i++){
    const k=i/96,y=THREE.MathUtils.lerp(wickTip.y,bodyTop,k),p=profileAt(profile,y),hardware=gauzeThroat(p.r),free=Math.min(p.r-hardware.inset-hardware.ribRadius,p.r-hardware.sag);
    const offset=(wickTip.x-startCentre)*(1-smooth(0,.25,k));
    const clearance=Math.max(.00005,free-Math.abs(offset));
    add(new THREE.Vector3(p.cx+offset,y,wickTip.z*(1-k)),Math.min(clearance*.28,clearance/(1+Math.abs(p.slope))* .2));
  }
  // Turn before the cord begins, through the actual diagonal sector. The
  // body throat remains central until the cloth ends; no wall is crossed.
  for(let i=1;i<=32;i++){
    const height=.017*i/32,radial=vent.sectorRadius*smooth(0,.0072,height);
    add(new THREE.Vector3(radial/Math.SQRT2,bodyTop+height,radial/Math.SQRT2),.00065);
  }
  const distances=[0];for(let i=1;i<points.length;i++)distances.push(distances.at(-1)+points[i].distanceTo(points[i-1]));
  const length=distances.at(-1);
  return {points,distances,clearances,length,vent,wickTip:wickTip.clone(),bodyHeight:span,minimumThroatRadius:Math.min(...profile.map(row=>row[0])),
    sample(distance,target=new THREE.Vector3()){
      let i=1;while(i<distances.length-1&&distances[i]<distance)i++;
      const k=THREE.MathUtils.clamp((distance-distances[i-1])/(distances[i]-distances[i-1]||1),0,1);return target.lerpVectors(points[i-1],points[i],k);
    },
    clearance(distance){let i=1;while(i<distances.length-1&&distances[i]<distance)i++;return Math.min(clearances[i-1],clearances[i]);},
  };
}

const configurations={natural:{delay:1.9,duration:1.5,rate:36,speed:.13,outsideLife:2.3,riseSpeed:.075,width:.0012,growth:.0032,curl:.004,opacity:.14},sudden:{delay:0,duration:.25,rate:96,speed:.32,outsideLife:1.4,riseSpeed:.17,width:.0012,growth:.018,curl:.014,opacity:.16}};
export class WickPlume{
  constructor({scene,map,count=96}){
    this.parts=Array.from({length:count},(_,i)=>{
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,color:0xc9c6c0,transparent:true,depthTest:true,depthWrite:false,opacity:0,fog:true}));sprite.visible=false;sprite.layers.set(0);sprite.userData.visualParticle=true;scene.add(sprite);return {s:sprite,phase:i*2.399963229728653,exitWorld:null};
    });this.run=null;this.position=new THREE.Vector3();
  }
  clear(){this.run=null;for(const p of this.parts){p.s.visible=false;p.exitWorld=null;}}
  start({time,done,frame,path,wickTip,valid}){
    this.clear();frame.updateWorldMatrix(true,false);
    if(!path){const end=wickTip.clone().add(new THREE.Vector3(0,.008,0));path={length:.008,vent:null,wickTip:wickTip.clone(),points:[wickTip.clone(),end],sample:(d,target)=>target.lerpVectors(wickTip,end,THREE.MathUtils.clamp(d/.008,0,1)),clearance:()=>.0006};}
    const config=configurations[done?'natural':'sudden'],count=Math.min(this.parts.length,Math.ceil(config.rate*config.duration)),position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();frame.matrixWorld.decompose(position,quaternion,scale);
    this.run={time,done,frame,path,valid,config,count,transit:path.length/config.speed,previousTime:time,currentTime:time,previousPosition:position,previousQuaternion:quaternion,previousScale:scale};
  }
  update(time){
    const run=this.run;if(!run)return;if(run.valid&&!run.valid()){this.clear();return;}
    const {frame,path,config}=run;run.currentTime=time;frame.updateWorldMatrix(true,false);
    const nowPosition=new THREE.Vector3(),nowQuaternion=new THREE.Quaternion(),nowScale=new THREE.Vector3();frame.matrixWorld.decompose(nowPosition,nowQuaternion,nowScale);
    let remaining=false;
    for(let i=0;i<this.parts.length;i++){
      const p=this.parts[i],birth=run.time+config.delay+i/config.rate,age=time-birth,outside=age-run.transit;
      if(i>=run.count||age<0||outside>config.outsideLife){p.s.visible=false;if(i<run.count&&outside<=config.outsideLife)remaining=true;continue;}
      remaining=true;p.s.visible=true;
      let width,opacity;
      if(outside<0){
        const distance=Math.max(0,age*config.speed);path.sample(distance,this.position).applyMatrix4(frame.matrixWorld);width=Math.min(config.width,path.clearance(distance)*1.2);opacity=config.opacity*smooth(0,.08,age);
      }else{
        if(!p.exitWorld){
          const exitTime=birth+run.transit,k=THREE.MathUtils.clamp((exitTime-run.previousTime)/(time-run.previousTime||1),0,1),matrix=new THREE.Matrix4().compose(run.previousPosition.clone().lerp(nowPosition,k),run.previousQuaternion.clone().slerp(nowQuaternion,k),run.previousScale.clone().lerp(nowScale,k));
          p.exitWorld=path.sample(path.length,new THREE.Vector3()).applyMatrix4(matrix);
        }
        const fraction=outside/config.outsideLife,curl=config.curl*fraction*smooth(0,.2,outside),phase=run.done?birth*.8:p.phase;
        this.position.copy(p.exitWorld);this.position.y+=config.riseSpeed*outside;
        this.position.x+=curl*(Math.sin(outside*2.1+phase)-Math.sin(phase));this.position.z+=curl*.65*(Math.cos(outside*1.6+phase)-Math.cos(phase));
        const exitWidth=Math.min(config.width,path.clearance(path.length)*1.2);
        width=THREE.MathUtils.lerp(exitWidth,config.width,smooth(0,.15,outside))+config.growth*smooth(0,1,fraction);opacity=config.opacity*(1-smooth(.35,1,fraction));
      }
      p.s.position.copy(this.position);p.s.scale.set(width,width*1.6,1);p.s.material.opacity=opacity;
    }
    run.previousTime=time;run.previousPosition.copy(nowPosition);run.previousQuaternion.copy(nowQuaternion);run.previousScale.copy(nowScale);if(!remaining)this.clear();
  }
  state(){
    const r=this.run;if(!r)return null;let inside=0,exterior=0;
    for(let i=0;i<r.count;i++)if(this.parts[i].s.visible){const age=r.currentTime-r.time-r.config.delay-i/r.config.rate;if(age<r.transit)inside++;else exterior++;}
    return {mode:r.done?'natural':'sudden',startedAt:r.time,currentTime:r.currentTime,rate:r.config.rate,emissionDuration:r.config.duration,delay:r.config.delay,particleCount:r.count,pathLength:r.path.length,transitSeconds:r.transit,outsideVisibleSeconds:r.config.outsideLife,wickTipLocal:r.path.wickTip.toArray(),wickTipWorld:r.path.wickTip.clone().applyMatrix4(r.frame.matrixWorld).toArray(),vent:r.path.vent,ventWorld:r.path.sample(r.path.length,new THREE.Vector3()).applyMatrix4(r.frame.matrixWorld).toArray(),visibleSprites:inside+exterior,insideSprites:inside,exteriorSprites:exterior,layer:0,depthTest:true};
  }
  dispose(){for(const p of this.parts){p.s.removeFromParent();p.s.material.dispose();}this.parts.length=0;this.run=null;}
}
