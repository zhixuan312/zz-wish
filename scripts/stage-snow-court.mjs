// Stage the authored Snow Roof Court preview without replacing the installed scene.
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { constants, gunzipSync, zstdCompressSync, zstdDecompressSync } from 'node:zlib';
import { read as readKtx, write as writeKtx, KHR_DF_MODEL_ETC1S, KHR_DF_PRIMARIES_BT709,
  KHR_DF_TRANSFER_LINEAR, KHR_SUPERCOMPRESSION_BASISLZ, KHR_SUPERCOMPRESSION_ZSTD } from 'three/examples/jsm/libs/ktx-parse.module.js';
import { readSnowCourtWalkLightmaps } from '../web/src/engine/baked/snowCourtManifest.js';

const required = ['near', 'needles', 'day', 'night', 'out'];
const { values } = parseArgs({
  options: {
    ...Object.fromEntries([...required, 'walk', 'high'].map(name => [name, { type: 'string' }])),
    'defer-hall-lightmaps': { type: 'boolean' },
    'near-samples': { type: 'string', default: '8' },
    help: { type: 'boolean' },
  },
});
if (values.help) {
  console.log('node scripts/stage-snow-court.mjs --near PACKED_NEAR --needles AUTHORED_GLB --day WEBP2048 --night WEBP2048 --out NEW_ART_BUILD_DIRECTORY [--walk KTX8192] [--high WEBP8192_OR_KTX8192] [--defer-hall-lightmaps] [--near-samples 8|64]');
  process.exit(0);
}
if (required.some(name => !values[name])) throw new Error('Specify --near, --needles, --day, --night and --out.');
const nearSampleCount = Number(values['near-samples']);
if (nearSampleCount !== 8 && nearSampleCount !== 64) throw new Error('Specify --near-samples 8 or 64.');
const deferHallLightmaps = values['defer-hall-lightmaps'];
if (deferHallLightmaps && !values.walk) throw new Error('Deferred Snow Roof lightmaps require --walk.');
const [near, daySource, nightSource, walkSource, highSource] = await Promise.all([
  realpath(resolve(values.near)), realpath(resolve(values.day)), realpath(resolve(values.night)),
  values.walk && realpath(resolve(values.walk)), values.high && realpath(resolve(values.high)),
]);
const out = join(await realpath(dirname(resolve(values.out))), basename(resolve(values.out)));
const scratch = await realpath(new URL('../art/build', import.meta.url));
const inputs = [near, daySource, nightSource, walkSource, highSource].filter(Boolean);
if (!out.startsWith(scratch + sep) || inputs.some(input => out === input || out.startsWith(input + sep))) {
  throw new Error('Use a new directory under art/build outside all inputs.');
}

const digest = data => createHash('sha256').update(data).digest('hex');
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const localName = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(value);
const [projectionBytes, siteBytes, backdropSource, agxProvenance] = await Promise.all([
  readFile(new URL('../shared/snow-court-backdrop.json', import.meta.url)),
  readFile(new URL('../shared/snow-roof-court-site.json', import.meta.url)),
  readFile(new URL('../art/blender/snow_court_backdrop.py', import.meta.url)),
  readFile(new URL('../docs/licenses/native-agx.json', import.meta.url)),
]);
const projection = JSON.parse(projectionBytes);
const { revision } = JSON.parse(siteBytes);
const projectionSha256 = digest(projectionBytes);
const siteSha256 = digest(siteBytes);
const backdropSourceSha256 = digest(backdropSource);
const layerNames = Object.keys(projection.distances);
const limits = { base: 15_000_000, phone: 30_000_000, desktop: 40_000_000 };

async function localFile(directory, uri) {
  if (!localName(uri)) throw new Error(`Invalid local asset URI: ${uri}`);
  const path = join(directory, uri);
  if (!(await lstat(path)).isFile()) throw new Error(`Expected a regular file: ${path}`);
  return readFile(path);
}

