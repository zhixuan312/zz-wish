// Keep the native winter needle geometry small without turning the shoots into cards.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [input, output] = process.argv.slice(2);
const tools = process.env.ONE_LIGHT_GLTF_TOOLS;
assert(input && output && tools, 'Set ONE_LIGHT_GLTF_TOOLS and pass a source and output GLB.');
const dependency = async name => {
  const directory = join(tools, 'node_modules', name);
  const info = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  return import(pathToFileURL(join(directory, info.module ?? info.main)).href);
};
const [{ NodeIO }, { ALL_EXTENSIONS, EXTMeshoptCompression }, { reorder, quantize },
  { MeshoptDecoder, MeshoptEncoder }] = await Promise.all([
  dependency('@gltf-transform/core'), dependency('@gltf-transform/extensions'),
  dependency('@gltf-transform/functions'), dependency('meshoptimizer'),
]);
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const document = await io.read(input);

function getPrimitives(doc) {
  return doc.getRoot().listNodes().flatMap(node => (node.getMesh()?.listPrimitives() ?? []).map(primitive => ({
    matrix: node.getWorldMatrix(), indices: primitive.getIndices()?.getArray(),
    points: primitive.getAttribute('POSITION'), normals: primitive.getAttribute('NORMAL'),
    name: primitive.getMaterial()?.getName(),
  })));
}

function positions({ matrix, points }) {
  const xyz = [];
  const result = new Float32Array(points.getCount() * 3);
  for (let i = 0; i < points.getCount(); i++) {
    points.getElement(i, xyz);
    for (let j = 0; j < 3; j++) {
      result[3 * i + j] = matrix[j] * xyz[0] + matrix[j + 4] * xyz[1] + matrix[j + 8] * xyz[2] + matrix[j + 12];
    }
  }
  return result;
}

function normals({ normals: source }) {
  const xyz = [];
  const result = new Float32Array(source.getCount() * 3);
  for (let i = 0; i < source.getCount(); i++) result.set(source.getElement(i, xyz), 3 * i);
  return result;
}

await document.transform(reorder({ encoder: MeshoptEncoder, target: 'size' }));
const source = getPrimitives(document).map(primitive => ({
  name: primitive.name, indices: primitive.indices.slice(), positions: positions(primitive), normals: normals(primitive),
}));
assert(source.length === 2, 'Expected the needle material and settled-rime material.');
await document.transform(quantize({ pattern: /^(POSITION|NORMAL)$/, quantizePosition: 16, quantizeNormal: 8 }));
document.createExtension(EXTMeshoptCompression).setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
const bytes = await io.writeBinary(document);
const decoded = getPrimitives(await io.readBinary(bytes));
assert.equal(decoded.length, source.length);

let maxPositionMetres = 0;
let maxNormalDegrees = 0;
for (let i = 0; i < decoded.length; i++) {
  const original = source[i];
  const after = decoded[i];
  assert.equal(after.name, original.name, 'Needle/rime material ownership changed.');
  assert.equal(after.indices.length, original.indices.length, 'Needle triangle count changed.');
  // The index codec may rotate a triangle cyclically without changing its winding.
  for (let j = 0; j < after.indices.length; j += 3) {
    const a = after.indices[j], b = after.indices[j + 1], c = after.indices[j + 2];
    const x = original.indices[j], y = original.indices[j + 1], z = original.indices[j + 2];
    assert((a === x && b === y && c === z) || (a === y && b === z && c === x)
      || (a === z && b === x && c === y), 'Needle topology or winding changed.');
  }
  const xyz = positions(after);
  const unit = normals(after);
  assert.equal(xyz.length, original.positions.length);
  for (let j = 0; j < xyz.length; j += 3) {
    const error = Math.hypot(xyz[j] - original.positions[j], xyz[j + 1] - original.positions[j + 1],
      xyz[j + 2] - original.positions[j + 2]);
    maxPositionMetres = Math.max(maxPositionMetres, error);
    const ax = original.normals[j], ay = original.normals[j + 1], az = original.normals[j + 2];
    const bx = unit[j], by = unit[j + 1], bz = unit[j + 2];
    const dot = (ax * bx + ay * by + az * bz) / (Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz));
    maxNormalDegrees = Math.max(maxNormalDegrees, Math.acos(Math.min(1, Math.max(-1, dot))) * 180 / Math.PI);
  }
}
assert(maxPositionMetres <= .001, 'Crown compression moved needle tips more than one millimetre.');
assert(maxNormalDegrees <= 1, 'Crown compression changed needle shading normals by more than one degree.');
await writeFile(output, bytes, { flag: 'wx' });
console.log('SNOW_COURT_NEEDLE_MESHOPT', JSON.stringify({
  bytes: bytes.byteLength, triangles: source.reduce((sum, item) => sum + item.indices.length / 3, 0),
  maxPositionMetres, maxNormalDegrees,
}));
