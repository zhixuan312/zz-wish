#!/usr/bin/env node
/** Hash-only final-batch binding of already executed, independent geometry proofs. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..'),options={};
const flags=['--source-audit','--contact-audit','--float-proof','--prune-profile','--prune-proof','--postbatch','--prepared','--raw','--optimized','--out'];
for(let i=2;i<process.argv.length;i+=2){
  if(!flags.includes(process.argv[i])||!process.argv[i+1])throw Error('Explicit '+flags.join(', ')+' required');
  options[process.argv[i]]=resolve(process.argv[i+1]);
}
if(flags.some(k=>!options[k])||!options['--out'].startsWith(ROOT+'/art/build/'))throw Error('Complete explicit inputs and a new art/build output are required');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),measured=new Map();
async function read(path){path=resolve(ROOT,path);const bytes=await fs.readFile(path),hash=sha(bytes);measured.set(path,{path,sha256:hash,bytes:bytes.length});return bytes;}
async function json(flag){return JSON.parse(await read(options[flag]));}
async function requireHash(path,hash){const bytes=await read(path);if(sha(bytes)!==hash)throw Error('Actual artifact changed: '+path);return bytes;}
const source=await json('--source-audit'),contact=await json('--contact-audit'),floating=await json('--float-proof');
const profile=await json('--prune-profile'),prune=await json('--prune-proof'),batch=await json('--postbatch');
const sourceSha=source.source.sha256;
if(source.contactAudit?.passed!==true||source.anchorCorrespondencePassed!==true||contact.passed!==true||contact.raw?.passed!==true)throw Error('Genuine source/contact proof failed');
if(contact.sourceBlendSha256!==sourceSha||contact.sourceAuditSha256!==measured.get(options['--source-audit']).sha256||floating.sourceBlendSha256!==sourceSha||batch.sourceBlendSha256!==sourceSha)throw Error('Source proof chain differs');
if(contact.literalGuardsMetres?.gap!==.002||contact.literalGuardsMetres?.penetration!==.005)throw Error('Literal guards changed');
for(const stage of [contact,contact.raw]){
  if(stage.groups.length!==source.contactAudit.groups.length||stage.sourceAnchorMetadataByteExact!==true||Object.keys(stage.association.missingSourceVertices).length)throw Error('Incomplete actual contact stage');
  for(const group of stage.groups)if(group.passed!==true||(group.mode==='resting'&&(group.contact.gapMetres>.002||group.maximumPenetrationMetres>.005)))throw Error('An actual contact guard failed');
}
for(const input of floating.inputs)await requireHash(input.path,input.sha256);
for(const input of Object.values(profile.inputs))await requireHash(input.path,input.sha256);
await requireHash(source.source.path,sourceSha);
await requireHash(contact.raw.path,contact.raw.sha256);
const finalPrepared=await requireHash(options['--prepared'],profile.inputs.prepared.sha256);
const finalRaw=await requireHash(options['--raw'],profile.inputs.raw.sha256);
const optimized=await requireHash(options['--optimized'],profile.output.sha256);
if(batch.preparedSha256!==sha(finalPrepared)||batch.rawSha256!==sha(finalRaw)||batch.provisionalRawByteIdentical!==true||batch.maps!==12||batch.samples!==64||batch.cyclesDevice!=='METAL'||batch.oidnDevice!=='METAL')throw Error('Completed batch identity or declared rendering contract differs');
if(prune.profileSha256!==measured.get(options['--prune-profile']).sha256||prune.inputSha256!==profile.inputs.input.sha256||prune.outputSha256!==sha(optimized)||profile.output.bytes!==optimized.length)throw Error('Independent pruning proof differs');
for(const key of ['contactTestedRawToActualRawToFloat32WorldPositionsAndWindingExact','allFloat32PositionsComponent5126NonNormalized','sourceAnchorStringsByteExact','allCompleteActualRawSceneExtrasByteExact','float32NonpositionStreamsAndCyclicWindingEqualActualBaseline','float32MaterialsAndEmbeddedImagesByteExactToActualBaseline'])if(floating[key]!==true)throw Error('Independent FLOAT32 invariant failed: '+key);
for(const key of ['allRetainedPositionNormalUV0UV1Color0Color1BytesAndCyclicWindingExact','worldTransformsAndOwnershipExact','materialJsonAndEmbeddedImagesExact'])if(prune[key]!==true)throw Error('Independent prune invariant failed: '+key);
if(prune.quantizationPasses!==0||prune.encodersUsed!==0)throw Error('Independent proof used an encoder');
const stages={};for(const [name,stage] of [['prepared',contact],['raw',contact.raw]])stages[name]={groups:stage.groups.length,maximumGapMetres:Math.max(...stage.groups.filter(g=>g.mode==='resting').map(g=>g.contact.gapMetres)),maximumPenetrationMetres:Math.max(...stage.groups.filter(g=>g.mode==='resting').map(g=>g.maximumPenetrationMetres))};
const report={version:1,scope:'Final post-batch geometry/contact correspondence only. Measured byte identity releases the provisional geometry condition; complete encoded/padded map and browser approval are separate.',sourceBlendSha256:sourceSha,geometryFingerprint:contact.geometryFingerprint,actualFinalPreparedByteIdenticalToMeasuredFaceReference:true,actualFinalRawByteIdenticalToMeasuredFloat32Profile:true,allActualContactAndAnchorProofsRemainApplicable:true,literalGuardsMetres:contact.literalGuardsMetres,actualContactStages:stages,optimized:{...measured.get(options['--optimized']),vertices:profile.output.vertices,triangles:profile.output.triangles},exactFaceProvenTrianglesRemoved:Object.values(prune.regions).reduce((sum,r)=>sum+r.removedFACEProvenTriangles,0),allRetainedAttributesWindingTransformsOwnershipMaterialsImagesExact:true,geometryEligibleForCompletePackageAssembly:true,publicFilesWritten:0,renderBakeEncoderJobs:0,inputs:[...measured.values()],scriptSha256:sha(await fs.readFile(fileURLToPath(import.meta.url)))};
for(const item of measured.values())if(sha(await fs.readFile(item.path))!==item.sha256)throw Error('Input changed during proof');
await fs.writeFile(options['--out'],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log('FINAL_RESTING_CORRESPONDENCE_PASS',JSON.stringify({path:options['--out'],sha256:sha(await fs.readFile(options['--out'])),optimized:report.optimized}));
