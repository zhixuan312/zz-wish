// Existing static fixtures supply measured wick TIP coordinates. Test moving
// only their graphic's intrinsic blank bottom margin onto that exact tip.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const root=process.env.SOURCE_ROOT;if(!root?.startsWith('/tmp/'))throw Error('Isolated snapshot required');
const path=join(root,'web/src/engine/scene.js'),before=await readFile(path,'utf8'),sha=b=>createHash('sha256').update(b).digest('hex');
if(!before.includes('__captureFlameCoverage')||before.includes('__captureFlameWickAlignment'))throw Error('Fresh coverage-study clone required');
const hook=`
let flameBaseStudy=null;
window.__captureFlameWickAlignment=(enabled)=>{
 const f=place?.cover?.f;if(!f)throw Error('Actual cover flame unavailable');
 if(!flameBaseStudy)flameBaseStudy={baselineY:f.flame.position.y,aligned:false};
 if(enabled!==undefined){flameBaseStudy.aligned=!!enabled;f.flame.position.y=enabled?-.06*f.fm.uniforms.uScale.value:flameBaseStudy.baselineY;}
 return{...flameBaseStudy,actualGraphicY:f.flame.position.y,scale:f.fm.uniforms.uScale.value,actualWickTip:place.cover.metadata.wickTip,group:f.g?.position.toArray()??null,scope:'Static wick-tip wrapper only; source wick/point/visitor geometry and own visitor wick-base convention unchanged.'};
};
`;
const after=before.replace('\nfunction resize() {','\n'+hook+'\nfunction resize() {').replace(/window\.__captureSnapshot=(\{[^\n]+\});/,(_,json)=>'window.__captureSnapshot='+JSON.stringify({...JSON.parse(json),root})+';');
await writeFile(path,after);
const p=join(root,'visual-instrumentation.json'),m=JSON.parse(await readFile(p));m.target=root;m.instrumentedSceneSha256=sha(after);m.staticFlameBase={inputSha256:sha(before),onlyStaticGraphicIntrinsicMargin:true};await writeFile(p,JSON.stringify(m,null,2)+'\n');
console.log('STATIC_FLAME_BASE_INSTRUMENTED',root,sha(after));
