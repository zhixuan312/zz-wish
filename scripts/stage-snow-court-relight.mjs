// Add deferred directional light assets to the immutable Snow Roof R54 stage.
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { read as readKtx, KHR_DF_PRIMARIES_BT709, KHR_DF_TRANSFER_LINEAR,
  KHR_SUPERCOMPRESSION_ZSTD } from 'three/examples/jsm/libs/ktx-parse.module.js';

const baseSha256 = '00f454f4c67c36a92f3214ea83aa970498cb4942090f548ef2ae559aea973234';
const frozenGeometry = '9779270e93efc1deb6e17e15b25f04a33d91c9ab76bd86a671391e1bc6d67523';
const looks = ['dawn', 'morning', 'evening', 'night'];
const limits = { base: 15_000_000, phone: 30_000_000, desktop: 40_000_000 };
const options = Object.fromEntries(['base', 'assets', 'out'].map(name => [name, { type: 'string' }]));
const { values } = parseArgs({ options: { ...options, help: { type: 'boolean' } } });
if (values.help) {
  console.log('node scripts/stage-snow-court-relight.mjs --base ABS_APP54 --assets ABS_LOOK_ROOT --out ABS_APP55');
  process.exit(0);
}

function require(condition, message) {
  if (!condition) throw new Error(message);
}

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const localName = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(value);
const close = (actual, expected) => Number.isFinite(actual) && Number.isFinite(expected)
  && Math.abs(actual - expected) < 2e-6 * Math.max(1, Math.abs(expected));
const sameValues = (actual, expected) => Array.isArray(actual) && actual.length === expected.length
  && expected.every((value, index) => close(actual[index], value));

function within(root, path) {
  const fromRoot = relative(root, path);
  return fromRoot !== '' && !isAbsolute(fromRoot) && fromRoot !== '..' && !fromRoot.startsWith('..' + sep);
}

async function localFile(directory, name) {
  require(localName(name), 'Invalid local asset name: ' + name);
  const path = join(directory, name);
  require((await lstat(path)).isFile(), 'Expected a regular file: ' + path);
  return readFile(path);
}

async function receipt(directory, name) {
  const bytes = await localFile(directory, name);
  return { value: JSON.parse(bytes), sha256: digest(bytes), byteLength: bytes.length };
}

async function verifiedFile(directory, spec) {
  require(isHash(spec?.sha256) && Number.isSafeInteger(spec.bytes) && spec.bytes > 0,
    'Invalid payload receipt: ' + spec?.uri);
  const body = await localFile(directory, spec.uri);
  require(body.length === spec.bytes && digest(body) === spec.sha256, 'Payload differs from receipt: ' + spec.uri);
  return { spec, body };
}

function expectedTransport(source) {
  require(Array.isArray(source?.directionEngine) && source.directionEngine.length === 3
    && source.directionEngine.every(Number.isFinite), 'Missing authored source direction.');
  const [x, y, z] = source.directionEngine;
  const degrees = 180 / Math.PI;
  return {
    solarElevationDegrees: Math.atan2(y, Math.hypot(x, z)) * degrees,
    solarAzimuthDegrees: (Math.atan2(x, -z) * degrees + 360) % 360,
    solarDiameterDegrees: source.discDegrees,
    solarIntensity: source.discIntensity,
    atmosphereStrength: source.skyStrength,
    altitudeMetres: 1700,
    airDensity: .89,
    aerosolDensity: .55,
    ozoneDensity: 1,
  };
}

function verifyTransport(actual, expected, label) {
  for (const [name, value] of Object.entries(expected)) {
    require(close(actual?.[name], value), 'Different ' + name + ' in ' + label);
  }
}

