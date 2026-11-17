// Authored Cloud Cliff cover. Static construction and all four light fields are
// delivered by Blender; this module adds the living atmosphere and source hero.
import { loadBakedPlace } from '../baked/loadPlace.js';
import { createCloudVolumeLive } from './cloud-volume-live.js';

function authoredStationaryLampSpill(group){
  group.traverse(object=>{if(!object.isMesh)return;for(const material of [object.material].flat()){
    if(material.userData.cloudAuthoredLampSpill)continue;
    material.userData.cloudAuthoredLampSpill=true;
    const compile=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
    material.onBeforeCompile=(shader,renderer)=>{
      compile.call(material,shader,renderer);
      const away='float away=smoothstep(.7,1.8,distance(vBakedWorld,uBakedLampAnchor));';
      const near='isVisitor*(1.-smoothstep(.7,1.8,distance(vBakedWorld,uBakedLampAnchor)))';
      if(!shader.fragmentShader.includes(away)||!shader.fragmentShader.includes(near))throw new Error('Cloud stationary full-lamp shader contract changed');
      shader.fragmentShader=shader.fragmentShader.replace(away,'float away=1.;').replace(near,'0.').replace('*uLampPower*away*movingShade','*uLampPower*away');
    };
    material.customProgramCacheKey=()=>key()+'-cloud-stationary-authored-full-lamp-1';material.needsUpdate=true;
  }});
}

function internalGlassPointSpecular(THREE, material, sourcePoint) {
  if (material.userData.cloudInternalPointFiltered) return;
  material.userData.cloudInternalPointFiltered = true;
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.uCloudInternalPoint = { value: sourcePoint };
    shader.fragmentShader = 'uniform vec3 uCloudInternalPoint;\n' + shader.fragmentShader;
    const call = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
    // The first call belongs only to the POINT loop. A block keeps variables
    // local when Three unrolls several lights. Diffuse and all environment/
    // Fresnel terms retain their original PBR path; only this point's ideal
    // delta specular is removed from the clear hurricane glass.
    const lights = THREE.ShaderChunk.lights_fragment_begin.replace(call, `{
      vec3 cloudSpecularBefore=reflectedLight.directSpecular;
      ${call}
      vec3 cloudInternalView=(viewMatrix*vec4(uCloudInternalPoint,1.)).xyz;
      float cloudOwnPoint=1.-step(.001,distance(pointLight.position,cloudInternalView));
      reflectedLight.directSpecular=mix(reflectedLight.directSpecular,cloudSpecularBefore,cloudOwnPoint);
    }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', lights);
  };
  material.customProgramCacheKey = () => key() + '-cloud-internal-glass-point-specular-1';
  material.needsUpdate = true;
}

function probeReceiverAmbient(THREE,material){
  if(material.userData.cloudProbeAmbient)return;
  material.userData.cloudProbeAmbient=true;
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
  material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer);
    // The local PMREM already supplies the captured world/scene diffuse term.
    // Preserve directional, point, Fresnel and environment BRDFs; omit only
    // the additional generic hemisphere irradiance on these two receivers.
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',THREE.ShaderChunk.lights_fragment_begin)
      .replace('irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );','/* Local PMREM is the sole ambient irradiance path. */');
  };
  material.customProgramCacheKey=()=>key()+'-cloud-local-probe-ambient-1';material.needsUpdate=true;
}

function distanceAir(h,C){
  const {THREE}=h;
  // The source contains real .0009/m distance air. Its view-ray inscattering
  // is not part of a surface DIFFUSE bake. Seven source-bound ridge rays
  // correlate EXR/KTX/UV/albedo and calibrate this term to the accepted native
  // looks through the runtime ACES transform; surface maps remain untouched.
  const looks=[[.045935,.063964,.092979],[.089272,.094745,.117122],[.232914,.254021,.301656]];
  const colour=new THREE.Color().fromArray(looks[0]);
  C.up.push(()=>{
    const w=C.baked?.lightingState().weights??[1,0,0];
    colour.setRGB(...[0,1,2].map(channel=>looks.reduce((sum,value,index)=>sum+value[channel]*w[index],0)));
  });
  return {colour,apply(group){group.traverse(object=>{
    if(!object.isMesh)return;
    for(const material of [object.material].flat()){
      if(material.userData.cloudDistanceAir)continue;
      material.userData.cloudDistanceAir=true;material.fog=false;
      const compile=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
      material.onBeforeCompile=(shader,renderer)=>{
        compile.call(material,shader,renderer);
        shader.uniforms.uCloudAir={value:colour};
        shader.vertexShader='varying vec3 vCloudAirWorld;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCloudAirWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
        shader.fragmentShader='varying vec3 vCloudAirWorld;uniform vec3 uCloudAir;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>',`float airTransmission=exp(-.0009*distance(vCloudAirWorld,cameraPosition));
          gl_FragColor.rgb=mix(uCloudAir,gl_FragColor.rgb,airTransmission);
          #include <tonemapping_fragment>`);
      };
      material.customProgramCacheKey=()=>key()+'-cloud-source-air-1';material.needsUpdate=true;
    }
  });}};
}

