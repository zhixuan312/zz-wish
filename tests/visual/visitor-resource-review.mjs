// Bounded real-UI resource observation; requires the exclusive browser GPU lease.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fingerprintCaptureSource } from './capture-source-fingerprint.mjs';
import { assertServedSnapshot } from './capture-preflight.mjs';

const source=process.env.SOURCE_ROOT,base=process.env.BASE_URL,out=process.env.OUTPUT;
if(!source?.startsWith('/tmp/')||!base||!out)throw new Error('Supply a frozen SOURCE_ROOT, BASE_URL and separate OUTPUT.');
const fingerprint=await fingerprintCaptureSource(source),errors=[],readings=[];
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await context.addInitScript(()=>{Date.prototype.getHours=()=>22;Date.prototype.getMinutes=()=>0;});
  const page=await context.newPage();page.setDefaultTimeout(90000);
  page.on('pageerror',error=>errors.push(error.stack));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(base);await page.waitForFunction(()=>window.__ready&&window.__captureMaterialResources);
  await assertServedSnapshot(page,fingerprint);
  await page.getByLabel(/你的愿望|Your wish/).fill('A quiet light.');
  await page.getByRole('button',{name:/许好了|Set my wish/}).tap();
  await page.getByRole('button',{name:/走进院里|Step inside/}).tap();
  await page.getByRole('button',{name:/^跳过$|^Skip$/}).tap();
  await page.getByRole('tab',{name:/现成的|Ready-made/}).waitFor();
  const sample=async(label)=>{
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    readings.push({label,...await page.evaluate(()=>window.__captureMaterialResources())});
  };
  // Warm every distinct vessel/colour path before measuring repeated cycles.
  for(let cycle=0;cycle<5;cycle++){
    for(let i=0;i<3;i++){
      await page.locator('.shapes [role=radio]').nth(i).tap();
      await page.locator('.swatches [role=radio]').nth((i+cycle)%3).tap();
    }
    await sample(`cycle-${cycle+1}`);
  }
  await page.screenshot({path:`${out}/choose.png`});
  await context.close();
}finally{await browser.close();}
const sourceEnd=await fingerprintCaptureSource(source);
const report={scope:'Real phone-viewport Chrome UI; repeated vessel/colour changes; resource counts, not FPS or a physical phone test.',sourceStart:fingerprint,sourceEnd,sourceChanged:fingerprint.aggregateSha256!==sourceEnd.aggregateSha256,readings,errors};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
console.log('VISITOR_RESOURCES',JSON.stringify({readings:readings.map(({label,geometries,textures,programs,retainedReflectionMaterials})=>({label,geometries,textures,programs:programs.length,programReferences:programs.reduce((sum,program)=>sum+program.usedTimes,0),retainedReflectionMaterials})),errors,sourceChanged:report.sourceChanged}));
if(errors.length||report.sourceChanged)process.exitCode=1;
