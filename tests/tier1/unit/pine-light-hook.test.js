import { expect, test } from 'vitest';
import { blendInputsAt, lightAt, PART_LIGHT } from '../../../web/src/engine/places/pine-day-parts.ts';
import createSnowRoof from '../../../web/src/engine/places/snow-roof-baked.js';
import createPineGate from '../../../web/src/engine/places/pine-gate-baked.js';
import * as THREE from 'three';

// Both modules export createPlace(h); the descriptors are what the scene sees, so call them with a
// minimal helper bag. Only the fields the descriptors build at this stage are needed.
const helpers = { THREE, V3: (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), V2: (x = 0, y = 0) => new THREE.Vector2(x, y) };
const snowRoof = createSnowRoof(helpers);
const pineGate = createPineGate(helpers);

const at = (hour, minute = 0) => new Date(2026, 10, 20, hour, minute, 0);

// The scene's rule, reproduced here without the renderer: a place that supplies lightAt uses it,
// otherwise the shared day keys are used. Keeping the predicate in the test lets it fail loudly if
// someone gives Snow Roof a hook by accident.
const usesOwnLight = place => typeof place?.lightAt === 'function';

test('only Pine Gate supplies a light curve; Snow Roof falls back to the shared keys', () => {
  expect(usesOwnLight(pineGate)).toBe(true);
  expect(usesOwnLight(snowRoof)).toBe(false);
  // Snow Roof's descriptor has no lightAt key at all, so the shared curve is what it gets.
  expect('lightAt' in snowRoof).toBe(false);
});

test('Pine Gate\'s curve is the six-part table, and it changes across the day', () => {
  const hours = [6, 9, 12, 15, 18.5, 22];
  const curves = hours.map(hour => pineGate.lightAt(at(Math.floor(hour), Math.round((hour % 1) * 60))));
  // It returns the blend inputs the shared renderer consumes.
  for (const light of curves) {
    for (const key of ['n', 'g', 'blue', 'lamp', 'haze', 'elev']) {
      expect(typeof light[key], key).toBe('number');
      expect(Number.isFinite(light[key]), key).toBe(true);
    }
    expect(typeof light.dawn).toBe('boolean');
  }
  // Night is fully toward the night look, midday fully toward the day look.
  expect(curves[5].n).toBeGreaterThan(.9);
  expect(curves[2].n).toBeLessThan(.1);
  // And it is not a constant: at least three distinct values of n across the six hours.
  expect(new Set(curves.map(light => light.n.toFixed(2))).size).toBeGreaterThanOrEqual(3);
});

test('the blend inputs agree with the plate family the table picks', () => {
  // A day family gives the day look, dusk the warm low look, night the night look.
  const day = blendInputsAt(at(12));
  // 18:30 sits inside the dusk-to-night window, so its warmth is already easing down; sample the
  // middle of the afternoon instead, where the dusk family is fully in charge.
  const dusk = blendInputsAt(at(15, 30));
  const night = blendInputsAt(at(23));
  expect(day.n).toBeLessThan(.1);
  expect(dusk.g).toBeGreaterThan(.9);
  expect(dusk.lamp).toBeGreaterThan(.8);
  expect(night.n).toBeGreaterThan(.9);
  expect(night.lamp).toBeGreaterThan(.8);
  // Elevation follows the table's direction, never zero (which would be a flat sun on the horizon).
  for (const hour of [5.5, 6, 9, 12, 15, 18.5, 22, 2]) {
    const light = blendInputsAt(at(Math.floor(hour), Math.round((hour % 1) * 60)));
    expect(light.elev, `elev at ${hour}`).toBeGreaterThan(0);
    expect(light.elev).toBeLessThanOrEqual(1);
  }
});

test('the shared curve is untouched by the new hook: Snow Roof keeps its own inputs', () => {
  // Snow Roof has no lightAt, so the scene calls daylight(); this asserts the descriptor carries no
  // override field that could silently change it later.
  expect(Object.keys(snowRoof)).not.toContain('lightAt');
  // Pine Gate's own table is exported so a reviewer can compare the two curves.
  expect(PART_LIGHT.midday.plates).toBe('day');
  expect(lightAt(at(12)).plates).toBe('day');
});
