import * as THREE from 'three';
import {createStaticLampShadow} from './staticLampShadow.js';
import {createVisitorShadow} from './visitorShadow.js';
import {createGauzeTransmission,GAUZE_CANDLE_REFERENCE} from './gauzeTransmission.js';
import {createActualCloth} from './clothFactory.js';
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:false,preserveDrawingBuffer:true});window.__renderer=renderer;
renderer.setSize(128,128,false);renderer.setPixelRatio(1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.debug.checkShaderErrors=true;
const geometries=new Set(),materials=new Set(),textures=new Set(),states=[],targets=new Set(),ownGeometry=g=>(geometries.add(g),g),ownMaterial=m=>(materials.add(m),m),ownTexture=t=>(textures.add(t),t),point=new THREE.Vector3(),staticRoot=new THREE.Group();
const opaque=ownMaterial(new THREE.MeshStandardMaterial({color:0xffffff,side:THREE.DoubleSide})),box=new THREE.Mesh(ownGeometry(new THREE.BoxGeometry(.5,.7,.2)),opaque);box.position.set(-.9,0,-2);staticRoot.add(box);
const glass=new THREE.Mesh(ownGeometry(new THREE.BoxGeometry(.5,.7,.2)),ownMaterial(new THREE.MeshPhysicalMaterial({transparent:true,transmission:1,opacity:.2})));glass.position.set(.9,0,-2);staticRoot.add(glass);
const alpha=ownTexture(new THREE.DataTexture(new Uint8Array([255,255,255,0,255,255,255,255]),2,1));alpha.minFilter=alpha.magFilter=THREE.NearestFilter;alpha.generateMipmaps=false;alpha.needsUpdate=true;
const cutout=new THREE.Mesh(ownGeometry(new THREE.PlaneGeometry(1.2,1.2)),ownMaterial(new THREE.MeshStandardMaterial({map:alpha,transparent:true,alphaTest:.5,side:THREE.DoubleSide})));cutout.position.set(0,0,-2);staticRoot.add(cutout);
const shadow=createStaticLampShadow({lightWorld:point,sourceRadius:.004,resolution:512,near:.008,far:80,normalBias:.001});states.push(shadow);
const target=new THREE.WebGLRenderTarget(128,128,{depthBuffer:true});targets.add(target);
const bytes=new Uint8Array(128*128*4),camera=new THREE.OrthographicCamera(-2.4,2.4,2.4,-2.4,.1,20);camera.position.set(0,0,1);camera.lookAt(0,0,-4);
function check(condition,message){if(!condition)throw Error(message);}
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
function readTexture(texture){
 const gl=renderer.getContext(),handle=renderer.properties.get(texture).__webglTexture,w=texture.image.width,h=texture.image.height,data=new Uint8Array(w*h*4),framebuffer=gl.createFramebuffer();
 check(handle,'Copied texture has no actual GPU handle');const draw=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),read=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
 try{gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,handle,0);check(gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE,'Copied RGBA atlas framebuffer incomplete');gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,data);check(gl.getError()===gl.NO_ERROR,'Actual copied RGBA atlas read failed');}
 finally{gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,draw);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,read);gl.deleteFramebuffer(framebuffer);}return data;
}
function render(scene,camera,visible=false){renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,128,128,bytes);if(visible){renderer.setRenderTarget(null);renderer.render(scene,camera);}return bytes.slice();}
function stats(data){let nonBlack=0,sum=0,max=0;for(let i=0;i<data.length;i+=4){const value=data[i]+data[i+1]+data[i+2];sum+=value;max=Math.max(max,value);if(value>0)nonBlack++;}return{nonBlackPixels:nonBlack,meanChannelValue:sum/(128*128*3),maxChannelSum:max};}
const pixel=(data,x,y=64)=>Array.from(data.slice((y*128+x)*4,(y*128+x)*4+3));
let ready=false;
window.__runStaticShadowLab=async()=>{
 check(!ready,'Run once per lab');ready=true;const report={resolution:[128,128],threeRevision:THREE.REVISION,webgl2:renderer.capabilities.isWebGL2,tests:[]};
 let nativeBytes=null;const copy=renderer.copyFramebufferToTexture.bind(renderer);
 renderer.copyFramebufferToTexture=(position,texture,...rest)=>{const source=renderer.getRenderTarget();nativeBytes=new Uint8Array(source.width*source.height*4);renderer.readRenderTargetPixels(source,0,0,source.width,source.height,nativeBytes);return copy(position,texture,...rest);};
 try{await shadow.capture(renderer,staticRoot);}finally{renderer.copyFramebufferToTexture=copy;}
 check(shadow.metadata.storage==='framebuffer-texture-copy','Framebuffer copy fell back: '+shadow.metadata.copyFailure);const copied=readTexture(shadow.texture);check(nativeBytes?.length===copied.length,'Actual atlas byte counts differ');let different=0;for(let i=0;i<copied.length;i++)if(copied[i]!==nativeBytes[i])different++;
 report.copy={allBytes:copied.length,differentBytes:different,nativeSha256:await digest(nativeBytes),copiedSha256:await digest(copied),atlas:shadow.metadata.atlasSize};check(different===0,'Actual GPU RGBA atlas copy mismatch');
 const scene=new THREE.Scene(),probe=ownMaterial(new THREE.MeshStandardMaterial({color:0xffffff,side:THREE.DoubleSide}));shadow.install(probe);
 const compile=probe.onBeforeCompile;probe.onBeforeCompile=(shader,r)=>{compile(shader,r);shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','gl_FragColor=vec4(vec3(getStaticLampVisibility(vStaticLampWorld,normalize(vStaticLampWorldNormal))),1.);');};probe.customProgramCacheKey=()=> 'static-shadow-lab-visibility';
 const plane=new THREE.Mesh(ownGeometry(new THREE.PlaneGeometry(4.8,4.8)),probe);plane.position.z=-4;scene.add(plane);
 await renderer.compileAsync(scene,camera);const visibility=render(scene,camera),controls={opaque:pixel(visibility,16),glass:pixel(visibility,112),cutoutHole:pixel(visibility,51),cutoutOpaque:pixel(visibility,77)};
 check(controls.opaque[0]<=2,'Opaque static blocker leaked');check(controls.glass[0]>=253,'Transmitting glass should be excluded');check(controls.cutoutHole[0]>=253,'Actual alpha cutout hole blocked');check(controls.cutoutOpaque[0]<=2,'Actual alpha cutout opaque texel leaked');report.tests.push({name:'zero-point-shadow-geometric-visibility',controls,stats:stats(visibility),passed:true});
 const visitor=createVisitorShadow({lightWorld:point,sourceRadius:.004}),gauze=createGauzeTransmission();states.push(gauze);
 const standard=ownMaterial(new THREE.MeshStandardMaterial({color:0xffffff,side:THREE.DoubleSide}));visitor.install(standard);gauze.install(standard);shadow.install(standard);plane.material=standard;
 const light=new THREE.PointLight(0xffffff,8,0,2);light.castShadow=true;light.shadow.mapSize.set(128,128);light.shadow.camera.near=.008;light.shadow.camera.far=80;scene.add(light);const other=new THREE.PointLight(0x88aaff,2,0,2);other.position.set(5,3,1);scene.add(other);
 await renderer.compileAsync(scene,camera);const direct=render(scene,camera);check(stats(direct).nonBlackPixels>100,'Standard direct frame black');report.tests.push({name:'standard-two-points-actual-three-hook-chain',stats:stats(direct),passed:true});
 const proxy=await(await fetch('/proxy.json')).json(),clothPart=proxy.parts.find(part=>part.role==='gauze');check(clothPart,'Actual cloth proxy missing');
 const loader=new THREE.TextureLoader(),maps={};for(const role of ['weave','normal','roughness']){const map=ownTexture(await loader.loadAsync('/fabric-'+role+'.webp'));map.colorSpace=role==='weave'?THREE.SRGBColorSpace:THREE.NoColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(1.28,.96);maps[role]=map;}
 const material=ownMaterial(createActualCloth(maps));material.sheen=0;material.specularIntensity=0;visitor.install(material);shadow.install(material);
 const lampScene=new THREE.Scene(),lamp=new THREE.Group();lampScene.add(lamp);let actualCloth;
 for(const part of proxy.parts){const geometry=ownGeometry(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(part.normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(part.uvs,2));geometry.setIndex(part.indices);const m=part.role==='gauze'?material:ownMaterial(new THREE.MeshStandardMaterial({color:0x24140c,side:THREE.DoubleSide,roughness:.85}));if(m!==material){visitor.install(m);shadow.install(m);}const mesh=new THREE.Mesh(geometry,m);mesh.castShadow=part.role!=='gauze';mesh.receiveShadow=true;lamp.add(mesh);if(part.role==='gauze')actualCloth=mesh;}
 gauze.configure({cloth:actualCloth,pointLocal:point,colour:0xa82a1c,frame:lamp});gauze.update(light);
 scene.remove(light);lampScene.add(light);light.intensity=GAUZE_CANDLE_REFERENCE.watts*GAUZE_CANDLE_REFERENCE.cameraPreExposure/(4*Math.PI);light.color.fromArray(GAUZE_CANDLE_REFERENCE.linearColor);light.shadow.camera.far=80;
 const u=material.userData.u;u.uClothPhysical.value=1;u.uFlame.value.copy(point);u.uClothIntensity.value=light.intensity;u.uClothSourceRGB.value.copy(light.color);u.uClothEmitterRadius.value=.004;u.uClothTransmissionWeight.value=.65;
 const lampCamera=new THREE.PerspectiveCamera(35,1,.01,10);lampCamera.position.set(0,.24,1.25);lampCamera.lookAt(0,.24,0);
 await renderer.compileAsync(lampScene,lampCamera);const physical=render(lampScene,lampCamera,true);check(stats(physical).nonBlackPixels>100,'Actual physical cloth frame black');report.tests.push({name:'actual-physical-cloth-with-static-and-moving-shadow',stats:stats(physical),sourceWatts:GAUZE_CANDLE_REFERENCE.watts,cameraPreExposure:GAUZE_CANDLE_REFERENCE.cameraPreExposure,actualTriangles:proxy.triangles,passed:true});
 light.castShadow=false;light.visible=false;material.needsUpdate=true;await renderer.compileAsync(lampScene,lampCamera);const noShadow=render(lampScene,lampCamera);check(stats(noShadow).nonBlackPixels>100,'Actual physical cloth zero-point-shadow frame black');report.tests.push({name:'actual-physical-cloth-zero-point-shadow-defines',stats:stats(noShadow),passed:true});
 light.visible=true;light.castShadow=true;material.needsUpdate=true;render(lampScene,lampCamera,true);report.passed=report.tests.every(test=>test.passed)&&different===0;report.gpuError=renderer.getContext().getError();check(report.gpuError===0,'Final WebGL error');report.resourcesBeforeDispose={...renderer.info.memory,programs:renderer.info.programs.length};
 window.__labLights=[light,other];return report;
};
window.__disposeStaticShadowLab=()=>{for(const state of states)state.dispose();for(const light of window.__labLights??[])light.dispose();for(const target of targets)target.dispose();for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();for(const texture of textures)texture.dispose();renderer.renderLists.dispose();const info={...renderer.info.memory,programs:renderer.info.programs.length,contextLost:renderer.getContext().isContextLost()};renderer.dispose();return{ownedDisposed:true,...info};};
window.__staticShadowLabReady=true;
