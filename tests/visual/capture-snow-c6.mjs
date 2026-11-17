// Actual packaged Snow optics/contact framing. Manifest samples are authoritative.
import {chromium,webkit} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Vector3,Matrix4} from 'three';
import {fingerprintCaptureSource} from './capture-source-fingerprint.mjs';
import {installCaptureGpuGuard,assertCaptureGpuHealthy,assertServedSnapshot,readCaptureManifest} from './capture-preflight.mjs';
if(process.argv.includes('--help')){
 console.log('Bounded real-UI C6/lantern/low-altar capture; exclusive browser GPU lease required. SOURCE_ROOT=/tmp/frozen-instrument-flicker-snapshot BASE_URL=http://127.0.0.1:5260 OUTPUT=artifacts/... BROWSERS=chromium,webkit [VIEWPORT=desktop|phone] [PHONE_POSES=.../candidates.json] [DETAIL_POSES=.../WORLD-pose-subset.json] [CAPTURE_ENDED=1]. ALLOW_PARTIAL_PREVIEW=1 explicitly allows all16 actual LOW8 maps as a recorded control; default remains final-bank-only. Optional gauze-optics instrumentation is not required. Eight base frames per browser/size plus requested details/end states; no lighting variants, FPS or full-journey approval.');
 process.exit(0);
}
const source=process.env.SOURCE_ROOT,base=process.env.BASE_URL,out=process.env.OUTPUT;
if(!source?.startsWith('/tmp/')||!base||!out)throw Error('Explicit isolated source/URL/output required');
const allowPartial=process.env.ALLOW_PARTIAL_PREVIEW==='1';
const manifest=await readCaptureManifest(source,{requireFinalBanks:!allowPartial});
if(allowPartial&&Object.keys(manifest.lightmaps??{}).length!==4)throw Error('Declared Snow preview requires all four actual regions');
if(Object.values(manifest.lightmaps??{}).some(maps=>['night','dusk','day','lamp'].some(pass=>!maps[pass])))throw Error('All actual ambient/lamp maps are required even for a declared LOW8 control');
if(manifest.bake.cameraPreExposure!==40||manifest.bake.lampPassQuantity!=='indirect-diffuse-radiance-per-unit-albedo')throw Error('Actual normalized indirect-only source required');
const fingerprint=await fingerprintCaptureSource(source),sha=b=>createHash('sha256').update(b).digest('hex');
let phonePoses=[],phonePosesInput=null;
if(process.env.PHONE_POSES){
 const bytes=await readFile(process.env.PHONE_POSES),registry=JSON.parse(bytes),rows=registry.candidates??registry;
 if(!Array.isArray(rows))throw Error('PHONE_POSES must contain an array or candidates array');
 phonePoses=rows.filter(row=>!row.viewport||row.viewport==='phone').map(row=>{
  const name=row.name??row.id;
  if(typeof name!=='string'||!/^[a-zA-Z0-9_-]+$/.test(name)||![row.position,row.look].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite))||!Number.isFinite(row.fov)||row.fov<=0||row.fov>=180)throw Error('Invalid named B5 phone camera');
  return{name,position:row.position,look:row.look,fov:row.fov,purpose:row.purpose??null,preferred:!!row.preferred};
 });
 if(!phonePoses.length||new Set(phonePoses.map(row=>row.name)).size!==phonePoses.length)throw Error('Distinct phone camera candidates required');
 phonePosesInput={path:process.env.PHONE_POSES,sha256:sha(bytes),source:registry.source??null,scope:'Camera-only B5 holds on the same frozen physical/lighting state; no exposure, power, fill, vignette or source mutation',candidates:phonePoses};
}
const browsers=(process.env.BROWSERS??'chromium,webkit').split(',');
if(browsers.some(name=>!['chromium','webkit'].includes(name))||process.env.VIEWPORT&&!['desktop','phone'].includes(process.env.VIEWPORT))throw Error('Use chromium/webkit and desktop/phone capture choices');
const descriptorPath=resolve(source,'web/src/engine/places/snow-roof-baked.js'),descriptorBytes=await readFile(descriptorPath);
const {default:createPlace}=await import(pathToFileURL(descriptorPath).href),nook=createPlace({V3:(...v)=>new Vector3(...v)}).nook;
const nookWorld=new Matrix4().makeRotationY(nook.at.ry??0).setPosition(nook.at.pos),worldPose=p=>({position:p.pos.clone().applyMatrix4(nookWorld).toArray(),look:p.look.clone().applyMatrix4(nookWorld).toArray(),fov:p.fov??55});
const compositions={desktop:{near:worldPose(nook.burn),far:worldPose(nook.burnFar??nook.burn)},phone:{near:worldPose(nook.burnPhone??nook.burn),far:worldPose(nook.burnFarPhone??nook.burnFar??nook.burn)}};
let detailPoses=[],detailPosesInput=null;
if(process.env.DETAIL_POSES){
 const bytes=await readFile(process.env.DETAIL_POSES),registry=JSON.parse(bytes);detailPoses=Array.isArray(registry)?registry:registry.cameras;
 if(!Array.isArray(detailPoses)||!detailPoses.length)throw Error('DETAIL_POSES requires actual named WORLD poses');
 for(const p of detailPoses)for(const pose of[p,...(p.phone?[p.phone]:[])])if(!p.name||!/^[a-zA-Z0-9_-]+$/.test(p.name)||![pose.position,pose.look].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite))||!Number.isFinite(pose.fov))throw Error('Invalid actual detail pose');
 detailPosesInput={path:process.env.DETAIL_POSES,sha256:sha(bytes),count:detailPoses.length,poses:detailPoses};
}
// Source18 contact-registry view height, not a bounding-box support estimate.
// The phone pair views move back so both real lamp bases/pedestals fit together.
const altarViewY=1.677066650390625;
const altarViews=[
 {name:'left',groups:['altar -1.45','altar -0.95'],desktop:{position:[-1.15,altarViewY,-3.55],look:[-1.15,altarViewY,-4.74],fov:50},phone:{position:[-1.15,altarViewY,-2.15],look:[-1.15,altarViewY,-4.74],fov:55}},
 {name:'centre',groups:['altar burner assembly'],desktop:{position:[.15,altarViewY,-3.75],look:[0,altarViewY,-4.85],fov:50},phone:{position:[.05,altarViewY,-3.2],look:[0,altarViewY,-4.85],fov:55}},
 {name:'right',groups:['altar 0.95','altar 1.45'],desktop:{position:[1.1,altarViewY,-3.55],look:[1.1,altarViewY,-4.73],fov:50},phone:{position:[1.1,altarViewY,-2.15],look:[1.1,altarViewY,-4.73],fov:55}},
];
// Runs synchronously in the page. Older basic flicker snapshots retain lampInfo
// in the begin closure but do not expose it as lab.lampInfo. Read its immediate
// CPU metadata and restore recording/result before any render or readback.
const browserMetadata=()=>{
 const lab=window.__flickerLab,optics=window.__captureGauzeOptics?.('metadata')??null;
 let lamp=lab.lampInfo?.()??null,lampMetadataSource=lamp?'flickerLab.lampInfo':null;
 if(!lamp?.worldBounds&&lab.begin){
  const recording=lab.recording,result=lab.result;
  if(recording)throw Error('Cannot borrow lamp metadata during an active diagnostic recording');
  try{lab.begin({name:'c6-framing-metadata-only',seconds:1,rois:[]});lamp=lab.recording?.lamp??null;lampMetadataSource='flickerLab.begin immediate CPU metadata';}
  finally{lab.recording=recording;lab.result=result;}
 }
 return{camera:window.__captureCameraState(),optics,lamp,lampMetadataSource,anchors:window.__captureRuntimeAnchors?.()??null,place:lab.placeInfo(),colorView:window.__captureColorView?.()??null};
};
const report={scope:'Actual installed-package optical/contact frames for C1/C2/C6/B4 and all four altar lamps/burner. Manifest per-map samples are authoritative; default red fixture only. This capture does not itself approve final visuals/full journey/hunt/FPS or arbitrary-shape GI. Cloud is a technical navigation control.',sourceStart:fingerprint,
 nativeProvenance:{manifestSha256:fingerprint.files.find(file=>file.path==='web/public/places/snow-roof/manifest.json')?.sha256,sourceBlendSha256:manifest.bake.sourceBlendSha256,bakeFingerprint:manifest.bakeFingerprint,partialPreview:!!manifest.partialPreview,completePackageBytes:manifest.completePackageBytes,maps:Object.fromEntries(Object.entries(manifest.lightmaps).flatMap(([region,maps])=>Object.entries(maps).map(([pass,map])=>[region+'/'+pass,{samples:map.samples,bakeDevice:map.bakeDevice,denoiseDevice:map.denoiseDevice,passFilter:map.passFilter,quantity:map.quantity,masterSha256:map.masterSha256}])) )},
 compositionPoses:compositions,compositionSource:{path:descriptorPath,sha256:sha(descriptorBytes),method:'Snapshot createPlace with Vector3 only; build is never called; actual nook.at rotation/translation applied'},detailPosesInput,allowPartialPreview:allowPartial,phonePosesInput,lowAltarFraming:{viewHeightMetres:altarViewY,role:'Low view of actual contacts; no support placement or contact measurement from bounds',views:altarViews},frames:[],errors:[],records:[]};
