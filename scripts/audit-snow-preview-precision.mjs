#!/usr/bin/env node
/** Independent decoded comparison of a declared Snow delivery precision chain. */
import {readFile,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '/tmp/one-light-gltf-tools/node_modules/@gltf-transform/core/dist/index.js';
import {ALL_EXTENSIONS} from '/tmp/one-light-gltf-tools/node_modules/@gltf-transform/extensions/dist/index.js';
import {MeshoptDecoder} from '/tmp/one-light-gltf-tools/node_modules/meshoptimizer/index.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),options={};
for(let i=2;i<process.argv.length;i+=2)options[process.argv[i]]=process.argv[i+1];
for(const k of ['source','model','uv-receipt','normal-receipt','image-receipt','out'])if(!options['--'+k])throw Error('Missing --'+k);
const paths=Object.fromEntries(Object.entries(options).map(([k,v])=>[k.slice(2),resolve(root,v)]));
if(!paths.out.startsWith(root+'/art/build/')||await access(paths.out).then(()=>true,()=>false))throw Error('New ignored report required');
const sha=b=>createHash('sha256').update(b).digest('hex'),bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength),same=(a,b,label)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(label);};
const uv=JSON.parse(await readFile(paths['uv-receipt'])),normal=JSON.parse(await readFile(paths['normal-receipt'])),image=JSON.parse(await readFile(paths['image-receipt']));
const sourceBytes=await readFile(paths.source),modelBytes=await readFile(paths.model);
if(sha(sourceBytes)!==uv.input.sha256||uv.output.sha256!==normal.input.sha256||normal.output.sha256!==image.input.sha256||image.output.sha256!==sha(modelBytes))throw Error('Actual precision chain hashes differ');
for(const r of [uv,normal,image])for(const k of ['input','output'])if(sha(await readFile(resolve(root,r[k].path)))!==r[k].sha256)throw Error('Frozen stage changed');
if(uv.maximumActualOriginalSourceTexelError>.25||normal.normalPolicy.maximumWorldComponentError>1e-4)throw Error('Declared precision limits exceeded');
await MeshoptDecoder.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const source=await io.read(paths.source),model=await io.read(paths.model);
const q16=v=>Math.round(Math.max(0,Math.min(1,v))*65535),qNormal=v=>Math.round(Math.max(-1,Math.min(1,v))*32767),qColour=v=>Math.round(Math.max(0,Math.min(1,v))*255);
function signature(primitive,policy){
 const semantics=primitive.listSemantics().sort(),arrays=semantics.map(s=>{
  const a=primitive.getAttribute(s),original=a.getArray();let array=original,normalized=a.getNormalized();
  if(policy&&s==='NORMAL'){array=Int16Array.from(original,qNormal);normalized=true;}
  if(policy&&/^COLOR_\d+$/.test(s)){array=Uint8Array.from(original,qColour);normalized=true;}
  if(policy&&s==='TEXCOORD_1'){array=Uint16Array.from(original,q16);normalized=true;}
  if(policy&&s==='TEXCOORD_0'&&policy.UV0Quantized){array=new Uint16Array(original.length);for(let i=0;i<original.length;i++){const c=i%2;array[i]=q16((original[i]-policy.affineDecode.offset[c])/policy.affineDecode.scale[c]);}normalized=true;}
  return {array,type:a.getType(),normalized,size:a.getElementSize()};
 }),indices=primitive.getIndices().getArray(),rows=[];
 for(let k=0;k<indices.length;k+=3){const corners=[0,1,2].map(c=>Buffer.concat(arrays.map(a=>{const n=a.size*a.array.BYTES_PER_ELEMENT;return bytes(a.array).subarray(indices[k+c]*n,(indices[k+c]+1)*n);})));const cyclic=[0,1,2].map(c=>Buffer.concat([corners[c],corners[(c+1)%3],corners[(c+2)%3]]));cyclic.sort(Buffer.compare);rows.push(cyclic[0]);}
 rows.sort(Buffer.compare);return {sha256:sha(Buffer.concat([Buffer.from(JSON.stringify(arrays.map((a,i)=>[semantics[i],a.type,a.array.constructor.name,a.normalized]))),...rows])),triangles:rows.length};
}
const nodeState=d=>d.getRoot().listNodes().map(n=>[n.getName(),n.getMatrix(),n.getExtras(),n.listChildren().map(c=>c.getName())]);
same(nodeState(source),nodeState(model),'World transforms or source ownership changed');same(source.getRoot().listScenes().map(s=>s.getExtras()),model.getRoot().listScenes().map(s=>s.getExtras()),'Runtime anchor/config metadata changed');
const modelRegions=new Map(model.getRoot().listNodes().filter(n=>n.getMesh()).map(n=>[n.getExtras().lightmap_region,n])),regions={};let count=0;
for(const n of source.getRoot().listNodes().filter(n=>n.getMesh())){
 const region=n.getExtras().lightmap_region,a=n.getMesh().listPrimitives(),b=modelRegions.get(region)?.getMesh().listPrimitives();if(!b||a.length!==b.length)throw Error('Region/primitive population changed');let triangles=0;
 for(let i=0;i<a.length;i++){
  const policy=uv.primitives.find(r=>r.region===region&&r.primitive===i);if(!policy)throw Error('Missing actual UV precision declaration');
  for(const semantic of ['POSITION','NORMAL','TEXCOORD_0','TEXCOORD_1'])if(a[i].getAttribute(semantic).getComponentType()!==5126)throw Error('Original genuine F32 fields required');
  if(b[i].getAttribute('POSITION').getComponentType()!==5126||b[i].getAttribute('POSITION').getNormalized())throw Error('Physical positions must remain genuine F32');
  const expected=signature(a[i],policy),actual=signature(b[i]);same(actual,expected,'Decoded triangle/corner/winding mismatch '+region+'/'+i);triangles+=actual.triangles;count++;
 }regions[region]={primitives:a.length,retainedTriangles:triangles};
}
const expectedImages=source.getRoot().listTextures().map(t=>sha(t.getImage())),actualChanges=[];
for(const row of image.images.filter(i=>!i.protectedOriginalPayload)){const index=expectedImages.indexOf(row.beforeSha256);if(index<0)throw Error('Certified original normal image absent');expectedImages.splice(index,1,row.sha256);actualChanges.push({materials:row.materials,beforeSha256:row.beforeSha256,sha256:row.sha256});}
same(model.getRoot().listTextures().map(t=>sha(t.getImage())).sort(),expectedImages.sort(),'Uncertified image payload or multiplicity changed');
const report={scope:'Independent decoder-only actual delivery proof. Original F32 positions and all retained cyclic winding are exact; NORMAL/UV/colors have only the explicit measured lossy storage policies. Six architectural normal images are intentionally256px. Source/GI unchanged; optical and performance review pending.',source:{path:relative(root,paths.source),sha256:sha(sourceBytes)},output:{path:relative(root,paths.model),sha256:sha(modelBytes),bytes:modelBytes.length},receipts:Object.fromEntries(await Promise.all(['uv-receipt','normal-receipt','image-receipt'].map(async k=>[k,{path:relative(root,paths[k]),sha256:sha(await readFile(paths[k]))}]))),regions,primitives:count,allActualDecodedRetainedTriangleRecordsMatchDeclaredOriginalF32Quantization:true,physicalF32PositionsCyclicWindingNodeTransformsAndSourceOwnershipExact:true,runtimeAnchorConfigMetadataByteValueExact:true,uncertifiedImagesChanged:0,actualChangedImages:actualChanges,maximumOriginalSourceMaterialTexelError:uv.maximumActualOriginalSourceTexelError,maximumLightmapBaseTexelError:Math.max(...uv.primitives.flatMap(p=>p.lightmapMipBounds.flatMap(m=>m.mips.map(x=>x.maximumLightmapTexelError)))),maximumWorldNormalComponentError:normal.normalPolicy.maximumWorldComponentError,colourPolicy:normal.colourPolicy,renderBakeEncoderGpuJobs:0,scriptSha256:sha(await readFile(fileURLToPath(import.meta.url))),passed:true};
await writeFile(paths.out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log('SNOW_PRECISION_CHAIN_PASS',JSON.stringify({report:relative(root,paths.out),sha256:sha(await readFile(paths.out)),triangles:Object.values(regions).reduce((n,r)=>n+r.retainedTriangles,0)}));
