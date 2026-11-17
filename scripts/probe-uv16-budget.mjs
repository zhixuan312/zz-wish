#!/usr/bin/env node
/** Explicit delivery-only UV precision study from genuine original arrays. */
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),opt={};
for(let i=0;i<args.length;i+=2)opt[args[i]]=args[i+1];
for(const key of ['--input','--original','--manifest','--output','--mode'])if(!opt[key])throw Error('Missing '+key);
if(!['reviewed','f32'].includes(opt['--mode']))throw Error('Explicit reviewed or original-f32 mode');
const p=Object.fromEntries(['input','original','manifest','output'].map(k=>[k,resolve(root,opt['--'+k])]));
if(!p.output.startsWith(root+'/art/build/')||await access(p.output).then(()=>true,()=>false))throw Error('Separate new ignored output required');
const sha=a=>createHash('sha256').update(a).digest('hex'),byte=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength),same=(a,b,label)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(label);};
const jsonChunk=a=>{const b=Buffer.from(a.buffer,a.byteOffset,a.byteLength);return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
function physicalMaterial(m,json,data){const copy=structuredClone(m);delete copy.name;function visit(v){if(!v||typeof v!=='object')return;if(v.extensions?.KHR_texture_transform){delete v.extensions.KHR_texture_transform;if(!Object.keys(v.extensions).length)delete v.extensions;}for(const[k,x]of Object.entries(v)){if(k.endsWith('Texture')&&x?.index!==undefined){const texture=json.textures[x.index],image=json.images[texture.extensions?.KHR_texture_basisu?.source??texture.source],view=json.bufferViews[image.bufferView],offset=28+Buffer.from(data).readUInt32LE(12)+(view.byteOffset??0);delete x.index;x.actualImageSha256=sha(data.subarray(offset,offset+view.byteLength));x.actualSampler=json.samplers?.[texture.sampler]??{};}visit(x);}}visit(copy);return canonical(copy);}
const flatMaterialJSON=j=>j.nodes.flatMap(n=>n.mesh===undefined?[]:j.meshes[n.mesh].primitives.map(q=>j.materials[q.material]));
const inputBytes=await readFile(p.input),originalBytes=await readFile(p.original),manifestBytes=await readFile(p.manifest),manifest=JSON.parse(manifestBytes),pixelLimit=Number(opt['--max-material-texel-error']??.0625);
const mod=async n=>import(pathToFileURL(resolve('/tmp/one-light-gltf-tools/node_modules',n)).href);
const [{NodeIO},{ALL_EXTENSIONS,EXTMeshoptCompression,KHRTextureTransform},{MeshoptDecoder,MeshoptEncoder}]=await Promise.all([mod('@gltf-transform/core/dist/index.js'),mod('@gltf-transform/extensions/dist/index.js'),mod('meshoptimizer/index.js')]);
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const doc=await io.read(p.input),original=await io.read(p.original),sourceNodes=new Map(original.getRoot().listNodes().filter(n=>n.getMesh()).map(n=>[n.getExtras().lightmap_region,n]));
const sourceRawPath=opt['--source-raw']?resolve(root,opt['--source-raw']):null,sourceRawBytes=sourceRawPath?await readFile(sourceRawPath):null,sourceRaw=sourceRawPath?await io.read(sourceRawPath):null;
const sourceMaterials=sourceRaw?new Map(sourceRaw.getRoot().listMaterials().map(m=>[m.getName(),m])):null;
const sourcePixelLimit=Number(opt['--max-source-material-texel-error']??.25);
const bytesKey=a=>{const b=Buffer.alloc(a.length*4);a.forEach((v,i)=>b.writeFloatLE(v===0?0:v,i*4));return b.toString('hex');};
const q16=v=>Math.round(Math.max(0,Math.min(1,v))*65535),uvKey=(uv,normalized)=>normalized?uv.map(q16).join(','):bytesKey(uv);
const nodeState=d=>d.getRoot().listNodes().map(n=>[n.getName(),n.getMatrix(),n.getExtras(),n.listChildren().map(c=>c.getName())]);
const sceneState=d=>d.getRoot().listScenes().map(s=>[s.getName(),s.getExtras()]);
const imageState=d=>d.getRoot().listTextures().map(t=>[t.getName(),t.getMimeType(),sha(t.getImage())]);
const originalNodeState=nodeState(doc),originalSceneState=sceneState(doc),originalImages=imageState(doc);
const slots=[['baseColor','getBaseColorTexture','getBaseColorTextureInfo'],['normal','getNormalTexture','getNormalTextureInfo'],['metallicRoughness','getMetallicRoughnessTexture','getMetallicRoughnessTextureInfo'],['occlusion','getOcclusionTexture','getOcclusionTextureInfo'],['emissive','getEmissiveTexture','getEmissiveTextureInfo']];
function slotState(material){return slots.filter(([,getter])=>material[getter]()).map(([name,getter,infoGetter])=>{const info=material[infoGetter](),texture=material[getter]();if(info.getExtension('KHR_texture_transform'))throw Error('This measured source has no pre-existing texture transform; explicit composition required for another source');return{name,texture,info,size:texture.getSize(),texCoord:info.getTexCoord()};});}
function canonicalIndices(a){const h=createHash('sha256');for(let i=0;i<a.length;i+=3){const x=[a[i],a[i+1],a[i+2]],m=x.indexOf(Math.min(...x));h.update(JSON.stringify([x[m],x[(m+1)%3],x[(m+2)%3]]));}return h.digest('hex');}
let transformExtension=null,matched=0,ambiguous=0;const reports=[],unchanged=[];
for(const node of doc.getRoot().listNodes().filter(n=>n.getMesh())){
 const region=node.getExtras().lightmap_region,source=sourceNodes.get(region),map=new Map();if(!source)throw Error('Original source region missing');
 same(node.getMatrix(),source.getMatrix(),'Original source transforms differ');
 // Associate to original F32 using exact positions and the actual reviewed
 // quant16 UV codes. Multiple source corners are retained conservatively.
 if(opt['--mode']==='reviewed')for(const primitive of source.getMesh().listPrimitives()){
  const pos=primitive.getAttribute('POSITION'),uv0=primitive.getAttribute('TEXCOORD_0'),uv1=primitive.getAttribute('TEXCOORD_1');
  for(const a of [pos,uv0,uv1])if(a.getComponentType()!==5126||a.getNormalized())throw Error('Original genuine F32 arrays required');
  for(let i=0;i<pos.getCount();i++){const a=uv0.getElement(i,[]),b=uv1.getElement(i,[]),position=bytesKey(pos.getElement(i,[]));for(const normalized of [false,true]){const k=position+'|'+(normalized?'q':'f')+uvKey(a,normalized)+'|'+uvKey(b,true);if(!map.has(k))map.set(k,[]);map.get(k).push([a,b]);}}
 }
 for(const [primitiveIndex,primitive] of node.getMesh().listPrimitives().entries()){
  const material=primitive.getMaterial(),materialName=material?.getName(),textures=slotState(material),uv0=primitive.getAttribute('TEXCOORD_0'),uv1=primitive.getAttribute('TEXCOORD_1'),pos=primitive.getAttribute('POSITION');
  const sourceMaterial=sourceMaterials?.get(materialName);
  if(sourceMaterials&&!sourceMaterial)throw Error('Actual original source material missing: '+materialName);
  const sourceSlotErrors=sourceMaterial?slotState(sourceMaterial).filter(t=>t.texCoord===0).map(t=>({slot:t.name,size:t.size,imageSha256:sha(t.texture.getImage()),maximumOriginalSourceTexelError:0,maximumOriginalSourceTexelErrorXY:[0,0]})):[];
  if(sourceMaterial&&JSON.stringify(sourceSlotErrors.map(t=>t.slot))!==JSON.stringify(textures.filter(t=>t.texCoord===0).map(t=>t.name)))throw Error('Original source material texture roles differ');
  if(pos.getComponentType()!==5126||pos.getNormalized())throw Error('Genuine F32 POSITION required');
  if(opt['--mode']==='f32'&&primitive.getAttribute('NORMAL').getComponentType()!==5126)throw Error('Original F32 normals required, never decoded BYTE cast');
  const oldUV0=Array.from({length:uv0.getCount()},(_,i)=>uv0.getElement(i,[])),oldUV1=Array.from({length:uv1.getCount()},(_,i)=>uv1.getElement(i,[])),truth=[];
  for(let i=0;i<uv0.getCount();i++){
   if(opt['--mode']==='f32'){truth.push([[oldUV0[i],oldUV1[i]]]);continue;}
   const k=bytesKey(pos.getElement(i,[]))+'|'+(uv0.getNormalized()?'q':'f')+uvKey(oldUV0[i],uv0.getNormalized())+'|'+uvKey(oldUV1[i],true),candidates=map.get(k);
   if(!candidates?.length)throw Error('Missing actual original UV ownership: '+region+'/'+primitiveIndex+'/'+i);
   matched++;if(candidates.length>1)ambiguous++;truth.push(candidates);
  }
  const lo=[Infinity,Infinity],hi=[-Infinity,-Infinity];for(const a of oldUV0)for(let c=0;c<2;c++){lo[c]=Math.min(lo[c],a[c]);hi[c]=Math.max(hi[c],a[c]);}
  const range=hi.map((v,c)=>v-lo[c]||1),newUV0=oldUV0.map(a=>a.map((v,c)=>q16((v-lo[c])/range[c])/65535)),effectiveUV0=newUV0.map(a=>a.map((v,c)=>Math.fround(Math.fround(Math.fround(v)*Math.fround(range[c]))+Math.fround(lo[c]))));
  const effectiveFmaUV0=newUV0.map(a=>a.map((v,c)=>Math.fround(Math.fround(v)*Math.fround(range[c])+Math.fround(lo[c]))));
  let maximumTexel=0,maximumSourceTexel=0,maximumOriginalUV0=0;const slotErrors=textures.filter(t=>t.texCoord===0).map(t=>({slot:t.name,size:t.size,maximumMaterialTexelError:0,maximumMaterialTexelErrorXY:[0,0]}));
  for(let i=0;i<truth.length;i++)for(const [a]of truth[i])for(let c=0;c<2;c++){
   const error=Math.max(Math.abs(effectiveUV0[i][c]-a[c]),Math.abs(effectiveFmaUV0[i][c]-a[c]));maximumOriginalUV0=Math.max(maximumOriginalUV0,error);
   for(const slot of slotErrors){const pixelError=error*slot.size[c];slot.maximumMaterialTexelErrorXY[c]=Math.max(slot.maximumMaterialTexelErrorXY[c],pixelError);slot.maximumMaterialTexelError=Math.max(slot.maximumMaterialTexelError,pixelError);maximumTexel=Math.max(maximumTexel,pixelError);}
   for(const slot of sourceSlotErrors){const pixelError=error*slot.size[c];slot.maximumOriginalSourceTexelErrorXY[c]=Math.max(slot.maximumOriginalSourceTexelErrorXY[c],pixelError);slot.maximumOriginalSourceTexelError=Math.max(slot.maximumOriginalSourceTexelError,pixelError);maximumSourceTexel=Math.max(maximumSourceTexel,pixelError);}
  }
  const quantize0=uv0.getComponentType()===5126&&maximumTexel<=pixelLimit&&maximumSourceTexel<=sourcePixelLimit;
  if(quantize0){
   const array=new Uint16Array(uv0.getCount()*2);for(let i=0;i<oldUV0.length;i++)for(let c=0;c<2;c++)array[i*2+c]=q16((oldUV0[i][c]-lo[c])/range[c]);
   primitive.setAttribute('TEXCOORD_0',uv0.clone().setArray(array).setNormalized(true));
   if(uv0.listParents().length===1)uv0.dispose();
   if(textures.some(t=>t.texCoord===0)){
    transformExtension??=doc.createExtension(KHRTextureTransform).setRequired(true);
    const clone=material.clone().setName(materialName+' UV16 '+region+' '+primitiveIndex);primitive.setMaterial(clone);
    for(const t of slotState(clone))if(t.texCoord===0)t.info.setExtension('KHR_texture_transform',transformExtension.createTransform().setOffset(lo).setScale(range));
    // The original shared material and all physical factors remain unchanged.
    for(const t of textures)if(t.info.getExtension('KHR_texture_transform'))throw Error('Material cloning mutated the original texture info');
   }
  }
  if(uv1.getComponentType()===5126){const array=new Uint16Array(uv1.getCount()*2);for(let i=0;i<oldUV1.length;i++)for(let c=0;c<2;c++){if(oldUV1[i][c]<0||oldUV1[i][c]>1)throw Error('No UV2 clamping allowed');array[i*2+c]=q16(oldUV1[i][c]);}primitive.setAttribute('TEXCOORD_1',uv1.clone().setArray(array).setNormalized(true));if(uv1.listParents().length===1)uv1.dispose();}
  let maximumUV1=0;const storedUV1=primitive.getAttribute('TEXCOORD_1');for(let i=0;i<truth.length;i++)for(const [,b]of truth[i])for(let c=0;c<2;c++)maximumUV1=Math.max(maximumUV1,Math.abs(Math.fround(storedUV1.getElement(i,[])[c])-b[c]));
  const maps=[];for(const[look,entry]of Object.entries(manifest.lightmaps[region])){const data=await readFile(resolve(dirname(p.manifest),entry.uri)),width=data.readUInt32LE(20),height=data.readUInt32LE(24);maps.push({look,size:[width,height],mips:Array.from({length:entry.mipLevels},(_,level)=>({level,maximumLightmapTexelError:maximumUV1*(Math.max(width,height)/(2**level))}))});}
  let actualMaterialTexelError=0;for(let i=0;i<truth.length;i++)for(const[a]of truth[i])for(let c=0;c<2;c++)for(const slot of slotErrors){const error=quantize0?Math.max(Math.abs(effectiveUV0[i][c]-a[c]),Math.abs(effectiveFmaUV0[i][c]-a[c])):Math.abs(Math.fround(oldUV0[i][c])-a[c]);actualMaterialTexelError=Math.max(actualMaterialTexelError,error*slot.size[c]);}
  const exact=primitive.listSemantics().filter(s=>!s.startsWith('TEXCOORD')).sort().map(s=>{const a=primitive.getAttribute(s);return[s,a.getType(),a.getComponentType(),a.getNormalized(),sha(byte(a.getArray()))];});
  unchanged.push({exact,winding:canonicalIndices(primitive.getIndices().getArray()),uv0Hash:sha(byte(primitive.getAttribute('TEXCOORD_0').getArray())),uv1Hash:sha(byte(primitive.getAttribute('TEXCOORD_1').getArray()))});
  reports.push({region,primitive:primitiveIndex,material:materialName,vertices:oldUV0.length,normalComponentType:primitive.getAttribute('NORMAL').getComponentType(),oldUV0ComponentType:uv0.getComponentType(),UV0Quantized:quantize0,affineDecode:quantize0?{offset:lo,scale:range}:null,proposalMaximumOriginalUV0Error:maximumOriginalUV0,proposalMaximumMaterialTexelError:maximumTexel,actualMaximumMaterialTexelError:actualMaterialTexelError,proposalMaximumOriginalSourceTexelError:maximumSourceTexel,actualMaximumOriginalSourceTexelError:quantize0?maximumSourceTexel:0,sourceSlotErrors,slotErrors,retainedF32Reason:!quantize0&&uv0.getComponentType()===5126?'Measured material-pixel bound exceeded':null,maximumOriginalUV1Error:maximumUV1,lightmapMipBounds:maps});
 }
}
for(const material of [...doc.getRoot().listMaterials()])if(material.listParents().length===1)material.dispose();
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
const output=await io.writeBinary(doc),decoded=await io.readBinary(output);let i=0;
const oldJSON=jsonChunk(inputBytes),newJSON=jsonChunk(output),oldMaterials=flatMaterialJSON(oldJSON).map(m=>physicalMaterial(m,oldJSON,inputBytes)),newMaterials=flatMaterialJSON(newJSON).map(m=>physicalMaterial(m,newJSON,output));
for(let k=0;k<oldMaterials.length;k++)same(newMaterials[k],oldMaterials[k],'Physical material/image slot definitions changed beyond explicit affine UV decode: '+JSON.stringify({primitive:k,old:oldMaterials[k],new:newMaterials[k]}));
const transformState=d=>d.getRoot().listNodes().filter(n=>n.getMesh()).flatMap(n=>n.getMesh().listPrimitives().map(q=>slots.filter(([,get])=>q.getMaterial()[get]()).map(([name,,getInfo])=>{const info=q.getMaterial()[getInfo](),t=info.getExtension('KHR_texture_transform');return[name,info.getTexCoord(),t?[t.getOffset(),t.getScale(),t.getRotation(),t.getTexCoord()]:null];})));
same(transformState(decoded),transformState(doc),'UV affine decoder metadata changed');
for(const node of decoded.getRoot().listNodes().filter(n=>n.getMesh()))for(const primitive of node.getMesh().listPrimitives()){
 const expected=unchanged[i++],exact=primitive.listSemantics().filter(s=>!s.startsWith('TEXCOORD')).sort().map(s=>{const a=primitive.getAttribute(s);return[s,a.getType(),a.getComponentType(),a.getNormalized(),sha(byte(a.getArray()))];});
 same(exact,expected.exact,'Position/normal/tint/other semantic changed');same(canonicalIndices(primitive.getIndices().getArray()),expected.winding,'Triangle order/winding changed');same(sha(byte(primitive.getAttribute('TEXCOORD_0').getArray())),expected.uv0Hash,'UV0 codec changed');same(sha(byte(primitive.getAttribute('TEXCOORD_1').getArray())),expected.uv1Hash,'UV1 codec changed');
}
same(nodeState(decoded),originalNodeState,'Physical transforms/ownership metadata changed');same(sceneState(decoded),originalSceneState,'Runtime scene anchors/config changed');same(imageState(decoded),originalImages,'Actual embedded image bytes changed');
if(sha(await readFile(p.input))!==sha(inputBytes)||sha(await readFile(p.original))!==sha(originalBytes))throw Error('Frozen input changed');
if(sourceRawPath&&sha(await readFile(sourceRawPath))!==sha(sourceRawBytes))throw Error('Original raw source changed');
const report={scope:'Explicit LOSSY UV16 delivery budget probe. No source/chart/island remap, position, normal, tint, geometry, image, lighting or transport change. Affine UV0 storage is explicitly decoded by KHR_texture_transform; PBR factors remain unchanged. Not adopted; actual runtime optics remain required.',mode:opt['--mode'],input:{path:relative(root,p.input),sha256:sha(inputBytes),bytes:inputBytes.length},originalF32:{path:relative(root,p.original),sha256:sha(originalBytes)},manifest:{path:relative(root,p.manifest),sha256:sha(manifestBytes)},output:{path:relative(root,p.output),sha256:sha(output),bytes:output.length,savedBytes:inputBytes.length-output.length},maximumAllowedMaterialTexelError:pixelLimit,originalF32AssociatedVertices:matched,conservativeAmbiguousCandidateVertices:ambiguous,everyActualNonUVArrayAndTypeByteExact:true,indexCyclicWindingExact:true,sourceRuntimeAnchorsExact:true,embeddedImageBytesExact:true,renderBakeGpuJobs:0,scriptSha256:sha(await readFile(fileURLToPath(import.meta.url))),primitives:reports};
report.originalRawSource=sourceRawPath?{path:relative(root,sourceRawPath),sha256:sha(sourceRawBytes),everyOriginalImageRoleAndDimensionMeasured:true}:null;
report.maximumAllowedOriginalSourceTexelError=sourcePixelLimit;
report.maximumActualOriginalSourceTexelError=Math.max(...reports.map(row=>row.actualMaximumOriginalSourceTexelError));
await mkdir(dirname(p.output),{recursive:true});await writeFile(p.output,output,{flag:'wx'});await writeFile(p.output+'.receipt.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log('UV16_BUDGET_PROBE',JSON.stringify({bytes:output.length,savedBytes:inputBytes.length-output.length,quantizedPrimitives:reports.filter(r=>r.UV0Quantized).length,retainedF32:reports.filter(r=>r.retainedF32Reason).map(r=>[r.region,r.material,r.proposalMaximumMaterialTexelError]),maxUV1Error:Math.max(...reports.map(r=>r.maximumOriginalUV1Error))}));