function verifyWebp(body, width, height, label) {
  require(body.length >= 30 && body.toString('ascii', 0, 4) === 'RIFF'
    && body.toString('ascii', 8, 12) === 'WEBP' && body.readUInt32LE(4) + 8 === body.length, 'Invalid WebP: ' + label);
  let images = 0;
  for (let offset = 12; offset < body.length;) {
    require(offset + 8 <= body.length, 'Truncated WebP header: ' + label);
    const size = body.readUInt32LE(offset + 4);
    const start = offset + 8;
    const kind = body.toString('ascii', offset, offset + 4);
    require(start + size + size % 2 <= body.length, 'Truncated WebP chunk: ' + label);
    if (kind === 'VP8X') {
      require(size === 10 && !(body[start] & 2), 'Expected a still WebP: ' + label);
      require(body.readUIntLE(start + 4, 3) + 1 === width && body.readUIntLE(start + 7, 3) + 1 === height,
        'Different WebP canvas size: ' + label);
    } else if (kind === 'VP8 ') {
      require(size >= 10 && body.readUIntLE(start + 3, 3) === 0x2a019d
        && (body.readUInt16LE(start + 6) & 0x3fff) === width && (body.readUInt16LE(start + 8) & 0x3fff) === height,
        'Different WebP lossy image size: ' + label);
      images++;
    } else if (kind === 'VP8L') {
      require(size >= 5 && body[start] === 0x2f, 'Invalid WebP lossless image: ' + label);
      const sizeBits = body.readUInt32LE(start + 1);
      require((sizeBits & 0x3fff) + 1 === width && ((sizeBits >>> 14) & 0x3fff) + 1 === height,
        'Different WebP lossless image size: ' + label);
      images++;
    }
    offset = start + size + size % 2;
  }
  require(images === 1, 'Expected exactly one WebP image: ' + label);
}

function verifyKtx(body, size, label) {
  const map = readKtx(body);
  const [format] = map.dataFormatDescriptor;
  // The bundled KTX parser omits the Khronos UASTC model constant.
  const uastc = map.supercompressionScheme === KHR_SUPERCOMPRESSION_ZSTD && format?.colorModel === 166;
  require(map.vkFormat === 0 && map.pixelWidth === size && map.pixelHeight === size
    && !map.pixelDepth && !map.layerCount && map.faceCount === 1 && map.levels.length === 3
    && uastc && format.colorPrimaries === KHR_DF_PRIMARIES_BT709
    && format.transferFunction === KHR_DF_TRANSFER_LINEAR, 'Expected a linear, three-level Basis lightmap: ' + label);
}

require(Object.keys(options).every(name => values[name] && isAbsolute(values[name])),
  'Pass absolute paths for --base, --assets and --out.');
const [baseDirectory, assets, buildDirectory] = await Promise.all([
  realpath(values.base), realpath(values.assets), realpath(new URL('../art/build', import.meta.url)),
]);
const out = join(await realpath(dirname(values.out)), basename(values.out));
require(within(buildDirectory, out)
  && [baseDirectory, assets].every(input => out !== input && !within(input, out) && !within(out, input)),
  'Use a fresh directory under art/build outside both input trees.');

const project = await realpath(new URL('../', import.meta.url));
const [base, lighting, projection, site] = await Promise.all([
  receipt(baseDirectory, 'manifest.json'),
  receipt(join(project, 'shared'), 'snow-court-directional-light.json'),
  receipt(join(project, 'shared'), 'snow-court-backdrop.json'),
  receipt(join(project, 'shared'), 'snow-roof-court-site.json'),
]);
const manifest = base.value;
require(base.sha256 === baseSha256 && manifest.geometryFingerprint === frozenGeometry
  && manifest.place === 'snow-roof' && manifest.partialPreview === true
  && manifest.bake?.samples === 64 && manifest.snowCourt?.revision === site.value.revision
  && manifest.backdrop?.projectionSha256 === projection.sha256 && manifest.backdrop?.siteSha256 === site.sha256,
  'The input must be the exact R54 app-54 package for the frozen Snow Roof site.');

const originalFiles = await Promise.all(manifest.files.map(file => verifiedFile(baseDirectory, file)));
const sourceHashes = new Map();
async function verifiedSourceHashes(hashes, label) {
  require(hashes && Object.keys(hashes).length > 0, 'Missing tracked source digests: ' + label);
  for (const [name, expected] of Object.entries(hashes)) {
    require(/^(art\/blender|shared)\/[a-z0-9_-]+\.(py|json)$/.test(name) && isHash(expected),
      'Invalid source name or digest: ' + label);
    if (!sourceHashes.has(name)) sourceHashes.set(name, digest(await readFile(join(project, name))));
    require(sourceHashes.get(name) === expected, 'Source changed since rendering: ' + name);
  }
}
const backdropAuthor = 'art/blender/snow_court_backdrop.py';
const directionConfig = 'shared/snow-court-directional-light.json';
const farAuthor = 'art/blender/snow_court_directional_backdrop.py';
const nearAuthor = 'art/blender/snow_court_directional_near.py';

