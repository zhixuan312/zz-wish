// CPU-only: preserve the preceding app and pin an isolated current-code preview.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),parent=process.env.PARENT_SNAPSHOT,out=process.env.OUTPUT;
const payload=process.env.SNOW_RUNTIME;
if(!parent?.startsWith('/tmp/')||!out?.startsWith('/tmp/')||parent===out||!payload)throw Error('Explicit distinct /tmp parent/output and Snow runtime required');
if(fs.existsSync(out))throw Error('Never overwrite a frozen snapshot');
const sha=b=>createHash('sha256').update(b).digest('hex');
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]).sort();
const pin=p=>({path:path.relative(root,p),sha256:sha(fs.readFileSync(p))});
const inputs=[...walk('web/src'),...walk('shared'),...walk('web/public/color'),'web/vite.config.ts','web/index.html'].map(p=>pin(path.resolve(p)));
const payloadManifest=JSON.parse(fs.readFileSync(path.join(payload,'manifest.json')));
for(const file of payloadManifest.files){const b=fs.readFileSync(path.join(payload,file.uri));if(b.length!==file.bytes||sha(b)!==file.sha256)throw Error('Changed candidate payload '+file.uri);}
const parentCloud=fs.readFileSync(path.join(parent,'web/public/places/cloud-cliff/manifest.json'));
fs.cpSync(parent,out,{recursive:true,dereference:false,verbatimSymlinks:true});
for(const relative of ['web/src','shared','web/public/color']){fs.rmSync(path.join(out,relative),{recursive:true,force:true});fs.cpSync(relative,path.join(out,relative),{recursive:true});}
for(const relative of ['web/vite.config.ts','web/index.html'])fs.copyFileSync(relative,path.join(out,relative));
fs.rmSync(path.join(out,'web/public/places/snow-roof'),{recursive:true});
fs.cpSync(payload,path.join(out,'web/public/places/snow-roof'),{recursive:true});
for(const relative of ['visual-instrumentation.json','snapshot-preparation.json','material-controls-preparation.json'])fs.rmSync(path.join(out,relative),{force:true});
for(const input of inputs)if(sha(fs.readFileSync(input.path))!==input.sha256||sha(fs.readFileSync(path.join(out,input.path)))!==input.sha256)throw Error('Concurrent source change '+input.path);
if(!parentCloud.equals(fs.readFileSync(path.join(out,'web/public/places/cloud-cliff/manifest.json'))))throw Error('Navigation control changed');
const receipt={scope:'Isolated current runtime/C2/nativeAgX and explicitly declared per-map sample diagnostic. Not final/fulljourney/FPS/cover approval.',parentSnapshot:parent,sourceRoot:root,out,snowRuntime:path.resolve(payload),snowManifestSha256:sha(fs.readFileSync(path.join(payload,'manifest.json'))),cloudControlManifestSha256:sha(parentCloud),files:inputs,samples:Object.fromEntries(Object.entries(payloadManifest.lightmaps).flatMap(([r,m])=>Object.entries(m).map(([p,v])=>[r+'/'+p,v.samples])))};
fs.writeFileSync(path.join(out,'snapshot-preparation.json'),JSON.stringify(receipt,null,2)+'\n');
console.log('SNOW_OPTICS_SNAPSHOT_PREPARED',out,receipt.snowManifestSha256);
