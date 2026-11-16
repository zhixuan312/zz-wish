// Measure actual final quality/mobile export-only candidates and generate explicit
// frozen profiles. No rendering, texture conversion, source edit or public write.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = process.env.ONE_LIGHT_GLTF_TOOLS ?? '/tmp/one-light-gltf-tools';
const load = (name, file = 'dist/index.js') => import(pathToFileURL(join(TOOLS, 'node_modules', name, file)).href);
const { NodeIO } = await load('@gltf-transform/core');
const { ALL_EXTENSIONS, EXTMeshoptCompression } = await load('@gltf-transform/extensions');
const { compactPrimitive, weldPrimitive, dedup } = await load('@gltf-transform/functions');
const { MeshoptDecoder, MeshoptEncoder } = await load('meshoptimizer', 'index.js');
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJSON = async (path) => JSON.parse(await fs.readFile(path, 'utf8'));
const relative = (path) => path.startsWith(ROOT + '/') ? path.slice(ROOT.length + 1) : path;
const sourceDir = join(ROOT, 'art/build/snow-roof-final');
const refPath = join(sourceDir, 'hidden-export-reference-corrected/reference.json');
const facePath = join(sourceDir, 'hidden-export-reference-corrected/raw-correspondence.json');
const reference = await readJSON(refPath), face = await readJSON(facePath);
for (const input of Object.values(reference.inputs)) if (sha(await fs.readFile(input.path)) !== input.sha256) throw new Error('Actual reference input changed.');
if (!face.exactPreparedFaceCorrespondence || sha(await fs.readFile(face.raw.path)) !== face.raw.sha256) throw new Error('Actual FACE/raw audit is stale.');
const proof = await readJSON(reference.inputs.proof.path);
const inputs = [
  { variant: 'quality', path: join(ROOT, 'art/build/snow-roof-final-quality/snow-roof.glb'), expected: '545f101f30a16aaa241d8a63e476ab5b04cfb9c2a4fa15a61261bf506e4b5760' },
  { variant: 'mobile', path: join(ROOT, 'art/build/snow-roof-final-mobile/snow-roof.glb'), expected: 'bf8de4afc5692771d2569780942e7ee4b419a5b7b6cd819f95bdff8497543069' },
];
const outDir = join(ROOT, 'art/build/snow-roof-final-export-measurement');
await fs.mkdir(outDir, { recursive: true });
function uvKey(attribute, index) {
  if (attribute.getComponentType() !== 5126) throw new Error('Roof UV0 must be unchanged float32 for correspondence.');
  const a = attribute.getArray(), b = Buffer.from(a.buffer, a.byteOffset + index * 8, 8), out = Buffer.from(b);
  for (let i = 0; i < 2; i++) if (out.readFloatLE(i * 4) === 0) out.writeFloatLE(0, i * 4);
  return out.toString('hex');
}
function world(point, matrix) {
  const [x, y, z] = point;
  return [matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12], matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13], matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]];
}
const marker = (uv, ids) => ids.every((i) => { const p = uv.getElement(i, [0, 0]); return p[0] === 0 && p[1] === 1; });
const sourceTriangles = new Map();
let rawDoc = await io.read(face.raw.path);
for (const node of rawDoc.getRoot().listNodes()) {
  if (!node.getMesh()) continue;
  const region = node.getExtras().lightmap_region, materials = reference.regions[region].materials, list = [];
  for (const primitive of node.getMesh().listPrimitives()) {
    if (!Object.hasOwn(materials, primitive.getMaterial()?.getName())) continue;
    const idx = primitive.getIndices().getArray(), uv = primitive.getAttribute('TEXCOORD_1'), uv0 = primitive.getAttribute('TEXCOORD_0'), pos = primitive.getAttribute('POSITION'), matrix = node.getWorldMatrix();
    for (let k = 0; k < idx.length; k += 3) {
      const ids = [idx[k], idx[k + 1], idx[k + 2]];
      if (!marker(uv, ids)) continue;
      const corners = ids.map((i) => ({ uv: uvKey(uv0, i), p: world(pos.getElement(i, [0, 0, 0]), matrix) }));
      list.push({ key: corners.map((p) => p.uv).sort().join(''), corners });
    }
  }
  if (list.length !== face.regions[region].matchedProvenTriangles) throw new Error('Raw proven source population changed.');
  sourceTriangles.set(region, list);
}
rawDoc = null; global.gc?.();
function primitiveHash(primitive) {
  const hash = createHash('sha256'), names = primitive.listSemantics().sort(), attributes = names.map((n) => primitive.getAttribute(n));
  hash.update(JSON.stringify(attributes.map((a, i) => [names[i], a.getType(), a.getComponentType(), a.getNormalized()])));
  const indices = primitive.getIndices().getArray();
  for (let k = 0; k < indices.length; k += 3) {
    const corners = [indices[k], indices[k + 1], indices[k + 2]].map((i) => Buffer.concat(attributes.map((a) => { const arr = a.getArray(), size = a.getElementSize() * arr.BYTES_PER_ELEMENT; return Buffer.from(arr.buffer, arr.byteOffset + i * size, size); })));
    const rotations = [Buffer.concat(corners), Buffer.concat([corners[1], corners[2], corners[0]]), Buffer.concat([corners[2], corners[0], corners[1]])];
    rotations.sort(Buffer.compare); hash.update(rotations[0]);
  }
  return hash.digest('hex');
}
function signatures(doc) {
  const result = [];
  for (const node of doc.getRoot().listNodes()) for (const p of node.getMesh()?.listPrimitives() ?? []) result.push({ region: node.getExtras().lightmap_region, material: p.getMaterial()?.getName(), hash: primitiveHash(p) });
  return result;
}
function inspect(bytes) {
  const b = Buffer.from(bytes), n = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + n)), bin = b.subarray(28 + n);
  const imageHashes = json.images.map((i) => { const v = json.bufferViews[i.bufferView]; return sha(bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)); }).sort();
  return {
    summary: { bytes: b.length, vertices: json.meshes.reduce((a, m) => a + m.primitives.reduce((s, p) => s + json.accessors[p.attributes.POSITION].count, 0), 0), triangles: json.meshes.reduce((a, m) => a + m.primitives.reduce((s, p) => s + json.accessors[p.indices].count / 3, 0), 0), images: imageHashes.length, imageBytes: json.images.reduce((a, i) => a + json.bufferViews[i.bufferView].byteLength, 0) },
    geometryBytes: json.bufferViews.reduce((a, v) => a + (v.extensions?.EXT_meshopt_compression?.byteLength ?? 0), 0),
    imageHashes, imageMultisetSha256: sha(imageHashes.join('')),
  };
}
const records = [], profiles = [];
let inputGeometryControl;
for (const input of inputs) {
  const bytes = await fs.readFile(input.path);
  if (sha(bytes) !== input.expected) throw new Error('Packed input is not the declared frozen actual asset.');
  const before = inspect(bytes), doc = await io.read(input.path), inputGeometry = signatures(doc);
  if (inputGeometryControl && JSON.stringify(inputGeometry) !== JSON.stringify(inputGeometryControl)) throw new Error('Quality/mobile packed geometry or attributes differ.');
  inputGeometryControl = inputGeometry;
  const removed = {}, buckets = new Map(), retained = [], packedRoofAliases = {};
  const roofNames = new Set(Object.values(reference.regions).flatMap((value) => Object.keys(value.materials)));
  let preservedOtherMarker = 0, maxError = 0, maxBound = 0, removableVertices = 0, weldedVertices = 0;
  for (const [region, triangles] of sourceTriangles) {
    const map = new Map();
    for (const triangle of triangles) { if (!map.has(triangle.key)) map.set(triangle.key, []); map.get(triangle.key).push(triangle); }
    buckets.set(region, map); removed[region] = 0; packedRoofAliases[region] = {};
  }
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const region = node.getExtras().lightmap_region, matrix = node.getWorldMatrix(), map = buckets.get(region);
    // Sum of axis errors is a conservative position-quantization bound even
    // when an affine parent has nonuniform scale; an extra2um covers float IO.
    const bound = ([0, 4, 8].reduce((s, i) => s + Math.hypot(matrix[i], matrix[i + 1], matrix[i + 2]), 0) / (2 * 32767)) + .000002;
    maxBound = Math.max(maxBound, bound);
    for (const p of mesh.listPrimitives()) {
      const uv = p.getAttribute('TEXCOORD_1'), uv0 = p.getAttribute('TEXCOORD_0'), position = p.getAttribute('POSITION'), old = p.getIndices(), idx = old.getArray(), keep = [];
      const materialName = p.getMaterial()?.getName(), roof = roofNames.has(materialName), originalVertices = position.getCount();
      for (let k = 0; k < idx.length; k += 3) {
        const ids = [idx[k], idx[k + 1], idx[k + 2]], isMarker = marker(uv, ids);
        if (!roof || !isMarker) { keep.push(...ids); if (isMarker) preservedOtherMarker++; continue; }
        const corners = ids.map((i) => ({ uv: uvKey(uv0, i), p: world(position.getElement(i, [0, 0, 0]), matrix) })), key = corners.map((p) => p.uv).sort().join(''), choices = map.get(key) ?? [];
        let found = -1, error = 0;
        for (let t = 0; t < choices.length && found < 0; t++) for (let shift = 0; shift < 3; shift++) {
          const source = choices[t].corners; let valid = true, worst = 0;
          for (let j = 0; j < 3; j++) { const raw = source[(j + shift) % 3], packed = corners[j], d = Math.hypot(...packed.p.map((v, a) => v - raw.p[a])); if (raw.uv !== packed.uv || d > bound) valid = false; worst = Math.max(worst, d); }
          if (valid) { found = t; error = worst; break; }
        }
        if (found < 0) throw new Error('Packed triangle lacks actual proven raw correspondence: ' + input.variant + '/' + region);
        choices.splice(found, 1); removed[region]++; packedRoofAliases[region][materialName] = (packedRoofAliases[region][materialName] ?? 0) + 1; maxError = Math.max(maxError, error);
      }
      p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new idx.constructor(keep)));
      if (old.listParents().length === 1) old.dispose();
      const expected = primitiveHash(p);
      compactPrimitive(p); const afterPrune = p.getAttribute('POSITION').getCount();
      removableVertices += originalVertices - afterPrune;
      weldPrimitive(p, { overwrite: true }); weldedVertices += afterPrune - p.getAttribute('POSITION').getCount();
      if (primitiveHash(p) !== expected) throw new Error('Compaction/weld changed retained triangle attributes.');
      retained.push({ region, material: p.getMaterial()?.getName(), hash: expected });
    }
  }
  for (const [region, map] of buckets) if ([...map.values()].some((list) => list.length) || removed[region] !== face.regions[region].matchedProvenTriangles) throw new Error('Packed proven subset is incomplete: '+JSON.stringify({region,removed:removed[region],expected:face.regions[region].matchedProvenTriangles,remaining:[...map.values()].reduce((n,a)=>n+a.length,0)}));
  await doc.transform(dedup());
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const outputBytes = await io.writeBinary(doc), decoded = await io.readBinary(outputBytes), after = inspect(outputBytes);
  if (JSON.stringify(signatures(decoded)) !== JSON.stringify(retained)) throw new Error('Retained triangle values/winding changed after codec roundtrip.');
  if (JSON.stringify(before.imageHashes) !== JSON.stringify(after.imageHashes)) throw new Error('Embedded image payload changed.');
  const output = join(outDir, input.variant + '-measured.glb');
  await fs.writeFile(output, outputBytes, { flag: 'wx' });
  const record = { variant: input.variant, input: { path: relative(input.path), sha256: sha(bytes), ...before.summary, geometryBytes: before.geometryBytes }, measuredOutput: { path: relative(output), sha256: sha(outputBytes), ...after.summary, geometryBytes: after.geometryBytes }, removedTrianglesByRegion: removed, packedRoofAliases, removableVertices, exactWeldedVertices: weldedVertices, preservedNonproofMarkerTriangles: preservedOtherMarker, rawToPackedProvenTrianglePositionMaxErrorMetres: maxError, conservativePositionErrorBoundMetres: maxBound, sourcePackedHiddenSubsetVerified: true, retainedTriangleAttributesAndWindingBitExact: true, imagePayloadsByteIdentical: true, imagePayloadMultisetSha256: before.imageMultisetSha256, inputGeometrySha256: sha(JSON.stringify(inputGeometry)), retainedTriangleHashSha256: sha(JSON.stringify(retained)) };
  records.push(record);
  profiles.push({ id: 'snow-roof-final-' + input.variant + '-6e9f-v1', variant: input.variant, hashes: { proof: reference.inputs.proof.sha256, sourceBlend: reference.inputs.source.sha256, preparedBlend: reference.inputs.prepared.sha256, raw: face.raw.sha256, input: input.expected }, regions: Object.fromEntries(Object.entries(reference.regions).map(([r, value]) => [r, { material: Object.keys(packedRoofAliases[r])[0], sourceMaterials: value.materials, triangles: value.hiddenTriangles, components: proof.summary[r].safeComponents }])), input: before.summary, output: { ...after.summary, sha256: sha(outputBytes) }, faceAudit: { method: 'Actual prepared FACE flags -> exact raw float32 triangles -> packed UV0/world triangles within existing quantization bounds.', matchedTriangles: Object.values(removed).reduce((a, n) => a + n, 0), unmatchedSourceTriangles: 0, unmatchedRawTriangles: 0, maximumPackedPositionErrorMetres: maxError, conservativePositionErrorBoundMetres: maxBound }, preservedNonproofMarkerTriangles: preservedOtherMarker });
  console.log(JSON.stringify(record));
  global.gc?.();
}
const validation = { version: 1, actualPreparedReference: relative(refPath), actualPreparedReferenceSha256: sha(await fs.readFile(refPath)), actualFaceRawAudit: relative(facePath), actualFaceRawAuditSha256: sha(await fs.readFile(facePath)), source: reference.inputs.source, proof: reference.inputs.proof, prepared: reference.inputs.prepared, raw: face.raw, qualityMobilePackedGeometryAndAttributesExactlyEqual: true, originalMeasuredProfileModified: false, records, textureConversions: 0, extraQuantizationPasses: 0, extraNormalFilters: 0, renderOrBakePerformed: false, generator: 'scripts/measure-final-hidden-export.mjs', generatorSha256: sha(await fs.readFile(fileURLToPath(import.meta.url))) };
const validationPath = join(ROOT, 'art/blender/proofs/snow-roof-final-packed-export-validation.json');
await fs.writeFile(validationPath, JSON.stringify(validation, null, 2) + '\n', { flag: 'wx' });
for (const profile of profiles) {
  profile.provenance = { validation: relative(validationPath), validationSha256: sha(await fs.readFile(validationPath)) };
  await fs.writeFile(join(ROOT, 'art/blender/proofs/snow-roof-final-' + profile.variant + '-export-profile.json'), JSON.stringify(profile, null, 2) + '\n', { flag: 'wx' });
}
console.log('ACTUAL_FINAL_PROFILES_READY', relative(validationPath));