async function verifiedFile(directory, spec) {
  if (!isHash(spec.sha256) || !Number.isSafeInteger(spec.bytes) || spec.bytes <= 0) {
    throw new Error(`Invalid file receipt for ${spec.uri}.`);
  }
  const body = await localFile(directory, spec.uri);
  if (body.length !== spec.bytes || digest(body) !== spec.sha256) throw new Error(`Changed file: ${spec.uri}`);
  return body;
}

function verifyScene(spec, body) {
  if (spec.encoding === 'zstd') {
    body = zstdDecompressSync(body);
  } else if (spec.encoding === 'gzip') {
    body = gunzipSync(body);
  } else if (spec.encoding !== undefined) {
    throw new Error(`Unknown scene container: ${spec.encoding}`);
  }
  if (spec.encoding && (body.length !== spec.decodedBytes || digest(body) !== spec.decodedSha256)) {
    throw new Error('Decoded scene disagrees with its receipt.');
  }
  if (body.length < 20 || body.readUInt32LE(0) !== 0x46546c67 || body.readUInt32LE(4) !== 2
    || body.readUInt32LE(8) !== body.length || body.readUInt32LE(16) !== 0x4e4f534a
    || body.readUInt32LE(12) > body.length - 20) {
    throw new Error('The packed near scene must be a binary glTF.');
  }
  const scene = JSON.parse(body.toString('utf8', 20, 20 + body.readUInt32LE(12)));
  const extras = scene.scenes?.[scene.scene ?? 0]?.extras;
  if (extras?.snow_court_revision !== revision) {
    throw new Error(`The exported near scene must declare the authored Snow Roof Court revision ${revision}.`);
  }
  return extras;
}

function verifyWebp(body, uri, width, height) {
  if (body.length < 30 || body.toString('ascii', 0, 4) !== 'RIFF'
    || body.toString('ascii', 8, 12) !== 'WEBP' || body.readUInt32LE(4) + 8 !== body.length) {
    throw new Error(`Expected a WebP container: ${uri}`);
  }
  let images = 0;
  for (let offset = 12; offset < body.length;) {
    if (offset + 8 > body.length) throw new Error(`Incomplete WebP chunk in ${uri}.`);
    const start = offset + 8;
    const kind = body.toString('ascii', offset, offset + 4);
    const size = body.readUInt32LE(offset + 4);
    offset = start + size + size % 2;
    if (offset > body.length) throw new Error(`Incomplete WebP payload in ${uri}.`);
    let dimensions;
    if (kind === 'VP8X') {
      if (size !== 10 || body[start] & 2) throw new Error(`Expected a still WebP: ${uri}`);
      dimensions = [body.readUIntLE(start + 4, 3) + 1, body.readUIntLE(start + 7, 3) + 1];
    } else if (kind === 'VP8 ' && size >= 10 && body.readUIntLE(start + 3, 3) === 0x2a019d) {
      dimensions = [body.readUInt16LE(start + 6) & 0x3fff, body.readUInt16LE(start + 8) & 0x3fff];
      images++;
    } else if (kind === 'VP8L' && size >= 5 && body[start] === 0x2f) {
      const encoded = body.readUInt32LE(start + 1);
      dimensions = [(encoded & 0x3fff) + 1, ((encoded >>> 14) & 0x3fff) + 1];
      images++;
    }
    if (dimensions && (dimensions[0] !== width || dimensions[1] !== height)) {
      throw new Error(`Expected a WebP of ${width}×${height}: ${uri}`);
    }
  }
  if (images !== 1) throw new Error(`Expected one encoded WebP image: ${uri}`);
}

function verifyKtx(body, uri, width, height) {
  const ktx = readKtx(body);
  const [format] = ktx.dataFormatDescriptor;
  const basis = ktx.supercompressionScheme === KHR_SUPERCOMPRESSION_BASISLZ && format?.colorModel === KHR_DF_MODEL_ETC1S;
  // The bundled KTX parser does not export the Khronos UASTC model identifier.
  const uastc = ktx.supercompressionScheme === KHR_SUPERCOMPRESSION_ZSTD && format?.colorModel === 166;
  if (ktx.vkFormat !== 0 || ktx.pixelWidth !== width || ktx.pixelHeight !== height
    || ktx.pixelDepth || ktx.layerCount || ktx.faceCount !== 1 || ktx.levels.length !== 1 || !(basis || uastc)
    || ktx.keyValue.KTXorientation !== 'ru' || format.colorPrimaries !== KHR_DF_PRIMARIES_BT709
    || format.transferFunction !== KHR_DF_TRANSFER_LINEAR || format.flags !== 0) {
    throw new Error(`Expected bottom-up linear Basis KTX2 of ${width}×${height}: ${uri}`);
  }
}

