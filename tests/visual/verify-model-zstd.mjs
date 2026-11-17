// Actual browser/WASM decoding and retry, without constructing a WebGL scene.
import {chromium,webkit} from '@playwright/test';
import {createServer} from 'vite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {zstdCompressSync,constants} from 'node:zlib';
import {resolve} from 'node:path';

const input=resolve(process.env.MODEL??'art/build/snow-roof-round1/priority15-short16-u8-normal256/snow-roof.glb');
const out=resolve(process.env.OUTPUT??'artifacts/full-review/round-1/model-zstd-browser');
const sha=b=>createHash('sha256').update(b).digest('hex');
const original=await readFile(input),encoded=zstdCompressSync(original,{params:{[constants.ZSTD_c_compressionLevel]:22}});
if(original.readUInt32LE(0)!==0x46546c67)throw Error('Actual audited GLB required');
await mkdir(out,{recursive:true});
const file={uri:'court.glb.zstd',encoding:'zstd',bytes:encoded.length,sha256:sha(encoded),decodedBytes:original.length,decodedSha256:sha(original)};
const server=await createServer({configFile:resolve('web/vite.config.ts'),cacheDir:'/tmp/one-light-zstd-vite-cache',server:{host:'127.0.0.1',port:5234,strictPort:true}});
await server.listen();
const report={scope:'Real browser loader/native SHA256/actual Three160 embedded Zstd WASM. No renderer, scene, GPU, FPS or final delivery claim.',input:{path:input,bytes:original.length,sha256:sha(original)},encoded:file,files:[],browsers:[]};
for(const path of['web/src/engine/baked/prefetchPlace.js','web/src/engine/baked/sha256.js','node_modules/three/examples/jsm/libs/zstddec.module.js', 'tests/visual/verify-model-zstd.mjs'])report.files.push({path,sha256:sha(await readFile(path))});
try{for(const kind of['chromium','webkit']){
 const browser=await(kind==='chromium'?chromium.launch({channel:'chrome',headless:false}):webkit.launch({headless:true}));
 try{
  const page=await browser.newPage(),errors=[],requests={};
  page.on('pageerror',e=>errors.push(e.stack));
  await page.route('http://127.0.0.1:5234/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Lossless model verification</title>'}));
  await page.route('**/places/zstd-*/*',async route=>{
   const url=new URL(route.request().url()),key=url.pathname;requests[key]=(requests[key]??0)+1;
   if(key.endsWith('manifest.json')){
    const wrong=key.includes('retry')&&requests[key]===1;
    await route.fulfill({json:{scene:file.uri,files:[{...file,decodedSha256:wrong?'0'.repeat(64):file.decodedSha256}]}});
   }else await route.fulfill({contentType:'application/octet-stream',body:encoded});
  });
  await page.goto('http://127.0.0.1:5234/');
  const result=await page.evaluate(async()=>{
   const api=await import('/src/engine/baked/prefetchPlace.js'),times={},progress=[];
   let began=performance.now();await api.prefetchBakedPlace('zstd-valid',p=>progress.push(p));times.prefetchMilliseconds=performance.now()-began;
   const manifest=await api.readBakedManifest('zstd-valid'),a=await api.readBakedAsset('zstd-valid',manifest.files[0]),b=await api.readBakedAsset('zstd-valid',manifest.files[0]);
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),n=>n.toString(16).padStart(2,'0')).join('');
   let failure;try{await api.prefetchBakedPlace('zstd-retry');}catch(e){failure=e.message;}
   if(!failure?.includes('Changed decoded'))throw Error('Wrong decoded checksum was accepted');
   began=performance.now();await api.prefetchBakedPlace('zstd-retry');times.retryMilliseconds=performance.now()-began;
   const retried=await api.readBakedAsset('zstd-retry',(await api.readBakedManifest('zstd-retry')).files[0]);
   return{userAgent:navigator.userAgent,times,decodedBytes:a.byteLength,decodedSha256:digest,magic:new TextDecoder().decode(a.slice(0,4)),sameOwnedCacheBuffer:a===b,retryBytes:retried.byteLength,rejectedWrongDecodedChecksum:failure,progress};
  });
  if(result.decodedSha256!==file.decodedSha256||result.decodedBytes!==original.length||result.magic!=='glTF'||!result.sameOwnedCacheBuffer||result.retryBytes!==original.length||errors.length||requests['/places/zstd-valid/court.glb.zstd']!==1||requests['/places/zstd-retry/manifest.json']!==2)throw Error('Actual browser decode/cache/retry failed: '+JSON.stringify({result,errors,requests}));
  report.browsers.push({kind,version:browser.version(),...result,requests,errors,passed:true});
  console.log('ZSTD_BROWSER_PASS',kind,result.times);
 }finally{await browser.close();}
}}finally{await server.close();report.inputUnchanged=sha(await readFile(input))===report.input.sha256;await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');}
if(report.browsers.length!==2||!report.inputUnchanged)throw Error('Incomplete browser proof');
