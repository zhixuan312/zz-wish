import {Scene,Mesh,MeshBasicMaterial,PointLight,PerspectiveCamera,WebGLRenderTarget,FramebufferTexture,Vector2,Vector3,Vector4,Color,ShaderChunk,NoToneMapping,LinearSRGBColorSpace,NoColorSpace,NearestFilter,VSMShadowMap} from 'three';

const installed=new WeakMap();
const shadowSource=ShaderChunk.shadowmap_pars_fragment;
const cubeStart=shadowSource.indexOf('vec2 cubeToUV('),cubeEnd=shadowSource.indexOf('float getPointShadow(',cubeStart);
if(cubeStart<0||cubeEnd<=cubeStart)throw Error('Pinned Three point-shadow atlas mapping changed');
const cubeToUV=shadowSource.slice(cubeStart,cubeEnd).replace('vec2 cubeToUV(','vec2 staticLampCubeToUV(');
const staticGLSL=`
uniform sampler2D uStaticLampDepth;
uniform vec3 uStaticLampPoint,uStaticLampLivePoint;
uniform vec2 uStaticLampNearFar;
uniform float uStaticLampEnabled,uStaticLampFaceSize,uStaticLampSourceRadius,uStaticLampNormalBias,uStaticLampMatchTolerance;
varying vec3 vStaticLampWorld,vStaticLampWorldNormal;
${cubeToUV}
float staticLampDepth(vec3 direction){
 return unpackRGBAToDepth(texture2D(uStaticLampDepth,staticLampCubeToUV(direction,.5/uStaticLampFaceSize)));
}
float staticLampPlaneSample(vec3 direction,vec3 normal,float planeDistance,float receiverDistance){
 float denominator=dot(normal,direction);
 float planeReceiver=abs(denominator)>.000001?planeDistance/denominator:receiverDistance;
 float distanceToReceiver=planeReceiver>0.?planeReceiver:receiverDistance;
 float depth=(distanceToReceiver-uStaticLampNearFar.x)/(uStaticLampNearFar.y-uStaticLampNearFar.x);
 return step(depth,staticLampDepth(direction));
}
float getStaticLampVisibility(vec3 worldPos,vec3 worldNormal){
 vec3 normal=normalize(worldNormal),toLight=uStaticLampPoint-worldPos;
 normal*=dot(normal,toLight)<0.?-1.:1.;
 vec3 delta=worldPos+normal*uStaticLampNormalBias-uStaticLampPoint;
 float receiverDistance=max(length(delta),.000001);
 vec3 direction=delta/receiverDistance;
 // Derivatives precede fragment-varying range exits. They integrate the current
 // shader pixel separately from the physical source/atlas sampling footprint.
 vec3 pixelDx=dFdx(direction),pixelDy=dFdy(direction);
 if(uStaticLampEnabled<.5||receiverDistance<=uStaticLampNearFar.x||receiverDistance>=uStaticLampNearFar.y)return 1.;
 float range=uStaticLampNearFar.y-uStaticLampNearFar.x;
 float blockerDistance=uStaticLampNearFar.x+staticLampDepth(direction)*range;
 // The four-millimetre source angle follows actual cached blocker depth.
 // One atlas texel supplies a resolution-derived minimum coverage footprint.
 float physicalAngle=uStaticLampSourceRadius*max(0.,receiverDistance-blockerDistance)/(receiverDistance*max(uStaticLampNearFar.x,blockerDistance));
 float angle=max(physicalAngle,1./uStaticLampFaceSize);
 vec3 up=abs(direction.y)<.95?vec3(0.,1.,0.):vec3(1.,0.,0.);
 vec3 tangent=normalize(cross(up,direction)),bitangent=cross(direction,tangent);
 vec3 a=(tangent+bitangent)*(.5*angle),b=(tangent-bitangent)*(.5*angle);
 float planeDistance=dot(normal,delta);
 float visibility=staticLampPlaneSample(normalize(direction+a+.25*(pixelDx+pixelDy)),normal,planeDistance,receiverDistance);
 visibility+=staticLampPlaneSample(normalize(direction+b+.25*(pixelDx-pixelDy)),normal,planeDistance,receiverDistance);
 visibility+=staticLampPlaneSample(normalize(direction-b+.25*(-pixelDx+pixelDy)),normal,planeDistance,receiverDistance);
 visibility+=staticLampPlaneSample(normalize(direction-a-.25*(pixelDx+pixelDy)),normal,planeDistance,receiverDistance);
 return visibility*.25;
}
`;

