// Deliver a baked Blender place as Meshopt glTF plus Basis UASTC/KTX2 textures.
// node scripts/pack-blender-assets.mjs --source art/build/snow-roof --out web/public/places/snow-roof
// Isolated candidates, run only after capture releases CPU timing:
//   --material-profile mobile --preview --out art/build/snow-roof-mobile
//   --lightmap-codec etc1s --lightmaps-only --lightmap-passes gate-night --out art/build/snow-roof-etc1s
// Mobile defaults: 512 px UASTC normals; ETC1S q255/c4 other maps; screen base kept at 1024 px.
// Use --screen-base-size 512 for a separate painted-screen resolution comparison.
import { spawn } from 'node:child_process';
import { access, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`Pack a frozen Blender place. No work runs for --help.
  --source DIR --out DIR --tools DIR --ktx DIR
  --preview                     Require real night/lamp; mark missing ambient looks.
  --material-profile quality    Original UASTC material profile and cache (default).
  --material-profile mobile     Separate 512 px UASTC normals / ETC1S other maps.
  --screen-base-size 1024|512    Retained screen base maximum (default 1024).
  --lightmap-codec uastc|etc1s   Separate lightmap codec cache (default UASTC).
  --geometry-only               Stage geometry/materials; write no manifest.
  --lightmaps-only              Stage available maps; write no manifest.
  --lightmap-passes gate-night   Comma-separated stage subset; requires --lightmaps-only.
  --max-bytes N                 Enforce complete payload budget; source budget is default.
  --reserve-bytes N             Reserve budget for later runtime framebuffer posters.
  --position-format float32     Preserve actual source FLOAT32 positions.
  --normal-format byte8|float32|snorm16
                                F32 normals are exact. SNORM16 audits decoded normal directions.
                                Both require --position-format float32.
Mobile/ETC1S candidates require a separate explicit output directory.
Run encoders only after capture releases CPU timing.`);
  process.exit(0);
}
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const source = resolve(option('--source', 'art/build/snow-roof'));
const out = resolve(option('--out', 'web/public/places/snow-roof'));
const materialProfile = option('--material-profile', 'quality');
const lightmapCodec = option('--lightmap-codec', 'uastc');
const requestedPositionFormat = option('--position-format', 'auto');
if(!['auto','uint16','float32'].includes(requestedPositionFormat))throw new Error('Expected --position-format auto|uint16|float32.');
const normalFormat=option('--normal-format','byte8');
if(!['byte8','float32','snorm16'].includes(normalFormat))throw new Error('Expected --normal-format byte8|float32|snorm16 (geometric NORMAL, independent of normal-map codec).');
const useUnfilteredNormals = normalFormat !== 'byte8';
const normalFilter = useUnfilteredNormals ? 'NONE' : 'OCTAHEDRAL-byte8';
const screenBasePattern = option('--screen-base-pattern', 'chinese_screen_panels_diff_1k');
const screenBaseSize = Number(option('--screen-base-size', '1024'));
const lightmapSelection = option('--lightmap-passes', '').split(',').filter(Boolean);
if (!['quality', 'mobile'].includes(materialProfile)) throw new Error('Expected --material-profile quality|mobile.');
if (!['uastc', 'etc1s'].includes(lightmapCodec)) throw new Error('Expected --lightmap-codec uastc|etc1s.');
if (![512, 1024].includes(screenBaseSize)) throw new Error('Expected --screen-base-size 512|1024.');
if ((materialProfile !== 'quality' || lightmapCodec !== 'uastc') && (!args.includes('--out') || out === resolve('web/public/places/snow-roof'))) throw new Error('Compression candidates require an explicit separate --out; the live quality preview must remain intact.');
if (lightmapSelection.length && !args.includes('--lightmaps-only')) throw new Error('--lightmap-passes is a staging comparison option and requires --lightmaps-only.');
const toolsPrefix = resolve(option('--tools', join(tmpdir(), 'one-light-gltf-tools')));
const ktxPrefix = resolve(option('--ktx', join(tmpdir(), 'one-light-ktx-tools')));
const cli = join(toolsPrefix, 'node_modules/.bin/gltf-transform');
const run = (command, parameters, extra = {}) => new Promise((accept, reject) => {
  console.log(command, ...parameters);
  const process = spawn(command, parameters, { stdio: 'inherit', ...extra });
  process.on('error', reject); process.on('exit', code => code === 0 ? accept() : reject(new Error(`${command} exited ${code}`)));
});
const exists = async path => access(path).then(() => true, () => false);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
if (args.includes('--unwrap')) {
  const index = args.indexOf('--unwrap');
  const inputBytes = await readFile(args[index + 1]);
  const input = JSON.parse(inputBytes);
  const output = args[index + 2];
  const resolution = Number(option('--resolution', '1024'));
  const unwrapSignature = digest(Buffer.concat([inputBytes, Buffer.from(`xatlas-topology-v3-chartids;resolution=${resolution};padding=8;iterations=2`)]));
  const externalCache = option('--unwrap-cache', null);
  const candidates = [output, ...(externalCache ? [join(resolve(externalCache), basename(output))] : [])];
  for (const cachePath of candidates) if (await exists(cachePath)) {
    const cached = JSON.parse(await readFile(cachePath, 'utf8'));
    if (cached.report?.unwrapSignature === unwrapSignature) {
      if (resolve(cachePath) !== resolve(output)) {
        cached.report.reusedFrom = resolve(cachePath);
        await writeFile(output, JSON.stringify(cached));
        await writeFile(output + '.report.json', JSON.stringify(cached.report));
      }
      console.log('XATLAS_REUSED', cachePath, unwrapSignature);
      process.exit(0);
    }
  }
  const watlasPath = join(toolsPrefix, 'node_modules/watlas/dist/watlas.js');
  if (!(await exists(watlasPath))) await run('npm', ['install', '--prefix', toolsPrefix, 'watlas@1.0.1']);
  const watlas = await import(pathToFileURL(watlasPath).href);
  await watlas.Initialize();
  const atlas = new watlas.Atlas();
  let positions = new Float32Array(input.positions), indices = new Uint32Array(input.indices);
  const originalIndices = indices, originalPositions = positions;
  let weldedIndex = null;
  let sourceReferences = input.sourceVertexReferences, vertexUvs = input.vertexUvs ? new Float32Array(input.vertexUvs) : null;
  if (vertexUvs && sourceReferences) {
    const bits = new Uint32Array(vertexUvs.buffer), unique = [], uvs = [], references = [], lookup = new Map(), remap = new Uint32Array(sourceReferences.length);
    for (let i = 0; i < sourceReferences.length; i++) {
      const key = `${sourceReferences[i]}/${bits[i*2]}/${bits[i*2+1]}`;
      let id = lookup.get(key);
      if (id === undefined) { id = references.length; lookup.set(key,id); unique.push(...positions.subarray(i*3,i*3+3));uvs.push(...vertexUvs.subarray(i*2,i*2+2));references.push(sourceReferences[i]); }
      remap[i]=id;
    }
    positions = new Float32Array(unique);vertexUvs = new Float32Array(uvs);indices = Uint32Array.from(indices,index=>remap[index]);sourceReferences = references;
  }
  if (input.weldExactPositions) {
    const bits = new Uint32Array(positions.buffer), lookup = new Map(), unique = [];
    weldedIndex = new Uint32Array(positions.length / 3);
    for (let i = 0; i < weldedIndex.length; i++) {
      const key = `${bits[i*3]}/${bits[i*3+1]}/${bits[i*3+2]}`;
      let id = lookup.get(key);
      if (id === undefined) { id = unique.length / 3; lookup.set(key,id); unique.push(...positions.subarray(i*3,i*3+3)); }
      weldedIndex[i] = id;
    }
    positions = new Float32Array(unique);
    indices = Uint32Array.from(originalIndices, index => weldedIndex[index]);
    console.log('UV2_EXACT_POSITION_TOPOLOGY_WELD', originalPositions.length/3, positions.length/3, 'Actual source geometry/UV0 are not changed.');
  }
  if(input.packAuthoredCharts) {
    if(!vertexUvs)throw new Error('Authored chart packing requires source corner UVs.');
    atlas.addUvMesh({vertexUvData:vertexUvs,vertexCount:positions.length/3,vertexStride:8,indexData:indices,indexCount:indices.length,faceMaterialData:new Uint32Array(input.faceOwners)});
  } else atlas.addMesh({ vertexPositionData: positions, vertexCount: positions.length / 3, vertexPositionStride: 12, indexData: indices, indexCount: indices.length, epsilon: .00001, ...(vertexUvs ? { vertexUvData: vertexUvs, vertexUvStride: 8 } : {}) });
  const began = performance.now();
  const packOptions = { resolution, padding: 8, bilinear: true, blockAlign: true, rotateCharts: true };
  const chartOptions = { normalSeamWeight: 0, textureSeamWeight: 0, useInputMeshUvs: false, maxIterations: 2, ...(input.chartOptions ?? {}) };
  atlas.generate(chartOptions, packOptions);
  const attempts = [];
  // xatlas estimates density from surface area before padding. With thousands of
  // small charts that estimate can produce an atlas much larger than resolution.
  // Explicit density makes resolution a hard bound. Lower density is recorded,
  // and Blender audits the resulting real chart cores before any bake is allowed.
  for (let attempt = 0; attempt < 10; attempt++) {
    attempts.push({ width: atlas.width, height: atlas.height, atlasCount: atlas.atlasCount, texelsPerUnit: atlas.texelsPerUnit });
    console.log('XATLAS_PACK_ATTEMPT', attempts.at(-1));
    if (atlas.atlasCount === 1 && atlas.width <= resolution && atlas.height <= resolution) break;
    const occupiedScale = Math.max(atlas.width / resolution, atlas.height / resolution, Math.sqrt(atlas.atlasCount));
    const texelsPerUnit = atlas.texelsPerUnit / occupiedScale * .85;
    atlas.packCharts({ ...packOptions, texelsPerUnit });
  }
  const mesh = atlas.getMesh(0), result = new Uint32Array(mesh.indexCount); mesh.getIndexArray(result);
  console.log('XATLAS_PACK_DIAGNOSTIC', { width: atlas.width, height: atlas.height, charts: atlas.chartCount, atlasCount: atlas.atlasCount, texelsPerUnit: atlas.texelsPerUnit });
  await writeFile(output + '.report.json', JSON.stringify({ width: atlas.width, height: atlas.height, charts: atlas.chartCount, atlasCount: atlas.atlasCount, texelsPerUnit: atlas.texelsPerUnit, attempts }));
  if (atlas.atlasCount !== 1 || atlas.width > resolution || atlas.height > resolution) throw new Error(`xatlas requires ${atlas.atlasCount} atlases at ${atlas.width}x${atlas.height}; raise this region's resolution.`);
  const vertices = [];
  for (let i = 0; i < mesh.vertexCount; i++) { const v = mesh.getVertex(i); vertices.push([v.xref, v.uv[0] / resolution, v.uv[1] / resolution, v.chartIndex]); }
  let deliveredVertices = vertices, deliveredIndices = [...result];
  if(input.packAuthoredCharts) {
    const chartByFace = new Int32Array(indices.length/3).fill(-1);
    for(let ci=0;ci<mesh.chartCount;ci++){
      const chart=mesh.getChart(ci),faces=new Uint32Array(chart.faceCount);chart.getFaceArray(faces);
      for(const face of faces){if(chartByFace[face]!==-1)throw new Error('Authored source triangle belongs to multiple charts.');chartByFace[face]=ci;}
    }
    if(chartByFace.some(chart=>chart<0))throw new Error('Authored source triangle lacks a packed chart.');
    const pending=new Map();
    for(let i=0;i<indices.length;i+=3){const key=[...indices.subarray(i,i+3)].sort((a,b)=>a-b).join('/'),queue=pending.get(key)??[];queue.push(i/3);pending.set(key,queue);}
    deliveredVertices=[];deliveredIndices=[];
    for(let i=0;i<result.length;i+=3){
      const corners=[...result.subarray(i,i+3)].map(index=>vertices[index]),key=corners.map(c=>c[0]).sort((a,b)=>a-b).join('/');
      const queue=pending.get(key);if(!queue?.length)throw new Error('Packed authored chart triangle correspondence lost.');const chart=chartByFace[queue.pop()];
      for(const corner of corners){deliveredIndices.push(deliveredVertices.length);deliveredVertices.push([...corner.slice(0,3),chart]);}
    }
    if([...pending.values()].some(queue=>queue.length))throw new Error('Packed authored chart omitted triangles.');
  }
  if (weldedIndex) {
    const pending = new Map();
    for (let i = 0; i < originalIndices.length; i += 3) {
      const original = [...originalIndices.subarray(i,i+3)];
      const key = original.map(index=>weldedIndex[index]).sort((a,b)=>a-b).join('/');
      const queue = pending.get(key) ?? []; queue.push(original); pending.set(key,queue);
    }
    deliveredVertices = []; deliveredIndices = [];
    for (let i = 0; i < result.length; i += 3) {
      const corners = [...result.subarray(i,i+3)].map(index=>vertices[index]);
      const key = corners.map(c=>c[0]).sort((a,b)=>a-b).join('/');
      const queue=pending.get(key); if(!queue?.length)throw new Error('Exact topology weld lost a source triangle.');
      const sourceCorners=queue.pop(), unused=new Set([0,1,2]);
      for(const corner of corners){
        const slot=[...unused].find(j=>weldedIndex[sourceCorners[j]]===corner[0]);
        if(slot===undefined)throw new Error('Exact topology weld lost triangle-corner ownership.');
        unused.delete(slot);deliveredIndices.push(deliveredVertices.length);deliveredVertices.push([sourceCorners[slot],...corner.slice(1)]);
      }
    }
    if([...pending.values()].some(queue=>queue.length))throw new Error('Exact topology weld omitted source triangles.');
  }
  if (sourceReferences) deliveredVertices = deliveredVertices.map(vertex => [sourceReferences[vertex[0]], ...vertex.slice(1)]);
  const report = { width: atlas.width, height: atlas.height, atlasCount: atlas.atlasCount, chartCount: atlas.chartCount, texelsPerUnit: atlas.texelsPerUnit, seconds: (performance.now() - began) / 1000, padding: 8, resolution, attempts, unwrapSignature, sourceVertexCount: positions.length / 3, outputVertexCount: vertices.length };
  report.topologyOnlyExactPositionWeld = input.weldExactPositions ? { originalVertices: originalPositions.length/3, uniqueVertices: positions.length/3, preservedSourceTriangleCorners: originalIndices.length } : false;
  report.chartOptions = chartOptions;
  report.authoredChartPacking = !!input.packAuthoredCharts;
  await writeFile(output, JSON.stringify({ vertices: deliveredVertices, indices: deliveredIndices, report }));
  console.log('XATLAS_UV', report);
  atlas.delete();
  process.exit(0);
}
await mkdir(source, { recursive: true }); await mkdir(out, { recursive: true });
if (!(await exists(cli))) await run('npm', ['install', '--prefix', toolsPrefix, '@gltf-transform/cli@4.5.1']);
const toktx = process.env.TOKTX || join(ktxPrefix, 'KTX-Software-4.4.2-Darwin-arm64-tools.pkg/Payload/usr/local/bin/toktx');
if (!(await exists(toktx))) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Install KTX-Software 4.4.2 and set TOKTX to its toktx binary.');
  const url = 'https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.2/KTX-Software-4.4.2-Darwin-arm64.pkg';
  const pkg = join(tmpdir(), 'one-light-ktx.pkg');
  await run('curl', ['--fail', '--location', '--silent', '--show-error', url, '-o', pkg]);
  await run('pkgutil', ['--expand-full', pkg, ktxPrefix]);
  // Keep the released executable's relative rpath intact without a system-wide install.
  const lib = join(dirname(dirname(toktx)), 'lib'); await mkdir(lib, { recursive: true });
  const extracted = join(ktxPrefix, 'KTX-Software-4.4.2-Darwin-arm64-library.pkg/Payload/usr/local/lib');
  for (const name of await readdir(extracted)) if (name.startsWith('libktx') && name.endsWith('.dylib')) await copyFile(join(extracted, name), join(lib, name));
}
const env = { ...process.env, PATH: `${dirname(toktx)}:${process.env.PATH}` };
const gltf = async (...parameters) => run(cli, parameters, { env });
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
const placeId = manifest.place ?? 'snow-roof';
const positionFormat = requestedPositionFormat === 'auto' ? (manifest.bake?.fixedViewAllocationProof || placeId === 'cloud-cliff' ? 'float32' : 'uint16') : requestedPositionFormat;
if(useUnfilteredNormals&&positionFormat!=='float32')throw new Error(`--normal-format ${normalFormat} requires --position-format float32.`);
if(manifest.bake?.fixedViewAllocationProof&&positionFormat!=='float32')throw new Error('Fixed-view exclusion cones require the actual lossless FLOAT32 positions; quantized delivery needs a separately proved error envelope.');
const sceneName = manifest.scene ?? `${placeId}.glb`;
const stem = sceneName.replace(/\.glb$/, '');
if (!/^[a-z0-9][a-z0-9-]*$/.test(stem)) throw new Error('Invalid source output basename.');
const raw = join(source, manifest.sourceScene ?? `${stem}.raw.glb`);
function auditSnorm16(sourceArrays, decodedPrimitives) {
  const limitDegrees = .01;
  let count = 0;
  let maxDegrees = 0;
  if (sourceArrays.length !== decodedPrimitives.length) throw new Error('SNORM16 changed NORMAL stream coverage.');
  for (const [index, source] of sourceArrays.entries()) {
    const accessor = decodedPrimitives[index].getAttribute('NORMAL');
    const packed = accessor?.getArray();
    if (!(packed instanceof Int16Array) || !accessor.getNormalized() || packed.length !== source.length) {
      throw new Error(`Expected a decoded normalized SHORT NORMAL stream at primitive ${index}.`);
    }
    for (let i = 0; i < source.length; i += 3) {
      const x = source[i], y = source[i + 1], z = source[i + 2];
      // Signed normalized SHORT clamps the most negative code. The common
      // 32767 divisor cancels from atan2(cross, dot).
      const a = Math.max(-32767, packed[i]), b = Math.max(-32767, packed[i + 1]), c = Math.max(-32767, packed[i + 2]);
      const dot = x * a + y * b + z * c;
      const cross = Math.hypot(y * c - z * b, z * a - x * c, x * b - y * a);
      if (!Number.isFinite(dot) || !Number.isFinite(cross) || (cross === 0 && dot === 0)) {
        throw new Error(`Cannot audit a zero or non-finite NORMAL at primitive ${index}, vertex ${i / 3}.`);
      }
      maxDegrees = Math.max(maxDegrees, Math.atan2(cross, dot) * 180 / Math.PI);
      count++;
    }
  }
  if (count === 0 || maxDegrees > limitDegrees) {
    throw new Error(`Decoded SNORM16 angular error ${maxDegrees}° exceeds ${limitDegrees}° or has no samples.`);
  }
  return { count, maxDegrees, limitDegrees };
}

