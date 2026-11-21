import { expect, test } from 'vitest';
import { projectPoint, screenBox, segmentHitsBox, wickDistance, reviewBurnFrames }
  from '../../../web/src/engine/places/pine-burn-framing.js';

const view = (pos, look, fov = 40, aspect = 1.6) => ({
  pos: { x: pos[0], y: pos[1], z: pos[2] },
  look: { x: look[0], y: look[1], z: look[2] },
  fov, aspect,
});

test('a point on the view axis projects to the centre of the frame', () => {
  const v = view([0, 1, 2], [0, 1, 0]);
  const p = projectPoint({ x: 0, y: 1, z: 0 }, v);
  expect(p.x).toBeCloseTo(.5, 6);
  expect(p.y).toBeCloseTo(.5, 6);
  expect(p.depth).toBeCloseTo(2, 6);
  // A point above the aim lands above the centre, and one to the right lands to the right.
  expect(projectPoint({ x: 0, y: 1.3, z: 0 }, v).y).toBeLessThan(.5);
  expect(projectPoint({ x: .3, y: 1, z: 0 }, v).x).toBeGreaterThan(.5);
});

test('a box either fits the safe area or reports that it does not', () => {
  const v = view([0, 1, 2], [0, 1, 0], 40, 1.6);
  const small = screenBox({ min: [-.02, .98, -.02], max: [.02, 1.02, .02] }, v);
  expect(small.inside).toBe(true);
  // A tray wider than the phone's safe width must be reported out of frame.
  const wide = screenBox({ min: [-.9, .9, -.9], max: [.9, 1.1, .9] }, v);
  expect(wide.inside).toBe(false);
});

test('an occluder between the camera and the wick is detected, one beside it is not', () => {
  const from = [0, 1, 2], to = [0, 1, 0];
  expect(segmentHitsBox(from, to, { min: [-.1, .9, .9], max: [.1, 1.1, 1.1] })).toBe(true);
  expect(segmentHitsBox(from, to, { min: [.4, .9, .9], max: [.6, 1.1, 1.1] })).toBe(false);
  // The subject itself at the far end is not an occluder.
  expect(segmentHitsBox(from, to, { min: [-.1, .9, -.1], max: [.1, 1.1, .1] })).toBe(false);
});

test('the settle review catches a pull-back, an out-of-frame tray and an occluded wick', () => {
  const wick = { x: 0, y: 1, z: 0 };
  const tray = { min: [-.06, .96, -.06], max: [.06, 1.02, .06] };
  const flame = { min: [-.006, 1.02, -.006], max: [.006, 1.14, .006] };
  const close = view([0, 1, 1.2], [0, 1, 0], 40, 1.6);
  const far = view([0, 1, 2.4], [0, 1, 0], 40, 1.6);
  const ok = reviewBurnFrames([
    { t: 0, view: close, tray, flame, wick },
    { t: 1, view: close, tray, flame, wick },
  ]);
  expect(ok.failures).toEqual([]);
  expect(ok.closest).toBeCloseTo(wickDistance(close, wick), 6);

  // Backing away after ignition is the defect that read as a pull-back.
  const back = reviewBurnFrames([
    { t: 0, view: close, tray, flame, wick },
    { t: 1, view: far, tray, flame, wick },
  ]);
  expect(back.failures.some(f => f.includes('pulled back'))).toBe(true);

  // A camera looking at the stone puts the tray low and the flame out of frame.
  const down = view([0, 1.2, 1.2], [0, .55, 0], 40, 1.6);
  const framed = reviewBurnFrames([{ t: 0, view: down, tray, flame, wick }]);
  expect(framed.failures.length).toBeGreaterThan(0);

  // A pillar across the line to the wick hides the lamp.
  const occluded = reviewBurnFrames(
    [{ t: 0, view: close, tray, flame, wick }],
    { occluders: [{ min: [-.2, .8, .5], max: [.2, 1.2, .7] }] });
  expect(occluded.failures.some(f => f.includes('occluder'))).toBe(true);
});
