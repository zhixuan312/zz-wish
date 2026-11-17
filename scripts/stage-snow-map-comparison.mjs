#!/usr/bin/env node
// Stage one genuinely new map beside byte-exact baseline assets; never adopt it.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),opt={};
for(let i=2;i<process.argv.length;i+=2){if(!['--base','--native','--map','--out','--receipt'].includes(process.argv[i])||!process.argv[i+1])throw Error('Explicit --base --native --map region-look --out --receipt required');opt[process.argv[i]]=process.argv[i]==='--map'?process.argv[i+1]:resolve(process.argv[i+1]);}
for(const k of ['--base','--native','--map','--out','--receipt'])if(!opt[k])throw Error('Missing '+k);
if(!opt['--out'].startsWith(root+'/art/build/')||opt['--out']===opt['--base'])throw Error('Separate ignored diagnostic output required');
try{await fs.access(opt['--out']);throw Error('Use a new output directory');}catch(e){if(e.code!=='ENOENT')throw e;}
const sha=b=>createHash('sha256').update(b).digest('hex'),readJson=async p=>JSON.parse(await fs.readFile(p));
const basePath=join(opt['--base'],'manifest.json'),nativePath=join(opt['--native'],'manifest.json'),baseBytes=await fs.readFile(basePath),nativeBytes=await fs.readFile(nativePath),base=JSON.parse(baseBytes),native=JSON.parse(nativeBytes);
const [region,look,...extra]=opt['--map'].split('-');if(extra.length||!base.lightmaps?.[region]?.[look]||!native.lightmaps?.[region]?.[look])throw Error('Actual selected region/look missing');
if(base.bakeFingerprint!==native.bakeFingerprint||base.geometryFingerprint!==native.geometryFingerprint||base.bake.sourceBlendSha256!==native.bake.sourceBlendSha256)throw Error('One-map comparison requires exact actual source/geometry/transport identity');
const oldEntry=base.lightmaps[region][look],actual=native.lightmaps[region][look];
if(actual.samples!==32||oldEntry.samples!==8||actual.bakeDevice!=='METAL'||actual.denoiseDevice!=='METAL'||actual.mipLevels!==3||actual.gutterPixels!==8||actual.bakeFingerprint!==base.bakeFingerprint||actual.cameraPreExposure!==base.bake.cameraPreExposure||actual.quantity!==oldEntry.quantity)throw Error('Expected a genuinely new32-sample source-bound map against8 reference');
const uri=oldEntry.uri;if(uri!==basename(uri)||actual.uri!==uri)throw Error('Exact local map URI required');
const mapBytes=await fs.readFile(join(opt['--native'],uri)),codec=await readJson(join(opt['--native'],uri+'.json'));
const master=await fs.readFile(join(opt['--native'],actual.source));if(actual.masterSha256&&sha(master)!==actual.masterSha256)throw Error('Actual new denoised master changed');
const hashes=await Promise.all(actual.pngMipmaps.map(async name=>sha(await fs.readFile(join(opt['--native'],name)))));
const mapKey='uastc2-rdo1-zstd18-linear-3:'+hashes.join(':');
if(codec.key!==mapKey||codec.sha256!==sha(mapBytes)||codec.bytes!==mapBytes.length||codec.codec!=='uastc'||codec.transfer!=='linear'||codec.mipLevels!==3)throw Error('Actual shared-driver map encoding binding differs');
const nativeFrozen={manifest:sha(nativeBytes),master:sha(master),map:sha(mapBytes)};
const manifest=structuredClone(base),newEntry={};
for(const key of Object.keys(oldEntry)){
 if(key==='codec')newEntry[key]='uastc';else if(key==='bytes')newEntry[key]=mapBytes.length;else if(key==='masterSha256')newEntry[key]=sha(master);
 else{if(actual[key]===undefined)throw Error('New actual map omitted retained runtime field '+key);newEntry[key]=actual[key];}
}
manifest.lightmaps[region][look]=newEntry;
await fs.mkdir(opt['--out'],{recursive:true});const files=[];
for(const file of base.files){
 if(file.uri!==basename(file.uri))throw Error('Only declared local assets supported');
 const original=await fs.readFile(join(opt['--base'],file.uri));if(original.length!==file.bytes||sha(original)!==file.sha256)throw Error('Baseline asset changed: '+file.uri);
 const bytes=file.uri===uri?mapBytes:original;await fs.writeFile(join(opt['--out'],file.uri),bytes,{flag:'wx'});
 files.push(file.uri===uri?{...file,bytes:bytes.length,sha256:sha(bytes)}:structuredClone(file));
}
manifest.files=files;manifest.partialPreview=true;manifest.diagnosticOnly=true;
manifest.previewAdoption='Explicit one-map variance diagnostic only: '+region+'/'+look+' is fresh32-sample Metal/OIDN; the other15 maps remain genuine8-sample reference. Not final, not public installation or64-sample approval.';
manifest.mixedSampleDiagnostic={map:region+'/'+look,baselineManifestSha256:sha(baseBytes),newNativeManifestSha256:sha(nativeBytes),actualNewMapSamples:32,otherMapSamples:8,newMasterSha256:sha(master),actualCodecReceiptSha256:sha(await fs.readFile(join(opt['--native'],uri+'.json'))),allOtherPayloadsByteExact:true,modelAndMaterialGeometryAndAnchorsByteExact:true};
manifest.payloadBytes=manifest.totalBytes=files.reduce((s,f)=>s+f.bytes,0);manifest.budget.previewOnly=true;
for(let i=0;i<12;i++){const size=Buffer.byteLength(JSON.stringify(manifest)+'\n');if(manifest.manifestBytes===size&&manifest.completePackageBytes===manifest.payloadBytes+size)break;manifest.manifestBytes=size;manifest.completePackageBytes=manifest.payloadBytes+size;manifest.budget.within15000000Bytes=manifest.completePackageBytes<=15000000;}
const outputBytes=Buffer.from(JSON.stringify(manifest)+'\n');if(outputBytes.length!==manifest.manifestBytes)throw Error('Diagnostic manifest byte accounting did not settle');
await fs.writeFile(join(opt['--out'],'manifest.json'),outputBytes,{flag:'wx'});
if(sha(await fs.readFile(basePath))!==sha(baseBytes)||sha(await fs.readFile(nativePath))!==nativeFrozen.manifest||sha(await fs.readFile(join(opt['--native'],actual.source)))!==nativeFrozen.master||sha(await fs.readFile(join(opt['--native'],uri)))!==nativeFrozen.map)throw Error('Immutable input changed');
const receipt={scope:'Explicit immutable mixed-sample optical diagnostic. One genuine newhall/night32 map replaces only baselinehall/night8; allother15maps/model/materials/fabric/geometry/anchors remain byteexact. No source/light/GI master mutation, extra render, bake, codec change or public installation.',base:{path:opt['--base'],manifestSha256:sha(baseBytes)},native:{path:opt['--native'],manifestSha256:sha(nativeBytes),rawMasterSha256:sha(await fs.readFile(join(opt['--native'],region+'-'+look+'-raw.exr'))),denoisedMasterSha256:sha(master)},output:{path:opt['--out'],manifestSha256:sha(outputBytes),completePackageBytes:manifest.completePackageBytes},changedOnlyMap:{uri,oldBytes:oldEntry.bytes,newBytes:mapBytes.length,oldSha256:base.files.find(f=>f.uri===uri).sha256,newSha256:sha(mapBytes),samplesBefore:8,samplesAfter:32,newActualRuntimeEntry:newEntry},unchangedPayloads:files.filter(f=>f.uri!==uri),sourceBlendSha256:manifest.bake.sourceBlendSha256,bakeFingerprint:manifest.bakeFingerprint,geometryFingerprint:manifest.geometryFingerprint,allUnaffectedPayloadsByteExact:true,publicInstalled:false,full64:false,scriptSha256:sha(await fs.readFile(fileURLToPath(import.meta.url)))};
await fs.writeFile(opt['--receipt'],JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log('SNOW_ONE_MAP_VARIANCE_DIAGNOSTIC_READY',opt['--out'],sha(outputBytes),manifest.completePackageBytes,sha(await fs.readFile(opt['--receipt'])));
