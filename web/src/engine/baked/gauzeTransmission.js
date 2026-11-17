import {DataTexture,RedFormat,UnsignedByteType,LinearFilter,LinearMipmapLinearFilter,RepeatWrapping,ClampToEdgeWrapping,NoColorSpace,Vector3,Matrix4,Color,ShaderChunk} from 'three';
import {makeGauzeMaskData} from './gauzeMask.js';

const boundMaterials=new WeakMap();
export const GAUZE_CANDLE_REFERENCE=Object.freeze({watts:2,cameraPreExposure:40,cameraExposureEV:.35,revision:4,pointRadiusMetres:.004,linearColor:Object.freeze([1,.43,.13]),diffuseTransmissionWeight:.065,diffuseReflectionWeight:.35,shadowTransmissionScale:.022});
export function gauzeTransmissionColour(cssColour,scale=.22){
 const c=new Color(cssColour),peak=Math.max(c.r,c.g,c.b,1e-8);
 return new Vector3(c.r,c.g,c.b).multiplyScalar(scale/peak);
}

// A small CPU BVH of the actual deformed cloth triangles. The light is inside
// the shade: a ray meeting cloth is filtered; a ray leaving a true aperture is
// unfiltered. Caps/ribs/cup remain ordinary opaque point-shadow casters.
export function makeGauzeDirectionMask(geometry,origin,{width=128,height=64}={}){
 const result=makeGauzeMaskData(geometry,origin,{width,height});
 const {data}=result;
 const texture=new DataTexture(data,width,height,RedFormat,UnsignedByteType);texture.colorSpace=NoColorSpace;
 texture.wrapS=RepeatWrapping;texture.wrapT=ClampToEdgeWrapping;texture.magFilter=LinearFilter;texture.minFilter=LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
 return{...result,texture};
}

const filterGLSL=`
#if NUM_POINT_LIGHTS > 0
uniform float uGauzeFilterEnabled;
uniform vec3 uGauzeFilterPoint,uGauzeFilterRGB;
uniform mat4 uGauzeWorldInverse;
uniform sampler2D uGauzeDirectionMask;
void getPointLightInfo(const in PointLight pointLight,const in vec3 geometryPosition,out IncidentLight light){
 getGauzeOriginalPointLightInfo(pointLight,geometryPosition,light);
 vec3 visitorView=(viewMatrix*vec4(uGauzeFilterPoint,1.)).xyz;
 if(uGauzeFilterEnabled>.5&&distance(pointLight.position,visitorView)<.002){
  vec3 worldDirection=inverseTransformDirection(geometryPosition-pointLight.position,viewMatrix);
  vec3 localDirection=normalize(mat3(uGauzeWorldInverse)*worldDirection);
  vec2 directionUV=vec2(atan(localDirection.z,localDirection.x)/6.28318530718+.5,acos(clamp(localDirection.y,-1.,1.))/3.14159265359);
  float clothCoverage=texture2D(uGauzeDirectionMask,directionUV).r;
  light.color*=mix(vec3(1.),uGauzeFilterRGB,clothCoverage);
 }
}
#endif
`;

export function createGauzeTransmission(){
 const uniforms={uGauzeFilterEnabled:{value:0},uGauzeFilterPoint:{value:new Vector3()},uGauzeFilterRGB:{value:new Vector3(1,1,1)},uGauzeWorldInverse:{value:new Matrix4()},uGauzeDirectionMask:{value:null}};
 let mask=null,frame=null;
 const state={uniforms,
  configure({cloth,pointLocal,colour,shadowTransmissionScale=.22,frame:actualFrame}){
   if(!cloth?.isMesh||!actualFrame?.isObject3D||!pointLocal?.isVector3)throw Error('Actual cloth mesh, local point and lantern frame required');
   actualFrame.updateWorldMatrix(true,true);cloth.updateWorldMatrix(true,false);
   const localPoint=cloth.worldToLocal(actualFrame.localToWorld(pointLocal.clone()));
   const next=makeGauzeDirectionMask(cloth.geometry,localPoint);mask?.texture.dispose();mask=next;frame=cloth;
   uniforms.uGauzeDirectionMask.value=mask.texture;uniforms.uGauzeFilterRGB.value.copy(gauzeTransmissionColour(colour,shadowTransmissionScale));uniforms.uGauzeFilterEnabled.value=1;
   return{width:mask.width,height:mask.height,triangles:mask.triangles,texelBytes:mask.data.length,throughput:uniforms.uGauzeFilterRGB.value.toArray(),scope:mask.scope};
  },
  update(light){
   if(!frame||!light)return;frame.updateWorldMatrix(true,false);uniforms.uGauzeWorldInverse.value.copy(frame.matrixWorld).invert();light.updateWorldMatrix(true,false);light.getWorldPosition(uniforms.uGauzeFilterPoint.value);
  },
  disable(){uniforms.uGauzeFilterEnabled.value=0;frame=null;mask?.texture.dispose();mask=null;uniforms.uGauzeDirectionMask.value=null;},
  dispose(){state.disable();},
  install(material){
   const owner=boundMaterials.get(material);if(owner){if(owner!==state)throw Error('Receiver must be cloned before changing its lantern transport owner');return material;}
   const compile=material.onBeforeCompile,key=material.customProgramCacheKey.call(material);
   material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer);
    if(!shader.fragmentShader.includes('#include <lights_pars_begin>'))throw Error('Gauze transport requires actual Three standard light definitions');
    const original=ShaderChunk.lights_pars_begin.replace('void getPointLightInfo(','void getGauzeOriginalPointLightInfo(');
    if(original===ShaderChunk.lights_pars_begin)throw Error('Pinned Three point-light definition changed');
    Object.assign(shader.uniforms,uniforms);shader.fragmentShader=shader.fragmentShader.replace('#include <lights_pars_begin>',original+filterGLSL);
   };
   material.customProgramCacheKey=()=>key+'-actual-gauze-directional-transmission-v1';material.needsUpdate=true;boundMaterials.set(material,state);return material;
  },
 };
 return state;
}
