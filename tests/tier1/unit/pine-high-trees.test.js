import * as THREE from 'three';
import { expect, test } from 'vitest';
import { preparePineHighTrees } from '../../../web/src/engine/places/pine-gate-high-trees.js';

function nativeTreeFixture(youngRoot = 0, shoulder = false) {
  const base = new THREE.Group();
  const detail = new THREE.Group();
  const mounts = ['PineRidgeNative', 'PineYoungNative'].map((node, index) => {
    const proxyMaterial = `Crown ${node}`;
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ name: proxyMaterial }));
    base.add(proxy);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1).translate(0, 1 + (index ? youngRoot : 0), 0));
    mesh.name = node;
    detail.add(mesh);
    return { node, position: [index, 4, -2], height: 6 + index, yawRadians: .2, proxyMaterial };
  });
  if (shoulder) {
    const proxyMaterial = 'Crown PineShoulderNative';
    base.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ name: proxyMaterial })));
    mounts.push({ node: 'PineShoulderNative', prototype: 'PineRidgeNative', position: [-4.2, 2, -3.6],
      height: 6.9, yawRadians: -.25, proxyMaterial });
  }
  base.userData.one_light_pine_native_mounts = JSON.stringify(mounts);
  const high = preparePineHighTrees({ group: base, loadDetailModel: async () => detail }, { uri: 'high.glb' });
  return { base, high };
}

test('the native trees replace only their mounted proxies and preserve the source roots', async () => {
  const { base, high } = nativeTreeFixture();
  const untouched = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ name: 'Far ridge pine' }));
  base.add(untouched);
  expect(await high.start(() => true)).toBe(true);
  expect(high.group.children.map(tree => tree.position.toArray())).toEqual([[0, 4, -2], [1, 4, -2]]);
  expect(high.group.children.map(tree => tree.scale.y)).toEqual([3, 3.5]);
  expect(base.children.map(tree => tree.visible)).toEqual([false, false, true]);
  high.dispose();
  expect(base.children.every(tree => tree.visible)).toBe(true);
});

test('the shoulder reuses scanned geometry without moving the other mount or loading another model', async () => {
  const { base, high } = nativeTreeFixture(0, true);
  expect(await high.start(() => true)).toBe(true);
  const [ridge, , shoulder] = high.group.children;
  expect(shoulder.name).toBe('PineShoulderNative');
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
