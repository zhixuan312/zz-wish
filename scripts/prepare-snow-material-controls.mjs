#!/usr/bin/env node
// Clone an immutable optics snapshot and install reversible private controls.
// Never starts a server/browser, renders, encodes, changes main runtime or public assets.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),opt={};
for(let i=2;i<process.argv.length;i+=2){if(!['--source','--out'].includes(process.argv[i])||!process.argv[i+1])throw Error('Supply --source /tmp/frozen-optics --out /tmp/new-controls');opt[process.argv[i]]=path.resolve(process.argv[i+1]);}
const source=opt['--source'],out=opt['--out'];
if(!source?.startsWith('/tmp/')||!out?.startsWith('/tmp/')||source===out||fs.existsSync(out))throw Error('Existing /tmp source and a new separate /tmp output are required');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=p=>fs.readFileSync(p),json=p=>JSON.parse(read(p));
const sceneRelative='web/src/engine/scene.js',helperRelative='web/src/engine/snowMaterialControls.js',oldScene=read(path.join(source,sceneRelative)),template=path.join(root,'scripts/fixtures/snow-material-controls.js'),helper=read(template);
const manifests=['snow-roof','cloud-cliff'].map(place=>{const relative=`web/public/places/${place}/manifest.json`,bytes=read(path.join(source,relative));return{place,path:relative,sha256:sha(bytes),manifest:JSON.parse(bytes)};});
const parentPinned=[sceneRelative,'web/src/engine/baked/loadPlace.js','web/src/engine/baked/staticLampShadow.js','web/src/engine/places/snow-roof-baked.js','visual-instrumentation.json','snapshot-preparation.json'].map(relative=>({path:relative,sha256:sha(read(path.join(source,relative)))}));
fs.cpSync(source,out,{recursive:true,dereference:false,verbatimSymlinks:true});
const provenance={parentSnapshot:source,parentInstrumentedSceneSha256:sha(oldScene),helperTemplateSha256:sha(helper),recipeSha256:sha(read(fileURLToPath(import.meta.url))),snowManifestSha256:manifests.find(x=>x.place==='snow-roof').sha256,scope:'Isolated optical controls only; no source/runtime adoption or performance claim'};
let scene=oldScene.toString();
function patch(before,after){if(scene.split(before).length!==2)throw Error('Exact frozen instrumentation anchor changed: '+before.slice(0,100));scene=scene.replace(before,after);}
if(scene.includes('createSnowMaterialControls'))throw Error('Parent already has these material controls');
scene=`import { createSnowMaterialControls } from './snowMaterialControls.js';\n`+scene;
const snapshotMatch=scene.match(/window\.__captureSnapshot=(\{[^\n]*\});/);
if(!snapshotMatch)throw Error('Actual capture snapshot metadata missing');
const snapshot=JSON.parse(snapshotMatch[1]);snapshot.root=out;snapshot.parentSnapshot=source;snapshot.materialControls=provenance;
patch(snapshotMatch[0],`window.__captureSnapshot=${JSON.stringify(snapshot)};`);
patch('// Frozen optical diagnostic only. Actual product source/materials remain elsewhere.',`// New isolated material contribution controls, bound to real private objects.\nconst snowMaterialControls=createSnowMaterialControls({THREE,getPlace:()=>place,getLamp:()=>mine,camera,previewFill,provenance:${JSON.stringify(provenance)}});\nwindow.__captureSnowMaterialControls=(mode='metadata',options={})=>snowMaterialControls.api(mode,options);\n\n// Frozen optical diagnostic only. Actual product source/materials remain elsewhere.`);
const fillLine="    previewFill.intensity = phase === 'candle' ? (P.bakedLighting ? 1.35 : .7) : P.bakedLighting ? 1.35*ignitionFill : 0;";
patch(fillLine,fillLine+'\n    snowMaterialControls.update(); // Private capture-only override follows the normal frame assignment.');
fs.writeFileSync(path.join(out,sceneRelative),scene);fs.writeFileSync(path.join(out,helperRelative),helper);
const instrumentation=json(path.join(source,'visual-instrumentation.json'));
instrumentation.target=out;instrumentation.parentTarget=source;instrumentation.parentInstrumentedSceneSha256=sha(oldScene);instrumentation.instrumentedSceneSha256=sha(Buffer.from(scene));instrumentation.materialControlHelperSha256=sha(helper);instrumentation.materialControls=provenance;instrumentation.hooks.push({name:'Private reversible Snow material contribution controls and actual cloth-centre fill',applied:true,required:true});
fs.writeFileSync(path.join(out,'visual-instrumentation.json'),JSON.stringify(instrumentation,null,2)+'\n');
const preparation=json(path.join(source,'snapshot-preparation.json'));
preparation.scope='Isolated Source17 actual LOW8 material-control snapshot. Original optics source and delivered geometry/maps stay immutable. No new GI, material/source adoption, browser/GPU job or performance claim.';
preparation.parentSnapshot=source;preparation.parentRuntimeSourceFiles=preparation.files;preparation.files=[{path:sceneRelative,sha256:sha(Buffer.from(scene))},{path:helperRelative,sha256:sha(helper)}];preparation.materialControls=provenance;
fs.writeFileSync(path.join(out,'snapshot-preparation.json'),JSON.stringify(preparation,null,2)+'\n');
for(const {path:relative,sha256}of parentPinned)if(sha(read(path.join(source,relative)))!==sha256)throw Error('Immutable parent changed: '+relative);
for(const entry of manifests){
 if(sha(read(path.join(out,entry.path)))!==entry.sha256)throw Error('Manifest changed during clone');
 for(const file of entry.manifest.files){const bytes=read(path.join(out,path.dirname(entry.path),file.uri));if(bytes.length!==file.bytes||sha(bytes)!==file.sha256)throw Error('Actual delivered payload changed: '+file.uri);}
}
const receipt={scope:'Code-only snapshot preparation; no server, browser, GPU, rendering, baking, encoding or main/public mutation',source,out,parentPinned,newSceneSha256:sha(Buffer.from(scene)),newHelperSha256:sha(helper),provenance,manifests:manifests.map(({manifest,...row})=>({...row,actualPayloadFiles:manifest.files.length})),allOriginalParentCodeAndAllDeclaredPayloadsUnchanged:true,api:{name:'window.__captureSnowMaterialControls',modes:['metadata','normal','restore','fixture-spec-off','spec-off','paint-normal-off','fill'],fillExample:{intensity:1.35,distance:1,topOffset:.18,followCamera:true},framePersistence:'fixture.visible=false survives intensity callbacks; fill override runs after ordinary previewFill assignment',restore:'Original actual static material hooks/program keys/normalScale, fixture visibility and fill target/position/intensity restored'},limits:['Actual GPU compilation and Chrome/WebKit optical controls remain Root-owned and unexecuted.','The fill is a directional preview-light candidate aimed at the actual cloth centre, not an authored candle or adopted GI change.']};
const receiptPath=path.join(out,'material-controls-preparation.json');fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n');
console.log('SNOW_MATERIAL_CONTROLS_PREPARED',out,sha(read(receiptPath)),JSON.stringify({sceneSha256:receipt.newSceneSha256,helperSha256:receipt.newHelperSha256}));
