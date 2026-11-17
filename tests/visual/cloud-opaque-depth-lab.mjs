// Isolated 128px real-GPU lab; no app/Cloud assets. Requires explicit Root lease.
import {chromium,webkit} from '@playwright/test';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {installCaptureGpuGuard,assertCaptureGpuHealthy} from './capture-preflight.mjs';
if(process.env.GPU_LEASE!=='root-approved-cloud-depth')throw Error('Explicit Root GPU lease required before launching browsers');
const out=process.env.OUTPUT??'artifacts/full-review/round-1/cloud-opaque-depth-gpu',snapshot=await mkdtemp(join(tmpdir(),'one-light-cloud-opaque-depth-')),sha=b=>createHash('sha256').update(b).digest('hex');
await mkdir(out,{recursive:true});
const routes=new Map(),fingerprints=[];
for(const [url,source]of [['/cloudOpaqueDepth.js','web/src/engine/places/cloudOpaqueDepth.js'],['/three.module.js','node_modules/three/build/three.module.js']]){const bytes=await readFile(source);routes.set(url,bytes);fingerprints.push({path:source,sha256:sha(bytes)});}
routes.set('/lab.js',await readFile('tests/visual/cloud-opaque-depth-lab-browser.mjs'));
routes.set('/',Buffer.from('<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><style>html,body{margin:0;background:#111}canvas{display:block;width:128px;height:128px}</style><script type="importmap">{"imports":{"three":"/three.module.js"}}</script><canvas id="gl" width="128" height="128"></canvas><script type="module" src="/lab.js"></script>'));
for(const [url,bytes]of routes)await writeFile(join(snapshot,url==='/'?'index.html':url.slice(1)),bytes);
await writeFile(join(snapshot,'fingerprint.json'),JSON.stringify(fingerprints,null,2)+'\n');
const server=createServer((req,res)=>{const path=(req.url??'/').split('?')[0],bytes=routes.get(path);if(!bytes){res.writeHead(404);res.end();return;}res.setHeader('content-type',path.endsWith('.js')?'text/javascript':path.endsWith('.json')?'application/json':path.endsWith('.webp')?'image/webp':'text/html');res.setHeader('cache-control','no-store');res.end(bytes);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,report={scope:'Bounded actual opaque-depth GPU helper lab only. Actual Three160 ordinary geometry, packed-linear depth, nestedMSAA/cube cameras and tiny constant-density ray limit. No full Snow/Cloud app, no FPS or final optical approval.',snapshot,fingerprints,rows:[],errors:[]};
try{for(const name of ['chromium','webkit']){
 const browser=name==='chromium'?await chromium.launch({channel:'chrome',headless:false,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']}):await webkit.launch({headless:false});
 let activePage=null;try{
  const context=await browser.newContext({viewport:{width:128,height:128},deviceScaleFactor:1});await context.addInitScript(installCaptureGpuGuard);const page=await context.newPage();activePage=page;page.setDefaultTimeout(90000);
  page.on('pageerror',error=>report.errors.push({browser:name,type:'pageerror',error:error.stack}));page.on('console',message=>{if(message.type()==='error')report.errors.push({browser:name,type:'console',error:message.text()});});page.on('response',response=>{if(response.status()>=400)report.errors.push({browser:name,type:'http',url:response.url(),status:response.status()});});
  await page.goto(base);await page.waitForFunction(()=>window.__cloudDepthLabReady);await assertCaptureGpuHealthy(page);
  const row=await page.evaluate(()=>window.__runCloudDepthLab());row.browser=name;row.health=await assertCaptureGpuHealthy(page);await page.locator('canvas').screenshot({path:out+'/'+name+'-opaque-depth-128.png'});row.frameSha256=sha(await readFile(out+'/'+name+'-opaque-depth-128.png'));
  row.cleanup=await page.evaluate(()=>window.__disposeCloudDepthLab());report.rows.push(row);await context.close();console.log('CLOUD_OPAQUE_DEPTH_GPU_BROWSER',name,JSON.stringify(row));
 }catch(error){report.partialBrowser=name;report.partial=await activePage?.evaluate(()=>window.__cloudDepthProgress??null).catch(()=>null);throw error;}finally{await browser.close();}
}}catch(error){report.fatalError=error.stack;throw error;}finally{
 await new Promise(resolve=>server.close(resolve));report.ownedBrowsersClosed=true;report.serverClosed=true;
 report.snapshotUnchanged=true;for(const [url,bytes]of routes)if(sha(await readFile(join(snapshot,url==='/'?'index.html':url.slice(1))))!==sha(bytes))report.snapshotUnchanged=false;
 report.liveSourcesChanged=[];for(const file of fingerprints)if(sha(await readFile(file.path))!==file.sha256)report.liveSourcesChanged.push(file.path);
 report.passed=!report.errors.length&&report.rows.length===2&&report.rows.every(row=>row.passed)&&report.snapshotUnchanged;await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
}
if(!report.passed)throw Error('Cloud opaque depth GPU lab failed; inspect '+out+'/report.json');
console.log('CLOUD_OPAQUE_DEPTH_GPU_TERMINAL_PASS',report.rows.length,'browsers closed; GPU released');
