// Source19 LOW8 optical study. Coarse live light transport is a stated preview
// approximation; physical scene depth and the authored moving medium are real.
import {loadCloudLiveDensity} from './cloud-live-cache-v1.js';
import {createCloudLightVolume} from './cloud-light-volume.js';
import {createCloudOpaqueDepth} from './cloudOpaqueDepth.js';
import {cloudDepthComposite} from './cloud-depth-composite.js';

const scalar=n=>Number.isInteger(n)?`${n}.0`:String(n);
const vector=a=>`vec3(${a.map(scalar).join(',')})`;

function occupancyTexture(THREE,contract){
  const low=contract.bounds.min,high=contract.bounds.max,cell=16;
  const dims=high.map((v,i)=>Math.ceil((v-low[i])/cell)),data=new Uint8Array(dims.reduce((a,b)=>a*b,1));
  const boxes=[...contract.bankGroups.map(g=>g.expandedCullBounds),...contract.nearWisps.map(w=>({min:w.centre.map((v,i)=>v-w.radii[i]),max:w.centre.map((v,i)=>v+w.radii[i])}))];
  for(const box of boxes){
    const a=box.min.map((v,i)=>Math.max(0,Math.floor((v-low[i])/cell))),b=box.max.map((v,i)=>Math.min(dims[i]-1,Math.floor((v-low[i])/cell)));
    for(let z=a[2];z<=b[2];z++)for(let y=a[1];y<=b[1];y++)for(let x=a[0];x<=b[0];x++)data[x+dims[0]*(y+dims[1]*z)]=255;
  }
  const texture=new THREE.Data3DTexture(data,...dims);texture.format=THREE.RedFormat;texture.type=THREE.UnsignedByteType;
  texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.unpackAlignment=1;texture.needsUpdate=true;
  return{texture,dims,low,high:low.map((v,i)=>v+dims[i]*cell),cell};
}

