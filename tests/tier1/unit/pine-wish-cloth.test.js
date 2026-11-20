import { Vector3 } from 'three';
import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { createWishCloth, wallRadius, wishClothVisible, CLOTH_URL, TRAY_PROFILE } from '../../../web/src/engine/places/pine-wish-cloth.js';
import * as THREE from 'three';

const anchor = new Vector3(-1.8, 5, .9);

// A loader stub that hands back a scene holding one mesh shaped like the exported asset, so the
// module's own wiring is exercised without a browser fetch.
function stubLoader({ verts = 1200, name = 'One palm-width length of coarse red cloth' } = {}) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
  const material = new THREE.MeshPhysicalMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  const scene = new THREE.Group();
  scene.add(mesh);
  return {
    calls: [],
    loadAsync(url) { this.calls.push(url); return Promise.resolve({ scene }); },
  };
}

// The shipped asset's own vertex count and bounds, read from the GLB header.
function glbFacts() {
  const file = fileURLToPath(new URL('../../../web/public/places/pine-gate/pine-visitor-cloth.glb', import.meta.url));
  const data = readFileSync(file);
  const length = data.readUInt32LE(8);
  let offset = 12, json = null;
  while (offset < length) {
    const chunkLength = data.readUInt32LE(offset);
    const type = data.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) json = JSON.parse(data.subarray(offset + 8, offset + 8 + chunkLength).toString('utf8'));
    offset += 8 + chunkLength;
  }
  const positions = json.meshes[0].primitives[0].attributes.POSITION;
  const accessor = json.accessors[positions];
  return { bytes: length, verts: accessor.count, min: accessor.min, max: accessor.max, nodes: json.nodes.length, json, data };
}

// Every POSITION in the glb, decoded from the BIN chunk through its accessor and bufferView
// strides. This is the geometry the browser actually draws, not a copy kept beside the test.
function glbPositions() {
  const { json, data } = glbFacts();
  const chunkStart = 12 + 8 + data.readUInt32LE(12);
  const binStart = chunkStart + 8;
  const accessor = json.accessors[json.meshes[0].primitives[0].attributes.POSITION];
  const view = json.bufferViews[accessor.bufferView];
  const base = binStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? 12;
  const out = new Float32Array(accessor.count * 3);
  for (let i = 0; i < accessor.count; i++) {
    const at = base + i * stride;
    out[i * 3] = data.readFloatLE(at);
    out[i * 3 + 1] = data.readFloatLE(at + 4);
    out[i * 3 + 2] = data.readFloatLE(at + 8);
  }
  return { positions: out, count: accessor.count };
}

test('wallRadius follows the tray lathe profile', () => {
  for (const [r, y] of TRAY_PROFILE) expect(wallRadius(y)).toBeCloseTo(r, 6);
  expect(wallRadius((.0035 + .006) / 2)).toBeCloseTo((.045 + .052) / 2, 4);
  expect(wallRadius(-.01)).toBeCloseTo(.038, 6);
  expect(wallRadius(.5)).toBeCloseTo(.054, 6);
});

test('the shipped strip is the modelled asset, not the parametric band', () => {
  const facts = glbFacts();
  // A settled simulation, not a strip of quads: the ribbon is well past a few hundred vertices.
  expect(facts.verts).toBeGreaterThan(900);
  expect(facts.bytes).toBeGreaterThan(50_000);
  expect(facts.nodes).toBe(1);
  // Origin is the stone surface: the lowest vertex sits a fraction of a millimetre above zero,
  // and the cloth stands at most 26 mm tall on the 17 mm tray.
  expect(facts.min[1]).toBeGreaterThanOrEqual(-.0001);
  expect(facts.min[1]).toBeLessThan(.002);
  expect(facts.max[1]).toBeGreaterThan(.02);
  expect(facts.max[1]).toBeLessThan(.032);
  // It wraps the tray (a little over 58 mm of radius) and its tails run out past the rim.
  const reach = Math.max(...[facts.min[0], facts.max[0], facts.min[2], facts.max[2]].map(Math.abs));
  expect(reach).toBeGreaterThan(.05);
  expect(reach).toBeLessThan(.15);
  // +Z is the burning camera side, so the long tail lies on +Z rather than -Z.
  expect(facts.max[2]).toBeGreaterThan(Math.abs(facts.min[2]));
});

