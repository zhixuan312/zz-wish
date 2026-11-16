import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
try {
 for(const [name,width,height] of [['desktop-en',1440,900],['phone-zh',390,844]]) {
 const page=await browser.newPage({viewport:{width,height}});
 const dir=`artifacts/tier2/prototype/${name}`;await mkdir(dir,{recursive:true});
 await page.goto('http://127.0.0.1:8793/index.html');await page.waitForTimeout(6500);
 const shot=async n=>page.screenshot({path:`${dir}/${n}.png`});
 await shot('wish');await page.locator('#wish').fill('愿远行的人平安');await page.locator('#toTemple').click();await page.waitForTimeout(3000);await shot('place');
 await page.locator('#go').click();await page.waitForTimeout(500);await shot('travel');await page.locator('#skip').click();await page.locator('#place').waitFor({state:'visible'});await shot('candle');
 await page.locator('#place').click();await page.locator('#light').waitFor({state:'visible'});await shot('confirm');await page.locator('#light').click();await page.waitForTimeout(3000);await shot('burning');await page.locator('#gl').screenshot({path:`${dir}/burning-dark-room.png`});
 await page.close();console.log(name,'prototype captured');
 }
} finally {await browser.close();}
