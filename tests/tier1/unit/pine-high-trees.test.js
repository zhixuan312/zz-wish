import * as THREE from 'three';
import { expect, test } from 'vitest';
import { preparePineHighTrees } from '../../../web/src/engine/places/pine-gate-high-trees.js';

function nativeTreeFixture(youngRoot = 0, shoulder = false, sha256) {
  const base = new THREE.Group();
  const detail = new THREE.Group();
  const mounts = ['PineRidgeNative', 'PineYoungNative'].map((node, index) => {
    const proxyMaterial = `Crown ${node}`;
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ name: proxyMaterial }));
    base.add(proxy);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1).translate(0, 1 + (index ? youngRoot : 0), 0),
      new THREE.MeshBasicMaterial({ name: 'Scanned bark' }));
    mesh.name = node;
    if (sha256) mesh.add(new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ name: 'PineNativeNeedles' })));
    detail.add(mesh);
    return { node, label: `${node} ${index}`, position: [index, 4, -2], height: 6 + index,
      yawRadians: .2, proxyMaterial };
  });
  if (shoulder) {
    const proxyMaterial = 'Crown PineShoulderNative';
    base.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ name: proxyMaterial })));
    mounts.push({ node: 'PineShoulderNative', label: 'PineShoulderNative 0', prototype: 'PineRidgeNative',
      position: [-4.2, 2, -3.6], height: 6.9, yawRadians: -.25, proxyMaterial });
  }
  base.userData.one_light_pine_native_mounts = JSON.stringify(mounts);
  const high = preparePineHighTrees({ group: base, loadDetailModel: async () => detail }, { uri: 'high.glb', sha256 });
  return { base, high };
}

test('the native trees replace only their mounted proxies and preserve the source roots', async () => {
  const { base, high } = nativeTreeFixture();
  const untouched = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ name: 'Far ridge pine' }));
  base.add(untouched);
  expect(await high.start(() => true)).toBe(true);
  expect(high.group.children.map(tree => tree.position.toArray())).toEqual([[0, 4, -2], [1, 4, -2]]);
  // These two are the approved trees: the instance takes the mount's height and yaw verbatim, exactly
  // as reviewed. Any per-tree jitter lives in the export and never reaches them.
  expect(high.group.children.map(tree => tree.scale.y)).toEqual([3, 3.5]);
  expect(base.children.map(tree => tree.visible)).toEqual([false, false, true]);
  high.dispose();
  expect(base.children.every(tree => tree.visible)).toBe(true);
});

test('the native bark upgrade preserves the position, scale and geometry of visible needle crowns', async () => {
  const { high } = nativeTreeFixture(0, true,
    'e792137eea87b5dee144f5683b60068caa1efc72e01b58a95d916261751fb4fb');
  const before = high.base.children.map(tree => tree.children[1]);
  high.base.updateMatrixWorld();
  expect(await high.start(() => true)).toBe(true);
  expect(high.base.visible).toBe(false);
  high.group.updateMatrixWorld();
  for (const [i, tree] of high.group.children.entries()) {
    const [oldNeedles, activeNeedles] = tree.children;
    expect(oldNeedles.visible).toBe(false);
    // The crown keeps the base crown's geometry and material, so the scanned needle detail is reused;
    // only the instance transform differs, which the deterministic jitter supplies.
    expect(activeNeedles.geometry).toBe(before[i].geometry);
    expect(activeNeedles.material).toBe(before[i].material);
    // Identical transform: the fallback crown and the native instance must occupy the same space, or the
    // tree would jump in height or turn when the detail model finishes loading.
    expect(activeNeedles.matrixWorld.equals(before[i].matrixWorld)).toBe(true);
  }
});

test('the shoulder reuses scanned geometry without moving the other mount or loading another model', async () => {
  const { base, high } = nativeTreeFixture(0, true);
  expect(await high.start(() => true)).toBe(true);
  const [ridge, , shoulder] = high.group.children;
  expect(shoulder.name).toBe('PineShoulderNative 0');
  expect(shoulder.geometry).toBe(ridge.geometry);
  expect(shoulder.position.toArray()).toEqual([-4.2, 2, -3.6]);
  expect(ridge.position.toArray()).toEqual([0, 4, -2]);
  expect(base.children.every(tree => !tree.visible)).toBe(true);
});

test.each(['camera has left the forest', 'second prototype lacks a ground root'])(
  'keeps both base trees when the %s',
  async reason => {
    const isLate = reason === 'camera has left the forest';
    const { base, high } = nativeTreeFixture(isLate ? 0 : .012);
    expect(await high.start(() => !isLate)).toBe(false);
    expect(high.group.children).toHaveLength(0);
    expect(base.children.every(tree => tree.visible)).toBe(true);
  },
);