function primaryShader(density,light,occupancy){
  const c=density.contract,o=occupancy,s=c.substrate;
  return `
    precision highp sampler3D;
    uniform highp sampler3D uCloudOccupancy;
    uniform vec3 uWorld,uSun,uSunDirection,uAir;
    uniform float uCloudMaximumRay,uCloudStepScale;
    ${density.glsl}
    ${light.glsl}
    bool cloudRayBox(vec3 origin,vec3 ray,vec3 low,vec3 high,float first,float last,out vec2 span){
      vec3 inv=vec3(abs(ray.x)<1e-12?1e20:1./ray.x,abs(ray.y)<1e-12?1e20:1./ray.y,abs(ray.z)<1e-12?1e20:1./ray.z),a=(low-origin)*inv,b=(high-origin)*inv;
      vec3 n=min(a,b),f=max(a,b);span=vec2(max(first,max(n.x,max(n.y,n.z))),min(last,min(f.x,min(f.y,f.z))));return span.y>span.x;
    }
    bool cloudSubstrateSpan(vec3 origin,vec3 ray,float first,float last,out vec2 span){
      vec3 q=(origin-${vector(s.centre)})/${vector(s.radii)},d=ray/${vector(s.radii)};float A=dot(d,d),B=dot(q,d),D=B*B-A*(dot(q,q)-1.);span=vec2(last);
      if(D<=0.)return false;float root=sqrt(D);span=vec2(max(first,(-B-root)/A),min(last,(-B+root)/A));return span.y>span.x;
    }
    float cloudHg(float cosine){float g=.25;return(1.-g*g)/(12.5663706*pow(max(.001,1.+g*g-2.*g*cosine),1.5));}
    vec4 cloudIntegrateSegment(vec3 origin,vec3 ray,float minimumRay,float maximumRay){
      vec2 worldSpan;if(!cloudRayBox(origin,ray,${vector(c.bounds.min)},${vector(c.bounds.max)},minimumRay,maximumRay,worldSpan))return vec4(0.);
      float start=worldSpan.x,end=worldSpan.y,cursor=start,T=1.;vec3 sum=vec3(0.);
      vec2 bankSpan,substrateSpan;bool bankHit=cloudRayBox(origin,ray,${vector(o.low)},${vector(o.high)},start,end,bankSpan),substrateHit=cloudSubstrateSpan(origin,ray,start,end,substrateSpan);
      vec4 hgA=vec4(cloudHg(ray.x),cloudHg(-ray.x),cloudHg(ray.y),cloudHg(-ray.y));vec2 hgB=vec2(cloudHg(ray.z),cloudHg(-ray.z));
      float normalization=dot(hgA,vec4(1.))+dot(hgB,vec2(1.)),sunPhase=cloudHg(dot(ray,uSunDirection));
      for(int i=0;i<256;i++){
        if(cursor>=end-.00001||T<.025)break;
        bool inBank=bankHit&&cursor>=bankSpan.x-.00001&&cursor<bankSpan.y-.00001,inSubstrate=substrateHit&&cursor>=substrateSpan.x-.00001&&cursor<substrateSpan.y-.00001;
        if(!inBank&&!inSubstrate){float nextStart=end;if(bankHit&&bankSpan.x>cursor)nextStart=min(nextStart,bankSpan.x);if(substrateHit&&substrateSpan.x>cursor)nextStart=min(nextStart,substrateSpan.x);cursor=nextStart;continue;}
        float segmentEnd=end;bool activeBank=false;
        if(inBank){
          vec3 cell=floor((origin+ray*cursor-${vector(o.low)})/${scalar(o.cell)}+sign(ray)*.0001);cell=clamp(cell,vec3(0.),${vector(o.dims.map(n=>n-1))});
          activeBank=texelFetch(uCloudOccupancy,ivec3(cell),0).r>.5;
          vec3 plane=${vector(o.low)}+(cell+step(vec3(0.),ray))*${scalar(o.cell)};
          vec3 hits=vec3(abs(ray.x)<1e-12?1e20:(plane.x-origin.x)/ray.x,abs(ray.y)<1e-12?1e20:(plane.y-origin.y)/ray.y,abs(ray.z)<1e-12?1e20:(plane.z-origin.z)/ray.z);
          segmentEnd=min(segmentEnd,min(bankSpan.y,min(hits.x,min(hits.y,hits.z))));
        }else if(bankHit&&bankSpan.x>cursor)segmentEnd=min(segmentEnd,bankSpan.x);
        if(inSubstrate)segmentEnd=min(segmentEnd,substrateSpan.y);else if(substrateHit&&substrateSpan.x>cursor)segmentEnd=min(segmentEnd,substrateSpan.x);
        if(!activeBank&&!inSubstrate){cursor=max(segmentEnd,cursor+.00001);continue;}
        float stepSize=min((activeBank?min(8.,1.+.015*cursor):8.)*uCloudStepScale,segmentEnd-cursor);
        if(stepSize<=.000001){cursor+=.00001;continue;}
        float depth=cursor+stepSize*.5;vec3 p=origin+ray*depth;float rho=field(p);
        if(rho>.02&&activeBank){stepSize=min(stepSize,min(4.,.5+.003*cursor+.005*max(0.,cursor-250.))*uCloudStepScale);depth=cursor+stepSize*.5;p=origin+ray*depth;rho=field(p);}
        cursor+=stepSize;if(rho<.0001)continue;
        vec4 a;vec3 b;cloudLightTransmission(p,a,b);
        float visible=(dot(a,hgA)+dot(b.xy,hgB))/max(normalization,.000001);
        vec3 colour=${vector(c.albedoLinear)}*(uWorld*visible+uSun*sunPhase*b.z);colour=mix(uAir,colour,exp(-.0009*depth));
        float alpha=1.-exp(-rho*stepSize);sum+=T*alpha*colour;T*=1.-alpha;
      }
      return vec4(sum,1.-T);
    }
    vec4 cloudIntegrateRay(vec3 origin,vec3 ray,float maximumRay){return cloudIntegrateSegment(origin,ray,0.,maximumRay);}
  `;
}

