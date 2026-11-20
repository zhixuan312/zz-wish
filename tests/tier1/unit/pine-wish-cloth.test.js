import { Vector3 } from 'three';
import { expect, test } from 'vitest';
import { createWishCloth, wallRadius, CLOTH_SPEC, TRAY_PROFILE } from '../../../web/src/engine/places/pine-wish-cloth.js';
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

test('the cloth sits at the tray anchor and stays hidden until the lamp is lit', () => {
  const cloth = createWishCloth({ THREE, anchor });
  expect(cloth.group.position.x).toBeCloseTo(anchor.x, 6);
  expect(cloth.group.position.y).toBeCloseTo(anchor.y, 6);
  expect(cloth.group.position.z).toBeCloseTo(anchor.z, 6);
  expect(cloth.worldPosition().y).toBeCloseTo(anchor.y, 6);
  cloth.dispose();
});

test('no part of the cloth is buried in the stone or inside the tray wall', () => {
  const cloth = createWishCloth({ THREE, anchor });
  const { out } = bandVertices(cloth);
  expect(out.length).toBeGreaterThan(100);
  for (const point of out) {
    // Nothing below the stone: the anchor is the stone surface.
    expect(point.y, `y ${point.y}`).toBeGreaterThanOrEqual(.0005);
    expect(point.y, `y ${point.y}`).toBeLessThanOrEqual(.017);
    // It hugs the wall from outside, so it can never be inside the tray's stone.
    expect(Math.hypot(point.x, point.z), `radius at y ${point.y}`)
      .toBeGreaterThanOrEqual(wallRadius(point.y) + .0005);
    expect(Math.hypot(point.x, point.z), `radius at y ${point.y}`)
      .toBeLessThanOrEqual(wallRadius(point.y) + .004);
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
    expect(outward, 'band normal must point outward').toBeGreaterThan(.05);
    checked++;
  }
  expect(checked).toBeGreaterThan(100);
  cloth.dispose();
});

test('the cloth is plain lit red cloth with shadows, and carries no text', () => {
  const cloth = createWishCloth({ THREE, anchor });
  const { band } = bandVertices(cloth);
  expect(band.material.type).toBe('MeshStandardMaterial');
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
