// Keep the audited near package immutable and account for every added byte.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import projection from '../shared/pine-gate-backdrop.json' with { type: 'json' };
import { readPineBackdrop, readPineWaxNormal } from '../web/src/engine/baked/pineManifest.js';

const { values } = parseArgs({ options: Object.fromEntries(
  ['near', 'plates', 'sculpt', 'out', 'high', 'high-trees'].map(name => [name, { type: 'string' }]),
) });
const required = ['near', 'plates', 'sculpt', 'out'];
if (required.some(name => !values[name])) throw new Error('Specify --near, --plates, --sculpt and --out.');
const [near, plates, sculpt, out] = required.map(name => resolve(values[name]));
const high = values.high === undefined ? null : resolve(values.high);
const highTrees = values['high-trees'] === undefined ? null : resolve(values['high-trees']);
if (highTrees && !high) throw new Error('High trees require the desktop backdrop tier.');
if ([near, plates, sculpt, high, highTrees].includes(out)) throw new Error('Use a new staging directory.');
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const digest = data => createHash('sha256').update(data).digest('hex');
const nearManifest = await readFile(join(near, 'manifest.json'));
const manifest = JSON.parse(nearManifest);
if (manifest.place !== 'pine-gate' || manifest.backdrop || manifest.waxSculpt) {
  throw new Error('Expected the original Pine Gate near-scene package.');
}
const plateReceipt = await readFile(join(plates, 'encode.json'));
const encoded = JSON.parse(plateReceipt);
const sculptReceipt = await readJSON(join(sculpt, 'wax-sculpt.json'));
const wax = sculptReceipt.normalMaps.pillar;
const layers = Object.entries(encoded.layers);
manifest.backdrop = {
  encoding: encoded.encoding, width: encoded.width, height: encoded.height,
  layers: Object.fromEntries(layers.map(([name, spec]) => [name, spec.uri])),
  encodedReceiptSha256: digest(plateReceipt),
};
manifest.waxSculpt = { normal: wax.uri, sourceSha256: sculptReceipt.sourceSha256 };
const sourceFiles = [
  ...manifest.files.map(spec => [near, spec]),
  ...layers.map(([, spec]) => [plates, { uri: spec.uri, bytes: spec.bytes, sha256: spec.sha256 }]),
  [sculpt, { uri: wax.uri, bytes: wax.bytes, sha256: wax.sha256 }],
];
if (high) {
  const highReceipt = await readFile(join(high, 'encode.json'));
  const highEncoded = JSON.parse(highReceipt);
  if (highEncoded.width !== projection.width || highEncoded.height !== projection.height) {
    throw new Error('The high backdrop must use the full authored dimensions.');
  }
  if (encoded.preExposure !== projection.preExposure || encoded.colorSpace !== 'linear' || encoded.alpha !== 'straight') {
    throw new Error('Backdrop tiers need the authored exposure, linear color and straight alpha.');
  }
  const sameField = (base, upgrade, key, context) => {
    if (base[key] !== upgrade[key]) throw new Error(`Backdrop tiers disagree on ${context} ${key}.`);
    if (key.endsWith('Sha256') && base[key] !== undefined && (typeof base[key] !== 'string' || !/^[a-f0-9]{64}$/.test(base[key]))) {
      throw new Error(`Invalid backdrop fingerprint for ${context} ${key}.`);
    }
  };
  for (const key of ['encoding', 'preExposure', 'colorSpace', 'alpha', 'masterWidth', 'masterHeight', 'renderSha256', 'sourceSha256', 'recipeSha256']) {
    sameField(encoded, highEncoded, key, 'receipt');
  }
  const highLayers = Object.entries(highEncoded.layers);
  if (highLayers.length !== layers.length) throw new Error('Both backdrop tiers must declare the same layer names.');
  const renamed = highLayers.map(([name, spec]) => {
    const base = encoded.layers[name];
    if (!base || spec.uri !== `pine-vista-${name}.webp`) throw new Error(`Unexpected high backdrop source for ${name}.`);
    for (const key of ['masterSha256', 'sourceSha256', 'recipeSha256']) sameField(base, spec, key, name);
    return [name, spec, `pine-vista-high-${name}.webp`];
  });
  manifest.backdrop.high = {
    encoding: highEncoded.encoding, width: highEncoded.width, height: highEncoded.height,
    layers: Object.fromEntries(renamed.map(([name, , uri]) => [name, uri])),
    encodedReceiptSha256: digest(highReceipt),
  };
  sourceFiles.push(...renamed.map(([, spec, uri]) => [high, { uri, bytes: spec.bytes, sha256: spec.sha256 }, spec.uri]));
}
if (highTrees) {
  const receipt = await readFile(join(highTrees, 'pine-native-trees.json'));
  const { file } = JSON.parse(receipt);
  if (file?.uri !== 'pine-native-trees.glb') throw new Error('Expected the verified native tree model.');
  manifest.backdrop.high.trees = file.uri;
  manifest.backdrop.high.treeReceiptSha256 = digest(receipt);
  sourceFiles.push([highTrees, { uri: file.uri, bytes: file.bytes, sha256: file.sha256 }]);
}
manifest.files = sourceFiles.map(([, spec]) => spec);
const backdrop = readPineBackdrop(manifest);
if (high && !backdrop.high) throw new Error('Missing verified high backdrop declaration.');
readPineWaxNormal(manifest);
if (new Set(manifest.files.map(file => file.uri)).size !== sourceFiles.length) throw new Error('Duplicate delivery path.');
for (const [directory, file, source = file.uri] of sourceFiles) {
  if (basename(file.uri) !== file.uri || basename(source) !== source) throw new Error('Delivery expects a local asset name.');
  const body = await readFile(join(directory, source));
  if (body.length !== file.bytes || digest(body) !== file.sha256) throw new Error(`Stale delivery asset ${file.uri}`);
}

