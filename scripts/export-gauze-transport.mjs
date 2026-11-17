// Export actual default runtime triangles, normalized to its real PointLight.
import * as THREE from 'three';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {PRESET_SHAPES,sizedPreset,COLORS,DEFAULT_MINUTES} from '../shared/rules.ts';
import {loadActualGauzeGeometry} from './load-gauze-geometry.mjs';
import {GAUZE_CANDLE_REFERENCE,gauzeTransmissionColour} from '../web/src/engine/baked/gauzeTransmission.js';
const args=process.argv.slice(2),value=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
const out=resolve(value('--out')??''),minutes=Number(value('--minutes')??DEFAULT_MINUTES),preset=value('--preset')??'drum';
if(!out.includes('/art/build/')||await access(out).then(()=>true,()=>false))throw Error('New ignored --out JSON required');
const row=PRESET_SHAPES.shade.find(p=>p.id===preset);if(!row)throw Error('Known actual shade preset required');
const actual=await loadActualGauzeGeometry(),color=COLORS.shade[1],shape={rows:sizedPreset(row.rows,minutes),color,liveBaked:true},parts=actual.build(shape);
const pointLocal=parts.wick.at.clone().add(new THREE.Vector3(0,.019*parts.flame,0));parts.g.position.copy(pointLocal).negate();parts.g.updateMatrixWorld(true);
const meshes=[],p=new THREE.Vector3(),n=new THREE.Vector3();
parts.g.traverse(object=>{
 if(!object.isMesh)return;
 const geo=object.geometry,position=geo.getAttribute('position'),normal=geo.getAttribute('normal'),uv=geo.getAttribute('uv'),matrix=object.matrixWorld,normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix),points=[],normals=[],uvs=[];
 for(let i=0;i<position.count;i++){
  p.fromBufferAttribute(position,i).applyMatrix4(matrix);points.push(...p.toArray().map(Math.fround));
  n.fromBufferAttribute(normal,i).applyMatrix3(normalMatrix).normalize();normals.push(...n.toArray().map(Math.fround));
  if(uv)uvs.push(uv.getX(i),uv.getY(i));
 }
 const role=object.userData.visitorCloth?'gauze':object.userData.visitorRib?'bamboo-rib':object.userData.wickVent?'top-'+object.userData.wickVent:object===parts.wickMesh?'wick':object.userData.gauzeTransportRole??object.material.userData.geometryProxyRole;
 if(!role)throw Error('Unclassified actual transport mesh');
 meshes.push({name:`Actual gauze ${role} ${meshes.length}`,role,positions:points,normals,uvs:uvs.length?uvs:null,indices:geo.index?Array.from(geo.index.array):Array.from({length:position.count},(_,i)=>i),castShadow:object.castShadow});
});
const colour=new THREE.Color(color),throughput=gauzeTransmissionColour(color,GAUZE_CANDLE_REFERENCE.shadowTransmissionScale).toArray(),profile=actual.profile().map(([r,y,cx])=>[r,y-pointLocal.y,cx-pointLocal.x]);
const sha=b=>createHash('sha256').update(b).digest('hex'),geometry=Buffer.from(JSON.stringify(meshes));
const result={version:1,scope:'Actual runtime default gauze indexed triangles and standard normals; geometry-only material stand-ins. Coordinates in engineY-up metres relative to actual visitor PointLight centre. No source, native render, bake, public installation or physical material equivalence claim.',shape,pointLocal:pointLocal.toArray(),wickBaseRelativeToPoint:parts.wick.at.clone().sub(pointLocal).toArray(),wickTipRelativeToPoint:parts.smokePath.wickTip.clone().sub(pointLocal).toArray(),suspensionTopRelativeToPoint:pointLocal.clone().negate().toArray(),profile,topY:profile.at(-1)[1],bottomY:profile[0][1],cloth:{cssHex:'#'+color.toString(16).padStart(6,'0'),linearRGB:colour.toArray(),shadowTransmissionLinearRGB:throughput,formula:`linearCSS*${GAUZE_CANDLE_REFERENCE.shadowTransmissionScale}/max(linearCSS)`,shadowTransmissionScale:GAUZE_CANDLE_REFERENCE.shadowTransmissionScale,diffuseTransmissionWeight:GAUZE_CANDLE_REFERENCE.diffuseTransmissionWeight,diffuseReflectionWeight:GAUZE_CANDLE_REFERENCE.diffuseReflectionWeight,weaveMeanLinear:.3978935},source:{sceneSha256:actual.sourceSha256,builderSha256:actual.builderSha256,helpersSha256:actual.helpersSha256,wickPlumeSha256:sha(await readFile(new URL('../web/src/engine/WickPlume.js',import.meta.url))),exporterSha256:sha(await readFile(new URL(import.meta.url)))},geometrySha256:sha(geometry),triangles:meshes.reduce((s,m)=>s+m.indices.length/3,0),parts:meshes};
await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(result)+'\n',{flag:'wx'});
console.log('ACTUAL_GAUZE_TRANSPORT_EXPORTED',JSON.stringify({path:out,sha256:sha(await readFile(out)),geometrySha256:result.geometrySha256,triangles:result.triangles,parts:meshes.length,shape:row.id,minutes,pointLocal:result.pointLocal,topY:result.topY,bottomY:result.bottomY,throughput}));
