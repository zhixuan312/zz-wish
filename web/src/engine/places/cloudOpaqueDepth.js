// A public, single-sample geometry pass. The parent MSAA depth is never read.
// Store linear view Z in RGBA8; the depth renderbuffer only selects the nearest
// surface. Encoding range=2*far gives valid far fragments explicit headroom.
export const cloudOpaqueDepthGLSL=`
uniform sampler2D uCloudOpaqueDepth;
uniform mat4 uCloudOpaqueView;
uniform float uCloudOpaqueRange,uCloudOpaqueEnabled;
float cloudOpaqueRayLimit(vec2 uv,vec3 rayOriginWorld,vec3 rayDirectionWorld,float maximumRay){
 if(uCloudOpaqueEnabled<.5)return maximumRay;
 vec4 opaquePacked=texture(uCloudOpaqueDepth,uv);
 if(all(equal(opaquePacked,vec4(1.))))return maximumRay;
 float viewZ=dot(opaquePacked,(255./256.)/vec4(16777216.,65536.,256.,1.))*uCloudOpaqueRange;
 vec3 originView=(uCloudOpaqueView*vec4(rayOriginWorld,1.)).xyz;
 vec3 directionView=mat3(uCloudOpaqueView)*normalize(rayDirectionWorld);
 if(abs(directionView.z)<1e-12)return maximumRay;
 float distanceAlongRay=(-viewZ-originView.z)/directionView.z;
 return min(maximumRay,max(0.,distanceAlongRay));
}
`;

/** CPU reference of the shader's linear packing decode and actual ray solve. */
export function decodeCloudOpaqueRayLimit({rgba,range,viewMatrix,rayOrigin,rayDirection,maximumRay=Infinity}){
 if(rgba.every(value=>value===255))return maximumRay;
 const viewZ=(rgba[0]/16777216+rgba[1]/65536+rgba[2]/256+rgba[3])/256*range,e=viewMatrix.elements??viewMatrix,o=rayOrigin.toArray?.()??rayOrigin,d=rayDirection.toArray?.()??rayDirection,length=Math.hypot(...d);
 const originZ=e[2]*o[0]+e[6]*o[1]+e[10]*o[2]+e[14],directionZ=(e[2]*d[0]+e[6]*d[1]+e[10]*d[2])/length;
 return Math.abs(directionZ)<1e-12?maximumRay:Math.min(maximumRay,Math.max(0,(-viewZ-originZ)/directionZ));
}

function saveRenderer(THREE,renderer){
 return{target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),clear:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha(),autoClear:renderer.autoClear,autoClearColor:renderer.autoClearColor,autoClearDepth:renderer.autoClearDepth,autoClearStencil:renderer.autoClearStencil,xr:renderer.xr.enabled,shadowEnabled:renderer.shadowMap.enabled,shadowAuto:renderer.shadowMap.autoUpdate,shadowNeeds:renderer.shadowMap.needsUpdate,tone:renderer.toneMapping,exposure:renderer.toneMappingExposure,colorSpace:renderer.outputColorSpace};
}
function restoreRenderer(renderer,s){
 // Restore the global CSS viewport first, then the parent's physical target
 // viewport. This matters for individual cube/probe faces under a larger canvas.
 renderer.setViewport(s.viewport);renderer.setScissor(s.scissor);renderer.setScissorTest(s.scissorTest);renderer.setRenderTarget(s.target,s.face,s.mip);renderer.setClearColor(s.clear,s.alpha);
 renderer.autoClear=s.autoClear;renderer.autoClearColor=s.autoClearColor;renderer.autoClearDepth=s.autoClearDepth;renderer.autoClearStencil=s.autoClearStencil;renderer.xr.enabled=s.xr;
 renderer.shadowMap.enabled=s.shadowEnabled;renderer.shadowMap.autoUpdate=s.shadowAuto;renderer.shadowMap.needsUpdate=s.shadowNeeds;renderer.toneMapping=s.tone;renderer.toneMappingExposure=s.exposure;renderer.outputColorSpace=s.colorSpace;
}

