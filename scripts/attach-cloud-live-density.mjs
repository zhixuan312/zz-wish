// Attach the source-bound live field to a complete Cloud delivery. The audited
// input package and immutable typed cache remain separate build artifacts.
import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {resolve,join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync,zstdDecompressSync} from 'node:zlib';
const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
for(const key of ['--input','--cache','--out'])if(!option(key))throw Error('Use --input complete-Cloud-delivery --cache typed-cache --out fresh-delivery');
const input=resolve(option('--input')),cache=resolve(option('--cache')),out=resolve(option('--out'));
if(input===out)throw Error('Keep the input delivery immutable');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const original=await readFile(join(input,'manifest.json')),manifest=JSON.parse(original);
if(manifest.place!=='cloud-cliff'||manifest.partialPreview)throw Error('A complete Cloud package is required');
for(const looks of Object.values(manifest.lightmaps))for(const name of ['night','dusk','day','lamp'])if(looks[name]?.samples<64||looks[name]?.bakeDevice!=='METAL'||looks[name]?.denoiseDevice!=='METAL')throw Error('All12 actual64 Metal/Metal maps are required');
await mkdir(out,{recursive:true});if((await readdir(out)).length)throw Error('New empty output required');
let model;
for(const file of manifest.files){
  if(file.uri!==basename(file.uri))throw Error('Local declared files only');
  const bytes=await readFile(join(input,file.uri));if(bytes.length!==file.bytes||sha(bytes)!==file.sha256)throw Error('Changed input '+file.uri);
  await copyFile(join(input,file.uri),join(out,file.uri));
  if(file.uri===manifest.scene){model=file.encoding==='gzip'?gunzipSync(bytes):file.encoding==='zstd'?zstdDecompressSync(bytes):bytes;}
}
if(!model||model.readUInt32LE(0)!==0x46546c67)throw Error('Actual declared binary glTF required');
const json=JSON.parse(model.subarray(20,20+model.readUInt32LE(12)).toString('utf8'));
const field=json.scenes[json.scene??0].extras?.cloud_cliff_live_clouds;
if(typeof field!=='string')throw Error('Actual delivered GLB must contain the authored field');
const metadataBytes=await readFile(join(cache,'cloud-live-density.json')),metadata=JSON.parse(metadataBytes);
if(metadata.sourceBlendSha256!==manifest.bake.sourceBlendSha256||metadata.sourceFieldSha256!==sha(Buffer.from(field)))throw Error('Cache and actual source/GLB field differ');
for(const [role,file] of Object.entries(metadata.textures)){
  if(file.uri!==basename(file.uri))throw Error('Local cache files only');
  const bytes=await readFile(join(cache,file.uri));if(bytes.length!==file.bytes||sha(bytes)!==file.sha256)throw Error('Changed cache '+role);
  await copyFile(join(cache,file.uri),join(out,file.uri));manifest.files.push({uri:file.uri,bytes:bytes.length,sha256:sha(bytes),role:'source19-live-density-'+role});
}
await copyFile(join(cache,'cloud-live-density.json'),join(out,'cloud-live-density.json'));
const entry={uri:'cloud-live-density.json',bytes:metadataBytes.length,sha256:sha(metadataBytes),sourceBlendSha256:metadata.sourceBlendSha256,sourceFieldSha256:metadata.sourceFieldSha256};
manifest.files.push({...entry,role:'source19-live-density-metadata'});manifest.cloudLiveDensity=entry;
manifest.liveCloudPolicy={sourceContractVersion:7,geometrySource:19,density:'Live source noise, fixed supports, measured R8 smooth-envelope interpolation',lightGrid:[128,64,128],lightPhaseSeconds:4,primaryBufferMaximumWidth:192,primaryBufferScaleMaximum:.25,highResolutionRayStepScale:2,opaqueViewDepth:'Actual opaque geometry, endpoint-aware front integration and high-variation contact rays',transport:'Six-axis normalized HG and oriented SUN source-medium prefix fields; coarse spatial interpolation',motion:'Completed phase interpolation; the source simulation clock holds if the producer falls behind',limits:['Directional opaque-light occlusion and near1m light refinement are not active.','Measured short M1 phone-emulation smoke52.2FPS; desktop20.1FPS remains a limitation.','Typed cache GPU texels26,536,032B, plus prefix/depth/radiance targets and material/lightmap textures.']};
manifest.payloadBytes=manifest.totalBytes=manifest.files.reduce((sum,file)=>sum+file.bytes,0);
let serialized;for(let i=0;i<10;i++){
  serialized=JSON.stringify(manifest)+'\n';const size=Buffer.byteLength(serialized);
  if(manifest.manifestBytes===size&&manifest.completePackageBytes===manifest.payloadBytes+size)break;
  manifest.manifestBytes=size;manifest.completePackageBytes=manifest.payloadBytes+size;
}
serialized=JSON.stringify(manifest)+'\n';if(Buffer.byteLength(serialized)!==manifest.manifestBytes||manifest.completePackageBytes>10000000)throw Error('Complete byte count failed');
await writeFile(join(out,'manifest.json'),serialized);
console.log('CLOUD_LIVE_ATTACHED',JSON.stringify({files:manifest.files.length,manifestSha256:sha(Buffer.from(serialized)),payloadBytes:manifest.payloadBytes,manifestBytes:manifest.manifestBytes,completePackageBytes:manifest.completePackageBytes,sourceBlendSha256:manifest.bake.sourceBlendSha256}));
