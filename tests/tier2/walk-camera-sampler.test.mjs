// Offline checks for the camera sampler's transform and its degradation paths.
//
// The sampler itself runs in a page; what can be checked without a browser is the rebasing, the copy-by-
// value contract, and the decision to answer unknown when a pre-click reference or the main camera is
// missing. Simulated frames drive the same functions the page would receive.
import { expect, test } from 'vitest';
import * as THREE from 'three';
import { samplesFromSnapshot, sampleInterval } from './walk-camera-sampler.mjs';
import { judgeCameraMotion, positionFromViewMatrix } from './walk-camera-judge.mjs';

function viewMatrixAt(position) {
  const camera = new THREE.PerspectiveCamera(50, 1, .01, 1000);
  camera.position.set(position.x, position.y, position.z);
  camera.lookAt(new THREE.Vector3(position.x, position.y, position.z - 1));
  camera.updateMatrixWorld(true);
  return [...camera.matrixWorldInverse.elements];
}

// A snapshot shaped exactly like pageCollect() produces: absolute performance.now() times.
function snapshot({ referenceAt = 1000, clickAt = 1100, frames = [], missing = 0, errors = [] } = {}) {
  return { installedAt: 900, clickAt, reference: viewMatrixAt({ x: 0, y: 5, z: 10 }),
    referenceAt, frames, missing, errors };
}

test('a walk that starts after the click is reported relative to the click', () => {
  const frames = [
    { t: 1116, elements: viewMatrixAt({ x: 0, y: 5, z: 10 }) },
    { t: 1132, elements: viewMatrixAt({ x: 0, y: 5, z: 9.9995 }) },
    { t: 1148, elements: viewMatrixAt({ x: 0, y: 5, z: 9.997 }) },
    { t: 1164, elements: viewMatrixAt({ x: 0, y: 5, z: 9.993 }) },
  ];
  const { samples, clickAt } = samplesFromSnapshot(snapshot({ frames }));
  expect(clickAt).toBe(1100);
  // The reference is the pre-click frame, rebased to -100 ms relative to the click.
  expect(samples[0].t).toBe(-100);
  expect(samples[1].t).toBe(16);
  const verdict = judgeCameraMotion(samples);
  expect(verdict.verdict).toBe('moving');
  // Cumulative travel from the pre-click reference: 0.5 mm at 32 ms, 3.0 mm at 48 ms, so the 1 mm
  // threshold is crossed inside (32, 48].
  expect(verdict.bounds).toEqual({ earliest: 32, latest: 48 });
  expect(sampleInterval(samples)).toBe(16);
});

test('the reference is copied by value, so later camera motion cannot rewrite it', () => {
  const reference = viewMatrixAt({ x: 0, y: 5, z: 10 });
  const copy = Array.from(reference);
  const snap = snapshot({ frames: [] });
  snap.reference = copy;
  // Mutate the array the sampler read from, as a later frame would.
  reference.fill(0);
  const { samples } = samplesFromSnapshot(snap);
  const recovered = positionFromViewMatrix(samples[0].elements);
  expect(recovered.z).toBeCloseTo(10, 9);
});

test('no pre-click reference yields unknown, whatever the frames say', () => {
  const snap = snapshot({ frames: [{ t: 1116, elements: viewMatrixAt({ x: 0, y: 5, z: 9.9 }) }] });
  snap.reference = null;
  snap.referenceAt = null;
  const { samples, reasons } = samplesFromSnapshot(snap);
  expect(samples).toEqual([]);
  expect(reasons.join(' ')).toMatch(/no pre-click reference/);
  expect(judgeCameraMotion(samples).verdict).toBe('unknown');
});

test('a snapshot with no click mark yields unknown', () => {
  const snap = snapshot({ clickAt: null, frames: [{ t: 1116, elements: viewMatrixAt({ x: 0, y: 5, z: 9.9 }) }] });
  const { samples, reasons } = samplesFromSnapshot(snap);
  expect(samples).toEqual([]);
  expect(reasons.join(' ')).toMatch(/click was never marked/);
});

test('a missing main camera is reported, and the judge stays unknown', () => {
  const snap = snapshot({ missing: 42, frames: [] });
  snap.reference = null;
  snap.referenceAt = null;
  const { samples, reasons } = samplesFromSnapshot(snap);
  expect(reasons.join(' ')).toMatch(/main camera was absent on 42 frame/);
  expect(judgeCameraMotion(samples).verdict).toBe('unknown');
});

test('errors inside the sampler are carried into the reasons, not swallowed', () => {
  const snap = snapshot({ frames: [{ t: 1116, elements: viewMatrixAt({ x: 0, y: 5, z: 10 }) }],
    errors: ['reading matrixWorldInverse threw'] });
  const { reasons } = samplesFromSnapshot(snap);
  expect(reasons.join(' ')).toMatch(/reading matrixWorldInverse threw/);
});

test('a still camera sampled after the click stays still', () => {
  const frames = [16, 32, 48, 64].map(offset => ({ t: 1100 + offset, elements: viewMatrixAt({ x: 0, y: 5, z: 10 }) }));
  const { samples } = samplesFromSnapshot(snapshot({ frames }));
  const verdict = judgeCameraMotion(samples);
  expect(verdict.verdict).toBe('still');
  expect(verdict.firstExceedance).toBeNull();
});

test('a null snapshot is unknown with a stated reason', () => {
  const { samples, reasons } = samplesFromSnapshot(null);
  expect(samples).toEqual([]);
  expect(reasons.join(' ')).toMatch(/no sampler snapshot/);
});

test('the median sample interval is reported, and is null with one sample', () => {
  // Gaps are 16 and 17, so the median of an even count is their mean.
  expect(sampleInterval([{ t: 0 }, { t: 16 }, { t: 33 }])).toBe(16.5);
  expect(sampleInterval([{ t: 0 }])).toBeNull();
  expect(sampleInterval([])).toBeNull();
});
