import { Vector3 } from 'three';
import { expect, test } from 'vitest';
import { createWishCloth, CLOTH_SPEC } from '../../../web/src/engine/places/pine-wish-cloth.js';
import * as THREE from 'three';

const anchor = new Vector3(-1.8, 5, .9);

const bounds = (mesh) => {
  mesh.geometry.computeBoundingBox();
  const b = mesh.geometry.boundingBox;
  return { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z, min: b.min, max: b.max };
};

test('wraps a coarse band round the tray wall and knots it on the camera side', () => {
  const cloth = createWishCloth({ THREE, anchor, seed: 3 });
  // About 3 cm wide and a quarter of a metre long, per the world bible.
  expect(CLOTH_SPEC.width).toBeGreaterThanOrEqual(.028);
  expect(CLOTH_SPEC.width).toBeLessThanOrEqual(.034);
  expect(CLOTH_SPEC.length).toBeGreaterThanOrEqual(.22);
  expect(CLOTH_SPEC.length).toBeLessThanOrEqual(.28);

  const band = cloth.group.getObjectByName('Wish cloth wrapped round the candle tray');
  expect(band).toBeTruthy();
  const b = bounds(band);
  // It goes round the tray's measured 49 mm radius, so it spans close to the tray's own
  // width in x and a real depth in z, not a narrow card across one face.
  expect(b.x).toBeGreaterThan(.075);
  expect(b.z).toBeGreaterThan(.03);

  const knot = cloth.group.getObjectByName('Knot of the visitor wish cloth');
  expect(knot).toBeTruthy();
  // The knot is on the +z side, which is the burn camera's side.
  expect(knot.position.z).toBeGreaterThan(.05);
  cloth.dispose();
});

test('two tails fall about six to eight centimetres, bend apart and rest on the stone', () => {
  const cloth = createWishCloth({ THREE, anchor, seed: 3 });
  const tails = cloth.group.children.filter((o) => /^Wish cloth tail/.test(o.name));
  expect(tails).toHaveLength(2);
  const spans = tails.map((t) => bounds(t));
  for (const span of spans) {
    expect(-span.min.y).toBeGreaterThanOrEqual(.060);
    expect(-span.min.y).toBeLessThanOrEqual(.100);
  }
  // They do not run parallel: their lower ends sit on opposite sides of the knot.
  const ends = tails.map((t) => {
    t.geometry.computeBoundingBox();
    const b = t.geometry.boundingBox;
    const low = b.min.y;
    return { x: (b.min.x + b.max.x) / 2, low };
  });
  expect(Math.sign(ends[0].x)).not.toBe(Math.sign(ends[1].x));
  cloth.dispose();
});

test('the cloth is matte fabric with frayed ends, not a solid block', () => {
  const cloth = createWishCloth({ THREE, anchor, seed: 3 });
  const band = cloth.group.getObjectByName('Wish cloth wrapped round the candle tray');
  expect(band.material.type).toBe('MeshStandardMaterial');
  expect(band.material.roughness).toBeGreaterThanOrEqual(.9);
  expect(band.material.metalness).toBe(0);
  expect(band.material.color.getHex()).toBe(0xb8231d);

  const frays = cloth.group.children.filter((o) => /^Frayed end/.test(o.name));
  expect(frays.length).toBeGreaterThanOrEqual(6);
  cloth.dispose();
});

test('the strip carries no visible wish text', () => {
  const cloth = createWishCloth({ THREE, anchor, seed: 3 });
  let textured = null;
  cloth.group.traverse((object) => { if (object.isMesh && object.material?.map) textured = object.material.map; });
  expect(textured).toBeNull();
  cloth.dispose();
});

test('the tails move with the place wind and settle when it is still', () => {
  const cloth = createWishCloth({ THREE, anchor, seed: 3 });
  const tails = cloth.group.children.filter((o) => /^Wish cloth tail/.test(o.name));
  cloth.update(1);
  expect(tails.some((t) => Math.abs(t.rotation.z) > 0)).toBe(true);
  cloth.update(0);
  for (const t of tails) expect(t.rotation.z).toBeCloseTo(0, 6);
  // Restrained: the gusts must not lift a tail over.
  cloth.update(4);
  for (const t of tails) expect(Math.abs(t.rotation.z)).toBeLessThan(.2);
  cloth.dispose();
});
