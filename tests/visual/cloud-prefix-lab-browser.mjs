// Standalone component diagnostic, not the product scene or a frame-rate test.
import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { cloudLiveCacheV1GLSL } from './cloud-live-cache-v1.js';
import { cloudLightPrefixAxisPlan } from './cloud-light-prefix-v1.js';
const canvas=document.querySelector('canvas'),events=[],renderer=new THREE.WebGLRenderer({canvas,antialias:false,preserveDrawingBuffer:false});
canvas.addEventListener('webglcontextlost',event=>{events.push({type:'lost',time:performance.now()});event.preventDefault();});
renderer.setSize(320,240,false);renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.autoClear=false;
const gl=renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),records=[],hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
const debugInfo=gl.getExtension('WEBGL_debug_renderer_info'),actualDevice=debugInfo?gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL):null;
if(!renderer.capabilities.isWebGL2)throw Error('WebGL2 required; no fallback');
function healthy(){const error=gl.getError();if(gl.isContextLost()||events.length||error!==gl.NO_ERROR)throw Error(`GPU health failed:${error},lost${gl.isContextLost()}`);}
const fieldRecord=await(await fetch('/field.json')).json(),meta=await(await fetch('/cache/cloud-live-density.json')).json();
if(fieldRecord.source.sha256!==meta.sourceBlendSha256||meta.sourceFieldSha256!==fieldRecord.contractTextSha256)throw Error('Source19 actual metadata mismatch');
const loader=new KTX2Loader().detectSupport(renderer),textures={};
for(const [role,file]of Object.entries(meta.textures)){
  const bytes=await(await fetch('/cache/'+file.uri)).arrayBuffer();if(bytes.byteLength!==file.bytes||await hash(bytes)!==file.sha256)throw Error('Actual KTX input mismatch');
  const url=URL.createObjectURL(new Blob([bytes]));let texture;try{texture=await loader.loadAsync(url);}finally{URL.revokeObjectURL(url);}
  if(!texture.isData3DTexture||await hash(new Uint8Array(texture.image.data.buffer,texture.image.data.byteOffset,texture.image.data.byteLength))!==file.decodedSha256)throw Error('Actual typed KTX decode mismatch');
  texture.colorSpace=THREE.NoColorSpace;texture.generateMipmaps=false;texture.minFilter=texture.magFilter=role.startsWith('noise')?THREE.NearestFilter:THREE.LinearFilter;texture.wrapS=texture.wrapT=texture.wrapR=THREE.ClampToEdgeWrapping;texture.unpackAlignment=1;texture.needsUpdate=true;textures[role]=texture;
}
loader.dispose();
const field=cloudLiveCacheV1GLSL({contract:fieldRecord.contract,envelope:meta.envelope}),uniforms={uTime:{value:0},uCloudNoiseCornersA:{value:textures.noiseA},uCloudNoiseCornersB:{value:textures.noiseB},uCloudEnvelope:{value:textures.envelope},uCloudEnvelopeNear:{value:textures.envelopeNear}};
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1),geometry=new THREE.PlaneGeometry(2,2),quad=new THREE.Mesh(geometry);quad.frustumCulled=false;scene.add(quad);
const vertexShader='void main(){gl_Position=vec4(position.xy,0.,1.);}';
function material(fragmentShader,extra={}){return new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,vertexShader,fragmentShader,uniforms:{...uniforms,...extra},depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false});}
function target(width,height){return new THREE.WebGLRenderTarget(width,height,{type:THREE.FloatType,format:THREE.RGBAFormat,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false,stencilBuffer:false,samples:0});}
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
async function draw({target,material,label,scissor}){
  if(!timer)throw Error('Actual GPU timer unsupported; larger work held');await frame();healthy();quad.material=material;renderer.setRenderTarget(target);renderer.setViewport(0,0,target.width,target.height);renderer.setScissorTest(!!scissor);if(scissor)renderer.setScissor(...scissor);
  const viewport=Array.from(gl.getParameter(gl.VIEWPORT)),status=gl.checkFramebufferStatus(gl.FRAMEBUFFER);if(viewport[2]!==target.width||viewport[3]!==target.height||status!==gl.FRAMEBUFFER_COMPLETE)throw Error('Actual FBO/viewport assertion failed');
  const query=gl.createQuery(),begin=performance.now();gl.beginQuery(timer.TIME_ELAPSED_EXT,query);renderer.render(scene,camera);gl.endQuery(timer.TIME_ELAPSED_EXT);gl.flush();const cpuSubmitMs=performance.now()-begin;
  const deadline=performance.now()+10000;while(!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)){if(performance.now()>deadline)throw Error('GPU query timeout');healthy();await frame();}
  if(gl.getParameter(timer.GPU_DISJOINT_EXT))throw Error('Disjoint GPU timer; no measured escalation');const gpuMs=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;gl.deleteQuery(query);healthy();const row={label,size:[target.width,target.height],scissor:scissor??null,viewport,status,gpuMs,cpuSubmitMs};records.push(row);if(gpuMs>100)throw Error('Actual draw exceeds100ms stop');return row;
}
function pixel(at,atlas){return(at[2]%atlas.columns)*atlas.tile[0]+at[0]+1+atlas.width*(Math.floor(at[2]/atlas.columns)*atlas.tile[1]+at[1]+1);}
async function run(size){
  if(![16,32,64].includes(size)||records.some(row=>row.gpuMs>100))throw Error('Bounded progressive size only');const dimensions=[size,size/2,size],plan=cloudLightPrefixAxisPlan({contract:fieldRecord.contract,fieldGLSL:field.glsl,dimensions}),atlas=plan.grid.atlas,[nx,ny,nz]=dimensions,N=nx*ny*nz,index=(x,y,z)=>x+nx*(y+ny*z),A=target(atlas.width,atlas.height),B=target(atlas.width,atlas.height),constant=material('out vec4 pc_fragColor;void main(){pc_fragColor=vec4(.25);}'),init=material(plan.initialize),scan=material(plan.scan,{uCloudPrefixPrevious:{value:A.texture},uCloudPrefixStride:{value:1}});
  const first=records.length;try{
    await draw({target:A,material:constant,label:`${size}:constant`});
    const control=new Float32Array(atlas.width*atlas.height*4);renderer.readRenderTargetPixels(A,0,0,atlas.width,atlas.height,control);healthy();if(control.some(v=>v!==.25))throw Error('Constant FLOAT32 FBO typed control failed');
    const stripe=Math.max(1,Math.floor(16384/atlas.width));for(let y=0;y<atlas.height;y+=stripe)await draw({target:A,material:init,label:`${size}:density:${y}`,scissor:[0,y,atlas.width,Math.min(stripe,atlas.height-y)]});
    renderer.setScissorTest(false);const initial=new Float32Array(atlas.width*atlas.height*4);renderer.readRenderTargetPixels(A,0,0,atlas.width,atlas.height,initial);healthy();let maximumDensity=0;
    let expected=new Float32Array(N*3),next=new Float32Array(N*3);
    for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const p=pixel([x,y,z],atlas)*4,i=index(x,y,z);maximumDensity=Math.max(maximumDensity,initial[p+3]);for(let k=0;k<3;k++){if(!Number.isFinite(initial[p+k]))throw Error('Nonfinite actual density output');expected[i*3+k]=initial[p+k];}}
    if(!(maximumDensity>0))throw Error('Actual density FBO is allzero; invalid black/source control');
    let previous=A,output=B;
    for(let stride=1;stride<Math.max(...dimensions);stride*=2){
      scan.uniforms.uCloudPrefixPrevious.value=previous.texture;scan.uniforms.uCloudPrefixStride.value=stride;await draw({target:output,material:scan,label:`${size}:scan:${stride}`});
      for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const at=[x,y,z],i=index(...at);for(let k=0;k<3;k++){const p=at.slice();p[k]-=stride;next[i*3+k]=Math.fround(expected[i*3+k]+(p[k]<0?0:expected[index(...p)*3+k]));}}
      [expected,next]=[next,expected];[previous,output]=[output,previous];
    }
    const actual=new Float32Array(atlas.width*atlas.height*4);renderer.readRenderTargetPixels(previous,0,0,atlas.width,atlas.height,actual);healthy();let maximumError=0,mismatches=0;
    for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const p=pixel([x,y,z],atlas)*4,i=index(x,y,z);for(let k=0;k<3;k++){const error=Math.abs(actual[p+k]-expected[i*3+k]);maximumError=Math.max(maximumError,error);if(actual[p+k]!==expected[i*3+k])mismatches++;}}
    if(mismatches)throw Error(`Actual GPU prefix differs from typedCPU additions:${mismatches},${maximumError}`);
    return{logicalDimensions:dimensions,atlas,maximumDensity,checkedValues:N*3,prefixF32MaximumError:maximumError,prefixF32Mismatches:mismatches,records:records.slice(first),sourceSha256:fieldRecord.source.sha256,fieldTextSha256:meta.sourceFieldSha256,sourceTime:0,scope:'CPU sum of ACTUAL GPU density output; this proves prefix arithmetic, not literal/source-field parity or fullview/FPS'};
  }finally{renderer.setScissorTest(false);renderer.setRenderTarget(null);A.dispose();B.dispose();constant.dispose();init.dispose();scan.dispose();}
}
window.__prefixLab={ready:true,run,health:()=>({lost:gl.isContextLost(),events,timerSupported:!!timer,renderer:gl.getParameter(gl.RENDERER),actualDevice,version:gl.getParameter(gl.VERSION),threeRevision:THREE.REVISION,records}),source:{sha256:fieldRecord.source.sha256,fieldTextSha256:meta.sourceFieldSha256},dispose(){geometry.dispose();for(const texture of Object.values(textures))texture.dispose();renderer.dispose();}};
