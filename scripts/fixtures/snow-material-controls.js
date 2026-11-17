/** Isolated capture-only controls. The caller supplies actual private objects. */
export function createSnowMaterialControls({THREE,getPlace,getLamp,camera,previewFill,provenance}){
  const originals=new Map(),fixtureOriginals=new Map();
  const state={mode:'normal',fixtureSpecOff:false,specOff:false,paintNormalOff:false,fill:null};
  let originalFill=null,diagnosticTarget=null;
  const texture=t=>t?{uuid:t.uuid,name:t.name,dimensions:[t.image?.width??null,t.image?.height??null],colorSpace:t.colorSpace,channel:t.channel,repeat:t.repeat.toArray(),offset:t.offset.toArray(),anisotropy:t.anisotropy}:null;
  function actual(){
    const place=getPlace();
    if(place?.id!=='snow-roof'||!place.baked?.group)throw Error('Load the actual Snow Roof baked place before material controls');
    const materials=new Set(),fixtures=[];
    place.baked.group.traverse(object=>{if(object.isMesh)for(const m of Array.isArray(object.material)?object.material:[object.material])materials.add(m);});
    place.G.traverse(object=>{if(object.isPointLight&&(object.userData.captureRole==='static-fixture-specular'||object.userData.bakedFixture===true))fixtures.push(object);});
    return {place,materials:[...materials],fixtures};
  }
  function remember(materials,fixtures){
    for(const m of materials)if(!originals.has(m))originals.set(m,{onBeforeCompile:m.onBeforeCompile,customProgramCacheKey:m.customProgramCacheKey,normalScale:m.normalScale?.clone()??null});
    for(const light of fixtures)if(!fixtureOriginals.has(light))fixtureOriginals.set(light,{visible:light.visible});
    originalFill??={intensity:previewFill.intensity,visible:previewFill.visible,position:previewFill.position.clone(),target:previewFill.target};
  }
  function restore(){
    for(const [m,saved]of originals){
      m.onBeforeCompile=saved.onBeforeCompile;m.customProgramCacheKey=saved.customProgramCacheKey;
      if(saved.normalScale)m.normalScale.copy(saved.normalScale);
      m.needsUpdate=true;
    }
    for(const [light,saved]of fixtureOriginals)light.visible=saved.visible;
    if(originalFill){previewFill.intensity=originalFill.intensity;previewFill.visible=originalFill.visible;previewFill.position.copy(originalFill.position);previewFill.target=originalFill.target;}
    diagnosticTarget?.removeFromParent();
    Object.assign(state,{mode:'normal',fixtureSpecOff:false,specOff:false,paintNormalOff:false,fill:null});
  }
  function removeSpecular(material){
    const saved=originals.get(material);
    material.onBeforeCompile=function(shader,renderer){
      saved.onBeforeCompile.call(this,shader,renderer);
      const anchor='vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;';
      if(shader.fragmentShader.split(anchor).length!==2)throw Error('Pinned actual static-material specular accumulation changed');
      shader.fragmentShader=shader.fragmentShader.replace(anchor,`
        reflectedLight.directSpecular=vec3(0.);
        reflectedLight.indirectSpecular=vec3(0.);
        #ifdef USE_CLEARCOAT
          clearcoatSpecularDirect=vec3(0.);
          clearcoatSpecularIndirect=vec3(0.);
        #endif
        #ifdef USE_SHEEN
          sheenSpecularDirect=vec3(0.);
          sheenSpecularIndirect=vec3(0.);
        #endif
        ${anchor}`);
    };
    material.customProgramCacheKey=function(){return saved.customProgramCacheKey.call(this)+'|capture-only-all-specular-off-v1';};
    material.needsUpdate=true;
  }
  function cloth(){
    const lamp=getLamp();let found=null;
    lamp.parts?.g.traverse(object=>{if(object.isMesh&&object.userData.visitorCloth)found=object;});
    if(!found)throw Error('The actual gauze cloth must exist for the fill candidate');
    found.updateWorldMatrix(true,false);return found;
  }
  function placeFill(){
    const config=state.fill;if(!config)return;
    const mesh=cloth(),center=new THREE.Box3().setFromObject(mesh,true).getCenter(new THREE.Vector3());
    const eye=config.followCamera?camera.getWorldPosition(new THREE.Vector3()):new THREE.Vector3().fromArray(config.cameraAtActivation);
    const toward=eye.clone().sub(center);
    if(toward.lengthSq()<1e-12)throw Error('Fill camera coincides with actual cloth centre');
    const offset=toward.normalize().multiplyScalar(config.distance).add(new THREE.Vector3(0,config.topOffset,0)).setLength(config.distance);
    const worldPosition=center.clone().add(offset),parent=previewFill.parent;
    diagnosticTarget??=new THREE.Object3D();diagnosticTarget.name='Capture-only cloth-centre fill target';
    if(diagnosticTarget.parent!==parent)parent.add(diagnosticTarget);
    previewFill.position.copy(parent.worldToLocal(worldPosition.clone()));
    diagnosticTarget.position.copy(parent.worldToLocal(center.clone()));diagnosticTarget.updateWorldMatrix(true,false);
    previewFill.target=diagnosticTarget;previewFill.visible=true;previewFill.intensity=config.intensity;
    config.actual={clothObject:mesh.name,clothUuid:mesh.uuid,clothWorldBoundsCenter:center.toArray(),actualCameraWorld:eye.toArray(),lightWorld:worldPosition.toArray(),targetWorld:center.toArray(),distanceMetres:worldPosition.distanceTo(center),intensity:previewFill.intensity,linearColor:previewFill.color.toArray()};
  }
  function update(){
    if(getPlace()?.id!=='snow-roof')return;
    if(state.fixtureSpecOff){const {fixtures}=actual();remember([],fixtures);for(const light of fixtures)light.visible=false;}
    if(state.fill)placeFill();
  }
  function metadata(){
    const {place,materials,fixtures}=actual();
    return {scope:'Isolated optical contribution controls only; no source, GI, public material or product camera adoption',provenance,
      mode:state.mode,controls:{fixtureSpecOff:state.fixtureSpecOff,specOff:state.specOff,paintNormalOff:state.paintNormalOff,fill:state.fill?{...state.fill}:null},
      sourceBlendSha256:place.baked.manifest.bake.sourceBlendSha256,bakeFingerprint:place.baked.manifest.bakeFingerprint,
      camera:{position:camera.getWorldPosition(new THREE.Vector3()).toArray(),fov:camera.fov,projectionMatrix:camera.projectionMatrix.toArray()},
      fixtureLights:fixtures.map(light=>({id:light.id,uuid:light.uuid,role:light.userData.captureRole??'bakedFixture',visible:light.visible,baselineVisible:fixtureOriginals.get(light)?.visible??light.visible,intensity:light.intensity,power:light.power,linearColor:light.color.toArray(),world:light.getWorldPosition(new THREE.Vector3()).toArray(),castShadow:light.castShadow})),
      staticMaterials:materials.map(m=>({uuid:m.uuid,name:m.name,type:m.type,painted:!!m.userData.one_light_painted_fine_finish,color:m.color?.toArray()??null,roughness:m.roughness,metalness:m.metalness,normalScale:m.normalScale?.toArray()??null,minRuntimeRoughness:m.userData.one_light_min_roughness??0,normalMap:texture(m.normalMap),roughnessMap:texture(m.roughnessMap),envMapIntensity:m.envMapIntensity,emissiveIntensity:m.emissiveIntensity,originalHookRestored:!originals.has(m)||m.onBeforeCompile===originals.get(m).onBeforeCompile,originalProgramKeyRestored:!originals.has(m)||m.customProgramCacheKey===originals.get(m).customProgramCacheKey})),
      previewFill:{id:previewFill.id,type:previewFill.type,visible:previewFill.visible,intensity:previewFill.intensity,world:previewFill.getWorldPosition(new THREE.Vector3()).toArray(),targetWorld:previewFill.target.getWorldPosition(new THREE.Vector3()).toArray(),linearColor:previewFill.color.toArray(),captureFrameOverride:!!state.fill}};
  }
  function api(mode='metadata',options={}){
    if(mode==='metadata')return metadata();
    if(!['normal','restore','fixture-spec-off','spec-off','paint-normal-off','fill'].includes(mode))throw Error('Unknown isolated Snow material control');
    const {materials,fixtures}=actual();remember(materials,fixtures);restore();state.mode=mode;
    if(mode==='fixture-spec-off'){state.fixtureSpecOff=true;for(const light of fixtures)light.visible=false;}
    if(mode==='spec-off'){state.specOff=true;for(const m of materials)removeSpecular(m);}
    if(mode==='paint-normal-off'){state.paintNormalOff=true;for(const m of materials)if(m.userData.one_light_painted_fine_finish&&m.normalScale){m.normalScale.set(0,0);m.needsUpdate=true;}}
    if(mode==='fill'){
      const config={intensity:options.intensity??1.35,distance:options.distance??1,topOffset:options.topOffset??.18,followCamera:options.followCamera??true,cameraAtActivation:camera.getWorldPosition(new THREE.Vector3()).toArray()};
      if(![config.intensity,config.distance,config.topOffset].every(Number.isFinite)||config.intensity<0||config.intensity>8||config.distance<=0||config.distance>3||Math.abs(config.topOffset)>1)throw Error('Bounded fill intensity[0,8],distance(0,3],topOffset[-1,1] required');
      state.fill=config;placeFill();
    }
    return metadata();
  }
  return {api,update};
}
