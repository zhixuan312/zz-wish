import { expect, test } from 'vitest';
import * as THREE from 'three';
import { createMudPrints, PINE_PRINTS } from '../../../web/src/engine/places/pine-mud-prints.ts';

// A flat stone plane standing in for the steps: the prints must land on it, not float above it.
function stone(y = 5.2) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial());
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, y, 8);
  mesh.updateMatrixWorld(true);
  return mesh;
}

// The module draws its alpha on a canvas; give it one so the headless test exercises the real path.
function installCanvas() {
  globalThis.document = {
    createElement() {
      const canvas = {
        width: 0, height: 0,
        getContext() {
          return {
            fillStyle: '', globalCompositeOperation: '',
            fillRect() {}, beginPath() {}, ellipse() {}, fill() {},
            createRadialGradient() { return { addColorStop() {} }; },
            getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4).fill(255) }; },
          };
        },
      };
      return canvas;
    },
  };
}

test('the trail stays under twenty prints and follows the steps upward', () => {
  expect(PINE_PRINTS.length).toBeLessThanOrEqual(20);
  expect(PINE_PRINTS.length).toBeGreaterThanOrEqual(8);
  // Each print is a plausible adult sole length and a weight in range.
  for (const print of PINE_PRINTS) {
    expect(print.length).toBeGreaterThanOrEqual(.24);
    expect(print.length).toBeLessThanOrEqual(.29);
    expect(print.weight).toBeGreaterThan(0);
    expect(print.weight).toBeLessThanOrEqual(1);
  }
  // The trail crosses the level shoulder: the prints walk inland (z falls) at one height, because
  // the paving around the niche is flat rather than stepped.
  const first = PINE_PRINTS[0], last = PINE_PRINTS.at(-1);
  expect(last.z).toBeLessThan(first.z);
  expect(Math.abs(last.y - first.y)).toBeLessThan(.02);
  // And some prints turn aside towards the pavilion rather than all pointing uphill.
  const yaws = PINE_PRINTS.map(print => print.yaw);
  expect(Math.max(...yaws) - Math.min(...yaws)).toBeGreaterThan(.8);
});

test('prints land on the stone surface, not floating above it', () => {
  installCanvas();
  const surface = stone(5.2);
  const prints = [
    { x: 0, y: 5.2, z: 8, yaw: 0, length: .27, weight: .8 },
    { x: .5, y: 5.2, z: 7, yaw: .2, length: .27, weight: .5 },
  ];
  const mud = createMudPrints({ THREE, surface, prints });
  expect(mud.count).toBe(2);
  // Compose the whole chain from the group down: a mesh added to a detached group has no world
  // matrix until updateWorldMatrix walks its parents.
  mud.group.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  for (const mesh of mud.group.children) {
    mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  }
  // The quads sit within a couple of millimetres of the stone, not a hand's width above it.
  expect(box.min.y).toBeGreaterThan(5.2 - .001);
  expect(box.max.y).toBeLessThan(5.2 + .01);
  mud.dispose();
});

test('a print with no stone beneath it is skipped rather than floated', () => {
  installCanvas();
  const surface = stone(5.2);
  const prints = [
    { x: 0, y: 5.2, z: 8, yaw: 0, length: .27, weight: .8 },
    // Far outside the plane: nothing to paint on.
    { x: 60, y: 5.2, z: 60, yaw: 0, length: .27, weight: .8 },
  ];
  const mud = createMudPrints({ THREE, surface, prints });
  expect(mud.count).toBe(1);
  mud.dispose();
});

test('the prints are cheap: geometry only, no texture files', () => {
  installCanvas();
  const surface = stone(5.2);
  const prints = [{ x: 0, y: 5.2, z: 8, yaw: 0, length: .27, weight: .8 }];
  const mud = createMudPrints({ THREE, surface, prints });
  for (const mesh of mud.group.children) {
    // Well under a kilobyte of vertex data per print: four corners and two triangles.
    const position = mesh.geometry.attributes.position;
    expect(position.count).toBeLessThanOrEqual(4);
    expect(mesh.geometry.index?.count ?? 0).toBeLessThanOrEqual(6);
    // Colours come from the material; the alpha and normal are generated at runtime.
    expect(mesh.material.alphaMap).toBeTruthy();
    expect(mesh.material.normalMap).toBeTruthy();
  }
  mud.dispose();
});

test('the authored trail lies on the real shoulder paving', () => {
  installCanvas();
  // A plane at the shoulder's measured height (y = 5.00) covering the niche paving, which is where
  // the raycast probe found stone. Every authored print must find it; a print wanting y 5.1 with
  // stone at y 3.6 was the fault this guards.
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial());
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(-1.82, 5.0, .9);
  surface.updateMatrixWorld(true);
  const mud = createMudPrints({ THREE, surface, prints: PINE_PRINTS });
  expect(mud.count).toBe(PINE_PRINTS.length);
  // And no print sits more than a centimetre off the paving.
  mud.group.updateWorldMatrix(true, true);
  for (const mesh of mud.group.children) {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    expect(box.min.y).toBeGreaterThan(5.0 - .002);
    expect(box.max.y).toBeLessThan(5.0 + .012);
  }
  mud.dispose();
});
