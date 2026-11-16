// Run alone, after builds/tests/captures finish. CPU/network emulation is not device evidence.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const base=process.env.BASE_URL||'http://localhost:8792',tag=process.env.EVIDENCE||'final';
const browser=await chromium.launch({channel:'chrome',args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
const results=[];
const q=(a,p)=>a.length?[...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*p))]:null;
for(const [name,width,height] of [['desktop',1440,900],['phone',390,844]]) {
 const context=await browser.newContext({viewport:{width,height},locale:'en-US',isMobile:width<500,hasTouch:width<500});
 await context.addInitScript(()=>{
  window.__perf={frames:[],renders:[],tasks:[],phase:'load',wishUsable:null,audioContexts:0};
  const observer=new MutationObserver(()=>{if(document.querySelector('textarea')){window.__perf.wishUsable=performance.now();observer.disconnect();}});observer.observe(document,{childList:true,subtree:true});
  new PerformanceObserver(entries=>{for(const e of entries.getEntries())window.__perf.tasks.push({phase:window.__perf.phase,ms:e.duration});}).observe({type:'longtask',buffered:true});
  let draws=0,previous=0,last=0,lastRender=0;
  for(const key of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) {const fn=WebGL2RenderingContext.prototype[key];WebGL2RenderingContext.prototype[key]=function(...args){draws++;return fn.apply(this,args);};}
  const frame=t=>{const phase=window.__perf.phase;if(last)window.__perf.frames.push({phase,ms:t-last});last=t;if(draws!==previous){if(lastRender)window.__perf.renders.push({phase,ms:t-lastRender,draws:draws-previous});lastRender=t;previous=draws;}requestAnimationFrame(frame);};requestAnimationFrame(frame);
  const Original=window.AudioContext;window.AudioContext=class extends Original {constructor(...args){super(...args);window.__perf.audioContexts++;}};
 });
 const page=await context.newPage(),cdp=await context.newCDPSession(page),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.setDefaultTimeout(60000);
 await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:100000});
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByLabel('Your wish').waitFor();
 const networkLoad=await page.evaluate(()=>window.__perf.wishUsable);
 await page.waitForFunction(()=>window.__ready===true);await page.waitForTimeout(1200);
 const fourGReady=await page.evaluate(()=>({at:performance.now(),longTasks:window.__perf.tasks}));
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await page.reload();await page.waitForFunction(()=>window.__ready===true);await page.waitForTimeout(1800);
 const localLoad=await page.evaluate(()=>window.__perf.wishUsable);
 const phase=async p=>page.evaluate(p=>{window.__perf.phase=p;},p);
 const button=n=>page.getByRole('button',{name:n,exact:true});
 await phase('wish');await page.waitForTimeout(4000);
 await page.getByLabel('Your wish').fill('Performance evidence, private');await page.getByRole('button',{name:'Set my wish',exact:true}).click();
 await page.getByRole('button',{name:'Leave it here',exact:true}).waitFor();await page.waitForTimeout(2500);
 const radios=page.locator('.places [role=radio]');
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await phase('place-switch-4x');
 for(const i of [1,2,3,4,5,6,7,8,9,0]) {await radios.nth(i).click();await page.waitForTimeout(2000);}
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await phase('cached-switch');
 for(const i of [9,0,9,0]) {await radios.nth(i).click();await page.waitForTimeout(1400);}
 await phase('travel');await button('Leave it here').click();await button('Skip').click();
 await page.getByRole('radio',{name:'10 min',exact:true}).waitFor();await page.getByRole('radio',{name:'10 min',exact:true}).click();
 await phase('setup');await page.waitForTimeout(4000);
 await page.getByRole('button',{name:/Take this one/}).click();await page.getByRole('button',{name:/Light it/}).waitFor();
 const beforeAudio=await page.evaluate(()=>window.__perf.audioContexts);
 await page.getByRole('button',{name:/Light it/}).click();await page.getByTestId('with-you').waitFor();await page.waitForTimeout(2200);
 await phase('burning');await page.waitForTimeout(8000);
 const afterAudio=await page.evaluate(()=>window.__perf.audioContexts);
 if(await button('Save power').count()) {await button('Save power').click();await phase('power-saver');await page.waitForTimeout(8000);}
 const data=await page.evaluate(()=>({performance:window.__perf,canvas:{width:document.querySelector('#gl').width,height:document.querySelector('#gl').height},resources:performance.getEntriesByType('resource').map(r=>({url:r.name,bytes:r.transferSize}))}));
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.getByTestId('result-title').waitFor();
 const summarize=(entries,phase)=>{const a=entries.filter(x=>x.phase===phase).map(x=>x.ms);return {samples:a.length,p50:q(a,.5),p95:q(a,.95),max:a.length?Math.max(...a):null};};
 const phases=Object.fromEntries(['wish','place-switch-4x','cached-switch','setup','burning','power-saver'].map(p=>[p,{raf:summarize(data.performance.frames,p),render:summarize(data.performance.renders,p),longTasks:summarize(data.performance.tasks,p)}]));
 results.push({name,browserVersion:browser.version(),viewport:{width,height},networkLoad,localLoad,fourGReady,beforeAudio,afterAudio,phases,errors,data});
 console.log(name,JSON.stringify({networkLoad,localLoad,phases,errors,beforeAudio,afterAudio}));await context.close();
}
await browser.close();await mkdir(`artifacts/tier2/${tag}`,{recursive:true});await writeFile(`artifacts/tier2/${tag}/isolated-performance.json`,JSON.stringify(results,null,2));
