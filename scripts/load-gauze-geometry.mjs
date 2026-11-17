// Run the actual DOM-free gauze builder with geometry-only material stand-ins.
// This does not approximate its profile, cap, ribs, holder or apertures.
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {addGauzeVent,createGauzeSmokePath,gauzeRibGeometry,gauzeThroat,gauzeFlameSize} from '../web/src/engine/WickPlume.js';

export async function loadActualGauzeGeometry(){
 const source=await readFile(new URL('../web/src/engine/scene.js',import.meta.url),'utf8');
 const start=source.indexOf('  gauze(o = presetOf('),end=source.indexOf('  // A square lattice',start);
 if(start<0||end<=start)throw Error('Actual gauze builder boundary changed');
 const builder=source.slice(start,end),sha=b=>createHash('sha256').update(b).digest('hex');
 const helperNames=['lathe','solid','scaled','shadeScale','ringAt'];
 const helperSource=helperNames.map(name=>{const line=source.split('\n').find(line=>line.startsWith('const '+name+' ='));if(!line)throw Error('Actual helper missing: '+name);return line;}).join('\n');
 const V3=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),V2=(x=0,y=0)=>new THREE.Vector2(x,y);
 const material=(role,color)=>{const m=new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide});m.userData.geometryProxyRole=role;return m;};
 let profile;
 const names=['THREE','V3','V2','visitorRibMaterial','lampWood','cordMat','lacquerBlack','shellMaterial','gauzeTex','clayMat','addGauzeVent','createGauzeSmokePath','gauzeRibGeometry','gauzeThroat','gauzeFlameSize'];
 const values=[THREE,V3,V2,()=>material('bamboo-rib',0x5a3a24),material('wood',0x5a3a24),material('cord',0x9a1810),material('lacquer',0x140d0a),color=>material('gauze',color),new THREE.Texture(),material('clay-cup',0x5e3b29),addGauzeVent,(p,...args)=>{profile=p;return createGauzeSmokePath(p,...args);},gauzeRibGeometry,gauzeThroat,gauzeFlameSize];
 const build=new Function(...names,helperSource+'\nreturn ({'+builder+'}).gauze;')(...values);
 return{build,profile:()=>profile,sourceSha256:sha(source),builderSha256:sha(builder),helpersSha256:sha(helperSource),materialStandins:'Geometry-only; no material/lighting equivalence claim. Real fabric/PBR transport is authored separately.'};
}
