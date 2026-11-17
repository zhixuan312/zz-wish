// Encode verified real-app framebuffers. Never paint or relight source art.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fingerprintCaptureSource } from '../tests/visual/capture-source-fingerprint.mjs';
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
if(args.includes('--help')){console.log('node scripts/make-cover-posters.mjs --inputs RUNTIME_CAPTURE/inputs.json --out DIR [--max-bytes 400000]');process.exit(0);}
if(!args.includes('--inputs')||!args.includes('--out'))throw new Error('Explicit runtime capture inputs and separate output required.');
const input=resolve(option('--inputs')),out=resolve(option('--out')),root=dirname(input);
const config=JSON.parse(await readFile(input,'utf8')),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
if(config.kind!=='runtime-framebuffer'||!config.sourceFingerprintSha256)throw new Error('Only verified actual-app framebuffers are accepted.');
if(!config.sourceRoot||!config.sourceFingerprint||!config.sourceFingerprintReceiptSha256)throw new Error('The frozen runtime source receipt is required.');
const sourceReceipt=await readFile(resolve(root,config.sourceFingerprint)),sourceFingerprint=JSON.parse(sourceReceipt);
if(hash(sourceReceipt)!==config.sourceFingerprintReceiptSha256||sourceFingerprint.aggregateSha256!==config.sourceFingerprintSha256)throw new Error('Runtime source receipt changed.');
if((await fingerprintCaptureSource(resolve(root,config.sourceRoot))).aggregateSha256!==config.sourceFingerprintSha256)throw new Error('Frozen runtime source changed after capture.');
if(hash(await readFile(resolve(root,config.sourceBlend)))!==config.sourceBlendSha256)throw new Error('Authored source changed.');
if(hash(await readFile(resolve(root,config.manifest)))!==config.manifestSha256)throw new Error('Streamed delivery changed.');
const required=['night','dusk','day'].flatMap(look=>['desktop','phone'].map(viewport=>`${look}/${viewport}`));
const seen=new Set(config.views.map(view=>`${view.look}/${view.viewport}`));
if(config.views.length!==6||seen.size!==6||required.some(key=>!seen.has(key)))throw new Error('All six unique runtime cover views are required.');
const views=[];
for(const view of config.views){
  const png=resolve(root,view.png),metadata=await readFile(resolve(root,view.captureMetadata)),meta=JSON.parse(metadata),bytes=await readFile(png);
  const size=view.viewport==='phone'?[390,844]:[1440,900];
  if(meta.kind!=='runtime-framebuffer'||meta.place!=='cloud-cliff'||!meta.sceneReady||meta.errors.length||meta.sourceBlendSha256!==config.sourceBlendSha256||meta.manifestSha256!==config.manifestSha256||meta.sourceFingerprintSha256!==config.sourceFingerprintSha256)throw new Error('Runtime identity or error gate failed.');
  if(JSON.stringify(meta.size)!==JSON.stringify(size)||bytes.readUInt32BE(16)!==size[0]||bytes.readUInt32BE(20)!==size[1]||hash(bytes)!==meta.pngSha256)throw new Error('Runtime pixels/projection changed.');
  views.push({...view,png,uri:`cover-${view.look}-${view.viewport}.webp`,width:size[0],height:size[1],pngSha256:hash(bytes),metadataSha256:hash(metadata)});
}
await mkdir(out,{recursive:true});
const encode=parameters=>new Promise((accept,reject)=>{const job=spawn('cwebp',parameters,{stdio:'inherit'});job.on('error',reject);job.on('exit',code=>code===0?accept():reject(new Error(`cwebp exited ${code}`)));});
const cap=Number(option('--max-bytes',400000));let files,quality,totalBytes;
for(quality of[88,80,72]){
  for(const view of views)await encode(['-quiet','-q',String(quality),'-m','6','-metadata','icc',view.png,'-o',join(out,view.uri)]);
  files=await Promise.all(views.map(async view=>{const bytes=await readFile(join(out,view.uri));return{uri:view.uri,bytes:bytes.length,sha256:hash(bytes),role:'runtime-cover-poster'};}));
  totalBytes=files.reduce((sum,file)=>sum+file.bytes,0);if(totalBytes<=cap)break;
}
if(totalBytes>cap)throw new Error(`Poster set ${totalBytes}B exceeds ${cap}B; no receipt published.`);
const posters={};for(const view of views)(posters[view.look]??={})[view.viewport]={uri:view.uri,width:view.width,height:view.height,sourcePngSha256:view.pngSha256,sourcePreviewSha256:view.metadataSha256};
const receipt={version:1,sourceBlendSha256:config.sourceBlendSha256,streamedManifestSha256:config.manifestSha256,sourceFingerprintSha256:config.sourceFingerprintSha256,posters,files,totalBytes,quality,codec:'WebP lossy cwebp',partialPreview:false,scope:'UI-free actual app framebuffer with source hero and live flame, encoded for the immediate first frame while the same scene streams.'};
await writeFile(join(out,'posters.json'),JSON.stringify(receipt,null,2)+'\n');
console.log('RUNTIME_COVER_POSTERS_READY',out,totalBytes,files.length);
