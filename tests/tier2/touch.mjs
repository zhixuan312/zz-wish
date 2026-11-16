import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:390,height:844},locale:'en-US',isMobile:true,hasTouch:true,deviceScaleFactor:3,reducedMotion:'reduce'});
const page=await context.newPage(),cdp=await context.newCDPSession(page),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(60000);
try {
 await page.goto(process.env.BASE_URL||'http://localhost:8792');await page.getByLabel('Your wish').waitFor();
 await page.getByLabel('Your wish').fill('Touch-drawn candle');await page.getByRole('button',{name:'Set my wish',exact:true}).tap();await page.getByRole('button',{name:'Leave it here',exact:true}).tap();
 await page.getByRole('tab',{name:'Draw',exact:true}).tap();const rect=await page.locator('.pad').boundingBox();
 const points=[[.32,.2],[.27,.7],[.7,.7],[.6,.2]];
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width*points[0][0],y:rect.y+rect.height*points[0][1]}]});
 for(let p=1;p<points.length;p++)for(let k=1;k<=14;k++){const a=points[p-1],b=points[p];await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:rect.x+rect.width*(a[0]+(b[0]-a[0])*k/14),y:rect.y+rect.height*(a[1]+(b[1]-a[1])*k/14)}]});}
 const liveDuration=await page.getByTestId('duration').textContent();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(500);
 const normalPixels=await page.locator('#gl').evaluate(c=>c.width);if(normalPixels>490)throw new Error('Phone quality did not cap pixel ratio');
 const duration=await page.getByTestId('duration').textContent();if(!duration||duration==='—'||liveDuration==='—')throw new Error('Touch drawing has no live duration');
 await mkdir('artifacts/tier2/touch',{recursive:true});await page.screenshot({path:'artifacts/tier2/touch/drawn-phone.png'});
 await page.getByRole('button',{name:/Take this one/}).tap();await page.getByRole('button',{name:/Light it/}).tap();await page.getByTestId('with-you').waitFor();await page.getByRole('button',{name:'Save power',exact:true}).tap();await page.waitForTimeout(1400);
 const saverPixels=await page.locator('#gl').evaluate(c=>c.width);if(saverPixels!==390)throw new Error('Power saver did not use DPR 1');
 await page.screenshot({path:'artifacts/tier2/touch/burning-power-saver.png'});
 await page.getByRole('button',{name:'Put out',exact:true}).tap();await page.getByRole('button',{name:'Put out and end',exact:true}).tap();await page.getByTestId('result-title').waitFor();
 await page.getByRole('button',{name:'My Candles',exact:true}).tap();await page.getByTestId('record').first().waitFor();const status=await page.getByTestId('record-status').first().textContent();if(!status.includes('Went out'))throw new Error(status);
 await page.screenshot({path:'artifacts/tier2/touch/record-phone.png'});
 await writeFile('artifacts/tier2/touch/report.json',JSON.stringify({liveDuration,duration,status,normalPixels,saverPixels,errors,notes:'CDP touch input with reduced motion at 390x844 with emulated DPR 3 on desktop GPU; not a real phone.'},null,2));
 if(errors.length)throw new Error(errors.join('\n'));console.log('Touch drawing, live duration, reduced motion, lighting, power saver and settlement passed.');
} finally {await browser.close();}
