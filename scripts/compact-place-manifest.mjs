// Runtime projection of an immutable, fully audited place package. The full
// input manifest/proofs stay in art/build, bound by SHA256 in both derivatives.
import {readFile,writeFile,copyFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join,basename} from 'node:path';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--input','--out','--report'].includes(args[i])||!args[i+1])throw Error('Explicit --input --out --report required');options[args[i]]=resolve(args[i+1]);}
for(const key of['--input','--out','--report'])if(!options[key])throw Error('Missing '+key);
if(options['--input']===options['--out'])throw Error('Audited input must remain immutable');
const sha=b=>createHash('sha256').update(b).digest('hex'),input=await readFile(join(options['--input'],'manifest.json')),original=JSON.parse(input),manifest=structuredClone(original),removed=[];
function project(value,keys,path){
 const result={};for(const[key,item]of Object.entries(value)){
  if(keys.includes(key))result[key]=item;
  else{const bytes=Buffer.from(JSON.stringify(item));removed.push({path:path+'.'+key,canonicalJsonBytes:bytes.length,canonicalJsonSha256:sha(bytes)});}
 }return result;
}
const mapKeys=['uri','scale','maximum','encoding','logRange','logGain','mipLevels','gutterPixels','anisotropy','maxLod','samples','passFilter','quantity','cameraPreExposure','bakeDevice','denoiseDevice','bakeFingerprint','codec','bytes','masterSha256'];
for(const[region,looks]of Object.entries(manifest.lightmaps))for(const[look,map]of Object.entries(looks))looks[look]=project(map,mapKeys,`lightmaps.${region}.${look}`);
// Pine's runtime reads the baked passes and their decoding parameters. The
// full Blender night rig belongs in the immutable audit input.
const sourceRig = manifest.place === 'pine-gate' ? [] : ['sourceNightLighting'];
manifest.bake=project(manifest.bake,['engine','blender','samples','samplesByMap','integrator','sampleBudgetMeaning','nativeInvocations','totalSecondsMeaning','resolution','resolutionByRegion','passes','colorExcluded','materialUV','lightmapUV','runtimeAlias','quantity','lampPassQuantity','passesByLook','cameraPreExposure','residualCameraExposureEV','rawRadiometry','threeLightMapIrradianceMultiplier','denoising','sampling','presets',...sourceRig,'sourceBlendSha256','normalExportRecipe','totalSeconds'],'bake');
for(const key of['lampPassQuantity','passesByLook','cameraPreExposure','residualCameraExposureEV','threeLightMapIrradianceMultiplier','integrator','sampleBudgetMeaning','samplesByMap'])if(JSON.stringify(manifest.bake[key])!==JSON.stringify(original.bake[key]))throw Error('Runtime radiometry/sampling field omitted: '+key);
manifest.compression=project(manifest.compression,['gltfTransform','ktxSoftware','mesh','textures','materialProfile','materialRecipe','lightmapCodec','lightmaps','transformOrder','uniqueMaterialImageBytes','bytesByRoleUnion','positionFormat','normalFormat','normalFilter','positionFilter','generatorSha256','geometryVerificationScope','geometryOptimization','container'],'compression');
manifest.buildEvidence={auditedInputManifestSha256:sha(input),auditedInputManifestBytes:input.length,policy:'Runtime manifest omits bulky per-corner/per-camera/texture audit details only. Immutable full input and every removed canonical JSON field are SHA256-bound by the separate build receipt. Model/map/runtime values are unchanged.',projectionScriptSha256:sha(await readFile(new URL(import.meta.url)))};
await mkdir(options['--out'],{recursive:true});if((await readdir(options['--out'])).length)throw Error('New empty output required');
for(const file of manifest.files){
 if(file.uri!==basename(file.uri))throw Error('Only declared local files supported');
 const bytes=await readFile(join(options['--input'],file.uri));if(bytes.length!==file.bytes||sha(bytes)!==file.sha256)throw Error('Stale input '+file.uri);
 await copyFile(join(options['--input'],file.uri),join(options['--out'],file.uri));
}
manifest.payloadBytes=manifest.files.reduce((sum,file)=>sum+file.bytes,0);manifest.totalBytes=manifest.payloadBytes;
manifest.sharedVisualBytes=(manifest.sharedVisualAssets??[]).reduce((sum,file)=>sum+file.bytes,0);
let serialized;for(let i=0;i<12;i++){
 serialized=JSON.stringify(manifest)+'\n';const size=Buffer.byteLength(serialized);
 if(manifest.manifestBytes===size&&manifest.completePackageBytes===manifest.payloadBytes+size+manifest.sharedVisualBytes)break;
 manifest.manifestBytes=size;manifest.completePackageBytes=manifest.payloadBytes+size+manifest.sharedVisualBytes;
 if(manifest.budget&&manifest.place==='snow-roof')manifest.budget.within15000000Bytes=manifest.completePackageBytes<=15000000;
}
serialized=JSON.stringify(manifest)+'\n';if(Buffer.byteLength(serialized)!==manifest.manifestBytes)throw Error('Manifest size accounting did not settle');
await writeFile(join(options['--out'],'manifest.json'),serialized,{flag:'wx'});
if(sha(await readFile(join(options['--input'],'manifest.json')))!==sha(input))throw Error('Immutable input changed');
const report={scope:'Runtime-only manifest projection; zero model, map, material, lighting, source, geometry, anchor or decoder precision change.',input:{path:options['--input'],manifestSha256:sha(input),manifestBytes:input.length},output:{path:options['--out'],manifestSha256:sha(Buffer.from(serialized)),manifestBytes:Buffer.byteLength(serialized),completePackageBytes:manifest.completePackageBytes},savedManifestBytes:input.length-Buffer.byteLength(serialized),allDeclaredPayloadBytesAndSha256Unchanged:true,removedAuditFields:removed,scriptSha256:manifest.buildEvidence.projectionScriptSha256};
await writeFile(options['--report'],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log('RUNTIME_MANIFEST_COMPACTED',JSON.stringify(report.output),'saved',report.savedManifestBytes);
