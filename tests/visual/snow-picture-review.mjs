// Quick live picture choices. No benchmark or final acceptance claim.
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const base=process.env.BASE_URL??'http://127.0.0.1:5250',out=process.env.OUTPUT,posesFile=process.env.POSES;
if(!out||!posesFile)throw Error('Explicit OUTPUT/POSES required');
const registry=JSON.parse(await readFile(posesFile)),poses=registry.candidates??registry;
await mkdir(out,{recursive:true});const report={scope:'Live camera/exposure/coupled candle picture choices only. No authoring/public adoption or FPS claim.',frames:[],errors:[]};
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
try{for(const size of[{name:'desktop',width:1440,height:900},{name:'phone',width:390,height:844}].filter(s=>!process.env.VIEWPORT||s.name===process.env.VIEWPORT)){
 const context=await browser.newContext({viewport:size,deviceScaleFactor:1,locale:'en-US',isMobile:size.name==='phone',hasTouch:size.name==='phone'});
 await context.addInitScript(()=>{Date.prototype.getHours=()=>22;Date.prototype.getMinutes=()=>0;window.__visualFreezeCamera=true;});
 const page=await context.newPage();page.setDefaultTimeout(90000);page.on('pageerror',e=>report.errors.push(e.stack));
 try{
  await page.goto(base);await page.waitForFunction(()=>window.__ready&&window.__captureSnowPicture);
  await page.getByLabel('Your wish').fill('A quiet light in the old hall.');await page.getByRole('button',{name:'Set my wish',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.court-loading')?.dataset.stage==='ready');
  await page.getByRole('button',{name:'Step inside',exact:true}).click();await page.getByRole('button',{name:'Skip',exact:true}).click();
  await page.getByRole('radio',{name:'Red gauze',exact:true}).click();await page.getByRole('button',{name:/^Light it(?: ·|$)/}).click();
  await page.waitForFunction(()=>window.__visualIgnition?.state==='settled'&&window.__visualIgnition.progress===1);
  await page.evaluate(()=>{window.__captureSetPhysicalState({time:17,fuel:1});Object.assign(window.__flickerLab,{lockCamera:true,pauseTweens:true,freezeScene:true,freezeDaylight:true,freezeFuel:true,freezeFlame:true,freezeLampMotion:true,hideParticles:true});});
  await page.addStyleTag({content:'.ui{visibility:hidden!important}'});
  const shot=async(name,pose,look)=>{
   await page.evaluate(({pose,look})=>{window.__captureSetCamera(pose);window.__captureSnowPicture(look);},{pose,look});await page.waitForTimeout(220);
   const file=`${out}/${size.name}-${name}.png`;await page.screenshot({path:file});report.frames.push({size:size.name,name,file,pose,look});console.log('PICTURE',size.name,name);
  };
  const selected=poses.filter(p=>!p.viewport||p.viewport===size.name);
  for(const p of selected)await shot(p.name??p.id,p,{exposureEV:0,powerScale:1,vignette:true,doorFill:0});
  const p=selected.find(p=>p.preferred)??selected[0];
  for(const [name,look]of Object.entries({clearer:{exposureEV:.65,powerScale:1,vignette:false,doorFill:0},candle2:{exposureEV:.65,powerScale:2,vignette:false,doorFill:0},candle3:{exposureEV:.65,powerScale:3,vignette:false,doorFill:0},doorSoft:{exposureEV:.65,powerScale:2,vignette:false,doorFill:.16},roomSoft:{exposureEV:.35,powerScale:1,vignette:false,doorFill:0,roomFill:1.43},roomSoftCandle2:{exposureEV:.35,powerScale:2,vignette:false,doorFill:0,roomFill:1.43}}))await shot(name,p,look);
 }finally{await context.close();await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');}
}}finally{await browser.close();}
if(report.errors.length)throw Error('Picture review runtime errors');
