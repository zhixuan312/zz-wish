#!/usr/bin/env node
/** Lossless FLOAT32 POSITION diagnostic. No image encoding, authored edits or bakes.
 * Run only after capture hands CPU timing back. The first output is deliberately
 * unpruned (650,624 triangles), to vary export position precision alone.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { resolve, join, dirname, relative } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv=process.argv.slice(2), option=(name,fallback)=>argv.includes(name)?argv[argv.indexOf(name)+1]:fallback;
if(argv.includes('--help')){console.log('node scripts/pack-float-position-diagnostic.mjs --out art/build/snow-roof-float32-position-diagnostic [--tools /tmp/one-light-gltf-tools]\nReads actual raw/mobile-textured GLBs and current unpruned mobile baseline; writes a separate unpruned complete optical diagnostic. No image conversion or Cycles.');process.exit(0);}
const source=resolve(ROOT,'art/build/snow-roof-final'), out=resolve(option('--out','art/build/snow-roof-float32-position-diagnostic'));
if(!out.startsWith(join(ROOT,'art/build')+'/')||out===source)throw Error('Separate art/build output required.');
const exists=p=>access(p).then(()=>true,()=>false), sha=b=>createHash('sha256').update(b).digest('hex');
if(await exists(join(out,'snow-roof.glb')))throw Error('Refusing existing diagnostic output.');
const paths={raw:join(source,'snow-roof.raw.glb'),textured:join(source,'snow-roof.mobile.textures.glb'),baseline:join(source,'snow-roof.mobile.packed.glb'),manifest:join(ROOT,'art/build/snow-roof-final-mobile/manifest.json')};
const bytes=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([k,p])=>[k,await readFile(p)])));
if(sha(bytes.raw)!=='0deec9fd71d4c49e666e5b091f15af3067efbcdb7e3c350bcb85a2bf7f980dea'||sha(bytes.baseline)!=='18a924b6840598e284197c5a07ff9f3f731ebe220aad720bdbf149a786784237')throw Error('Frozen actual raw/baseline identity drift. Obtain fresh provenance.');
const prefix=resolve(option('--tools','/tmp/one-light-gltf-tools')), modules=[];
for(const [name,version] of [['@gltf-transform/core','4.5.1'],['@gltf-transform/extensions','4.5.1'],['@gltf-transform/functions','4.5.1'],['meshoptimizer','1.2.0']]){
 const folder=join(prefix,'node_modules',name),p=JSON.parse(await readFile(join(folder,'package.json'),'utf8'));
 if(p.version!==version)throw Error('Pinned dependency mismatch: '+name);
 modules.push(await import(pathToFileURL(join(folder,p.module??p.main)).href));
}
const [{NodeIO},{ALL_EXTENSIONS,EXTMeshoptCompression},{reorder,quantize},{MeshoptEncoder,MeshoptDecoder}]=modules;
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
function arrayHash(a){const v=a.getArray();return sha(Buffer.from(v.buffer,v.byteOffset,v.byteLength));}
function primitives(doc){return doc.getRoot().listMeshes().flatMap((mesh,mi)=>mesh.listPrimitives().map((p,pi)=>({key:`${mi}/${pi}`,p})));}
function positions(doc){return primitives(doc).map(({key,p})=>{const a=p.getAttribute('POSITION');if(a.getComponentType()!==5126||a.getNormalized()||!(a.getArray() instanceof Float32Array))throw Error('Genuine nonnormalized FLOAT32 POSITION required: '+key);return {key,count:a.getCount(),sha256:arrayHash(a)};});}
function streams(doc,excludePosition=false){return primitives(doc).map(({key,p})=>({key,attributes:p.listSemantics().filter(s=>!excludePosition||s!=='POSITION').sort().map(s=>{const a=p.getAttribute(s);return {semantic:s,type:a.getType(),component:a.getComponentType(),normalized:a.getNormalized(),count:a.getCount(),sha256:arrayHash(a)};})}));}
function indices(doc){return primitives(doc).map(({key,p})=>{const a=p.getIndices().getArray(),hash=createHash('sha256');for(let i=0;i<a.length;i+=3){const t=[a[i],a[i+1],a[i+2]],start=t.indexOf(Math.min(...t));const row=new Uint32Array([t[start],t[(start+1)%3],t[(start+2)%3]]);hash.update(Buffer.from(row.buffer));}return {key,triangles:a.length/3,sha256:hash.digest('hex')};});}
function ownership(doc){return {nodes:doc.getRoot().listNodes().map(n=>({name:n.getName(),extras:n.getExtras(),matrix:n.getMatrix(),mesh:n.getMesh()?.getName(),children:n.listChildren().map(c=>c.getName())})),scenes:doc.getRoot().listScenes().map(s=>({name:s.getName(),extras:s.getExtras(),roots:s.listChildren().map(n=>n.getName())}))};}
function materialValues(doc){return primitives(doc).map(({key,p})=>{const m=p.getMaterial();return {key,name:m.getName(),extras:m.getExtras(),base:m.getBaseColorFactor(),rough:m.getRoughnessFactor(),metal:m.getMetallicFactor(),emissive:m.getEmissiveFactor(),alpha:m.getAlphaMode(),cutoff:m.getAlphaCutoff(),doubleSided:m.getDoubleSided(),extensions:m.listExtensions().map(e=>e.extensionName)};});}
function images(doc){return doc.getRoot().listTextures().map(t=>({name:t.getName(),mime:t.getMimeType(),sha256:sha(t.getImage()),bytes:t.getImage().byteLength})).sort((a,b)=>a.name.localeCompare(b.name));}
function same(a,b,label){if(JSON.stringify(a)!==JSON.stringify(b))throw Error(label+' changed.');}
const raw=await io.readBinary(bytes.raw),doc=await io.readBinary(bytes.textured),baseline=await io.readBinary(bytes.baseline);
same(positions(raw),positions(doc),'Original raw FLOAT32 position arrays');
const originalOwnership=ownership(doc), originalMaterials=materialValues(doc), originalImages=images(doc);
if(primitives(doc).some(({p})=>p.listTargets().length))throw Error('Unexpected morph targets; diagnostic scope is static source only.');
await doc.transform(reorder({encoder:MeshoptEncoder,target:'size'}));
const reorderedPositions=positions(doc);
// Match meshopt(level=high)'s nonposition settings. NORMAL stays FLOAT32 here;
// the identical FILTER writer performs its original OCTAHEDRAL8 encoding.
await doc.transform(quantize({pattern:/^(TEXCOORD|JOINTS|WEIGHTS|COLOR)(_\d+)?$/,patternTargets:/^(TEXCOORD|JOINTS|WEIGHTS|COLOR|NORMAL|TANGENT)(_\d+)?$/,quantizeTexcoord:16,quantizeNormal:8,quantizeColor:8,quantizeWeight:8,quantizeGeneric:12}));
same(reorderedPositions,positions(doc),'Position arrays during nonposition quantization');
same(originalOwnership,ownership(doc),'Original nonquantized node/scene transforms and extras');
same(originalMaterials,materialValues(doc),'Material values');
same(originalImages,images(doc),'Embedded image payloads');
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.FILTER});
const packed=Buffer.from(await io.writeBinary(doc)), decoded=await io.readBinary(packed);
same(reorderedPositions,positions(decoded),'Lossless FLOAT32 position writer roundtrip');
same(streams(baseline,true),streams(decoded,true),'Decoded non-POSITION arrays versus current unpruned mobile');
same(indices(baseline),indices(decoded),'Triangle indices/winding versus current unpruned mobile');
same(originalOwnership,ownership(decoded),'Original node/scene ownership roundtrip');
same(materialValues(baseline),materialValues(decoded),'Material parameters versus current unpruned mobile');
same(images(baseline),images(decoded),'Embedded images versus current unpruned mobile');
const json=JSON.parse(packed.subarray(20,20+packed.readUInt32LE(12)).toString());
for(const mesh of json.meshes)for(const p of mesh.primitives){const a=json.accessors[p.attributes.POSITION],v=json.bufferViews[a.bufferView];if(a.componentType!==5126||a.normalized||v.extensions?.EXT_meshopt_compression?.filter&&v.extensions.EXT_meshopt_compression.filter!=='NONE')throw Error('Output POSITION accessor/filter is not lossless FLOAT32/NONE.');}
await mkdir(out,{recursive:true});await writeFile(join(out,'snow-roof.glb'),packed);
const manifest=JSON.parse(bytes.manifest.toString());
if(manifest.partialPreview||Object.values(manifest.lightmaps).reduce((n,p)=>n+Object.keys(p).length,0)!==12)throw Error('Complete twelve-map source manifest required.');
manifest.files=manifest.files.map(f=>f.uri==='snow-roof.glb'?{...f,sha256:sha(packed),bytes:packed.length}:f);
for(const file of manifest.files.filter(f=>f.uri!=='snow-roof.glb')){const data=await readFile(join(dirname(paths.manifest),file.uri));if(data.length!==file.bytes||sha(data)!==file.sha256)throw Error('Source lightmap payload drift: '+file.uri);await copyFile(join(dirname(paths.manifest),file.uri),join(out,file.uri));}
manifest.totalBytes=manifest.files.reduce((n,f)=>n+f.bytes,0);
manifest.compression.geometryProfile='unpruned-float32-position-optical-diagnostic';
manifest.compression.transformOrder=['existing-mobile-textures','reorder-size','quantize-nonposition-only','meshopt-filter-position-NONE'];
const receipt={version:1,status:'Optical diagnostic only; hidden roof retained, no new geometry/light/material edits or bakes.',inputs:Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,{path:relative(ROOT,p),sha256:sha(bytes[k])}])),output:{path:relative(ROOT,join(out,'snow-roof.glb')),sha256:sha(packed),bytes:packed.length},positions:{componentType:5126,normalized:false,sourceRawAccessorArraysExact:true,afterLosslessReorderRoundtripExact:true,accessors:positions(decoded)},nonpositionStreams:{baseline:'actual unpruned mobile packed GLB',decodedArraysBitExact:true,indexWindingExactAllowingCyclicRotation:true,streams:streams(decoded,true)},materialParametersExact:true,embeddedImagesExact:true,images:originalImages,originalNodeTransformsAndSceneExtrasExact:true,lightmaps:manifest.files.filter(f=>f.uri.endsWith('.ktx2')),fullSourceBakeFingerprintUnchanged:manifest.bakeFingerprint,encoding:{method:'EXT_meshopt FILTER',positionFilter:'NONE',normalFilter:'existing OCTAHEDRAL8',noPositionQuantizeOrFloatCast:true,noImageConversion:true}};
await writeFile(join(out,'diagnostic.receipt.json'),JSON.stringify(receipt,null,2)+'\n');
manifest.compression.positionPrecisionDiagnostic={uri:'diagnostic.receipt.json',sha256:sha(await readFile(join(out,'diagnostic.receipt.json'))),positionComponentType:5126,positionFilter:'NONE',unpruned:true,baselineSource:'genuine pre-Meshopt mobile-textured GLB'};
await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('FLOAT32_POSITION_DIAGNOSTIC',JSON.stringify({directory:relative(ROOT,out),glbBytes:packed.length,glbSha256:sha(packed),totalBytes:manifest.totalBytes,positionAccessors:positions(decoded).length,lightmaps:12,allAuditsPassed:true}));