async function verifyFar(directory, look, source) {
  const [encoded, rendered] = await Promise.all([receipt(directory, 'encode.json'), receipt(directory, 'render.json')]);
  const spec = encoded.value;
  const master = rendered.value;
  const { width, height, layers } = spec;
  for (const [label, item] of [['encode', spec], ['render', master]]) {
    require(item.lighting === look && item.directionalLightSha256 === lighting.sha256
      && item.projectionSha256 === projection.sha256 && item.siteSha256 === site.sha256
      && sameValues(item.directionEngine, source.directionEngine) && item.alpha === 'straight' && item.samples === 8
      && item.width === width && item.height === height, 'Invalid ' + look + ' far ' + label + ' receipt.');
    verifyTransport(item.lightTransport, expectedTransport(source), look + ' far ' + label);
    await verifiedSourceHashes({
      [backdropAuthor]: item.backdropSourceSha256, [farAuthor]: item.directionalBackdropSourceSha256,
      'art/blender/pine_valley_backdrop.py': item.renderHelpersSha256,
    }, look + ' far ' + label);
  }
  const expectedWidth = projection.value.width / 4;
  const expectedHeight = projection.value.height / 4;
  await verifiedSourceHashes({ 'art/blender/encode_snow_court_directional.py': spec.encoderSha256 }, look + ' WebP encoder');
  require(width === expectedWidth && height === expectedHeight && spec.masterWidth === width && spec.masterHeight === height
    && spec.renderSha256 === rendered.sha256 && spec.encoding === 'log2-8-8' && spec.colorSpace === 'linear'
    && spec.preExposure === projection.value.preExposure && master.runtimePreExposureMultiplier === spec.preExposure
    && master.colorSpace === 'scene-linear Rec.709' && master.exposureAppliedStops === 0 && Object.keys(layers).length === 1
    && layers.far?.uri === 'pine-vista-far.webp' && isHash(master.plates?.far?.sha256)
    && layers.far.masterSha256 === master.plates.far.sha256,
    'Far WebP is missing its matched native Cycles source or encoding: ' + look);
  const { body } = await verifiedFile(directory, layers.far);
  verifyWebp(body, width, height, look);
  const uri = 'snow-relight-' + look + '-far.webp';
  return {
    file: { body, spec: { uri, bytes: body.length, sha256: layers.far.sha256, role: 'runtime-snow-directional-far' } },
    descriptor: { uri, width, height },
    provenance: { renderSha256: rendered.sha256, encodeSha256: encoded.sha256, masterSha256: layers.far.masterSha256 },
  };
}

function verifyWorld(fingerprint, pass, input, transport, preExposure, look) {
  const graph = pass === 'night' ? fingerprint.world : fingerprint.authoredAmbientWorlds?.[pass];
  const sky = graph?.nodes?.find(node => node.type === 'ShaderNodeTexSky');
  const background = graph?.nodes?.find(node => node.type === 'ShaderNodeBackground');
  const properties = sky?.properties;
  const radians = Math.PI / 180;
  require(properties?.sky_type === 'MULTIPLE_SCATTERING' && properties.sun_disc === true
    && graph.links.some(([source, , target, socket]) => source === sky.name && target === background?.name && socket === 'Color'),
    'The actual court bake lost its physical source: ' + look);
  verifyTransport({
    solarElevationDegrees: properties.sun_elevation / radians,
    solarAzimuthDegrees: properties.sun_rotation / radians,
    solarDiameterDegrees: properties.sun_size / radians,
    solarIntensity: properties.sun_intensity,
    atmosphereStrength: background.inputs.Strength * preExposure,
    altitudeMetres: properties.altitude,
    airDensity: properties.air_density,
    aerosolDensity: properties.aerosol_density,
    ozoneDensity: properties.ozone_density,
  }, transport, look + ' actual Cycles court world');
  if (pass === 'night') {
    const bounce = input.nightBounce;
    const lamp = fingerprint.lights?.find(light => light.name === bounce?.name);
    require(bounce?.name === 'Moonlit snow bounce below the east rest-room eave' && lamp?.type === 'AREA'
      && lamp.role === bounce.role && close(lamp.energy, bounce.energy) && lamp.energy > 0
      && close(lamp.shape.size, bounce.sizeMetres) && sameValues(lamp.colour, bounce.linearColour)
      && lamp.worldMatrix.length === 4 && bounce.worldMatrix.length === 4
      && lamp.worldMatrix.every((row, index) => sameValues(row, bounce.worldMatrix[index])),
      'The actual court night bake lost its local physical bounce.');
  }
}

