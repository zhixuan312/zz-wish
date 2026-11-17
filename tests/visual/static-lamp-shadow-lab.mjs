// Isolated 128px real-GPU lab; no app/Cloud assets. Requires explicit Root lease.
import {chromium,webkit} from '@playwright/test';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {installCaptureGpuGuard,assertCaptureGpuHealthy} from './capture-preflight.mjs';
if(process.env.GPU_LEASE!=='root-approved-static-helper')throw Error('Explicit Root GPU lease required before launching browsers');
const out=process.env.OUTPUT??'artifacts/full-review/round-1/static-lamp-shadow-gpu',snapshot=await mkdtemp(join(tmpdir(),'one-light-static-shadow-lab-')),sha=b=>createHash('sha256').update(b).digest('hex');
await mkdir(out,{recursive:true});
const routes=new Map(),fingerprints=[];
for(const file of ['staticLampShadow.js','visitorShadow.js','gauzeTransmission.js','gauzeMask.js']){
 const source='web/src/engine/baked/'+file,bytes=await readFile(source);routes.set('/'+file,bytes);fingerprints.push({path:source,sha256:sha(bytes)});
}
for(const [url,source]of [['/three.module.js','node_modules/three/build/three.module.js'],['/proxy.json','art/build/snow-roof-round1/source16-gauze-proxy-default30.json']]){const bytes=await readFile(source);routes.set(url,bytes);fingerprints.push({path:source,sha256:sha(bytes)});}
const scene=await readFile('web/src/engine/scene.js','utf8'),fabric=JSON.parse(await readFile('web/src/engine/baked/visitor-fabric.json','utf8'));
const a=scene.indexOf('function shellMaterial('),b=scene.indexOf('\nconst lathe',a);if(a<0||b<=a)throw Error('Actual cloth factory boundary changed');
const clothSource=scene.slice(a,b);fingerprints.push({path:'web/src/engine/scene.js',sha256:sha(scene),actualClothFactorySha256:sha(clothSource)});
routes.set('/clothFactory.js',Buffer.from(`import * as THREE from 'three';\nconst V3=(x,y,z)=>new THREE.Vector3(x,y,z),visitorFabric=${JSON.stringify(fabric)};\nexport function createActualCloth({weave,normal,roughness}){const gauzeNormal=normal,gauzeRoughness=roughness;${clothSource}\nreturn shellMaterial(0xa82a1c,{cloth:true,map:weave,rough:.82});}`));
for(const [role,file]of Object.entries(fabric.maps)){const source='web/public'+file.path,bytes=await readFile(source);routes.set('/fabric-'+role+'.webp',bytes);fingerprints.push({path:source,sha256:sha(bytes)});}
routes.set('/lab.js',await readFile('tests/visual/static-lamp-shadow-lab-browser.mjs'));
routes.set('/',Buffer.from('<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><style>html,body{margin:0;background:#111}canvas{display:block;width:128px;height:128px}</style><script type="importmap">{"imports":{"three":"/three.module.js"}}</script><canvas id="gl" width="128" height="128"></canvas><script type="module" src="/lab.js"></script>'));
for(const [url,bytes]of routes)await writeFile(join(snapshot,url==='/'?'index.html':url.slice(1)),bytes);
await writeFile(join(snapshot,'fingerprint.json'),JSON.stringify(fingerprints,null,2)+'\n');
const server=createServer((req,res)=>{const path=(req.url??'/').split('?')[0],bytes=routes.get(path);if(!bytes){res.writeHead(404);res.end();return;}res.setHeader('content-type',path.endsWith('.js')?'text/javascript':path.endsWith('.json')?'application/json':path.endsWith('.webp')?'image/webp':'text/html');res.setHeader('cache-control','no-store');res.end(bytes);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,report={scope:'Bounded actual GPU helper lab only: frozen actual cloth shader, actual indexed proxy and actual Three160 helpers. No Snow/Cloud app, no FPS or full optical approval.',snapshot,fingerprints,rows:[],errors:[]};
try{for(const name of ['chromium','webkit']){
 const browser=name==='chromium'?await chromium.launch({channel:'chrome',headless:false,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']}):await webkit.launch({headless:false});
 try{
  const context=await browser.newContext({viewport:{width:128,height:128},deviceScaleFactor:1});await context.addInitScript(installCaptureGpuGuard);const page=await context.newPage();page.setDefaultTimeout(90000);
  page.on('pageerror',error=>report.errors.push({browser:name,type:'pageerror',error:error.stack}));page.on('console',message=>{if(message.type()==='error')report.errors.push({browser:name,type:'console',error:message.text()});});page.on('response',response=>{if(response.status()>=400)report.errors.push({browser:name,type:'http',url:response.url(),status:response.status()});});
  await page.goto(base);await page.waitForFunction(()=>window.__staticShadowLabReady);await assertCaptureGpuHealthy(page);
  const row=await page.evaluate(()=>window.__runStaticShadowLab());row.browser=name;row.health=await assertCaptureGpuHealthy(page);await page.locator('canvas').screenshot({path:out+'/'+name+'-actual-cloth-128.png'});row.frameSha256=sha(await readFile(out+'/'+name+'-actual-cloth-128.png'));
  row.cleanup=await page.evaluate(()=>window.__disposeStaticShadowLab());report.rows.push(row);await context.close();console.log('STATIC_SHADOW_GPU_BROWSER',name,JSON.stringify(row));
 }finally{await browser.close();}
}}finally{
 await new Promise(resolve=>server.close(resolve));report.ownedBrowsersClosed=true;report.serverClosed=true;
 report.snapshotUnchanged=true;for(const [url,bytes]of routes)if(sha(await readFile(join(snapshot,url==='/'?'index.html':url.slice(1))))!==sha(bytes))report.snapshotUnchanged=false;
 report.liveSourcesChanged=[];for(const file of fingerprints)if(sha(await readFile(file.path))!==file.sha256)report.liveSourcesChanged.push(file.path);
 report.passed=!report.errors.length&&report.rows.length===2&&report.rows.every(row=>row.passed)&&report.snapshotUnchanged;await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
}
if(!report.passed)throw Error('Static shadow GPU lab failed; inspect '+out+'/report.json');
console.log('STATIC_SHADOW_GPU_TERMINAL_PASS',report.rows.length,'browsers closed; GPU released');
