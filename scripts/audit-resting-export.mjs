#!/usr/bin/env node
/** Decoder-only chain from actual contact-tested raw triangles to FLOAT32 export. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..'),options={};
const flags=['--source-audit','--contact-audit','--raw','--float32','--baseline','--out'];
for(let i=2;i<process.argv.length;i+=2){
  if(!flags.includes(process.argv[i])||!process.argv[i+1])throw Error('Use '+flags.map(v=>v+' PATH').join(' '));
  options[process.argv[i]]=resolve(process.argv[i+1]);
}
if(['--source-audit','--contact-audit','--raw','--out'].some(v=>!options[v])||!options['--out'].startsWith(ROOT+'/art/build/'))throw Error('Explicit source/contact/raw inputs and a separate art/build output are required');
if(Boolean(options['--float32'])!==Boolean(options['--baseline']))throw Error('--float32 and --baseline must be supplied together');
try{await fs.access(options['--out']);throw Error('Output already exists');}catch(error){if(error.code!=='ENOENT')throw error;}
const sha=value=>createHash('sha256').update(value).digest('hex');
const inputFiles=new Map();
async function frozen(path){const bytes=await fs.readFile(path);inputFiles.set(path,sha(bytes));return bytes;}
const sourceAudit=JSON.parse(await frozen(options['--source-audit']));
const contactAudit=JSON.parse(await frozen(options['--contact-audit']));
if(sourceAudit.contactAudit?.passed!==true||sourceAudit.anchorCorrespondencePassed!==true||contactAudit.passed!==true||contactAudit.raw?.passed!==true)throw Error('Genuine source, anchors and both actual triangle contact stages must pass');
const sourceSha=sourceAudit.source.sha256;
if(contactAudit.sourceBlendSha256!==sourceSha||contactAudit.source.sha256!==sourceSha||contactAudit.sourceAuditSha256!==inputFiles.get(options['--source-audit']))throw Error('Contact/source audit binding differs');
if(sha(await frozen(resolve(ROOT,sourceAudit.source.path)))!==sourceSha)throw Error('Actual authored source changed');
const certifiedRaw=resolve(ROOT,contactAudit.raw.path);
if(sha(await frozen(certifiedRaw))!==contactAudit.raw.sha256)throw Error('Actual immutable contact-tested raw changed');
for(const flag of ['--raw','--float32','--baseline'])if(options[flag])await frozen(options[flag]);

// Normal proof-metadata saves can alter a GLB container after its contact test.
// Require the complete original binary payload and every non-scene JSON field
// to remain exact, plus every already-certified scene extra. New proof extras
// may be added; they never authorize a changed old value or authored stream.
const certifiedContainer=parseGlb(await fs.readFile(certifiedRaw)),actualContainer=parseGlb(await fs.readFile(options['--raw']));
const geometryJson=json=>({...json,scenes:json.scenes.map(({extras,...scene})=>scene)});
if(certifiedContainer.binarySha256!==actualContainer.binarySha256||JSON.stringify(geometryJson(certifiedContainer.json))!==JSON.stringify(geometryJson(actualContainer.json)))throw Error('Actual raw is not byte-exact certified geometry/material/image data');
const oldExtras=certifiedContainer.json.scenes.map(s=>s.extras??{}),newExtras=actualContainer.json.scenes.map(s=>s.extras??{});
for(let i=0;i<oldExtras.length;i++)for(const [field,value] of Object.entries(oldExtras[i]))if(JSON.stringify(newExtras[i][field])!==JSON.stringify(value))throw Error('An existing contact-certified scene extra changed: '+field);
const newProofExtraFields=newExtras.map((extras,i)=>Object.keys(extras).filter(field=>!Object.hasOwn(oldExtras[i],field)));
if(!options['--float32']){
  for(const [path,hash] of inputFiles)if(sha(await fs.readFile(path))!==hash)throw Error('Frozen input changed during proof');
  const report={version:1,scope:'Actual raw container after metadata binding; provisional until final postbatch raw is measured. No render, encoder or model mutation.',sourceBlendSha256:sourceSha,inputs:[...inputFiles].map(([path,sha256])=>({path,sha256})),certifiedRawBinaryAndNonSceneJsonByteExact:true,allPreviouslyCertifiedSceneExtrasByteExact:true,newProofExtraFields,geometryFingerprint:contactAudit.geometryFingerprint,allActualPreparedAndRaw37GroupsPassed:true,renderBakeEncoderGpuJobs:0,scriptSha256:sha(await fs.readFile(fileURLToPath(import.meta.url)))};
  await fs.writeFile(options['--out'],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log('RESTING_RAW_EXPORT_PROOF_PASS',JSON.stringify({path:options['--out'],sha256:sha(await fs.readFile(options['--out']))}));
  process.exit(0);
}

const toolRoot=process.env.ONE_LIGHT_GLTF_TOOLS??'/tmp/one-light-gltf-tools';
const load=(name,file='dist/index.js')=>import(pathToFileURL(join(toolRoot,'node_modules',name,file)).href);
const {NodeIO}=await load('@gltf-transform/core');
const {ALL_EXTENSIONS}=await load('@gltf-transform/extensions');
const {MeshoptDecoder}=await load('meshoptimizer','index.js');await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const [certified,raw,candidate,baseline]=await Promise.all([certifiedRaw,options['--raw'],options['--float32'],options['--baseline']].map(p=>io.read(p)));
const anchorFields=['static_lamp_wicks_engine','static_incense_tips_engine','static_incense_smoke_engine','static_incense_smoke_source'];
const sceneExtras=doc=>doc.getRoot().listScenes().map(s=>s.getExtras());
const certifiedExtras=sceneExtras(certified),rawExtras=sceneExtras(raw),candidateExtras=sceneExtras(candidate);
if(certifiedExtras.length!==1||rawExtras.length!==1||candidateExtras.length!==1)throw Error('Expected one source-owned scene');
for(const field of anchorFields){
  if(typeof certifiedExtras[0][field]!=='string'||rawExtras[0][field]!==certifiedExtras[0][field]||candidateExtras[0][field]!==certifiedExtras[0][field])throw Error('Actual source anchor string differs: '+field);
}
for(const [field,value] of [['static_lamp_wicks_engine',sourceAudit.wicks],['static_incense_tips_engine',sourceAudit.incenseTips],['static_incense_smoke_engine',sourceAudit.incenseSmokeEngine]]){
  if(JSON.stringify(JSON.parse(certifiedExtras[0][field]))!==JSON.stringify(value))throw Error('Contact raw anchors differ from actual evaluated source audit: '+field);
}
for(const extras of [certifiedExtras[0],rawExtras[0],candidateExtras[0]])if(JSON.parse(extras.one_light_source_binding).sha256!==sourceSha)throw Error('Scene source binding differs');
if(JSON.stringify(rawExtras)!==JSON.stringify(candidateExtras))throw Error('Complete actual raw-to-FLOAT32 scene extras differ');

function nodes(doc){
  const result=new Map();
  for(const node of doc.getRoot().listNodes().filter(n=>n.getMesh())){
    const region=node.getExtras().lightmap_region;
    if(!region||result.has(region))throw Error('Expected one measured receiver per region');
    result.set(region,node);
  }
  return result;
}
const positionKey=(array,index,matrix)=>{
  const x=array[index*3],y=array[index*3+1],z=array[index*3+2];
  const point=[matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]];
  const bytes=Buffer.allocUnsafe(12);point.forEach((v,i)=>bytes.writeFloatLE(v===0?0:v,i*4));return bytes;
};
function triangleFingerprint(node,positionsOnly){
  const rows=[],matrix=node.getWorldMatrix();let vertices=0;
  for(const primitive of node.getMesh().listPrimitives()){
    const position=primitive.getAttribute('POSITION');
    if(positionsOnly&&(position.getComponentType()!==5126||position.getNormalized()))throw Error('All raw/FLOAT32 positions must remain nonnormalized FLOAT32');
    const semantics=positionsOnly?['POSITION']:primitive.listSemantics().filter(v=>v!=='POSITION').sort();
    const attrs=semantics.map(v=>primitive.getAttribute(v));
    const header=positionsOnly?'world FLOAT32 POSITION':JSON.stringify([primitive.getMaterial()?.getName(),attrs.map((v,i)=>[semantics[i],v.getType(),v.getComponentType(),v.getNormalized()])]);
    const indices=primitive.getIndices().getArray();vertices+=position.getCount();
    for(let i=0;i<indices.length;i+=3){
      const corners=[indices[i],indices[i+1],indices[i+2]].map(index=>positionsOnly?positionKey(position.getArray(),index,matrix):Buffer.concat(attrs.map(a=>{const values=a.getArray(),size=a.getElementSize()*values.BYTES_PER_ELEMENT;return Buffer.from(values.buffer,values.byteOffset+index*size,size);})));
      const cyclic=[0,1,2].map(k=>Buffer.concat([corners[k],corners[(k+1)%3],corners[(k+2)%3]]));cyclic.sort(Buffer.compare);
      rows.push(sha(header+cyclic[0].toString('base64')));
    }
  }
  return {sha256:sha(rows.sort().join('')),triangles:rows.length,vertices};
}
const all=[certified,raw,candidate,baseline].map(nodes),regions={};
if(all.some(m=>JSON.stringify([...m.keys()].sort())!==JSON.stringify([...all[0].keys()].sort())))throw Error('Receiver regions differ');
for(const region of [...all[0].keys()].sort()){
  const ns=all.map(m=>m.get(region));
  if(ns.slice(1,3).some(n=>JSON.stringify(n.getWorldMatrix())!==JSON.stringify(ns[0].getWorldMatrix())))throw Error('Contact/raw/FLOAT32 world transforms differ');
  const positions=ns.slice(0,3).map(n=>triangleFingerprint(n,true));
  if(positions.some(p=>p.sha256!==positions[0].sha256||p.triangles!==positions[0].triangles))throw Error('Actual contact-tested/raw/FLOAT32 authored world position or winding differs');
  const nonPosition=[ns[2],ns[3]].map(n=>triangleFingerprint(n,false));
  if(nonPosition[0].sha256!==nonPosition[1].sha256||nonPosition[0].triangles!==nonPosition[1].triangles)throw Error('FLOAT32/nonposition baseline triangle streams or winding differs');
  regions[region]={positionWinding:positions[0],float32Vertices:positions[2].vertices,nonPositionTriangleStreams:nonPosition[0]};
}
function parseGlb(bytes){
  let cursor=12,json,bin;
  while(cursor<bytes.length){const n=bytes.readUInt32LE(cursor),kind=bytes.readUInt32LE(cursor+4),v=bytes.subarray(cursor+8,cursor+8+n);if(kind===0x4e4f534a)json=JSON.parse(v);if(kind===0x004e4942)bin=v;cursor+=n+8;}
  return {json,binarySha256:sha(bin),images:json.images.map(image=>{const v=json.bufferViews[image.bufferView],start=v.byteOffset??0;return {name:image.name,mimeType:image.mimeType,sha256:sha(bin.subarray(start,start+v.byteLength))};})};
}
const a=parseGlb(await fs.readFile(options['--float32'])),b=parseGlb(await fs.readFile(options['--baseline']));
for(const field of ['materials','textures','samplers'])if(JSON.stringify(a.json[field])!==JSON.stringify(b.json[field]))throw Error('FLOAT32/baseline material graph differs: '+field);
if(JSON.stringify(a.images)!==JSON.stringify(b.images))throw Error('FLOAT32/baseline embedded image streams differ');
for(const [path,hash] of inputFiles)if(sha(await fs.readFile(path))!==hash)throw Error('Frozen input changed during proof');
const report={version:1,scope:'Independent decoder-only unpruned FLOAT32 export/anchor proof, staging only. No authored geometry, lighting, transport, render or encoder changes.',sourceBlendSha256:sourceSha,inputs:[...inputFiles].map(([path,sha256])=>({path,sha256})),contactTestedRawToActualRawToFloat32WorldPositionsAndWindingExact:true,allFloat32PositionsComponent5126NonNormalized:true,sourceAnchorStringsByteExact:true,allCompleteActualRawSceneExtrasByteExact:true,float32NonpositionStreamsAndCyclicWindingEqualActualBaseline:true,float32MaterialsAndEmbeddedImagesByteExactToActualBaseline:true,regions,anchorMetadataSha256:Object.fromEntries(anchorFields.map(f=>[f,sha(certifiedExtras[0][f])])),renderBakeEncoderGpuJobs:0,scriptSha256:sha(await fs.readFile(fileURLToPath(import.meta.url)))};
await fs.writeFile(options['--out'],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log('RESTING_EXPORT_PROOF_PASS',JSON.stringify({path:options['--out'],sha256:sha(await fs.readFile(options['--out'])),regions}));
