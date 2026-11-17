#!/usr/bin/env node
// Replace only architectural normal-image payloads from genuine raw source.
import {readFile,writeFile,mkdir,access}from'node:fs/promises';
import {createHash}from'node:crypto';
import {resolve,dirname,relative}from'node:path';
import {pathToFileURL,fileURLToPath}from'node:url';
import {execFileSync}from'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),opt={};for(let i=2;i<process.argv.length;i+=2)opt[process.argv[i]]=process.argv[i+1];
for(const k of ['input','raw','out','size'])if(!opt['--'+k])throw Error('Missing --'+k);
const input=resolve(root,opt['--input']),raw=resolve(root,opt['--raw']),out=resolve(root,opt['--out']),size=Number(opt['--size']);
if(![256,384].includes(size)||!out.startsWith(root+'/art/build/')||await access(out).then(()=>true,()=>false))throw Error('New ignored256/384 candidate directory required');
await mkdir(out,{recursive:true});const sha=v=>createHash('sha256').update(v).digest('hex'),bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength),same=(a,b,label)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(label);};
const mod=async n=>import(pathToFileURL(resolve('/tmp/one-light-gltf-tools/node_modules',n)).href);
const [{NodeIO},{ALL_EXTENSIONS,EXTMeshoptCompression},{MeshoptDecoder,MeshoptEncoder}]=await Promise.all([mod('@gltf-transform/core/dist/index.js'),mod('@gltf-transform/extensions/dist/index.js'),mod('meshoptimizer/index.js')]);
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const rawBytes=await readFile(raw),inputBytes=await readFile(input),doc=await io.read(input),source=await io.read(raw);
const texSource=new Map(source.getRoot().listMaterials().map(m=>[m.getName(),m.getNormalTexture()]));
const stripName=n=>n.replace(/ UV16 (?:altar|hall|court|gate) \d+$/,'');
const isProtected=n=>/chinese_(?:console_table|screen_panels)|bronze|burnished/i.test(n);
const planned=new Map();for(const m of doc.getRoot().listMaterials()){
 const t=m.getNormalTexture();if(!t)continue;const name=stripName(m.getName()),original=texSource.get(name);if(!original)throw Error('Actual source normal image missing: '+name);
 if(!planned.has(t))planned.set(t,{materials:[],source:original,sourceSha256:sha(original.getImage()),protected:false});const row=planned.get(t);if(row.sourceSha256!==sha(original.getImage()))throw Error('Shared delivered normal texture has distinct source originals');row.materials.push(name);row.protected||=isProtected(name);
}
for(const [t,row]of planned){if(row.materials.some(n=>/chinese_(?:console_table|screen_panels)/.test(n))&&t.getSize()[0]!==512)throw Error('Protected scan normal was not512px');if(!row.protected&&row.source.getMimeType()==='image/webp')throw Error('Add a pixel-exact WebP adapter before encoding this source');}
const encodedSource=resolve(out,`source-normal-${size}.glb`),cli='/tmp/one-light-gltf-tools/node_modules/.bin/gltf-transform',toktx='/var/folders/y7/b30gx9v90z36h9vf5pvk27mh0000gn/T/one-light-ktx-tools/KTX-Software-4.4.2-Darwin-arm64-tools.pkg/Payload/usr/local/bin';
execFileSync(cli,['uastc',raw,encodedSource,'--slots','*normal*','--resize',String(size),'--level','2','--rdo','false','--zstd','18','--jobs','2'],{env:{...process.env,PATH:toktx+':'+process.env.PATH},stdio:'inherit'});
const compressed=await io.read(encodedSource),encodedTextures=new Map(compressed.getRoot().listMaterials().map(m=>[m.getName(),m.getNormalTexture()]));
const nodeState=d=>d.getRoot().listNodes().map(n=>[n.getName(),n.getMatrix(),n.getExtras(),n.listChildren().map(c=>c.getName())]);
const sceneState=d=>d.getRoot().listScenes().map(s=>[s.getName(),s.getExtras()]);
const primitiveState=d=>d.getRoot().listMeshes().flatMap(m=>m.listPrimitives().map(p=>({attributes:p.listSemantics().sort().map(s=>{const a=p.getAttribute(s);return[s,a.getType(),a.getComponentType(),a.getNormalized(),sha(bytes(a.getArray()))];}),indices:sha(bytes(p.getIndices().getArray()))})));
const beforeNodes=nodeState(doc),beforeScenes=sceneState(doc),beforePrimitives=primitiveState(doc),oldImages=new Map(doc.getRoot().listTextures().map(t=>[t,sha(t.getImage())]));
const reports=[];for(const[t,row]of planned){const old=t.getImage(),beforeSize=t.getSize();if(!row.protected){const encoded=encodedTextures.get(row.materials[0]);if(encoded.getMimeType()!=='image/ktx2')throw Error('Normal encoder skipped actual source');const data=encoded.getImage();if(encoded.getSize()[0]!==size||encoded.getSize()[1]!==size)throw Error('Requested normal dimensions were not encoded');t.setImage(data).setMimeType('image/ktx2');}
 reports.push({materials:[...new Set(row.materials)],sourceImageSha256:row.sourceSha256,sourceSize:row.source.getSize(),protectedOriginalPayload:row.protected,beforeSize,actualSize:t.getSize(),beforeBytes:old.length,bytes:t.getImage().length,savedBytes:old.length-t.getImage().length,beforeSha256:sha(old),sha256:sha(t.getImage()),codec:'UASTC level2 noRDO Zstd18',transfer:'linear',scope:row.protected?'Table/screen scan or bronze detail retained unchanged':'Architectural photographed normal image downsampled from original raw source'});
}
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});const output=await io.writeBinary(doc),decoded=await io.readBinary(output);
same(nodeState(decoded),beforeNodes,'Node transforms/ownership changed');same(sceneState(decoded),beforeScenes,'Source runtime metadata changed');same(primitiveState(decoded),beforePrimitives,'Actual positions/normals/UV/tint/index streams changed');
const json=b=>JSON.parse(Buffer.from(b).subarray(20,20+Buffer.from(b).readUInt32LE(12)).toString());same(json(output).materials,json(inputBytes).materials,'Material factors/texture slots/UV affine transforms changed');
for(const t of doc.getRoot().listTextures())if(!planned.has(t)||planned.get(t).protected)if(sha(t.getImage())!==oldImages.get(t))throw Error('Protected or non-normal image changed');
if(sha(await readFile(input))!==sha(inputBytes)||sha(await readFile(raw))!==sha(rawBytes))throw Error('Immutable input changed');
const path=resolve(out,'snow-roof.glb'),receipt={scope:'CPU-only architecture normal-image resolution study. Source geometry/lighting/GI unchanged. All actual decoded geometric attributes/indices, materials, UV transforms, runtime anchors and non-normal/protected images unchanged. Not adopted; real optical review required.',input:{path:relative(root,input),bytes:inputBytes.length,sha256:sha(inputBytes)},rawSource:{path:relative(root,raw),sha256:sha(rawBytes)},output:{path:relative(root,path),bytes:output.length,sha256:sha(output),savedBytes:inputBytes.length-output.length},requestedArchitectureNormalSize:size,images:reports,decodedStreamsByteExact:true,allMaterialDefinitionsAndUVTransformsExact:true,allProtectedScanAndBronzeImagePayloadsExact:true,renderBakeBrowserGpuJobs:0,scriptSha256:sha(await readFile(fileURLToPath(import.meta.url)))};
await writeFile(path,output,{flag:'wx'});await writeFile(path+'.receipt.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log('NORMAL_IMAGE_BUDGET_READY',JSON.stringify({bytes:output.length,savedBytes:inputBytes.length-output.length,images:reports}));
