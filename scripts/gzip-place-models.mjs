// Lossless outer compression of actual audited GLBs. Public output contains
// only the encoded models; the original delivery/proofs remain in art/build.
import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {resolve,join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync,zstdCompressSync,zstdDecompressSync,constants} from 'node:zlib';

const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
if(!option('--input')||!option('--out'))throw new Error('Supply --input audited-delivery and a separate empty --out directory.');
const input=resolve(option('--input')),out=resolve(option('--out')),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const codec=option('--codec')??'gzip';
if(!['gzip','zstd'].includes(codec))throw new Error('Supported model containers: gzip or zstd.');
let wasmDecoder;
if(codec==='zstd'){
  const {ZSTDDecoder}=await import('three/examples/jsm/libs/zstddec.module.js');
  wasmDecoder=new ZSTDDecoder();await wasmDecoder.init();
}
if(input===out)throw new Error('The audited original must remain immutable.');
await mkdir(out,{recursive:true});if((await readdir(out)).length)throw new Error('Output must be empty.');
const manifestBytes=await readFile(join(input,'manifest.json')),manifest=JSON.parse(manifestBytes),models=[];
for(const file of manifest.files){
  if(file.uri!==basename(file.uri))throw new Error('Only declared local delivery files are supported.');
  let original=await readFile(join(input,file.uri));
  if(original.length!==file.bytes||hash(original)!==file.sha256)throw new Error(`Changed original ${file.uri}`);
  if(!/\.glb(?:\.(?:gzip|zstd))?$/.test(file.uri)){await copyFile(join(input,file.uri),join(out,file.uri));continue;}
  if(file.encoding){
    if(!['gzip','zstd'].includes(file.encoding))throw new Error('Unsupported original model container.');
    original=file.encoding==='gzip'?gunzipSync(original):zstdDecompressSync(original);
    if(original.length!==file.decodedBytes||hash(original)!==file.decodedSha256)throw new Error('Original decoded model checksum failed.');
  }
  if(original.readUInt32LE(0)!==0x46546c67)throw new Error('A genuine binary glTF input is required.');
  const encoded=codec==='gzip'?gzipSync(original,{level:9}):zstdCompressSync(original,{params:{[constants.ZSTD_c_compressionLevel]:22}});
  const decoded=codec==='gzip'?gunzipSync(encoded):zstdDecompressSync(encoded);
  if(!decoded.equals(original))throw new Error('Native lossless round trip failed.');
  if(wasmDecoder&&!Buffer.from(wasmDecoder.decode(new Uint8Array(encoded),original.length)).equals(original))throw new Error('Actual Three WASM lossless round trip failed.');
  // .gz is automatically decoded by common static middleware before fetch.
  // An explicit container suffix keeps encoded bytes available for hashing.
  const previousUri=file.uri;file.uri=file.uri.replace(/\.glb\.(?:gzip|zstd)$/,'.glb')+'.'+codec;file.encoding=codec;file.decodedBytes=original.length;file.decodedSha256=hash(original);file.bytes=encoded.length;file.sha256=hash(encoded);
  if(manifest.scene===previousUri)manifest.scene=file.uri;
  for(const hero of Object.values(manifest.heroes??{}))if(hero.uri===previousUri)hero.uri=file.uri;
  await writeFile(join(out,file.uri),encoded);
  models.push({originalUri:previousUri,...file});
}
manifest.compression??={};
manifest.compression.container={codec,level:codec==='gzip'?9:22,decodedBytesAndSha256Verified:true,threeWasmRoundTripVerified:codec==='zstd',inputManifestSha256:hash(manifestBytes),models};
manifest.payloadBytes=manifest.files.reduce((sum,file)=>sum+file.bytes,0);manifest.totalBytes=manifest.payloadBytes;
// Preserve every field while keeping the downloaded manifest compact.
let serialized;
for(let i=0;i<8;i++){
  serialized=JSON.stringify(manifest)+'\n';const size=Buffer.byteLength(serialized);
  if(manifest.manifestBytes===size&&manifest.completePackageBytes===manifest.payloadBytes+size)break;
  manifest.manifestBytes=size;manifest.completePackageBytes=manifest.payloadBytes+size;
}
serialized=JSON.stringify(manifest)+'\n';
if(manifest.manifestBytes!==Buffer.byteLength(serialized))throw new Error('Manifest byte count did not settle.');
await writeFile(join(out,'manifest.json'),serialized);
console.log('LOSSLESS_MODEL_CONTAINER',JSON.stringify({models:models.map(model=>({uri:model.uri,encodedBytes:model.bytes,decodedBytes:model.decodedBytes,encodedSha256:model.sha256,decodedSha256:model.decodedSha256})),payloadBytes:manifest.payloadBytes,completePackageBytes:manifest.completePackageBytes,partialPreview:!!manifest.partialPreview,manifestSha256:hash(Buffer.from(serialized))}));