// Extended full-resolution allocations require explicit constructor opt-in.
// Defaults preserve the original 1024-square helper guard.
export function createCloudOpaqueDepth({THREE,renderer,maxDimension=1024,maxPixels=1024*1024}){
 if(!THREE?.MeshDepthMaterial||!renderer?.isWebGLRenderer)throw TypeError('Actual Three namespace and renderer required');
 if(!Number.isInteger(maxDimension)||maxDimension<1||maxDimension>4096||!Number.isSafeInteger(maxPixels)||maxPixels<1||maxPixels>8388608)throw RangeError('Opaque depth allocation opt-in must remain within 4096 dimensions and 8388608 pixels');
 const allocationLimits=Object.freeze({maxDimension,maxPixels,maxTextureSize:renderer.capabilities.maxTextureSize,explicitExtendedLimits:maxDimension>1024||maxPixels>1024*1024});
 const target=new THREE.WebGLRenderTarget(1,1,{samples:0,type:THREE.UnsignedByteType,format:THREE.RGBAFormat,depthBuffer:true,stencilBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
 target.texture.colorSpace=THREE.NoColorSpace;target.texture.generateMipmaps=false;target.texture.name='Actual opaque cloud linear view depth';
 const stage=new THREE.Scene(),wrappers=new Map(),depthMaterials=new Map(),identities=new WeakMap(),skip=new THREE.MeshDepthMaterial();skip.visible=false;
 const uniforms={uCloudOpaqueDepth:{value:target.texture},uCloudOpaqueView:{value:new THREE.Matrix4()},uCloudOpaqueRange:{value:1},uCloudOpaqueEnabled:{value:0}};
 let revision=0,key=null,nextIdentity=1,disposed=false,rendering=false,metadata={ready:false,revision:0,allocationLimits};
 const identity=object=>{if(!object)return 0;if(!identities.has(object))identities.set(object,nextIdentity++);return identities.get(object);};
 const same=(a,b)=>a?.length===b.length&&b.every((value,i)=>Object.is(value,a[i]));
 const depthFields=['side','alphaTest','alphaHash','opacity','displacementScale','displacementBias','clipIntersection','wireframe','wireframeLinewidth','depthFunc','depthTest','polygonOffset','polygonOffsetFactor','polygonOffsetUnits'];
 function attributeKey(parts,attribute){
  if(!attribute){parts.push(0);return;}
  parts.push(identity(attribute),identity(attribute.array??attribute.data?.array),attribute.version??attribute.data?.version,attribute.itemSize,attribute.count,attribute.normalized,attribute.offset,attribute.data?.stride);
 }
 function planesKey(parts,planes){parts.push(planes?.length??0);for(const plane of planes??[])parts.push(...plane.normal.toArray(),plane.constant);}
 function eligible(material){return material?.visible&&material.depthWrite!==false&&!(material.transmission>0)&&(!material.transparent||material.alphaTest>0)&&(material.blending===THREE.NormalBlending||material.blending===THREE.NoBlending);}
 function depthMaterial(source){
  let row=depthMaterials.get(source);
  if(!row){
   const material=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,blending:THREE.NoBlending}),opacityUniform={value:source.opacity};
   material.toneMapped=false;material.fog=false;material.depthTest=true;material.depthWrite=true;
   material.onBeforeCompile=shader=>{
    shader.uniforms.uCloudOpaqueRange=uniforms.uCloudOpaqueRange;shader.uniforms.uCloudOpaqueOpacity=opacityUniform;
    shader.vertexShader='varying float vCloudOpaqueViewZ;\n'+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvCloudOpaqueViewZ=-mvPosition.z;');
    const packed='gl_FragColor = packDepthToRGBA( fragCoordZ );';if(!shader.fragmentShader.includes(packed))throw Error('Pinned Three depth packing changed');
    const alpha='vec4 diffuseColor = vec4( 1.0 );';if(!shader.fragmentShader.includes(alpha))throw Error('Pinned Three depth alpha input changed');
    shader.fragmentShader='varying float vCloudOpaqueViewZ;uniform float uCloudOpaqueRange,uCloudOpaqueOpacity;\n'+shader.fragmentShader.replace(packed,'gl_FragColor=packDepthToRGBA(vCloudOpaqueViewZ/uCloudOpaqueRange);').replace(alpha,'vec4 diffuseColor=vec4(1.,1.,1.,uCloudOpaqueOpacity);');
   };
   material.customProgramCacheKey=()=> 'cloud-opaque-linear-view-depth-v1';row={material,opacityUniform};depthMaterials.set(source,row);
  }
  const material=row.material;let changed=false;
  for(const field of [...depthFields,'map','alphaMap','displacementMap','clippingPlanes'])if(material[field]!==source[field]&&source[field]!==undefined){material[field]=source[field];changed=true;}
  const channels=[source.map?.channel,source.alphaMap?.channel,source.displacementMap?.channel];if(!same(row.channels,channels)){row.channels=channels;changed=true;}
  row.opacityUniform.value=source.opacity;if(changed)material.needsUpdate=true;return material;
 }
 const api={uniforms,glsl:cloudOpaqueDepthGLSL,get texture(){return target.texture;},get metadata(){return metadata;},
  render({scene,camera,width,height,exclude=[]}){
   if(disposed||rendering)throw Error('Cloud opaque depth is disposed or rendering');
   if(!scene?.isObject3D||!camera?.isCamera||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>maxDimension||height>maxDimension||!Number.isFinite(camera.far)||camera.far<=0)throw TypeError('Actual scene/camera and bounded integer depth dimensions required');
   if(width*height>maxPixels)throw RangeError('Opaque depth size exceeds explicit pixel allocation limit');
   if(width>renderer.capabilities.maxTextureSize||height>renderer.capabilities.maxTextureSize)throw RangeError('Opaque depth size exceeds GPU texture limit');
   scene.updateMatrixWorld(true);camera.updateWorldMatrix(true,false);
   const excluded=new Set(exclude),selected=[],parts=[width,height,camera.far,...camera.matrixWorld.elements,...camera.projectionMatrix.elements,...camera.matrixWorldInverse.elements,renderer.localClippingEnabled];planesKey(parts,renderer.clippingPlanes);
   const visit=object=>{
    if(!object.visible||excluded.has(object)||object.userData.cloudVolume||object.userData.cloudOpaqueDepthExcluded)return;
    if(object.isMesh&&object.layers.test(camera.layers)){
     const sources=Array.isArray(object.material)?object.material:[object.material],visible=sources.map(eligible);
     if(visible.some(Boolean)){
      if(object.isSkinnedMesh||object.isInstancedMesh||object.isBatchedMesh||object.geometry.morphAttributes.position?.length)throw Error('Opaque cloud depth requires evaluated ordinary rigid mesh geometry');
      selected.push({object,sources,visible});const geometry=object.geometry;
      parts.push(identity(object),identity(geometry),...object.matrixWorld.elements,object.layers.mask,geometry.drawRange.start,geometry.drawRange.count);attributeKey(parts,geometry.index);
      const attributes=Object.keys(geometry.attributes).sort();parts.push(attributes.length);for(const name of attributes){parts.push(name);attributeKey(parts,geometry.attributes[name]);}
      parts.push(geometry.groups.length);for(const group of geometry.groups)parts.push(group.start,group.count,group.materialIndex);
      for(let i=0;i<sources.length;i++){
       const material=sources[i];parts.push(!!visible[i],identity(material));for(const field of depthFields)parts.push(material?.[field]);planesKey(parts,material?.clippingPlanes);
       for(const texture of [material?.map,material?.alphaMap,material?.displacementMap]){
        if(!texture){parts.push(0);continue;}
        parts.push(identity(texture),identity(texture.image),texture.version,texture.channel,texture.mapping,texture.matrixAutoUpdate,...texture.offset.toArray(),...texture.repeat.toArray(),texture.rotation,...texture.center.toArray());
        if(!texture.matrixAutoUpdate)parts.push(...texture.matrix.elements);
       }
      }
     }
    }
    for(const child of object.children)visit(child);
   };
   visit(scene);
   // Exact ordered identities and scalar inputs, without a hash. Generic
   // material.version is intentionally excluded: Three mutates it during
   // double-sided transparent draws even when depth inputs are unchanged.
   if(same(key,parts))return{texture:target.texture,revision,metadata,uniforms,glsl:cloudOpaqueDepthGLSL};
   const usedMeshes=new Set(),usedMaterials=new Set();stage.clear();let triangles=0;
   for(const {object,sources,visible}of selected){
    const materials=sources.map((source,i)=>{if(!visible[i])return skip;usedMaterials.add(source);return depthMaterial(source);});let mesh=wrappers.get(object);
    if(!mesh){mesh=new THREE.Mesh(object.geometry,materials[0]);mesh.matrixAutoUpdate=false;mesh.castShadow=false;mesh.receiveShadow=false;wrappers.set(object,mesh);}
    mesh.geometry=object.geometry;mesh.material=Array.isArray(object.material)?materials:materials[0];mesh.name=object.name;mesh.matrix.copy(object.matrixWorld);mesh.layers.mask=object.layers.mask;mesh.frustumCulled=object.frustumCulled;stage.add(mesh);usedMeshes.add(object);triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;
   }
   for(const object of wrappers.keys())if(!usedMeshes.has(object))wrappers.delete(object);
   for(const [source,row]of depthMaterials)if(!usedMaterials.has(source)){row.material.dispose();depthMaterials.delete(source);}
   uniforms.uCloudOpaqueView.value.copy(camera.matrixWorldInverse);uniforms.uCloudOpaqueRange.value=2*camera.far;
   const saved=saveRenderer(THREE,renderer);rendering=true;
   try{
    if(target.width!==width||target.height!==height)target.setSize(width,height);
    renderer.xr.enabled=false;renderer.shadowMap.enabled=false;renderer.shadowMap.autoUpdate=false;renderer.autoClear=true;renderer.autoClearColor=true;renderer.autoClearDepth=true;renderer.autoClearStencil=true;
    renderer.toneMapping=THREE.NoToneMapping;renderer.toneMappingExposure=1;renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
    renderer.setScissorTest(false);renderer.setClearColor(0xffffff,1);renderer.setRenderTarget(target);renderer.setViewport(0,0,width,height);renderer.clear();renderer.render(stage,camera);
    uniforms.uCloudOpaqueEnabled.value=1;key=parts;revision++;
    metadata={ready:true,revision,size:[width,height],samples:0,allocationLimits,encoding:'Native Three packDepthToRGBA(linear positive view Z/(2*actual camera.far))',rangeMetres:2*camera.far,sky:'Exact all-white RGBA sentinel; valid near/far values retain encoding headroom',sampling:'NEAREST, no tone/colour transform',colourBytes:width*height*4,depthRenderbufferBytesEstimate:width*height*4,opaqueMeshes:selected.length,opaqueTriangles:triangles,ownedDepthMaterials:depthMaterials.size,camera:{uuid:camera.uuid,type:camera.type,near:camera.near,far:camera.far,viewMatrix:camera.matrixWorldInverse.toArray(),projectionMatrix:camera.projectionMatrix.toArray()},mainSceneMaterialOrCastMutations:0,limits:['Ordinary rigid actual meshes and standard displacement/alpha cutouts are supported; shader-only vertex deformations require an evaluated geometry path.','Depth renderbuffer chooses nearest geometry at its hardware precision; linear RGBA avoids a second nonlinear-depth reconstruction error.','Lower-resolution silhouettes inherit the chosen cloud target pixel coverage; no arbitrary world-depth bias is added.','Actual GPU projection, alpha, cube/probe state, cost and full compositor integration require separate verification.']};
    return{texture:target.texture,revision,metadata,uniforms,glsl:cloudOpaqueDepthGLSL};
   }catch(error){key=null;uniforms.uCloudOpaqueEnabled.value=0;metadata={ready:false,revision,allocationLimits,error:String(error)};throw error;}
   finally{restoreRenderer(renderer,saved);rendering=false;}
  },
  dispose(){if(disposed)return;disposed=true;uniforms.uCloudOpaqueEnabled.value=0;target.dispose();skip.dispose();for(const {material}of depthMaterials.values())material.dispose();depthMaterials.clear();wrappers.clear();stage.clear();},
 };
 return api;
}
