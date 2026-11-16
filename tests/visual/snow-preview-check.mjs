// First actual-browser check of a frozen Snow Roof delivery. No test suite.
import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fingerprintCaptureSource } from './capture-source-fingerprint.mjs';
import { setFocusEmulation } from './native-focus-control.mjs';
import { createHash } from 'node:crypto';
const base = process.env.BASE_URL || 'http://127.0.0.1:5191';
const source = process.env.SOURCE_ROOT || '/tmp/one-light-snow-single-after';
const out = `artifacts/snow-journey/${process.env.EVIDENCE || 'after-partial-preview-check'}`;
await mkdir(out, { recursive: true });
const manifest = JSON.parse(await readFile(`${source}/web/public/places/snow-roof/manifest.json`, 'utf8'));
const nativeHidden=process.env.NATIVE_HIDDEN==='1';
const report = { base, createdAt:new Date().toISOString(), label: 'Actual partial night preview at local 22:00; dusk/day maps are absent.', partialPreview: manifest.partialPreview ?? false, noVideo:true, nativeLifecycle:[],source: await fingerprintCaptureSource(source), frames: [], errors: [], resources: [], records: [], gpu: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const re = (zh, en) => new RegExp(`${zh}|${en}`);
try {
 for (const size of [{ name:'desktop-en',width:1440,height:900,locale:'en-US',phone:false },{ name:'phone-zh',width:390,height:844,locale:'zh-CN',phone:true }].filter(size=>!process.env.VIEWPORT||size.name.startsWith(process.env.VIEWPORT))) {
  const context = await browser.newContext({ viewport:{width:size.width,height:size.height},locale:size.locale,hasTouch:size.phone,isMobile:size.phone });
  await context.addInitScript(() => { Date.prototype.getHours=()=>22;Date.prototype.getMinutes=()=>0;window.__visualFreezeCamera=true;window.__nativeLifecycle=[];for(const type of ['blur','focus'])window.addEventListener(type,event=>window.__nativeLifecycle.push({type,trusted:event.isTrusted,hidden:document.hidden,visibility:document.visibilityState,focused:document.hasFocus(),time:performance.now()}));document.addEventListener('visibilitychange',event=>window.__nativeLifecycle.push({type:'visibilitychange',trusted:event.isTrusted,hidden:document.hidden,visibility:document.visibilityState,focused:document.hasFocus(),time:performance.now()})); });
  const page=await context.newPage();page.setDefaultTimeout(120000);
  const network=await context.newCDPSession(page);await network.send('Network.enable');network.on('Network.responseReceived',event=>{if(event.response.status>=400)report.resources.push({viewport:size.name,source:'CDP',status:event.response.status,url:event.response.url});});
  page.on('pageerror',error=>{report.errors.push({viewport:size.name,error:error.stack});console.log('PAGE ERROR',size.name,error.stack);});
  page.on('console',message=>{if(message.type()==='error'){report.errors.push({viewport:size.name,console:message.text(),location:message.location()});console.log('CONSOLE ERROR',size.name,message.text());}});
  page.on('response',response=>{if(response.status()>=400){report.resources.push({viewport:size.name,status:response.status(),url:response.url()});console.log('HTTP ERROR',response.status(),response.url());}});
  const act=locator=>size.phone?locator.tap():locator.click();const button=name=>page.getByRole('button',{name});
  const shot=async (name,extra={})=>{
   await mkdir(`${out}/${size.name}`,{recursive:true});await page.screenshot({path:`${out}/${size.name}/${name}.png`});
   const seconds=name==='home-return'&&process.env.HOME_RETURN_SECONDS?Number(process.env.HOME_RETURN_SECONDS):.3;
   const rois=name.startsWith('home')?[{name:'left_lattice',type:'structure',x:.10,y:.50},{name:'floor_planks',type:'structure',x:.40,y:.87},{name:'rock_surface',type:'structure',x:.35,y:.08},{name:'sky_control',type:'sky',x:.80,y:.12}]:undefined;
   await page.evaluate(({name,seconds,rois})=>{Object.assign(window.__flickerLab,{lockCamera:true});window.__flickerLab.begin({name,seconds,rois});},{name,seconds,rois});
   await page.waitForFunction(()=>window.__flickerLab.result!==null,null,{timeout:seconds*1000+20000});
   const result=await page.evaluate(()=>window.__flickerLab.result);
   if(result.packingError)throw new Error(result.packingError);
   if(seconds>=10){
    await mkdir(`${out}/${size.name}/sequences/luminance`,{recursive:true});
    for(const roi of result.rois)if(roi.rawLuminance?.gzipBase64){const bytes=Buffer.from(roi.rawLuminance.gzipBase64,'base64'),file=`${out}/${size.name}/sequences/luminance/${name}-${roi.name}.u32le.gz`;await writeFile(file,bytes);delete roi.rawLuminance.gzipBase64;Object.assign(roi.rawLuminance,{file,compressedBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
    await writeFile(`${out}/${size.name}/sequences/${name}.json`,JSON.stringify(result));
   }
   const metadata={viewport:size.name,name,seconds,samples:result.samples.length,cameraMaximumElementDelta:result.cameraMaximumElementDelta,projectionMaximumElementDelta:result.projectionMaximumElementDelta,place:result.place,lamp:result.lamp,camera:result.cameraStart,projection:result.projectionStart,ignition:await page.evaluate(()=>window.__visualIgnition??null),...extra};
   report.frames.push(metadata);await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log('FRAME',size.name,name,JSON.stringify({baked:metadata.place?.baked,partial:metadata.place?.manifest?.partialPreview,errors:report.errors.length,resources:report.resources.length}));
  };
  try {
   await page.goto(base);await page.bringToFront();await page.getByLabel(re('你的愿望','Your wish')).waitFor();await page.waitForFunction(()=>window.__ready===true&&!!window.__flickerLab);await page.evaluate(()=>document.fonts.ready.then(()=>true));
   report.gpu.push(await page.evaluate(()=>{const gl=window.__renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION)};}));
   await shot('home');await page.getByLabel(re('你的愿望','Your wish')).fill(size.phone?'愿远行的人平安，也愿心里有光。':'May a little light keep someone company.');await act(button(re('许好了','Set my wish')));
   await button(re('走进院里','Step inside')).waitFor();await page.waitForFunction(()=>Number(getComputedStyle(document.getElementById('fade')).opacity)<.01);await shot('outside');
   if(report.frames.at(-1).place?.baked!==true)throw new Error('The actual selected Snow Roof is not using the baked descriptor.');
   await act(button(re('走进院里','Step inside')));await act(button(re('跳过','Skip')));await page.getByRole('tab',{name:re('现成的','Ready-made')}).waitFor();
   await act(page.locator('.sizes [role=radio]').first());await page.waitForTimeout(3000);await shot('choose-10-minutes');
   await act(page.locator('.sizes [role=radio]').last());await page.waitForTimeout(3000);await shot('choose-24-hours');
   await act(page.locator('.sizes [role=radio]').first());await page.waitForTimeout(2500);await act(button(re('选这一盏','Take this one')));await button(re('点亮这一盏','Light it')).waitFor();await page.waitForTimeout(3000);await shot('confirm');
   await act(button(re('点亮这一盏','Light it')));await page.waitForFunction(()=>window.__visualIgnition?.state==='settled'&&window.__visualIgnition.progress===1,null,{timeout:120000});await page.waitForTimeout(500);await shot('burning-settled');
   if(!size.phone&&process.env.CAMERA_VARIANT==='1'){
    const variant={position:[-1,2.22,-2.15],look:[0,2.70,0],fov:40};
    const previous=await page.evaluate(value=>window.__captureSetCamera(value),variant);await page.waitForTimeout(500);
    await shot('burning-camera-variant-exploratory',{cameraVariant:{label:'Exploratory isolated snapshot camera; not actual product flow.',...variant}});
    await page.evaluate(value=>window.__captureSetCamera(value),previous);await page.waitForTimeout(500);
   }
   if(nativeHidden){
    const target=await network.send('Target.getTargetInfo');const originalWindow=await network.send('Browser.getWindowForTarget',{targetId:target.targetInfo.targetId});
    await page.waitForTimeout(600);const eventIndex=await page.evaluate(()=>window.__nativeLifecycle.length);
    await setFocusEmulation(page,false);
    const background=await context.newPage();await background.goto('about:blank');await background.bringToFront();
    const other=await context.newCDPSession(background),otherTarget=await other.send('Target.getTargetInfo');const backgroundWindow=await other.send('Browser.getWindowForTarget',{targetId:otherTarget.targetInfo.targetId});
    let tabHidden=false;try{await page.waitForFunction(()=>document.hidden,null,{polling:100,timeout:3000});tabHidden=true;}catch{}
    let action='Activate second native browser tab';
    if(!tabHidden){action='Native window minimization after tab activation did not hide original page';await network.send('Browser.setWindowBounds',{windowId:originalWindow.windowId,bounds:{windowState:'minimized'}});try{await page.waitForFunction(()=>document.hidden,null,{polling:100,timeout:3000});}catch{}}
    const during=await page.evaluate(()=>({hidden:document.hidden,visibility:document.visibilityState,focused:document.hasFocus()}));
    if(action.startsWith('Native window'))await network.send('Browser.setWindowBounds',{windowId:originalWindow.windowId,bounds:{windowState:'normal'}});
    await page.bringToFront();await background.close();await setFocusEmulation(page,true);
    const events=await page.evaluate(index=>window.__nativeLifecycle.slice(index),eventIndex);const hiddenObserved=during.hidden||events.some(event=>event.type==='visibilitychange'&&event.hidden&&event.trusted);
    report.nativeLifecycle.push({viewport:size.name,action,tabHidden,hiddenObserved,originalWindow,backgroundWindow,sameWindow:originalWindow.windowId===backgroundWindow.windowId,during,events,noVideo:true,noActiveRawReadback:true});
    console.log('NATIVE LIFECYCLE',size.name,JSON.stringify(report.nativeLifecycle.at(-1)));
    if(!hiddenObserved)throw new Error('No trusted native hidden event was observed without video/readback.');
    await page.getByTestId('result-title').waitFor();await page.waitForTimeout(6500);await shot('result-native-hidden');
   }else{await act(button(re('^熄灭$','^Put out$')));await act(button(re('熄灭并结束','Put out and end')));await page.getByTestId('result-title').waitFor();await page.waitForTimeout(6500);await shot('result-put-out');}
   const candles=await page.evaluate(async()=>(await(await fetch('/api/me/candles')).json()).candles);report.records.push({viewport:size.name,candles});
   if(!candles.some(candle=>candle.status==='went_out'&&candle.endReason===(nativeHidden?'left':'put_out')))throw new Error('The actual extinction did not persist.');
   if(nativeHidden){await act(button(re('^许一个新的愿$','^Make a new wish$')));await page.getByLabel(re('你的愿望','Your wish')).waitFor();await page.waitForTimeout(2000);await shot('home-return');}
  } catch(error) { report.errors.push({viewport:size.name,fatal:error.stack});console.error(size.name,error.stack);await page.screenshot({path:`${out}/${size.name}/failure.png`}).catch(()=>{});break; }
  finally {await context.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));}
 }
} finally {await browser.close();report.finishedAt=new Date().toISOString();report.sourceEnd=await fingerprintCaptureSource(source);report.sourceChanged=report.source.aggregateSha256!==report.sourceEnd.aggregateSha256;await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log('DONE',JSON.stringify({errors:report.errors.length,resources:report.resources.length,frames:report.frames.length,partialPreview:report.partialPreview,sourceChanged:report.sourceChanged}));}
