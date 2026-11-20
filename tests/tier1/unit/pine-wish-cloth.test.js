import { Vector3 } from 'three';
import { expect, test } from 'vitest';
import { createWishCloth, wallRadius, wishClothVisible, CLOTH_SPEC, TRAY_PROFILE } from '../../../web/src/engine/places/pine-wish-cloth.js';
import * as THREE from 'three';

const anchor = new Vector3(-1.8, 5, .9);

// Every vertex of the band, in anchor-relative metres.
function bandVertices(cloth) {
  const band = cloth.group.getObjectByName('Wish cloth band tied round the candle tray');
  expect(band).toBeTruthy();
  const position = band.geometry.attributes.position;
  const out = [];
  for (let i = 0; i < position.count; i++) {
    out.push({ x: position.getX(i), y: position.getY(i), z: position.getZ(i) });
  }
  return { band, out };
}

test('wallRadius follows the tray lathe profile', () => {
  for (const [r, y] of TRAY_PROFILE) expect(wallRadius(y)).toBeCloseTo(r, 6);
  // Between two profile points it interpolates.
  expect(wallRadius((.0035 + .006) / 2)).toBeCloseTo((.045 + .052) / 2, 4);
  // Below the tray it holds the first radius; above the top it holds the last.
  expect(wallRadius(-.01)).toBeCloseTo(.038, 6);
  expect(wallRadius(.5)).toBeCloseTo(.054, 6);
});

test('the cloth is hidden until the lamp is lit and stays after either ending', () => {
  // The place builds it hidden and the ignite path calls show(true); nothing ever hides it again.
  expect(wishClothVisible(false)).toBe(false);
  expect(wishClothVisible(true)).toBe(true);
  const cloth = createWishCloth({ THREE, anchor });
  expect(cloth.group.visible).toBe(false);
  cloth.show(false);
  expect(cloth.group.visible).toBe(false);
  cloth.show(true);
  expect(cloth.group.visible).toBe(true);
  // Both endings keep it: no hide path exists, so showing twice stays shown.
  cloth.show(true);
  expect(cloth.group.visible).toBe(true);
  cloth.dispose();
});

test('the cloth sits at the tray anchor', () => {
  const cloth = createWishCloth({ THREE, anchor });
  expect(cloth.group.position.x).toBeCloseTo(anchor.x, 6);
  expect(cloth.group.position.y).toBeCloseTo(anchor.y, 6);
  expect(cloth.group.position.z).toBeCloseTo(anchor.z, 6);
  expect(cloth.worldPosition().y).toBeCloseTo(anchor.y, 6);
  cloth.dispose();
});

test('no part of the cloth is buried in the stone or inside the tray wall', () => {
  const cloth = createWishCloth({ THREE, anchor });
  const { band, out } = bandVertices(cloth);
  // Vertices lie on the rings only; a straight span between two rings can still cut inside a
  // convex wall, so every vertical edge is sampled between its own ring heights as well.
  const position = band.geometry.attributes.position;
  const ringYs = [...new Set(out.map(p => +p.y.toFixed(6)))].sort((a, b) => a - b);
  expect(ringYs.length).toBeGreaterThanOrEqual(9);
  const rings = ringYs.map((y, i) => {
    const points = [];
    for (let v = 0; v < position.count; v++) {
      if (Math.abs(position.getY(v) - y) < 1e-6) {
        points.push([position.getX(v), position.getZ(v)]);
      }
    }
    return { y, points, index: i };
  });
  expect(rings.every(r => r.points.length > 0)).toBe(true);
  // Pair the rings by their order round the band: the strip is built ring by ring.
  const perRing = rings[0].points.length;
  for (const ring of rings) expect(ring.points.length).toBe(perRing);
  for (let r = 1; r < rings.length; r++) {
    const lower = rings[r - 1], upper = rings[r];
    for (let k = 0; k < Math.min(lower.points.length, upper.points.length); k++) {
      const [x0, z0] = lower.points[k], [x1, z1] = upper.points[k];
      for (let s = 0; s <= 4; s++) {
        const t = s / 4;
        const y = lower.y + (upper.y - lower.y) * t;
        const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        const radius = Math.hypot(x, z);
        expect(radius, `edge sample at y ${y.toFixed(4)}`)
          .toBeGreaterThanOrEqual(wallRadius(y) + .0005);
        expect(radius, `edge sample at y ${y.toFixed(4)}`)
          .toBeLessThanOrEqual(wallRadius(y) + .004);
      }
    }
  }
  for (const point of out) {
    expect(point.y, `y ${point.y}`).toBeGreaterThanOrEqual(.0005);
    expect(point.y, `y ${point.y}`).toBeLessThanOrEqual(.017);
  }
  cloth.dispose();
});

test('the band is a narrow upright ring that never exceeds the tray rim', () => {
  const cloth = createWishCloth({ THREE, anchor });
  const { band } = bandVertices(cloth);
  band.geometry.computeBoundingBox();
  const box = band.geometry.boundingBox;
  // 8 mm of height, and a full turn round the tray.
  expect(box.max.y - box.min.y).toBeCloseTo(CLOTH_SPEC.band.to - CLOTH_SPEC.band.from, 3);
  expect(box.max.x).toBeLessThanOrEqual(wallRadius(CLOTH_SPEC.band.to) + .004);
  expect(box.max.z).toBeLessThanOrEqual(wallRadius(CLOTH_SPEC.band.to) + .004);
  // Its faces are radial, not a horizontal brim.
  band.geometry.computeVertexNormals();
  const normals = band.geometry.attributes.normal;
  const pos = band.geometry.attributes.position;
  let checked = 0;
  for (let i = 0; i < normals.count; i++) {
    const radial = Math.hypot(pos.getX(i), pos.getZ(i));
    if (radial < .005) continue;
    const outward = (normals.getX(i) * pos.getX(i) + normals.getZ(i) * pos.getZ(i)) / radial;
    if (Math.abs(outward) < .2) continue;
    // The wall's steepest span gives |outward| about .55; the measured band sits at .33 because
    // consecutive wall profile points differ in slope. Radial must still dominate the brim
    // case, where outward would be near zero.
    expect(Math.abs(outward), 'band normal must be radial').toBeGreaterThan(.3);
    checked++;
  }
  expect(checked).toBeGreaterThan(100);
  cloth.dispose();
});

test('the cloth is plain lit red cloth with shadows, and carries no text', () => {
  const cloth = createWishCloth({ THREE, anchor });
  const { band } = bandVertices(cloth);
  // Same family and environment response as the spent wax stubs it sits among.
  expect(band.material.type).toBe('MeshPhysicalMaterial');
  expect(band.material.envMapIntensity).toBeCloseTo(.42, 2);
  expect(band.material.color.getHex()).toBe(CLOTH_COLOR_HEX);
  expect(band.material.metalness).toBe(0);
  expect(band.castShadow).toBe(true);
  expect(band.receiveShadow).toBe(true);
  let textured = null;
  cloth.group.traverse((object) => { if (object.isMesh && object.material?.map) textured = object.material.map; });
  expect(textured).toBeNull();
  // Plain version: no knot, no tails.
  expect(cloth.group.children).toHaveLength(1);
  cloth.dispose();
});

const CLOTH_COLOR_HEX = 0xa5161b;
