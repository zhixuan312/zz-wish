// Change only Zstandard frames inside the already audited UASTC textures.
// Keep decoded blocks, texture metadata, and the compressed geometry intact.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { constants, zstdCompressSync, zstdDecompressSync } from 'node:zlib';
import { read, write, KHR_SUPERCOMPRESSION_ZSTD } from 'three/examples/jsm/libs/ktx-parse.module.js';
import { ZSTDDecoder } from 'three/examples/jsm/libs/zstddec.module.js';

const [source, output] = process.argv.slice(2).map(path => resolve(path));
assert(source && output && source !== output, 'Supply an input package and a new output directory.');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const decoder = new ZSTDDecoder();
await decoder.init();
const textures = [];

function recompressTexture(input, texture) {
  const ktx = read(input);
  if (ktx.supercompressionScheme !== KHR_SUPERCOMPRESSION_ZSTD) return input;
  assert.equal(ktx.dataFormatDescriptor[0].colorModel, 166, 'Expected UASTC around the Zstandard frames.');
  const mipHashes = [];
  let bytesSaved = 0;
  for (const mip of ktx.levels) {
    const raw = zstdDecompressSync(mip.levelData);
    assert.equal(raw.length, mip.uncompressedByteLength);
    const smaller = zstdCompressSync(raw, { params: { [constants.ZSTD_c_compressionLevel]: 22 } });
    const wasmDecoded = decoder.decode(smaller, raw.length);
    assert(Buffer.from(wasmDecoded).equals(raw), 'Three.js Zstandard decoder changed the UASTC blocks.');
    mipHashes.push(digest(raw));
    if (smaller.length < mip.levelData.length) {
      bytesSaved += mip.levelData.length - smaller.length;
      mip.levelData = smaller;
    }
  }
  // Keep the file and all key/value bytes when a second Zstandard pass brings
  // no saving. The writer may change padding around smaller payloads.
  if (!bytesSaved) return input;
  const packed = Buffer.from(write(ktx, { keepWriter: true }));
  if (packed.length >= input.length) return input;
  const checked = read(packed);
  for (const field of ['vkFormat', 'typeSize', 'pixelWidth', 'pixelHeight', 'pixelDepth',
    'layerCount', 'faceCount', 'levelCount', 'supercompressionScheme']) {
    assert.equal(checked[field], ktx[field]);
  }
  assert.deepEqual(checked.dataFormatDescriptor, ktx.dataFormatDescriptor);
  assert.deepEqual(checked.keyValue, ktx.keyValue);
  for (const [i, { levelData, uncompressedByteLength }] of checked.levels.entries()) {
    assert.equal(digest(decoder.decode(levelData, uncompressedByteLength)), mipHashes[i]);
  }
  textures.push({ texture, inputBytes: input.length, outputBytes: packed.length, mipHashes });
  return packed;
}

function recompressGlb(input) {
  assert.equal(input.readUInt32LE(0), 0x46546c67);
  assert.equal(input.readUInt32LE(8), input.length);
  assert.equal(input.readUInt32LE(16), 0x4e4f534a);
  const binHeader = 20 + input.readUInt32LE(12);
  assert.equal(input.readUInt32LE(binHeader + 4), 0x004e4942);
  assert.equal(binHeader + 8 + input.readUInt32LE(binHeader), input.length);
  const gltf = JSON.parse(input.toString('utf8', 20, binHeader));
  const bin = Buffer.from(input.subarray(binHeader + 8));
  const rewritten = new Set();
  for (const image of gltf.images ?? []) {
    if (image.mimeType !== 'image/ktx2' || image.bufferView === undefined) continue;
    const view = gltf.bufferViews[image.bufferView];
    assert.equal(view.buffer, 0);
    assert(!view.extensions);
    const start = view.byteOffset ?? 0;
    const end = start + view.byteLength;
    const original = bin.subarray(start, end);
    const packed = recompressTexture(original, image.name ?? String(image.bufferView));
    if (packed === original) continue;
    assert(packed.length < original.length);
    for (const other of gltf.bufferViews) {
      if (other === view) continue;
      for (const range of [other, other.extensions?.EXT_meshopt_compression]) {
        if (range?.buffer !== 0) continue;
        const offset = range.byteOffset ?? 0;
        assert(end <= offset || start >= offset + range.byteLength, 'Texture data overlaps an unrelated stream.');
      }
    }
    bin.fill(0, start, end);
    packed.copy(bin, start);
    view.byteLength = packed.length;
    rewritten.add(image.bufferView);
  }
  if (!rewritten.size) return input;
  // Keep offsets stable for all meshopt streams. The enclosing model
  // container compresses the newly cleared space between images.
  const metadata = Buffer.from(JSON.stringify(gltf));
  const jsonLength = Math.ceil(metadata.length / 4) * 4;
  const out = Buffer.alloc(28 + jsonLength + bin.length, 0x20);
  input.copy(out, 0, 0, 20);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jsonLength, 12);
  metadata.copy(out, 20);
  input.copy(out, 20 + jsonLength, binHeader, binHeader + 8);
  bin.copy(out, 28 + jsonLength);
  return out;
}

const manifestBytes = await readFile(join(source, 'manifest.json'));
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.place, 'pine-gate');
assert(!manifest.compression.container, 'Recompress textures before wrapping the GLB.');
await mkdir(output);
for (const file of manifest.files) {
  assert.equal(file.uri, basename(file.uri));
  const input = await readFile(join(source, file.uri));
  assert.equal(input.length, file.bytes);
  assert.equal(digest(input), file.sha256);
  let packed = input;
  if (file.uri.endsWith('.ktx2')) packed = recompressTexture(input, file.uri);
  if (file.uri.endsWith('.glb')) packed = recompressGlb(input);
  file.bytes = packed.length;
  file.sha256 = digest(packed);
  await writeFile(join(output, file.uri), packed, { flag: 'wx' });
}
for (const maps of Object.values(manifest.lightmaps)) {
  for (const map of Object.values(maps)) map.bytes = manifest.files.find(file => file.uri === map.uri).bytes;
}
manifest.payloadBytes = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
manifest.totalBytes = manifest.payloadBytes;
const serialize = () => JSON.stringify(manifest) + '\n';
for (let i = 0; i < 8; i++) {
  const bytes = Buffer.byteLength(serialize());
  if (manifest.manifestBytes === bytes) break;
  manifest.manifestBytes = bytes;
  manifest.completePackageBytes = bytes + manifest.payloadBytes + (manifest.sharedVisualBytes ?? 0);
}
const serialized = serialize();
assert.equal(manifest.manifestBytes, Buffer.byteLength(serialized));
await writeFile(join(output, 'manifest.json'), serialized, { flag: 'wx' });
await writeFile(join(output, 'zstd-texture-receipt.json'), JSON.stringify({
  inputManifestSha256: digest(manifestBytes), outputManifestSha256: digest(serialized),
  scope: 'Exact UASTC blocks, texture metadata, and existing geometry streams.',
  textures,
}, null, 2) + '\n', { flag: 'wx' });
console.log('PINE_ZSTD_TEXTURES', textures.length, 'saved', textures.reduce((sum, texture) =>
  sum + texture.inputBytes - texture.outputBytes, 0), 'bytes before model container wrapping.');
