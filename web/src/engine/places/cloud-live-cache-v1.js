// Unactivated source7 live-density shader. No public descriptor imports this.
// Transport lighting under motion remains a separate, unresolved cache policy.
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
export const CLOUD_SOURCE19_SHA256='ee3f9f065a72a102867d0bfe7ea9233761cd7db62e98711c993d38cba324bda0';
const fail=message=>{throw new Error(`Cloud live cache: ${message}`);};
const literal=x=>Number.isInteger(x)?`${x}.0`:String(Math.fround(x));
const vec=values=>`vec3(${values.map(literal).join(',')})`;
const validBox=box=>box&&['min','max'].every(key=>Array.isArray(box[key])&&box[key].length===3&&box[key].every(Number.isFinite))&&box.min.every((v,i)=>v<box.max[i]);

/** Strict unused staging loader; an old public source11 delivery is rejected. */
export async function loadCloudLiveDensity({baked,renderer,THREE,base='/places/cloud-cliff/'}){
  const source=baked?.manifest?.bake?.sourceBlendSha256,entry=baked?.manifest?.cloudLiveDensity;
  if(source!==CLOUD_SOURCE19_SHA256||entry?.sourceBlendSha256!==source||!renderer.capabilities.isWebGL2)fail('Actual Source19/WebGL2 staging metadata required');
  const actualField=baked.group?.userData?.cloud_cliff_live_clouds;
  if(typeof actualField!=='string')fail('Actual GLB field text is missing');
  const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(await hash(new TextEncoder().encode(actualField))!==entry.sourceFieldSha256)fail('Actual GLB source field text changed');
  async function download(file){
    if(!file||!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(file.uri)||!Number.isSafeInteger(file.bytes)||file.bytes<=0||!/^[a-f0-9]{64}$/.test(file.sha256))fail('Invalid declared cache file');
    const response=await fetch(base+file.uri);if(!response.ok)fail(`HTTP${response.status} for${file.uri}`);
    const bytes=await response.arrayBuffer();if(bytes.byteLength!==file.bytes||await hash(bytes)!==file.sha256)fail(`Actual cache payload changed:${file.uri}`);return bytes;
  }
  const metadata=JSON.parse(new TextDecoder().decode(await download(entry)));
  if(metadata.version!==1||metadata.status!=='live-density-storage-control-only'||metadata.sourceBlendSha256!==source||metadata.sourceFieldSha256!==entry.sourceFieldSha256)fail('Cache/source/motion contract mismatch');
  const loader=new KTX2Loader().detectSupport(renderer),textures={},disposers=[];
  try{
    for(const role of['envelope','envelopeNear','noiseA','noiseB']){
      const file=metadata.textures[role],bytes=await download(file),url=URL.createObjectURL(new Blob([bytes],{type:'image/ktx2'}));
      let texture;try{texture=await loader.loadAsync(url);}finally{URL.revokeObjectURL(url);}
      disposers.push(()=>texture.dispose());
      const expectedType=role.startsWith('noise')?THREE.HalfFloatType:THREE.UnsignedByteType,expectedFormat=role.startsWith('noise')?THREE.RGBAFormat:THREE.RedFormat;
      if(!texture.isData3DTexture||texture.image.width!==file.dimensions[0]||texture.image.height!==file.dimensions[1]||texture.image.depth!==file.dimensions[2]||texture.type!==expectedType||texture.format!==expectedFormat)fail(`Actual typed3D decode differs:${role}`);
      const raw=texture.image.data;if(await hash(new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength))!==file.decodedSha256)fail(`Actual typed3D values differ:${role}`);
      texture.minFilter=texture.magFilter=role.startsWith('noise')?THREE.NearestFilter:THREE.LinearFilter;
      texture.wrapS=texture.wrapT=texture.wrapR=THREE.ClampToEdgeWrapping;texture.colorSpace=THREE.NoColorSpace;texture.generateMipmaps=false;texture.unpackAlignment=1;texture.needsUpdate=true;
      texture.userData.cloudLiveDensity={...file,role};textures[role]=texture;
    }
  }catch(error){for(const dispose of disposers)dispose();throw error;}finally{loader.dispose();}
  const contract=JSON.parse(actualField),field=cloudLiveCacheV1GLSL({contract,envelope:metadata.envelope});
  const time={value:contract.timeOrigin};
  return{metadata,contract,glsl:field.glsl,uniforms:{uTime:time,uCloudNoiseCornersA:{value:textures.noiseA},uCloudNoiseCornersB:{value:textures.noiseB},uCloudEnvelope:{value:textures.envelope},uCloudEnvelopeNear:{value:textures.envelopeNear}},
    setTime(seconds){if(!Number.isFinite(seconds))fail('Finite actual source-flow seconds required');time.value=seconds;},
    dispose(){for(const dispose of disposers)dispose();}};
}

