// Real UI fault/recovery observation. Launch only under the browser GPU lease.
import {chromium,webkit} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {fingerprintCaptureSource} from './capture-source-fingerprint.mjs';
import {assertServedSnapshot} from './capture-preflight.mjs';

const source=process.env.SOURCE_ROOT,base=process.env.BASE_URL,out=process.env.OUTPUT;
if(!source?.startsWith('/tmp/')||!base||!out)throw new Error('Supply frozen SOURCE_ROOT, BASE_URL and OUTPUT.');
const fingerprint=await fingerprintCaptureSource(source),report={scope:'Controlled manifest checksum faults in isolated real browser contexts; original assets and server files remain unchanged. Phone viewport is desktop-GPU emulation.',sourceStart:fingerprint,cases:[]};
await mkdir(out,{recursive:true});
for(const name of (process.env.BROWSERS??'chromium,webkit').split(',')){
  const browser=await(name==='webkit'?webkit:chromium).launch(name==='webkit'?{headless:false}:{channel:'chrome',headless:false,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
  try{for(const place of ['cloud-cliff','snow-roof']){
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'en-US'}),page=await context.newPage(),errors=[],consoleErrors=[];
    const row={browser:name,place,manifestRequests:0,injectedFaults:0,errors,consoleErrors};report.cases.push(row);
    page.setDefaultTimeout(90000);
    await context.addInitScript(()=>{Date.prototype.getHours=()=>22;Date.prototype.getMinutes=()=>0;});
    page.on('pageerror',error=>errors.push(error.stack));
    page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
    await page.route(`**/places/${place}/manifest.json`,async route=>{
      row.manifestRequests++;const response=await route.fetch(),manifest=await response.json();
      if(row.injectedFaults===0){
        const model=manifest.files.find(file=>file.uri===manifest.scene);if(!model)throw new Error('Actual model is undeclared.');
        model.sha256='0'.repeat(64);row.injectedFaults++;
      }
      await route.fulfill({response,json:manifest});
    });
    try{
      await page.goto(base);await page.getByLabel(/你的愿望|Your wish/).waitFor();
      if(place==='snow-roof')await page.waitForFunction(()=>window.__ready);
      await page.getByLabel(/你的愿望|Your wish/).fill('A quiet light after the court is ready.');
      // A cover failure can occur before or during Snow's preparation call.
      // The latter shares the failed startup attempt and exposes the actual
      // Retry control; waiting only for success would miss that valid state.
      await page.waitForFunction(()=>['ready','error'].includes(document.querySelector('.court-loading')?.dataset.stage));
      if(await page.locator('.court-loading').getAttribute('data-stage')==='error'){
        await page.screenshot({path:`${out}/${name}-${place}-error.png`});
        await page.getByRole('button',{name:/再试一次|Try again/}).tap();
        row.recoveryAction='Actual UI Retry button';
      }else row.recoveryAction='Fresh initialization after the failed cover attempt';
      await page.waitForFunction(()=>window.__ready&&document.querySelector('.court-loading')?.dataset.stage==='ready');
      await assertServedSnapshot(page,fingerprint);
      await page.getByRole('button',{name:/许好了|Set my wish/}).tap();
      const enter=page.getByRole('button',{name:/走进院里|Step inside/});
      await enter.waitFor();if(!await enter.isEnabled())throw new Error('Court did not become enterable after recovery.');
      await page.screenshot({path:`${out}/${name}-${place}-recovered.png`});
      if(row.injectedFaults!==1||row.manifestRequests<2)throw new Error('The intended fault/manifest refresh did not occur.');
      row.recovered=true;
    }catch(error){row.recovered=false;errors.push(error.stack);await page.screenshot({path:`${out}/${name}-${place}-failure.png`}).catch(()=>{});}
    finally{await context.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');}
    console.log('LOADING_RECOVERY',JSON.stringify(row));
  }}finally{await browser.close();}
}
report.sourceEnd=await fingerprintCaptureSource(source);report.sourceChanged=fingerprint.aggregateSha256!==report.sourceEnd.aggregateSha256;
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
if(report.sourceChanged||report.cases.some(row=>!row.recovered||row.errors.length||row.consoleErrors.length))process.exitCode=1;
