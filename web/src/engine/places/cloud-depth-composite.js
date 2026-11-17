// Staged integration building block only. No production descriptor imports it.
// The caller supplies the same primary integrator for low-res and edge rays.
export function cloudDepthComposite({ opaqueDepth, primaryDefinitions, integrateFunction='cloudIntegrateRay' }) {
  if (!opaqueDepth?.glsl || !opaqueDepth?.uniforms || !/^[A-Za-z_]\w*$/.test(integrateFunction)) throw new TypeError('Actual opaque-depth helper and a named common integrator required');
  if (typeof primaryDefinitions !== 'string' || /gl_FragDepth|terrainHeight\s*\(/.test(primaryDefinitions)) throw new Error('Authoritative opaque endpoints require a primary integrator without first-scatter depth or heightfield stopping');
  const glsl = `
    uniform sampler2D uCloudRadiance;
    uniform vec2 uCloudRadianceSize;
    uniform vec4 uCloudPhysicalViewport;
    uniform mat4 uCloudInverseProjection,uCloudCameraWorld;
    uniform float uCloudPerspective;
    ${opaqueDepth.glsl}
    void cloudActualRay(vec2 uv,out vec3 origin,out vec3 direction){
      vec4 nearClip=uCloudInverseProjection*vec4(uv*2.-1.,-1.,1.);
      vec4 farClip=uCloudInverseProjection*vec4(uv*2.-1.,1.,1.);
      vec3 a=(uCloudCameraWorld*vec4(nearClip.xyz/nearClip.w,1.)).xyz;
      vec3 b=(uCloudCameraWorld*vec4(farClip.xyz/farClip.w,1.)).xyz;
      origin=uCloudPerspective>.5?uCloudCameraWorld[3].xyz:a;
      direction=normalize(b-origin);
    }
    vec2 cloudOpaqueEndpoint(vec2 uv){
      vec4 opaquePacked=texture(uCloudOpaqueDepth,uv);
      if(all(equal(opaquePacked,vec4(1.))))return vec2(uCloudOpaqueRange,1.);
      return vec2(dot(opaquePacked,(255./256.)/vec4(16777216.,65536.,256.,1.))*uCloudOpaqueRange,0.);
    }
    float cloudEndpointRoundoff(float viewZ){
      // Eight actual Float32 ULPs plus RGBA packing units. This guards codec
      // arithmetic only; it never moves an opaque surface or ray endpoint.
      return 8.*exp2(floor(log2(max(viewZ,1e-12)))-23.)+4.*uCloudOpaqueRange/4294967296.;
    }
    bool cloudCompatibleEndpoint(vec2 current,vec2 other,vec2 deltaUv){
      if(current.y>.5||other.y>.5)return current.y==other.y;
      float roundoff=max(cloudEndpointRoundoff(current.x),cloudEndpointRoundoff(other.x));
      // Do not reuse a low-res ray that integrated farther than this pixel's
      // actual opaque endpoint. Closer rays are admitted only over a bounded
      // screen footprint; all-mismatch pixels use their own common integrator.
      vec2 footprint=2.*current.x*vec2(abs(uCloudInverseProjection[0][0]),abs(uCloudInverseProjection[1][1]))*abs(deltaUv);
      float nearby=4.*length(footprint)+roundoff;
      return other.x<=current.x+roundoff&&current.x-other.x<=nearby;
    }
    ${primaryDefinitions}
    vec4 cloudResolvedRadiance(vec2 uv,out bool usedFullResolutionRay){
      vec2 endpoint=cloudOpaqueEndpoint(uv),q=uv*uCloudRadianceSize-.5,base=floor(q),fraction=q-base;
      vec3 origin,direction;cloudActualRay(uv,origin,direction);
      vec3 originView=(uCloudOpaqueView*vec4(origin,1.)).xyz;float directionViewZ=(mat3(uCloudOpaqueView)*direction).z;
      float actualEnd=cloudOpaqueRayLimit(uv,origin,direction,uCloudMaximumRay);
      vec4 sum=vec4(0.);float weightSum=0.,prefixEndSum=0.,minimumAlpha=1.,maximumAlpha=0.;bool crossesSilhouette=false;
      for(int y=0;y<2;y++)for(int x=0;x<2;x++){
        ivec2 texel=ivec2(clamp(base+vec2(x,y),vec2(0.),uCloudRadianceSize-1.));
        vec2 sampleUv=(vec2(texel)+.5)/uCloudRadianceSize;
        vec2 otherEndpoint=cloudOpaqueEndpoint(sampleUv);

        vec4 radiance=texelFetch(uCloudRadiance,texel,0);
        minimumAlpha=min(minimumAlpha,radiance.a);maximumAlpha=max(maximumAlpha,radiance.a);crossesSilhouette=crossesSilhouette||(endpoint.y!=otherEndpoint.y);
        if(!cloudCompatibleEndpoint(endpoint,otherEndpoint,sampleUv-uv))continue;
        float weight=(x==0?1.-fraction.x:fraction.x)*(y==0?1.-fraction.y:fraction.y);
        sum+=radiance*weight;weightSum+=weight;
        float otherEnd=otherEndpoint.y>.5?actualEnd:max(0.,(-otherEndpoint.x-originView.z)/directionViewZ);
        prefixEndSum+=min(actualEnd,otherEnd)*weight;
      }
      usedFullResolutionRay=weightSum<1e-6||crossesSilhouette||(endpoint.y<.5&&maximumAlpha-minimumAlpha>.008);
      if(!usedFullResolutionRay){
        vec4 front=sum/weightSum;
        if(endpoint.y<.5&&front.a>.001){
          // Every accepted prefix ends before this pixel's actual surface.
          // Continue only that bounded missing segment, retaining front
          // radiance/T instead of re-integrating the whole cloud-covered rock.
          float prefixEnd=min(actualEnd,prefixEndSum/weightSum);
          vec4 tail=cloudIntegrateSegment(origin,direction,prefixEnd,actualEnd);
          return vec4(front.rgb+(1.-front.a)*tail.rgb,1.-(1.-front.a)*(1.-tail.a));
        }
        return front;
      }
      float end=actualEnd;
      return ${integrateFunction}(origin,direction,end);
    }
  `;
  return {
    glsl,
    uniforms:opaqueDepth.uniforms,
    materialPolicy:{depthTest:false,depthWrite:false,premultipliedLinearRadiance:true},
    metadata:{version:1,status:'CPU-authored isolated integration block, not active or GPU/performance approved',
      opaqueDepth:'Actual full-resolution single-sample geometry endpoint; no parent MSAA depth read, heightfield stop or first-density gl_FragDepth',
      upsample:'Four NEAREST radiance samples, actual endpoint compatibility and renormalized bilinear weights',
      fallback:'Bounded continuation from weighted compatible front integral to actual opaque endpoint; same full primary ray only when every neighbor is incompatible',
      endpointTolerance:'Float32/packed-depth arithmetic bound; nearer-sample spatial gate is four projected pixel footprints, not a surface bias',
      limits:['Full-resolution helper opt-in size guard must be coordinated before first use; current public helper is limited to1024px.',
        'Fallback fragment fraction, SIMD cost, probe cost, total residency and actual M1 timers remain unmeasured.',
        'Keep the exact helper GPU receipt separate from this unexecuted compositor code.']}
  };
}