function softLightmap(file, map) {
  const { uri } = file.spec;
  const source = readKtx(file.body);
  const [format] = source.dataFormatDescriptor;
  const mip = source.levels[2];
  const mipBytes = Math.ceil(source.pixelWidth / 16) * Math.ceil(source.pixelHeight / 16) * 16;
  if (map.mipLevels !== 3 || file.spec.mipLevels !== 3 || source.vkFormat !== 0 || source.levels.length !== 3
    || source.pixelDepth || source.layerCount || source.faceCount !== 1
    || source.supercompressionScheme !== KHR_SUPERCOMPRESSION_ZSTD
    || format?.colorModel !== 166 || format.transferFunction !== KHR_DF_TRANSFER_LINEAR
    || source.pixelWidth < 16 || source.pixelWidth % 4 || source.pixelHeight < 16 || source.pixelHeight % 4
    || !mip?.levelData.length || mip.uncompressedByteLength !== mipBytes) {
    throw new Error(`Expected a three-level linear UASTC lightmap: ${uri}`);
  }
  // Copy the audited mip2 blocks, UV orientation and transfer metadata.
  const body = Buffer.from(writeKtx({
    ...source,
    pixelWidth: source.pixelWidth / 4,
    pixelHeight: source.pixelHeight / 4,
    levels: [mip],
  }, { keepWriter: true }));
  return { body, spec: { uri: uri.replace(/\.ktx2$/, '-soft.ktx2'), bytes: body.length, sha256: digest(body),
    role: 'runtime-snow-soft-lightmap', codec: 'uastc', mipLevels: 1, transfer: 'linear',
    sourceUri: uri, sourceMip: 2 } };
}

function verifyLighting(actual, lighting) {
  const { directionEngine: [x, y, z], discDegrees, discIntensity, skyStrength } = projection.light[lighting];
  const degrees = 180 / Math.PI;
  const expected = {
    solarElevationDegrees: Math.atan2(y, Math.hypot(x, z)) * degrees,
    solarAzimuthDegrees: (Math.atan2(x, -z) * degrees + 360) % 360,
    solarDiameterDegrees: discDegrees,
    solarIntensity: discIntensity,
    atmosphereStrength: skyStrength,
    altitudeMetres: 1700,
    airDensity: .89,
    aerosolDensity: .55,
    ozoneDensity: 1,
  };
  if (Object.keys(actual ?? {}).length !== Object.keys(expected).length
    || Object.entries(expected).some(([key, value]) => !Number.isFinite(actual[key]) || Math.abs(actual[key] - value) > 1e-9)) {
    throw new Error(`The ${lighting} backdrop transport differs from the authored light direction or atmosphere.`);
  }
}

