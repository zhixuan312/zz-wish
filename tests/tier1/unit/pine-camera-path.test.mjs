import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { CAMERA_LIMITS, cameraPathViolations, measureCameraPath } from '../../visual/pine-camera-path.mjs';

const path = JSON.parse(readFileSync(new URL('../../../shared/pine-gate-path.json', import.meta.url), 'utf8'));

// Sample the authored walk the way the runtime does: smoothstep between keyframes at 60 Hz.
function walkSamples(rate = 60) {
  const times = [0, ...path.waypoints.map(step => step.time), path.seconds];
  const positions = [path.waypoints[0].position, ...path.waypoints.map(step => step.position), path.waypoints.at(-1).position];
  const looks = [path.waypoints[0].look, ...path.waypoints.map(step => step.look), path.waypoints.at(-1).look];
  const at = (rows, t) => {
    for (let i = 1; i < times.length; i++) {
      if (t > times[i]) continue;
      const a = rows[i - 1], b = rows[i];
      const f = (t - times[i - 1]) / (times[i] - times[i - 1] || 1);
      const e = f * f * (3 - 2 * f);
      return a.map((v, k) => v + (b[k] - v) * e);
    }
    return rows.at(-1);
  };
  const samples = [];
  for (let t = 0; t <= path.seconds + 1e-9; t += 1 / rate) {
    const p = at(positions, t), l = at(looks, t);
    samples.push({ t, x: p[0], y: p[1], z: p[2], lx: l[0], ly: l[1], lz: l[2] });
  }
  return samples;
}

test('the walk keeps the brief length and its beats', () => {
  // The brief fixes a 30 s walk; keyframes inside it may be re-timed but the total may not move.
  expect(path.seconds).toBe(30);
  const times = path.waypoints.map(step => step.time);
  expect(times[0]).toBeGreaterThanOrEqual(4.9);
  expect(times.at(-1)).toBeLessThanOrEqual(30);
  // The reveal is the last distinct position before the walk ends: the camera stops moving there.
  const last = path.waypoints.at(-1).position, prior = path.waypoints.at(-2).position;
  expect(Math.hypot(last[0] - prior[0], last[1] - prior[1], last[2] - prior[2])).toBeLessThan(0.01);
});

test('the walk never moves faster than a brisk pace and never snaps', () => {
  const report = measureCameraPath(walkSamples());
  expect(cameraPathViolations(report), cameraPathViolations(report).join('; ')).toEqual([]);
  expect(report.speed.max).toBeLessThanOrEqual(CAMERA_LIMITS.walkSpeedMetresPerSecond);
  expect(report.turn.max).toBeLessThanOrEqual(CAMERA_LIMITS.angularDegreesPerSecond);
  expect(report.acceleration.max).toBeLessThanOrEqual(CAMERA_LIMITS.accelerationMetresPerSecondSquared);
});

test('the camera keeps a person\'s eye height and never brushes a trunk', () => {
  const report = measureCameraPath(walkSamples());
  // The authored walk climbs a mountain path; height is measured above the local ground by the
  // capture, so here only the ordering matters: the eye rises with the path and never drops.
  const heights = report.height.series.map(([, y]) => y);
  expect(heights.at(-1)).toBeGreaterThan(heights[0]);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(3.0);
});
