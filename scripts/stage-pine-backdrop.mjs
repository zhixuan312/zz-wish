// Keep the audited near package immutable and account for every added byte.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readPineBackdrop, readPineWaxNormal } from '../web/src/engine/baked/pineManifest.js';

const { values } = parseArgs({ options: Object.fromEntries(
  ['near', 'plates', 'sculpt', 'out'].map(name => [name, { type: 'string' }]),
) });
const required = ['near', 'plates', 'sculpt', 'out'];
if (required.some(name => !values[name])) throw new Error('Specify --near, --plates, --sculpt and --out.');
const [near, plates, sculpt, out] = required.map(name => resolve(values[name]));
if ([near, plates, sculpt].includes(out)) throw new Error('Use a new staging directory.');
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
manifest.files = sourceFiles.map(([, spec]) => spec);
readPineBackdrop(manifest);
readPineWaxNormal(manifest);
if (new Set(manifest.files.map(file => file.uri)).size !== sourceFiles.length) throw new Error('Duplicate delivery path.');
for (const [directory, file] of sourceFiles) {
  if (basename(file.uri) !== file.uri) throw new Error('Delivery expects a local asset name.');
  const body = await readFile(join(directory, file.uri));
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
const baseBytes = manifest.completePackageBytes + nativeAgXBytes;
const budget = {
  baseBytes, limitBytes: 15_000_000, nativeAgXBytes,
  nearManifestSha256: digest(nearManifest), nearPayloadBytes: sourceFiles
    .filter(([directory]) => directory === near).reduce((sum, [, file]) => sum + file.bytes, 0),
  backdropBytes: Object.fromEntries(layers.map(([name, spec]) => [name, spec.bytes])),
  waxNormalBytes: wax.bytes, width: encoded.width, height: encoded.height,
};
console.log('PINE_BACKDROP_BUDGET', JSON.stringify(budget));
if (baseBytes > budget.limitBytes) throw new Error('The backdrop candidate exceeds the Pine Gate base asset budget.');
await mkdir(out);
for (const [directory, { uri }] of sourceFiles) await copyFile(join(directory, uri), join(out, uri));
await writeFile(join(out, 'manifest.json'), serialized, { flag: 'wx' });
console.log('PINE_BACKDROP_PACKAGE', digest(Buffer.from(serialized)));