async function backdrop(directory, tier, lighting, extensions) {
  const receipt = await localFile(directory, 'encode.json');
  const spec = JSON.parse(receipt);
  const preferredScale = tier === 'day' || tier === 'night' ? 4 : 1;
  const width = projection.width / preferredScale;
  const height = projection.height / preferredScale;
  if (spec.lighting !== lighting || spec.projectionSha256 !== projectionSha256 || spec.siteSha256 !== siteSha256
    || spec.backdropSourceSha256 !== backdropSourceSha256
    || !isHash(spec.renderSha256) || spec.preExposure !== projection.preExposure || spec.alpha !== 'straight'
    || spec.colorSpace !== 'linear' || spec.encoding !== 'log2-8-8' || spec.width !== width || spec.height !== height
    || !Number.isSafeInteger(spec.masterWidth) || !Number.isSafeInteger(spec.masterHeight)
    || spec.masterWidth > projection.width || spec.masterHeight > projection.height || spec.masterWidth * height !== spec.masterHeight * width
    || spec.masterWidth < width || spec.masterWidth % width
    || (spec.samples !== undefined && spec.samples !== 8)) {
    throw new Error(`Invalid encoded ${tier} backdrop receipt.`);
  }
  verifyLighting(spec.lightTransport, lighting);
  const sources = layerNames.map(name => spec.layers?.[name]);
  const extension = extensions.find(ext => sources.every(layer => layer?.uri?.endsWith(ext)));
  if (!extension || Object.keys(spec.layers).length !== layerNames.length || sources.some(layer => !isHash(layer.masterSha256))
    || new Set(sources.map(layer => layer.uri)).size !== layerNames.length) {
    throw new Error(`Expected distinct authored ${tier} layers with verified master SHA-256 values.`);
  }
  const files = await Promise.all(sources.map(async (layer, index) => {
    const body = await verifiedFile(directory, layer);
    const uri = `snow-vista-${tier}-${layerNames[index]}${extension}`;
    const verifyImage = extension === '.ktx2' ? verifyKtx : verifyWebp;
    verifyImage(body, uri, width, height);
    return { body, spec: { uri, bytes: layer.bytes, sha256: layer.sha256 } };
  }));
  const descriptor = {
    encoding: spec.encoding, width, height,
    layers: Object.fromEntries(layerNames.map((name, index) => [name, files[index].spec.uri])),
    encodedReceiptSha256: digest(receipt), renderSha256: spec.renderSha256,
    lightTransport: spec.lightTransport,
  };
  return { spec, descriptor, files };
}

const nearBytes = await localFile(near, 'manifest.json');
const manifest = JSON.parse(nearBytes);
const regions = ['altar', 'court', 'gate', 'hall'];
const passes = ['day', 'dusk', 'night', 'lamp'];
const bake = manifest.bake;
if (manifest.place !== 'snow-roof' || manifest.backdrop || manifest.snowCourt || manifest.walkLightmaps
  || manifest.partialPreview !== true
  || bake?.samples !== nearSampleCount || !isHash(bake.sourceBlendSha256) || !isHash(manifest.bakeFingerprint)
  || bake.cameraPreExposure !== projection.preExposure
  || Object.keys(manifest.lightmaps ?? {}).sort().join() !== regions.join()) {
  throw new Error(`Expected an unstaged ${nearSampleCount}-sample Snow Roof near package with all four regions.`);
}
const nearFiles = await Promise.all(manifest.files.map(async spec => ({ spec, body: await verifiedFile(near, spec) })));
const fileIndex = new Map(nearFiles.map(file => [file.spec.uri, file]));
const scene = fileIndex.get(manifest.scene);
if (!scene || fileIndex.has('manifest.json') || fileIndex.size !== nearFiles.length) {
  throw new Error('Missing scene or duplicate near asset URI.');
}
const sceneExtras = verifyScene(scene.spec, scene.body);
const needlesPath = await realpath(resolve(values.needles));
if (!needlesPath.startsWith(scratch + sep)) throw new Error('The authored needle crowns must come from art/build.');
const needlesBody = await readFile(needlesPath);
const needlesSha = digest(needlesBody);
if (needlesSha !== sceneExtras.snow_court_needles_sha256 || needlesBody.readUInt32LE(0) !== 0x46546c67
  || needlesBody.readUInt32LE(8) !== needlesBody.length) {
  throw new Error('The needle crowns differ from the mesh used during the source bake.');
}
const needleTransfer = zstdCompressSync(needlesBody, { params: { [constants.ZSTD_c_compressionLevel]: 22 } });
if (!zstdDecompressSync(needleTransfer).equals(needlesBody)) {
  throw new Error('Lossless needle compression did not preserve the authored GLB.');
}
const needles = { body: needleTransfer, spec: {
  uri: 'snow-court-needles.glb.zstd', bytes: needleTransfer.length, sha256: digest(needleTransfer),
  role: 'runtime-snow-needle-crowns', encoding: 'zstd', decodedBytes: needlesBody.length, decodedSha256: needlesSha,
} };
const seenMaps = new Set();
for (const region of regions) {
  const maps = manifest.lightmaps[region];
  if (Object.keys(maps).length !== passes.length) throw new Error(`Expected all four looks for ${region}.`);
  for (const pass of passes) {
    const map = maps[pass];
    const file = fileIndex.get(map?.uri);
    if (!file || !map.uri.endsWith('.ktx2') || file.spec.bytes !== map.bytes || seenMaps.has(map.uri)
      || map.samples !== nearSampleCount || map.bakeDevice !== 'METAL' || map.denoiseDevice !== 'METAL'
      || map.bakeFingerprint !== manifest.bakeFingerprint || !isHash(map.masterSha256)
      || map.cameraPreExposure !== bake.cameraPreExposure) {
      throw new Error(`Invalid ${nearSampleCount}-sample Metal/OIDN map receipt: ${region}/${pass}.`);
    }
    seenMaps.add(map.uri);
  }
}

