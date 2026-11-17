import { ShaderChunk } from 'three';

const installed=new WeakMap();
const number=value=>value.toFixed(9);
// A fixed area-uniform disk. No screen-space hash, frame counter or noise.
const filterOffsets=Array.from({length:32},(_,i)=>{
  const radius=Math.sqrt((i+.5)/32),angle=i*2.399963229728653;
  return [radius*Math.cos(angle),radius*Math.sin(angle)];
});
const reverseFive=i=>((i&1)<<4)|((i&2)<<2)|(i&4)|((i&8)>>2)|((i&16)>>4);
const filterCode=filterOffsets.map(([x,y],i)=>{
  const px=((i*13)%32+.5)/32-.5,py=(reverseFive(i)+.5)/32-.5;
  // The physical source disk and the shader pixel are separate integrals.
  // Zero-mean pixel offsets preserve the source radius rather than inflating it.
  return `visibility+=texture2DCompare(shadowMap,cubeToUV(normalize(direction+(tangent*${number(x)}+bitangent*${number(y)})*filterAngle+shadowPixelDx*${number(px)}+shadowPixelDy*${number(py)}),texelY),receiverDepth+shadowDepthDx*${number(px)}+shadowDepthDy*${number(py)});`;
}).join('\n');
const finiteShadowGLSL=`
#if defined(USE_SHADOWMAP) && NUM_POINT_LIGHT_SHADOWS > 0
varying vec3 vVisitorShadowWorld;
uniform vec3 uVisitorShadowPosition;
uniform float uVisitorSourceRadius,uVisitorShadowMatchTolerance;
float visitorFiniteShadowCache=-1.;

vec2 visitorBlocker(sampler2D shadowMap,vec3 direction,float texelY,float receiverDepth,float nearDistance,float depthRange){
  float stored=unpackRGBAToDepth(texture2D(shadowMap,cubeToUV(direction,texelY)));
  float blocked=1.-step(receiverDepth,stored);
  return vec2((nearDistance+stored*depthRange)*blocked,blocked);
}

float getPointShadow(sampler2D shadowMap,vec2 shadowMapSize,float shadowBias,float shadowRadius,vec4 shadowCoord,float shadowCameraNear,float shadowCameraFar){
  // Derivatives precede fragment-varying exits. The two diagonal lengths bound
  // every corner of the shader pixel's direction-space parallelogram.
  float footprintDistance=max(length(shadowCoord.xyz),.000001);
  vec3 footprintDirection=shadowCoord.xyz/footprintDistance;
  vec3 shadowPixelDx=dFdx(footprintDirection),shadowPixelDy=dFdy(footprintDirection);
  float footprintDepth=(footprintDistance-shadowCameraNear)/(shadowCameraFar-shadowCameraNear)+shadowBias;
  float shadowDepthDx=dFdx(footprintDepth),shadowDepthDy=dFdy(footprintDepth);
  float pixelHalf=.5*max(length(shadowPixelDx+shadowPixelDy),length(shadowPixelDx-shadowPixelDy));
  #ifdef SHADOWMAP_TYPE_VSM
    return getVisitorOriginalPointShadow(shadowMap,shadowMapSize,shadowBias,shadowRadius,shadowCoord,shadowCameraNear,shadowCameraFar);
  #endif
  // The varying contains the normal-biased light-to-receiver vector. Recover
  // the light centre to select only this visitor; all other lights stay Three.
  if(uVisitorSourceRadius<=0.||distance(vVisitorShadowWorld-shadowCoord.xyz,uVisitorShadowPosition)>uVisitorShadowMatchTolerance)
    return getVisitorOriginalPointShadow(shadowMap,shadowMapSize,shadowBias,shadowRadius,shadowCoord,shadowCameraNear,shadowCameraFar);
  if(visitorFiniteShadowCache>=0.)return visitorFiniteShadowCache;
  float receiverDistance=length(shadowCoord.xyz),depthRange=shadowCameraFar-shadowCameraNear;
  if(receiverDistance<=max(shadowCameraNear,uVisitorSourceRadius)||receiverDistance>=shadowCameraFar)
    return getVisitorOriginalPointShadow(shadowMap,shadowMapSize,shadowBias,shadowRadius,shadowCoord,shadowCameraNear,shadowCameraFar);
  vec3 direction=shadowCoord.xyz/receiverDistance;
  vec3 up=abs(direction.y)<.95?vec3(0.,1.,0.):vec3(1.,0.,0.);
  vec3 tangent=normalize(cross(up,direction)),bitangent=cross(direction,tangent);
  float texelY=1./(shadowMapSize.y*2.);
  float receiverDepth=(receiverDistance-shadowCameraNear)/depthRange+shadowBias;
  float centreStored=unpackRGBAToDepth(texture2D(shadowMap,cubeToUV(direction,texelY)));
  float centreDistance=shadowCameraNear+centreStored*depthRange;
  float centreBlocked=1.-step(receiverDepth,centreStored);
  vec2 blockers=vec2(centreDistance*centreBlocked,centreBlocked);
  // Preserve measured near-source blocker distances. Clamping a cup/cap to
  // the emitter radius would fabricate a farther blocker and a harder penumbra.
  float minimumBlocker=shadowCameraNear;
  float provisional=mix(minimumBlocker,max(minimumBlocker,centreDistance),centreBlocked);
  float footprint=abs(shadowRadius)*texelY;
  float searchAngle=max(footprint,uVisitorSourceRadius*max(0.,receiverDistance-provisional)/(receiverDistance*provisional))+pixelHalf;
  blockers+=visitorBlocker(shadowMap,normalize(direction+tangent*(searchAngle*.22)),texelY,receiverDepth,shadowCameraNear,depthRange);
  blockers+=visitorBlocker(shadowMap,normalize(direction+(-.737368878*tangent+.675490294*bitangent)*(searchAngle*.53)),texelY,receiverDepth,shadowCameraNear,depthRange);
  blockers+=visitorBlocker(shadowMap,normalize(direction+(.087425725*tangent-.996171041*bitangent)*(searchAngle*.86)),texelY,receiverDepth,shadowCameraNear,depthRange);
  bool hasBlocker=blockers.y>=.5;
  float blockerDistance=max(minimumBlocker,blockers.x/max(1.,blockers.y));
  // Similar triangles: penumbra metres at receiver = R*(dR-dB)/dB.
  // Convert to a direction-space radius by dividing by dR, not atlas texels.
  float physicalAngle=hasBlocker?uVisitorSourceRadius*max(0.,receiverDistance-blockerDistance)/(blockerDistance*receiverDistance):0.;
  // Even if four search taps miss a thin rib, integrate its pixel coverage.
  // The radial-depth derivatives keep that integration on the receiver plane.
  float filterAngle=max(physicalAngle,footprint),visibility=0.;
  ${filterCode}
  visitorFiniteShadowCache=visibility/32.;return visitorFiniteShadowCache;
}
#endif
`;

