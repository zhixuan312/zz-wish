import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [input, tools, output] = process.argv.slice(2);
assert(input && tools && output, 'Expected the native tree GLB, the GLTF tool directory, and an output file.');
const source = await readFile(input);
const sourceSha256 = createHash('sha256').update(source).digest('hex');
const load = path => import(pathToFileURL(resolve(join(tools, 'node_modules', path))));
const [{ NodeIO }, { ALL_EXTENSIONS }, { MeshoptDecoder, MeshoptSimplifier }] = await Promise.all([
  load('@gltf-transform/core/dist/index.js'),
  load('@gltf-transform/extensions/dist/index.js'),
  load('meshoptimizer/index.js'),
]);
await Promise.all([MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const document = await io.readBinary(new Uint8Array(source));

function needleAnchors(primitive, height) {
  const points = primitive.getAttribute('POSITION').getArray();
  const indices = primitive.getIndices().getArray();
  const parent = Uint32Array.from({ length: points.length / 3 }, (_, i) => i);
  function find(point) {
    while (parent[point] !== point) {
      parent[point] = parent[parent[point]];
      point = parent[point];
    }
    return point;
  }
  for (let i = 0; i < indices.length; i += 3) {
    const root = find(indices[i]);
    parent[find(indices[i + 1])] = root;
    parent[find(indices[i + 2])] = root;
  }
  const groups = new Map();
  for (let index = 0; index < parent.length; index++) {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(index * 3);
  }
  // Each textured branchlet contributes its spatial centre and spread. The
  // runtime grows separate needles from these positions, not from a silhouette.
  const rows = [...groups.values()].map(group => {
    const center = [0, 0, 0];
    for (const i of group) for (let axis = 0; axis < 3; axis++) center[axis] += points[i + axis] / group.length;
    const spread = Math.max(...group.map(i => Math.hypot(...center.map((x, axis) => x - points[i + axis]))));
    return [...center.map(x => Math.round(x / height * 8192)), Math.min(255, Math.round(spread / height * 4096))];
  }).sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2]);
  const data = Buffer.alloc(rows.length * 7);
  for (const [index, row] of rows.entries()) {
    for (let axis = 0; axis < 3; axis++) data.writeInt16LE(row[axis], index * 7 + axis * 2);
    data[index * 7 + 6] = row[3];
  }
  return data.toString('base64');
}

function branchSurface(primitive, height) {
  const positions = primitive.getAttribute('POSITION').getArray();
  const uv = primitive.getAttribute('TEXCOORD_0');
  const normal = primitive.getAttribute('NORMAL');
  const coordinates = [0, 0];
  const direction = [0, 0, 0];
  const [indices] = MeshoptSimplifier.simplify(Uint32Array.from(primitive.getIndices().getArray()),
    positions, 3, 3000, .006);
  const remap = new Map();
  const vertices = [];
  const surf = [];
  const normals = [];
  for (const index of indices) {
    if (!remap.has(index)) {
      remap.set(index, remap.size);
      vertices.push(...positions.subarray(index * 3, index * 3 + 3).map(x => Math.round(x / height * 8192)));
      uv.getElement(index, coordinates);
      surf.push(...coordinates.map(value => Math.round(value * 2048)));
      // Simplification can leave individual UV seam vertices with opposing
      // incident faces. Keep the source shading basis across those seams.
      normal.getElement(index, direction);
      const length = Math.hypot(...direction);
      assert(Number.isFinite(length) && length > .5, `Invalid bark source normal at vertex ${index}`);
      normals.push(...direction.map(value => Math.round(value / length * 32767)));
    }
  }
  const encode = (values, signed) => {
    const data = Buffer.alloc(values.length * 2);
    for (const [index, value] of values.entries()) {
      if (signed) data.writeInt16LE(value, index * 2);
      else data.writeUInt16LE(value, index * 2);
    }
    return data.toString('base64');
  };
  return {
    positions: encode(vertices, true),
    uv: encode(surf, true),
    normals: encode(normals, true),
    indices: encode([...indices].map(i => remap.get(i)), false),
  };
}

const crowns = {};
for (const node of document.getRoot().listNodes()) {
  const name = node.getName();
  assert(['PineRidgeNative', 'PineYoungNative'].includes(name));
  const primitives = node.getMesh().listPrimitives();
  const surface = name => primitives.find(primitive => primitive.getMaterial().getName() === name);
  const foliage = surface('PineNativeNeedles');
  const height = Math.max(...primitives.map(item => item.getAttribute('POSITION').getMax([0, 0, 0])[1]));
  crowns[name] = {
    anchors: needleAnchors(foliage, height),
    bark: branchSurface(surface('PineNativeBark'), height),
  };
}
assert.equal(Object.keys(crowns).length, 2);
await writeFile(output, JSON.stringify({ sourceSha256, crowns }) + '\n', { flag: 'wx' });
