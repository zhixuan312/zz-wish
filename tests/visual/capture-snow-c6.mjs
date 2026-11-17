// Actual packaged LOW8 Snow optics. No final/fulljourney/FPS claim.
import {chromium,webkit} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fingerprintCaptureSource} from './capture-source-fingerprint.mjs';
import {installCaptureGpuGuard,assertCaptureGpuHealthy,assertServedSnapshot} from './capture-preflight.mjs';
const source=process.env.SOURCE_ROOT,base=process.env.BASE_URL,out=process.env.OUTPUT;
if(!source?.startsWith('/tmp/')||!base||!out)throw Error('Explicit isolated source/URL/output required');
const manifest=JSON.parse(await readFile(source+'/web/public/places/snow-roof/manifest.json'));
if(manifest.bake.cameraPreExposure!==40||manifest.bake.lampPassQuantity!=='indirect-diffuse-radiance-per-unit-albedo')throw Error('Actual normalized indirect-only source required');
const fingerprint=await fingerprintCaptureSource(source),sha=b=>createHash('sha256').update(b).digest('hex');
const report={scope:'Actual packaged preview optical check of C1/C2/C6/B4. Declared per-map samples remain authoritative; default red fixture only; not final/fulljourney/hunt/FPS or arbitrary-shape GI approval. Cloud is a technical navigation control.',sourceStart:fingerprint,frames:[],errors:[],records:[]};
await mkdir(out,{recursive:true});
const save=()=>writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
for(const name of(process.env.BROWSERS??'chromium,webkit').split(',')){
 const browser=await({chromium,webkit}[name]).launch(name==='chromium'?{channel:'chrome',headless:false,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']}:{headless:false});
 try{for(const size of[{name:'desktop',width:1440,height:900},{name:'phone',width:390,height:844}].filter(s=>!process.env.VIEWPORT||s.name===process.env.VIEWPORT)){
  const context=await browser.newContext({viewport:{width:size.width,height:size.height},deviceScaleFactor:1,locale:'en-US',hasTouch:size.name==='phone',isMobile:size.name==='phone'});
  await context.addInitScript(installCaptureGpuGuard);await context.addInitScript(()=>{Date.prototype.getHours=()=>22;Date.prototype.getMinutes=()=>0;window.__visualFreezeCamera=true;});
  const page=await context.newPage();page.setDefaultTimeout(90000);let lit=false;
  page.on('pageerror',e=>report.errors.push({browser:name,size:size.name,error:e.stack}));page.on('console',m=>{if(m.type()==='error')report.errors.push({browser:name,size:size.name,console:m.text()});});page.on('response',r=>{if(r.status()>=400)report.errors.push({browser:name,size:size.name,url:r.url(),status:r.status()});});
  const act=async locator=>{if(await page.locator('.ui').getAttribute('data-controls-idle')==='true')await page.mouse.move(8,size.height/2);await locator.click();};
  const button=re=>page.getByRole('button',{name:re});
  const shot=async(stage,pose=null)=>{
   const previous=pose?await page.evaluate(p=>window.__captureSetCamera(p),pose):null;
   await page.waitForTimeout(250);const health=await assertCaptureGpuHealthy(page);
   const file=`${out}/${name}-${size.name}-${stage}.png`;await page.screenshot({path:file});
   const metadata=await page.evaluate(()=>({camera:window.__captureCameraState(),optics:window.__captureGauzeOptics('metadata'),anchors:window.__captureRuntimeAnchors(),place:window.__flickerLab.placeInfo(),colorView:window.__captureColorView?.()}));
   report.frames.push({browser:name,size:size.name,stage,file,sha256:sha(await readFile(file)),health,diagnosticCamera:pose,...metadata});await save();console.log('SNOW_C6_FRAME',name,size.name,stage);
   if(previous)await page.evaluate(p=>window.__captureSetCamera(p),previous);
  };
  try{
   await page.goto(base);await page.bringToFront();await page.waitForFunction(()=>window.__ready&&window.__captureGauzeOptics);await assertServedSnapshot(page,fingerprint);
   await page.getByLabel('Your wish').fill('A quiet light under the old timber.');await act(button(/^Set my wish$/));
   await page.waitForFunction(()=>['ready','error'].includes(document.querySelector('.court-loading')?.dataset.stage));
   if(await page.locator('.court-loading').getAttribute('data-stage')==='error')throw Error('Actual court preparation error');
   await act(button(/^Step inside$/));await act(button(/^Skip$/));await page.getByRole('tab',{name:'Ready-made',exact:true}).waitFor();
   await page.getByRole('radio',{name:'Red gauze',exact:true}).click();await page.waitForFunction(()=>window.__captureCameraState().pendingTweens===0);await shot('choose');
   await act(button(/^Light it(?: ·|$)/));lit=true;await page.waitForFunction(()=>window.__visualIgnition?.state==='settled'&&window.__visualIgnition.progress===1);
   await shot('burning-live');
   await page.evaluate(()=>{window.__captureSetPhysicalState({time:17,fuel:1});Object.assign(window.__flickerLab,{lockCamera:true,pauseTweens:true,freezeScene:true,freezeGrade:true,freezeDaylight:true,freezeFuel:true,freezeFlame:true,freezeLampMotion:true,hideParticles:true});});
   await shot('burning-held');
   const far=size.name==='phone'?{position:[-1.5,2.2,1.98],look:[-1.1,1.75,-2.3],fov:55}:{position:[-4.94,2.3,-1.6],look:[1.06,1.75,-2.124931981155544],fov:55};
   await shot('burnFar-held',far);
   const close=await page.evaluate(()=>{const b=window.__captureGauzeOptics('metadata').clothBounds,c=b.min.map((v,i)=>(v+b.max[i])/2),eye=window.__captureCameraState().position,d=eye.map((v,i)=>v-c[i]),length=Math.hypot(...d);return{position:c.map((v,i)=>v+d[i]/length*1.1),look:c,fov:42};});
   const style=await page.addStyleTag({content:'.ui{visibility:hidden!important}'});await shot('diagnostic-cloth-close',close);await shot('diagnostic-low-altar-edge',{position:[.25,1.66,-3.65],look:[0,1.64,-4.75],fov:55});await style.evaluate(n=>n.remove());
  }catch(error){report.errors.push({browser:name,size:size.name,fatal:error.stack});await page.screenshot({path:`${out}/${name}-${size.name}-failure.png`}).catch(()=>{});throw error;}
  finally{
   if(lit){await page.evaluate(()=>Object.assign(window.__flickerLab,{pauseTweens:false,freezeScene:false,freezeFlame:false,freezeLampMotion:false})).catch(()=>{});await act(button(/^Put out$/)).catch(()=>{});await act(button(/^Put out and end$/)).catch(()=>{});report.records.push({browser:name,size:size.name,records:await page.evaluate(async()=>(await(await fetch('/api/me/candles')).json()).candles).catch(()=>null)});}
   await context.close();await save();
  }
 }}finally{await browser.close();}
}
report.sourceEnd=await fingerprintCaptureSource(source);report.sourceChanged=report.sourceEnd.aggregateSha256!==fingerprint.aggregateSha256;report.ownedBrowsersClosed=true;await save();
if(report.errors.length||report.sourceChanged)throw Error('Actual optics capture health/source gate failed');console.log('SNOW_C6_OPTICS_TERMINAL',report.frames.length,'frames GPU released');
