#!/usr/bin/env node
// Read-only actual raw export equality for Snow's uniform radiometric rebase.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),options={};
const flags=['--parent-raw','--raw','--source-audit','--saved-audit','--out'];
for(let i=2;i<process.argv.length;i+=2){
  if(!flags.includes(process.argv[i])||!process.argv[i+1])throw Error('Use '+flags.map(k=>k+' PATH').join(' '));
  options[process.argv[i]]=resolve(process.argv[i+1]);
}
if(flags.some(k=>!options[k])||!options['--out'].startsWith(root+'/art/build/'))throw Error('Explicit inputs and new ignored output required');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),inputs={};
const read=async flag=>{const bytes=await fs.readFile(options[flag]);inputs[flag]={path:options[flag],sha256:sha(bytes),bytes:bytes.length};return bytes;};
function glb(bytes){
  if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2)throw Error('Expected real GLB2');
  const n=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+n)),binary=bytes.subarray(28+n);
  return {json,binary};
}
const parent=glb(await read('--parent-raw')),actual=glb(await read('--raw'));
const source=JSON.parse(await read('--source-audit')),saved=JSON.parse(await read('--saved-audit'));
if(!source.contactAudit.passed||!source.anchorCorrespondencePassed||!saved.passed||source.source.sha256!==saved.source.sha256)throw Error('Passing genuine source/contact/radiometry receipts required');
const sourcePath=resolve(root,source.source.path);
if(sha(await fs.readFile(sourcePath))!==source.source.sha256)throw Error('Actual frozen source differs');
if(!parent.binary.equals(actual.binary))throw Error('Actual raw binary geometry/UV0/UV1/normals/tint/index/image payload changed');
const materialRows=[],normalize=mat=>{
  const result=structuredClone(mat);delete result.emissiveFactor;
  if(result.extensions){delete result.extensions.KHR_materials_emissive_strength;if(!Object.keys(result.extensions).length)delete result.extensions;}
  return result;
};
if(parent.json.materials.length!==actual.json.materials.length)throw Error('Material ownership changed');
for(let i=0;i<actual.json.materials.length;i++){
  const old=parent.json.materials[i],now=actual.json.materials[i];
  if(JSON.stringify(normalize(old))!==JSON.stringify(normalize(now)))throw Error('A nonemission material PBR field changed: '+now.name);
  const oldStrength=old.extensions?.KHR_materials_emissive_strength?.emissiveStrength??1,newStrength=now.extensions?.KHR_materials_emissive_strength?.emissiveStrength??1;
  const oldRGB=(old.emissiveFactor??[0,0,0]).map(x=>x*oldStrength),newRGB=(now.emissiveFactor??[0,0,0]).map(x=>x*newStrength);
  const error=Math.max(...newRGB.map((x,k)=>Math.abs(x-oldRGB[k]/40)));
  if(error>Math.max(1e-10,...oldRGB.map(x=>Math.abs(x/40)*1e-6)))throw Error('Actual exported emission is not uniformly divided40: '+now.name);
  materialRows.push({name:now.name,parentEmissionLinearRGB:oldRGB,actualEmissionLinearRGB:newRGB,maximumRatioError:error,allNonEmissionPbrFieldsByteValueExact:true});
}
const oldDoc=structuredClone(parent.json),newDoc=structuredClone(actual.json);
const unwrapTimings=[];
function withoutSeconds(value){
  if(Array.isArray(value))return value.map(withoutSeconds);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='seconds').map(([key,item])=>[key,withoutSeconds(item)]));
  return value;
}
for(const [label,doc]of [['parent',oldDoc],['actual',newDoc]]){
  delete doc.scenes;delete doc.materials;
  for(const node of doc.nodes??[]){
    if(!node.extras?.one_light_unwrap_report)continue;
    const report=JSON.parse(node.extras.one_light_unwrap_report);
    unwrapTimings.push({container:label,node:node.name,actualSeconds:report.seconds,originalReportSha256:sha(Buffer.from(node.extras.one_light_unwrap_report))});
    node.extras.one_light_unwrap_report=JSON.stringify(withoutSeconds(report));
  }
}
if(JSON.stringify(oldDoc)!==JSON.stringify(newDoc))throw Error('Actual geometry/accessor/image/node/material ownership JSON changed');
if(actual.json.scenes.length!==1)throw Error('Expected one source-owned scene');
const extras=actual.json.scenes[0].extras;
for(const [key,value]of Object.entries(source.anchorMetadata))if(extras[key]!==value)throw Error('Actual source anchor metadata changed: '+key);
if(extras.one_light_camera_pre_exposure!==40||extras.one_light_lamp_pass_quantity!=='indirect-diffuse-radiance-per-unit-albedo')throw Error('Actual export normalization/quantity missing');
const basis=JSON.parse(extras.one_light_lamp_basis);
if(basis.watts!==saved.actualVisitorBasis.watts||basis.watts>.050001||basis.transport.quantity!==extras.one_light_lamp_pass_quantity)throw Error('Actual exported candle basis differs');
for(const entry of Object.values(inputs))if(sha(await fs.readFile(entry.path))!==entry.sha256)throw Error('Frozen input changed');
const report={passed:true,scope:'Actual uncompressed raw Source17 vs actual Source16 raw. Binary geometry, UV0/UV1, normals, tint, indices, images and non-emission material definitions are exact. Declared emission radiance alone is /40; scene extras carry the new actual source and physical normalization. Per-node unwrap diagnostics differ only in measured seconds (explicitly reported), with every chart/packing result exact. No source, receiver, transport or delivery mutation.',inputs,sourceBlendSha256:source.source.sha256,parentRawBinarySha256:sha(parent.binary),actualRawBinarySha256:sha(actual.binary),entireRawBinaryPayloadByteExact:true,allNonSceneNonMaterialJsonExceptUnwrapSecondsByteValueExact:true,actualMeasuredUnwrapTimings:unwrapTimings,allNonEmissionMaterialPbrFieldsByteValueExact:true,allSourceAnchorMetadataStringsByteExact:true,materialRows,cameraPreExposure:40,lampPassQuantity:extras.one_light_lamp_pass_quantity,actualLampBasis:basis,renderBakeEncoderGpuJobs:0,scriptSha256:sha(await fs.readFile(fileURLToPath(import.meta.url)))};
await fs.writeFile(options['--out'],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log('SNOW_RAW_RADIOMETRY_EQUALITY_PASS',options['--out'],sha(await fs.readFile(options['--out'])));
