import { expect, test } from 'vitest';
import * as THREE from 'three';
import createBellLane from '../../../web/src/engine/places/bell-lane.js';

const bellLane = createBellLane({ THREE, V3: (...xyz) => new THREE.Vector3(...xyz) });
const localTime = (hour, minute = 0, second = 0, millisecond = 0) =>
  new Date(2026, 10, 21, hour, minute, second, millisecond);
const direction = (time, elev = .9, n = 0) =>
  new THREE.Vector3(...bellLane.sunDirectionAt(time, { elev, n })).normalize();

test('Bell Lane moves its sun westward through local noon without a direction step', () => {
  const samples = Array.from({ length: 11 }, (_, i) => direction(localTime(11, 55 + i)));
  expect(samples[0].x).toBeGreaterThan(0);
  expect(samples[5].x).toBeCloseTo(0, 10);
  expect(samples.at(-1).x).toBeLessThan(0);
  for (let i = 1; i < samples.length; i++) {
    expect(samples[i].x).toBeLessThan(samples[i - 1].x);
    expect(THREE.MathUtils.radToDeg(samples[i].angleTo(samples[i - 1]))).toBeLessThan(.5);
  }
  const justBeforeNoon = direction(localTime(11, 59, 59, 900));
  expect(justBeforeNoon.x).toBeGreaterThan(0);
  expect(THREE.MathUtils.radToDeg(justBeforeNoon.angleTo(samples[5]))).toBeLessThan(.001);
});

test('the solar path keeps side light in the morning, short shadows at noon, and west light in the afternoon', () => {
  const morning = direction(localTime(9), .455);
  const noon = direction(localTime(12));
  const afternoon = direction(localTime(16, 20), 7 / 15, 1 / 27);
  expect(morning.x).toBeGreaterThan(.6);
  expect(afternoon.x).toBeLessThan(-.6);
  expect(noon.y).toBeGreaterThan(.95);
  expect(noon.y).toBeGreaterThan(Math.max(morning.y, afternoon.y));
  expect(direction(localTime(23), 1, 1).toArray()).toEqual(direction(localTime(0), 1, 1).toArray());
});