await mkdir(out,{recursive:true});
const save=()=>writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
for(const name of browsers){
 const browser=await({chromium,webkit}[name]).launch(name==='chromium'?{channel:'chrome',headless:false,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']}:{headless:false});
 try{for(const size of[{name:'desktop',width:1440,height:900},{name:'phone',width:390,height:844}].filter(s=>!process.env.VIEWPORT||s.name===process.env.VIEWPORT)){
  const context=await browser.newContext({viewport:{width:size.width,height:size.height},deviceScaleFactor:1,locale:'en-US',hasTouch:size.name==='phone',isMobile:size.name==='phone'});
  await context.addInitScript(installCaptureGpuGuard);await context.addInitScript(()=>{Date.prototype.getHours=()=>22;Date.prototype.getMinutes=()=>0;window.__visualFreezeCamera=true;});
  const page=await context.newPage();page.setDefaultTimeout(90000);let lit=false;
  page.on('pageerror',e=>report.errors.push({browser:name,size:size.name,error:e.stack}));page.on('console',m=>{if(m.type()==='error')report.errors.push({browser:name,size:size.name,console:m.text()});});page.on('response',r=>{if(r.status()>=400)report.errors.push({browser:name,size:size.name,url:r.url(),status:r.status()});});
  const act=async locator=>{if(await page.locator('.ui').getAttribute('data-controls-idle')==='true'){if(size.name==='phone')await page.touchscreen.tap(8,size.height/2);else await page.mouse.move(8,size.height/2);}if(size.name==='phone')await locator.tap();else await locator.click();};
  const button=re=>page.getByRole('button',{name:re});
  const shot=async(stage,pose=null,extra={})=>{
   const previous=pose?await page.evaluate(p=>window.__captureSetCamera(p),pose):null;
   await page.waitForTimeout(250);const health=await assertCaptureGpuHealthy(page);
   const file=`${out}/${name}-${size.name}-${stage}.png`;await page.screenshot({path:file});
   const metadata=await page.evaluate(browserMetadata);
   report.frames.push({browser:name,size:size.name,stage,file,sha256:sha(await readFile(file)),health,diagnosticCamera:pose,...metadata,...extra});await save();console.log('SNOW_C6_FRAME',name,size.name,stage);
   if(previous)await page.evaluate(p=>window.__captureSetCamera(p),previous);
  };
  try{
   await page.goto(base);await page.bringToFront();await page.waitForFunction(()=>window.__ready&&window.__flickerLab);await assertServedSnapshot(page,fingerprint);
   await page.getByLabel('Your wish').fill('A quiet light under the old timber.');await act(button(/^Set my wish$/));
   await page.waitForFunction(()=>['ready','error'].includes(document.querySelector('.court-loading')?.dataset.stage));
   if(await page.locator('.court-loading').getAttribute('data-stage')==='error')throw Error('Actual court preparation error');
   await act(button(/^Step inside$/));await act(button(/^Skip$/));await page.getByRole('tab',{name:'Ready-made',exact:true}).waitFor();
   await page.getByRole('radio',{name:'Red gauze',exact:true}).click();await page.waitForFunction(()=>window.__captureCameraState().pendingTweens===0);await shot('choose');
   await act(button(/^Light it(?: ·|$)/));lit=true;await page.waitForFunction(()=>window.__visualIgnition?.state==='settled'&&window.__visualIgnition.progress===1);
   await shot('burning-live');
   await page.evaluate(()=>{window.__captureSetPhysicalState({time:17,fuel:1});Object.assign(window.__flickerLab,{lockCamera:true,pauseTweens:true,freezeScene:true,freezeGrade:true,freezeDaylight:true,freezeFuel:true,freezeFlame:true,freezeLampMotion:true,hideParticles:true});});
   if(process.env.DIAGNOSTICS_ONLY!=='1'){
   await shot('burning-held',compositions[size.name].near);
   await shot('burnFar-held',compositions[size.name].far);
   const lampMetadata=await page.evaluate(browserMetadata);
   const bounds=lampMetadata.optics?.clothBounds??lampMetadata.lamp?.worldBounds;
   if(!bounds||![bounds.min,bounds.max].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)))throw Error('Actual lantern bounds required for close-up framing');
   const centre=bounds.min.map((v,i)=>(v+bounds.max[i])/2),delta=compositions[size.name].near.position.map((v,i)=>v-centre[i]),length=Math.hypot(...delta);
   if(length<.001)throw Error('Close-up viewing direction is undefined');
   const tangent=Math.tan(42*Math.PI/360),height=bounds.max[1]-bounds.min[1],width=Math.hypot(bounds.max[0]-bounds.min[0],bounds.max[2]-bounds.min[2]);
   const distance=Math.max(.85,height/(2*tangent*.78),width/(2*tangent*(size.width/size.height)*.78));
   const close={position:centre.map((v,i)=>v+delta[i]/length*distance),look:centre,fov:42};
   const style=await page.addStyleTag({content:'.ui{visibility:hidden!important}'});
   try{
    await shot('diagnostic-lantern-close',close,{framingBoundsSource:lampMetadata.optics?.clothBounds?'optional gauze optics cloth bounds':'actual flicker lamp worldBounds',framingBounds:bounds});
    for(const view of altarViews)await shot('diagnostic-low-altar-edge-'+view.name,view[size.name],{contactGroupIds:view.groups});
    for(const row of detailPoses){const pose=size.name==='phone'&&row.phone?{...row,...row.phone}:row;await shot('detail-'+row.name,{position:pose.position,look:pose.look,fov:pose.fov},{contactGroupIds:row.groupIds??[],role:row.role??'bounded Source19 detail'});}
    if(size.name==='phone')for(const candidate of phonePoses)await shot('diagnostic-b5-'+candidate.name,{position:candidate.position,look:candidate.look,fov:candidate.fov},{role:'B5 camera-only comparison',cameraCandidate:candidate});
   }finally{await style.evaluate(n=>n.remove());}
   }else{
    const style=await page.addStyleTag({content:'.ui{visibility:hidden!important}'});
    try{
     for(const row of detailPoses){const p=size.name==='phone'&&row.phone?{...row,...row.phone}:row,pose={position:p.position,look:p.look,fov:p.fov};await shot('detail-'+row.name,pose);if(process.env.BLOOM_COMPARE==='1'){await page.evaluate(()=>{window.__flickerLab.disableBloom=true;});await shot('detail-'+row.name+'-no-bloom',pose,{bloomDisabled:true});await page.evaluate(()=>{window.__flickerLab.disableBloom=false;});}}
     if(process.env.DESKTOP_CANDIDATE){const pose=JSON.parse(process.env.DESKTOP_CANDIDATE),previous=await page.evaluate(()=>window.__captureCameraState()),viewport=page.viewportSize();await page.setViewportSize({width:1440,height:900});await shot('desktop-camera-candidate',pose,{size:'desktop',role:'Camera-only1440x900 projection on the same active page; resized phone context, not a desktop performance claim'});await page.setViewportSize(viewport);await page.evaluate(p=>window.__captureSetCamera(p),previous);}
    }finally{await style.evaluate(n=>n.remove());}
   }
  }catch(error){report.errors.push({browser:name,size:size.name,fatal:error.stack});await page.screenshot({path:`${out}/${name}-${size.name}-failure.png`}).catch(()=>{});throw error;}
  finally{
   if(lit){await page.evaluate(()=>Object.assign(window.__flickerLab,{pauseTweens:false,freezeScene:false,freezeFlame:false,freezeLampMotion:false})).catch(()=>{});await act(button(/^Put out$/)).catch(()=>{});await act(button(/^Put out and end$/)).catch(()=>{});if(process.env.CAPTURE_ENDED==='1'){await page.getByTestId('result-title').waitFor();await page.waitForTimeout(1200);await shot('result-ended');}report.records.push({browser:name,size:size.name,records:await page.evaluate(async()=>(await(await fetch('/api/me/candles')).json()).candles).catch(()=>null)});}
   await context.close();await save();
  }
 }}finally{await browser.close();}
}
report.sourceEnd=await fingerprintCaptureSource(source);report.sourceChanged=report.sourceEnd.aggregateSha256!==fingerprint.aggregateSha256;report.ownedBrowsersClosed=true;await save();
if(report.errors.length||report.sourceChanged)throw Error('Actual optics capture health/source gate failed');console.log('SNOW_C6_OPTICS_TERMINAL',report.frames.length,'frames GPU released');
