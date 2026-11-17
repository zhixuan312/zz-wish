import fs from'node:fs';import path from'node:path';import crypto from'node:crypto';
const root=process.cwd(),out=fs.mkdtempSync('/tmp/one-light-cloud19-prefix-'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),files=[];
function copy(source,target){fs.mkdirSync(path.dirname(target),{recursive:true});const b=fs.readFileSync(source);fs.writeFileSync(target,b);files.push({source,path:path.relative(out,target),bytes:b.length,sha256:sha(b)});}
copy('tests/visual/cloud-prefix-lab-browser.mjs',path.join(out,'lab.mjs'));for(const name of['cloud-light-prefix-v1.js','cloud-live-cache-v1.js'])copy('web/src/engine/places/'+name,path.join(out,name));
copy('art/build/cloud-cliff-round1/source19-cpu/saved-field/field.json',path.join(out,'field.json'));
for(const name of fs.readdirSync('art/build/cloud-cliff-round1/source19-live-density-ktx'))copy('art/build/cloud-cliff-round1/source19-live-density-ktx/'+name,path.join(out,'public/cache',name));
fs.writeFileSync(path.join(out,'package.json'),'{"type":"module"}\n');fs.symlinkSync(path.join(root,'node_modules'),path.join(out,'node_modules'),'dir');
fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Cloud19 bounded prefix component</title><canvas></canvas><script type="module" src="/lab.mjs"></script>');
for(const name of['package.json','index.html']){const b=fs.readFileSync(path.join(out,name));files.push({source:'generated standalone lab wrapper',path:name,bytes:b.length,sha256:sha(b)});}
const receipt={version:1,root:out,sourceSha256:'ee3f9f065a72a102867d0bfe7ea9233761cd7db62e98711c993d38cba324bda0',initialLogicalGrid:[16,8,16],allowedLogicalWidths:[16,32,64],maximumDensityInitFragmentsPerDraw:16384,maximumActualDrawMs:100,files,scope:'Standalone component only,no Scene/main/public, no browser launched by stage'};fs.writeFileSync(path.join(out,'inputs.json'),JSON.stringify(receipt,null,2)+'\n');console.log(out);