async function meshoptFloatPositions(input, output) {
  const modules=[];
  for(const name of ['@gltf-transform/core','@gltf-transform/extensions','@gltf-transform/functions','meshoptimizer']){
    const folder=join(toolsPrefix,'node_modules',name),metadata=JSON.parse(await readFile(join(folder,'package.json'),'utf8'));
    modules.push(await import(pathToFileURL(join(folder,metadata.module??metadata.main)).href));
  }
  const [{NodeIO},{ALL_EXTENSIONS,EXTMeshoptCompression},{reorder,quantize},{MeshoptEncoder,MeshoptDecoder}]=modules;
  await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder}),doc=await io.read(input);
  const positions=document=>document.getRoot().listMeshes().flatMap(mesh=>mesh.listPrimitives().map(primitive=>{
    const accessor=primitive.getAttribute('POSITION'),array=accessor.getArray();
    if(accessor.getComponentType()!==5126||accessor.getNormalized()||!(array instanceof Float32Array))throw new Error('Actual pre-Meshopt FLOAT32 POSITION input required.');
    return digest(Buffer.from(array.buffer,array.byteOffset,array.byteLength));
  }));
  const primitives=document=>document.getRoot().listMeshes().flatMap(mesh=>mesh.listPrimitives());
  const normalArrays=document=>primitives(document).map(primitive=>{
    const accessor=primitive.getAttribute('NORMAL'),array=accessor?.getArray();
    if(accessor?.getComponentType()!==5126||accessor.getNormalized()||!(array instanceof Float32Array))throw new Error('Actual unquantized pre-Meshopt FLOAT32 NORMAL input required; decoded BYTE/SHORT is never precision restoration.');
    return array;
  });
  const normals=document=>normalArrays(document).map(array=>digest(Buffer.from(array.buffer,array.byteOffset,array.byteLength)));
  const preserveNormals = normalFormat === 'float32';
  const quantizeNormals = normalFormat === 'snorm16';
  if(useUnfilteredNormals)normalArrays(doc);
  const ownership=document=>JSON.stringify(document.getRoot().listNodes().map(node=>({name:node.getName(),matrix:node.getMatrix(),extras:node.getExtras(),children:node.listChildren().map(child=>child.getName())})));
  const originalOwnership=ownership(doc),images=document=>document.getRoot().listTextures().map(texture=>digest(texture.getImage()));
  const originalImages=images(doc);
  await doc.transform(reorder({encoder:MeshoptEncoder,target:'size'}));const before=positions(doc),normalBefore=preserveNormals?normals(doc):null;
  const sourceNormals = quantizeNormals ? normalArrays(doc).map(array=>array.slice()) : null;
  const pattern = quantizeNormals ? /^(TEXCOORD|JOINTS|WEIGHTS|COLOR|NORMAL)(_\d+)?$/ : /^(TEXCOORD|JOINTS|WEIGHTS|COLOR)(_\d+)?$/;
  await doc.transform(quantize({pattern,patternTargets:/^(TEXCOORD|JOINTS|WEIGHTS|COLOR|NORMAL|TANGENT)(_\d+)?$/,quantizeTexcoord:16,quantizeColor:8,quantizeWeight:8,quantizeGeneric:12,
    ...(quantizeNormals ? { quantizeNormal:16 } : {})}));
  if(JSON.stringify(before)!==JSON.stringify(positions(doc)))throw new Error('Nonposition quantization changed authored positions.');
  if(preserveNormals&&JSON.stringify(normalBefore)!==JSON.stringify(normals(doc)))throw new Error('UV/color quantization changed actual F32 normals.');
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:useUnfilteredNormals?EXTMeshoptCompression.EncoderMethod.QUANTIZE:EXTMeshoptCompression.EncoderMethod.FILTER});
  const bytes=await io.writeBinary(doc),decoded=await io.readBinary(bytes);
  if(JSON.stringify(before)!==JSON.stringify(positions(decoded)))throw new Error('Lossless FLOAT32 Meshopt roundtrip changed positions.');
  if(preserveNormals&&JSON.stringify(normalBefore)!==JSON.stringify(normals(decoded)))throw new Error('Lossless FLOAT32 Meshopt roundtrip changed normals.');
  if(ownership(decoded)!==originalOwnership||JSON.stringify(images(decoded))!==JSON.stringify(originalImages))throw new Error('FLOAT32 Meshopt changed actual node transforms/ownership or material image payloads.');
  const normalAudit = sourceNormals ? auditSnorm16(sourceNormals, primitives(decoded)) : undefined;
  await writeFile(output,bytes);
  return normalAudit;
}
function glbJSON(data) { if (data.readUInt32LE(0) !== 0x46546c67) throw new Error('Not glTF binary'); const length = data.readUInt32LE(12); return JSON.parse(data.subarray(20, 20 + length).toString()); }
function materialParameters(data){
  const json=glbJSON(data);
  const clean=(value,path='')=>{
    if(Array.isArray(value))return value.map(child=>clean(child,path));
    if(!value||typeof value!=='object')return value;
    return Object.fromEntries(Object.keys(value).sort().filter(key=>key!=='name'&&!(key==='index'&&/Texture$/.test(path))).map(key=>[key,clean(value[key],key)]));
  };
  return json.meshes.flatMap(mesh=>mesh.primitives.map(primitive=>clean(json.materials?.[primitive.material]??{})));
}
function verifyUV(data, lightmapRequired = true) {
  const json = glbJSON(data); const missing = [];
  for (const [index, mesh] of (json.meshes || []).entries()) for (const primitive of mesh.primitives) if (primitive.attributes.TEXCOORD_0 === undefined || lightmapRequired && primitive.attributes.TEXCOORD_1 === undefined) missing.push(index);
  if (missing.length) throw new Error(`Material or lightmap UV set missing from primitives: ${missing.join(', ')}`);
  return { meshes: json.meshes.length, primitives: json.meshes.reduce((n, mesh) => n + mesh.primitives.length, 0), colourPrimitives: json.meshes.reduce((n, mesh) => n + mesh.primitives.filter(primitive => primitive.attributes.COLOR_0 !== undefined).length, 0), sceneExtras: (json.scenes || []).map(scene => ({name: scene.name, extras: scene.extras || {}})), regions: [...new Set((json.nodes || []).map(node => node.extras?.lightmap_region).filter(Boolean))].sort(), roughnessClamps: (json.materials || []).filter(material => material.extras?.one_light_min_roughness !== undefined).map(material => ({ name: material.name, minimum: material.extras.one_light_min_roughness })), primitiveRoughness: json.meshes.flatMap((mesh, meshIndex) => mesh.primitives.map((primitive, index) => ({ key: `${meshIndex}/${index}`, material: json.materials?.[primitive.material]?.name ?? null, minimum: json.materials?.[primitive.material]?.extras?.one_light_min_roughness ?? null }))), extensions: json.extensionsUsed || [] };
}
function verifyPreserved(rawInfo, packedInfo) {
  if (JSON.stringify(packedInfo.sceneExtras) !== JSON.stringify(rawInfo.sceneExtras)) throw new Error('Compression changed actual source scene extras, including fixture/wick/smoke anchors.');
  if (JSON.stringify(packedInfo.regions) !== JSON.stringify(rawInfo.regions)) throw new Error('Compression lost lightmap region metadata.');
  if (packedInfo.primitives !== rawInfo.primitives || packedInfo.colourPrimitives !== rawInfo.colourPrimitives) throw new Error('Compression changed primitive or COLOR_0 coverage.');
  for (const sourcePrimitive of rawInfo.primitiveRoughness) {
    const after = packedInfo.primitiveRoughness.find(primitive => primitive.key === sourcePrimitive.key);
    if (!after || after.minimum !== sourcePrimitive.minimum) throw new Error(`Compression changed the roughness constraint on primitive ${sourcePrimitive.key} (${sourcePrimitive.material}).`);
  }
}
function verifyMaterialValues(before,after){if(JSON.stringify(materialParameters(before))!==JSON.stringify(materialParameters(after)))throw new Error('Compression changed actual material factors/extensions/texture-coordinate settings.');}
function imageReport(data) {
  const json = glbJSON(data), bin = 28 + data.readUInt32LE(12);
  const uses = new Map();
  function visit(value, material, path = '') {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const slot = path ? `${path}.${key}` : key;
      if (key.endsWith('Texture') && Number.isInteger(child?.index)) {
        const texture = json.textures[child.index];
        const image = texture.extensions?.KHR_texture_basisu?.source ?? texture.extensions?.EXT_texture_webp?.source ?? texture.extensions?.EXT_texture_avif?.source ?? texture.source;
        const entries = uses.get(image) ?? [];
        entries.push({ material, slot, texture: child.index }); uses.set(image, entries);
      } else visit(child, material, slot);
    }
  }
  for (const [index, material] of (json.materials ?? []).entries()) visit(material, material.name ?? String(index));
  return (json.images ?? []).map((image, index) => {
    if (image.bufferView === undefined) throw new Error('Role/byte reporting requires embedded image payloads.');
    const view = json.bufferViews[image.bufferView], offset = bin + (view.byteOffset ?? 0);
    const payload = data.subarray(offset, offset + view.byteLength), references = uses.get(index) ?? [];
    const roles = [...new Set(references.map(use => use.slot.split('.').at(-1)))].sort();
    let width = null, height = null, mipLevels = null, transfer = null, codec = image.mimeType;
    if (image.mimeType === 'image/ktx2') {
      width = payload.readUInt32LE(20); height = payload.readUInt32LE(24);
      const dfd = payload.readUInt32LE(48), model = payload[dfd + 12];
      codec = model === 166 ? 'UASTC' : model === 163 ? 'ETC1S' : `KTX2-model-${model}`;
      mipLevels = payload.readUInt32LE(40); transfer = payload[dfd + 14] === 1 ? 'linear' : payload[dfd + 14] === 2 ? 'sRGB' : `transfer-${payload[dfd + 14]}`;
    }
    return { image: index, name: image.name ?? '', roles, references, width, height, mipLevels, transfer, codec, bytes: view.byteLength, sha256: digest(payload) };
  });
}
function materialAttributeDigest(data, extraSemantics=[]) {
  const json = glbJSON(data), bin = 28 + data.readUInt32LE(12), result = [];
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }, sizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  for (const [meshIndex, mesh] of json.meshes.entries()) for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
    const attributes = {};
    for (const semantic of ['TEXCOORD_0', 'TEXCOORD_1', 'COLOR_0',...extraSemantics]) {
      const index = primitive.attributes[semantic];
      if (index === undefined) { attributes[semantic] = null; continue; }
      const accessor = json.accessors[index], view = json.bufferViews[accessor.bufferView];
      if (accessor.sparse || view.extensions?.EXT_meshopt_compression) throw new Error('Pre-Meshopt attribute proof requires ordinary dense accessors.');
      const row = components[accessor.type] * sizes[accessor.componentType], stride = view.byteStride ?? row;
      const offset = bin + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0), hash = createHash('sha256');
      hash.update(JSON.stringify([accessor.componentType, accessor.type, accessor.normalized ?? false, accessor.count]));
      if (stride === row) hash.update(data.subarray(offset, offset + row * accessor.count));
      else for (let i = 0; i < accessor.count; i++) hash.update(data.subarray(offset + i * stride, offset + i * stride + row));
      attributes[semantic] = hash.digest('hex');
    }
    result.push({ mesh: mesh.name ?? meshIndex, primitive: primitiveIndex, attributes });
  }
  return digest(Buffer.from(JSON.stringify(result)));
}
function verifyMobileImages(images) {
  for (const image of images) {
    const normal = image.roles.some(role => /normalTexture$/i.test(role));
    if (normal && image.roles.some(role => !/normalTexture$/i.test(role))) throw new Error(`Mixed normal/colour roles require separate source images: ${image.name}`);
    const retainedScreen = image.name === screenBasePattern && image.roles.includes('baseColorTexture');
    const retainedCrown = pineCrownBaseImages.includes(image.name) && image.roles.includes("baseColorTexture");
    const maximum = retainedCrown ? 1024 : retainedScreen ? screenBaseSize : 512, expected = normal ? 'UASTC' : 'ETC1S';
    if (image.codec !== expected || image.width > maximum || image.height > maximum) throw new Error(`Mobile material profile mismatch: ${image.name} (${image.roles.join(', ')}) expected ${expected} at most ${maximum}px.`);
    const colour = image.roles.some(role => /^(baseColorTexture|emissiveTexture)$/.test(role));
    if (image.transfer !== (colour ? 'sRGB' : 'linear')) throw new Error(`Mobile material transfer mismatch: ${image.name}.`);
  }
}
const rawData = await readFile(raw), rawInfo = verifyUV(rawData); console.log('RAW_UV_INFO', rawInfo);
const sourceImageRoles = imageReport(rawData);
const pineCrownBaseImages = placeId === 'pine-gate' && materialProfile === 'mobile'
  ? sourceImageRoles.filter(image => /^(?:ridge|young)-[+-]\d{2,3}$/.test(image.name)
    && image.references.every(use => use.material.startsWith('Depth-reconstructed pine crown '))
    && image.roles.includes('baseColorTexture')).map(image => image.name) : [];
