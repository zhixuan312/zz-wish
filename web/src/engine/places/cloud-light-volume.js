// Practical low-rate seven-direction source-medium light volume.
// Opaque-light visibility and near refinement are explicit preview limits.
import {cloudLightPrefixAxisPlan,cloudLightPrefixSunPlan} from './cloud-light-prefix-v1.js';
import {createCloudLightPhase} from './cloud-light-phase.js';
export async function createCloudLightVolume({THREE,renderer,density,sourceIdentity,sunDirection,dimensions=[64,32,64]}){
  const axis=cloudLightPrefixAxisPlan({contract:density.contract,fieldGLSL:density.glsl,dimensions}),sun=cloudLightPrefixSunPlan({contract:density.contract,fieldGLSL:density.glsl,direction:sunDirection.toArray(),dimensions});
  const target=(plan,type)=>{const t=new THREE.WebGLRenderTarget(plan.grid.atlas.width,plan.grid.atlas.height,{type,format:THREE.RGBAFormat,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false,stencilBuffer:false,samples:0});t.texture.colorSpace=THREE.NoColorSpace;t.texture.generateMipmaps=false;return t;};
  const axisRT=[target(axis,THREE.FloatType),target(axis,THREE.FloatType)],sunRT=[target(sun,THREE.HalfFloatType),target(sun,THREE.HalfFloatType)],sunT=target(sun,THREE.UnsignedByteType),slots=Array.from({length:3},()=>[target(axis,THREE.UnsignedByteType),target(axis,THREE.UnsignedByteType)]);
  for(const t of[sunT,...slots.flat()])t.texture.minFilter=t.texture.magFilter=THREE.LinearFilter;
  const geometry=new THREE.PlaneGeometry(2,2),quad=new THREE.Mesh(geometry),stage=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);quad.frustumCulled=false;stage.add(quad);
  const vertexShader='void main(){gl_Position=vec4(position.xy,0.,1.);}';
  const material=(fragmentShader,extra={})=>new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,vertexShader,fragmentShader,uniforms:{...density.uniforms,uTime:{value:0},...extra},depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false});
  const axisInit=material(axis.initialize),axisScan=material(axis.scan,{uCloudPrefixPrevious:{value:null},uCloudPrefixStride:{value:1}}),sunInit=material(sun.initialize),sunScan=material(sun.scan,{uCloudSunPrefixPrevious:{value:null},uCloudSunPrefixStride:{value:1}}),sunDerive=material(sun.derive,{uCloudSunPrefixComplete:{value:null}});
  const axisDerive=material(axis.derive.replace('void main(){',sun.samplerGLSL+'\nvoid main(){').replace('vec4(positive.z,negative.z,0.,0.)','vec4(positive.z,negative.z,cloudSunTransmission(cloudPrefixWorld(at)),1.)'),{uCloudPrefixComplete:{value:null},uCloudPrefixOutput:{value:0},uCloudSunTransmission:{value:sunT.texture}});
  const allMaterials=[axisInit,axisScan,sunInit,sunScan,sunDerive,axisDerive];let disposed=false;
  function draw(t,mat,scissor){
    const saved={target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),test:renderer.getScissorTest(),auto:renderer.autoClear,xr:renderer.xr.enabled,tone:renderer.toneMapping,color:renderer.outputColorSpace,shadow:renderer.shadowMap.enabled};
    try{quad.material=mat;renderer.xr.enabled=false;renderer.shadowMap.enabled=false;renderer.autoClear=false;renderer.toneMapping=THREE.NoToneMapping;renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.setRenderTarget(t);renderer.setViewport(0,0,t.width,t.height);renderer.setScissorTest(!!scissor);if(scissor)renderer.setScissor(...scissor);renderer.render(stage,camera);}
    finally{renderer.setViewport(saved.viewport);renderer.setScissor(saved.scissor);renderer.setScissorTest(saved.test);renderer.setRenderTarget(saved.target,saved.face,saved.mip);renderer.autoClear=saved.auto;renderer.xr.enabled=saved.xr;renderer.toneMapping=saved.tone;renderer.outputColorSpace=saved.color;renderer.shadowMap.enabled=saved.shadow;}
  }
  function stripes(plan,kind){const a=plan.grid.atlas,h=Math.max(1,Math.floor(16384/a.width)),result=[];for(let y=0;y<a.height;y+=h)result.push({kind,scissor:[0,y,a.width,Math.min(h,a.height-y)]});return result;}
  const backend={
    async create(phase){return{...phase,axisPrevious:0,sunPrevious:0,tasks:[...stripes(axis,'axisInit'),...axis.passes.filter(p=>p.role==='scan').map(p=>({kind:'axisScan',stride:p.stride})),...stripes(sun,'sunInit'),...sun.passes.filter(p=>p.role==='scan-SUN').map(p=>({kind:'sunScan',stride:p.stride})),{kind:'sunDerive'},{kind:'axisDerive',output:0},{kind:'axisDerive',output:1}]};},
    execute({phase,task}){
      if(disposed)throw Error('Light volume disposed');
      if(task.kind==='axisInit'){axisInit.uniforms.uTime.value=phase.time;draw(axisRT[0],axisInit,task.scissor);}
      if(task.kind==='sunInit'){sunInit.uniforms.uTime.value=phase.time;draw(sunRT[0],sunInit,task.scissor);}
      if(task.kind==='axisScan'){axisScan.uniforms.uCloudPrefixPrevious.value=axisRT[phase.axisPrevious].texture;axisScan.uniforms.uCloudPrefixStride.value=task.stride;const next=1-phase.axisPrevious;draw(axisRT[next],axisScan);phase.axisPrevious=next;}
      if(task.kind==='sunScan'){sunScan.uniforms.uCloudSunPrefixPrevious.value=sunRT[phase.sunPrevious].texture;sunScan.uniforms.uCloudSunPrefixStride.value=task.stride;const next=1-phase.sunPrevious;draw(sunRT[next],sunScan);phase.sunPrevious=next;}
      if(task.kind==='sunDerive'){sunDerive.uniforms.uCloudSunPrefixComplete.value=sunRT[phase.sunPrevious].texture;draw(sunT,sunDerive);}
      if(task.kind==='axisDerive'){axisDerive.uniforms.uCloudPrefixComplete.value=axisRT[phase.axisPrevious].texture;axisDerive.uniforms.uCloudPrefixOutput.value=task.output;draw(slots[phase.slot][task.output],axisDerive);}
      return{sourcePhaseTime:phase.time};
    },
    commit:phase=>({slot:phase.slot,time:phase.time,sourceIdentity,directionsCompleted:7,textures:slots[phase.slot].map(t=>t.texture)}),
    dispose(){if(disposed)return;disposed=true;for(const t of[...axisRT,...sunRT,sunT,...slots.flat()])t.dispose();for(const mat of allMaterials)mat.dispose();geometry.dispose();stage.clear();}
  };
  const scheduler=createCloudLightPhase({backend,sourceIdentity,phaseStepSeconds:4}),nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  // Prewarm offscreen while the real-app poster remains visible. No missing
  // directional pass is exposed as a completed field. Each frame runs as many
  // passes as a small time budget allows before yielding, because one pass per
  // animation frame stretched this prewarm to 5.6 s and held every place
  // preparation behind it.
  const prewarmBudgetMs = 12;
  while(!scheduler.sample().ready){
    const frameStart=performance.now();
    do{await scheduler.tick(0);}while(!scheduler.sample().ready&&performance.now()-frameStart<prewarmBudgetMs);
    if(!scheduler.sample().ready)await nextFrame();
  }
  const [nx,ny,nz]=dimensions,grid=axis.grid,box=grid.worldBounds,dyLow=(-88-box.min[1])/grid.lowerCount,dyHigh=(box.max[1]+88)/(ny-grid.lowerCount),a=grid.atlas;
  const f=n=>Number.isInteger(n)?`${n}.0`:String(n),v=values=>`vec3(${values.map(f).join(',')})`;
  const glsl=`
    uniform sampler2D uCloudLightPreviousA,uCloudLightPreviousB,uCloudLightCurrentA,uCloudLightCurrentB;
    uniform float uCloudLightMix;
    vec2 cloudLightUv(vec2 xy,float z){return(vec2(mod(z,${f(a.columns)}),floor(z/${f(a.columns)}))*vec2(${a.tile.map(f).join(',')})+xy+1.5)/vec2(${f(a.width)},${f(a.height)});}
    vec3 cloudLightIndex(vec3 p){float y=p.y< -88.?(p.y-(${f(box.min[1])}))/${f(dyLow)}-.5:${f(grid.lowerCount)}+(p.y+88.)/${f(dyHigh)}-.5;return clamp(vec3((p.x-(${f(box.min[0])}))/${f((box.max[0]-box.min[0])/nx)}-.5,y,(p.z-(${f(box.min[2])}))/${f((box.max[2]-box.min[2])/nz)}-.5),vec3(0.),${v(dimensions.map(n=>n-1))});}
    vec4 cloudLightSample(sampler2D t,vec3 q){float z=floor(q.z);return mix(texture(t,cloudLightUv(q.xy,z)),texture(t,cloudLightUv(q.xy,min(z+1.,${f(nz-1)}))),q.z-z);}
    void cloudLightTransmission(vec3 p,out vec4 A,out vec3 B){vec3 q=cloudLightIndex(p);A=mix(cloudLightSample(uCloudLightPreviousA,q),cloudLightSample(uCloudLightCurrentA,q),uCloudLightMix);B=mix(cloudLightSample(uCloudLightPreviousB,q).xyz,cloudLightSample(uCloudLightCurrentB,q).xyz,uCloudLightMix);}
  `;
  const uniforms={uCloudLightPreviousA:{value:null},uCloudLightPreviousB:{value:null},uCloudLightCurrentA:{value:null},uCloudLightCurrentB:{value:null},uCloudLightMix:{value:0}};
  function update(dt){void scheduler.tick(dt).catch(error=>{console.error('Cloud phase update failed',error);});const state=scheduler.sample();if(!state.ready)return;density.setTime(state.simulationTime);uniforms.uCloudLightPreviousA.value=state.previous.textures[0];uniforms.uCloudLightPreviousB.value=state.previous.textures[1];uniforms.uCloudLightCurrentA.value=state.current.textures[0];uniforms.uCloudLightCurrentB.value=state.current.textures[1];uniforms.uCloudLightMix.value=state.weight;}
  update(0);
  return{glsl,uniforms,update,dispose:()=>scheduler.dispose(),describe:()=>({phase:scheduler.describe(),axis:axis.metadata,sun:sun.metadata,previewLimits:'Global128x64x128 source-medium transport; near refinement/opaque-light occlusion omitted in first picture candidate. Actual view-depth endpoint is separate. No final quality/FPS claim.'})};
}
