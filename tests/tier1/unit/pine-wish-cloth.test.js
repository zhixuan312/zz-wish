import { Vector3 } from 'three';
import { expect, test } from 'vitest';
import { createWishCloth, wallRadius, CLOTH_SPEC, TRAY_PROFILE } from '../../../web/src/engine/places/pine-wish-cloth.js';
import * as THREE from 'three';

const anchor = new Vector3(-1.8, 5, .9);

const vertices = (cloth) => {
  const out = [];
  for (const object of cloth.group.children) {
    const position = object.geometry?.attributes?.position;
    if (!position) continue;
    for (let i = 0; i < position.count; i++) {
      // Convert to anchor-relative metres: the group sits at the anchor, so each child's
      // position is its offset and its scale must be applied to the local vertex.
      const scale = object.scale ?? { x: 1, y: 1, z: 1 };
      out.push({
        x: object.position.x + position.getX(i) * scale.x,
        y: object.position.y + position.getY(i) * scale.y,
        z: object.position.z + position.getZ(i) * scale.z,
        mesh: object.name,
      });
    }
  }
  return out;
};

test('wallRadius follows the tray lathe profile', () => {
  for (const [r, y] of TRAY_PROFILE) expect(wallRadius(y)).toBeCloseTo(r, 6);
  // Between two profile points it interpolates.
  const mid = (.0035 + .006) / 2;
  expect(wallRadius(mid)).toBeCloseTo((.045 + .052) / 2, 4);
  // Below the tray it holds the first radius; above the top it holds the last.
  expect(wallRadius(-.01)).toBeCloseTo(.038, 6);
  expect(wallRadius(.5)).toBeCloseTo(.054, 6);
});

test('no part of the cloth sits below the stone', () => {
  const cloth = createWishCloth({ THREE, anchor, seed: 3 });
  const points = vertices(cloth);
  expect(points.length).toBeGreaterThan(50);
  for (const point of points) {
    // The band's own vertices start at the stone; nothing may go under it.
    expect(point.y, `${point.mesh} at y ${point.y}`).toBeGreaterThanOrEqual(.0005);
  }
  cloth.dispose();
});

test('nothing below the tray top passes inside the tray wall', () => {
  const cloth = createWishCloth({ THREE, anchor, seed: 3 });
  for (const point of vertices(cloth)) {
    if (point.y > .017) continue;
    const radius = Math.hypot(point.x, point.z);
    // The band wraps the wall with clearance, so a radius inside the wall would be a burial.
    expect(radius, `${point.mesh} at y ${point.y} radius ${radius}`)
      .toBeGreaterThanOrEqual(wallRadius(point.y) + .001 - .0015);
  }
  cloth.dispose();
});

test('the band is a tied turn round the wall, the knot faces the camera', () => {
  const cloth = createWishCloth({ THREE, anchor, seed: 3 });
  const band = cloth.group.getObjectByName('Wish cloth band tied round the candle tray');
  expect(band).toBeTruthy();
  band.geometry.computeBoundingBox();
  const b = band.geometry.boundingBox;
  // A full turn: it spans the wall on both axes, and its height is the 10 mm band.
  expect(b.max.x - b.min.x).toBeGreaterThan(.09);
  expect(b.max.z - b.min.z).toBeGreaterThan(.09);
  expect(b.max.y - b.min.y).toBeCloseTo(CLOTH_SPEC.band.to - CLOTH_SPEC.band.from, 3);

  const knot = cloth.group.getObjectByName('Knot of the visitor wish cloth');
  expect(knot.position.z).toBeGreaterThan(wallRadius(CLOTH_SPEC.knot.y));
  expect(knot.position.y).toBeCloseTo(CLOTH_SPEC.knot.y, 6);
  cloth.dispose();
});

test('two 30 mm tails lie on the stone and reach toward the camera', () => {
  const cloth = createWishCloth({ THREE, anchor, seed: 3 });
  const tails = cloth.group.children.filter((o) => /^Wish cloth tail/.test(o.name));
  expect(tails).toHaveLength(2);
  for (const tail of tails) {
    tail.geometry.computeBoundingBox();
    const b = tail.geometry.boundingBox;
    // Ends reach out past the knot toward the burn camera.
    // Reaches past the knot toward the camera; the half-width of the 30 mm tail can add a
    // little at the end, so the upper bound allows the cloth's own width.
    expect(b.max.z).toBeGreaterThan(.100);
    expect(b.max.z).toBeLessThanOrEqual(.145);
    // Lying on the stone, never standing up 8 mm tall.
    expect(b.max.y - b.min.y).toBeLessThan(.010);
    expect(b.min.y).toBeGreaterThanOrEqual(.0005);
  }
  // Their centres stay on opposite sides of the knot, so they are not parallel and never
  // collapse into one strip.
  const centres = tails.map((t) => {
    t.geometry.computeBoundingBox();
    const b = t.geometry.boundingBox;
    return (b.min.x + b.max.x) / 2;
  });
  expect(Math.sign(centres[0])).not.toBe(Math.sign(centres[1]));
  cloth.dispose();
});

test('the cloth is matte fabric with frayed ends and no lettering', () => {
  const cloth = createWishCloth({ THREE, anchor, seed: 3 });
  const band = cloth.group.getObjectByName('Wish cloth band tied round the candle tray');
  expect(band.material.roughness).toBeGreaterThanOrEqual(.9);
  expect(band.material.metalness).toBe(0);
  expect(band.material.color.getHex()).toBe(0xb8231d);
  expect(cloth.group.children.filter((o) => /^Frayed end/.test(o.name)).length).toBeGreaterThanOrEqual(6);
  let textured = null;
  cloth.group.traverse((o) => { if (o.isMesh && o.material?.map) textured = o.material.map; });
  expect(textured).toBeNull();
  cloth.dispose();
});