async function cloudVolume(h,C,air){
  await createCloudVolumeLive(h,C,air);
  const {THREE}=h,sky=C.G.children.find(o=>o.material?.uniforms?.uHorizon)?.material.uniforms;
  const looks=[{top:0x0b1930,horizon:0x34465b,ground:0x101d30},{top:[.03,.05,.085],horizon:[.075,.10,.15],ground:[.015,.025,.045]},{top:0x628eb6,horizon:0xc8dde9,ground:0x617b8b}].map(look=>Object.fromEntries(Object.entries(look).map(([k,v])=>[k,Array.isArray(v)?new THREE.Color().fromArray(v):new THREE.Color(v)])));
  C.up.push(()=>{if(!sky)return;const w=C.baked.lightingState().weights;for(const[u,k]of[['uTop','top'],['uHorizon','horizon'],['uGround','ground']])sky[u].value.setRGB(...[0,1,2].map(c=>looks.reduce((sum,l,i)=>sum+l[k].toArray()[c]*w[i],0)));sky.uDisc.value=0;sky.uGlow.value=.03;sky.uClouds.value=.08;});
}

export default function createPlace(h) {
  const { V3, THREE } = h;
  let baked,air;
  const desktop = { pos: V3(5.2, 1.85, 4.7), look: V3(5.8, 1.18, -2.5), fov: 49 };
  const phone = { pos: V3(5.2, 1.45, 4.8), look: V3(3.77, .62, -5), fov: 49 };
  return {
    bakedLighting: true, coverOnly: true, cameraFar: 2000, snow: 0, exposure: 1, shade: .7,
    sky: { top: 0x0a1425, horizon: 0x344454, ground: 0x142335, sun: 0xb9d0f3, dir: [.4,.6,-1], glow: .09, clouds: .22, lit: 0x73869b, dark: 0x1b2d42, disc: 0, stars: .14 },
    fog: [0x182638,.00048], sunL: [0xaec8eb,.32], hemi: [0x6880a0,0x26374b,.3], bloom: [.06,1.7],
    day: { exposure: 1, sky: { top: 0x668eac, horizon: 0xd1dee5, ground: 0x617b8b, sun: 0xfff1d2, dir: [.4,.6,-1], glow: .05, clouds: .12, lit: 0xe5eced, dark: 0x8da2af, disc: 0 }, fog: [0x647e98,.0004], sunL: [0xffe8c8,2.2], hemi: [0xc5d8e8,0x657683,.75], bloom: [.05,1.8] },
    view: desktop, walk: [V3(2,1.65,4),V3(2,1.65,1)], doors: V3(2,1.65,0),
    async build() {
      const C = h.context;
      baked = await loadBakedPlace('cloud-cliff', h.renderer, C.light);
      if(baked.manifest.bake.lampPassQuantity!=='diffuse-radiance-per-unit-albedo')throw new Error('Cloud requires its authored complete lamp transport');
      authoredStationaryLampSpill(baked.group);
      C.G.add(baked.group); C.baked = baked;
      air=distanceAir(h,C);air.apply(baked.group);await cloudVolume(h,C,air);
    },
    nook: {
      at: { pos: V3(0,0,0), ry: 0 }, lamp: 'lantern', y: 1.792,
      cover: desktop, coverPhone: phone, wide: desktop, burn: desktop,
      exposure: 1, bloom: [.06,1.7], dust: false,
      async build() {
        const C = h.context, hero = baked.heroes?.storm;
        if (!hero) throw new Error('Cloud Cliff requires its authored storm-lantern hero.');
        const metadata = hero.userData.hero ?? hero.userData.oneLightHero ?? baked.manifest.heroes.storm;
        const basis = metadata.lampBasis;
        if (!basis || !Array.isArray(metadata.wickTip)) throw new Error('Cloud hero source anchors are missing.');
        // Root loaders may attach the hero already. Keep its source world frame.
        if (!hero.parent) baked.group.add(hero);
        air.apply(hero);
        C.G.updateMatrixWorld(true); baked.group.updateMatrixWorld(true);
        const wick = C.G.worldToLocal(V3(...metadata.wickTip));
        const flame = h.liveFlame(wick.x, wick.y, wick.z,{power:1,size:1.0});
        // Cloud-only 37 mm teardrop: preserve measured source height and wick,
        // and give the graphic a readable flame-body width (about3:1 aspect).
        flame?.f?.flame.geometry.scale(1.7,1,1);
        if(flame?.f?.halo)flame.f.halo.visible=false;
        const fixtureOutput=2;
        const light = new THREE.PointLight(new THREE.Color().fromArray(basis.linearColor), basis.watts/(4*Math.PI)*fixtureOutput, 12, 2);
        light.position.copy(C.G.worldToLocal(V3(...basis.position))); C.G.add(light);
        light.castShadow = true; light.shadow.mapSize.set(512,512); light.shadow.camera.near = .02; light.shadow.camera.far = 12; light.shadow.normalBias = .001;
        const receivers=[];
        hero.traverse(object => { if(object.isMesh){
          const materials=Array.isArray(object.material)?object.material:[object.material];
          object.castShadow=!materials.some(material=>material.transmission>.5);object.receiveShadow=true;
          // Three160 renders transmission before the transparent flame. The
          // real glass keeps PBR/Fresnel but must not occlude that inner sprite.
          for(const material of materials)if(material.transmission>.5){material.depthWrite=false;material.thickness=.002;material.envMapIntensity=1.3;internalGlassPointSpecular(THREE,material,new THREE.Vector3(...basis.position));}
          if(materials.some(material=>material.transmission>.5||material.name==='Storm warm used tallow'))receivers.push(object);
        } });
        C.cover = { g: hero, f: flame?.f, flameGroup: flame?.g, light, metadata, power: fixtureOutput, lampPosition: V3(...basis.position) };
        // Scale the authored transport and live point together before the
        // local reflection probe observes the wood and glass around the lamp.
        baked.update(C.light,fixtureOutput,V3(...basis.position));
        const probe=h.captureLocalEnvironment({root:C.root,environment:C.environment,fog:C.fog,position:[...metadata.wickTip],exclude:[...receivers,...(flame?.g?[flame.g]:[])],size:128,near:.004,far:30});
        for(const object of receivers)for(const material of [object.material].flat()){
          probeReceiverAmbient(THREE,material);material.envMap=probe.texture;material.needsUpdate=true;
        }
        hero.userData.cloudLocalProbe=probe.metadata;C.cover.localProbe=probe.metadata;
        C.up.push(() => { light.intensity = basis.watts/(4*Math.PI)*C.cover.power; });
      },
    },
  };
}
