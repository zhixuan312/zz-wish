// Read-only actual delivered HERO/opaque geometry versus the source-rooted SDF quad.
import * as THREE from 'three';
import{readFile,writeFile,mkdir}from'node:fs/promises';import{createHash}from'node:crypto';import{pathToFileURL}from'node:url';
const base='art/build/cloud-cliff-round1/runtime-eval-v16-delivery',out='artifacts/full-review/round-1/storm-flame-cpu';await mkdir(out,{recursive:true});
const tools='/tmp/one-light-gltf-tools/node_modules/',load=(name,file='dist/index.js')=>import(pathToFileURL(tools+name+'/'+file)),{NodeIO}=await load('@gltf-transform/core'),{ALL_EXTENSIONS}=await load('@gltf-transform/extensions'),{MeshoptDecoder}=await load('meshoptimizer','index.js');await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}),manifest=JSON.parse(await readFile(base+'/manifest.json')),hero=manifest.heroes.storm,metadata=Object.fromEntries(Object.entries(hero).filter(([key])=>key!=='compression')),meshes=[],nodes=[];
for(const kind of['hero','main']){
 const path=base+'/'+(kind==='hero'?hero.uri:manifest.scene),bytes=await readFile(path),document=await io.read(path),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
 const materials=document.getRoot().listMaterials();
 for(const node of document.getRoot().listNodes()){
  if(!node.getMesh())continue;const world=new THREE.Matrix4().fromArray(node.getWorldMatrix());
  for(const primitive of node.getMesh().listPrimitives()){
   const materialIndex=materials.indexOf(primitive.getMaterial()),m=json.materials[materialIndex],transmission=m.extensions?.KHR_materials_transmission?.transmissionFactor??0,glass=kind==='hero'&&transmission>.5;
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(primitive.getAttribute('POSITION').getArray(),3));geometry.setIndex(new THREE.BufferAttribute(primitive.getIndices().getArray(),1));
   const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:m.doubleSided?THREE.DoubleSide:THREE.FrontSide}));mesh.matrixAutoUpdate=false;mesh.matrix.copy(world);mesh.matrixWorld.copy(world);geometry.computeBoundingBox();geometry.computeBoundingSphere();
   const bounds=geometry.boundingBox.clone().applyMatrix4(world),record={kind,name:node.getName(),material:m.name,materialIndex,alphaMode:m.alphaMode??'OPAQUE',transmission,glass,depthWrite:glass?false:(m.alphaMode!=='BLEND'),transparent:m.alphaMode==='BLEND',side:m.doubleSided?'DoubleSide':'FrontSide',materialPBR:m.pbrMetallicRoughness,extensions:m.extensions,world:world.toArray(),bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}};
   mesh.userData.record=record;meshes.push(mesh);nodes.push(record);
  }
 }
 console.log('STORM_GEOMETRY',kind,document.getRoot().listNodes().length,bytes.length,createHash('sha256').update(bytes).digest('hex'));
}
const origin=new THREE.Vector3(...hero.wickTip).add(new THREE.Vector3(0,.002,0)),scale=.038*1.3,cameras=[];
for(const size of['desktop','phone']){
 const data=JSON.parse(await readFile('artifacts/full-review/round-1/cloud-source16-runtime-night/chromium-night-'+size+'.json')),width=data.size[0],height=data.size[1],camera=new THREE.PerspectiveCamera(data.camera.fov,width/height,.01,1800);camera.position.fromArray(data.camera.position);camera.lookAt(new THREE.Vector3(...data.camera.look));camera.updateMatrixWorld();const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);right.y=0;right.normalize();
 const project=p=>{const v=p.clone().project(camera);return[(v.x*.5+.5)*width,(.5-v.y*.5)*height,v.z];},raycaster=new THREE.Raycaster(),samples=[];
 for(const y of[0,.1,.2,.3,.4,.5,.6,.7,.8,.9,1])for(const x of[-.15,0,.15]){
  const point=origin.clone().addScaledVector(right,x*scale*.5);point.y+=y*scale;const length=camera.position.distanceTo(point);raycaster.set(camera.position,point.clone().sub(camera.position).normalize());raycaster.far=length-1e-7;const hits=raycaster.intersectObjects(meshes,false).map(hit=>({distance:hit.distance,...hit.object.userData.record}));
  samples.push({uv:[x+.5,y],world:point.toArray(),pixel:project(point),firstGlass:hits.find(h=>h.glass)?.name??null,firstOpaque:hits.find(h=>h.depthWrite&&!h.transparent)?.name??null,firstOpaqueMaterial:hits.find(h=>h.depthWrite&&!h.transparent)?.material??null,firstOpaqueDistance:hits.find(h=>h.depthWrite&&!h.transparent)?.distance??null,targetDistance:length});
 }
 const quad=[[-.5,0],[.5,0],[-.5,1],[.5,1]].map(([x,y])=>project(origin.clone().addScaledVector(right,x*scale*.5).add(new THREE.Vector3(0,y*scale,0))));
 cameras.push({size,camera:data.camera,viewport:[width,height],fullQuadPixels:quad,fullQuadHeightPixels:Math.max(...quad.map(p=>p[1]))-Math.min(...quad.map(p=>p[1])),fullQuadWidthPixels:Math.max(...quad.map(p=>p[0]))-Math.min(...quad.map(p=>p[0])),samples});
}
const report={role:'CPU actual delivered triangle/material/SDF-envelope audit; phase-specific alpha and actual live render flags need browser readback.',manifestSha256:createHash('sha256').update(await readFile(base+'/manifest.json')).digest('hex'),metadata,flameOrigin:origin.toArray(),flameScaleMaximum:scale,glassDepthWriteOverride:'Staged descriptor forces depthWrite=false for transmission>.5; Three160 transmissive list precedes transparent SDF.',heroMeshes:nodes.filter(n=>n.kind==='hero'),cameras,shaderFacts:{plane:[1,1],geometryHeightMetres:scale,geometryWidthMetres:scale*.5,sourceSize:1.3,power:1,layers:'Defaults layer0; hero coverLayers sets0; main camera0',depthTest:true,depthWrite:false,blending:'AdditiveBlending'},noBrowserOrGpu:true};await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log('STORM_CPU_REPORT',out+'/report.json',JSON.stringify(cameras.map(c=>({size:c.size,width:c.fullQuadWidthPixels,height:c.fullQuadHeightPixels,blocked:c.samples.filter(s=>s.firstOpaque).map(s=>({uv:s.uv,name:s.firstOpaque,material:s.firstOpaqueMaterial}))}))));
