import * as THREE from 'three';
import { expect, test } from 'vitest';
import { preparePineBaseCrowns } from '../../../web/src/engine/places/pine-base-crowns.js';

test('simplified pine surfaces preserve valid shading normals across UV seams', () => {
  const stem = new THREE.MeshStandardMaterial({ name: 'Scanned stem' });
  const mounts = ['PineRidgeNative', 'PineYoungNative'].map((prototype, index) => ({
    prototype, node: prototype, position: [index, 4, -2], height: index + 6, yawRadians: .2,
    stemMaterial: stem.name, proxies: [new THREE.Mesh(undefined, stem)],
  }));
  const crowns = preparePineBaseCrowns(mounts, {
    sha256: 'e792137eea87b5dee144f5683b60068caa1efc72e01b58a95d916261751fb4fb',
  });
  expect(crowns.group.children.map(tree => tree.position.toArray())).toEqual([[0, 4, -2], [1, 4, -2]]);
  for (const tree of crowns.group.children) {
    for (const { geometry } of tree.children) {
      const normal = geometry.getAttribute('normal');
      const referenced = new Set(geometry.index.array);
      const direction = new THREE.Vector3();
      const valid = [...referenced].every(index => {
        const length = direction.fromBufferAttribute(normal, index).length();
        return length > .999 && length < 1.001;
      });
      expect(valid, `${tree.name} has invalid surface normals`).toBe(true);
    }
  }
});
