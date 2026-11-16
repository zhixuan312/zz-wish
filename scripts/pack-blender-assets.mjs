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
Mobile/ETC1S candidates require a separate explicit output directory.
Run encoders only after capture releases CPU timing.`);
  process.exit(0);
}
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const source = resolve(option('--source', 'art/build/snow-roof'));
const out = resolve(option('--out', 'web/public/places/snow-roof'));
const materialProfile = option('--material-profile', 'quality');
const lightmapCodec = option('--lightmap-codec', 'uastc');
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
  const positions = new Float32Array(input.positions), indices = new Uint32Array(input.indices);
  atlas.addMesh({ vertexPositionData: positions, vertexCount: positions.length / 3, vertexPositionStride: 12, indexData: indices, indexCount: indices.length, epsilon: .00001 });
  const began = performance.now();
  const packOptions = { resolution, padding: 8, bilinear: true, blockAlign: true, rotateCharts: true };
  atlas.generate({ normalSeamWeight: 0, textureSeamWeight: 0, useInputMeshUvs: false, maxIterations: 2 }, packOptions);
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
  const report = { width: atlas.width, height: atlas.height, atlasCount: atlas.atlasCount, chartCount: atlas.chartCount, texelsPerUnit: atlas.texelsPerUnit, seconds: (performance.now() - began) / 1000, padding: 8, resolution, attempts, unwrapSignature, sourceVertexCount: positions.length / 3, outputVertexCount: vertices.length };
  await writeFile(output, JSON.stringify({ vertices, indices: [...result], report }));
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
const raw = join(source, 'snow-roof.raw.glb');
function glbJSON(data) { if (data.readUInt32LE(0) !== 0x46546c67) throw new Error('Not glTF binary'); const length = data.readUInt32LE(12); return JSON.parse(data.subarray(20, 20 + length).toString()); }
function verifyUV(data) {
  const json = glbJSON(data); const missing = [];
  for (const [index, mesh] of (json.meshes || []).entries()) for (const primitive of mesh.primitives) if (primitive.attributes.TEXCOORD_0 === undefined || primitive.attributes.TEXCOORD_1 === undefined) missing.push(index);
  if (missing.length) throw new Error(`Material or lightmap UV set missing from primitives: ${missing.join(', ')}`);
  return { meshes: json.meshes.length, primitives: json.meshes.reduce((n, mesh) => n + mesh.primitives.length, 0), colourPrimitives: json.meshes.reduce((n, mesh) => n + mesh.primitives.filter(primitive => primitive.attributes.COLOR_0 !== undefined).length, 0), regions: [...new Set((json.nodes || []).map(node => node.extras?.lightmap_region).filter(Boolean))].sort(), roughnessClamps: (json.materials || []).filter(material => material.extras?.one_light_min_roughness !== undefined).map(material => ({ name: material.name, minimum: material.extras.one_light_min_roughness })), primitiveRoughness: json.meshes.flatMap((mesh, meshIndex) => mesh.primitives.map((primitive, index) => ({ key: `${meshIndex}/${index}`, material: json.materials?.[primitive.material]?.name ?? null, minimum: json.materials?.[primitive.material]?.extras?.one_light_min_roughness ?? null }))), extensions: json.extensionsUsed || [] };
}
function verifyPreserved(rawInfo, packedInfo) {
  if (JSON.stringify(packedInfo.regions) !== JSON.stringify(rawInfo.regions)) throw new Error('Compression lost lightmap region metadata.');
  if (packedInfo.primitives !== rawInfo.primitives || packedInfo.colourPrimitives !== rawInfo.colourPrimitives) throw new Error('Compression changed primitive or COLOR_0 coverage.');
  for (const sourcePrimitive of rawInfo.primitiveRoughness) {
    const after = packedInfo.primitiveRoughness.find(primitive => primitive.key === sourcePrimitive.key);
    if (!after || after.minimum !== sourcePrimitive.minimum) throw new Error(`Compression changed the roughness constraint on primitive ${sourcePrimitive.key} (${sourcePrimitive.material}).`);
  }
}
function imageReport(data) {
  const json = glbJSON(data), bin = 28 + data.readUInt32LE(12);
  const uses = new Map();
  function visit(value, material, path = '') {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const slot = path ? `${path}.${key}` : key;
      if (key.endsWith('Texture') && Number.isInteger(child?.index)) {
        const texture = json.textures[child.index];
        const image = texture.extensions?.KHR_texture_basisu?.source ?? texture.source;
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
function materialAttributeDigest(data) {
  const json = glbJSON(data), bin = 28 + data.readUInt32LE(12), result = [];
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }, sizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  for (const [meshIndex, mesh] of json.meshes.entries()) for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
    const attributes = {};
    for (const semantic of ['TEXCOORD_0', 'TEXCOORD_1', 'COLOR_0']) {
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
    const maximum = retainedScreen ? screenBaseSize : 512, expected = normal ? 'UASTC' : 'ETC1S';
    if (image.codec !== expected || image.width > maximum || image.height > maximum) throw new Error(`Mobile material profile mismatch: ${image.name} (${image.roles.join(', ')}) expected ${expected} at most ${maximum}px.`);
    const colour = image.roles.some(role => /^(baseColorTexture|emissiveTexture)$/.test(role));
    if (image.transfer !== (colour ? 'sRGB' : 'linear')) throw new Error(`Mobile material transfer mismatch: ${image.name}.`);
  }
}
const rawData = await readFile(raw), rawInfo = verifyUV(rawData); console.log('RAW_UV_INFO', rawInfo);
const materialRecipe = {
  profile: materialProfile, sourceRawGLB: basename(raw), sourceRawGLBSha256: digest(rawData), originalPixelInput: true,
  gltfTransform: '4.5.1', ktxSoftware: '4.4.2', metadataSource: 'Actual GLB material/image bindings and embedded KTX2 DFD/header; codec and dimensions are not inferred from filenames.',
  ...(materialProfile === 'mobile' ? { normals: { codec: 'UASTC', maximumSize: 512, quality: 2, rdo: false, slotPattern: '*normal*', retainedAsNormalData: true }, otherMaps: { codec: 'ETC1S', maximumSize: 512, quality: 255, compression: 4, endpointRdo: false, selectorRdo: false }, screenBase: { sourceImageName: screenBasePattern, maximumSize: screenBaseSize, codec: 'ETC1S' } } : { textureCLI: ['uastc', '--level', '2', '--rdo', '2', '--zstd', '18', '--jobs', '2'] }),
};
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
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
const profileTag = materialProfile === 'quality' ? '' : '.mobile';
const deduplicated = join(source, `snow-roof${profileTag}.deduplicated.glb`);
const textured = join(source, `snow-roof${profileTag}.textures.glb`);
const geometryCache = join(source, `snow-roof${profileTag}.packed.glb`);
const geometryReceipt = join(source, `geometry-stage${profileTag}.json`);
const geometryKey = materialProfile === 'quality'
  ? `dedup-uastc2-rdo2-zstd18-meshopt16-16-12-v1:${digest(rawData)}`
  : `mobile-v1-normal512-uastc2-colour512-etc1s255c4-screen${screenBaseSize}-${screenBasePattern}-meshopt16-16-12:${digest(rawData)}`;
let cached = false;
if (await exists(geometryReceipt) && await exists(geometryCache)) {
  const receipt = JSON.parse(await readFile(geometryReceipt, 'utf8'));
  cached = receipt.key === geometryKey && receipt.sha256 === digest(await readFile(geometryCache));
}
// Meshopt must run last: a later texture transform decodes geometry while reading.
if (!cached) {
  await gltf('dedup', raw, deduplicated);
  if (materialProfile === 'quality') await gltf('uastc', deduplicated, textured, '--level', '2', '--rdo', '2', '--zstd', '18', '--jobs', '2');
  else {
    const sourceImages = imageReport(rawData);
    for (const image of sourceImages) if (image.roles.some(role => /normalTexture$/i.test(role)) && image.roles.some(role => !/normalTexture$/i.test(role))) throw new Error(`A source image shares normal and non-normal roles: ${image.name}`);
    if (screenBaseSize === 1024 && !sourceImages.some(image => image.name === screenBasePattern && image.roles.includes('baseColorTexture'))) throw new Error('The retained screen base image was not found; refusing to silently resize its painted detail.');
    const normals = join(source, 'snow-roof.mobile.normals.glb');
    const screen = join(source, 'snow-roof.mobile.screen.glb');
    await gltf('uastc', deduplicated, normals, '--slots', '*normal*', '--resize', '512', '--level', '2', '--rdo', 'false', '--zstd', '18', '--jobs', '2');
    // Already-Basis normal/screen images are explicitly skipped by subsequent
    // glTF-Transform texture transforms. The source pixels are never overwritten.
    if (screenBaseSize === 1024) await gltf('etc1s', normals, screen, '--pattern', screenBasePattern, '--resize', '1024', '--quality', '255', '--compression', '4', '--rdo', 'false', '--jobs', '2');
    await gltf('etc1s', screenBaseSize === 1024 ? screen : normals, textured, '--resize', '512', '--quality', '255', '--compression', '4', '--rdo', 'false', '--jobs', '2');
  }
  const texturedData = await readFile(textured);
  verifyPreserved(rawInfo, verifyUV(texturedData));
  const sourceAttributes = materialAttributeDigest(rawData), materialAttributes = materialAttributeDigest(texturedData);
  if (sourceAttributes !== materialAttributes) throw new Error('Material compression changed TEXCOORD_0, TEXCOORD_1 or COLOR_0 before Meshopt.');
  if (materialProfile === 'mobile') verifyMobileImages(imageReport(texturedData));
  await gltf('meshopt', textured, geometryCache, '--level', 'high', '--quantize-position', '16', '--quantize-texcoord', '16', '--quantize-normal', '12');
  const data = await readFile(geometryCache);
  const info = verifyUV(data);
  verifyPreserved(rawInfo, info);
  if (!info.extensions.includes('EXT_meshopt_compression') || !info.extensions.includes('KHR_texture_basisu')) throw new Error('Geometry stage lost Meshopt or Basis textures.');
  const images = imageReport(data);
  if (materialProfile === 'mobile') verifyMobileImages(images);
  await writeFile(geometryReceipt, JSON.stringify({ key: geometryKey, profile: materialProfile, materialRecipe, sha256: digest(data), bytes: data.length, preMeshoptAttributeSha256: sourceAttributes, uvVerification: info, images, uniqueImageBytes: images.reduce((sum, image) => sum + image.bytes, 0) }, null, 2) + '\n');
} else console.log('GEOMETRY_STAGE_REUSED', geometryKey);
if (cached && materialProfile === 'mobile') {
  const receipt = JSON.parse(await readFile(geometryReceipt, 'utf8'));
  receipt.materialRecipe = materialRecipe;
  await writeFile(geometryReceipt, JSON.stringify(receipt, null, 2) + '\n');
}
if (geometryOnly) {
  await copyFile(geometryCache, join(out, 'snow-roof.glb'));
  await copyFile(geometryReceipt, join(out, 'geometry-stage.json'));
  console.log('GEOMETRY_STAGE_READY', geometryCache, 'No delivery manifest was written.');
  process.exit(0);
}
if (!lightmapsOnly) await copyFile(geometryCache, join(out, 'snow-roof.glb'));
manifest.scene = 'snow-roof.glb'; manifest.files = [];
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
const packed = await readFile(join(out, 'snow-roof.glb')); const packedInfo = verifyUV(packed);
verifyPreserved(rawInfo, packedInfo);
if (!packedInfo.extensions.includes('EXT_meshopt_compression')) throw new Error('Meshopt extension missing');
if (!packedInfo.extensions.includes('KHR_texture_basisu')) throw new Error('KTX2 material textures missing');
manifest.files.unshift({ uri: 'snow-roof.glb', bytes: packed.length, sha256: digest(packed) });
manifest.totalBytes = manifest.files.reduce((n, file) => n + file.bytes, 0);
const images = imageReport(packed);
if (materialProfile === 'mobile') verifyMobileImages(images);
const bytesByRoleUnion = {};
for (const image of images) { const key = image.roles.join('+') || 'unused'; bytesByRoleUnion[key] = (bytesByRoleUnion[key] ?? 0) + image.bytes; }
manifest.compression = { gltfTransform: '4.5.1', ktxSoftware: '4.4.2', mesh: 'EXT_meshopt_compression', textures: 'KHR_texture_basisu', materialProfile, materialRecipe, lightmapCodec, lightmaps: `${lightmapCodec === 'uastc' ? 'Basis UASTC + Zstandard' : 'Basis ETC1S / BasisLZ'}, per-pass log2 HDR in linear KTX2 samples; decode logRange/logGain before lighting`, transformOrder: materialProfile === 'quality' ? ['dedup', 'uastc', 'meshopt'] : ['dedup', 'uastc-normal-512', `etc1s-screen-${screenBaseSize}`, 'etc1s-other-512', 'meshopt'], uvVerification: packedInfo, images, uniqueMaterialImageBytes: images.reduce((sum, image) => sum + image.bytes, 0), bytesByRoleUnion };
await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const reportTag = `${profileTag}${lightmapCodec === 'uastc' ? '' : '.etc1s'}`;
await writeFile(join(source, `delivery-report${reportTag}.json`), JSON.stringify({ ...manifest.compression, partialPreview: preview, missingAmbientLooks: manifest.missingAmbientLooks ?? [], files: manifest.files, totalBytes: manifest.totalBytes, targetBytes: 8 * 1024 * 1024, withinTarget: manifest.totalBytes <= 8 * 1024 * 1024 }, null, 2) + '\n');
console.log('DELIVERY', manifest.totalBytes, 'bytes; target', 8 * 1024 * 1024);
if (manifest.totalBytes > 8 * 1024 * 1024) console.warn('Place exceeds the reference budget; review atlas and material resolution before accepting.');
