import {chromium,webkit} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fingerprintCaptureSource} from './capture-source-fingerprint.mjs';
import {assertServedSnapshot,installCaptureGpuGuard,assertCaptureGpuHealthy} from './capture-preflight.mjs';
const source=process.env.SOURCE_ROOT,base=process.env.BASE_URL,out=process.env.OUTPUT??'artifacts/full-review/round-1/flame-coverage';
const alignmentStudy=process.env.WICK_ALIGNMENT_STUDY==='1';
if(!source?.startsWith('/tmp/')||!base)throw Error('Explicit isolated snapshot and URL required');
const field=JSON.parse(await readFile(source+'/visual-cloud-field-v6-instrumentation.json'));
if(field.originalDescriptorSha256!=='05328486c3845efd60e18ec26a22d182fa7afd7e4c8056ad13b3ddcb6d33fb87')throw Error('Safe48 baseline required');
const before=await fingerprintCaptureSource(source),report={scope:alignmentStudy?'Isolated measured static wick-tip graphic alignment A/B, fixed four-sample SDF coverage on both sides. No source geometry, point/anchor, power, size or depth change.':'Isolated actual source16 storm flame four-sample pixel integration A/B. No geometry, power, gain, seed, time or depth change.',sourceStart:before,frames:[],errors:[]};
await mkdir(out,{recursive:true});
try{for(const kind of['chromium','webkit']){
 const browser=await(kind==='chromium'?chromium.launch({channel:'chrome',headless:false,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']}):webkit.launch({headless:true}));
 try{for(const[name,width,height]of[['desktop',1440,900],['phone',390,844]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:name==='phone',hasTouch:name==='phone'});
  await context.addInitScript(installCaptureGpuGuard);
  await context.addInitScript(()=>{Date.prototype.getHours=()=>22;Date.prototype.getMinutes=()=>0;Date.prototype.getSeconds=()=>0;window.__visualFreezeCamera=true;});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push({kind,name,error:e.stack}));
  page.on('console',m=>{if(m.type()==='error')report.errors.push({kind,name,console:m.text()});});
  page.on('response',r=>{if(r.status()>=400)report.errors.push({kind,name,url:r.url(),status:r.status()});});
  try{
   await page.goto(base);await page.waitForFunction(()=>window.__ready&&window.__captureFlameCoverage,null,{timeout:180000});
   await assertServedSnapshot(page,before);
   await page.evaluate(()=>{window.__captureSetPhysicalState({time:0});Object.assign(window.__flickerLab,{freezeScene:true,lockCamera:true});window.__cloudFieldV6Lab.heldTime=0;window.__captureStormVisibility('normal');});
   for(const close of[false,true]){
    if(close){
     const pose=await page.evaluate(()=>{const p=window.__captureStormVisibility('metadata').sourceWickTip,camera=window.__captureCameraState().position,d=camera.map((v,i)=>v-p[i]),length=Math.hypot(...d);return{position:p.map((v,i)=>v+d[i]/length*.75),look:[p[0],p[1]+.035,p[2]],fov:40};});
     await page.evaluate(pose=>window.__captureSetCamera(pose),pose);
    }
    for(const aa of[false,true]){
     await assertCaptureGpuHealthy(page);await page.evaluate(({aa,alignmentStudy})=>{window.__captureFlameCoverage(alignmentStudy||aa);if(alignmentStudy)window.__captureFlameWickAlignment(aa);},{aa,alignmentStudy});await page.waitForTimeout(500);
     const health=await assertCaptureGpuHealthy(page),state=await page.evaluate(()=>new Promise((resolve,reject)=>requestAnimationFrame(()=>{
      const gl=window.__renderer.getContext();if(gl.isContextLost()||window.__captureGpuEvents.length){reject(Error('Context unhealthy before PNG'));return;}
      resolve({png:document.getElementById('gl').toDataURL('image/png'),coverage:window.__captureFlameCoverage(),alignment:window.__captureFlameWickAlignment?.()??null,source:window.__captureStormVisibility('metadata'),camera:window.__captureCameraState()});
     })));
     const variant=alignmentStudy?(aa?'aligned':'unaligned'):(aa?'aa4':'baseline');
     const file=`${out}/${kind}-${name}-${close?'close':'cover'}-${variant}.png`,bytes=Buffer.from(state.png.split(',')[1],'base64');
     await writeFile(file,bytes);delete state.png;
     report.frames.push({kind,name,close,aa,file,sha256:createHash('sha256').update(bytes).digest('hex'),health,...state});
     await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log('FLAME_COVERAGE_FRAME',file);
    }
   }
  }finally{await context.close();}
 }}finally{await browser.close();}
}}catch(error){report.errors.push({fatal:error.stack});throw error;}finally{
 report.sourceEnd=await fingerprintCaptureSource(source);report.sourceChanged=before.aggregateSha256!==report.sourceEnd.aggregateSha256;
 await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
}
if(report.errors.length||report.sourceChanged||report.frames.length!==16)throw Error('Incomplete actual coverage A/B');
console.log('FLAME_COVERAGE_TERMINAL',report.frames.length,'frames; zero errors; source unchanged');
