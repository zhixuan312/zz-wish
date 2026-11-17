// Exact storage of the measured live envelope and integer-corner tables.
// Density is live; no frozen directional-lighting policy is supplied here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { zstdDecompressSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
const require=createRequire(import.meta.url),ktx=require('/tmp/one-light-gltf-tools/node_modules/ktx-parse');
const args=process.argv.slice(2),get=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const prototype=get('--prototype','art/build/cloud-cliff-round1/source19-live-envelope-y1'),out=get('--out','art/build/cloud-cliff-round1/source19-live-density-ktx');
if(fs.existsSync(out))throw Error('New output directory required');fs.mkdirSync(out,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),inputs=[];
function read(file,json=false){const bytes=fs.readFileSync(file);inputs.push({path:file,bytes:bytes.length,sha256:sha(bytes)});return json?JSON.parse(bytes):bytes;}
const receipt=read(path.join(prototype,'receipt.json'),true),field=read('art/build/cloud-cliff-round1/source19-cpu/saved-field/field.json',true);
if(receipt.source.sha256!==field.source.sha256)throw Error('Actual source field mismatch');
const rows={};
for(const [role,key]of[['envelope','coarse'],['envelopeNear','near']]){
  const entry=receipt[key],raw=read(path.join(prototype,entry.files[0].uri)),compressed=read(path.join(prototype,entry.files[1].uri));
  if(sha(raw)!==entry.files[0].sha256||sha(compressed)!==entry.files[1].sha256||!zstdDecompressSync(compressed).equals(raw))throw Error('Measured envelope bytes changed');
  const container=ktx.read(read('art/build/cloud-cliff-round1/cache-ktx-controls/r8.ktx2'));
  [container.pixelWidth,container.pixelHeight,container.pixelDepth]=entry.dimensions;container.supercompressionScheme=2;
  container.levels=[{levelData:compressed,uncompressedByteLength:raw.length}];container.keyValue={KTXorientation:'ruo',KTXwriter:'Measured source7 max-envelope R8, lossless Zstd12 storage; linear radiometric scalar, no colour transform'};
  const bytes=Buffer.from(ktx.write(container)),uri=`cloud-live-${role}.ktx2`;fs.writeFileSync(path.join(out,uri),bytes);
  rows[role]={uri,bytes:bytes.length,sha256:sha(bytes),decodedBytes:raw.length,decodedSha256:sha(raw),dimensions:entry.dimensions,type:'UNSIGNED_BYTE',format:'RED',filter:'LINEAR',quantity:'Static smooth max of the48 actual source child envelopes; warped query coordinates and shared noise remain live',mipLevels:1,worldBounds:entry.bounds};
}
const lattice='art/build/cloud-cliff-round1/hash-lattice-source17-prototype/encoded',latticeReceipt=read(`${lattice}/receipt.json`,true);
for(const [i,file]of latticeReceipt.files.entries()){
  const bytes=read(path.join(lattice,file.uri));if(sha(bytes)!==file.sha256)throw Error('Exact noise table changed');
  const role=i===0?'noiseA':'noiseB',uri=`cloud-live-${role}.ktx2`;fs.writeFileSync(path.join(out,uri),bytes);
  rows[role]={...file,uri,type:'HALF_FLOAT',format:'RGBA',filter:'NEAREST',quantity:'Exact integer noise corner hashes0..288; no normalization/colour transform'};
}
for(const file of Object.values(rows)){
  const pathname=path.join(out,file.uri),bytes=fs.readFileSync(pathname),validation=spawnSync('/tmp/one-light-ktx-tools/KTX-Software-4.4.2-Darwin-arm64-tools.pkg/Payload/usr/local/bin/ktx',['validate',pathname],{encoding:'utf8'});
  if(validation.status!==0)throw Error(validation.stdout+validation.stderr);
  const texture=await new KTX2Loader()._createTexture(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
  if(!texture.isData3DTexture||texture.image.width!==file.dimensions[0]||texture.image.height!==file.dimensions[1]||texture.image.depth!==file.dimensions[2])throw Error('Actual Three raw3D dimensions differ');
  const decoded=Buffer.from(texture.image.data.buffer,texture.image.data.byteOffset,texture.image.data.byteLength);
  if(sha(decoded)!==file.decodedSha256)throw Error('Actual Three raw3D decode changed typed source data');
  texture.dispose();file.officialKtxValidateExit=0;file.actualThree160CpuTypedDecodeBitExact=true;
}
for(const entry of inputs)if(sha(fs.readFileSync(entry.path))!==entry.sha256)throw Error('Immutable input drift');
const metadata={version:1,status:'live-density-storage-control-only',sourceBlendSha256:receipt.source.sha256,sourceFieldSha256:field.contractTextSha256,source:receipt.source,
  textures:rows,envelope:{coarse:receipt.coarse,near:receipt.near,blendMetres:receipt.blendMetres},inputs,
  gpuLogicalTexelBytes:Object.values(rows).reduce((sum,file)=>sum+file.decodedBytes,0),retainedCpuTypedBytes:Object.values(rows).reduce((sum,file)=>sum+file.decodedBytes,0),
  encodedTextureBytes:Object.values(rows).reduce((sum,file)=>sum+file.bytes,0),scriptSha256:sha(fs.readFileSync(new URL(import.meta.url))),
  limits:['No browser/GPU, field-LUT parity, optical, performance or final delivery acceptance is implied by CPU decoding.','Actual source noise flow remains live; directional-lighting transport under motion remains unresolved.','These four textures replace neither surface lightmaps nor any source geometry/material data.']};
const file=path.join(out,'cloud-live-density.json');fs.writeFileSync(file,JSON.stringify(metadata)+'\n');
console.log('CLOUD_LIVE_DENSITY_STORED',out,JSON.stringify({metadataSha256:sha(fs.readFileSync(file)),encodedTextures:metadata.encodedTextureBytes,metadataBytes:fs.statSync(file).size,gpuLogicalTexelBytes:metadata.gpuLogicalTexelBytes}));
