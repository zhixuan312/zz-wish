// One-map estimator comparison only. Mixed fingerprints can NEVER finalize.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,basename} from 'node:path';
const opt={};
for(let i=2;i<process.argv.length;i+=2){if(!['--base','--base-native','--native','--out','--receipt'].includes(process.argv[i])||!process.argv[i+1])throw Error('Explicit base/base-native/native/out/receipt required');opt[process.argv[i]]=resolve(process.argv[i+1]);}
for(const key of ['--base','--base-native','--native','--out','--receipt'])if(!opt[key])throw Error('Missing '+key);
if(!opt['--out'].startsWith(resolve('art/build')+'/'))throw Error('Ignored diagnostic output only');
try{await fs.access(opt['--out']);throw Error('Never overwrite a diagnostic');}catch(e){if(e.code!=='ENOENT')throw e;}
const sha=b=>createHash('sha256').update(b).digest('hex'),read=async p=>JSON.parse(await fs.readFile(p));
const canonical=v=>JSON.stringify(sort(v));
function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;}
const manifests=await Promise.all(['--base','--base-native','--native'].map(k=>fs.readFile(join(opt[k],'manifest.json'))));
const [base,old,native]=manifests.map(b=>JSON.parse(b));
const [oldPayload,newPayload]=await Promise.all(['--base-native','--native'].map(k=>read(join(opt[k],'bake-fingerprint.json'))));
const physical=p=>Object.fromEntries(Object.entries(p).filter(([k])=>!['policy','cycles'].includes(k)));
if(canonical(physical(oldPayload))!==canonical(physical(newPayload)))throw Error('Source geometry, material, light, normal, mapping or contact contract differs');
for(const [key,value]of Object.entries(oldPayload.cycles))if(canonical(value)!==canonical(newPayload.cycles[key]))throw Error('Existing physical integrator property differs: '+key);
if(newPayload.cycles.use_adaptive_sampling!==false||newPayload.cycles.use_animated_seed!==false||native.bake.integrator?.use_adaptive_sampling!==false)throw Error('Actual new fixed-sample contract required');
if(base.bakeFingerprint!==old.bakeFingerprint||base.geometryFingerprint!==native.geometryFingerprint||base.bake.sourceBlendSha256!==native.bake.sourceBlendSha256)throw Error('Actual baseline/source/geometry identity differs');
const previous=base.lightmaps.hall.night,entry=native.lightmaps?.hall?.night,uri='hall-night.ktx2';
if(!entry||entry.samples!==256||entry.bakeDevice!=='METAL'||entry.denoiseDevice!=='METAL'||entry.mipLevels!==3||entry.gutterPixels!==8||entry.uri!==uri||entry.bakeFingerprint!==native.bakeFingerprint||entry.cameraPreExposure!==base.bake.cameraPreExposure||entry.quantity!==previous.quantity||canonical(entry.passFilter)!==canonical(previous.passFilter))throw Error('Actual fixed256 hall-night Metal/OIDN provenance required');
const map=await fs.readFile(join(opt['--native'],uri)),codec=await read(join(opt['--native'],uri+'.json'));
const master=await fs.readFile(join(opt['--native'],entry.source)),masterSha=sha(master);
if(entry.masterSha256&&entry.masterSha256!==masterSha)throw Error('Denoised master changed');
const mips=await Promise.all(entry.pngMipmaps.map(async p=>sha(await fs.readFile(join(opt['--native'],p)))));
if(codec.key!=='uastc2-rdo1-zstd18-linear-3:'+mips.join(':')||codec.sha256!==sha(map)||codec.bytes!==map.length||codec.mipLevels!==3||codec.transfer!=='linear'||codec.codec!=='uastc')throw Error('Actual unchanged delivery encoder required');
const output=structuredClone(base),newEntry={};
for(const key of Object.keys(previous)){
 if(key==='bytes')newEntry[key]=map.length;else if(key==='codec')newEntry[key]='uastc';else if(key==='masterSha256')newEntry[key]=masterSha;
 else{if(entry[key]===undefined)throw Error('Missing actual new runtime field '+key);newEntry[key]=entry[key];}
}
output.lightmaps.hall.night=newEntry;delete output.bakeFingerprint;delete output.finalAssembly;
output.partialPreview=true;output.diagnosticOnly=true;
output.previewAdoption='Mixed-estimator optical diagnostic ONLY: hall/night uses actual fixed256; other15 maps retain their original adaptive configured maxima and original fingerprints. No complete fixed-sample or final delivery claim.';
output.estimatorDiagnostic={baselineManifestSha256:sha(manifests[0]),baselineNativeManifestSha256:sha(manifests[1]),newNativeManifestSha256:sha(manifests[2]),oldFingerprint:old.bakeFingerprint,newFingerprint:native.bakeFingerprint,changedMap:'hall/night',newIntegrator:native.bake.integrator,physicalPayloadExactExceptPolicyAndCycles:true,allPreviouslyFingerprintedCyclesFieldsExact:true,actualPerMapFingerprintsRetained:true,globalFingerprintIntentionallyAbsent:true};
await fs.mkdir(opt['--out'],{recursive:true});
for(const file of output.files){if(file.uri!==basename(file.uri))throw Error('Local payload required');const b=await fs.readFile(join(opt['--base'],file.uri));if(b.length!==file.bytes||sha(b)!==file.sha256)throw Error('Baseline file changed '+file.uri);const actual=file.uri===uri?map:b;await fs.writeFile(join(opt['--out'],file.uri),actual,{flag:'wx'});file.bytes=actual.length;file.sha256=sha(actual);}
output.payloadBytes=output.totalBytes=output.files.reduce((sum,f)=>sum+f.bytes,0);output.budget.previewOnly=true;
for(let i=0;i<12;i++){const bytes=Buffer.byteLength(JSON.stringify(output)+'\n'),complete=output.payloadBytes+bytes+(output.sharedVisualBytes??0);if(output.manifestBytes===bytes&&output.completePackageBytes===complete)break;output.manifestBytes=bytes;output.completePackageBytes=complete;output.budget.within15000000Bytes=complete<=15000000;}
const b=Buffer.from(JSON.stringify(output)+'\n');if(b.length!==output.manifestBytes)throw Error('Diagnostic byte count did not settle');
await fs.writeFile(join(opt['--out'],'manifest.json'),b,{flag:'wx'});
for(let i=0;i<manifests.length;i++)if(sha(await fs.readFile(join(opt[['--base','--base-native','--native'][i]],'manifest.json')))!==sha(manifests[i]))throw Error('Immutable manifest changed');
const receipt={scope:output.previewAdoption,inputs:Object.fromEntries(['--base','--base-native','--native'].map((key,i)=>[key,{path:opt[key],manifestSha256:sha(manifests[i])}])),output:{path:opt['--out'],manifestSha256:sha(b),completePackageBytes:output.completePackageBytes},diagnostic:output.estimatorDiagnostic,changedOnlyMap:{uri,masterSha256:masterSha,rawMasterSha256:sha(await fs.readFile(join(opt['--native'],'hall-night-raw.exr'))),newRuntimeEntry:newEntry},unchangedPayloads:output.files.filter(f=>f.uri!==uri),allOtherPayloadsByteExact:true,renderBakeDenoiseJobs:0,publicWrites:0,finalApproved:false,scriptSha256:sha(await fs.readFile(new URL(import.meta.url)))};
await fs.writeFile(opt['--receipt'],JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log('SNOW_FIXED_ESTIMATOR_DIAGNOSTIC_STAGED',opt['--out'],sha(b),output.completePackageBytes);
