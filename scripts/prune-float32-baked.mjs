#!/usr/bin/env node
/** Source-FACE-verified export-only pruning of genuine FLOAT32 Snow Roof delivery.
 * First measured profile: --input PATH --output PATH --profile-out PATH
 * Reproduce frozen result: --input PATH --output NEW_PATH --profile PATH
 * No authored edits, Cycles, image conversion, quantize()/meshopt() transform,
 * normal refiltering, approximation or live/public/cache writes.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, access, realpath, unlink } from 'node:fs/promises';
import { resolve, dirname, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const exists=p=>access(p).then(()=>true,()=>false);
const portablePath=p=>p.startsWith(ROOT+'/')?relative(ROOT,p):p;
function glbParts(bytes) {
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (data.readUInt32LE(0) !== 0x46546c67 || data.readUInt32LE(4) !== 2 || data.readUInt32LE(8) !== data.length) throw new Error('Invalid GLB.');
  let json, binary;
  for (let offset = 12; offset < data.length;) {
    const length = data.readUInt32LE(offset), type = data.readUInt32LE(offset + 4);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString());
    if (type === 0x004e4942) binary = chunk;
    offset += length + 8;
  }
  if (!json || !binary) throw new Error('Embedded GLB JSON/BIN chunks are required.');
  return { json, binary };
}
function imageSignature(bytes) {
  const { json, binary } = glbParts(bytes);
  const hashes = json.images.map((image) => {
    if (image.bufferView === undefined) throw new Error('External images are refused.');
    const view = json.bufferViews[image.bufferView];
    return sha(binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
  }).sort();
  return { count: hashes.length, sha256: sha(hashes.join('')), hashes };
}
function summary(bytes) {
  const { json } = glbParts(bytes);
  return {
    bytes: bytes.byteLength, images: json.images.length,
    imageBytes: json.images.reduce((n, image) => n + json.bufferViews[image.bufferView].byteLength, 0),
    geometryBytes: json.bufferViews.reduce((n, view) => n + (view.extensions?.EXT_meshopt_compression?.byteLength ?? 0), 0),
    vertices: json.meshes.reduce((n, mesh) => n + mesh.primitives.reduce((m, primitive) => m + json.accessors[primitive.attributes.POSITION].count, 0), 0),
    triangles: json.meshes.reduce((n, mesh) => n + mesh.primitives.reduce((m, primitive) => m + json.accessors[primitive.indices].count / 3, 0), 0),
  };
}
function same(value, expected, label) {
  if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error(label + ' changed.');
}
function assertSummary(actual, expected, label) {
  for (const [key, value] of Object.entries(expected)) if (actual[key] !== value) throw new Error(label + ' ' + key + ': expected ' + value + ', got ' + actual[key]);
}
function primitiveHash(primitive) {
  const hash = createHash('sha256'), semantics = primitive.listSemantics().sort();
  const attributes = semantics.map((semantic) => primitive.getAttribute(semantic));
  hash.update(JSON.stringify(attributes.map((attribute, i) => [semantics[i], attribute.getType(), attribute.getComponentType(), attribute.getNormalized()])));
  const indices = primitive.getIndices().getArray();
  for (let k = 0; k < indices.length; k += 3) {
    const corners = [indices[k], indices[k + 1], indices[k + 2]].map((index) => Buffer.concat(attributes.map((attribute) => {
      const array = attribute.getArray(), size = attribute.getElementSize() * array.BYTES_PER_ELEMENT;
      return Buffer.from(array.buffer, array.byteOffset + index * size, size);
    })));
    // Meshopt may cyclically rotate triangle corners. Winding reversal is refused.
    const rotations = [Buffer.concat(corners), Buffer.concat([corners[1], corners[2], corners[0]]), Buffer.concat([corners[2], corners[0], corners[1]])];
    rotations.sort(Buffer.compare); hash.update(rotations[0]);
  }
  return hash.digest('hex');
}
function nodeState(document) {
  return document.getRoot().listNodes().map((node) => ({
    name: node.getName(), extras: node.getExtras(), translation: node.getTranslation(),
    rotation: node.getRotation(), scale: node.getScale(),
    children: node.listChildren().map((child) => child.getName()),
    mesh: node.getMesh()?.getName() ?? null,
  }));
}
function sceneState(document) {
  return document.getRoot().listScenes().map((scene) => ({ name: scene.getName(), extras: scene.getExtras(), roots: scene.listChildren().map((node) => node.getName()) }));
}
function primitiveStates(document) {
  const result = [];
  for (const node of document.getRoot().listNodes()) for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
    result.push({ region: node.getExtras().lightmap_region, material: primitive.getMaterial()?.getName(), hash: primitiveHash(primitive) });
  }
  return result;
}
async function loadTools(prefix) {
  const names = ['@gltf-transform/core', '@gltf-transform/extensions', '@gltf-transform/functions', 'meshoptimizer'];
  const expected = ['4.5.1', '4.5.1', '4.5.1', '1.2.0'], modules = [], versions = {};
  for (let i = 0; i < names.length; i++) {
    const directory = join(prefix, 'node_modules', names[i]);
    const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    if (pkg.version !== expected[i]) throw new Error('Pinned dependency required: ' + names[i] + '@' + expected[i]);
    versions[names[i]] = pkg.version;
    modules.push(await import(pathToFileURL(resolve(directory, pkg.module ?? pkg.main)).href));
  }
  return { core: modules[0], extensions: modules[1], functions: modules[2], meshoptimizer: modules[3], versions };
}
const args=process.argv.slice(2),opt={};
if(args.includes('--help')){console.log('node scripts/prune-float32-baked.mjs --input PATH --output NEW_art/build/PATH.glb (--profile-out NEW_PROFILE.json --inputs ACTUAL_BINDINGS.json | --profile EXISTING_PROFILE.json) [--tools PREFIX]\nFresh measurements require explicit source/prepared/raw/proof/reference/input paths and actual SHA256 bindings. Reproduction reads those bindings from the frozen profile. Source FACE/raw and retained-attribute proofs execute before any output write.');process.exit(0);}
for(let i=0;i<args.length;i+=2){if(!['--input','--output','--profile','--profile-out','--inputs','--tools'].includes(args[i])||!args[i+1]||opt[args[i]])throw Error('Invalid/repeated option');opt[args[i]]=args[i+1];}
if(!opt['--input']||!opt['--output']||!!opt['--profile']===!!opt['--profile-out'])throw Error('Required input, output and exactly one profile/profile-out');
const input=await realpath(resolve(opt['--input'])),output=resolve(opt['--output']),profilePath=resolve(opt['--profile']??opt['--profile-out']);
if(!output.startsWith(join(ROOT,'art/build')+'/')||output.startsWith(dirname(input)+'/')||!output.endsWith('.glb')||await exists(output)||await exists(output.slice(0,-4)+'.receipt.json'))throw Error('New separate art/build output required');
if(opt['--profile-out']&&await exists(profilePath))throw Error('New profile output refused existing file');
if(!profilePath.startsWith(ROOT+'/'))throw Error('Profile must remain in repository');
const receiptPath=output.slice(0,-4)+'.receipt.json',prior=opt['--profile']?JSON.parse(await readFile(profilePath,'utf8')):null;
if(prior&&opt['--inputs']||!prior&&!opt['--inputs'])throw Error('Fresh profiles require --inputs; reproduction uses only existing profile bindings');
const bound=prior?.inputs??JSON.parse(await readFile(resolve(opt['--inputs']),'utf8')).inputs;
if(!bound||JSON.stringify(Object.keys(bound).sort())!==JSON.stringify(['source','prepared','raw','proof','reference','input'].sort()))throw Error('Explicit actual input bindings are incomplete');
const frozen=Object.fromEntries(Object.entries(bound).map(([k,v])=>{if(!v.path||!/^[a-f0-9]{64}$/.test(v.sha256))throw Error('Invalid actual binding: '+k);return[k,{path:resolve(ROOT,v.path),sha256:v.sha256}];}));
if(await realpath(frozen.input.path)!==input)throw Error('CLI input differs from actual profile binding');
const inputs={};
for(const[k,v]of Object.entries(frozen)){const bytes=await readFile(v.path);if(sha(bytes)!==v.sha256)throw Error('Actual frozen input changed: '+k);inputs[k]={path:portablePath(v.path),sha256:v.sha256};}
const reference=JSON.parse(await readFile(frozen.reference.path,'utf8')),sourceProof=JSON.parse(await readFile(frozen.proof.path,'utf8'));
if(sourceProof.sourceSha256!==frozen.source.sha256)throw Error('Source proof binding differs');
for(const[k,v]of Object.entries(reference.inputs)){const canonical=k==='source'?'source':k==='prepared'?'prepared':'proof';if(v.sha256!==frozen[canonical].sha256)throw Error('Prepared FACE reference binding differs');}
const tools=await loadTools(resolve(opt['--tools']??'/tmp/one-light-gltf-tools'));
const{NodeIO}=tools.core,{ALL_EXTENSIONS,EXTMeshoptCompression}=tools.extensions,{compactPrimitive,weldPrimitive,dedup}=tools.functions,{MeshoptDecoder,MeshoptEncoder}=tools.meshoptimizer;
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const inputBytes=await readFile(input),doc=await io.read(input),raw=await io.read(frozen.raw.path),before=summary(inputBytes),imagesBefore=imageSignature(inputBytes),jsonBefore=glbParts(inputBytes).json;
const nodeBefore=nodeState(doc),sceneBefore=sceneState(doc);same(nodeBefore,nodeState(raw),'Actual authored transforms/ownership');same(sceneBefore,sceneState(raw),'Actual authored scene metadata');
const nodes=d=>new Map(d.getRoot().listNodes().filter(n=>n.getMesh()).map(n=>[n.getExtras().lightmap_region,n]));
// Exact FLOAT32 cyclic-winding triangle-position multisets; storage order is irrelevant.
function positionKey(p,ids,sortAll=false){const a=p.getAttribute('POSITION').getArray();const rows=ids.map(i=>{const b=Buffer.from(a.buffer,a.byteOffset+i*12,12);const copy=Buffer.from(b);for(let j=0;j<3;j++)if(copy.readFloatLE(j*4)===0)copy.writeFloatLE(0,j*4);return copy;});if(sortAll)return Buffer.concat(rows.sort(Buffer.compare)).toString('hex');const rot=[0,1,2].map(i=>Buffer.concat([rows[i],rows[(i+1)%3],rows[(i+2)%3]]));rot.sort(Buffer.compare);return rot[0].toString('hex');}
function positionSignature(p){const a=p.getAttribute('POSITION');if(a.getComponentType()!==5126||a.getNormalized())throw Error('Genuine nonnormalized FLOAT32 POSITION required');const idx=p.getIndices().getArray(),keys=[];for(let i=0;i<idx.length;i+=3)keys.push(positionKey(p,[idx[i],idx[i+1],idx[i+2]]));return sha(keys.sort().join(''));}
const authoredPositionProof=[];const rn=nodes(raw);
for(const[region,n]of nodes(doc)){const a=n.getMesh().listPrimitives(),b=rn.get(region).getMesh().listPrimitives();if(a.length!==b.length)throw Error('Authored primitive population differs');for(let i=0;i<a.length;i++){const h=positionSignature(a[i]);if(h!==positionSignature(b[i]))throw Error('Input F32 positions/winding differ from actual raw: '+region+'/'+i);authoredPositionProof.push({region,primitive:i,positionTriangleMultisetSha256:h});}}
const sourceSets={};const binaries={};
for(const[region,r]of Object.entries(reference.regions)){const path=join(dirname(frozen.reference.path),r.binary),bytes=await readFile(path);if(sha(bytes)!==r.binarySha256||bytes.length!==r.hiddenTriangles*36)throw Error('Actual FACE binary changed');const map=new Map();for(let i=0;i<bytes.length;i+=36){const k=bytes.subarray(i,i+36).toString('hex');map.set(k,(map.get(k)??0)+1);}sourceSets[region]=map;binaries[region]={path:portablePath(path),sha256:r.binarySha256,triangles:r.hiddenTriangles};}
// Texture/material dedup can merge identical source tile materials under a new
// name. Authorization comes from exact FACE geometry plus the reserved marker,
// with a uniqueness gate that refuses coincident non-proof marker triangles.
for(const[region,node]of nodes(doc)){
 const candidates=new Map();
 for(const p of node.getMesh().listPrimitives()){const uv=p.getAttribute('TEXCOORD_1'),idx=p.getIndices().getArray();for(let i=0;i<idx.length;i+=3){const ids=[idx[i],idx[i+1],idx[i+2]];if(!ids.every(j=>{const v=uv.getElement(j,[0,0]);return v[0]===0&&v[1]===1;}))continue;const k=positionKey(p,ids,true);if(sourceSets[region].has(k))candidates.set(k,(candidates.get(k)??0)+1);}}
 for(const[k,n]of sourceSets[region])if(candidates.get(k)!==n)throw Error('FACE geometry is absent or ambiguous among reserved-marker triangles: '+region);
}
const removed={hall:0,court:0,gate:0},primitives=[],retained=[];let otherMarkers=0,prunedVertices=0,weldedVertices=0;
for(const[region,node]of nodes(doc))for(const p of node.getMesh().listPrimitives()){
 if(p.getMode()!==4||p.listTargets().length)throw Error('Only static indexed triangles');
 for(const semantic of ['POSITION','NORMAL','TEXCOORD_0','TEXCOORD_1','COLOR_0','COLOR_1'])if(!p.getAttribute(semantic))throw Error('Missing accepted attribute');
 const pos=p.getAttribute('POSITION'),uv=p.getAttribute('TEXCOORD_1'),old=p.getIndices(),idx=old.getArray(),keep=[],material=p.getMaterial()?.getName(),vertexBefore=pos.getCount();let count=0;
 for(let i=0;i<idx.length;i+=3){const ids=[idx[i],idx[i+1],idx[i+2]],marker=ids.every(j=>{const v=uv.getElement(j,[0,0]);return v[0]===0&&v[1]===1;});
  const k=marker?positionKey(p,ids,true):null,left=k?(sourceSets[region].get(k)??0):0;
  if(marker&&left){sourceSets[region].set(k,left-1);count++;removed[region]++;}
  else{keep.push(...ids);if(marker)otherMarkers++;}
 }
 p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new idx.constructor(keep)));if(old.listParents().length===1)old.dispose();
 const expected=primitiveHash(p);compactPrimitive(p);const vertexAfterPrune=p.getAttribute('POSITION').getCount();prunedVertices+=vertexBefore-vertexAfterPrune;weldPrimitive(p,{overwrite:true});const vertexAfterWeld=p.getAttribute('POSITION').getCount();weldedVertices+=vertexAfterPrune-vertexAfterWeld;
 if(primitiveHash(p)!==expected)throw Error('Retained attribute bytes/winding changed during exact prune/weld');retained.push({region,material,hash:expected});primitives.push({region,material,removedTriangles:count,retainedTriangles:keep.length/3,verticesBefore:vertexBefore,verticesAfterPrune:vertexAfterPrune,verticesAfterWeld:vertexAfterWeld});
}
for(const[region,set]of Object.entries(sourceSets)){if([...set.values()].some(n=>n)||removed[region]!==reference.regions[region].hiddenTriangles)throw Error('Actual FACE subset incomplete');}
await doc.transform(dedup());
// Codec-only QUANTIZE enum: no quantize() transform and no FILTER normal pass.
// FLOAT32 POSITION stays FLOAT32/NONE and is verified after decoding below.
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
const outputBytes=await io.writeBinary(doc),decoded=await io.readBinary(outputBytes),after=summary(outputBytes),jsonAfter=glbParts(outputBytes).json;
same(primitiveStates(decoded),retained,'Actual decoded retained triangle attribute bytes/winding');same(nodeState(decoded),nodeBefore,'Actual authored node state');same(sceneState(decoded),sceneBefore,'Actual source scene proof');same(imageSignature(outputBytes),imagesBefore,'Actual embedded image payloads');same(jsonAfter.materials,jsonBefore.materials,'Full material definitions');
for(const m of jsonAfter.meshes)for(const p of m.primitives){const a=jsonAfter.accessors[p.attributes.POSITION],view=jsonAfter.bufferViews[a.bufferView];if(a.componentType!==5126||a.normalized||view.extensions?.EXT_meshopt_compression?.filter&&view.extensions.EXT_meshopt_compression.filter!=='NONE')throw Error('Output F32 precision/filter changed');}
if(after.triangles!==before.triangles-Object.values(reference.regions).reduce((n,r)=>n+r.hiddenTriangles,0))throw Error('Unexpected retained triangle count');
for(const[k,v]of Object.entries(frozen))if(sha(await readFile(v.path))!==v.sha256)throw Error('Read-only input changed during build: '+k);
const profile={version:1,id:prior?.id??`snow-roof-mobile-float32-${inputs.source.sha256.slice(0,8)}-v2`,variant:'mobile-float32',inputs,faceReferenceBinaries:binaries,authoredPositionProof,sourceFaceSelection:'Exact prepared FACE triangle-position multiset + original region + reservedUV2 marker, with unique candidate population verified before mutation. Material names may deduplicate; marker alone never authorizes removal.',removedTrianglesByRegion:removed,preservedNonproofMarkerTriangles:otherMarkers,input:before,output:{...after,sha256:sha(outputBytes)},prunedVertices,weldedVertices,retainedTriangleHashes:retained,imagePayloadMultisetSha256:imagesBefore.sha256,encoding:{dependencies:tools.versions,writerMethod:'QUANTIZE codec-only',positionComponentType:5126,positionNormalized:false,positionFilter:'NONE',quantizationTransformsRun:0,normalFilterPassesAdded:0,imageConversions:0},invariants:{actualRawAuthoredWorldPositionsExact:true,fullF32InputPositionMultisetsAndCyclicWindingReverified:true,retainedAllAttributeTriangleBytesAndWindingExact:true,nodeTransformsExtrasHierarchyExact:true,sourceSceneProofExact:true,materialDefinitionsExact:true,embeddedImagesByteExact:true,allInputsByteUnchanged:true},primitives,generator:'scripts/prune-float32-baked.mjs',generatorSha256:sha(await readFile(fileURLToPath(import.meta.url))),adoption:'Separate art/build candidate only. Authored/bake geometry and public assets remain intact; runtime optical/performance review required.'};
if(prior){same(prior.inputs,profile.inputs,'Frozen explicit profile input bindings');same(prior.output,profile.output,'Frozen measured output');same(prior.retainedTriangleHashes,profile.retainedTriangleHashes,'Frozen retained attribute hashes');}
const receipt={...profile,output:{path:portablePath(output),...profile.output},profile:{path:portablePath(profilePath),operation:prior?'reproduce validated profile':'fresh measured genuine F32 profile'}};
await mkdir(dirname(output),{recursive:true});let written=false;
try{await writeFile(output,outputBytes,{flag:'wx'});written=true;await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});if(!prior){await mkdir(dirname(profilePath),{recursive:true});await writeFile(profilePath,JSON.stringify(profile,null,2)+'\n',{flag:'wx'});}}
catch(e){if(written){await unlink(output);if(await exists(receiptPath))await unlink(receiptPath);}throw e;}
console.log('FLOAT32_PRUNE_EXACT_WELD_PASS',JSON.stringify({output:portablePath(output),receipt:portablePath(receiptPath),profile:portablePath(profilePath),sha256:profile.output.sha256,input:before,final:after,removed,prunedVertices,weldedVertices,positionPrecision:'genuine authored FLOAT32 lossless',imagePayloadsByteExact:true}));
