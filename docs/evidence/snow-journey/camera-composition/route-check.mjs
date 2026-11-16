import * as T from '/Users/xuan/Documents/code/zz-wish/node_modules/three/build/three.module.js';
import fs from 'node:fs';
const pts=[[.12,2.22,1.85],[1.4,2.22,.8],[1.95,2.22,-1.25],[1.65,2.22,-2.6],[1.65,2.22,-3.95],[.18,2.22,-3.85]];
const curve=new T.CatmullRomCurve3(pts.map(a=>new T.Vector3(...a)),false,'centripetal');
const columns=[[-2.7,1],[2.7,1],[-2.7,-4.2],[2.7,-4.2]];
const cushions=[[-1.16,-.54,-3.53,-3.07],[.54,1.16,-3.53,-3.07]];
const distanceBox=(x,z,b)=>Math.hypot(Math.max(b[0]-x,0,x-b[1]),Math.max(b[2]-z,0,z-b[3]));
let min={columnSurface:Infinity,cushionSurface:Infinity,altarFront:Infinity,sideWall:Infinity,lampHorizontal:Infinity},bounds={x:[Infinity,-Infinity],z:[Infinity,-Infinity],y:[Infinity,-Infinity]};
for(let i=0;i<=2000;i++){const p=curve.getPointAt(i/2000);min.columnSurface=Math.min(min.columnSurface,...columns.map(([x,z])=>Math.hypot(p.x-x,p.z-z)-.205));min.cushionSurface=Math.min(min.cushionSurface,...cushions.map(b=>distanceBox(p.x,p.z,b)));min.altarFront=Math.min(min.altarFront,p.z-(-4.587));min.sideWall=Math.min(min.sideWall,5.3-Math.abs(p.x));min.lampHorizontal=Math.min(min.lampHorizontal,Math.hypot(p.x,p.z+.5));for(const a of ['x','y','z']){bounds[a][0]=Math.min(bounds[a][0],p[a]);bounds[a][1]=Math.max(bounds[a][1],p[a]);}}
const out={samples:2001,pointsWorld:pts,durationSeconds:16,lengthMetres:curve.getLength(),meanSpeedMetresPerSecond:curve.getLength()/16,bounds,minDistanceToObstacleMetres:min,bodyRadiusMetres:.25,minimumBodyClearanceMetres:Object.fromEntries(Object.entries(min).filter(([k])=>k!=='lampHorizontal').map(([k,v])=>[k,v-.25])),notes:['CPU horizontal-clearance checks against known source column/cushion bounds; not a full scene collision solver.','All path points are over the hall floor at world Y .6. Eye Y 2.22 gives 1.62m height.','Use curve.getPointAt for even speed; keep rear waypoint to pass behind kneeling cushion.']};
fs.writeFileSync('/tmp/snow-camera-route-check.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));
