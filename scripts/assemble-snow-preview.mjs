#!/usr/bin/env node
/** Assemble real maps and proven geometry; --final requires genuine64+ provenance. */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative, isAbsolute, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripAuditSceneExtras } from './strip-delivery-audit-metadata.mjs';
const allArgs=process.argv.slice(2),finalMode=allArgs.includes('--final'),args=allArgs.filter(arg=>arg!=='--final'),opt={},root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(allArgs.filter(arg=>arg==='--final').length>1)throw Error('Supply --final only once');
for(let i=0;i<args.length;i+=2){if(!['--base','--model','--geometry-proof','--metadata-receipt','--contact-proof','--out','--fabric-dir','--precision-proof','--decoder-proof'].includes(args[i])||!args[i+1])throw Error('Explicit base/model/proof/receipt/contact/out/fabric arguments required');opt[args[i]]=resolve(args[i+1]);}
for(const key of ['--base','--model','--geometry-proof','--metadata-receipt','--contact-proof','--out','--fabric-dir'])if(!opt[key])throw Error('Missing '+key);
const outRel=relative(resolve(root,'art/build'),opt['--out']);if(isAbsolute(outRel)||outRel==='..'||outRel.startsWith('../')||await access(opt['--out']).then(()=>true,()=>false))throw Error('Use a new isolated art/build delivery directory');
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const manifest=await json(resolve(opt['--base'],'manifest.json')),proof=await json(opt['--geometry-proof']),metadata=await json(opt['--metadata-receipt']),contacts=await json(opt['--contact-proof']);
const model=await readFile(opt['--model']);
const precision=opt['--precision-proof']?await json(opt['--precision-proof']):null,decoder=opt['--decoder-proof']?await json(opt['--decoder-proof']):null;
if(manifest.place!=='snow-roof'||Object.values(manifest.lightmaps).some(m=>!m.night||!m.lamp)||Object.keys(manifest.lightmaps).length!==4||(!finalMode&&manifest.partialPreview!==true))throw Error('Expected four real Snow atlas regions; default assembly requires explicit preview provenance');
if(finalMode){
 if(manifest.bake?.integrator?.use_adaptive_sampling!==false||manifest.bake.integrator.use_animated_seed!==false)throw Error('Final assembly requires fingerprinted fixed sampling; adaptive maxima cannot be relabeled fixed');
 const expectedLooks=['day','dusk','lamp','night'],regions=['altar','court','gate','hall'];
 if(JSON.stringify(Object.keys(manifest.lightmaps).sort())!==JSON.stringify(regions)||!Number.isInteger(manifest.bake?.samples)||manifest.bake.samples<64)throw Error('Final assembly requires allfour actual64+ Snow atlas regions');
 if(!manifest.bakeFingerprint||!manifest.bake.sourceBlendSha256||!manifest.bake.preparedPreviewAudit?.passed)throw Error('Final assembly requires genuine source and mapping proof identity');
 const exposure=manifest.bake.cameraPreExposure;
 if(!Number.isFinite(exposure)||exposure<=0||Math.abs(manifest.bake.threeLightMapIrradianceMultiplier-Math.PI*exposure)>1e-10)throw Error('Final camera normalization and radiance units disagree');
 for(const [region,maps]of Object.entries(manifest.lightmaps)){
  if(JSON.stringify(Object.keys(maps).sort())!==JSON.stringify(expectedLooks))throw Error('Final assembly is missing an actual look: '+region);
  for(const [look,map]of Object.entries(maps)){
   if(!Number.isInteger(map.samples)||map.samples<64||map.samples<manifest.bake.samples||map.bakeDevice!=='METAL'||map.denoiseDevice!=='METAL'||map.bakeFingerprint!==manifest.bakeFingerprint||map.mipLevels!==3||map.gutterPixels!==8)throw Error('Final map provenance is not genuine64+ Metal/Metal/3mips/8px: '+region+'/'+look);
   if(!manifest.bake.passesByLook?.[look]||JSON.stringify(map.passFilter)!==JSON.stringify(manifest.bake.passesByLook[look]))throw Error('Final actual pass filter differs: '+region+'/'+look);
   if(map.cameraPreExposure!==exposure||map.quantity!==(look==='lamp'?manifest.bake.lampPassQuantity:manifest.bake.quantity))throw Error('Final actual radiometric quantity differs: '+region+'/'+look);
   if(look==='lamp'&&manifest.bake.lampPassQuantity==='indirect-diffuse-radiance-per-unit-albedo'&&(map.quantity!==manifest.bake.lampPassQuantity||map.cameraPreExposure!==exposure||JSON.stringify(map.passFilter)!==JSON.stringify(['INDIRECT'])))throw Error('Final lamp quantity/normalization was lost');
  }
 }
 if(contacts.groups.length!==47||contacts.raw?.groups.length!==47||!contacts.groups.every(g=>g.passed)||!contacts.raw.groups.every(g=>g.passed)||contacts.literalGuardsMetres?.gap!==.002||contacts.literalGuardsMetres?.penetration!==.005)throw Error('Final assembly requires all47 actual source/prepared/decoded contacts at literal2mm/5mm');
}
if(proof.allRetainedPositionNormalUV0UV1Color0Color1BytesAndCyclicWindingExact!==true||proof.materialJsonAndEmbeddedImagesExact!==true||contacts.passed!==true||contacts.raw?.passed!==true)throw Error('Actual geometry/contact proof must pass');
if(metadata.input.sha256!==proof.outputSha256)throw Error('Metadata derivative must bind the actual independently proven geometry');
if(precision){
 if(!precision.passed||!precision.allActualDecodedRetainedTriangleRecordsMatchDeclaredOriginalF32Quantization||precision.source.sha256!==metadata.output.sha256||precision.output.sha256!==sha(model)||precision.maximumOriginalSourceMaterialTexelError>.25||precision.maximumWorldNormalComponentError>1e-4)throw Error('Actual declared precision chain must pass');
 if(!decoder?.everyActualAttributeAndIndexArrayByteExact||decoder.input.sha256!==sha(model)||decoder.output.sha256!==contacts.raw.sha256)throw Error('Actual decoded contact model binding differs');
}else if(metadata.output.sha256!==sha(model))throw Error('Actual metadata-only derivative differs');
const binding=JSON.parse(JSON.parse(model.subarray(20,20+model.readUInt32LE(12))).scenes[0].extras.one_light_source_binding);
if(binding.sha256!==contacts.sourceBlendSha256)throw Error('Actual decoded contacts/source binding differs');
if(finalMode&&(manifest.bake.sourceBlendSha256!==binding.sha256||manifest.geometryFingerprint!==contacts.geometryFingerprint))throw Error('Final native transport maps and actual decoded contact geometry have different source/receiver ownership');
await mkdir(opt['--out'],{recursive:true});
await writeFile(resolve(opt['--out'],manifest.scene),model,{flag:'wx'});
const files=[{uri:manifest.scene,bytes:model.length,sha256:sha(model)}];
for(const file of manifest.files.filter(f=>f.uri!==manifest.scene)){
  if(!file.uri.endsWith('.ktx2')||basename(file.uri)!==file.uri)throw Error('Unexpected preview asset');
  const data=await readFile(resolve(opt['--base'],file.uri));if(data.length!==file.bytes||sha(data)!==file.sha256)throw Error('Actual lightmap changed');
  await writeFile(resolve(opt['--out'],file.uri),data,{flag:'wx'});files.push(file);
}
const realLightmaps=Object.values(manifest.lightmaps).reduce((n,looks)=>n+Object.keys(looks).length,0);
if(![8,16].includes(realLightmaps)||files.length!==realLightmaps+1)throw Error('Exactly eight or sixteen real map files are required');
let fabricBytes=0;
for(const name of ['gauze-weave.webp','gauze-normal.webp','gauze-roughness.webp']){
  const data=await readFile(resolve(opt['--fabric-dir'],name));await writeFile(resolve(opt['--out'],name),data,{flag:'wx'});fabricBytes+=data.length;files.push({uri:name,bytes:data.length,sha256:sha(data),role:'runtime-visitor-fabric'});
}
if(fabricBytes!==391242)throw Error('Fabric data differs from the authorized photographed material');
manifest.files=files;manifest.totalBytes=manifest.payloadBytes=files.reduce((n,f)=>n+f.bytes,0);
manifest.compression.uvVerification.sceneExtras=manifest.compression.uvVerification.sceneExtras.map(row=>({...row,extras:stripAuditSceneExtras(row.extras).retained}));
manifest.compression.geometryVerificationScope='Original full-model UV/material verification plus exact retained-array/winding proof and explicit metadata-only derivative; no claim that removed audit metadata or proven hidden triangles remain in delivery.';
manifest.compression.geometryOptimization={inputSha256:proof.inputSha256,outputSha256:metadata.output.sha256,geometryProofSha256:sha(await readFile(opt['--geometry-proof'])),metadataReceiptSha256:sha(await readFile(opt['--metadata-receipt'])),actualDecodedContactProofSha256:sha(await readFile(opt['--contact-proof'])),sourceBlendSha256:contacts.sourceBlendSha256,all47ActualGroupsPassed:contacts.groups.length===47&&contacts.groups.every(g=>g.passed)&&contacts.raw.groups.every(g=>g.passed),positionPrecision:'genuine authored FLOAT32/NONE',metadataRemovedKeys:metadata.approvedSceneKeys,metadataSavedBytes:metadata.savedBytes};
if(precision){manifest.compression.geometryOptimization.outputSha256=sha(model);manifest.compression.geometryOptimization.deliveryPrecision={scope:precision.scope,proofSha256:sha(await readFile(opt['--precision-proof'])),decoderReceiptSha256:sha(await readFile(opt['--decoder-proof'])),normal:'genuine original F32 to normalized SHORT16',maximumWorldNormalComponentError:precision.maximumWorldNormalComponentError,uv0:'Affine U16 where original-source error<=.25texel; otherwise original F32',maximumOriginalSourceMaterialTexelError:precision.maximumOriginalSourceMaterialTexelError,uv2:'normalized U16; actual source chart unchanged',maximumLightmapBaseTexelError:precision.maximumLightmapBaseTexelError,colours:precision.colourPolicy,architecturalNormalImages:256,protectedScanNormalImages:512};manifest.compression.geometryVerificationScope='Source-F32 retained-face proof, approved metadata derivative, and actual decoded precision-chain/contact proof. Positions and winding exact; normals, UVs, colors and six architectural normal images have the declared delivery precision.';}
manifest.budget={completePackageBytesMaximum:15000000,reservedPosterBytes:0,actualFabricBytes:fabricBytes,previewOnly:!finalMode};
if(finalMode){
 delete manifest.partialPreview;delete manifest.missingAmbientLooks;delete manifest.missingLightmaps;delete manifest.previewAdoption;
 manifest.finalAssembly={all16Genuine64PlusMetalMetal:true,sourceBlendSha256:contacts.sourceBlendSha256,bakeFingerprint:manifest.bakeFingerprint,actualDecoded47ContactGroupsPassed:true,stagingOnly:true,publicInstallPerformed:false,assemblerSha256:sha(await readFile(fileURLToPath(import.meta.url)))};
}else{
 manifest.partialPreview=true;manifest.previewAdoption='Staging for actual app review only; not a final/public install or full64 approval. '+(realLightmaps===16?'All sixteen looks are genuine eight-sample maps bound to the declared source.':'Missing dusk/day are explicitly retained as missing.');
}
for(let i=0;i<12;i++){const bytes=Buffer.byteLength(JSON.stringify(manifest,null,2)+'\n');if(manifest.manifestBytes===bytes&&manifest.completePackageBytes===manifest.payloadBytes+bytes)break;manifest.manifestBytes=bytes;manifest.completePackageBytes=manifest.payloadBytes+bytes;manifest.budget.within15000000Bytes=manifest.completePackageBytes<=15000000;}
const text=JSON.stringify(manifest,null,2)+'\n';if(Buffer.byteLength(text)!==manifest.manifestBytes)throw Error('Manifest byte accounting did not converge');
await writeFile(resolve(opt['--out'],'manifest.json'),text,{flag:'wx'});
console.log(finalMode?'ISOLATED_SNOW_FINAL_READY':'ISOLATED_SNOW_PREVIEW_READY',JSON.stringify({out:opt['--out'],modelSha256:sha(model),manifestSha256:sha(Buffer.from(text)),payloadBytes:manifest.payloadBytes,manifestBytes:manifest.manifestBytes,completePackageBytes:manifest.completePackageBytes,within15000000Bytes:manifest.budget.within15000000Bytes,realLightmaps,source:contacts.sourceBlendSha256}));