function captureState(renderer){
 return{target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),viewport:renderer.getViewport(new Vector4()),scissor:renderer.getScissor(new Vector4()),scissorTest:renderer.getScissorTest(),clear:renderer.getClearColor(new Color()),alpha:renderer.getClearAlpha(),autoClear:renderer.autoClear,autoClearColor:renderer.autoClearColor,autoClearDepth:renderer.autoClearDepth,autoClearStencil:renderer.autoClearStencil,xr:renderer.xr.enabled,shadowEnabled:renderer.shadowMap.enabled,shadowAuto:renderer.shadowMap.autoUpdate,shadowNeeds:renderer.shadowMap.needsUpdate,tone:renderer.toneMapping,exposure:renderer.toneMappingExposure,colorSpace:renderer.outputColorSpace};
}
function restoreState(renderer,s){
 renderer.setRenderTarget(s.target,s.face,s.mip);renderer.setViewport(s.viewport);renderer.setScissor(s.scissor);renderer.setScissorTest(s.scissorTest);renderer.setClearColor(s.clear,s.alpha);
 renderer.autoClear=s.autoClear;renderer.autoClearColor=s.autoClearColor;renderer.autoClearDepth=s.autoClearDepth;renderer.autoClearStencil=s.autoClearStencil;
 renderer.xr.enabled=s.xr;renderer.shadowMap.enabled=s.shadowEnabled;renderer.shadowMap.autoUpdate=s.shadowAuto;renderer.shadowMap.needsUpdate=s.shadowNeeds;
 renderer.toneMapping=s.tone;renderer.toneMappingExposure=s.exposure;renderer.outputColorSpace=s.colorSpace;
}

/** Capture once per immutable static place at its authored visitor-light basis.
 * No scene lights/cast flags/materials are changed. Wrappers share source arrays
 * only during capture; the retained resource is a packed radial-depth texture.
 */
