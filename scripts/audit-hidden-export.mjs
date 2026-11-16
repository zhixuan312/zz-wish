// CPU-only FACE-reference -> actual raw GLB correspondence; never edits a model.
// node scripts/audit-hidden-export.mjs --raw PATH --reference PATH/reference.json --out art/build/.../receipt.json
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../node_modules/three/build/three.module.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--raw', '--reference', '--out'].includes(args[i]) || !args[i + 1]) throw new Error('Use --raw PATH --reference PATH --out PATH.');
  options[args[i]] = resolve(args[i + 1]);
}
if (Object.keys(options).length !== 3) throw new Error('All three arguments are required.');
const outputRelative = relative(resolve(ROOT, 'art/build'), options['--out']);
if (outputRelative === '..' || outputRelative.startsWith('..' + sep) || isAbsolute(outputRelative)) throw new Error('Output must remain under ignored art/build.');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const referenceBytes = await fs.readFile(options['--reference']), reference = JSON.parse(referenceBytes);
for (const input of Object.values(reference.inputs)) if (sha(await fs.readFile(input.path)) !== input.sha256) throw new Error('Reference input has changed: ' + input.path);
const data = await fs.readFile(options['--raw']), rawSha = sha(data);
if (data.readUInt32LE(0) !== 0x46546c67 || data.readUInt32LE(4) !== 2) throw new Error('Expected raw GLB2.');
const jsonLength = data.readUInt32LE(12), gltf = JSON.parse(data.subarray(20, 20 + jsonLength));
const binary = data.subarray(28 + jsonLength);
const sizes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }, widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(index) {
  const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
  const size = sizes[a.componentType] * widths[a.type], stride = view.byteStride ?? size, offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  if (!size || a.sparse || view.extensions?.EXT_meshopt_compression) throw new Error('Expected uncompressed raw accessors.');
  return { ...a, row: (i) => binary.subarray(offset + i * stride, offset + i * stride + size), value: (i, k = 0) => {
    const p = offset + i * stride + k * sizes[a.componentType];
    return a.componentType === 5126 ? binary.readFloatLE(p) : a.componentType === 5125 ? binary.readUInt32LE(p) : a.componentType === 5123 ? binary.readUInt16LE(p) : binary.readUInt8(p);
  } };
}
const parent = new Map();
gltf.nodes.forEach((node, i) => (node.children ?? []).forEach((child) => parent.set(child, i)));
function nodeMatrix(i) {
  const n = gltf.nodes[i], m = n.matrix ? new THREE.Matrix4().fromArray(n.matrix) : new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation ?? [0, 0, 0])), new THREE.Quaternion(...(n.rotation ?? [0, 0, 0, 1])), new THREE.Vector3(...(n.scale ?? [1, 1, 1])));
  return parent.has(i) ? nodeMatrix(parent.get(i)).multiply(m) : m;
}
const rotate = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
const report = {
  raw: { path: options['--raw'], sha256: rawSha },
  reference: { path: options['--reference'], sha256: sha(referenceBytes), inputs: reference.inputs },
  method: 'Exact float32 triangle-position multisets matched against actual prepared FACE flags. Mesh-local axes converted to glTF Y-up; node transforms checked separately. UV marker alone never authorizes removal.',
  regions: {}, totals: { vertices: 0, triangles: 0, matchedProvenTriangles: 0, verticesUnusedAfterPrune: 0, preservedNonproofMarkerTriangles: 0 },
  sourceOrModelModified: false, renderOrBakePerformed: false,
};
for (const [region, source] of Object.entries(reference.regions)) {
  const nodes = gltf.nodes.map((node, i) => ({ node, i })).filter(({ node }) => node.extras?.lightmap_region === region && node.mesh !== undefined);
  if (nodes.length !== 1) throw new Error('Expected one exported node per prepared region: ' + region);
  const { node, i } = nodes[0], mesh = gltf.meshes[node.mesh];
  const expectedMatrix = rotate.clone().multiply(new THREE.Matrix4().set(...source.matrixWorldBlender.flat())).multiply(rotate.clone().invert());
  const delta = Math.max(...expectedMatrix.elements.map((x, k) => Math.abs(x - nodeMatrix(i).elements[k])));
  if (delta > 0.000003) throw new Error('Source/export node transform differs: ' + region);
  const bytes = await fs.readFile(resolve(dirname(options['--reference']), source.binary));
  if (sha(bytes) !== source.binarySha256 || bytes.length !== source.hiddenTriangles * 36) throw new Error('Reference records changed.');
  const expected = new Map();
  for (let p = 0; p < bytes.length; p += 36) {
    const key = bytes.subarray(p, p + 36).toString('hex'); expected.set(key, (expected.get(key) ?? 0) + 1);
  }
  const row = { vertices: 0, triangles: 0, matchedProvenTriangles: 0, verticesUnusedAfterPrune: 0, preservedNonproofMarkerTriangles: 0, transformMaximumError: delta, materials: {}, primitives: [] };
  for (const primitive of mesh.primitives) {
    const position = accessor(primitive.attributes.POSITION), uv = accessor(primitive.attributes.TEXCOORD_1), indices = accessor(primitive.indices);
    if (position.componentType !== 5126 || uv.componentType !== 5126 || primitive.mode && primitive.mode !== 4) throw new Error('Expected raw static float32 triangles.');
    const material = gltf.materials[primitive.material]?.name, roof = Object.hasOwn(source.materials, material);
    const keep = new Uint8Array(position.count), hiddenUse = new Uint8Array(position.count);
    let matched = 0, otherMarker = 0;
    for (let k = 0; k < indices.count; k += 3) {
      const ids = [indices.value(k), indices.value(k + 1), indices.value(k + 2)], marker = ids.every((v) => uv.value(v) === 0 && uv.value(v, 1) === 1);
      if (!roof || !marker) { ids.forEach((v) => { keep[v] = 1; }); if (marker) otherMarker++; continue; }
      const corners = ids.map((v) => {
        const b = Buffer.from(position.row(v));
        for (let n = 0; n < 3; n++) if (b.readFloatLE(n * 4) === 0) b.writeFloatLE(0, n * 4);
        return b;
      }).sort(Buffer.compare);
      const key = Buffer.concat(corners).toString('hex'), remaining = expected.get(key) ?? 0;
      if (!remaining) throw new Error('Export candidate has no exact prepared FACE provenance: ' + region + '/' + material);
      expected.set(key, remaining - 1); matched++; ids.forEach((v) => { hiddenUse[v] = 1; });
    }
    let unused = 0;
    for (let k = 0; k < position.count; k++) if (hiddenUse[k] && !keep[k]) unused++;
    row.vertices += position.count; row.triangles += indices.count / 3; row.matchedProvenTriangles += matched; row.verticesUnusedAfterPrune += unused; row.preservedNonproofMarkerTriangles += otherMarker;
    if (matched) row.materials[material] = (row.materials[material] ?? 0) + matched;
    row.primitives.push({ material, vertices: position.count, triangles: indices.count / 3, matchedProvenTriangles: matched, removableVertices: unused, preservedNonproofMarkerTriangles: otherMarker, semantics: Object.keys(primitive.attributes).sort() });
  }
  row.unmatchedSourceTriangles = [...expected.values()].reduce((a, n) => a + n, 0);
  if (row.unmatchedSourceTriangles || row.matchedProvenTriangles !== source.hiddenTriangles) throw new Error('Prepared/export correspondence incomplete: ' + region);
  report.regions[region] = row;
  for (const key of Object.keys(report.totals)) report.totals[key] += row[key];
}
report.exactPreparedFaceCorrespondence = true;
if (sha(await fs.readFile(options['--raw'])) !== rawSha) throw new Error('Raw GLB changed during audit.');
await fs.mkdir(dirname(options['--out']), { recursive: true });
await fs.writeFile(options['--out'], JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output: options['--out'], sha256: sha(await fs.readFile(options['--out'])), ...report.totals, exactPreparedFaceCorrespondence: true }, null, 2));
