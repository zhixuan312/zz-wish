// CPU-only decoded geometry equivalence, including index/winding and node state.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) options[args[i]] = args[i + 1];
if (!options['--left'] || !options['--right'] || !options['--output']) throw new Error('Use --left GLB --right GLB --output JSON.');
const tools = process.env.ONE_LIGHT_GLTF_TOOLS ?? '/tmp/one-light-gltf-tools';
const load = (name, file = 'dist/index.js') => import(pathToFileURL(join(tools, 'node_modules', name, file)).href);
const { NodeIO } = await load('@gltf-transform/core');
const { ALL_EXTENSIONS } = await load('@gltf-transform/extensions');
const { MeshoptDecoder } = await load('meshoptimizer', 'index.js');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const arrayHash = (a) => sha(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
const nodeState = (doc) => doc.getRoot().listNodes().map((node) => ({
  name: node.getName(), region: node.getExtras().lightmap_region,
  translation: node.getTranslation(), rotation: node.getRotation(), scale: node.getScale(),
  children: node.listChildren().map((child) => child.getName()),
  extras: node.getExtras(), mesh: node.getMesh()?.getName() ?? null,
}));
function triangleMultisetHash(primitive) {
  const attrs = primitive.listSemantics().sort().map((name) => primitive.getAttribute(name)), indices = primitive.getIndices().getArray(), hashes = [];
  for (let k = 0; k < indices.length; k += 3) {
    const rows = [indices[k], indices[k + 1], indices[k + 2]].map((i) => Buffer.concat(attrs.map((a) => {
      const arr = a.getArray(), size = a.getElementSize() * arr.BYTES_PER_ELEMENT;
      return Buffer.from(arr.buffer, arr.byteOffset + i * size, size);
    })));
    const rotations = [Buffer.concat(rows), Buffer.concat([rows[1], rows[2], rows[0]]), Buffer.concat([rows[2], rows[0], rows[1]])];
    rotations.sort(Buffer.compare); hashes.push(sha(rotations[0]));
  }
  return sha(hashes.sort().join(''));
}
const leftBytes = await fs.readFile(options['--left']), rightBytes = await fs.readFile(options['--right']);
const left = await io.read(options['--left']), right = await io.read(options['--right']);
const sceneState = (doc) => doc.getRoot().listScenes().map((scene) => ({ name: scene.getName(), extras: scene.getExtras(), roots: scene.listChildren().map((node) => node.getName()) }));
const aNodes = nodeState(left), bNodes = nodeState(right);
if (JSON.stringify(sceneState(left)) !== JSON.stringify(sceneState(right))) throw new Error('Source scene/proof ownership metadata differs.');
if (JSON.stringify(aNodes) !== JSON.stringify(bNodes)) throw new Error('Node transforms/extras/hierarchy differ.');
const regions = new Map(right.getRoot().listNodes().filter((n) => n.getMesh()).map((n) => [n.getExtras().lightmap_region, n.getMesh()]));
const report = {
  version: 1, inputs: { left: { path: options['--left'], sha256: sha(leftBytes), bytes: leftBytes.length }, right: { path: options['--right'], sha256: sha(rightBytes), bytes: rightBytes.length } },
  method: 'Decode Meshopt. Compare every semantic/format/normalized vertex array and actual indices. If storage order differs, compare cyclic-corner canonical triangle multisets without accepting winding reversal.',
  nodeTransformsExtrasHierarchyExactlyEqual: true, sourceSceneProofMetadataExactlyEqual: true, nodeStateSha256: sha(JSON.stringify(aNodes)), primitives: [],
  literalVertexStorageExactlyEqual: true, literalIndexStorageExactlyEqual: true,
  positionsNormalsUV0UV1AllColorsAndWindingExactlyEqual: true,
  vertices: 0, triangles: 0, renderOrBrowserOrGpuUsed: false,
  externalLightmaps: 'Not embedded in these GLBs. Complete staged manifests must separately verify identical lightmap payload hashes for the material-only A/B.',
};
for (const node of left.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const region = node.getExtras().lightmap_region, other = regions.get(region), a = mesh.listPrimitives(), b = other?.listPrimitives();
  if (!b || a.length !== b.length) throw new Error('Region/primitive counts differ.');
  for (let i = 0; i < a.length; i++) {
    const p = a[i], q = b[i], semantics = p.listSemantics().sort();
    if (JSON.stringify(semantics) !== JSON.stringify(q.listSemantics().sort()) || p.getMaterial()?.getName() !== q.getMaterial()?.getName()) throw new Error('Semantic/material assignment differs.');
    const row = { region, primitive: i, material: p.getMaterial()?.getName(), attributes: {}, index: {}, vertexStorageExactlyEqual: true, indexStorageExactlyEqual: true };
    for (const name of semantics) {
      const x = p.getAttribute(name), y = q.getAttribute(name), format = [x.getType(), x.getComponentType(), x.getNormalized(), x.getCount()];
      if (JSON.stringify(format) !== JSON.stringify([y.getType(), y.getComponentType(), y.getNormalized(), y.getCount()])) throw new Error('Decoded attribute format differs: ' + name);
      const hash = arrayHash(x.getArray()), same = hash === arrayHash(y.getArray());
      row.attributes[name] = { format, sha256: hash, exactlyEqual: same };
      row.vertexStorageExactlyEqual &&= same;
    }
    const ix = p.getIndices(), iy = q.getIndices();
    row.index = { count: ix.getCount(), componentType: ix.getComponentType(), sha256: arrayHash(ix.getArray()) };
    row.indexStorageExactlyEqual = ix.getCount() === iy.getCount() && ix.getComponentType() === iy.getComponentType() && row.index.sha256 === arrayHash(iy.getArray());
    if (!row.vertexStorageExactlyEqual || !row.indexStorageExactlyEqual) {
      row.canonicalTriangleMultisetSha256 = triangleMultisetHash(p);
      if (row.canonicalTriangleMultisetSha256 !== triangleMultisetHash(q)) throw new Error('Decoded triangle attributes or winding differ.');
    }
    report.literalVertexStorageExactlyEqual &&= row.vertexStorageExactlyEqual;
    report.literalIndexStorageExactlyEqual &&= row.indexStorageExactlyEqual;
    report.vertices += p.getAttribute('POSITION').getCount(); report.triangles += ix.getCount() / 3; report.primitives.push(row);
  }
}
if (sha(await fs.readFile(options['--left'])) !== report.inputs.left.sha256 || sha(await fs.readFile(options['--right'])) !== report.inputs.right.sha256) throw new Error('Input changed during comparison.');
await fs.writeFile(options['--output'], JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output: options['--output'], sha256: sha(await fs.readFile(options['--output'])), primitives: report.primitives.length, vertices: report.vertices, triangles: report.triangles, literalVertexStorageExactlyEqual: report.literalVertexStorageExactlyEqual, literalIndexStorageExactlyEqual: report.literalIndexStorageExactlyEqual, nodeTransformsExactlyEqual: true }, null, 2));