export function createStaticLampShadow({lightWorld,sourceRadius,resolution=512,near=.008,far=80,normalBias=.001,matchTolerance=.08}){
 if(!lightWorld?.isVector3)throw TypeError('Actual visitor PointLight world-position Vector3 required');
 if(!Number.isFinite(sourceRadius)||sourceRadius<0||!Number.isInteger(resolution)||resolution<16||resolution>1024||!Number.isFinite(near)||near<=0||!Number.isFinite(far)||far<=near||!Number.isFinite(normalBias)||normalBias<0||!Number.isFinite(matchTolerance)||matchTolerance<=0)throw RangeError('Invalid static lamp-shadow physical parameters');
 const basis=lightWorld.clone(),uniforms={uStaticLampDepth:{value:null},uStaticLampPoint:{value:basis},uStaticLampLivePoint:{value:lightWorld},uStaticLampNearFar:{value:new Vector2(near,far)},uStaticLampEnabled:{value:0},uStaticLampFaceSize:{value:resolution},uStaticLampSourceRadius:{value:sourceRadius},uStaticLampNormalBias:{value:normalBias},uStaticLampMatchTolerance:{value:matchTolerance}};
 let texture=null,ownedTarget=null,disposed=false,capturing=false;
 const metadata={method:'Frozen actual static geometry; native Three160 PointLightShadow RGBA radial-depth atlas',basisWorld:basis.toArray(),sourceRadiusMetres:sourceRadius,normalBiasMetres:normalBias,nearMetres:near,farMetres:far,requestedFaceResolution:resolution,filter:{blockerDepthFetches:1,visibilityDepthFetches:4,temporalNoise:false,receiverPlaneDepthCorrection:true,sourceAngle:'R*(dReceiver-dBlocker)/(dReceiver*dBlocker), using actual cached center depth',minimumCoverageAngle:'1/actual face resolution'},captured:false,limits:['Static visibility is frozen at the authored source basis; live suspension sway uses this nearby basis approximation.','Rays outside near/far return visible; choose a far bound covering all significant receivers.','GPU capture, packed copy, bias, PCF quality, memory and FPS require real browser verification.']};
 const state={uniforms,metadata,get texture(){return texture;},
  async capture(renderer,staticRoot,{copyFramebuffer=true}={}){
   if(disposed||capturing)throw Error('Static lamp-shadow state is disposed or capturing');
   if(!renderer?.isWebGLRenderer||!staticRoot?.isObject3D)throw TypeError('Actual renderer and immutable static glTF root required');
   if(metadata.captured){if(metadata.staticRootUuid!==staticRoot.uuid)throw Error('A new static place requires a new lamp-shadow state');return metadata;}
   if(renderer.shadowMap.type===VSMShadowMap)throw Error('Static radial-depth capture requires the pinned packed point-shadow path');
   if(resolution*4>renderer.capabilities.maxTextureSize)throw RangeError('Requested point-shadow atlas exceeds GPU texture size');
   capturing=true;
   const scene=new Scene(),override=new MeshBasicMaterial({color:0}),skip=new MeshBasicMaterial({visible:false}),warm=new WebGLRenderTarget(4,4,{depthBuffer:false,stencilBuffer:false}),light=new PointLight(0xffffff,0,0,2),camera=new PerspectiveCamera(60,1,near,far);
   let saved=null,nextTexture=null,nextTarget=null;
   try{
    staticRoot.updateWorldMatrix(true,true);let meshes=0,triangles=0,transmittingGroups=0;
    staticRoot.traverseVisible(object=>{
     if(!object.isMesh||object.userData.one_light_dynamic||object.userData.one_light_transport_proxy||object.userData.visitorCloth||object.userData.visitorRib)return;
     if(object.isSkinnedMesh||object.isInstancedMesh||object.isBatchedMesh)throw Error('Static shadow wrappers require actual evaluated ordinary static meshes');
     const materials=Array.isArray(object.material)?object.material:[object.material],shadowMaterials=materials.map(material=>{
      if(!material||!material.visible||material.transmission>0||(material.transparent&&!(material.alphaTest>0))){transmittingGroups++;return skip;}return material;
     });
     if(shadowMaterials.every(material=>material===skip))return;
     const mesh=new Mesh(object.geometry,Array.isArray(object.material)?shadowMaterials:shadowMaterials[0]);
     mesh.name=object.name;mesh.matrixAutoUpdate=false;mesh.matrix.copy(object.matrixWorld);mesh.castShadow=true;mesh.receiveShadow=false;mesh.frustumCulled=object.frustumCulled;
     if(object.customDistanceMaterial)mesh.customDistanceMaterial=object.customDistanceMaterial;
     scene.add(mesh);meshes++;triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;
    });
    if(!meshes)throw Error('No opaque actual static meshes to capture');
    scene.overrideMaterial=override;light.position.copy(basis);light.castShadow=true;light.shadow.mapSize.set(resolution,resolution);light.shadow.camera.near=near;light.shadow.camera.far=far;light.shadow.camera.updateProjectionMatrix();light.shadow.autoUpdate=false;light.shadow.needsUpdate=true;scene.add(light);
    camera.position.copy(basis);camera.lookAt(basis.clone().add(new Vector3(1,0,0)));scene.updateMatrixWorld(true);
    // Compile the unshown four-by-four beauty pass before changing render state.
    await renderer.compileAsync(scene,camera);
    if(disposed)throw Error('Static lamp-shadow state disposed during warm compile');
    saved=captureState(renderer);renderer.xr.enabled=false;renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
    renderer.autoClear=true;renderer.autoClearColor=true;renderer.autoClearDepth=true;renderer.autoClearStencil=true;renderer.toneMapping=NoToneMapping;renderer.toneMappingExposure=1;renderer.outputColorSpace=LinearSRGBColorSpace;
    renderer.setScissorTest(false);renderer.setClearColor(0,0);renderer.setRenderTarget(warm);renderer.setViewport(0,0,4,4);renderer.render(scene,camera);
    const atlas=light.shadow.map;if(!atlas?.texture)throw Error('Actual native point shadow atlas was not generated');
    const face=light.shadow.mapSize.x;
    if(atlas.width!==face*4||atlas.height!==face*2)throw Error('Native point-shadow atlas frame layout changed');
    let copyFailure=null;
    if(copyFramebuffer){
     nextTexture=new FramebufferTexture(atlas.width,atlas.height);nextTexture.colorSpace=NoColorSpace;nextTexture.flipY=false;nextTexture.minFilter=nextTexture.magFilter=NearestFilter;nextTexture.name='Frozen static visitor lamp radial depth';
     try{renderer.setRenderTarget(atlas);renderer.copyFramebufferToTexture(new Vector2(0,0),nextTexture);}
     catch(error){nextTexture.dispose();nextTexture=null;copyFailure=String(error);}
    }
    if(!nextTexture){nextTarget=atlas;nextTexture=atlas.texture;light.shadow.map=null;}
    texture=nextTexture;ownedTarget=nextTarget;uniforms.uStaticLampDepth.value=texture;uniforms.uStaticLampFaceSize.value=face;uniforms.uStaticLampEnabled.value=1;
    Object.assign(metadata,{captured:true,staticRootUuid:staticRoot.uuid,staticMeshes:meshes,staticTriangles:triangles,excludedTransmittingMaterialGroups:transmittingGroups,actualFaceResolution:face,atlasSize:[atlas.width,atlas.height],rgbaTextureBytes:atlas.width*atlas.height*4,captureBeautySize:[4,4],storage:ownedTarget?'native-render-target-fallback':'framebuffer-texture-copy',copyFailure,copyPixelEquivalenceVerified:false,mainSceneMutations:0});
    return metadata;
   }catch(error){
    if(nextTarget)nextTarget.dispose();else nextTexture?.dispose();throw error;
   }finally{
    if(saved)restoreState(renderer,saved);scene.clear();light.dispose();override.dispose();skip.dispose();warm.dispose();capturing=false;
   }
  },
  install(material){
   if(disposed)throw Error('Static lamp-shadow state is disposed');
   if(!material?.isMeshStandardMaterial)throw TypeError('Owned Three standard/physical receiver material required');
   const owner=installed.get(material);if(owner){if(owner!==state)throw Error('Clone material before binding another static light-shadow owner');return material;}
   const compile=material.onBeforeCompile,key=material.customProgramCacheKey.call(material);
   material.defines={...material.defines,USE_STATIC_LAMP_SHADOW:1};
   material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms);
    if(!shader.vertexShader.includes('#include <worldpos_vertex>'))throw Error('Static lamp shadow needs actual standard world-position/normal chunks');
    shader.vertexShader='varying vec3 vStaticLampWorld,vStaticLampWorldNormal;\n'+shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
      vec4 staticLampPosition=vec4(transformed,1.);
      #ifdef USE_BATCHING
       staticLampPosition=batchingMatrix*staticLampPosition;
      #endif
      #ifdef USE_INSTANCING
       staticLampPosition=instanceMatrix*staticLampPosition;
      #endif
      vStaticLampWorld=(modelMatrix*staticLampPosition).xyz;
      vStaticLampWorldNormal=inverseTransformDirection(transformedNormal,viewMatrix);`);
    const marker='getPointLightInfo( pointLight, geometryPosition, directLight );';
    if(!shader.fragmentShader.includes('#include <packing>'))throw Error('Static radial depth requires the pinned Three RGBA packing chunk');
    shader.fragmentShader=shader.fragmentShader.replace('#include <packing>','#include <packing>\n'+staticGLSL).replace('#include <lights_fragment_begin>',ShaderChunk.lights_fragment_begin);
    if(!shader.fragmentShader.includes(marker))throw Error('Pinned Three actual point-light call changed');
    shader.fragmentShader=shader.fragmentShader.replace(marker,marker+`
      {vec3 staticLampVisitorView=(viewMatrix*vec4(uStaticLampLivePoint,1.)).xyz;
      if(distance(pointLight.position,staticLampVisitorView)<uStaticLampMatchTolerance)
       directLight.color*=getStaticLampVisibility(vStaticLampWorld,normalize(vStaticLampWorldNormal));}`);
   };
   material.customProgramCacheKey=()=>key+'-static-lamp-radial-depth-pcf4-v1';material.needsUpdate=true;installed.set(material,state);return material;
  },
  dispose(){disposed=true;uniforms.uStaticLampEnabled.value=0;uniforms.uStaticLampDepth.value=null;if(ownedTarget)ownedTarget.dispose();else texture?.dispose();texture=null;ownedTarget=null;},
 };
 return state;
}
