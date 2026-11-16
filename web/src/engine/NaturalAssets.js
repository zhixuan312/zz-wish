import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const names=['rock_pitted_mossy','weathered_planks','stone_pavers','dark_brick_wall','white_plaster_rough_01'];
export const scans={};
export const naturalResources={textures:new Set(),geometries:new Set()};
let faces=[],boulders=[],stump=null,loading;
const protect=(object)=>object.traverse(o=>{if(o.geometry)naturalResources.geometries.add(o.geometry);for(const m of [o.material].flat())if(m)for(const v of Object.values(m))if(v?.isTexture)naturalResources.textures.add(v);});
export function loadNaturalAssets(){
  if(loading)return loading;
  loading=(async()=>{
    const textures=new THREE.TextureLoader(),models=new GLTFLoader();
    await Promise.all(names.map(async name=>{
      const [map,normalMap,roughnessMap]=await Promise.all(['diffuse','normal','roughness'].map(kind=>textures.loadAsync(`/materials/scans/${name}/${kind}.jpg`)));
      map.colorSpace=THREE.SRGBColorSpace;
      for(const t of [map,normalMap,roughnessMap]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;naturalResources.textures.add(t);}
      scans[name]={map,normalMap,roughnessMap,normalScale:new THREE.Vector2(.7,.7),roughness:1};
    }));
    const loaded=await Promise.all(['rock_face_01','rock_face_02','rock_moss_set_01','tree_stump_01'].map(name=>models.loadAsync(`/models/${name}/${name}.gltf`)));
    faces=loaded.slice(0,2).map(x=>x.scene);
    loaded[2].scene.traverse(o=>{if(o.isMesh){const mesh=o.clone();mesh.position.set(0,0,0);boulders.push(mesh);}});
    stump=loaded[3].scene;
    for(const x of loaded)protect(x.scene);
  })();
  return loading;
}
export function isScanTexture(texture){return names.some(name=>scans[name]?.map===texture);}
function specimen(parent,source,x,y,z,width,height,depth,yaw=0){
  const object=source.clone(true),bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3());
  object.position.sub(new THREE.Vector3((bounds.min.x+bounds.max.x)/2,bounds.min.y,(bounds.min.z+bounds.max.z)/2));
  object.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  const g=new THREE.Group();g.add(object);g.scale.set(width/size.x,height/size.y,depth/size.z);g.rotation.y=yaw;g.position.set(x,y,z);parent.add(g);return g;
}
export function addScannedRock(parent,x,y,z,s,seed=1){
  if(!faces.length)return false;
  const width=s[0]*2,height=s[1]*1.35,depth=s[2]*2;
  if(height>width*1.8){
    const layers=Math.ceil(height/(width*.85)),layerHeight=height/layers;
    for(let i=0;i<layers;i++)specimen(parent,faces[(seed+i)%faces.length],x+Math.sin(i*2.4+seed)*width*.07,y-s[1]*.2+i*layerHeight*.87,z+Math.cos(i*1.7)*depth*.06,width*(1+.12*Math.sin(i*3)),layerHeight*1.3,depth,Math.sin(seed+i)*.2);
  }else specimen(parent,boulders.length?boulders[Math.abs(seed)%boulders.length]:faces[Math.abs(seed)%2],x,y-s[1]*.12,z,width,height,depth,seed*2.399);
  return true;
}
export function addScannedStump(parent,x,y,z,scale=1,yaw=0){
  if(stump)specimen(parent,stump,x,y,z,scale*1.7,scale*1.5,scale*1.6,yaw);
}
