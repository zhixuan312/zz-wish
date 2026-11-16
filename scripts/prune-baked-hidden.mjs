#!/usr/bin/env node
/**
 * Make an export-only derivative of the audited, frozen Snow Roof Meshopt GLB.
 *
 * Run only after the isolated capture hands CPU time back:
 *   node scripts/prune-baked-hidden.mjs \
 *     --input art/build/snow-roof-xatlas-final/snow-roof.packed.glb \
 *     --output art/build/snow-roof-export-optimized/snow-roof.glb
 *
 * No Blender process, render, bake, image conversion, re-unwrap, normal
 * recalculation, simplification, instancing or deformation is performed.
 * Sources, bake receivers/occluders, masters, pack caches and public are read-only.
 *
 * This is deliberately a frozen-asset profile, not a general UV-marker cleaner.
 * Its hashes pin the previously completed source FACE-flag -> raw-GLB audit.
 * A regenerated or mobile asset requires a new explicit provenance audit/profile.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = Object.freeze({
  id: 'snow-roof-stable-xatlas-final-2026-11-16',
  hashes: {
    proof: 'c64adb44283c4cd766921392da95b113767ddceab4dca44192e350caf5aeeae2',
    sourceBlend: '73af75982e5dc97741afb994403dde0d8b1f65a826d84adbed56dd6438873997',
    preparedBlend: '6f0a15108283be8861e0dbca5b94aab391f35b8611e4efcd469154e4dd9bfdf7',
    raw: 'a2d132a0dc6f5ca8b768ff8b77f110d47bec8590f288c6adcf861c28dda7daf2',
    input: 'bcb6ee82e1ee3ffc212713818550475e845ca162fc4074763264e29fef7e3a05',
  },
  regions: {
    hall: { material: 'Dark clay roof tile', triangles: 95790, components: 2905 },
    court: { material: 'Side hall roof tiles', triangles: 65394, components: 1987 },
    gate: { material: 'Gate roof tiles', triangles: 22566, components: 685 },
  },
  input: { bytes: 37938024, vertices: 948833, triangles: 639080, images: 24, imageBytes: 24909483 },
  output: {
    bytes: 34730292, vertices: 641407, triangles: 455330,
    sha256: '9e873b43ff81971cafdc2a070bd9cba78a92e22f151732cede82a6a27262484f',
  },
  faceAudit: {
    matchedTriangles: 183750, unmatchedSourceTriangles: 0, unmatchedRawTriangles: 0,
    method: 'Exact local float32 triangle-position multisets from prepared one_light_uv_excluded FACE booleans matched to the hash-pinned raw GLB.',
    minimumSnowClearanceMetres: 0.02008267305791378,
    representativeCameraRays: 44616,
    snowBlockedCameraRays: 44616,
  },
});
const HELP = [
  'Export-only hidden-tile pruning and exact packed-vertex welding.',
  '',
  'Required:',
  '  --input PATH          Audited frozen snow-roof.packed.glb',
  '  --output PATH         New GLB in a separate art/build directory; never public',
  '',
  'Optional read-only inputs:',
  '  --proof PATH          Default art/blender/proofs/snow-roof-hidden-tiles.json',
  '  --source-blend PATH   Default art/build/snow-roof-stable.blend',
  '  --prepared-blend PATH Default beside input: snow-roof-prepared.blend',
  '  --raw PATH            Default beside input: snow-roof.raw.glb',
  '  --tools PATH          Pinned glTF tools prefix (ONE_LIGHT_GLTF_TOOLS or temp)',
  '',
  'Writes OUTPUT and a sibling .receipt.json only after all invariants pass.',
  'Existing outputs are refused. Hash drift is refused; there is no bypass.',
  'No quantize() or meshopt() transform runs. The codec writes existing decoded',
  'integer attributes without another quantization or normal-filter pass.',
  'Full execution is intentionally deferred until isolated frame capture ends.',
].join('\n');

function parseArgs(argv) {
  const allowed = new Set(['--input', '--output', '--proof', '--source-blend', '--prepared-blend', '--raw', '--tools']);
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--help' || key === '-h') return { help: true };
    if (!allowed.has(key) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Invalid option: ' + key);
    if (options[key] !== undefined) throw new Error('Repeated option: ' + key);
    options[key] = argv[++i];
  }
  if (!options['--input'] || !options['--output']) throw new Error('--input and --output are required. Use --help.');
  return options;
}
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function fileHash(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
const exists = (path) => access(path).then(() => true, () => false);
function inside(path, parent) {
  const rel = relative(parent, path);
  return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel));
}
function portablePath(path) {
  return inside(path, ROOT) ? relative(ROOT, path) : path;
}
async function prospectiveRealPath(path) {
  const tail = [];
  let ancestor = resolve(path);
  while (!(await exists(ancestor))) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new Error('No existing output ancestor.');
    tail.unshift(relative(parent, ancestor)); ancestor = parent;
  }
  return resolve(await realpath(ancestor), ...tail);
}
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
async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }
  const input = await realpath(resolve(options['--input']));
  const output = await prospectiveRealPath(resolve(options['--output']));
  const build = await realpath(join(ROOT, 'art/build'));
  if (!output.endsWith('.glb') || !inside(output, build) || inside(output, dirname(input))) throw new Error('Output must be a new .glb in a separate art/build directory, outside the input cache.');
  const receiptPath = output.slice(0, -4) + '.receipt.json';
  if (await exists(output) || await exists(receiptPath)) throw new Error('Output/receipt already exists; choose a new candidate path.');
  const paths = {
    proof: resolve(options['--proof'] ?? join(ROOT, 'art/blender/proofs/snow-roof-hidden-tiles.json')),
    sourceBlend: resolve(options['--source-blend'] ?? join(ROOT, 'art/build/snow-roof-stable.blend')),
    preparedBlend: resolve(options['--prepared-blend'] ?? join(dirname(input), 'snow-roof-prepared.blend')),
    raw: resolve(options['--raw'] ?? join(dirname(input), 'snow-roof.raw.glb')),
    input,
  };
  const inputs = {};
  for (const [key, path] of Object.entries(paths)) {
    const digest = await fileHash(path);
    if (digest !== PROFILE.hashes[key]) throw new Error(key + ' differs from the audited canonical asset; no hash override is supported.');
    inputs[key] = { path: portablePath(path), sha256: digest };
  }
  const proof = JSON.parse(await readFile(paths.proof, 'utf8'));
  if (proof.sourceSha256 !== PROFILE.hashes.sourceBlend) throw new Error('Proof/source hash linkage failed.');
  for (const [region, expected] of Object.entries(PROFILE.regions)) {
    if (proof.summary[region].safeComponents !== expected.components) throw new Error('Proof component count changed: ' + region);
  }
  const inputBytes = await readFile(input), inputSummary = summary(inputBytes), imagesBefore = imageSignature(inputBytes);
  assertSummary(inputSummary, PROFILE.input, 'Input');
  const tools = await loadTools(resolve(options['--tools'] ?? process.env.ONE_LIGHT_GLTF_TOOLS ?? join(tmpdir(), 'one-light-gltf-tools')));
  const { NodeIO } = tools.core, { ALL_EXTENSIONS, EXTMeshoptCompression } = tools.extensions;
  const { compactPrimitive, weldPrimitive, dedup } = tools.functions;
  const { MeshoptDecoder, MeshoptEncoder } = tools.meshoptimizer;
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const document = await io.read(input), nodesBefore = nodeState(document);
  const removed = { hall: 0, gate: 0, court: 0 }, primitives = [], expectedTriangles = [];
  let preservedUnprovenMarkerTriangles = 0;
  const meshes = new Set();
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    if (node.getSkin() || meshes.has(mesh)) throw new Error('Skins or reused/instanced meshes are outside this frozen profile.');
    meshes.add(mesh);
    const region = node.getExtras().lightmap_region, regionProof = PROFILE.regions[region];
    if (!regionProof) throw new Error('Unknown receiver region.');
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4 || primitive.listTargets().length) throw new Error('Only static indexed triangles are supported.');
      for (const semantic of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'TEXCOORD_1', 'COLOR_0', 'COLOR_1']) if (!primitive.getAttribute(semantic)) throw new Error('Missing accepted attribute: ' + semantic);
      const uv = primitive.getAttribute('TEXCOORD_1'), oldIndices = primitive.getIndices();
      const indices = oldIndices.getArray(), keep = [], material = primitive.getMaterial()?.getName();
      const verticesBefore = primitive.getAttribute('POSITION').getCount();
      let hidden = 0;
      for (let k = 0; k < indices.length; k += 3) {
        const ids = [indices[k], indices[k + 1], indices[k + 2]];
        const marker = ids.every((index) => { const value = uv.getElement(index, [0, 0]); return value[0] === 0 && value[1] === 1; });
        if (marker && material === regionProof.material) { removed[region]++; hidden++; }
        else { keep.push(...ids); if (marker) preservedUnprovenMarkerTriangles++; }
      }
      // Hash-pinned raw/packed assets are exactly those of the completed FACE audit.
      // Marker + region material is valid only for this immutable profile.
      primitive.setIndices(document.createAccessor().setType('SCALAR').setArray(new indices.constructor(keep)));
      if (oldIndices.listParents().length === 1) oldIndices.dispose();
      const expectedHash = primitiveHash(primitive);
      compactPrimitive(primitive);
      const verticesAfterPrune = primitive.getAttribute('POSITION').getCount();
      weldPrimitive(primitive, { overwrite: true }); // Bitwise equality of every attribute.
      if (primitiveHash(primitive) !== expectedHash) throw new Error('Retained triangle attributes/winding changed while compacting/welding.');
      expectedTriangles.push({ region, material, hash: expectedHash });
      primitives.push({ region, material, removedTriangles: hidden, retainedTriangles: keep.length / 3, verticesBefore, verticesAfterPrune, verticesAfterWeld: primitive.getAttribute('POSITION').getCount() });
    }
  }
  for (const [region, expected] of Object.entries(PROFILE.regions)) if (removed[region] !== expected.triangles) throw new Error('Proven FACE count mismatch: ' + region);
  if (preservedUnprovenMarkerTriangles !== 3436) throw new Error('Non-proof marker population changed.');
  await document.transform(dedup());
  // This enum selects only the extension's codec strategy. No quantize() or
  // meshopt() transform is called; existing integer attributes are kept exactly.
  document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const outputBytes = await io.writeBinary(document), decoded = await io.readBinary(outputBytes);
  same(primitiveStates(decoded), expectedTriangles, 'Re-decoded retained triangle attributes/winding');
  same(nodeState(decoded), nodesBefore, 'Node transforms/extras/hierarchy');
  const imagesAfter = imageSignature(outputBytes);
  same(imagesAfter, imagesBefore, 'Embedded image bytes');
  const outputSummary = summary(outputBytes), outputSha = sha(outputBytes);
  assertSummary(outputSummary, { bytes: PROFILE.output.bytes, vertices: PROFILE.output.vertices, triangles: PROFILE.output.triangles, images: PROFILE.input.images, imageBytes: PROFILE.input.imageBytes }, 'Output');
  if (outputSha !== PROFILE.output.sha256) throw new Error('Output differs from the measured canonical candidate; review required before writing.');
  for (const [key, path] of Object.entries(paths)) if (await fileHash(path) !== inputs[key].sha256) throw new Error('Read-only input changed during optimization: ' + key);
  const receipt = {
    version: 1, profile: PROFILE.id, generatedAt: new Date().toISOString(), inputs,
    sourceFaceProvenance: { ...PROFILE.faceAudit, sourceProofSha256: inputs.proof.sha256, sourceProofVerified: true, selection: 'Frozen audited region roof material plus reserved UV2 marker; never marker alone.', freshBlenderScan: false },
    input: inputSummary, output: { path: portablePath(output), sha256: outputSha, ...outputSummary },
    removedTrianglesByRegion: removed,
    removedTriangles: inputSummary.triangles - outputSummary.triangles,
    removedVertices: inputSummary.vertices - outputSummary.vertices,
    preservedUnprovenMarkerTriangles,
    invariants: {
      allInputsByteUnchanged: true, retainedTriangleAttributesBitExact: true,
      windingPreserved: true, allowedIndexDifference: 'Cyclic triangle corner rotation by the codec only.',
      attributeHashAlgorithm: 'SHA256 over semantic/type/normalization header and cyclically canonical triangle corner attribute bytes.',
      triangleHashes: expectedTriangles, imagePayloadBytesUnchanged: true,
      imagePayloadMultisetSha256: imagesBefore.sha256, imageCount: imagesBefore.count,
      nodeTransformsExtrasHierarchyUnchanged: true,
    },
    encoding: { dependencies: tools.versions, codec: 'EXT_meshopt_compression', writerMethod: 'QUANTIZE enum (codec strategy only)', quantizationTransformsRun: 0, normalFilterPassesAdded: 0, textureConversions: 0, exactWeld: true },
    primitives,
    adoption: 'Candidate only. Live/public/cache files were not changed. Runtime visual equivalence review remains required.',
  };
  await mkdir(dirname(output), { recursive: true });
  let wroteOutput = false;
  try {
    await writeFile(output, outputBytes, { flag: 'wx' }); wroteOutput = true;
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  } catch (error) {
    if (wroteOutput) await unlink(output);
    throw error;
  }
  console.log(JSON.stringify({ output: portablePath(output), receipt: portablePath(receiptPath), sha256: outputSha, ...outputSummary }, null, 2));
}
main().catch((error) => { console.error('Export-only optimization refused: ' + error.message); process.exitCode = 1; });