const [day, night, walk, high] = await Promise.all([
  backdrop(daySource, 'day', 'day', ['.webp']),
  backdrop(nightSource, 'night', 'night', ['.webp']),
  walkSource && backdrop(walkSource, 'walk', 'day', ['.ktx2']),
  highSource && backdrop(highSource, 'high', 'day', ['.webp', '.ktx2']),
]);
if (day.spec.renderSha256 === night.spec.renderSha256) throw new Error('Day and night require separate Cycles renders.');
for (const [tier, upgrade] of [['walk', walk], ['high', high]]) {
  if (upgrade && (upgrade.spec.renderSha256 !== day.spec.renderSha256 || upgrade.spec.masterWidth !== day.spec.masterWidth
    || layerNames.some(name => upgrade.spec.layers[name].masterSha256 !== day.spec.layers[name].masterSha256))) {
    throw new Error(`The ${tier} tier must use the exact day masters that produced the soft plates.`);
  }
}
manifest.snowCourt = { revision, needles: needles.spec.uri };
manifest.backdrop = {
  ...day.descriptor, projectionSha256, siteSha256, night: night.descriptor,
  ...(walk ? { walk: walk.descriptor } : {}),
  ...(high ? { high: high.descriptor } : {}),
};
const softLightmaps = [];
if (deferHallLightmaps) {
  manifest.walkLightmaps = Object.fromEntries(['hall', 'altar'].map(region => [
    region,
    Object.fromEntries(passes.map(pass => {
      const map = manifest.lightmaps[region][pass];
      if (map.uri !== `${region}-${pass}.ktx2`) throw new Error(`Missing canonical lightmap ${region}/${pass}.`);
      const full = fileIndex.get(map.uri);
      const soft = softLightmap(full, map);
      softLightmaps.push(soft);
      return [pass, soft.spec.uri];
    })),
  ]));
}
const fabric = JSON.parse(await readFile(new URL('../web/src/engine/baked/visitor-fabric.json', import.meta.url)));
const installed = new URL('../web/public/places/snow-roof/', import.meta.url);
const fabricFiles = await Promise.all(Object.values(fabric.maps).map(async file => {
  const uri = basename(file.path);
  if (!localName(uri) || file.path !== '/places/snow-roof/' + uri || !isHash(file.sha256)) {
    throw new Error('Invalid Snow Roof gauze map declaration.');
  }
  const body = await readFile(new URL(uri, installed));
  if (body.length !== file.bytes || digest(body) !== file.sha256) throw new Error('Snow Roof gauze map changed: ' + uri);
  verifyWebp(body, uri, file.width, file.height);
  return { body, spec: { uri, bytes: file.bytes, sha256: file.sha256, role: 'runtime-visitor-fabric' } };
}));
const files = [
  ...nearFiles, needles, ...fabricFiles, ...day.files, ...night.files,
  ...(walk?.files ?? []), ...(high?.files ?? []), ...softLightmaps,
];
manifest.files = files.map(file => file.spec);
if (new Set(manifest.files.map(file => file.uri)).size !== files.length) {
  throw new Error('Duplicate delivery asset URI.');
}
const walkLightmapBytes = Object.values(readSnowCourtWalkLightmaps(manifest) ?? {})
  .flatMap(maps => Object.values(maps)).reduce((bytes, { full }) => bytes + full.bytes, 0);

