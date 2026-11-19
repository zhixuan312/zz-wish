import { Vector3 } from 'three';
import { expect, test } from 'vitest';
import { createWishCloth } from '../../../web/src/engine/places/pine-wish-cloth.js';
import * as THREE from 'three';

// The strip hangs under the candle stand, so its anchor is the lamp anchor with the cloth
// just below it.
const anchor = new Vector3(-1.8, 5, .9);

test('ties a narrow red strip under the candle stand with two hanging tails', () => {
  const cloth = createWishCloth({ THREE, anchor, seed: 3 });
  cloth.group.updateMatrixWorld(true);
  const origin = cloth.worldPosition();
  expect(origin.x).toBeCloseTo(anchor.x, 6);
  expect(origin.z).toBeCloseTo(anchor.z, 6);
  // Sits just under the stand, not on it.
  expect(origin.y).toBeLessThan(anchor.y);
  expect(anchor.y - origin.y).toBeLessThan(.01);

  const ribbon = cloth.group.getObjectByName('Visitor wish cloth tied under the candle stand');
  expect(ribbon).toBeTruthy();
  const position = ribbon.geometry.attributes.position;
  const ys = [];
  for (let i = 0; i < position.count; i++) ys.push(position.getY(i));
  const hanging = Math.max(...ys) - Math.min(...ys);
  // Two tails of about five centimetres: long enough to read as cloth, short enough that the
  // burn camera keeps all of them in frame.
  expect(hanging).toBeGreaterThan(.045);
  expect(hanging).toBeLessThan(.060);

  // Each tail is under a centimetre wide and the two splay apart, so the whole strip spans
  // well under three centimetres.
  const xs = [];
  for (let i = 0; i < position.count; i++) xs.push(position.getX(i));
  expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(.03);
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(.012);

  // Fresh cloth, distinct from the faded strips on the pine.
  expect(ribbon.material.color.getHex()).toBe(0xb8231d);
  cloth.dispose();
});

test('the strip carries no visible wish text', () => {
  const cloth = createWishCloth({ THREE, anchor, seed: 3 });
  let text = null;
  cloth.group.traverse((object) => { if (object.isMesh && object.material?.map) text = object.material.map; });
  // No texture atlas means no lettering can appear on the cloth.
  expect(text).toBeNull();
  cloth.dispose();
});

test('the strip sways with the place wind and settles when it is still', () => {
  const cloth = createWishCloth({ THREE, anchor, seed: 3 });
  cloth.update(1);
  const swung = cloth.group.rotation.z;
  expect(Math.abs(swung)).toBeGreaterThan(0);
  cloth.update(0);
  expect(cloth.group.rotation.z).toBeCloseTo(0, 6);
  // The sway is restrained: it must not flip the ribbon over.
  cloth.update(4);
  expect(Math.abs(cloth.group.rotation.z)).toBeLessThan(.3);
  cloth.dispose();
});
