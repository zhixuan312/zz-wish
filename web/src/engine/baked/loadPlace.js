import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { readBakedManifest,readBakedAsset } from './prefetchPlace.js';
import { createVisitorShadow } from './visitorShadow.js';
import { createGauzeTransmission } from './gauzeTransmission.js';
import { createStaticLampShadow } from './staticLampShadow.js';
import { readPineWalkLightmaps } from './pineManifest.js';
import { readSnowCourtWalkLightmaps } from './snowCourtManifest.js';

// The scene renderer outlives the places. Share its transcoder pool, including
// the compiled Basis decoder, across the cover, the selected place and previews.
const renderTranscoders = new WeakMap();
function textureTranscoder(renderer) {
  let transcoder = renderTranscoders.get(renderer);
  if (!transcoder) {
    transcoder = new KTX2Loader().setTranscoderPath('/codecs/basis/').detectSupport(renderer);
    renderTranscoders.set(renderer, transcoder);
  }
  return transcoder;
}

// Static construction receives Cycles irradiance. Only the nearby visitor lamp
// adds direct realtime light, so its own vessel and closest surfaces keep moving shadows.
export async function loadBakedPlace(id,renderer,initialLight={n:1,g:0}){
  const base=`/places/${id}/`;
  const manifest=await readBakedManifest(id);
  const walkLightmaps=id==='pine-gate'?readPineWalkLightmaps(manifest)
    :id==='snow-roof'?readSnowCourtWalkLightmaps(manifest):null;
  const versions=new Map((manifest.files??[]).map(file=>[file.uri,file.sha256]));
  const assetUrl=uri=>base+uri+(versions.get(uri)?`${uri.includes('?')?'&':'?'}v=${versions.get(uri)}`:'');
  const verifyBytes=uri=>{
    const file=manifest.files.find(file=>file.uri===uri);
    if(!file)throw new Error(`Undeclared ${id} asset ${uri}`);
    return readBakedAsset(id,file);
  };
  const verified=async uri=>{await verifyBytes(uri);return assetUrl(uri);};
  const ktx=textureTranscoder(renderer);
  const loader=new GLTFLoader().setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder);
  const ambientPasses=['night','dusk','day'];
  const allPasses=[...ambientPasses,'lamp'];
  const weightsFor=light=>{
    const dusk=Math.max(0,Math.min(1,light.g??0)),night=Math.max(0,Math.min(1,light.n??1));
    const d=dusk*(1-night*.35),n=night*(1-d),day=(1-night)*(1-d);
    return new THREE.Vector3(n,d,day).divideScalar(Math.max(.0001,n+d+day));
  };
  const initialWeights=weightsFor(initialLight),regions={},textures=new Set(),bindings=[];
  // The lightMap slot enables UV2; unneeded ambient samplers share this tiny
  // placeholder so inactive time-of-day atlases never allocate GPU storage.
  const empty=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);
  empty.channel=2;empty.colorSpace=THREE.NoColorSpace;empty.needsUpdate=true;textures.add(empty);
  for(const [region,passes] of Object.entries(manifest.lightmaps)){
    for(const pass of ['night','lamp'])if(!passes[pass])throw new Error(`Missing ${region}/${pass} lightmap`);
    regions[region]={};
    for(const pass of allPasses){
      if(!passes[pass]&&!manifest.partialPreview)throw new Error(`Incomplete final place: missing ${region}/${pass}`);
      const soft=walkLightmaps?.[region]?.[pass].soft;
      regions[region][pass]={...(passes[pass]??passes.night),texture:empty,scale:(passes[pass]??passes.night).scale??1,
        ...(soft?{soft,native:false}:{})};
    }
  }
  let disposed=false,lastUpdate=performance.now();
  const imageBitmaps=new Set();
  async function loadOwnedKtx(bytes){
    // The worker transfers its input buffer. Retain the verified bytes for
    // later visits and give the current place ownership of its texture.
    const url=URL.createObjectURL(new Blob([bytes],{type:'image/ktx2'}));
    try{return await ktx.loadAsync(url);}
    finally{THREE.Cache.remove(url);URL.revokeObjectURL(url);}
  }
  const loadTexture=async uri=>{
    if(uri.endsWith('.ktx2')){
      const {astcSupported,etc2Supported,dxtSupported,bptcSupported,pvrtcSupported}=ktx.workerConfig;
      const bytes=await verifyBytes(uri);
      const uastc=new DataView(bytes).getUint32(44,true)===2;
      if(!(uastc&&astcSupported)&&!etc2Supported&&!dxtSupported&&!bptcSupported&&!pvrtcSupported){
        throw new Error(`GPU compression unavailable for ${uri}`);
      }
      const texture=await loadOwnedKtx(bytes);
      if(disposed||!texture.isCompressedTexture||texture.format===THREE.RGBAFormat){
        texture.dispose();
        throw new Error(`GPU compression unavailable for ${uri}`);
      }
      texture.name=uri;texture.colorSpace=THREE.NoColorSpace;textures.add(texture);
      return texture;
    }
    const fileType=uri.endsWith('.webp')?'image/webp':uri.endsWith('.png')?'image/png':null;
    if(!fileType)throw new Error(`Unsupported ${id} image ${uri}`);
    const bytes=await verifyBytes(uri);
    // Match a Three Texture's usual bottom-up UVs. Ignore the file's color
    // profile and keep independent RGB and alpha for shader-decoded data.
    const bitmap=await createImageBitmap(new Blob([bytes],{type:fileType}),{
      imageOrientation:'flipY',colorSpaceConversion:'none',premultiplyAlpha:'none',
    });
    if(disposed){bitmap.close();throw new Error(`Disposed ${id} while loading ${uri}`);}
    const texture=new THREE.Texture(bitmap);
    texture.name=uri;texture.colorSpace=THREE.NoColorSpace;texture.needsUpdate=true;
    imageBitmaps.add(bitmap);textures.add(texture);
    return texture;
  };
  const disposeTexture=texture=>{
    if(!textures.delete(texture))return;
    texture.dispose();
    if(imageBitmaps.delete(texture.image))texture.image.close();
  };
  const pending={},ready={},retryAt={};
  const verifiedDetail=new Set();
  const detailPending=new Map(),detailFadeStart=new Map();
  const detailMix={value:new THREE.Vector4(1,1,1,1)};
  let walkLightmapRequest;
  function updateSampler(pass){
    const uniform='uBaked'+pass[0].toUpperCase()+pass.slice(1);
    for(const {maps,uniforms} of bindings)uniforms[uniform].value=maps[pass].texture;
  }
  async function loadLightmap(item,uri){
    const texture=item.soft?await loadOwnedKtx(await verifyBytes(uri)):await ktx.loadAsync(await verified(uri));
    const expectedLevels=uri===item.soft?.uri?1:item.mipLevels;
    if(item.soft&&texture.mipmaps.length!==expectedLevels){
      texture.dispose();
      throw new Error(`Invalid ${id==='pine-gate'?'Pine Gate':'Snow Roof'} lightmap mip chain: ${uri}`);
    }
    texture.name=uri;
    texture.colorSpace=THREE.NoColorSpace;texture.channel=2;texture.flipY=false;
    texture.anisotropy=Math.min(item.anisotropy??1,renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate=true;
    return texture;
  }
  function upgradePass(pass){
    if(disposed||!ready[pass]||!verifiedDetail.has(pass))return;
    if(detailPending.has(pass))return detailPending.get(pass);
    const items=Object.values(regions).map(maps=>maps[pass]).filter(item=>item.soft&&!item.native);
    if(!items.length)return;
    const request=Promise.allSettled(items.map(item=>loadLightmap(item,item.uri))).then(results=>{
      if(disposed||results.some(result=>result.status==='rejected')){
        for(const result of results)if(result.status==='fulfilled')result.value.dispose();
        return false;
      }
      // Upload before rebinding. Native mip2 is the same set of blocks that
      // the standalone coarse map used, so one sampler can fade in detail.
      try{
        if(ready[pass])for(const result of results)renderer.initTexture(result.value);
      }catch{
        for(const result of results)result.value.dispose();
        return false;
      }
      for(const [index,item] of items.entries()){
        disposeTexture(item.texture);
        item.texture=results[index].value;
        item.native=true;
        textures.add(item.texture);
      }
      if(ready[pass]){
        detailMix.value.setComponent(allPasses.indexOf(pass),0);
        detailFadeStart.set(pass,performance.now());
        updateSampler(pass);
      }
      return true;
    }).finally(()=>detailPending.delete(pass));
    detailPending.set(pass,request);
    return request;
  }
  function startWalkLightmaps(){
    if(disposed||!walkLightmaps)return;
    if(!walkLightmapRequest)walkLightmapRequest=Promise.all(allPasses.map(async pass=>{
      try{
        await Promise.all(Object.values(walkLightmaps).map(maps=>verifyBytes(maps[pass].full.uri)));
        if(disposed)return false;
        verifiedDetail.add(pass);
        return await upgradePass(pass)!==false;
      }catch{return false;}
    })).then(results=>{
      const complete=results.every(Boolean);
      if(!complete)walkLightmapRequest=null;
      return complete;
    });
    return walkLightmapRequest;
  }
  const ensurePass=pass=>{
    if(ready[pass])return Promise.resolve();
    if(pending[pass])return pending[pass];
    pending[pass]=Promise.all(Object.values(regions).map(async maps=>{
      const item=maps[pass];
      let uri=item.soft&&!verifiedDetail.has(pass)?item.soft.uri:item.uri;
      let texture=item.texture;
      if(texture===empty){
        try{texture=await loadLightmap(item,uri);}
        catch(error){
          if(disposed||!item.soft||uri===item.soft.uri)throw error;
          uri=item.soft.uri;
          texture=await loadLightmap(item,uri);
        }
      }
      if(disposed){texture.dispose();return;}
      if(item.soft&&item.texture===empty)item.native=uri===item.uri;
      texture.needsUpdate=true;item.texture=texture;textures.add(texture);
    })).then(()=>{
      if(disposed)return;
      ready[pass]=true;
      updateSampler(pass);
      upgradePass(pass);
    });
    return pending[pass];
  };
  const heroEntries=Object.entries(manifest.heroes??{});
  const [gltf,,heroFiles]=await Promise.all([verified(manifest.scene).then(url=>loader.loadAsync(url)),
    Promise.all(['lamp',...ambientPasses.filter((_,i)=>initialWeights.getComponent(i)>.0001)].map(ensurePass)),
    Promise.all(heroEntries.map(async([name,metadata])=>({name,metadata,gltf:await loader.loadAsync(await verified(metadata.uri))}))) ]);
  const basis=manifest.lampBasis??{watts:45,position:[0,2.99,-.5],linearColor:[1,189/255,120/255]};
  const cameraPreExposure=manifest.bake?.cameraPreExposure??1;
  if(!Number.isFinite(cameraPreExposure)||cameraPreExposure<=0)throw new Error('Invalid authored camera pre-exposure');
  const savedView=gltf.scene.userData.one_light_source_view_settings;
  const sourceView=typeof savedView==='string'?JSON.parse(savedView):savedView;
  const residualCameraExposureEV=manifest.bake?.residualCameraExposureEV??Math.round(((sourceView?.exposure??Math.log2(cameraPreExposure))-Math.log2(cameraPreExposure))*1e6)/1e6;
  if(!Number.isFinite(residualCameraExposureEV))throw Error('Invalid authored residual camera exposure');
  const anchor=new THREE.Vector3(...(basis.position??manifest.lampAnchor));
  const indirectLamp=manifest.bake?.lampPassQuantity==='indirect-diffuse-radiance-per-unit-albedo';
  const movingNicheLight = id === 'pine-gate';
  const staticLampShadow=indirectLamp&&!movingNicheLight?createStaticLampShadow({lightWorld:anchor,sourceRadius:basis.pointRadiusMetres,resolution:512,near:.008,far:80}):null;
  const uniforms={uBakedWeights:{value:initialWeights.clone()},uLampPower:{value:0},uBakedLampAnchor:{value:anchor}};
  const visitorShadow=id==='snow-roof'?createVisitorShadow({lightWorld:anchor,sourceRadius:basis.pointRadiusMetres??0}):null;
  const gauzeTransmission=id==='snow-roof'&&basis.transport?.type==='actual-gauze'&&basis.transport.version===1?createGauzeTransmission():null;
  const materials=new Set(),geometries=new Set();
  const heroes={};
  for(const {name,metadata,gltf:hero} of heroFiles){
    hero.scene.userData.hero=metadata;
    hero.scene.userData.one_light_dynamic=true;
    hero.scene.traverse(object=>{
      if(!object.isMesh)return;
      geometries.add(object.geometry);
      const sourceMaterials=Array.isArray(object.material)?object.material:[object.material];
      // Thin glass transmits the lamp instead of becoming an opaque cube-map
      // shadow caster. Brass, wood and wax retain real moving shadows.
      const transmits=sourceMaterials.some(material=>material.transparent||material.transmission>0);
      object.castShadow=!transmits;object.receiveShadow=true;
      if(transmits)object.userData.cast=false;
      for(const material of sourceMaterials){
        materials.add(material);
        for(const value of Object.values(material))if(value?.isTexture){
          value.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.add(value);
        }
      }
    });
    heroes[name]=hero.scene;
  }
  gltf.scene.traverse(object=>{
    if(!object.isMesh)return;
    const region=object.userData.lightmap_region??object.userData.region??object.parent?.userData.lightmap_region;
    const maps=regions[region];if(!maps)throw new Error(`Missing lightmaps for ${object.name} (${region})`);
    const walkRegion=!!walkLightmaps?.[region];
    const shelteredNiche = movingNicheLight && region === 'niche';
    const uv=object.geometry.getAttribute('uv1');
    if(!uv)throw new Error(`Missing exported second UV set on ${object.name}`);
    // glTF TEXCOORD_1 is named uv1 by three.js 0.160. Keep an explicit uv2 alias
    // for the lightmap channel, leaving the first material UV untouched.
    object.geometry.setAttribute('uv2',uv);geometries.add(object.geometry);
    // Static occlusion is already in both ambient and lamp atlases. The live
    // shadow cube contains the moving lantern ribs, rather than rebaking the
    // entire court six times per frame.
    // Pine Gate's light follows the melting wick. Cast from the nearby stone
    // only, keeping the large approach and gate out of the live shadow map.
    object.castShadow = movingNicheLight && region === 'niche';
    object.receiveShadow = true;
    const convert=source=>{
      const spentWax = shelteredNiche && /^Weathered cold wax tone [1-4]$/.test(source.name);
      const cooledWax = spentWax || (shelteredNiche && source.name === 'Wax of the two remaining short candles');
      const material=source.clone();material.lightMap=empty;material.lightMapIntensity=1;material.envMapIntensity=.18;
      const perMaterial={...uniforms,
        uBakedNight:{value:maps.night.texture},uBakedDusk:{value:maps.dusk.texture},uBakedDay:{value:maps.day.texture},uBakedLamp:{value:maps.lamp.texture},
        uBakedIrradianceFactor:{value:manifest.bake?.threeLightMapIrradianceMultiplier??Math.PI},
        uBakedMinRoughness:{value:source.userData.one_light_min_roughness??0},
        uBakedWaxSill:{value:manifest.lampAnchor?.[1]??anchor.y},
        uBakedScales:{value:new THREE.Vector4(maps.night.scale,maps.dusk.scale,maps.day.scale,maps.lamp.scale)},
        uBakedLogRange:{value:new THREE.Vector4(...['night','dusk','day','lamp'].map(p=>maps[p].logRange??0))},
        uBakedLogGain:{value:new THREE.Vector4(...allPasses.map(p=>maps[p].logGain??16))},
        ...(walkRegion?{uBakedWalkMix:detailMix}:{})};
      bindings.push({maps,uniforms:perMaterial});
      if(material.emissive)material.emissiveIntensity*=cameraPreExposure;
      material.onBeforeCompile=shader=>{
        const decoded=(sample,map,uv,scale,range,gain,mix)=>{
          const native=`decodeBaked(${sample}.rgb,${scale},${range},${gain})`;
          return walkRegion?`blendWalkMip(${native},${map},${uv},${scale},${range},${gain},${mix})`:native;
        };
        const ambient=(pass,component)=>`ambientSample(uBaked${pass},vLightMapUv,uBakedScales.${component},uBakedLogRange.${component},uBakedLogGain.${component}${walkRegion?`,uBakedWalkMix.${component}`:''})`;
        Object.assign(shader.uniforms,perMaterial);
        shader.vertexShader='varying vec3 vBakedWorld;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvBakedWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
        shader.fragmentShader=`varying vec3 vBakedWorld;
          uniform sampler2D uBakedNight,uBakedDusk,uBakedDay,uBakedLamp;
          uniform vec3 uBakedWeights,uBakedLampAnchor;uniform vec4 uBakedScales,uBakedLogRange,uBakedLogGain;uniform float uLampPower,uBakedIrradianceFactor,uBakedMinRoughness,uBakedWaxSill;
          vec3 decodeBaked(vec3 v,float scale,float range,float gain){return range>0.?(exp2(v*range)-1.)/gain:v*scale;}
          ${walkRegion?`uniform vec4 uBakedWalkMix;
          vec3 blendWalkMip(vec3 refined, sampler2D map, vec2 uv, float scale, float range, float gain, float fade){
            if(fade>=1.)return refined;
            vec3 coarse=decodeBaked(textureLod(map,uv,2.).rgb,scale,range,gain);
            return mix(coarse,refined,fade);
          }`:''}
          vec3 ambientSample(sampler2D map,vec2 uv,float scale,float range,float gain${walkRegion?',float fade':''}){
            vec3 surface=${decoded('texture2D(map,uv)','map','uv','scale','range','gain','fade')};
            ${cooledWax ? `
            // The wax redistributes local ambient light. Leave the low film
            // against the sill and the separate live flame response intact.
            float depth=smoothstep(.0015,.0045,vBakedWorld.y-uBakedWaxSill);
            vec3 scattered=${decoded('textureLod(map,uv,1.)','map','uv','scale','range','gain','fade')};
            return mix(surface,scattered,depth*vec3(.74,.65,.56));` : 'return surface;'}
          }
          ${spentWax ? `
          float pineWaxGrain(vec2 p) {
            vec2 cell = floor(p);
            vec2 t = fract(p);
            t = t * t * (3.0 - 2.0 * t);
            vec4 x = vec4(cell.x, cell.x + 1.0, cell.x, cell.x + 1.0);
            vec4 y = vec4(cell.y, cell.y, cell.y + 1.0, cell.y + 1.0);
            vec4 n = fract(sin(x * 127.1 + y * 311.7) * 43758.5453);
            return mix(mix(n.x, n.y, t.x), mix(n.z, n.w, t.x), t.y);
          }` : ''}\n`+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=max(roughnessFactor,uBakedMinRoughness);');
        if (spentWax) shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',`
          // Broad oxidation varies between the remnants. Loose ash settles on upward faces.
          vec2 waxPosition = vBakedWorld.xz;
          float waxAge = smoothstep(.26, .75, pineWaxGrain(waxPosition * 52.0 + 11.0));
          float waxHeight = max(0.0, vBakedWorld.y - uBakedWaxSill);
          float waxUp = smoothstep(.28, .88, dot(nonPerturbedNormal, viewMatrix[1].xyz));
          float waxMottle = pineWaxGrain(waxPosition * 215.0 + 28.0);
          float waxFleck = pineWaxGrain(waxPosition * 570.0 + 42.0);
          float waxAsh = waxUp * smoothstep(.43, .81, waxMottle)
            * mix(.63, 1.0, waxFleck);
          float waxDust = (1.0 - smoothstep(.001, .005, waxHeight))
            * smoothstep(.33, .81, waxFleck);
          vec3 waxPatina = mix(vec3(.98, .90, .72), vec3(.72, .52, .28), waxAge);
          diffuseColor.rgb *= mix(waxPatina, vec3(.34, .31, .28), waxAsh * .87);
          diffuseColor.rgb *= mix(vec3(1.0), vec3(.78, .74, .67), waxDust * .65);
          roughnessFactor = mix(roughnessFactor, .88, max(waxAsh, waxDust * .58));
          #include <lights_physical_fragment>`);
        // The static moon and sky already exist in the bake. Preserve direct
        // point lights for the visitor's nearest surfaces without doubling them.
        const directCall='RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
        const nicheFalloff = movingNicheLight ? `
            float lightDistance = length(pointLight.position - geometryPosition);
            float stoneSpill = .72 * (1. - smoothstep(.065, .205, lightDistance));
            directLight.color *= mix(1., stoneSpill, isVisitor);` : '';
        const staticLights=THREE.ShaderChunk.lights_fragment_begin
          .replace('getDirectionalLightInfo( directionalLight, directLight );','getDirectionalLightInfo( directionalLight, directLight ); directLight.color=vec3(0.);')
          .replace(directCall,`{vec3 diffuseBeforeVisitor=reflectedLight.directDiffuse;
            vec3 visitorView=(viewMatrix*vec4(uBakedLampAnchor,1.)).xyz;
            float isVisitor=1.-step(.08,distance(pointLight.position,visitorView));${nicheFalloff}
            ${directCall}
            reflectedLight.directDiffuse=mix(diffuseBeforeVisitor,reflectedLight.directDiffuse,isVisitor*${indirectLamp?'1.':'(1.-smoothstep(.7,1.8,distance(vBakedWorld,uBakedLampAnchor)))'});}`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',staticLights);
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',`
          #if defined(RE_IndirectDiffuse) && defined(USE_LIGHTMAP)
            vec3 baked=vec3(0.);
            if(uBakedWeights.x>.0001)baked+=${ambient('Night','x')}*uBakedWeights.x${shelteredNiche ? ' * .55' : ''};
            if(uBakedWeights.y>.0001)baked+=${ambient('Dusk','y')}*uBakedWeights.y${shelteredNiche ? ' * .78' : ''};
            if(uBakedWeights.z>.0001)baked+=${ambient('Day','z')}*uBakedWeights.z;
            float away=${movingNicheLight
              ? '.58 * (1. - smoothstep(.095, .275, distance(vBakedWorld,uBakedLampAnchor)))'
              : indirectLamp?'1.':'smoothstep(.7,1.8,distance(vBakedWorld,uBakedLampAnchor))'};
            float movingShade=1.;
            #if defined(USE_SHADOWMAP) && NUM_POINT_LIGHT_SHADOWS > 0
            if(uLampPower>.0001${indirectLamp?'&&false':''}){
              PointLightShadow visitorShadow=pointLightShadows[0];
              float ribShadow=getPointShadow(pointShadowMap[0],visitorShadow.shadowMapSize,visitorShadow.shadowBias,visitorShadow.shadowRadius,vPointShadowCoord[0],visitorShadow.shadowCameraNear,visitorShadow.shadowCameraFar);
              float withinShadow=1.-smoothstep(visitorShadow.shadowCameraFar-1.,visitorShadow.shadowCameraFar,length(vPointShadowCoord[0].xyz));
              // Keep indirect lamp bounce while the ribs interrupt its direct spill.
              movingShade=mix(1.,mix(.65,1.,ribShadow),withinShadow);
            }
            #endif
            if(uLampPower>.0001)baked+=${decoded('texture2D(uBakedLamp,vLightMapUv)','uBakedLamp','vLightMapUv','uBakedScales.w','uBakedLogRange.w','uBakedLogGain.w','uBakedWalkMix.w')}*uLampPower*away*movingShade;
            irradiance=baked*uBakedIrradianceFactor;
          #endif
          #if defined(USE_ENVMAP) && defined(RE_IndirectSpecular)
            radiance+=getIBLRadiance(geometryViewDir,geometryNormal,material.roughness);
          #endif`);
      };
      material.customProgramCacheKey=()=>`${movingNicheLight ? 'pine-lightmap' : 'cycles-lightmap-1'}-${region}${spentWax ? '-spent-wax' : cooledWax ? '-wax' : ''}${walkRegion?'-walk-mip':''}`;
      visitorShadow?.install(material);
      gauzeTransmission?.install(material);
      staticLampShadow?.install(material);
      materials.add(material);for(const value of Object.values(material))if(value?.isTexture){if(value!==material.lightMap)value.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.add(value);}
      return material;
    };
    object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);
  });
  async function loadDetailModel(uri) {
    const { scene } = await loader.loadAsync(await verified(uri));
    const details = { geometries: new Set(), materials: new Set(), textures: new Set() };
    scene.traverse(object => {
      if (!object.isMesh) return;
      details.geometries.add(object.geometry);
      for (const material of [object.material].flat()) {
        details.materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) details.textures.add(value);
      }
    });
    if (disposed) {
      for (const items of Object.values(details)) for (const item of items) item.dispose();
      return null;
    }
    for (const geometry of details.geometries) geometries.add(geometry);
    for (const material of details.materials) materials.add(material);
    for (const texture of details.textures) textures.add(texture);
    return scene;
  }
  for(const maps of Object.values(regions))for(const pass of Object.values(maps))textures.add(pass.texture);
  return{
    group:gltf.scene,manifest,heroes,visitorShadow,gauzeTransmission,staticLampShadow,cameraPreExposure,residualCameraExposureEV,loadTexture,disposeTexture,loadDetailModel,startWalkLightmaps,
    lightingState(){return {weights:uniforms.uBakedWeights.value.toArray(),residentPasses:Object.keys(ready).filter(pass=>ready[pass]),pendingPasses:Object.keys(pending).filter(pass=>pending[pass]&&!ready[pass]),loadedPasses:allPasses.filter(pass=>Object.values(regions).every(maps=>maps[pass].texture!==empty)),
      ...(walkLightmaps?{walkLightmaps:{available:allPasses.filter(pass=>verifiedDetail.has(pass)),
        native:allPasses.filter(pass=>Object.keys(walkLightmaps).every(region=>regions[region][pass].native)),
        mix:detailMix.value.toArray()}}:{})};},
    // Historical name: pre-exposed radiant intensity in engine units; no lm/cd calibration.
    lampCandela:basis.watts*cameraPreExposure/(4*Math.PI),lampColor:new THREE.Color().fromArray(basis.linearColor),
    fixturePower(){const w=uniforms.uBakedWeights.value,p=manifest.bake?.presets;return w.x*(p?.night.fixtures??1)+w.y*(p?.dusk.fixtures??.8)+w.z*(p?.day.fixtures??.12);},
    update(light,lampPower,lampPosition){
      if(lampPosition)uniforms.uBakedLampAnchor.value.copy(lampPosition);
      const requested=weightsFor(light),wanted=requested.clone(),now=performance.now(),dt=Math.min(.25,(now-lastUpdate)/1000);lastUpdate=now;
      for(const [pass,start] of detailFadeStart){
        const mix=THREE.MathUtils.smoothstep(now,start,start+800);
        detailMix.value.setComponent(allPasses.indexOf(pass),mix);
        if(mix===1)detailFadeStart.delete(pass);
      }
      ambientPasses.forEach((pass,i)=>{
        const weight=wanted.getComponent(i);
        if(weight>.0001&&!ready[pass]&&!pending[pass]&&now>=(retryAt[pass]??0))ensurePass(pass).catch(error=>{
          pending[pass]=null;retryAt[pass]=performance.now()+30000;
          console.warn(`Keeping the current ${id} lighting while ${pass} is unavailable.`,error);
        });
        if(!ready[pass])wanted.setComponent(i,0);
      });
      const total=wanted.x+wanted.y+wanted.z;
      if(total>.0001){
        wanted.divideScalar(total);
        uniforms.uBakedWeights.value.lerp(wanted,1-Math.exp(-dt*4));
        if(uniforms.uBakedWeights.value.distanceToSquared(wanted)<1e-12)uniforms.uBakedWeights.value.copy(wanted);
      }
      // Preserve the last illuminated look until a newly requested look is ready.
      // Detached samplers release GPU storage; compressed CPU images can return
      // without another network request.
      ambientPasses.forEach((pass,i)=>{
        if(requested.getComponent(i)<=.0001&&uniforms.uBakedWeights.value.getComponent(i)<=.0001&&ready[pass]){
          for(const {uniforms:binding} of bindings)binding['uBaked'+pass[0].toUpperCase()+pass.slice(1)].value=empty;
          for(const maps of Object.values(regions))maps[pass].texture.dispose();
          ready[pass]=false;pending[pass]=null;uniforms.uBakedWeights.value.setComponent(i,0);
        }
      });
      uniforms.uBakedWeights.value.divideScalar(Math.max(.0001,uniforms.uBakedWeights.value.manhattanLength()));
      uniforms.uLampPower.value=Math.max(0,lampPower);
    },
    dispose(){disposed=true;staticLampShadow?.dispose();gauzeTransmission?.dispose();for(const m of materials)m.dispose();for(const g of geometries)g.dispose();for(const t of textures)t.dispose();for(const bitmap of imageBitmaps)bitmap.close();},
  };
}
