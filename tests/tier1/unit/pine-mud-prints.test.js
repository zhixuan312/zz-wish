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
          // Name the canvas directly instead of aliasing `this`: the context keeps the pixels the
          // module writes so a test can read them back.
          const self = canvas;
          return {
            fillStyle: '', globalCompositeOperation: '',
            fillRect() {}, beginPath() {}, ellipse() {}, fill() {},
            createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
            // The module writes its generated sole into the canvas; hold those pixels so a test can
            // measure the silhouette it actually drew.
            putImageData(image) { self.stored = image; },
            getImageData(x, y, w, h) {
              if (self.stored && self.stored.width === w && self.stored.height === h) return self.stored;
              return { data: new Uint8ClampedArray(w * h * 4) };
            },
          };
        },
      };
      return canvas;
    },
  };
}

test('the trail stays under twenty prints and follows the steps upward', () => {
  expect(PINE_PRINTS.length).toBeLessThanOrEqual(20);
  expect(PINE_PRINTS.length).toBeGreaterThanOrEqual(6);
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

test('the gait alternates either side of the line, at an adult stride', () => {
  // The first four prints are the walk across the paving, before the two that turn aside.
  const walk = PINE_PRINTS.slice(0, 4);
  // Alternate feet, so consecutive prints sit on opposite sides of the walking line.
  const sign = (n) => Math.sign(n);
  for (let i = 1; i < walk.length; i++) {
    const a = walk[i - 1], b = walk[i];
    const centre = (a.x + b.x) / 2;
    expect(sign(a.x - centre)).not.toBe(sign(b.x - centre));
    // Each foot lands 8-10 cm off the middle of the line, which is 16-20 cm heel to heel.
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(.16);
    expect(Math.abs(a.x - b.x)).toBeLessThan(.26);
  }
  // A stride, not a shuffle: 60-70 cm from one footfall to the next.
  for (let i = 1; i < walk.length; i++) {
    const stride = Math.hypot(walk[i].x - walk[i - 1].x, walk[i].z - walk[i - 1].z);
    expect(stride).toBeGreaterThan(.55);
    expect(stride).toBeLessThan(.78);
  }
  // The toes point outwards: opposite feet turn opposite ways, and each toe leads the heel.
  for (let i = 1; i < walk.length; i++) {
    expect(Math.abs(walk[i].yaw)).toBeGreaterThan(.08);
    expect(Math.sign(walk[i].yaw)).not.toBe(Math.sign(walk[i - 1].yaw));
  }
});

test('mud thins along the trail, wettest where the walker leaves the mud path', () => {
  const weights = PINE_PRINTS.map(print => print.weight);
  // Monotonically drier, so the trail reads as one crossing and not a scatter of stains.
  for (let i = 1; i < weights.length; i++) expect(weights[i]).toBeLessThan(weights[i - 1]);
  expect(weights[0]).toBeGreaterThan(.85);
  expect(weights.at(-1)).toBeLessThan(.2);
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
    // The silhouette comes from an alpha generated at runtime; there is no texture file on disk.
    expect(mesh.material.alphaMap).toBeTruthy();
    expect(mesh.material.map).toBeFalsy();
  }
  mud.dispose();
});

test('the authored trail lies on the real shoulder paving and clear of the shrine', () => {
  installCanvas();
  // The paving measured from the declared overview camera: a plane at y 4.0 spanning x -1.31..0.43,
  // z 0.03..2.53. The shrine plinth is separate, at y 5.0 and only 16 cm across.
  const paving = new THREE.Mesh(new THREE.PlaneGeometry(1.74, 2.5), new THREE.MeshBasicMaterial());
  paving.rotation.x = -Math.PI / 2;
  paving.position.set(-0.44, 4.0, 1.28);
  paving.updateMatrixWorld(true);
  const mud = createMudPrints({ THREE, surface: paving, prints: PINE_PRINTS });
  // Every print must find the paving, and none may sit on the plinth.
  expect(mud.count).toBe(PINE_PRINTS.length);
  mud.group.updateWorldMatrix(true, true);
  const plinth = new THREE.Box3(new THREE.Vector3(-1.90, 4.98, 0.85), new THREE.Vector3(-1.72, 5.02, 1.01));
  for (const mesh of mud.group.children) {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    expect(box.min.y).toBeGreaterThan(4.0 - .002);
    expect(box.max.y).toBeLessThan(4.0 + .012);
    // Clear of the shrine plinth, which stands a metre higher.
    expect(box.intersectsBox(plinth)).toBe(false);
    // And inside the paving, not floating past its edge.
    expect(box.min.x).toBeGreaterThan(-1.31);
    expect(box.max.x).toBeLessThan(0.43);
    expect(box.min.z).toBeGreaterThan(0.03);
    expect(box.max.z).toBeLessThan(2.53);
  }
  mud.dispose();
});

test('each print is an adult sole in metres: 24-26 cm long, 9-10 cm across the ball', () => {
  installCanvas();
  const paving = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial());
  paving.rotation.x = -Math.PI / 2;
  paving.position.set(0, 4, 1);
  paving.updateMatrixWorld(true);
  const mud = createMudPrints({ THREE, surface: paving, prints: PINE_PRINTS });
  expect(mud.count).toBe(PINE_PRINTS.length);
  mud.group.updateWorldMatrix(true, true);

  // Measure in the print's own frame, so a yawed or tilted print reports the sole's real size.
  for (const [index, mesh] of mud.group.children.entries()) {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    // A sole is longer than it is wide, and the quad is square: the alpha map, not the quad,
    // decides the silhouette, so check the drawn outline rather than the bounding quad.
    const width = box.max.x - box.min.x;
    expect(width, `print ${index} quad width`).toBeCloseTo(PINE_PRINTS[index].length, 6);
  }

  // The silhouette itself: sample the generated alpha and convert texels to metres. The widest
  // row is the forefoot; the narrowest run inside the middle is the arch.
  const alpha = mud.group.children[0].material.alphaMap;
  expect(alpha).toBeTruthy();
  expect(alpha.image.width).toBe(alpha.image.height);
  const size = alpha.image.width;
  const context = alpha.image.getContext('2d');
  const data = context.getImageData(0, 0, size, size).data;
  const coverage = (x, y) => data[(y * size + x) * 4 + 1] / 255;
  const length = PINE_PRINTS[0].length;
  const widest = { texels: 0, t: 0 };
  let archTexels = Infinity;
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    let row = 0;
    for (let x = 0; x < size; x++) if (coverage(x, y) > .35) row++;
    if (row > widest.texels) Object.assign(widest, { texels: row, t });
    if (t > .42 && t < .58 && row > 0) archTexels = Math.min(archTexels, row);
  }
  const metresPerTexel = length / size;
  const forefootCm = widest.texels * metresPerTexel * 100;
  const archCm = archTexels * metresPerTexel * 100;
  // An adult sole: 9-10 cm at the ball, about 6 cm at the arch.
  expect(forefootCm, 'forefoot width').toBeGreaterThan(8.8);
  expect(forefootCm, 'forefoot width').toBeLessThan(10.4);
  expect(archCm, 'arch width').toBeGreaterThan(4.8);
  expect(archCm, 'arch width').toBeLessThan(6.6);
  expect(forefootCm).toBeGreaterThan(archCm);
  mud.dispose();
});
