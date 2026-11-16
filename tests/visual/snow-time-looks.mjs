// Small real-UI six-look capture plus two narrow live-bank transitions.
// Preparation only until GPU handoff. No test suite; no duration/palette matrix.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fingerprintCaptureSource} from './capture-source-fingerprint.mjs';
import {readCaptureManifest,assertServedSnapshot} from './capture-preflight.mjs';

const base=process.env.BASE_URL||'http://127.0.0.1:5191';
const source=process.env.SOURCE_ROOT;
if(!source?.startsWith('/tmp/'))throw new Error('SOURCE_ROOT must identify the served frozen /tmp checkout.');
const manifest=await readCaptureManifest(source,{requireFinalBanks:true});
const root=`artifacts/snow-time-looks/${process.env.EVIDENCE||'final'}`;
const uiSettledOnly=process.env.UI_SETTLED_ONLY==='1';
const hours=(process.env.HOURS||'5.5,7,13,17.5,19.5,22').split(',').map(Number);
const bankUris=Object.values(manifest.lightmaps).flatMap(passes=>Object.values(passes).map(item=>item.uri));
const sizes=[{name:'desktop-en',width:1440,height:900,locale:'en-US',phone:false},{name:'phone-zh',width:390,height:844,locale:'zh-CN',phone:true}].filter(size=>!process.env.VIEWPORT||size.name.startsWith(process.env.VIEWPORT));
const report={base,createdAt:new Date().toISOString(),sourceStart:await fingerprintCaptureSource(source),partialPreview:!!manifest.partialPreview,hours,views:[],hotSwitches:[],requests:[],errors:[],cleanup:[],notes:['Visual local-hour override; actual API records and product actions remain real.','One fixed red Drum and 10-minute choice per look. No repeated duration/color/drawing matrix.','Hot transitions intentionally change illumination. Their raw statistics are for blank-frame/weight continuity checks, not static-flicker scoring.','Phone is M1 desktop-GPU viewport/touch emulation at deviceScaleFactor 1, not physical-phone performance.']};
report.uiSettledOnly=uiSettledOnly;if(uiSettledOnly)report.notes.push('Bounded repair of outside/choose/confirm screenshots after the original run caught the CSS arrive .65s entrance. No ignition, burn or hot-switch repetition.');
await mkdir(root,{recursive:true});const save=()=>writeFile(`${root}/report.json`,JSON.stringify(report,null,2));
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
const re=(zh,en)=>new RegExp(`${zh}|${en}`);
try{
 for(const size of sizes)for(const hour of hours){
  const label=String(hour).replace('.','-'),out=`${root}/${size.name}/${label}`;await mkdir(out,{recursive:true});
  let currentHour=hour;
  const context=await browser.newContext({viewport:{width:size.width,height:size.height},locale:size.locale,hasTouch:size.phone,isMobile:size.phone,deviceScaleFactor:1});
  await context.addInitScript(hour=>{window.__captureLocalHour=hour;Date.prototype.getHours=()=>Math.floor(window.__captureLocalHour);Date.prototype.getMinutes=()=>Math.floor((window.__captureLocalHour%1)*60);Date.prototype.getSeconds=()=>0;Date.prototype.getMilliseconds=()=>0;window.__visualFreezeCamera=true;},hour);
  const page=await context.newPage();page.setDefaultTimeout(120000);const act=locator=>size.phone?locator.tap():locator.click(),button=name=>page.getByRole('button',{name});
  const network=await context.newCDPSession(page);await network.send('Network.enable');
  network.on('Network.responseReceived',event=>{report.requests.push({viewport:size.name,hour:currentHour,url:event.response.url,status:event.response.status,fromDiskCache:!!event.response.fromDiskCache,fromServiceWorker:!!event.response.fromServiceWorker,at:event.timestamp});if(event.response.status>=400)report.errors.push({viewport:size.name,hour:currentHour,http:event.response.status,url:event.response.url});});
  page.on('pageerror',error=>report.errors.push({viewport:size.name,hour,pageError:error.stack}));page.on('console',message=>{if(['error','warning'].includes(message.type()))report.errors.push({viewport:size.name,hour,type:message.type(),message:message.text(),location:message.location()});});
  const waitLighting=()=>page.waitForFunction(()=>{
   const lab=window.__flickerLab,info=lab?.placeInfo?.(),state=info?.lightingState,light=lab?.currentDaylight?.continuous;
   if(!info?.baked||!state||!light||state.pendingPasses.length||Math.abs(lab.currentDaylightLocalHour-window.__captureLocalHour)>.00001)return false;
   const night=Math.max(0,Math.min(1,light.n??1)),dusk=Math.max(0,Math.min(1,light.g??0))*(1-night*.35),wanted=[night*(1-dusk),dusk,(1-night)*(1-dusk)],sum=wanted.reduce((a,b)=>a+b,0);wanted.forEach((value,index)=>wanted[index]=value/Math.max(.0001,sum));
   return wanted.every((value,index)=>Math.abs(value-state.weights[index])<.00011&&state.residentPasses.includes(['night','dusk','day'][index])===(value>.0001))&&state.residentPasses.includes('lamp');
  },null,{polling:100,timeout:120000});
  const shot=async name=>{
   await page.waitForFunction(()=>window.__captureCameraState?.().pendingTweens===0);await waitLighting();
   await page.waitForFunction(()=>{
    const fade=document.getElementById('fade');if(fade&&Number(getComputedStyle(fade).opacity)>=.01)return false;
    return [...document.querySelectorAll('.sheet .inner')].filter(element=>{const box=element.getBoundingClientRect(),s=getComputedStyle(element);return box.width>0&&box.height>0&&s.visibility!=='hidden'&&s.display!=='none';}).every(element=>{
      const s=getComputedStyle(element),m=s.transform==='none'?new DOMMatrixReadOnly():new DOMMatrixReadOnly(s.transform);
      return Number(s.opacity)>=.999&&Math.abs(m.m11-1)<.0001&&Math.abs(m.m22-1)<.0001&&Math.abs(m.m33-1)<.0001&&Math.abs(m.m41)<.0001&&Math.abs(m.m42)<.0001&&Math.abs(m.m43)<.0001&&element.getAnimations().every(animation=>!['running','pending'].includes(animation.playState));
    });
   },null,{polling:50,timeout:30000});
   const metadata=await page.evaluate(()=>({place:window.__flickerLab.placeInfo(),renderInfo:window.__flickerLab.renderInfo(),delivery:window.__captureDeliveryInfo?.()??null,camera:window.__captureCameraState(),ignition:window.__visualIgnition??null,uiSettle:{fadeOpacity:Number(getComputedStyle(document.getElementById('fade')).opacity),sheets:[...document.querySelectorAll('.sheet .inner')].map(element=>({opacity:Number(getComputedStyle(element).opacity),transform:getComputedStyle(element).transform,animations:element.getAnimations().map(animation=>({state:animation.playState,currentTime:animation.currentTime}))}))}}));
   for(const [pass,bank]of Object.entries(metadata.delivery?.bankReferences??{}))if(pass!=='lamp'&&!metadata.place.lightingState.residentPasses.includes(pass)&&bank.nonPlaceholderSamplerReferences)report.errors.push({viewport:size.name,hour,name,error:`Inactive ${pass} samplers still reference an atlas.`,bank});
   await page.screenshot({path:`${out}/${name}.png`});report.views.push({viewport:size.name,hour,name,file:`${out}/${name}.png`,...metadata});await save();console.log('LOOK',size.name,hour,name);
  };
  const hot=async(to,name)=>{
   await page.evaluate(()=>Object.assign(window.__flickerLab,{lockCamera:true,pauseTweens:true,freezeScene:false,freezeGrade:false,freezeFuel:false,freezeDaylight:false,hideParticles:false}));
   const before=await page.evaluate(()=>({hour:window.__captureLocalHour,delivery:window.__captureDeliveryInfo(),lighting:window.__flickerLab.placeInfo().lightingState}));
   const requestStart=report.requests.length;
   currentHour=to;
   await page.evaluate(({to,name})=>{window.__flickerLab.begin({name,seconds:120});window.__captureLocalHour=to;},{to,name});
   // Keep raw acquisition running until the late bank has loaded and crossfaded.
   // Every transition records at least ten seconds; network latency is not hidden.
   await Promise.all([waitLighting(),page.waitForTimeout(10000)]);
   await page.evaluate(()=>window.__flickerLab.endRecording('lighting settled; minimum ten seconds observed'));
   await page.waitForFunction(()=>window.__flickerLab.result!==null,null,{timeout:30000});const result=await page.evaluate(()=>window.__flickerLab.result);if(result.packingError)throw new Error(result.packingError);
   const after=await page.evaluate(()=>({hour:window.__captureLocalHour,delivery:window.__captureDeliveryInfo(),lighting:window.__flickerLab.placeInfo().lightingState}));
   await mkdir(`${out}/hot-luminance`,{recursive:true});for(const roi of result.rois)if(roi.rawLuminance?.gzipBase64){const bytes=Buffer.from(roi.rawLuminance.gzipBase64,'base64'),file=`${out}/hot-luminance/${name}-${roi.name}.u32le.gz`;await writeFile(file,bytes);delete roi.rawLuminance.gzipBase64;Object.assign(roi.rawLuminance,{file,sha256:createHash('sha256').update(bytes).digest('hex')});}
   await writeFile(`${out}/${name}.json`,JSON.stringify(result));await page.screenshot({path:`${out}/${name}.png`});
   const weights=result.samples.map(sample=>sample.burn?.lightingState?.weights).filter(Boolean),luma=result.rois.filter(roi=>roi.type==='structure').map(roi=>({name:roi.name,meanLuminanceMinimum:Math.min(...result.samples.map(sample=>sample.rois[roi.name].mean)),meanLuminanceFirst:result.samples[0].rois[roi.name].mean,meanLuminanceLast:result.samples.at(-1).rois[roi.name].mean}));
   const bankRequests=report.requests.slice(requestStart).filter(request=>bankUris.some(uri=>new URL(request.url).pathname.endsWith('/'+uri)));
   const minimum=weights.length?Math.min(...weights.map(values=>values.reduce((a,b)=>a+b,0))):null;
   report.hotSwitches.push({viewport:size.name,name,from:before.hour,to,before,after,rawFile:`${out}/${name}.json`,bankRequests,restoreWithoutBankRequest:name.includes('restore')?bankRequests.length===0:null,ambientWeightSumMinimum:minimum,ambientWeightTraceAvailable:weights.length===result.samples.length,luminance:luma,cameraDelta:result.cameraMaximumElementDelta,projectionDelta:result.projectionMaximumElementDelta});
   if(minimum===null||minimum<.999||result.cameraMaximumElementDelta!==0||result.projectionMaximumElementDelta!==0)report.errors.push({viewport:size.name,name,error:'Hot transition had a missing/zero ambient weight trace or moved its inspection camera.'});
   if(name.includes('restore')&&bankRequests.length)report.errors.push({viewport:size.name,name,error:'Returning to a previously loaded bank issued another bank request.',bankRequests});
   await save();
   await page.evaluate(()=>window.__flickerLab.pauseTweens=false);
  };
  let burning=false;
  try{
   await page.goto(base);await page.bringToFront();await page.getByLabel(re('你的愿望','Your wish')).waitFor();await page.waitForFunction(()=>window.__ready===true&&!!window.__captureDeliveryInfo);await assertServedSnapshot(page,report.sourceStart);await page.evaluate(()=>document.fonts.ready.then(()=>true));
   await page.getByLabel(re('你的愿望','Your wish')).fill(size.phone?'愿这一盏灯，陪伴安静的时光。':'May this lamp keep someone company.');await act(button(re('许好了','Set my wish')));await button(re('走进院里','Step inside')).waitFor();await page.waitForFunction(()=>Number(getComputedStyle(document.getElementById('fade')).opacity)<.01);await shot('outside');
   await act(button(re('走进院里','Step inside')));await act(button(re('跳过','Skip')));await page.getByRole('tab',{name:re('现成的','Ready-made')}).waitFor();await act(page.locator('.sizes [role=radio]').first());await shot('choose');
   await act(button(re('选这一盏','Take this one')));await button(re('点亮这一盏','Light it')).waitFor();await shot('confirm');
   if(uiSettledOnly){report.cleanup.push({viewport:size.name,hour,noCandleLit:true,purpose:'Outside/choose/confirm CSS-settled still repair only.'});continue;}
   await act(button(re('点亮这一盏','Light it')));burning=true;await page.waitForFunction(()=>window.__visualIgnition?.state==='settled'&&window.__visualIgnition.progress===1);await shot('burning');
   if(hour===22&&process.env.HOT_SWITCH!=='0'){await hot(13,'hot-night-to-day');await hot(22,'hot-day-to-night-restore');}
   await act(button(re('^熄灭$','^Put out$')));await act(button(re('熄灭并结束','Put out and end')));await page.getByTestId('result-title').waitFor();burning=false;report.cleanup.push({viewport:size.name,hour,candles:await page.evaluate(async()=>(await(await fetch('/api/me/candles')).json()).candles)});
  }catch(error){report.errors.push({viewport:size.name,hour,fatal:error.stack});await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
  finally{await page.evaluate(()=>{if(window.__flickerLab)window.__flickerLab.pauseTweens=false;}).catch(()=>{});if(burning){try{await act(button(re('^熄灭$','^Put out$')));await act(button(re('熄灭并结束','Put out and end')));}catch{}}await context.close();await save();}
 }
}finally{await browser.close();report.finishedAt=new Date().toISOString();report.sourceEnd=await fingerprintCaptureSource(source);report.sourceChanged=report.sourceStart.aggregateSha256!==report.sourceEnd.aggregateSha256;await save();console.log('LOOKS_DONE',JSON.stringify({views:report.views.length,hotSwitches:report.hotSwitches.length,errors:report.errors.length,sourceChanged:report.sourceChanged}));if(report.errors.length||report.sourceChanged)process.exitCode=1;}