manifest.payloadBytes = manifest.files.reduce((sum, { bytes }) => sum + bytes, 0);
manifest.totalBytes = manifest.payloadBytes;
const nativeAgXBytes = (await stat(new URL('../web/public/color/native-agx-57-f16.bin.zst', import.meta.url))).size;
const encode = () => JSON.stringify(manifest) + '\n';
for (let pass = 0; pass < 12; pass++) {
  const bytes = Buffer.byteLength(encode());
  if (manifest.manifestBytes === bytes && manifest.completePackageBytes === bytes + manifest.payloadBytes) break;
  manifest.manifestBytes = bytes;
  manifest.completePackageBytes = bytes + manifest.payloadBytes;
}
const serialized = encode();
if (Buffer.byteLength(serialized) !== manifest.manifestBytes) throw new Error('Manifest bytes did not converge.');
const highFiles = Object.values(backdrop.high?.files ?? {});
if (backdrop.high?.trees) highFiles.push(backdrop.high.trees);
const highBytes = highFiles.reduce((sum, file) => sum + file.bytes, 0);
const combinedBytes = manifest.completePackageBytes + nativeAgXBytes;
const baseBytes = combinedBytes - highBytes;
const budget = {
  baseBytes, limitBytes: 15_000_000, nativeAgXBytes,
  nearManifestSha256: digest(nearManifest), nearPayloadBytes: sourceFiles
    .filter(([directory]) => directory === near).reduce((sum, [, file]) => sum + file.bytes, 0),
  backdropBytes: Object.fromEntries(layers.map(([name, spec]) => [name, spec.bytes])),
  waxNormalBytes: wax.bytes, width: encoded.width, height: encoded.height,
  ...(high ? {
    combinedBytes, combinedLimitBytes: 40_000_000, highBytes,
    highBackdropBytes: Object.fromEntries(Object.entries(backdrop.high.files).map(([name, file]) => [name, file.bytes])),
    ...(backdrop.high.trees ? { highTreeBytes: backdrop.high.trees.bytes } : {}),
  } : {}),
};
console.log('PINE_BACKDROP_BUDGET', JSON.stringify(budget));
if (baseBytes > budget.limitBytes) throw new Error('The backdrop candidate exceeds the Pine Gate base asset budget.');
if (combinedBytes > 40_000_000) throw new Error('The backdrop candidate exceeds the combined Pine Gate desktop asset budget.');
await mkdir(out);
for (const [directory, { uri }, source = uri] of sourceFiles) await copyFile(join(directory, source), join(out, uri));
await writeFile(join(out, 'manifest.json'), serialized, { flag: 'wx' });
console.log('PINE_BACKDROP_PACKAGE', digest(Buffer.from(serialized)));