export async function createCloudVolumeLive(h,C,air){
  const {THREE,renderer}=h,density=await loadCloudLiveDensity({baked:C.baked,renderer,THREE});
  const source=C.baked.manifest.bake.sourceNightLighting,background=source.world.backgrounds[0],sun=source.lights.find(l=>l.type==='SUN'),presets=C.baked.manifest.bake.presets;
  const sunB=new THREE.Vector3(0,0,1),rotation=sun.rotationBlender;
  sunB.applyAxisAngle(new THREE.Vector3(1,0,0),rotation[0]).applyAxisAngle(new THREE.Vector3(0,1,0),rotation[1]).applyAxisAngle(new THREE.Vector3(0,0,1),rotation[2]);
  const sunDirection=new THREE.Vector3(sunB.x,sunB.z,-sunB.y).normalize();
  const sourceIdentity={sourceBlendSha256:C.baked.manifest.bake.sourceBlendSha256,sourceFieldSha256:C.baked.manifest.cloudLiveDensity.sourceFieldSha256};
  const light=await createCloudLightVolume({THREE,renderer,density,sourceIdentity,sunDirection,dimensions:[128,64,128]});
  const occupancy=occupancyTexture(THREE,density.contract),opaque=createCloudOpaqueDepth({THREE,renderer,maxDimension:4096,maxPixels:8388608});
  const uniforms={...density.uniforms,...light.uniforms,...opaque.uniforms,uCloudOccupancy:{value:occupancy.texture},uWorld:{value:new THREE.Color()},uSun:{value:new THREE.Color()},uSunDirection:{value:sunDirection},uAir:{value:air.colour},uCloudRadiance:{value:null},uCloudRadianceSize:{value:new THREE.Vector2(1,1)},uCloudPhysicalViewport:{value:new THREE.Vector4()},uCloudInverseProjection:{value:new THREE.Matrix4()},uCloudCameraWorld:{value:new THREE.Matrix4()},uCloudPerspective:{value:1},uCloudMaximumRay:{value:2000},uCloudStepScale:{value:2}};
  const definitions=primaryShader(density,light,occupancy),resolved=cloudDepthComposite({opaqueDepth:opaque,primaryDefinitions:definitions});
  const vertexShader='void main(){gl_Position=vec4(position.xy,0.,1.);}';
  const fragmentHead='out vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n';
  const lowMaterial=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,uniforms,vertexShader,fragmentShader:fragmentHead+resolved.glsl+`void main(){vec2 uv=gl_FragCoord.xy/uCloudRadianceSize;vec3 origin,ray;cloudActualRay(uv,origin,ray);gl_FragColor=cloudIntegrateRay(origin,ray,cloudOpaqueRayLimit(uv,origin,ray,uCloudMaximumRay));}`,depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false});
  const material=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,uniforms,vertexShader,fragmentShader:fragmentHead+resolved.glsl+`void main(){vec2 uv=(gl_FragCoord.xy-uCloudPhysicalViewport.xy)/uCloudPhysicalViewport.zw;bool fallback;gl_FragColor=cloudResolvedRadiance(uv,fallback);}`,depthTest:false,depthWrite:false,transparent:false,blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneMinusSrcAlphaFactor,toneMapped:false});
  const geometry=new THREE.PlaneGeometry(2,2),cloud=new THREE.Mesh(geometry,material),lowQuad=new THREE.Mesh(geometry,lowMaterial),stage=new THREE.Scene(),ortho=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  cloud.frustumCulled=lowQuad.frustumCulled=false;cloud.renderOrder=2;cloud.userData.cast=false;cloud.userData.cloudVolume={source:19,status:'LOW8 live optical study',depth:'Actual opaque geometry; endpoint-aware upsample, bounded actual-end continuation and thin-silhouette ray fallback',transport:light.describe()};stage.add(lowQuad);C.G.add(cloud);
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,depthBuffer:false,stencilBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});target.texture.colorSpace=THREE.NoColorSpace;target.texture.generateMipmaps=false;uniforms.uCloudRadiance.value=target.texture;
  let key='',rendering=false;
  material.onBeforeRender=(_renderer,scene,camera)=>{
    if(rendering)return;uniforms.uCloudStepScale.value=2;const viewport=renderer.getCurrentViewport(new THREE.Vector4()),parent=renderer.getRenderTarget(),cube=parent?.isWebGLCubeRenderTarget||camera.parent?.isCubeCamera;
    const physical=cube?new THREE.Vector2(viewport.z,viewport.w):renderer.getDrawingBufferSize(new THREE.Vector2());
    const scale=Math.min(.25,192/physical.x),width=Math.max(16,Math.ceil(physical.x*scale)),height=Math.max(16,Math.ceil(physical.y*scale));
    uniforms.uCloudPhysicalViewport.value.copy(viewport);uniforms.uCloudInverseProjection.value.copy(camera.projectionMatrixInverse);uniforms.uCloudCameraWorld.value.copy(camera.matrixWorld);uniforms.uCloudPerspective.value=camera.isPerspectiveCamera?1:0;uniforms.uCloudMaximumRay.value=camera.far;
    opaque.render({scene,camera,width:physical.x,height:physical.y,exclude:[cloud]});
    const next=[width,height,opaque.revision??opaque.metadata?.revision,density.uniforms.uTime.value,uniforms.uCloudLightMix.value,...uniforms.uWorld.value.toArray(),...uniforms.uSun.value.toArray(),...camera.matrixWorld.elements,...camera.projectionMatrix.elements].join(',');
    if(next===key)return;
    const saved={target:parent,face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),test:renderer.getScissorTest(),clear:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha(),auto:renderer.autoClear,xr:renderer.xr.enabled,tone:renderer.toneMapping,color:renderer.outputColorSpace,shadow:renderer.shadowMap.enabled};rendering=true;
    try{
      if(target.width!==width||target.height!==height)target.setSize(width,height);uniforms.uCloudRadianceSize.value.set(width,height);
      renderer.xr.enabled=false;renderer.shadowMap.enabled=false;renderer.autoClear=true;renderer.toneMapping=THREE.NoToneMapping;renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
      uniforms.uCloudStepScale.value=1;renderer.setScissorTest(false);renderer.setClearColor(0,0);renderer.setRenderTarget(target);renderer.clear();renderer.render(stage,ortho);key=next;
    }finally{
      renderer.setViewport(saved.viewport);renderer.setScissor(saved.scissor);renderer.setScissorTest(saved.test);renderer.setRenderTarget(saved.target,saved.face,saved.mip);renderer.setClearColor(saved.clear,saved.alpha);renderer.autoClear=saved.auto;renderer.xr.enabled=saved.xr;renderer.toneMapping=saved.tone;renderer.outputColorSpace=saved.color;renderer.shadowMap.enabled=saved.shadow;uniforms.uCloudStepScale.value=2;rendering=false;
    }
    cloud.userData.cloudVolume.radianceSize=[width,height];cloud.userData.cloudVolume.opaqueSize=physical.toArray();
  };
  const looks=[{world:background.colour,strength:background.strength,sun:sun.linearColour,energy:sun.energy},presets.dusk,presets.day];
  const update=(dt)=>{light.update(dt);const weights=C.baked.lightingState().weights;for(const[name,field,factor]of[['uWorld','world','strength'],['uSun','sun','energy']])uniforms[name].value.setRGB(...[0,1,2].map(channel=>looks.reduce((sum,look,i)=>sum+look[field][channel]*look[factor]*weights[i],0)));};
  update(0);C.up.push(update);C.disposers.push(()=>{light.dispose();density.dispose();opaque.dispose();occupancy.texture.dispose();target.dispose();material.dispose();lowMaterial.dispose();geometry.dispose();});
  return cloud;
}