const sourceHasRetainedScreen = sourceImageRoles.some(image=>image.name===screenBasePattern&&image.roles.includes('baseColorTexture'));
const needsRasterNormalization = glbJSON(rawData).images?.some(image=>image.mimeType==='image/webp');
async function normalizeRasterInputs(input,output){
  const load=async name=>{const folder=join(toolsPrefix,'node_modules',name),metadata=JSON.parse(await readFile(join(folder,'package.json'),'utf8'));return import(pathToFileURL(join(folder,metadata.module??metadata.main)).href);};
  const [{NodeIO},{ALL_EXTENSIONS},sharpModule]=await Promise.all([load('@gltf-transform/core'),load('@gltf-transform/extensions'),load('sharp')]);
  const sharp=sharpModule.default,io=new NodeIO().registerExtensions(ALL_EXTENSIONS),document=await io.read(input),conversions=[];
  for(const texture of document.getRoot().listTextures())if(texture.getMimeType()==='image/webp'){
    const original=texture.getImage(),pixels=await sharp(original).ensureAlpha().raw().toBuffer(),png=await sharp(original).png().toBuffer();
    const decoded=await sharp(png).ensureAlpha().raw().toBuffer();
    if(!pixels.equals(decoded))throw new Error('Lossless WebP input normalization changed decoded pixels.');
    conversions.push({name:texture.getName(),sourceMime:'image/webp',sourceSha256:digest(original),pngSha256:digest(png),decodedRGBASha256:digest(pixels),decodedPixelsBitExact:true});
    texture.setImage(new Uint8Array(png)).setMimeType('image/png');
  }
  document.getRoot().listExtensionsUsed().find(extension=>extension.extensionName==='EXT_texture_webp')?.dispose();
  await io.write(output,document);return conversions;
}
const materialRecipe = {
  profile: materialProfile, sourceRawGLB: basename(raw), sourceRawGLBSha256: digest(rawData), originalPixelInput: true,
  gltfTransform: '4.5.1', ktxSoftware: '4.4.2', metadataSource: 'Actual GLB material/image bindings and embedded KTX2 DFD/header; codec and dimensions are not inferred from filenames.',
  ...(materialProfile === 'mobile' ? { normals: { codec: 'UASTC', maximumSize: 512, quality: 2, rdo: false, slotPattern: '*normal*', retainedAsNormalData: true }, otherMaps: { codec: 'ETC1S', maximumSize: 512, quality: 255, compression: 4, endpointRdo: false, selectorRdo: false }, screenBase: { sourceImageName: screenBasePattern, maximumSize: screenBaseSize, codec: 'ETC1S' } } : { textureCLI: ['uastc', '--level', '2', '--rdo', '2', '--zstd', '18', '--jobs', '2'] }),
};
if(materialProfile==='mobile'&&!sourceHasRetainedScreen)materialRecipe.screenBase={retained:false,reason:'No matching screen-base image is used by this source.'};
if (pineCrownBaseImages.length) materialRecipe.pineCrownBase = {
  sourceImageNames: pineCrownBaseImages, maximumSize: 1024, codec: 'ETC1S',
};
if(manifest.bake?.cameraPreExposure!==undefined){
 const exposure=manifest.bake.cameraPreExposure;
 if(!Number.isFinite(exposure)||exposure<=0||Math.abs(manifest.bake.threeLightMapIrradianceMultiplier-Math.PI*exposure)>1e-10)throw Error('Source camera normalization and irradiance units disagree');
 if(manifest.bake.lampPassQuantity==='indirect-diffuse-radiance-per-unit-albedo'){
  if(JSON.stringify(manifest.bake.passesByLook?.lamp)!==JSON.stringify(['INDIRECT']))throw Error('Lamp indirect quantity requires the actual INDIRECT bake recipe');
  for(const maps of Object.values(manifest.lightmaps))if(maps.lamp&&(JSON.stringify(maps.lamp.passFilter)!==JSON.stringify(['INDIRECT'])||maps.lamp.quantity!==manifest.bake.lampPassQuantity||maps.lamp.cameraPreExposure!==exposure))throw Error('Actual lamp map provenance disagrees with its runtime quantity');
 }
}
const availableLightmaps = new Set(Object.values(manifest.lightmaps).flatMap(passes => Object.values(passes).map(entry => entry.uri.replace(/\.ktx2$/, ''))));
for (const name of lightmapSelection) if (!availableLightmaps.has(name)) throw new Error(`Unknown completed lightmap: ${name}`);
const preview = args.includes('--preview');
const geometryOnly = args.includes('--geometry-only');
const lightmapsOnly = args.includes('--lightmaps-only');
const missing = [];
for (const region of rawInfo.regions) for (const pass of ['night', 'dusk', 'day', 'lamp']) {
  if (!manifest.lightmaps[region]?.[pass]) {
    missing.push({ region, pass });
    if (!geometryOnly && !lightmapsOnly && (!preview || pass === 'night' || pass === 'lamp')) throw new Error(`Incomplete bake: ${region}/${pass} is missing. Final delivery requires every pass; --preview still requires real night and lamp maps for every region.`);
  }
}
if (!preview && !geometryOnly && !lightmapsOnly) {
  if (!manifest.bakeFingerprint || !manifest.bake?.sourceBlendSha256 || !manifest.bake?.preparedPreviewAudit) throw new Error('Final packing requires source-bound bake identity and reviewed prepared-mapping evidence.');
  for (const [region, maps] of Object.entries(manifest.lightmaps)) for (const [pass, entry] of Object.entries(maps)) {
    if (entry.bakeFingerprint !== manifest.bakeFingerprint || entry.samples < manifest.bake.samples || entry.bakeDevice !== 'METAL' || entry.denoiseDevice !== 'METAL') throw new Error(`Final map provenance mismatch: ${region}/${pass}.`);
  }
}
if (preview) {
  manifest.partialPreview = true;
  manifest.missingAmbientLooks = [...new Set(missing.map(entry => entry.pass))];
  manifest.missingLightmaps = missing;
  console.log('PARTIAL_PREVIEW', manifest.missingAmbientLooks, 'Night and lamp are real bakes; missing ambient looks remain absent.');
} else {
  delete manifest.partialPreview; delete manifest.missingAmbientLooks; delete manifest.missingLightmaps;
}
const normalProfileTag = normalFormat === 'snorm16' ? '.vertex-normal-snorm16' : normalFormat === 'float32' ? '.vertex-normal-f32' : '';
const normalCacheKey = normalFormat === 'snorm16' ? 'audited-snorm16-normal-NONE-v1:' : normalFormat === 'float32' ? 'genuine-float32-normal-NONE-v1:' : '';
const profileTag = (materialProfile === 'quality' ? '' : '.mobile') + normalProfileTag;
const deduplicated = join(source, `${stem}${profileTag}.deduplicated.glb`);
const textured = join(source, `${stem}${profileTag}.textures.glb`);
const geometryCache = join(source, `${stem}${profileTag}.packed.glb`);
const geometryReceipt = join(source, `geometry-stage${profileTag}.json`);
const geometryKey = materialProfile === 'quality'
  ? `dedup-uastc2-rdo2-zstd18-meshopt16-16-12-v1:${digest(rawData)}`
  : `mobile-v1-normal512-uastc2-colour512-etc1s255c4-screen${screenBaseSize}-${screenBasePattern}-meshopt16-16-12:${digest(rawData)}`;
