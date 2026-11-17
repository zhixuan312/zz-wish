#!/usr/bin/env node
// Explicit delivery-only NORMAL/U8-colour study from genuine source F32 arrays.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '/tmp/one-light-gltf-tools/node_modules/@gltf-transform/core/dist/index.js';
import {ALL_EXTENSIONS,EXTMeshoptCompression,KHRMeshQuantization} from '/tmp/one-light-gltf-tools/node_modules/@gltf-transform/extensions/dist/index.js';
import {weldPrimitive,compactPrimitive} from '/tmp/one-light-gltf-tools/node_modules/@gltf-transform/functions/dist/index.js';
import {MeshoptDecoder,MeshoptEncoder} from '/tmp/one-light-gltf-tools/node_modules/meshoptimizer/index.js';
import {Matrix3,Matrix4,Vector3} from '../node_modules/three/build/three.module.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),opt={};for(let i=2;i<process.argv.length;i+=2)opt[process.argv[i]]=process.argv[i+1];
for(const key of ['input','output'])if(!opt['--'+key])throw Error('Missing --'+key);
const input=resolve(root,opt['--input']),output=resolve(root,opt['--output']),critical=opt['--critical-f32']??'none';
const colourPolicy=opt['--colour-policy'];if(!['reviewed-u8','preserve-hdr'].includes(colourPolicy))throw Error('Explicit --colour-policy reviewed-u8|preserve-hdr required.');
if(!['none','altar','metal'].includes(critical))throw Error('Critical normal policy must be none|altar|metal');
if(!output.startsWith(root+'/art/build/')||await access(output).then(()=>true,()=>false))throw Error('Separate new ignored output required');
const sha=v=>createHash('sha256').update(v).digest('hex'),bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength),same=(a,b,label)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(label);};
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const inputBytes=await readFile(input),doc=await io.read(input);
const glbJSON=bytes=>JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
const nodes=d=>d.getRoot().listNodes().map(n=>[n.getName(),n.getMatrix(),n.getExtras(),n.listChildren().map(c=>c.getName())]);
const scenes=d=>d.getRoot().listScenes().map(s=>[s.getName(),s.getExtras()]);
const images=d=>d.getRoot().listTextures().map(t=>[t.getName(),t.getMimeType(),sha(t.getImage())]);
const materials=d=>d.getRoot().listMaterials().map(m=>[m.getName(),m.getExtras(),m.getBaseColorFactor(),m.getMetallicFactor(),m.getRoughnessFactor(),m.getEmissiveFactor(),m.listExtensions().map(e=>e.extensionName)]);
const nodeBefore=nodes(doc),sceneBefore=scenes(doc),imageBefore=images(doc),materialBefore=materials(doc);
function triangleHash(p){const semantics=p.listSemantics().sort(),attributes=semantics.map(s=>p.getAttribute(s)),idx=p.getIndices().getArray(),records=[];
 for(let i=0;i<idx.length;i+=3){const corners=[0,1,2].map(k=>Buffer.concat(attributes.map(a=>{const row=a.getElementSize()*a.getArray().BYTES_PER_ELEMENT;return bytes(a.getArray()).subarray(idx[i+k]*row,(idx[i+k]+1)*row);})));const rotations=[0,1,2].map(k=>Buffer.concat([corners[k],corners[(k+1)%3],corners[(k+2)%3]]));rotations.sort(Buffer.compare);records.push(rotations[0]);}
 records.sort(Buffer.compare);return sha(Buffer.concat([Buffer.from(JSON.stringify(attributes.map((a,i)=>[semantics[i],a.getType(),a.getComponentType(),a.getNormalized()]))),...records]));}
