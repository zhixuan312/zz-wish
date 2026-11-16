import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Static construction receives Cycles irradiance. Only the nearby visitor lamp
// adds direct realtime light, so its own vessel and closest surfaces keep moving shadows.
export async function loadBakedPlace(id,renderer,initialLight={n:1,g:0}){
  const base=`/places/${id}/`;
  const response=await fetch(base+'manifest.json',{cache:'no-cache'});
  if(!response.ok)throw new Error(`Cannot load ${id} manifest (${response.status})`);
  const manifest=await response.json();
  const versions=new Map((manifest.files??[]).map(file=>[file.uri,file.sha256]));
  const assetUrl=uri=>base+uri+(versions.get(uri)?`${uri.includes('?')?'&':'?'}v=${versions.get(uri)}`:'');
  const ktx=new KTX2Loader().setTranscoderPath('/codecs/basis/').detectSupport(renderer);
  const loader=new GLTFLoader().setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder);
  const ambientPasses=['night','dusk','day'];
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
    for(const pass of [...ambientPasses,'lamp']){
      if(!passes[pass]&&!manifest.partialPreview)throw new Error(`Incomplete final place: missing ${region}/${pass}`);
      regions[region][pass]={...(passes[pass]??passes.night),texture:empty,scale:(passes[pass]??passes.night).scale??1};
    }
  }
  let disposed=false,lastUpdate=performance.now();
  const pending={},ready={},retryAt={};
  const ensurePass=pass=>{
    if(ready[pass])return Promise.resolve();
    if(pending[pass])return pending[pass];
    pending[pass]=Promise.all(Object.values(regions).map(async maps=>{
      const item=maps[pass],texture=item.texture!==empty?item.texture:await ktx.loadAsync(assetUrl(item.uri));
      if(disposed){texture.dispose();return;}
      texture.colorSpace=THREE.NoColorSpace;texture.channel=2;texture.flipY=false;
      texture.anisotropy=Math.min(item.anisotropy??1,renderer.capabilities.getMaxAnisotropy());
      texture.needsUpdate=true;item.texture=texture;textures.add(texture);
    })).then(()=>{
      if(disposed)return;
      ready[pass]=true;
      for(const {maps,uniforms} of bindings)uniforms['uBaked'+pass[0].toUpperCase()+pass.slice(1)].value=maps[pass].texture;
    });
    return pending[pass];
  };
  const [gltf]=await Promise.all([loader.loadAsync(assetUrl(manifest.scene)),
    Promise.all(['lamp',...ambientPasses.filter((_,i)=>initialWeights.getComponent(i)>.0001)].map(ensurePass))]);
  const basis=manifest.lampBasis??{watts:45,position:[0,2.99,-.5],linearColor:[1,189/255,120/255]};
  const anchor=new THREE.Vector3(...(basis.position??manifest.lampAnchor));
  const uniforms={uBakedWeights:{value:initialWeights.clone()},uLampPower:{value:0},uBakedLampAnchor:{value:anchor}};
  const materials=new Set(),geometries=new Set();
  gltf.scene.traverse(object=>{
    if(!object.isMesh)return;
    const region=object.userData.lightmap_region??object.userData.region??object.parent?.userData.lightmap_region;
    const maps=regions[region];if(!maps)throw new Error(`Missing lightmaps for ${object.name} (${region})`);
    const uv=object.geometry.getAttribute('uv1');
    if(!uv)throw new Error(`Missing exported second UV set on ${object.name}`);
    // glTF TEXCOORD_1 is named uv1 by three.js 0.160. Keep an explicit uv2 alias
    // for the lightmap channel, leaving the first material UV untouched.
    object.geometry.setAttribute('uv2',uv);geometries.add(object.geometry);
    // Static occlusion is already in both ambient and lamp atlases. The live
    // shadow cube contains the moving lantern ribs, rather than rebaking the
    // entire court six times per frame.
    object.castShadow=false;object.receiveShadow=true;
    const convert=source=>{
      const material=source.clone();material.lightMap=empty;material.lightMapIntensity=1;material.envMapIntensity=.18;
      const perMaterial={...uniforms,
        uBakedNight:{value:maps.night.texture},uBakedDusk:{value:maps.dusk.texture},uBakedDay:{value:maps.day.texture},uBakedLamp:{value:maps.lamp.texture},
        uBakedIrradianceFactor:{value:manifest.bake?.threeLightMapIrradianceMultiplier??Math.PI},
        uBakedMinRoughness:{value:source.userData.one_light_min_roughness??0},
        uBakedScales:{value:new THREE.Vector4(maps.night.scale,maps.dusk.scale,maps.day.scale,maps.lamp.scale)},
        uBakedLogRange:{value:new THREE.Vector4(...['night','dusk','day','lamp'].map(p=>maps[p].logRange??0))},
        uBakedLogGain:{value:new THREE.Vector4(...['night','dusk','day','lamp'].map(p=>maps[p].logGain??16))}};
      bindings.push({maps,uniforms:perMaterial});
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,perMaterial);
        shader.vertexShader='varying vec3 vBakedWorld;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvBakedWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
        shader.fragmentShader=`varying vec3 vBakedWorld;
          uniform sampler2D uBakedNight,uBakedDusk,uBakedDay,uBakedLamp;
          uniform vec3 uBakedWeights,uBakedLampAnchor;uniform vec4 uBakedScales,uBakedLogRange,uBakedLogGain;uniform float uLampPower,uBakedIrradianceFactor,uBakedMinRoughness;
          vec3 decodeBaked(vec3 v,float scale,float range,float gain){return range>0.?(exp2(v*range)-1.)/gain:v*scale;}\n`+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=max(roughnessFactor,uBakedMinRoughness);');
        // The static moon and sky already exist in the bake. Preserve direct
        // point lights for the visitor's nearest surfaces without doubling them.
        const directCall='RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
        const staticLights=THREE.ShaderChunk.lights_fragment_begin
          .replace('getDirectionalLightInfo( directionalLight, directLight );','getDirectionalLightInfo( directionalLight, directLight ); directLight.color=vec3(0.);')
          .replace(directCall,`{vec3 diffuseBeforeVisitor=reflectedLight.directDiffuse;
            ${directCall}
            vec3 visitorView=(viewMatrix*vec4(uBakedLampAnchor,1.)).xyz;
            float isVisitor=1.-step(.08,distance(pointLight.position,visitorView));
            reflectedLight.directDiffuse=mix(diffuseBeforeVisitor,reflectedLight.directDiffuse,isVisitor*(1.-smoothstep(.7,1.8,distance(vBakedWorld,uBakedLampAnchor))));}`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',staticLights);
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',`
          #if defined(RE_IndirectDiffuse) && defined(USE_LIGHTMAP)
            vec3 baked=vec3(0.);
            if(uBakedWeights.x>.0001)baked+=decodeBaked(texture2D(uBakedNight,vLightMapUv).rgb,uBakedScales.x,uBakedLogRange.x,uBakedLogGain.x)*uBakedWeights.x;
            if(uBakedWeights.y>.0001)baked+=decodeBaked(texture2D(uBakedDusk,vLightMapUv).rgb,uBakedScales.y,uBakedLogRange.y,uBakedLogGain.y)*uBakedWeights.y;
            if(uBakedWeights.z>.0001)baked+=decodeBaked(texture2D(uBakedDay,vLightMapUv).rgb,uBakedScales.z,uBakedLogRange.z,uBakedLogGain.z)*uBakedWeights.z;
            float away=smoothstep(.7,1.8,distance(vBakedWorld,uBakedLampAnchor));
            float movingShade=1.;
            #if defined(USE_SHADOWMAP) && NUM_POINT_LIGHT_SHADOWS > 0
            if(uLampPower>.0001){
              PointLightShadow visitorShadow=pointLightShadows[0];
              float ribShadow=getPointShadow(pointShadowMap[0],visitorShadow.shadowMapSize,visitorShadow.shadowBias,visitorShadow.shadowRadius,vPointShadowCoord[0],visitorShadow.shadowCameraNear,visitorShadow.shadowCameraFar);
              float withinShadow=1.-smoothstep(visitorShadow.shadowCameraFar-1.,visitorShadow.shadowCameraFar,length(vPointShadowCoord[0].xyz));
              // Keep indirect lamp bounce while the ribs interrupt its direct spill.
              movingShade=mix(1.,mix(.65,1.,ribShadow),withinShadow);
            }
            #endif
            if(uLampPower>.0001)baked+=decodeBaked(texture2D(uBakedLamp,vLightMapUv).rgb,uBakedScales.w,uBakedLogRange.w,uBakedLogGain.w)*uLampPower*away*movingShade;
            irradiance=baked*uBakedIrradianceFactor;
          #endif
          #if defined(USE_ENVMAP) && defined(RE_IndirectSpecular)
            radiance+=getIBLRadiance(geometryViewDir,geometryNormal,material.roughness);
          #endif`);
      };
      material.customProgramCacheKey=()=>`cycles-lightmap-1-${region}`;
      materials.add(material);for(const value of Object.values(material))if(value?.isTexture){if(value!==material.lightMap)value.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.add(value);}
      return material;
    };
    object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);
  });
  for(const maps of Object.values(regions))for(const pass of Object.values(maps))textures.add(pass.texture);
  return{
    group:gltf.scene,manifest,
    lightingState(){return {weights:uniforms.uBakedWeights.value.toArray(),residentPasses:Object.keys(ready).filter(pass=>ready[pass]),pendingPasses:Object.keys(pending).filter(pass=>pending[pass]&&!ready[pass]),loadedPasses:[...ambientPasses,'lamp'].filter(pass=>Object.values(regions).every(maps=>maps[pass].texture!==empty))};},
    lampCandela:basis.watts/(4*Math.PI),lampColor:new THREE.Color().fromArray(basis.linearColor),
    fixturePower(){const w=uniforms.uBakedWeights.value,p=manifest.bake?.presets;return w.x*(p?.night.fixtures??1)+w.y*(p?.dusk.fixtures??.8)+w.z*(p?.day.fixtures??.12);},
    update(light,lampPower,lampPosition){
      if(lampPosition)uniforms.uBakedLampAnchor.value.copy(lampPosition);
      const requested=weightsFor(light),wanted=requested.clone(),now=performance.now(),dt=Math.min(.25,(now-lastUpdate)/1000);lastUpdate=now;
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
    dispose(){disposed=true;for(const m of materials)m.dispose();for(const g of geometries)g.dispose();for(const t of textures)t.dispose();ktx.dispose();},
  };
}
