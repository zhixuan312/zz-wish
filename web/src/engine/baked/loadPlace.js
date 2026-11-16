import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Static construction receives Cycles irradiance. Only the nearby visitor lamp
// adds direct realtime light, so its own vessel and closest surfaces keep moving shadows.
export async function loadBakedPlace(id,renderer){
  const base=`/places/${id}/`;
  const response=await fetch(base+'manifest.json');
  if(!response.ok)throw new Error(`Cannot load ${id} manifest (${response.status})`);
  const manifest=await response.json();
  const ktx=new KTX2Loader().setTranscoderPath('/codecs/basis/').detectSupport(renderer);
  const loader=new GLTFLoader().setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder);
  const regions={};
  await Promise.all(Object.entries(manifest.lightmaps).map(async([region,passes])=>{
    const entries=await Promise.all(Object.entries(passes).map(async([pass,item])=>{
      const texture=await ktx.loadAsync(base+item.uri);texture.colorSpace=THREE.NoColorSpace;texture.channel=2;texture.flipY=false;
      return[pass,{texture,scale:item.scale??1}];
    }));regions[region]=Object.fromEntries(entries);
  }));
  const gltf=await loader.loadAsync(base+manifest.scene);
  const basis=manifest.lampBasis??{watts:45,position:[0,2.99,-.5],linearColor:[1,189/255,120/255]};
  const anchor=new THREE.Vector3(...(basis.position??manifest.lampAnchor));
  const uniforms={uBakedWeights:{value:new THREE.Vector3(1,0,0)},uLampPower:{value:0},uBakedLampAnchor:{value:anchor}};
  const materials=new Set(),geometries=new Set(),textures=new Set();
  gltf.scene.traverse(object=>{
    if(!object.isMesh)return;
    const region=object.userData.lightmap_region??object.userData.region??object.parent?.userData.lightmap_region;
    const maps=regions[region];if(!maps)throw new Error(`Missing lightmaps for ${object.name} (${region})`);
    const uv=object.geometry.getAttribute('uv1');
    if(!uv)throw new Error(`Missing exported second UV set on ${object.name}`);
    // glTF TEXCOORD_1 is named uv1 by three.js 0.160. Keep an explicit uv2 alias
    // for the lightmap channel, leaving the first material UV untouched.
    object.geometry.setAttribute('uv2',uv);geometries.add(object.geometry);
    object.castShadow=true;object.receiveShadow=true;
    const convert=source=>{
      const material=source.clone();material.lightMap=maps.night.texture;material.lightMapIntensity=1;material.envMapIntensity=.18;
      const perMaterial={...uniforms,
        uBakedNight:{value:maps.night.texture},uBakedDusk:{value:maps.dusk.texture},uBakedDay:{value:maps.day.texture},uBakedLamp:{value:maps.lamp.texture},
        uBakedIrradianceFactor:{value:manifest.bake?.threeLightMapIrradianceMultiplier??Math.PI},
        uBakedScales:{value:new THREE.Vector4(maps.night.scale,maps.dusk.scale,maps.day.scale,maps.lamp.scale)}};
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,perMaterial);
        shader.vertexShader='varying vec3 vBakedWorld;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvBakedWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
        shader.fragmentShader=`varying vec3 vBakedWorld;
          uniform sampler2D uBakedNight,uBakedDusk,uBakedDay,uBakedLamp;
          uniform vec3 uBakedWeights,uBakedLampAnchor;uniform vec4 uBakedScales;uniform float uLampPower,uBakedIrradianceFactor;\n`+shader.fragmentShader;
        // The static moon and sky already exist in the bake. Preserve direct
        // point lights for the visitor's nearest surfaces without doubling them.
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );','getDirectionalLightInfo( directionalLight, directLight ); directLight.color=vec3(0.);').replace('getPointLightInfo( pointLight, geometryPosition, directLight );','getPointLightInfo( pointLight, geometryPosition, directLight ); directLight.color*=1.-smoothstep(.7,1.8,distance(vBakedWorld,uBakedLampAnchor));'));
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',`
          #if defined(RE_IndirectDiffuse) && defined(USE_LIGHTMAP)
            vec3 baked=texture2D(uBakedNight,vLightMapUv).rgb*uBakedScales.x*uBakedWeights.x
              +texture2D(uBakedDusk,vLightMapUv).rgb*uBakedScales.y*uBakedWeights.y
              +texture2D(uBakedDay,vLightMapUv).rgb*uBakedScales.z*uBakedWeights.z;
            float away=smoothstep(.7,1.8,distance(vBakedWorld,uBakedLampAnchor));
            baked+=texture2D(uBakedLamp,vLightMapUv).rgb*uBakedScales.w*uLampPower*away;
            irradiance=baked*uBakedIrradianceFactor;
          #endif
          #if defined(USE_ENVMAP) && defined(RE_IndirectSpecular)
            radiance+=getIBLRadiance(geometryViewDir,geometryNormal,material.roughness);
          #endif`);
      };
      material.customProgramCacheKey=()=>`cycles-lightmap-1-${region}`;
      materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
      return material;
    };
    object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);
  });
  for(const maps of Object.values(regions))for(const pass of Object.values(maps))textures.add(pass.texture);
  return{
    group:gltf.scene,manifest,
    lampCandela:basis.watts/(4*Math.PI),lampColor:new THREE.Color().fromArray(basis.linearColor),
    update(light,lampPower,lampPosition){
      if(lampPosition)uniforms.uBakedLampAnchor.value.copy(lampPosition);
      const dusk=Math.min(1,light.g??0),night=Math.max(0,Math.min(1,light.n??1));
      const d=dusk*(1-night*.35),n=night*(1-d),day=(1-night)*(1-d);
      uniforms.uBakedWeights.value.set(n,d,day).divideScalar(Math.max(.0001,n+d+day));
      uniforms.uLampPower.value=Math.max(0,lampPower);
    },
    dispose(){for(const m of materials)m.dispose();for(const g of geometries)g.dispose();for(const t of textures)t.dispose();ktx.dispose();},
  };
}
