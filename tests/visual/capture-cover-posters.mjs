// Capture the actual cover canvas after its Metal-baked scene has loaded.
import { chromium, webkit } from '@playwright/test';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, join } from 'node:path';
import { fingerprintCaptureSource } from './capture-source-fingerprint.mjs';
import { assertServedSnapshot, installCaptureGpuGuard, assertCaptureGpuHealthy } from './capture-preflight.mjs';

const root=resolve(process.env.SOURCE_ROOT??''),out=resolve(process.env.OUTPUT??'artifacts/full-review/round-1/cover-posters');
if(!root.startsWith('/tmp/'))throw new Error('Capture only an isolated frozen checkout.');
const base=process.env.BASE_URL??'http://localhost:5201';
const blend=resolve(process.env.SOURCE_BLEND??'art/build/cloud-cliff-round1/cloud-cliff-source-v11.blend');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fingerprint=await fingerprintCaptureSource(root),manifestPath=join(root,'web/public/places/cloud-cliff/manifest.json');
const browserSourceRoot=await realpath(root);
const manifestBytes=await readFile(manifestPath),manifest=JSON.parse(manifestBytes);
if(manifest.partialPreview||Object.values(manifest.lightmaps).some(maps=>['night','dusk','day','lamp'].some(pass=>!maps[pass])))throw new Error('Runtime posters require a complete delivered cover.');
const manifestSha256=digest(manifestBytes),sourceBlendSha256=digest(await readFile(blend));
await mkdir(out,{recursive:true});
const browserName=process.env.BROWSER??'chromium';
if(!['chromium','webkit'].includes(browserName))throw new Error('BROWSER must be chromium or webkit.');
const browser=await (browserName==='webkit'?webkit:chromium).launch(browserName==='webkit'?{headless:false}:{channel:'chrome',headless:false,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
const views=[];
try{
  for(const [look,hour] of [['night',22],['dusk',18],['day',13]].filter(([look])=>!process.env.LOOKS||process.env.LOOKS.split(',').includes(look)))for(const [viewport,width,height] of [['desktop',1440,900],['phone',390,844]]){
    console.log('COVER_RUNTIME_BEGIN',look,viewport);
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
    await context.addInitScript(installCaptureGpuGuard);
    await context.addInitScript(hour=>{Date.prototype.getHours=()=>hour;Date.prototype.getMinutes=()=>0;Date.prototype.getSeconds=()=>0;Date.prototype.getMilliseconds=()=>0;window.__visualFreezeCamera=true;},hour);
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.stack));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    page.on('response',response=>{if(response.status()>=400)errors.push(`HTTP ${response.status()} ${response.url()}`);});
    page.on('requestfailed',request=>errors.push(`NETWORK ${request.url()} ${request.failure()?.errorText}`));
    await page.goto(base);await page.waitForFunction(()=>window.__ready&&window.__captureDeliveryInfo&&window.__captureCameraState,null,{timeout:120000});
    await assertServedSnapshot(page,fingerprint);await page.waitForTimeout(2000);
    if(process.env.FIELD_TIME!==undefined){
      await page.evaluate(time=>{window.__captureSetPhysicalState({time});window.__flickerLab.freezeScene=true;window.__flickerLab.lockCamera=true;},Number(process.env.FIELD_TIME));
      await page.waitForTimeout(150);
    }
    if(process.env.THUMBNAILS==='1'&&look==='night'&&viewport==='desktop'){
      const thumbnails=await page.evaluate(async rulesUrl=>{
        const rules=await import(rulesUrl);
        const shape={kind:'shade',rows:rules.sizedPreset(rules.PRESET_SHAPES.shade[0].rows,30),color:rules.COLORS.shade[1]};
        const frames=[];
        for(const state of ['unlit','burning'])frames.push({state,png:await window.__captureRenderLampThumbnail(shape,{state,remaining:1,width:120,height:180})});
        return frames;
      },`/@fs${browserSourceRoot}/shared/rules.ts`);
      for(const frame of thumbnails)await writeFile(join(out,`diagnostic-shade-${frame.state}.png`),Buffer.from(frame.png.split(',')[1],'base64'));
    }
    await assertCaptureGpuHealthy(page);
    const result=await page.evaluate(()=>new Promise((resolve,reject)=>requestAnimationFrame(()=>{
      if(window.__renderer.getContext().isContextLost()||(window.__captureGpuEvents?.length??0)>0){reject(new Error('GPU context failed before cover framebuffer capture.'));return;}
      const canvas=document.getElementById('gl');
      resolve({png:canvas.toDataURL('image/png'),delivery:window.__captureDeliveryInfo(),camera:window.__captureCameraState(),cloud:window.__captureCloudRuntime?.()??null,size:[canvas.width,canvas.height]});
    })));
    await assertCaptureGpuHealthy(page);
    const png=Buffer.from(result.png.split(',')[1],'base64'),name=`${look}-${viewport}`,pngPath=join(out,name+'.png'),metadataPath=join(out,name+'.json');
    await writeFile(pngPath,png);
    if(result.delivery.place!=='cloud-cliff'||!result.delivery.available)throw new Error('Actual framebuffer does not contain the baked cover.');
    const metadata={kind:'runtime-framebuffer',browser:browserName,sceneReady:true,place:result.delivery.place,look,hour,size:[width,height],drawingBuffer:result.size,sourceBlendSha256,manifestSha256,sourceFingerprintSha256:fingerprint.aggregateSha256,pngSha256:digest(png),camera:result.camera,cloud:result.cloud,fieldTime:process.env.FIELD_TIME!==undefined?Number(process.env.FIELD_TIME):null,delivery:result.delivery,errors};
    await writeFile(metadataPath,JSON.stringify(metadata,null,2)+'\n');
    if(errors.length)throw new Error(`Cover shader/runtime errors: ${errors.join('\n')}`);
    views.push({look,viewport,png:relative(out,pngPath),captureMetadata:relative(out,metadataPath)});
    await context.close();
    console.log('COVER_RUNTIME_FRAME',look,viewport,png.length);
  }
}finally{await browser.close();}
const endFingerprint=await fingerprintCaptureSource(root);
if(endFingerprint.aggregateSha256!==fingerprint.aggregateSha256)throw new Error('Frozen runtime source changed during capture.');
const sourceReceipt=Buffer.from(JSON.stringify(fingerprint,null,2)+'\n');
await writeFile(join(out,'source-fingerprint.json'),sourceReceipt);
await writeFile(join(out,'inputs.json'),JSON.stringify({kind:'runtime-framebuffer',browser:browserName,sourceRoot:relative(out,root),sourceBlend:relative(out,blend),sourceBlendSha256,manifest:relative(out,manifestPath),manifestSha256,sourceFingerprint:'source-fingerprint.json',sourceFingerprintReceiptSha256:digest(sourceReceipt),sourceFingerprintSha256:fingerprint.aggregateSha256,views},null,2)+'\n');
console.log('RUNTIME_COVER_CAPTURED',out,views.length);
