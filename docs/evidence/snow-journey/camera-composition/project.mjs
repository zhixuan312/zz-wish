import * as THREE from '/Users/xuan/Documents/code/zz-wish/node_modules/three/build/three.module.js';
import fs from 'node:fs';
const points={screenBottom:[0,1.3,-6.31],altarLeft:[-1.29,1.63,-4.85],altarRight:[1.29,1.63,-4.85],lampCenter:[0,3.0625,-.5],lampTop:[0,3.22,-.5],flame:[0,2.99,-.5],screenTop:[0,4.9,-6.31],screenLeft:[-2.28,3.1,-6.31],screenRight:[2.28,3.1,-6.31],altarTop:[0,1.63,-4.85],altarFeet:[0,.6,-4.85],rearBeam:[0,4.85,-4.1],doorTop:[0,3.6,2.2],doorBottom:[0,.6,2.2],snowNear:[0,.12,9],snowFar:[0,.12,22]};
const poses={
 hallWide:{desktop:{p:[.2,2.22,3.25],t:[0,2.35,-3.5],f:40},phone:{p:[.05,2.22,3.25],t:[0,2.50,-3.5],f:56}},
 choose:{desktop:{p:[.18,2.22,1.60],t:[.25,2.68,-.5],f:32},phone:{p:[.10,2.22,1.60],t:[0,2.72,-.5],f:44}},
 confirmIgnition:{desktop:{p:[.12,2.22,1.38],t:[.20,2.68,-.5],f:32},phone:{p:[.10,2.22,1.50],t:[0,2.75,-.5],f:44}},
 spreadInside:{desktop:{p:[.12,2.22,1.85],t:[0,2.49,-1.25],f:44},phone:{p:[0,2.22,1.85],t:[0,2.45,-1.25],f:64}},
 burning:{desktop:{p:[.18,2.22,-3.85],t:[0,2.55,0],f:32},phone:{p:[.18,2.22,-3.85],t:[0,2.48,0],f:44}},
};
let result={units:'World coordinates in metres, Y up. Nook local offset is world-[0,.6,-.5]. No runtime, geometry, light or source edits.',poses:{}};
for(const [phase,variants] of Object.entries(poses)){
 result.poses[phase]={};
 for(const [device,{p,t,f}] of Object.entries(variants)){
  const [w,h]=device==='desktop'?[1440,900]:[390,844];const camera=new THREE.PerspectiveCamera(f,w/h,.01,900);camera.position.fromArray(p);camera.lookAt(new THREE.Vector3(...t));camera.updateMatrixWorld(true);const forward=new THREE.Vector3();camera.getWorldDirection(forward);
  const projected={};for(const [name,xyz] of Object.entries(points)){const v=new THREE.Vector3(...xyz),front=v.clone().sub(camera.position).dot(forward)>0,ndc=v.clone().project(camera);projected[name]={x:Math.round((ndc.x+1)*w/2),y:Math.round((1-ndc.y)*h/2),inFrame:front&&Math.abs(ndc.x)<=1&&Math.abs(ndc.y)<=1,front};}
  result.poses[phase][device]={position:p,target:t,verticalFov:f,horizontalFov:THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(f/2))*w/h)),projections:projected};
 }
}
fs.writeFileSync('/tmp/snow-camera-projections.json',JSON.stringify(result,null,2)+'\n');
for(const [phase,d] of Object.entries(result.poses))for(const [device,x]of Object.entries(d))console.log(phase,device,'Hfov',x.horizontalFov.toFixed(1),'lamp',x.projections.lampCenter,'altar',x.projections.altarTop,'floor',x.projections.altarFeet,'snow',x.projections.snowFar,'screenTop',x.projections.screenTop,'doorTop',x.projections.doorTop,'doorBase',x.projections.doorBottom,'screenLR',x.projections.screenLeft.inFrame,x.projections.screenRight.inFrame);