test('a model that backs several trees installs one instance per mount', async () => {
  // The ridge prototype now plants four trees. Each needs its own instance at its own position, while
  // geometry and material stay shared, and the per-tree jitter must repeat across loads.
  const base = new THREE.Group();
  const detail = new THREE.Group();
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1).translate(0, 1, 0),
    new THREE.MeshBasicMaterial({ name: 'Scanned bark' }));
  ridge.name = 'PineRidgeNative';
  detail.add(ridge);
  const young = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1).translate(0, 1, 0),
    new THREE.MeshBasicMaterial({ name: 'Scanned bark' }));
  young.name = 'PineYoungNative';
  detail.add(young);

  const ridgeMounts = [
    { label: 'Layered ridge pine 4', position: [4, 0, -5], height: 8.3 },
    { label: 'Layered ridge pine 12', position: [12.3, 0, -8.7], height: 6.9 },
    { label: 'Layered ridge pine 10', position: [4.7, 0, -12.9], height: 4.9 },
    { label: 'Back ridge pine 3', position: [8.4, 0, -10.3], height: 4.3 },
  ].map((mount, index) => {
    const proxyMaterial = `Crown ${mount.label}`;
    const stemMaterial = `Bark ${mount.label}`;
    base.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ name: proxyMaterial })));
    base.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ name: stemMaterial })));
    return { node: 'PineRidgeNative', ...mount, yawRadians: .1 * index, proxyMaterial, stemMaterial };
  });
  const youngProxy = 'Crown young';
  base.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ name: youngProxy })));
  const youngStem = 'Bark young';
  base.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ name: youngStem })));
  const mounts = [...ridgeMounts,
    { node: 'PineYoungNative', label: 'Back ridge pine 5', position: [-4, 0, -6], height: 7,
      yawRadians: -.2, proxyMaterial: youngProxy, stemMaterial: youngStem }];
  base.userData.one_light_pine_native_mounts = JSON.stringify(mounts);

  const high = preparePineHighTrees({ group: base, loadDetailModel: async () => detail }, { uri: 'high.glb' });
  expect(await high.start(() => true)).toBe(true);
  expect(high.group.children).toHaveLength(mounts.length);
  // One instance per authored tree, at that tree's own root.
  expect(high.group.children.map(tree => tree.name)).toEqual(mounts.map(mount => mount.label));
  for (const [index, tree] of high.group.children.entries()) {
    expect(tree.position.toArray()).toEqual(mounts[index].position);
    // The prototype box is 2 m tall, so the instance scale is mount.height / 2 within the jitter band.
    const authored = mounts[index].height / 2;
    expect(tree.scale.y).toBeGreaterThanOrEqual(authored * .85 - 1e-6);
    expect(tree.scale.y).toBeLessThanOrEqual(authored * 1.15 + 1e-6);
  }
  // Shared geometry: four ridge instances, one model.
  const ridgeInstances = high.group.children.slice(0, ridgeMounts.length);
  // The prototype is a bare mesh here, so the instance itself carries the shared geometry.
  expect(new Set(ridgeInstances.map(tree => tree.geometry)).size).toBe(1);
  expect(new Set(ridgeInstances.map(tree => tree.material)).size).toBe(1);
  // Every instance sits exactly where its fallback crown sits: same position, same yaw, same scale.
  // Without base crowns in this fixture, compare against the mount fields the base crown consumes.
  high.group.updateMatrixWorld(true);
  for (const [index, tree] of high.group.children.entries()) {
    const mount = mounts[index];
    expect(tree.position.toArray()).toEqual(mount.position);
    expect(tree.scale.y * 2).toBeCloseTo(mount.height, 9);
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), mount.yawRadians);
    expect(tree.quaternion.toArray()).toEqual(yaw.toArray());
  }
  // Deterministic: a second load produces the same transforms.
  const transforms = high.group.children.map(tree => [tree.position.toArray(), tree.quaternion.toArray(), tree.scale.toArray()]);
  high.dispose();
  const again = preparePineHighTrees({ group: base, loadDetailModel: async () => detail }, { uri: 'high.glb' });
  expect(await again.start(() => true)).toBe(true);
  expect(again.group.children.map(tree => [tree.position.toArray(), tree.quaternion.toArray(), tree.scale.toArray()]))
    .toEqual(transforms);
  again.dispose();
});
