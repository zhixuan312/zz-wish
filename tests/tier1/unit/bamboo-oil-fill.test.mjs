import { expect, test } from 'vitest';
import * as THREE from 'three';
import { bambooOilFill, bambooOilFillFrame } from '../../../web/src/engine/places/bamboo-oil-fill.js';

test('the oil amount rises monotonically during the pour and is full before the hold', () => {
  const samples = Array.from({ length: 121 }, (_, index) => bambooOilFillFrame(index / 120));
  expect(samples[0]).toEqual({ amount: 0, reach: 0, flow: 0 });
  expect(samples.at(-1)).toMatchObject({ amount: 1, reach: 0 });
  expect(samples.at(-1).flow).toBeCloseTo(0);
  expect(samples[60]).toMatchObject({ reach: 1 });
  expect(samples[60].amount).toBeCloseTo(.5);
  expect(samples[60].flow).toBeCloseTo(1);
  for (let index = 1; index < samples.length; index++) {
    const sample = samples[index];
    expect(sample.amount).toBeGreaterThanOrEqual(samples[index - 1].amount);
    if (sample.flow > .03) expect(sample.reach).toBeCloseTo(1);
  }
});

test('the liquid reaches the current surface and the dipper releases its meshes', () => {
  const fill = bambooOilFill(THREE);
  const lamp = new THREE.Group();
  const pour = fill.create(lamp, .012);
  const tool = lamp.getObjectByName('Bamboo oil dipper');
  const stream = lamp.getObjectByName('Bamboo oil stream');
  const ripple = lamp.getObjectByName('Bamboo oil ripple');
  expect(tool.visible).toBe(false);
  pour.update(.5, bambooOilFillFrame(.5), .007, .017);
  expect(tool.visible && stream.visible && ripple.visible).toBe(true);
  expect(stream.position.x).toBe(0);
  expect(stream.position.z).toBe(0);
  expect(stream.position.y - stream.scale.y / 2).toBeCloseTo(.007);
  expect(ripple.position.y).toBeCloseTo(.00745);
  expect(ripple.scale.x).toBeLessThan(.017);
  expect(fill.hold).toBeGreaterThanOrEqual(.5);
  pour.update(1, bambooOilFillFrame(1), .011, .025);
  expect(tool.visible).toBe(false);
  let disposed = false;
  stream.geometry.addEventListener('dispose', () => { disposed = true; });
  pour.dispose();
  expect(lamp.children).toHaveLength(0);
  expect(disposed).toBe(true);
  fill.surface.dispose();
});