/** One state per actual visitor light. Mutate lightWorld in place each frame. */
export function createVisitorShadow({lightWorld,sourceRadius,matchTolerance=.002}){
  if(!lightWorld?.isVector3)throw new TypeError('Use the actual visitor PointLight world-position Vector3.');
  if(!Number.isFinite(sourceRadius)||sourceRadius<0)throw new RangeError('Source radius must be nonnegative metres from the authored light.');
  if(!Number.isFinite(matchTolerance)||matchTolerance<=0)throw new RangeError('Invalid visitor shadow position tolerance.');
  const uniforms={uVisitorShadowPosition:{value:lightWorld},uVisitorSourceRadius:{value:sourceRadius},uVisitorShadowMatchTolerance:{value:matchTolerance}};
  const state={position:lightWorld,uniforms,metadata:{method:'Point-PCSS approximation using actual RGBA-packed radial depth and shader-pixel coverage',blockerSamples:4,filterSamples:32,maximumDepthFetches:36,sourceRadiusMetres:sourceRadius,minimumBlocker:'Actual shadow-camera near distance',screenFootprint:'32 fixed stratified pixel-parallelogram samples with radial-depth derivatives',otherLights:'Original Three point-shadow path',temporalRandomness:false,extraRenderTargets:0,cpuGpuReadback:false},
    setSourceRadius(radius){if(!Number.isFinite(radius)||radius<0)throw new RangeError('Invalid source radius.');uniforms.uVisitorSourceRadius.value=radius;state.metadata.sourceRadiusMetres=radius;},
    copyLightPosition(light){if(!light?.isPointLight)throw new TypeError('Expected the actual visitor PointLight.');light.updateWorldMatrix(true,false);light.getWorldPosition(lightWorld);},
    install(material){
      if(!material?.isMaterial)throw new TypeError('Expected an owned receiver material.');
      const owner=installed.get(material);if(owner){if(owner!==state)throw new Error('Clone the receiver material before binding a different visitor light.');return material;}
      // Capture before wrapping: Three's default key reads onBeforeCompile
      // dynamically, so calling it afterward would lose the previous hook key.
      const compile=material.onBeforeCompile,key=material.customProgramCacheKey.call(material);
      material.onBeforeCompile=(shader,renderer)=>{
        compile.call(material,shader,renderer);
        if(!shader.fragmentShader.includes('#include <shadowmap_pars_fragment>')||!shader.vertexShader.includes('#include <worldpos_vertex>'))throw new Error('Visitor shadow requires the standard Three shadow/world-position chunks.');
        Object.assign(shader.uniforms,uniforms);
        shader.vertexShader='#if defined(USE_SHADOWMAP) && NUM_POINT_LIGHT_SHADOWS > 0\nvarying vec3 vVisitorShadowWorld;\n#endif\n'+shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\n#if defined(USE_SHADOWMAP) && NUM_POINT_LIGHT_SHADOWS > 0\nvVisitorShadowWorld=worldPosition.xyz;\n#endif');
        const original=ShaderChunk.shadowmap_pars_fragment.replace('float getPointShadow(','float getVisitorOriginalPointShadow(');
        shader.fragmentShader=shader.fragmentShader.replace('#include <shadowmap_pars_fragment>',original+finiteShadowGLSL);
      };
      material.customProgramCacheKey=()=>key+'-visitor-finite-source-shadow-b4-f32-pixel-v2';
      material.needsUpdate=true;installed.set(material,state);return material;
    },
  };
  return state;
}