export function cloudLiveCacheV1GLSL({contract,envelope,mode='cached'}){
  if(contract?.version!==7||contract.banks?.length!==48||contract.bankGroups?.length!==12||contract.nearWisps?.length!==3||contract.noise?.octaves?.length!==3||contract.domainWarp?.additionalNoiseEvaluations!==0)fail('Requires actual child-bank/near-wisp source7 metadata');
  if(!validBox(contract.bounds)||contract.banks.some(bank=>bank.density!==contract.banks[0].density))fail('Invalid source bounds or unequal child-density factorization');
  if(!['cached','literal-envelope-parity-only'].includes(mode))fail('Unknown explicit shader mode');
  if(mode==='cached'&&(!validBox(envelope?.coarse?.bounds)||!validBox(envelope?.near?.bounds)||envelope.coarse.format!=='R8_UNORM'||envelope.near.format!=='R8_UNORM'))fail('Measured matching R8 envelope metadata required');
  const c=contract,w=c.domainWarp,b=c.breakup;
  const nearMaximum=c.nearWisps.map((bank,i)=>`${literal(bank.density)}*cloudLiveWisp${i}(p)`).reduceRight((tail,value)=>tail?`max(${value},${tail})`:value,'');
  const bankEnvelope=(name,bank)=>`float ${name}(vec3 p){vec3 q=(p-${vec(bank.centre)})/${vec(bank.radii)};return 1.-smoothstep(${literal((1-bank.edgeWidth)**2)},1.,dot(q,q));}`;
  const groupMin=c.bankGroups.map(group=>vec(group.expandedCullBounds.min)).join(','),groupMax=c.bankGroups.map(group=>vec(group.expandedCullBounds.max)).join(',');
  const cachedEnvelope=mode==='cached'?`
    uniform highp sampler3D uCloudEnvelope,uCloudEnvelopeNear;
    float cloudLiveMaxEnvelope(vec3 p){
      float E=0.;
      if(cloudLiveInside(p,${vec(envelope.coarse.bounds.min)},${vec(envelope.coarse.bounds.max)}))E=texture(uCloudEnvelope,(p-${vec(envelope.coarse.bounds.min)})/${vec(envelope.coarse.bounds.max.map((v,i)=>v-envelope.coarse.bounds.min[i]))}).r;
      vec3 low=p-${vec(envelope.near.bounds.min)},high=${vec(envelope.near.bounds.max)}-p;
      float edge=min(min(low.x,low.y),min(low.z,min(high.x,min(high.y,high.z))));
      if(edge>0.)E=mix(E,texture(uCloudEnvelopeNear,low/${vec(envelope.near.bounds.max.map((v,i)=>v-envelope.near.bounds.min[i]))}).r,smoothstep(0.,${literal(envelope.blendMetres)},edge));
      return E;
    }`:
    `${c.banks.map((bank,i)=>bankEnvelope(`cloudParityEnvelope${i}`,bank)).join('\n')}
    float cloudLiveMaxEnvelope(vec3 p){float E=0.;${c.banks.map((_,i)=>`E=max(E,cloudParityEnvelope${i}(p));`).join('')}return E;}`;
  const glsl=`
    uniform float uTime;
    uniform highp sampler3D uCloudNoiseCornersA,uCloudNoiseCornersB;
    const vec3 cloudLiveGroupMin[12]=vec3[12](${groupMin});
    const vec3 cloudLiveGroupMax[12]=vec3[12](${groupMax});
    bool cloudLiveInside(vec3 p,vec3 low,vec3 high){return all(greaterThanEqual(p,low))&&all(lessThanEqual(p,high));}
    float cloudLiveNoise(vec3 p){
      vec3 cell=floor(p),f=p-cell,u=f*f*f*(f*(6.*f-15.)+10.);
      vec2 ij=cell.xy-17.*floor(cell.xy/17.);float sum=cell.x+cell.y+cell.z,k=sum-289.*floor(sum/289.);
      uint address=uint(ij.x)+17u*(uint(ij.y)+17u*uint(k));ivec3 at=ivec3(int(address&63u),int((address>>6u)&63u),int(address>>12u));
      vec4 a=texelFetch(uCloudNoiseCornersA,at,0)/288.,b=texelFetch(uCloudNoiseCornersB,at,0)/288.;
      return mix(mix(mix(a.x,a.y,u.x),mix(a.z,a.w,u.x),u.y),mix(mix(b.x,b.y,u.x),mix(b.z,b.w,u.x),u.y),u.z);
    }
    ${bankEnvelope('cloudLiveSubstrate',c.substrate)}
    ${c.nearWisps.map((bank,i)=>bankEnvelope(`cloudLiveWisp${i}`,bank)).join('\n')}
    ${cachedEnvelope}
    float field(vec3 p){
      if(!cloudLiveInside(p,${vec(c.bounds.min)},${vec(c.bounds.max)}))return 0.;
      float haze=${literal(c.substrate.density)}*cloudLiveSubstrate(p);
      float nearDensity=${nearMaximum};
      bool hasBank=false;for(int group=0;group<12;group++){if(cloudLiveInside(p,cloudLiveGroupMin[group],cloudLiveGroupMax[group])){hasBank=true;break;}}
      if(!hasBank&&nearDensity<=0.)return haze;
      vec3 q=p+${vec(c.flowEngine)}*(uTime-${literal(c.timeOrigin)});
      vec3 n=vec3(${c.noise.octaves.map(o=>`clamp(cloudLiveNoise(q*${literal(o.frequency)}+${vec(o.offset)}),0.,1.)`).join(',')});
      float F=clamp(dot(n,${vec(c.noise.octaves.map(o=>o.weight))}),0.,1.);
      vec3 mixture=vec3(${w.octaveMixturesEngine.map(row=>`dot(n,${vec(row)})`).join(',')});
      vec3 warped=p+(mixture*${vec(w.scaleEngine)}+${vec(w.offsetEngine)});
      float child=hasBank?${literal(c.banks[0].density)}*clamp((cloudLiveMaxEnvelope(warped)-(${literal(b.thresholdBase)}-${literal(b.noiseAmplitude)}*F))/${literal(b.normalization)},0.,1.):0.;
      return max(child,nearDensity*(${literal(c.nearWispModulation.scale)}*F+${literal(c.nearWispModulation.base)}))+haze;
    }
  `;
  return{glsl,metadata:{version:1,sourceContractVersion:7,mode,activated:false,sharedNoiseEvaluations:3,hashLookupFetches:6,
    childEnvelopeEvaluations:mode==='cached'?0:48,staticSupports:true,flow:[...c.flowEngine],timeOrigin:c.timeOrigin,
    limits:mode==='cached'?['R8 envelope interpolation is explicitly approximate; use its source-bound spacing/density/ray-error receipt.','Actual GPU hash/source-DAG parity and runtime timing are pending.','Directional illumination under motion is not established by this density module.']:['Tiny point-readback parity diagnostic only; never activate the48-lobe literal variant as a viewport renderer.']}};
}