let preparedBaseline;
async function verifyPreparedBaseline(input) {
  require(isAbsolute(input.preparedInput?.path ?? '') && basename(input.preparedInput.path) === 'snow-roof-prepared.blend',
    'Expected the original R54 prepared receiver file.');
  const path = await realpath(input.preparedInput.path);
  require(within(buildDirectory, path), 'The prepared receiver input must be under art/build.');
  if (!preparedBaseline) {
    const directory = dirname(path);
    const bakedDirectory = join(directory, 'baked');
    const [blend, raw, transport] = await Promise.all([
      localFile(directory, basename(path)), receipt(bakedDirectory, 'manifest.json'),
      receipt(bakedDirectory, 'bake-fingerprint.json'),
    ]);
    require(raw.value.bakeFingerprint === manifest.bakeFingerprint
      && raw.value.geometryFingerprint === manifest.geometryFingerprint
      && raw.value.bake.sourceBlendSha256 === manifest.bake.sourceBlendSha256,
      'The original prepared receiver does not match the R54 delivery.');
    preparedBaseline = {
      path, blendSha256: digest(blend), rawSha256: raw.sha256, receiver: raw.value.bake.receiverProfiles.court,
      nightWorld: transport.value.world, nightWorldBakeName: raw.value.bake.sourceNightLighting.world.name,
    };
  }
  require(preparedBaseline.path === path && preparedBaseline.blendSha256 === input.preparedInput.sha256
    && preparedBaseline.rawSha256 === input.baselineManifestSha256
    && preparedBaseline.receiver.receiverFingerprint === input.receiverFingerprint
    && preparedBaseline.receiver.lightmapUVFingerprint === input.lightmapUVFingerprint,
    'Prepared input hash differs from the original R54 bake ledger: ' + input.look);
}

