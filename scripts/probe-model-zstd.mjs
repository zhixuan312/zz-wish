#!/usr/bin/env node
/** CPU-only, byte-exact MODEL Zstd container probe; never changes source assets. */
import { readFile, writeFile, mkdir, access, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { gunzipSync } from 'node:zlib';
import { ZSTDDecoder } from '../node_modules/three/examples/jsm/libs/zstddec.module.js';

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), '..');
const options = {};
const allowed = new Set(['--source', '--out', '--expected-sha256', '--expected-bytes', '--zstd', '--gzip-bytes', '--brotli-bytes', '--gzip-reference', '--brotli-reference']);
for (let i = 2; i < process.argv.length; i += 2) {
  if (!allowed.has(process.argv[i]) || process.argv[i + 1] === undefined) throw Error('Expected paired supported options');
  options[process.argv[i]] = process.argv[i + 1];
}
for (const key of ['--source', '--out', '--expected-sha256', '--expected-bytes']) {
  if (!options[key]) throw Error(`Missing ${key}`);
}
const source = resolve(options['--source']);
const out = resolve(options['--out']);
if (!source.endsWith('.glb')) throw Error('A single actual GLB model is required');
if (!out.startsWith(root + '/art/build/') || await access(out).then(() => true, () => false)) {
  throw Error('A new ignored study directory under art/build is required');
}
execFileSync('git', ['check-ignore', '--quiet', '--', out], { cwd: root });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const binding = (path, bytes) => ({ path: relative(root, path), bytes: bytes.length, sha256: sha256(bytes) });
const original = await readFile(source);
if (original.length !== Number(options['--expected-bytes']) || sha256(original) !== options['--expected-sha256']) {
  throw Error('Immutable input byte length or SHA256 differs');
}
const manifestPath = resolve(dirname(source), 'manifest.json');
const manifest = await readFile(manifestPath).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
const zstdPath = await realpath(options['--zstd'] ?? '/opt/homebrew/bin/zstd');
const zstdBinary = await readFile(zstdPath);
const zstdLibraryPath = await realpath(resolve(dirname(zstdPath), '../lib/libzstd.1.dylib')).catch(() => null);
const zstdLibrary = zstdLibraryPath ? await readFile(zstdLibraryPath) : null;
const decoderPath = resolve(root, 'node_modules/three/examples/jsm/libs/zstddec.module.js');
const decoderSource = await readFile(decoderPath);
const embeddedWasmBase64 = decoderSource.toString().match(/const C="([A-Za-z0-9+/=]+)";/)?.[1];
if (!embeddedWasmBase64) throw Error('Actual Three decoder embedded WASM binding not found');
const threePackagePath = resolve(root, 'node_modules/three/package.json');
const threePackage = await readFile(threePackagePath);
if (JSON.parse(threePackage).version !== '0.160.0') throw Error('Actual Three160 is required');
const nativeVersion = execFileSync(zstdPath, ['--version'], { encoding: 'utf8' }).trim();
await mkdir(out, { recursive: true });
const compressedPath = resolve(out, 'snow-roof.glb.zst');
const nativeDecodedPath = resolve(out, 'native-decoded.glb');
const wasmDecodedPath = resolve(out, 'three160-wasm-decoded.glb');
const report = {
  scope: 'CPU-only lossless MODEL container study. A single immutable GLB was compressed. No maps, runtime, loader, source, baker or pack changes. No browser, GPU, render, native bake, adoption or runtime performance claim.',
  startedAt: new Date().toISOString(),
  invocation: [process.execPath, scriptPath, ...process.argv.slice(2)],
  source: binding(source, original),
  sourceManifest: manifest ? binding(manifestPath, manifest) : null,
  tools: {
    script: binding(scriptPath, await readFile(scriptPath)),
    node: { version: process.version, executable: binding(await realpath(process.execPath), await readFile(process.execPath)) },
    nativeZstd: { version: nativeVersion, executable: binding(zstdPath, zstdBinary), adjacentLibZstd: zstdLibrary ? binding(zstdLibraryPath, zstdLibrary) : null },
    three: { version: '0.160.0', package: binding(threePackagePath, threePackage) },
    decoderModule: binding(decoderPath, decoderSource),
    decoderEmbeddedWasm: { bytes: Buffer.from(embeddedWasmBase64, 'base64').length, sha256: sha256(Buffer.from(embeddedWasmBase64, 'base64')) }
  },
  timingScope: 'One local run. Native wall times include process startup and file I/O. WASM init/decode wall times are measured in Node. These are probe timings, not browser/runtime performance evidence.',
  commands: {},
  timingsMilliseconds: {},
  outputs: {},
  comparisonReferences: {}
};
function native(commandName, args) {
  report.commands[commandName] = [zstdPath, ...args];
  const start = performance.now();
  const output = execFileSync(zstdPath, args, { encoding: 'utf8', timeout: 360000, maxBuffer: 4 * 1024 * 1024 });
  report.timingsMilliseconds[commandName] = performance.now() - start;
  return output;
}
native('encode', ['--ultra', '-22', '--single-thread', '--no-progress', '-q', source, '-o', compressedPath]);
const compressed = await readFile(compressedPath);
report.outputs.compressed = binding(compressedPath, compressed);
native('nativeDecode', ['--decompress', '--single-thread', '--no-progress', '-q', compressedPath, '-o', nativeDecodedPath]);
const nativeDecoded = await readFile(nativeDecodedPath);
report.outputs.nativeDecoded = { ...binding(nativeDecodedPath, nativeDecoded), equalsOriginalBytes: nativeDecoded.equals(original) };
if (!nativeDecoded.equals(original)) throw Error('Native decoded bytes differ from original GLB');
const decoder = new ZSTDDecoder();
let start = performance.now();
await decoder.init();
report.timingsMilliseconds.three160WasmInit = performance.now() - start;
start = performance.now();
const wasmDecoded = Buffer.from(decoder.decode(new Uint8Array(compressed), original.length));
report.timingsMilliseconds.three160WasmDecode = performance.now() - start;
if (!wasmDecoded.equals(original)) throw Error('Actual Three160 WASM decoded bytes differ from original GLB');
await writeFile(wasmDecodedPath, wasmDecoded, { flag: 'wx' });
report.outputs.three160WasmDecoded = { ...binding(wasmDecodedPath, wasmDecoded), equalsOriginalBytes: true };
report.compression = { level: 22, threads: 'single-thread', dictionary: null, originalBytes: original.length, compressedBytes: compressed.length, savedBytes: original.length - compressed.length, savedFraction: 1 - compressed.length / original.length };
for (const codec of ['gzip', 'brotli']) {
  if (options[`--${codec}-bytes`]) {
    const bytes = Number(options[`--${codec}-bytes`]);
    if (!Number.isSafeInteger(bytes) || bytes <= 0) throw Error('Comparison reference bytes must be positive integers');
    report.comparisonReferences[codec] = { bytes, provenance: 'Supplied prior measurement; this probe did not re-encode this codec', zstdSavedBytes: bytes - compressed.length, zstdSavedFraction: 1 - compressed.length / bytes };
  }
}
if (options['--gzip-reference']) {
  const path = resolve(options['--gzip-reference']);
  const bytes = await readFile(path);
  if (!gunzipSync(bytes).equals(original)) throw Error('Frozen gzip reference does not decode to original GLB');
  if (report.comparisonReferences.gzip?.bytes !== bytes.length) throw Error('Frozen gzip size differs from supplied comparison');
  const pathManifest = resolve(dirname(path), 'manifest.json');
  const bytesManifest = await readFile(pathManifest);
  const file = JSON.parse(bytesManifest).files.find(item => item.uri === relative(dirname(path), path));
  if (file?.bytes !== bytes.length || file?.sha256 !== sha256(bytes) || file?.decodedSha256 !== sha256(original)) throw Error('Frozen gzip manifest binding differs');
  Object.assign(report.comparisonReferences.gzip, { provenance: 'Actual frozen gzip file; decode to original verified in this probe; not re-encoded', file: binding(path, bytes), manifest: binding(pathManifest, bytesManifest), decodedEqualsOriginalBytes: true });
}
if (options['--brotli-reference']) {
  const path = resolve(options['--brotli-reference']);
  const bytes = await readFile(path);
  const receipt = JSON.parse(bytes);
  const candidate = receipt.candidates.find(item => item.codec === 'br' && item.quality === 11);
  if (receipt.input.sha256 !== sha256(original) || receipt.input.bytes !== original.length || candidate?.bytes !== report.comparisonReferences.brotli?.bytes || !candidate?.decodedByteExact) throw Error('Brotli reference receipt differs from original/input comparison');
  Object.assign(report.comparisonReferences.brotli, { provenance: 'Prior actual Brotli q11 size-only receipt bound by SHA256; compressed file was not retained; not re-encoded or decoded in this probe', receipt: binding(path, bytes), quality: 11, recordedCompressedSha256: candidate.sha256, priorReceiptDecodedByteExact: true });
}
if (!(await readFile(source)).equals(original)) throw Error('Immutable model changed during study');
if (manifest && !(await readFile(manifestPath)).equals(manifest)) throw Error('Source manifest changed during study');
if (!(await readFile(zstdPath)).equals(zstdBinary) || !(await readFile(decoderPath)).equals(decoderSource)) throw Error('Bound encoder/decoder changed during study');
if (zstdLibrary && !(await readFile(zstdLibraryPath)).equals(zstdLibrary)) throw Error('Bound native Zstd library changed during study');
report.sourceUnchangedAfterProbe = true;
report.completedAt = new Date().toISOString();
const reportPath = resolve(out, 'model-zstd-study.json');
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'complete', report: relative(root, reportPath), compressed: report.outputs.compressed, originalBytes: original.length, nativeExact: true, three160WasmExact: true, timingsMilliseconds: report.timingsMilliseconds, comparisons: report.comparisonReferences }));