test('no part of the shipped strip is buried in the stone or inside the tray wall', () => {
  const { positions, count } = glbPositions();
  expect(positions.length).toBe(count * 3);
  expect(count).toBe(glbFacts().verts);
  // The asset is authored in the lamp anchor's frame: y 0 is the stone surface and z is up the
  // lathe's own axis in Blender, but after export y is up, so the tray height is y.
  let checkedWall = 0, minimumGap = Infinity;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    // Nothing under the stone.
    expect(y, `vertex ${i} at y ${y}`).toBeGreaterThanOrEqual(-.0001);
    // Where the strip is at the tray's height it must stand outside the wall, with the same half
    // millimetre of clearance the simulation was required to keep.
    if (y > 0 && y <= .017) {
      const gap = Math.hypot(x, z) - wallRadius(y);
      minimumGap = Math.min(minimumGap, gap);
      expect(gap, `vertex ${i} at y ${y.toFixed(4)}, radius ${Math.hypot(x, z).toFixed(4)}`)
        .toBeGreaterThanOrEqual(.0005);
      checkedWall++;
    }
  }
  // The strip really does wrap the tray, so the wall check is not vacuous.
  expect(checkedWall).toBeGreaterThan(100);
  expect(minimumGap).toBeGreaterThanOrEqual(.0005);
  expect(minimumGap).toBeLessThan(.004);
});

test('the cloth is hidden until the lamp is lit and stays after either ending', async () => {
  expect(wishClothVisible(false)).toBe(false);
  expect(wishClothVisible(true)).toBe(true);
  const loader = stubLoader();
  const cloth = createWishCloth({ THREE, anchor, loader });
  expect(cloth.group.visible).toBe(false);
  cloth.show(false);
  expect(cloth.group.visible).toBe(false);
  await cloth.ready;
  cloth.show(true);
  expect(cloth.group.visible).toBe(true);
  // Both endings keep it: no hide path exists, so showing twice stays shown.
  cloth.show(true);
  expect(cloth.group.visible).toBe(true);
  cloth.dispose();
});

test('the strip stands at the lamp anchor and requests the shipped asset', async () => {
  const loader = stubLoader();
  const cloth = createWishCloth({ THREE, anchor, loader });
  expect(loader.calls).toEqual([CLOTH_URL]);
  expect(cloth.group.position.x).toBeCloseTo(anchor.x, 6);
  expect(cloth.group.position.y).toBeCloseTo(anchor.y, 6);
  expect(cloth.group.position.z).toBeCloseTo(anchor.z, 6);
  expect(cloth.worldPosition().y).toBeCloseTo(anchor.y, 6);
  await cloth.ready;
  expect(cloth.mesh).toBeTruthy();
  expect(cloth.settled()).toBe(true);
  // The fabric is open geometry, so it must render from both sides.
  expect(cloth.mesh.material.side).toBe(THREE.DoubleSide);
  // The mesh hangs off the anchor group with no extra offset: the asset is authored in that frame.
  expect(cloth.mesh.parent.parent).toBe(cloth.group);
  cloth.dispose();
});

test('a failed fetch leaves the place standing', async () => {
  const cloth = createWishCloth({
    THREE, anchor,
    loader: { loadAsync: () => Promise.reject(new Error('offline')) },
  });
  await cloth.ready;
  expect(cloth.settled()).toBe(true);
  expect(cloth.mesh).toBe(null);
  cloth.show(true);
  expect(cloth.group.visible).toBe(true);
  expect(cloth.group.children.length).toBe(0);
  cloth.dispose();
});