const agx = JSON.parse(agxProvenance).delivered;
const agxUri = '/color/native-agx-57-f16.bin.zst';
const agxPath = 'web/public' + agxUri;
const agxSha = 'bc942c1862956cb48aed8c259d2e410518a10c4b26775a27c3b326d539244463';
if (agx.path !== agxPath || agx.url !== agxUri || agx.sha256 !== agxSha) throw new Error('Native AgX provenance changed.');
const agxBytes = await readFile(new URL('../' + agxPath, import.meta.url));
if (agxBytes.length !== agx.bytes || digest(agxBytes) !== agxSha) throw new Error('Native AgX payload changed.');
if (manifest.sharedVisualAssets?.some(file => file.url !== agxUri || file.sha256 !== agxSha || file.bytes !== agx.bytes)) {
  throw new Error('The near package declares an unexpected shared visual asset.');
}
manifest.sharedVisualAssets = [{ url: agxUri, bytes: agx.bytes, sha256: agxSha, role: 'native-AgX-None-sRGB-view' }];
manifest.sharedVisualBytes = agx.bytes;
manifest.nativeView = {
  view: 'AgX', look: 'None', display: 'sRGB', lut: agxUri,
  precision: 'native57³ samples rounded once to Float16; tetrahedral interpolation',
  provenance: 'docs/licenses/native-agx.json', cameraPreExposure: bake.cameraPreExposure,
  residualCameraExposureEV: bake.residualCameraExposureEV ?? 0,
};

const byteSum = items => items.reduce((bytes, file) => bytes + file.spec.bytes, 0);
const nightBytes = byteSum(night.files);
const walkBytes = walk ? byteSum(walk.files) : 0;
const highBytes = high ? byteSum(high.files) : 0;
manifest.payloadBytes = manifest.totalBytes = byteSum(files);
manifest.manifestBytes = 0;
const encode = () => Buffer.from(JSON.stringify(manifest) + '\n');
for (let attempt = 0; attempt < 8; attempt++) {
  const manifestBytes = encode().length;
  const desktop = manifestBytes + manifest.payloadBytes + manifest.sharedVisualBytes;
  const phone = desktop - highBytes;
  const base = phone - walkBytes - nightBytes - walkLightmapBytes;
  if (manifest.manifestBytes === manifestBytes && manifest.completePackageBytes === desktop) break;
  manifest.manifestBytes = manifestBytes;
  manifest.completePackageBytes = desktop;
  manifest.budget = { baseBytes: base, phoneBytes: phone, desktopBytes: desktop,
    baseLimitBytes: limits.base, phoneLimitBytes: limits.phone, desktopLimitBytes: limits.desktop };
}
const serialized = encode();
if (serialized.length !== manifest.manifestBytes) throw new Error('Manifest byte count did not converge.');
console.log('SNOW_COURT_BUDGET', JSON.stringify({
  ...manifest.budget, manifestBytes: manifest.manifestBytes, nativeAgXBytes: agx.bytes,
  nearBytes: byteSum([...nearFiles, needles]), dayBytes: byteSum(day.files), nightBytes, walkBytes, highBytes,
  ...(deferHallLightmaps ? { walkLightmapBytes, softLightmapBytes: byteSum(softLightmaps) } : {}),
  nearManifestSha256: digest(nearBytes), sourceBlendSha256: bake.sourceBlendSha256, projectionSha256, siteSha256,
}));
for (const [tier, limit] of Object.entries(limits)) {
  const bytes = manifest.budget[tier + 'Bytes'];
  if (bytes > limit) throw new Error(`Snow Roof Court ${tier} is ${bytes} B, above ${limit} B. No package was staged.`);
}
await mkdir(out);
for (const file of files) await writeFile(join(out, file.spec.uri), file.body, { flag: 'wx' });
await writeFile(join(out, 'manifest.json'), serialized, { flag: 'wx' });
console.log('SNOW_COURT_PACKAGE', digest(serialized), out);
