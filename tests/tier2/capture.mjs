// Repeatable GPU Chrome visual/performance evidence. No production test hooks.
// Usage: EVIDENCE=baseline BASE_URL=http://localhost:8792 DB_FILE=/tmp/one-light-visual.db node tests/tier2/capture.mjs
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import Database from 'better-sqlite3';
const tag = process.env.EVIDENCE || 'baseline';
const root = `artifacts/tier2/${tag}`;
const base = process.env.BASE_URL || 'http://localhost:8792';
const dbFile = process.env.DB_FILE;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const re = (zh,en) => new RegExp(`${zh}|${en}`);
const reports=[];
const places=['lingyin','shaolin','yonghe','jokhang','puji','zixiao','qufu','meizhou','guandi','hongluo'];
async function run(size){
 const out=`${root}/${size.name}`;await mkdir(out,{recursive:true});
 const context=await browser.newContext({ viewport: size.viewport, locale: size.locale, hasTouch: size.phone, isMobile: size.phone });
 const page=await context.newPage();page.setDefaultTimeout(60000);
 const layoutProblems=[]; const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const cdp=await context.newCDPSession(page);
 await context.addInitScript(()=>{
  window.__evidence={ frames:[], renderedFrames:[], longTasks:[], phase:'load', marks:{} };
  let draws=0, priorDraws=0, lastRender=0;
  for(const key of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) {
    const original=WebGL2RenderingContext.prototype[key];
    WebGL2RenderingContext.prototype[key]=function(...args){draws++;return original.apply(this,args);};
  }
  const sample=t=>{if(draws!==priorDraws){if(lastRender)window.__evidence.renderedFrames.push({phase:window.__evidence.phase,ms:t-lastRender,draws:draws-priorDraws});lastRender=t;priorDraws=draws;}requestAnimationFrame(sample);};requestAnimationFrame(sample);
  const usable=new MutationObserver(()=>{if(document.querySelector('textarea')){window.__evidence.marks.wishUsable=performance.now();usable.disconnect();}});usable.observe(document,{childList:true,subtree:true});
  let last=0;const frame=(t)=>{if(last)window.__evidence.frames.push({phase:window.__evidence.phase,ms:t-last});last=t;requestAnimationFrame(frame);};requestAnimationFrame(frame);
  new PerformanceObserver(list=>{for(const e of list.getEntries())window.__evidence.longTasks.push({phase:window.__evidence.phase,ms:e.duration,start:e.startTime});}).observe({type:'longtask',buffered:true});
  const now=performance.now.bind(performance);window.__clockOffset=0;performance.now=()=>now()+window.__clockOffset;
 });
 const phase=async name=>page.evaluate(n=>{window.__evidence.phase=n;window.__evidence.marks[n]=performance.now();},name);
 const shot=async(name,wait=350)=>{await page.waitForTimeout(wait);const overflow=await page.evaluate(()=>[...document.querySelectorAll('.ui button,.ui textarea,.ui h1,.ui h2')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left < -2 || r.right > innerWidth+2);}).map(e=>e.textContent?.slice(0,70)));if(overflow.length)layoutProblems.push({name,overflow});await page.screenshot({path:`${out}/${name}.png`});console.log(size.name,name);};
 const dark=async(name)=>{await page.evaluate(()=>document.querySelector('.ui').style.visibility='hidden');await page.screenshot({path:`${out}/${name}.png`});await page.evaluate(()=>document.querySelector('.ui').style.visibility='');};
 const button=name=>page.getByRole('button',{name});
 const start=async()=>{await page.goto(base);await page.getByLabel(re('你的愿望','Your wish')).waitFor();await page.waitForFunction(()=>window.__ready===true,{timeout:60000});};
 await start();
 const loads=await page.evaluate(()=>({navigation:performance.getEntriesByType('navigation')[0].toJSON(),wishUsable:window.__evidence.marks.wishUsable??performance.now(),resources:performance.getEntriesByType('resource').map(x=>({name:x.name,duration:x.duration,bytes:x.transferSize}))}));
 const gpu=await page.evaluate(()=>{const gl=document.querySelector('#gl').getContext('webgl2');const info=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:gl.getParameter(info.UNMASKED_RENDERER_WEBGL),vendor:gl.getParameter(info.UNMASKED_VENDOR_WEBGL)};});
 await phase('wish');await shot('wish',2500);
 await button(re('^我的烛$','^My Candles$')).click();await shot('my-candles-empty');await button(re('^关闭$','^Close$')).click();
 await page.getByLabel(re('你的愿望','Your wish')).fill(size.phone?'愿远行的人平安，也愿心里有光。':'May those far from home find a little peace.');
 await button(re('许好了','Set my wish')).click();await phase('place');await shot('place-lingyin',2500);
 const radioPlaces=page.locator('.places [role=radio]');
 for(let i=1;i<places.length;i++){await phase(`place-${places[i]}`);await radioPlaces.nth(i).click();await shot(`place-${places[i]}`,1800);}
 await radioPlaces.nth(0).click();await page.waitForTimeout(1700);
 await phase('travel');await button(re('就放在这里','Leave it here')).click();await shot('travel',500);await button(re('跳过','Skip')).click();
 await page.getByRole('tab',{name:re('现成的','Ready-made')}).waitFor();await phase('candle');await shot('candle-presets',1800);
 await page.getByRole('tab',{name:re('^自己画$','^Draw$')}).click();await shot('drawing-empty');
 const pad=page.locator('.pad');const rect=await pad.boundingBox();
 await phase('drawing');await page.mouse.move(rect.x+rect.width*.35,rect.y+rect.height*.22);await page.mouse.down();
 await page.mouse.move(rect.x+rect.width*.28,rect.y+rect.height*.72,{steps:25});await page.mouse.move(rect.x+rect.width*.7,rect.y+rect.height*.72,{steps:20});await page.mouse.move(rect.x+rect.width*.62,rect.y+rect.height*.2,{steps:25});await page.mouse.up();await shot('drawing-shaped',1500);
 await page.getByRole('tab',{name:re('现成的','Ready-made')}).click();await page.getByRole('radio',{name:re('^10 分钟$','^10 min$')}).click();
 await phase('confirm');await button(re('带上这支','Take this one')).click();await button(re('点亮这支','Light it')).waitFor();await shot('confirm',500);
 await phase('ignition');await button(re('点亮这支','Light it')).click();await shot('ignition',200);
 await page.getByTestId('with-you').waitFor();await phase('burning-measurement');await page.waitForTimeout(5000);await phase('burning');await shot('burning',0);
 await dark('burning-dark-room');
 if(await button(re('^省电$','^Save power$')).count()) {
  await button(re('^省电$','^Save power$')).click();await phase('power-saver-measurement');await page.waitForTimeout(5000);await shot('power-saver',0);await button(re('^细腻画质$','^Full detail$')).click();
  await page.mouse.move(size.viewport.width*.38,size.viewport.height*.45);await page.mouse.move(size.viewport.width*.62,size.viewport.height*.45,{steps:10});await shot('pointer-flame-response',50);
 }

 await button(re('^我的烛$','^My Candles$')).click();await shot('leave-confirm');await button(re('^留下$','^Stay$')).click();
 await button(re('^熄灭$','^Put out$')).click();await shot('put-out-confirm');await button(re('熄灭并结束','Put out and end')).click();await phase('went-out');await shot('went-out-smoke',250);await shot('went-out',1800);
 await button(re('^我的烛$','^My Candles$')).click();await page.getByTestId('record').first().waitFor();await shot('my-candles');
 await page.getByRole('button',{name:re('^已熄灭$','^Went out$')}).click();await shot('my-candles-out-filter');
 await page.getByRole('button',{name:re('^已燃尽$','^Burned down$')}).click();await shot('my-candles-done-filter');
 await page.getByRole('tab',{name:re('我的愿望','My wishes')}).click();await shot('my-wishes');await button(re('^关闭$','^Close$')).click();
 await button(re('^十处灯火$','^Ten Lights$')).click();await shot('ten-lights');await button(re('^时间最长$','^Most time$')).click();await shot('ten-lights-time');await button(re('^此刻$','^Now$')).click();await shot('ten-lights-now');await button(re('^关闭$','^Close$')).click();
 // Second light uses paired artificial client/server time solely to inspect long-burn and ending artwork.
 await button(re('^为这个愿，再点一支$','^Light a new one for this wish$')).click();await button(re('就放在这里','Leave it here')).click();await button(re('跳过','Skip')).click();await page.getByRole('radio',{name:re('^10 分钟$','^10 min$')}).click();await button(re('带上这支','Take this one')).click();await button(re('点亮这支','Light it')).click();await page.getByTestId('with-you').waitFor();await page.waitForTimeout(1900);
 const active=await page.evaluate(async()=> (await(await fetch('/api/me/candles')).json()).candles.find(c=>c.status==='burning'));
 if(dbFile&&active){const db=new Database(dbFile);db.prepare('UPDATE candles SET started_at=started_at-600000 WHERE id=?').run(active.id);db.close();}
 await page.evaluate(()=>window.__clockOffset=300000);await phase('half-burn-accelerated');await shot('half-burn-drips-accelerated',1200);
 await page.evaluate(()=>window.__clockOffset=594000);await phase('late-burn-accelerated');await shot('late-burn-accelerated',1400);
 await page.evaluate(()=>window.__clockOffset=601000);await phase('burned-down-accelerated');await shot('burned-down-ember-accelerated',300);await shot('burned-down-accelerated',2200);
 await button(re('^我的烛$','^My Candles$')).click();await shot('my-candles-both-endings');await button(re('^关闭$','^Close$')).click();
 await button(re('^为这个愿，再点一支$','^Light a new one for this wish$')).click();await radioPlaces.nth(3).click();await page.waitForTimeout(1600);await button(re('就放在这里','Leave it here')).click();await button(re('跳过','Skip')).click();await page.getByRole('tab',{name:re('自己添油','Fill your own')}).click();await shot('butter-lamp-fill',1800);await page.locator('input[type=range]').fill('720');await shot('butter-lamp-filled',800);await button(re('带上这支','Take this one')).click();await button(re('点亮这支','Light it')).click();await shot('butter-lamp-burning',2200);await dark('butter-lamp-dark-room');
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.waitForTimeout(300);
 const metrics=await page.evaluate(()=>window.__evidence);
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 await button(re('^为这个愿，再点一支$','^Light a new one for this wish$')).click();await phase('place-switch-4x');await radioPlaces.nth(1).click();await page.waitForTimeout(4500);await radioPlaces.nth(0).click();await page.waitForTimeout(4500);
 const throttled=await page.evaluate(()=>window.__evidence);
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await page.reload();await page.getByLabel(re('你的愿望','Your wish')).waitFor();const warmUsable=await page.evaluate(()=>window.__evidence.marks.wishUsable);
 const report={size,tag,gpu,loads,warmUsable,errors,layoutProblems,metrics,throttled,notes:['Viewport/touch emulation on desktop GPU; not a real phone.','Late burn and burned-down use accelerated client and matching SQLite start clock, not long-session endurance evidence.','Cold browser cache on local server; network not 4G.']};
 await writeFile(`${out}/metrics.json`,JSON.stringify(report,null,2));reports.push(report);await context.close();
}
try{for(const size of [{name:'desktop-en',viewport:{width:1440,height:900},locale:'en-US',phone:false},{name:'phone-zh',viewport:{width:390,height:844},locale:'zh-CN',phone:true}])await run(size);await writeFile(`${root}/report.json`,JSON.stringify(reports,null,2));}finally{await browser.close();}