const worldNormal=(v,m)=>new Vector3(...v).applyMatrix3(m).normalize().toArray();
const reports=[],expected=[];let maxNormal=0,maxColour=0,verticesBefore=0,verticesAfter=0;
for(const node of doc.getRoot().listNodes().filter(n=>n.getMesh())){
 const normalMatrix=new Matrix3().getNormalMatrix(new Matrix4().fromArray(node.getWorldMatrix())),region=node.getExtras().lightmap_region;
 for(const [index,p] of node.getMesh().listPrimitives().entries()){
  const pos=p.getAttribute('POSITION'),normal=p.getAttribute('NORMAL');
  for(const [semantic,a]of [['POSITION',pos],['NORMAL',normal]])if(a.getComponentType()!==5126||a.getNormalized()||!(a.getArray() instanceof Float32Array))throw Error('Genuine original F32 '+semantic+' required, never decoded BYTE/SHORT cast');
  const material=p.getMaterial()?.getName()??'',keep=critical==='altar'?region==='altar':critical==='metal'?/bronze|gilded|burnished|oil|glazed|ceramic/i.test(material):false;
  let normalError=0;
  if(!keep){const source=normal.getArray(),quantized=new Int16Array(source.length);for(let i=0;i<source.length;i++){if(source[i]<-1.000001||source[i]>1.000001)throw Error('Invalid source normal component');quantized[i]=Math.round(Math.max(-1,Math.min(1,source[i]))*32767);}const target=normal.clone().setArray(quantized).setNormalized(true);p.setAttribute('NORMAL',target);
   for(let i=0;i<normal.getCount();i++){const a=worldNormal(normal.getElement(i,[]),normalMatrix),b=worldNormal(target.getElement(i,[]),normalMatrix);normalError=Math.max(normalError,...a.map((v,c)=>Math.abs(v-b[c])));}if(normal.listParents().length===1)normal.dispose();}
  if(normalError>1e-4)throw Error('Actual SNORM16 world-normal error exceeds1e-4');maxNormal=Math.max(maxNormal,normalError);
  const colors=[];
  for(const semantic of p.listSemantics().filter(s=>/^COLOR_\d+$/.test(s))){const a=p.getAttribute(semantic);if(a.getComponentType()!==5126||a.getNormalized())throw Error('Source colour must be actual F32 for this explicit policy');const source=a.getArray();let error=0;const q=new Uint8Array(source.length);
   const hdr=Array.from(source).filter(v=>v<0||v>1);if(hdr.length&&colourPolicy==='preserve-hdr'){colors.push({semantic,sourceSha256:sha(bytes(source)),maximumLinearComponentError:0,storage:'Original F32; HDR range preserved',outOfUnitRangeComponents:hdr.length});continue;}
   for(let i=0;i<source.length;i++){q[i]=Math.round(Math.max(0,Math.min(1,source[i]))*255);error=Math.max(error,Math.abs(q[i]/255-source[i]));}
   p.setAttribute(semantic,a.clone().setArray(q).setNormalized(true));if(a.listParents().length===1)a.dispose();maxColour=Math.max(maxColour,error);colors.push({semantic,sourceSha256:sha(bytes(source)),maximumLinearComponentError:error,storage:'U8 normalized, explicit reviewed policy',outOfUnitRangeComponentsClamped:hdr.length,sourceHDRMinimum:hdr.length?Math.min(...hdr):null,sourceHDRMaximum:hdr.length?Math.max(...hdr):null});}
  const before=pos.getCount(),hash=triangleHash(p);compactPrimitive(p);weldPrimitive(p,{overwrite:true});if(triangleHash(p)!==hash)throw Error('Exact-record weld changed retained triangle fields/winding');
  const after=p.getAttribute('POSITION').getCount();verticesBefore+=before;verticesAfter+=after;expected.push(hash);reports.push({region,primitive:index,material,normalStorage:keep?'original F32':'normalized SHORT16',maximumWorldNormalComponentError:normalError,colours:colors,verticesBefore:before,verticesAfter:after});
 }
}
doc.createExtension(KHRMeshQuantization).setRequired(true);doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
const encoded=await io.writeBinary(doc),decoded=await io.readBinary(encoded);let index=0;
for(const n of decoded.getRoot().listNodes().filter(n=>n.getMesh()))for(const p of n.getMesh().listPrimitives())if(triangleHash(p)!==expected[index++])throw Error('Decoded actual triangle attributes/winding changed');
same(nodes(decoded),nodeBefore,'Node transforms/ownership changed');same(scenes(decoded),sceneBefore,'Runtime scene metadata changed');same(images(decoded),imageBefore,'Embedded image payloads changed');same(materials(decoded),materialBefore,'Physical material values changed');if(sha(await readFile(input))!==sha(inputBytes))throw Error('Immutable source changed');
same(glbJSON(Buffer.from(encoded)).materials,glbJSON(inputBytes).materials,'Full material definitions including UV transforms changed');
const report={scope:'Explicit delivery quantization from genuine original F32 NORMAL, with explicit U8 colour policy. F32 physical positions/UVs/images/materials/transforms/winding remain exact. No source/native/bake change; contact/optical review required.',input:{path:relative(root,input),bytes:inputBytes.length,sha256:sha(inputBytes)},output:{path:relative(root,output),bytes:encoded.length,sha256:sha(encoded),savedBytes:inputBytes.length-encoded.length},normalPolicy:{type:'normalized SHORT16',criticalF32:critical,maximumWorldComponentError:maxNormal,maximumAllowedWorldComponentError:1e-4},colourPolicy:{type:'normalized U8',explicitPolicy:colourPolicy,maximumLinearComponentError:maxColour,unitRangeHalfStep:1/510,clampedSourceComponents:reports.flatMap(p=>p.colours).reduce((n,c)=>n+(c.outOfUnitRangeComponentsClamped??0),0),clampingExplicitlyReported:colourPolicy==='reviewed-u8'},verticesBefore,verticesAfter,allDecodedTriangleRecordsAndCyclicWindingExactAfterDeclaredQuantization:true,imagesAndMaterialValuesExact:true,sourceInputsUnchanged:true,renderBakeGpuJobs:0,primitives:reports,generatorSha256:sha(await readFile(fileURLToPath(import.meta.url)))};
await mkdir(dirname(output),{recursive:true});await writeFile(output,encoded,{flag:'wx'});await writeFile(output+'.receipt.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log('NORMAL16_BUDGET_READY',JSON.stringify({bytes:encoded.length,saved:inputBytes.length-encoded.length,maxNormal,maxColour,verticesBefore,verticesAfter}));