async function verifyCourt(directory, look, source) {
  const court = join(directory, 'court');
  const pass = look === 'night' ? 'night' : 'dusk';
  const [prepared, raw] = await Promise.all([
    receipt(directory, 'snow-roof-prepared.relight.json'), receipt(court, 'manifest.json'),
  ]);
  const input = prepared.value;
  const baked = raw.value;
  const entry = baked.lightmaps?.court?.[pass];
  const receiver = baked.bake?.receiverProfiles?.court;
  const preExposure = manifest.bake.cameraPreExposure;
  const size = manifest.bake.resolutionByRegion.court;
  require(input.look === look && input.pass === pass && input.region === 'court'
    && input.geometryFingerprint === manifest.geometryFingerprint
    && isHash(input.preparedInput?.sha256) && isHash(input.preparedOutput?.sha256)
    && receiver?.receiverFingerprint === input.receiverFingerprint && receiver?.lightmapUVFingerprint === input.lightmapUVFingerprint
    && isHash(input.receiverFingerprint) && isHash(input.lightmapUVFingerprint)
    && input.lightingSourceSha256?.[directionConfig] === lighting.sha256
    && isHash(input.lightingSourceSha256[nearAuthor]), 'The prepared court source is not bound to frozen R54 geometry: ' + look);
  await verifyPreparedBaseline(input);
  await verifiedSourceHashes(input.lightingSourceSha256, look + ' court prepared input');
  require(digest(await localFile(directory, 'snow-roof-prepared.blend')) === input.preparedOutput.sha256,
    'Prepared receiver bytes differ from the receipt: ' + look);
  require(baked.place === manifest.place && baked.geometryFingerprint === manifest.geometryFingerprint
    && isHash(baked.bakeFingerprint) && baked.bake.sourceBlendSha256 === manifest.bake.sourceBlendSha256
    && baked.bake.engine === 'Cycles' && baked.bake.cameraPreExposure === preExposure
    && baked.bake.resolutionByRegion.court === size && baked.bake.samples === 64
    // The baker snapshots the Blender night world by copying the datablock.
    && (pass === 'night' ? baked.bake.sourceNightLighting?.world?.name === preparedBaseline.nightWorldBakeName
      : baked.bake.authoredAmbientWorlds?.[pass] === input.worldName),
    'Court bake binding, configured sample count or world does not match: ' + look);
  require(entry?.uri === 'court-' + pass + '.ktx2' && entry.source === 'court-' + pass + '.exr'
    && entry.encoding === 'log2-hdr' && entry.scale > 0 && Number.isFinite(entry.scale)
    && entry.logGain > 0 && Number.isFinite(entry.logGain) && entry.logRange > 0 && Number.isFinite(entry.logRange)
    && entry.cameraPreExposure === preExposure && entry.samples === 64
    && entry.bakeDevice === 'METAL' && entry.denoiseDevice === 'METAL' && entry.bakeFingerprint === baked.bakeFingerprint
    && entry.quantity === 'diffuse-radiance-per-unit-albedo' && entry.passFilter?.join() === 'DIRECT,INDIRECT'
    && entry.mipLevels === 3 && entry.pngMipmaps?.length === 3, 'Invalid direct and indirect court atlas: ' + look);
  const transport = expectedTransport(pass === 'night' ? projection.value.light.night : source);
  const directionLength = Math.hypot(...source.directionEngine);
  require(sameValues(input.lightTransport?.directionEngine, source.directionEngine.map(value => value / directionLength)),
    'Different court light direction: ' + look);
  verifyTransport(input.lightTransport, transport, look + ' saved court world');
  const fingerprint = await receipt(court, 'bake-fingerprint.json');
  require(fingerprint.value.sourceBlendSha256 === baked.bake.sourceBlendSha256
    && fingerprint.value.receivers?.court?.receiverFingerprint === input.receiverFingerprint
    && fingerprint.value.receivers?.court?.lightmapUVFingerprint === input.lightmapUVFingerprint,
    'The actual bake used a different receiver or source: ' + look);
  if (pass === 'night') require(isDeepStrictEqual(fingerprint.value.world, preparedBaseline.nightWorld),
    'The court night sky graph differs from the accepted R54 bake.');
  verifyWorld(fingerprint.value, pass, input, transport, preExposure, look);
  const [packed, master, ...mipmaps] = await Promise.all([
    receipt(court, entry.uri + '.json'), localFile(court, entry.source),
    ...entry.pngMipmaps.map(name => localFile(court, name)),
  ]);
  const codec = packed.value.codec;
  require(codec === 'uastc', 'Expected the default UASTC court lightmap encoder: ' + look);
  const key = 'uastc2-rdo1-zstd18-linear-3:' + mipmaps.map(digest).join(':');
  require(packed.value.key === key && packed.value.transfer === 'linear' && packed.value.mipLevels === 3,
    'Court KTX2 encoder receipt differs from the baked mipmaps: ' + look);
  const { body } = await verifiedFile(court, { ...packed.value, uri: entry.uri });
  verifyKtx(body, size, look);
  const uri = 'snow-relight-' + look + '-court.ktx2';
  return {
    file: { body, spec: { uri, bytes: body.length, sha256: packed.value.sha256, codec, mipLevels: 3, transfer: 'linear',
      role: 'runtime-snow-directional-court' } },
    descriptor: { uri, scale: entry.scale, logRange: entry.logRange, logGain: entry.logGain },
    provenance: {
      preparedReceiptSha256: prepared.sha256, preparedBlendSha256: input.preparedOutput.sha256,
      bakeManifestSha256: raw.sha256, transportReceiptSha256: fingerprint.sha256, bakeFingerprint: baked.bakeFingerprint,
      masterSha256: digest(master), packedReceiptSha256: packed.sha256,
    },
  };
}

