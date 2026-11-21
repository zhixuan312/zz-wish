// Keep the native winter needle geometry small without turning the shoots into cards.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

function crownInstances(doc) {
  return doc.getRoot().listNodes().flatMap(node => {
    const instancing = node.getExtension('EXT_mesh_gpu_instancing');
    if (!instancing) return [];
    const streams = instancing.listSemantics().sort().map(semantic => {
      const accessor = instancing.getAttribute(semantic);
      const data = accessor.getArray();
      const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      return [semantic, accessor.getType(), accessor.getComponentType(), accessor.getNormalized(),
        accessor.getCount(), createHash('sha256').update(bytes).digest('hex')];
    });
    return [{ name: node.getName(), matrix: node.getWorldMatrix(), streams }];
  });
}

function getPrimitives(doc) {
  return doc.getRoot().listNodes().flatMap(node => {
    const owner = node.getExtension('EXT_mesh_gpu_instancing');
    const instances = owner?.getAttribute(owner.listSemantics()[0])?.getCount() ?? 1;
    assert(instances > 0, 'An instanced crown group cannot be empty.');
    return (node.getMesh()?.listPrimitives() ?? []).map(primitive => ({
      matrix: node.getWorldMatrix(), indices: primitive.getIndices()?.getArray(),
      points: primitive.getAttribute('POSITION'), normals: primitive.getAttribute('NORMAL'),
      name: primitive.getMaterial()?.getName(), instances,
    }));
  });
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
const instances = crownInstances(document);
const source = getPrimitives(document).map(primitive => ({
  name: primitive.name, instances: primitive.instances, indices: primitive.indices.slice(),
  positions: positions(primitive), normals: normals(primitive),
}));
assert(new Set(source.map(item => item.name)).size >= 2, 'Expected the needle and settled snow materials.');
if (instances.length) {
  // Keep the template scale and the per-shoot transforms independent.
  await document.transform(quantize({ pattern: /^NORMAL$/, quantizeNormal: 8 }));
} else {
  await document.transform(quantize({ pattern: /^(POSITION|NORMAL)$/, quantizePosition: 16, quantizeNormal: 8 }));
}
document.createExtension(EXTMeshoptCompression).setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
const bytes = await io.writeBinary(document);
const replay = await io.readBinary(bytes);
const decoded = getPrimitives(replay);
assert.deepEqual(crownInstances(replay), instances, 'Crown compression changed authored instance transforms.');
assert.equal(decoded.length, source.length);

let maxPositionMetres = 0;
let maxNormalDegrees = 0;
for (let i = 0; i < decoded.length; i++) {
  const original = source[i];
  const after = decoded[i];
  assert.equal(after.name, original.name, 'Needle/rime material ownership changed.');
  assert.equal(after.instances, original.instances, 'Crown instance count changed.');
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
assert(maxPositionMetres <= (instances.length ? 0 : .001),
  'Crown compression moved the template or exceeded the needle position limit.');
assert(maxNormalDegrees <= 1, 'Crown compression changed needle shading normals by more than one degree.');
await writeFile(output, bytes, { flag: 'wx' });
console.log('SNOW_COURT_NEEDLE_MESHOPT', JSON.stringify({
  bytes: bytes.byteLength, triangles: source.reduce((sum, item) => sum + item.indices.length / 3, 0),
  drawTriangles: source.reduce((sum, item) => sum + item.instances * item.indices.length / 3, 0),
  instancedGroups: instances.length, maxPositionMetres, maxNormalDegrees,
}));