const pineCrownKey = pineCrownBaseImages.length ? `pine-crown-base1024-${pineCrownBaseImages.join(',')}:` : '';
const actualGeometryKey = `${pineCrownKey}${normalCacheKey}${needsRasterNormalization?'webp-to-lossless-png-v1:':''}${positionFormat === 'float32' ? 'float32-position-NONE-v1:' : ''}${geometryKey}`;
let cached = false;
if (await exists(geometryReceipt) && await exists(geometryCache)) {
  const receipt = JSON.parse(await readFile(geometryReceipt, 'utf8'));
  cached = receipt.key === actualGeometryKey && receipt.sha256 === digest(await readFile(geometryCache));
}
// Meshopt must run last: a later texture transform decodes geometry while reading.
if (!cached) {
  let input=raw;
  if(needsRasterNormalization){
    input=join(source,`${stem}.raster-normalized.glb`);const conversions=await normalizeRasterInputs(raw,input);
    verifyPreserved(rawInfo,verifyUV(await readFile(input)));
    if(materialAttributeDigest(rawData)!==materialAttributeDigest(await readFile(input)))throw new Error('Raster normalization changed original UV/color streams.');
    await writeFile(join(source,'raster-normalization.json'),JSON.stringify({sourceSha256:digest(rawData),outputSha256:digest(await readFile(input)),conversions,scope:'Lossless decodedRGBA WebP→PNG input adaptation before Basis encoding; actual source is immutable.'},null,2)+'\n');
  }
  await gltf('dedup', input, deduplicated);
  if (materialProfile === 'quality') await gltf('uastc', deduplicated, textured, '--level', '2', '--rdo', '2', '--zstd', '18', '--jobs', '2');
  else {
    const sourceImages = sourceImageRoles;
    for (const image of sourceImages) if (image.roles.some(role => /normalTexture$/i.test(role)) && image.roles.some(role => !/normalTexture$/i.test(role))) throw new Error(`A source image shares normal and non-normal roles: ${image.name}`);
    const hasRetainedScreen = sourceImages.some(image => image.name === screenBasePattern && image.roles.includes('baseColorTexture'));
    if (screenBaseSize === 1024 && !hasRetainedScreen && (placeId === 'snow-roof' || args.includes('--screen-base-pattern'))) throw new Error('The retained screen base image was not found; refusing to silently resize its painted detail.');
    const normals = join(source, `${stem}${profileTag}.normalmaps.glb`);
    const screen = join(source, `${stem}${profileTag}.screen.glb`);
    await gltf('uastc', deduplicated, normals, '--slots', '*normal*', '--resize', '512', '--level', '2', '--rdo', 'false', '--zstd', '18', '--jobs', '2');
    // Already-Basis normal/screen images are explicitly skipped by subsequent
    // glTF-Transform texture transforms. The source pixels are never overwritten.
    if (screenBaseSize === 1024 && hasRetainedScreen) await gltf('etc1s', normals, screen, '--pattern', screenBasePattern, '--resize', '1024', '--quality', '255', '--compression', '4', '--rdo', 'false', '--jobs', '2');
    let colourInput = screenBaseSize === 1024 && hasRetainedScreen ? screen : normals;
    for (const [index, name] of pineCrownBaseImages.entries()) {
      const crown = join(source, `${stem}${profileTag}.pine-crown-${index}.glb`);
      await gltf('etc1s', colourInput, crown, '--pattern', name, '--resize', '1024', '--quality', '255', '--compression', '4', '--rdo', 'false', '--jobs', '2');
      colourInput = crown;
    }
    await gltf('etc1s', colourInput, textured, '--resize', '512', '--quality', '255', '--compression', '4', '--rdo', 'false', '--jobs', '2');
  }
  const texturedData = await readFile(textured);
  verifyMaterialValues(rawData,texturedData);
  verifyPreserved(rawInfo, verifyUV(texturedData));
  const sourceAttributes = materialAttributeDigest(rawData), materialAttributes = materialAttributeDigest(texturedData);
  if (sourceAttributes !== materialAttributes) throw new Error('Material compression changed TEXCOORD_0, TEXCOORD_1 or COLOR_0 before Meshopt.');
  if(useUnfilteredNormals&&materialAttributeDigest(rawData,['POSITION','NORMAL'])!==materialAttributeDigest(texturedData,['POSITION','NORMAL']))throw new Error('Material stage changed genuine source POSITION/NORMAL arrays.');
  if (materialProfile === 'mobile') verifyMobileImages(imageReport(texturedData));
  let normalAngularAudit;
  if(positionFormat==='float32')normalAngularAudit=await meshoptFloatPositions(textured,geometryCache);
  else await gltf('meshopt', textured, geometryCache, '--level', 'high', '--quantize-position', '16', '--quantize-texcoord', '16', '--quantize-normal', '12');
  const data = await readFile(geometryCache);
  const info = verifyUV(data);
  verifyPreserved(rawInfo, info);
  if (!info.extensions.includes('EXT_meshopt_compression') || !info.extensions.includes('KHR_texture_basisu')) throw new Error('Geometry stage lost Meshopt or Basis textures.');
  const images = imageReport(data);
  if (materialProfile === 'mobile') verifyMobileImages(images);
  await writeFile(geometryReceipt, JSON.stringify({ key: actualGeometryKey, profile: materialProfile, positionFormat, normalFormat, normalFilter, ...(normalAngularAudit ? { normalAngularAudit } : {}), positionFilter:positionFormat==='float32'?'NONE':'quantized', materialRecipe, sha256: digest(data), bytes: data.length, preMeshoptAttributeSha256: sourceAttributes, uvVerification: info, images, uniqueImageBytes: images.reduce((sum, image) => sum + image.bytes, 0) }, null, 2) + '\n');
} else console.log('GEOMETRY_STAGE_REUSED', actualGeometryKey);
verifyPreserved(rawInfo, verifyUV(await readFile(geometryCache)));
verifyMaterialValues(rawData,await readFile(geometryCache));
if (cached && materialProfile === 'mobile') {
  const receipt = JSON.parse(await readFile(geometryReceipt, 'utf8'));
  receipt.materialRecipe = materialRecipe;
  await writeFile(geometryReceipt, JSON.stringify(receipt, null, 2) + '\n');
}
if (geometryOnly) {
  await copyFile(geometryCache, join(out, sceneName));
  await copyFile(geometryReceipt, join(out, 'geometry-stage.json'));
  console.log('GEOMETRY_STAGE_READY', geometryCache, 'No delivery manifest was written.');
  process.exit(0);
}
if (!lightmapsOnly) await copyFile(geometryCache, join(out, sceneName));
manifest.scene = sceneName; manifest.files = [];
const sampling = manifest.bake?.sampling ?? { mipLevels: 3, gutterPixels: 8, anisotropy: 1, maxLod: 2 };
manifest.sampling = sampling;
for (const maps of Object.values(manifest.lightmaps)) for (const entry of Object.values(maps)) {
  if (lightmapSelection.length && !lightmapSelection.includes(entry.uri.replace(/\.ktx2$/, ''))) continue;
  const mipmaps = (entry.pngMipmaps ?? [entry.png]).map(name => join(source, name));
  if (mipmaps.length !== sampling.mipLevels) throw new Error(`Expected ${sampling.mipLevels} explicit chart-safe mipmaps for ${entry.uri}; rebake with current pipeline.`);
  const deliveryUri = lightmapCodec === 'uastc' ? entry.uri : entry.uri.replace(/\.ktx2$/, '.etc1s.ktx2');
  const output = join(source, deliveryUri);
  const receiptPath = output + '.json';
  const codecKey = lightmapCodec === 'uastc' ? 'uastc2-rdo1-zstd18' : 'etc1s-q255-c4-no-rdo';
  const mapKey = `${codecKey}-linear-${sampling.mipLevels}:` + (await Promise.all(mipmaps.map(async path => digest(await readFile(path))))).join(':');
  let reused = false;
  if (await exists(output) && await exists(receiptPath)) {
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    reused = receipt.key === mapKey && receipt.sha256 === digest(await readFile(output));
  }
  const codecParameters = lightmapCodec === 'uastc'
    ? ['--encode', 'uastc', '--uastc_quality', '2', '--uastc_rdo_l', '1', '--uastc_rdo_m', '--zcmp', '18']
    : ['--encode', 'etc1s', '--qlevel', '255', '--clevel', '4', '--no_endpoint_rdo', '--no_selector_rdo'];
  if (!reused) await run(toktx, ['--t2', ...codecParameters, '--threads', '2', '--assign_oetf', 'linear', '--assign_primaries', 'bt709', '--mipmap', '--levels', String(sampling.mipLevels), output, ...mipmaps]);
  else console.log('LIGHTMAP_STAGE_REUSED', deliveryUri);
  const data = await readFile(output); const identifier = data.subarray(0, 12).toString('hex');
  if (identifier !== 'ab4b5458203230bb0d0a1a0a') throw new Error('Invalid KTX2: ' + output);
  const levels = data.readUInt32LE(40);
  if (levels !== sampling.mipLevels) throw new Error(`Unexpected lightmap mip count: ${levels}`);
  const dfd = data.readUInt32LE(48);
  if (data[dfd + 14] !== 1) throw new Error(`Lightmap KTX2 is not tagged with a linear transfer function: ${entry.uri}`);
  if (data[dfd + 12] !== (lightmapCodec === 'uastc' ? 166 : 163)) throw new Error(`Unexpected lightmap codec: ${deliveryUri}`);
  if (!reused) await writeFile(receiptPath, JSON.stringify({ key: mapKey, codec: lightmapCodec, sha256: digest(data), bytes: data.length, mipLevels: levels, transfer: 'linear' }, null, 2) + '\n');
  if (!lightmapsOnly) await copyFile(output, join(out, deliveryUri));
  entry.uri = deliveryUri; entry.codec = lightmapCodec;
  entry.bytes = data.length;
  const masterHash = digest(await readFile(join(source, entry.source)));
  if (entry.masterSha256 && entry.masterSha256 !== masterHash) throw new Error(`Denoised master changed: ${entry.source}`);
  entry.masterSha256 = masterHash;
  console.log('LIGHTMAP_SAMPLING', entry.uri, { mipLevels: levels, gutterPixels: sampling.gutterPixels, anisotropy: sampling.anisotropy });
  manifest.files.push({ uri: deliveryUri, bytes: data.length, sha256: digest(data), codec: lightmapCodec, mipLevels: levels, transfer: 'linear' });
}
if (lightmapsOnly) {
  console.log('LIGHTMAP_STAGE_READY', manifest.files, 'No delivery manifest was written.');
  process.exit(0);
}
const packed = await readFile(join(out, sceneName)); const packedInfo = verifyUV(packed);
verifyPreserved(rawInfo, packedInfo);
if (!packedInfo.extensions.includes('EXT_meshopt_compression')) throw new Error('Meshopt extension missing');
if (!packedInfo.extensions.includes('KHR_texture_basisu')) throw new Error('KTX2 material textures missing');
manifest.files.unshift({ uri: sceneName, bytes: packed.length, sha256: digest(packed) });
for (const [id, hero] of Object.entries(manifest.heroes ?? {})) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || !hero.source || !hero.uri) throw new Error(`Invalid authored hero contract: ${id}`);
  const input = join(source, hero.source), bytes = await readFile(input), before = verifyUV(bytes, false);
  const base = `${stem}-${id}${profileTag}`, dedup = join(source, `${base}.deduplicated.glb`), textures = join(source, `${base}.textures.glb`), output = join(source, `${base}.packed.glb`), receiptPath = join(source, `${base}.geometry-stage.json`);
  const heroNormalKey = normalFormat === 'float32' ? 'genuine-float32-position-normal-NONE-v1:' : normalCacheKey;
  const key = `${heroNormalKey}hero-live-pbr-dedup-uastc2-no-rdo-meshopt16-v1:${digest(bytes)}`;
  let reuse = false;
  let normalAngularAudit;
  if (await exists(output) && await exists(receiptPath)) { const receipt = JSON.parse(await readFile(receiptPath, 'utf8')); reuse = receipt.key === key && receipt.sha256 === digest(await readFile(output)); if (reuse) normalAngularAudit = receipt.normalAngularAudit; }
  if (!reuse) {
    await gltf('dedup', input, dedup);
    await gltf('uastc', dedup, textures, '--resize', '512', '--level', '2', '--rdo', 'false', '--zstd', '18', '--jobs', '2');
    verifyPreserved(before, verifyUV(await readFile(textures), false));
    if (materialAttributeDigest(bytes) !== materialAttributeDigest(await readFile(textures))) throw new Error(`Hero material transform changed actual source UV/color: ${id}`);
    if(useUnfilteredNormals){
      if(materialAttributeDigest(bytes,['POSITION','NORMAL'])!==materialAttributeDigest(await readFile(textures),['POSITION','NORMAL']))throw new Error('Hero material stage changed genuine source POSITION/NORMAL arrays.');
      normalAngularAudit=await meshoptFloatPositions(textures,output);
    }else await gltf('meshopt', textures, output, '--level', 'high', '--quantize-position', '16', '--quantize-texcoord', '16', '--quantize-normal', '12');
  }
  const data = await readFile(output), info = verifyUV(data, false);
  verifyPreserved(before, info);
  verifyMaterialValues(bytes,data);
  if (!info.extensions.includes('EXT_meshopt_compression')) throw new Error(`Hero Meshopt extension missing: ${id}`);
  const heroGeometryStep = normalFormat === 'snorm16' ? 'reorder-UV-color-and-audited-snorm16-meshopt-lossless-F32-position'
    : normalFormat === 'float32' ? 'reorder-UV-color-quantize-lossless-F32-position-normal' : 'meshopt';
  const receipt = { key, source: hero.source, sourceSha256: digest(bytes), sha256: digest(data), bytes: data.length, positionFormat:useUnfilteredNormals?'float32':'uint16',normalFormat,normalFilter,
    ...(normalAngularAudit ? { normalAngularAudit } : {}), materialLighting: 'live-PBR', transformOrder: ['dedup','uastc-512',heroGeometryStep], uvVerification: info, images: imageReport(data) };
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  await copyFile(output, join(out, hero.uri));
  hero.compression = receipt;
  manifest.files.push({ uri: hero.uri, bytes: data.length, sha256: digest(data), role: 'live-PBR-hero' });
}
if (await exists(join(source, 'posters.json'))) {
  const receipt = JSON.parse(await readFile(join(source, 'posters.json'), 'utf8'));
  if (receipt.sourceBlendSha256 !== manifest.bake?.sourceBlendSha256 || receipt.partialPreview && !preview) throw new Error('Native cover poster identity/completeness does not match the source delivery.');
  manifest.posters = receipt.posters;
  manifest.posterProvenance = { sourceBlendSha256: receipt.sourceBlendSha256, codec: receipt.codec, quality: receipt.quality, receiptSha256: digest(await readFile(join(source, 'posters.json'))) };
  for (const file of receipt.files) {
    const data = await readFile(join(source, file.uri));
    if (data.length !== file.bytes || digest(data) !== file.sha256) throw new Error('Native cover poster changed: ' + file.uri);
    await copyFile(join(source, file.uri), join(out, file.uri)); manifest.files.push(file);
  }
}
manifest.totalBytes = manifest.files.reduce((n, file) => n + file.bytes, 0);
const images = imageReport(packed);
if (materialProfile === 'mobile') verifyMobileImages(images);
const bytesByRoleUnion = {};
for (const image of images) { const key = image.roles.join('+') || 'unused'; bytesByRoleUnion[key] = (bytesByRoleUnion[key] ?? 0) + image.bytes; }
manifest.compression = { gltfTransform: '4.5.1', ktxSoftware: '4.4.2', mesh: 'EXT_meshopt_compression', textures: 'KHR_texture_basisu', materialProfile, materialRecipe, lightmapCodec, lightmaps: `${lightmapCodec === 'uastc' ? 'Basis UASTC + Zstandard' : 'Basis ETC1S / BasisLZ'}, per-pass log2 HDR in linear KTX2 samples; decode logRange/logGain before lighting`, transformOrder: materialProfile === 'quality' ? ['dedup', 'uastc', 'meshopt'] : ['dedup', 'uastc-normal-512', `etc1s-screen-${screenBaseSize}`, 'etc1s-other-512', 'meshopt'], uvVerification: packedInfo, images, uniqueMaterialImageBytes: images.reduce((sum, image) => sum + image.bytes, 0), bytesByRoleUnion };
manifest.compression.positionFormat = positionFormat;
manifest.compression.normalFormat = normalFormat;
manifest.compression.normalFilter = normalFilter;
if (normalFormat === 'snorm16') {
  const receipt = JSON.parse(await readFile(geometryReceipt, 'utf8'));
  if (!receipt.normalAngularAudit) throw new Error('Missing decoded SNORM16 normal audit.');
  manifest.compression.normalAngularAudit = receipt.normalAngularAudit;
}
manifest.compression.generatorSha256=digest(await readFile(new URL(import.meta.url)));
manifest.compression.positionFilter = positionFormat==='float32'?'NONE':'quantized';
manifest.compression.transformOrder = [
  ...(needsRasterNormalization?['lossless-WebP-to-PNG']:[]),'dedup',
  ...(materialProfile==='quality'?['uastc']:['uastc-normal-512',...(sourceHasRetainedScreen&&screenBaseSize===1024?['etc1s-screen-1024']:[]),...(pineCrownBaseImages.length?['etc1s-pine-crowns-native']:[]),'etc1s-other-512']),
  normalFormat==='snorm16'?'reorder-UV-color-and-audited-snorm16-meshopt-position-NONE'
    : positionFormat==='float32'?(normalFormat==='float32'?'reorder-UV-color-quantize-meshopt-position-normal-NONE':'reorder-nonposition-quantize-meshopt-position-NONE'):'meshopt',
];
if(needsRasterNormalization){const receipt=await readFile(join(source,'raster-normalization.json'));manifest.compression.rasterNormalization={receiptSha256:digest(receipt),...JSON.parse(receipt.toString())};}
const budget = Number(option('--max-bytes', manifest.budget?.completePackageBytesMaximum ?? 0));
const reservedBytes = Number(option('--reserve-bytes', 0));
if (!Number.isFinite(budget) || budget < 0) throw new Error('Invalid complete delivery budget.');
if (!Number.isSafeInteger(reservedBytes) || reservedBytes < 0) throw new Error('Invalid reserved poster budget.');
manifest.payloadBytes = manifest.totalBytes;
manifest.budget = { ...(manifest.budget ?? {}), ...(budget ? { completePackageBytesMaximum: budget } : {}), reservedPosterBytes: reservedBytes };
// Include the manifest itself in the complete package cap, not only GPU assets.
let serialized;manifest.manifestBytes=0;
for (let i = 0; i < 8; i++) {
  serialized=JSON.stringify(manifest,null,2)+'\n';const length=Buffer.byteLength(serialized);
  if(manifest.manifestBytes===length&&manifest.completePackageBytes===manifest.totalBytes+length)break;
  manifest.manifestBytes=length;manifest.completePackageBytes=manifest.totalBytes+length;
}
serialized = JSON.stringify(manifest, null, 2) + '\n';
if(manifest.manifestBytes!==Buffer.byteLength(serialized))throw new Error('Manifest byte accounting did not converge.');
if (budget && manifest.completePackageBytes+reservedBytes > budget) throw new Error(`Complete ${placeId} package ${manifest.completePackageBytes} B plus${reservedBytes} B reserved exceeds its ${budget} B cap; no delivery manifest published.`);
await writeFile(join(out, 'manifest.json'), serialized);
const reportTag = `${profileTag}${lightmapCodec === 'uastc' ? '' : '.etc1s'}`;
await writeFile(join(source, `delivery-report${reportTag}.json`), JSON.stringify({ ...manifest.compression, partialPreview: preview, missingAmbientLooks: manifest.missingAmbientLooks ?? [], files: manifest.files, totalBytes: manifest.totalBytes, targetBytes: 8 * 1024 * 1024, withinTarget: manifest.totalBytes <= 8 * 1024 * 1024 }, null, 2) + '\n');
console.log('DELIVERY', manifest.totalBytes, 'bytes; target', 8 * 1024 * 1024);
if (manifest.totalBytes > 8 * 1024 * 1024) console.warn('Place exceeds the reference budget; review atlas and material resolution before accepting.');