const tiers = Object.fromEntries(Object.entries(limits).map(([tier, bytes]) => [tier + 'LimitBytes', bytes]));
const baseIndex = new Map(originalFiles.map(file => [file.spec.uri, file.spec.bytes]));
require(baseIndex.size === originalFiles.length, 'Duplicate R54 payloads.');
function countStreams(uris) {
  require(new Set(uris).size === uris.length && uris.every(uri => baseIndex.has(uri)), 'Invalid R54 stream ledger.');
  return uris.reduce((total, uri) => total + baseIndex.get(uri), 0);
}
const highUris = Object.values(manifest.backdrop.high.layers);
const walkUris = [
  ...Object.values(manifest.backdrop.night.layers), ...Object.values(manifest.backdrop.walk.layers),
  ...Object.entries(manifest.walkLightmaps).flatMap(([region, passes]) =>
    Object.keys(passes).map(pass => manifest.lightmaps[region][pass].uri)),
];
const highBytes = countStreams(highUris);
const walkBytes = countStreams(walkUris);
countStreams([...highUris, ...walkUris]);
const originalPayload = [...baseIndex.values()].reduce((total, bytes) => total + bytes, 0);
const sharedBytes = manifest.sharedVisualAssets.reduce((total, file) => total + file.bytes, 0);
function budget(manifestBytes, relightBytes) {
  const desktopBytes = originalPayload + sharedBytes + manifestBytes + relightBytes;
  const phoneBytes = desktopBytes - highBytes;
  return { baseBytes: phoneBytes - walkBytes - relightBytes, phoneBytes, desktopBytes, ...tiers };
}
require(manifest.payloadBytes === originalPayload && manifest.totalBytes === originalPayload
  && manifest.manifestBytes === base.byteLength && manifest.sharedVisualBytes === sharedBytes
  && Object.entries(budget(base.byteLength, 0)).every(([name, value]) => manifest.budget[name] === value)
  && manifest.completePackageBytes === manifest.budget.desktopBytes, 'The R54 base byte ledger is inconsistent.');

const files = [...originalFiles];
const descriptors = {};
const provenance = {};
for (const look of looks) {
  const source = lighting.value.looks[look];
  const directory = join(assets, look);
  const [far, court] = await Promise.all([
    verifyFar(join(directory, 'far'), look, source), verifyCourt(directory, look, source),
  ]);
  files.push(far.file, court.file);
  descriptors[look] = { directionEngine: source.directionEngine, far: far.descriptor, court: court.descriptor };
  provenance[look] = { far: far.provenance, court: court.provenance };
}
require(new Set(files.map(file => file.spec.uri)).size === files.length, 'Relight payload conflicts with an R54 URI.');
const relightBytes = files.slice(originalFiles.length).reduce((total, file) => total + file.spec.bytes, 0);
manifest.files = files.map(file => file.spec);
manifest.snowCourtRelight = {
  version: 1, looks: descriptors, provenance: { baseManifestSha256: base.sha256, configurationSha256: lighting.sha256, looks: provenance },
};
manifest.payloadBytes = manifest.totalBytes = originalPayload + relightBytes;
const encode = () => Buffer.from(JSON.stringify(manifest) + '\n');
manifest.manifestBytes = 0;
for (let attempt = 0; attempt < 8; attempt++) {
  const manifestBytes = encode().length;
  if (manifest.manifestBytes === manifestBytes) break;
  manifest.manifestBytes = manifestBytes;
  manifest.budget = budget(manifestBytes, relightBytes);
  manifest.completePackageBytes = manifest.budget.desktopBytes;
}
const serialized = encode();
require(serialized.length === manifest.manifestBytes, 'Manifest byte count did not converge.');
for (const [tier, limit] of Object.entries(limits)) {
  require(manifest.budget[tier + 'Bytes'] <= limit, 'Snow Roof exceeds its ' + tier + ' byte budget.');
}
await mkdir(out);
try {
  for (const { spec, body } of files) await writeFile(join(out, spec.uri), body, { flag: 'wx' });
  await writeFile(join(out, 'manifest.json'), serialized, { flag: 'wx' });
} catch (error) {
  await rm(out, { recursive: true });
  throw error;
}
console.log('SNOW_COURT_RELIGHT_BUDGET', JSON.stringify({ ...manifest.budget, relightBytes, manifestBytes: manifest.manifestBytes }));
console.log('SNOW_COURT_RELIGHT_PACKAGE', digest(serialized), out);
