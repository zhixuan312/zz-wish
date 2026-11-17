// Read-only actual-instance layer controls, only inside an instrumented snapshot.
import { chromium, webkit } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fingerprintCaptureSource } from './capture-source-fingerprint.mjs';
import { assertServedSnapshot } from './capture-preflight.mjs';
const root=process.env.SOURCE_ROOT,base=process.env.BASE_URL??'http://127.0.0.1:5202',output=process.env.OUTPUT??'artifacts/full-review/round-1/cover-isolation';
if(!root?.startsWith('/tmp/'))throw new Error('Use a frozen /tmp checkout.');
const fingerprint=await fingerprintCaptureSource(root),rows=[];
await mkdir(output,{recursive:true});
for(const name of(process.env.BROWSERS??'chromium,webkit').split(',')){
  if(!['chromium','webkit'].includes(name))throw new Error('Unknown browser');
  const browser=await(name==='webkit'?webkit:chromium).launch(name==='webkit'?{headless:false}:{channel:'chrome',headless:false,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
    await context.addInitScript(()=>{Date.prototype.getHours=()=>22;Date.prototype.getMinutes=()=>0;Date.prototype.getSeconds=()=>0;});
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.stack));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('response',response=>{if(response.status()>=400)errors.push(`HTTP ${response.status()} ${response.url()}`);});
    await page.goto(base);await page.waitForFunction(()=>window.__ready&&window.__captureCoverLayers,null,{timeout:120000});
    await assertServedSnapshot(page,fingerprint);
    if(process.env.FIELD_TIME!==undefined){await page.evaluate(time=>{window.__captureSetPhysicalState({time});window.__flickerLab.freezeScene=true;window.__flickerLab.lockCamera=true;},Number(process.env.FIELD_TIME));await page.waitForTimeout(150);}
    for(const layer of['normal','flame','wick','point','glass']){
      const state=await page.evaluate(layer=>window.__captureCoverLayers(layer==='normal'?{}:{[layer]:false}),layer);
      await page.waitForTimeout(500);
      const frame=await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve({png:document.getElementById('gl').toDataURL('image/png'),camera:window.__captureCameraState(),cloud:window.__captureCloudRuntime?.()??null,delivery:window.__captureDeliveryInfo()}))));
      const png=Buffer.from(frame.png.split(',')[1],'base64'),file=`${output}/${name}-${layer}.png`;await writeFile(file,png);
      rows.push({browser:name,layer,file,sha256:createHash('sha256').update(png).digest('hex'),state,camera:frame.camera,cloud:frame.cloud,delivery:frame.delivery,errors:[...errors]});
      await page.evaluate(previous=>window.__captureCoverLayers(Object.fromEntries(Object.entries(previous).filter(([,value])=>value!==null))),state.previous);
    }
    await context.close();
    if(errors.length)throw new Error(`Cloud isolation errors: ${errors.join('\n')}`);
  }finally{await browser.close();}
}
await writeFile(`${output}/report.json`,JSON.stringify({fingerprint,rows},null,2)+'\n');
console.log('COVER_LAYERS_CAPTURED',rows.length,output);
