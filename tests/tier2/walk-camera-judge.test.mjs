// Synthetic checks for the camera-motion judge. No browser, no GPU, no build.
//
// The point is to pin the judge's decisions on matrices whose answer is known by construction:
// a camera that never moves, one that only turns, one that translates, and a sequence with nothing
// usable in it. The position extraction is checked against a matrix built by hand, because a wrong
// inverse-translation reading would make "still" and "moving" indistinguishable.
import { expect, test } from 'vitest';
import { judgeCameraMotion, positionFromViewMatrix, forwardFromViewMatrix, basisFromViewMatrix,
  rotationBetweenBases } from './walk-camera-judge.mjs';

// Build the view matrix with three.js itself, so the fixture cannot disagree with the library about
// element order. A hand-written matrix would test my arithmetic, not the judge.
import * as THREE from 'three';

function viewMatrix(position, forward) {
  const camera = new THREE.PerspectiveCamera(50, 1, .01, 1000);
  camera.position.set(position.x, position.y, position.z);
  camera.lookAt(new THREE.Vector3(
    position.x + forward.x, position.y + forward.y, position.z + forward.z));
  camera.updateMatrixWorld(true);
  return [...camera.matrixWorldInverse.elements];
}

const north = { x: 0, y: 0, z: -1 };

test('the view matrix position and forward axis are read back exactly', () => {
  const position = { x: 3, y: 4.5, z: -7 };
  const elements = viewMatrix(position, north);
  const read = positionFromViewMatrix(elements);
  expect(read.x).toBeCloseTo(3, 9);
  expect(read.y).toBeCloseTo(4.5, 9);
  expect(read.z).toBeCloseTo(-7, 9);
  const forward = forwardFromViewMatrix(elements);
  expect(forward.x).toBeCloseTo(0, 9);
  expect(forward.y).toBeCloseTo(0, 9);
  expect(forward.z).toBeCloseTo(-1, 9);
});

test('the forward axis matches getWorldDirection for a yaw and pitch pose', () => {
  // Axis-aligned poses hide a wrong row/column choice; this one has both yaw and pitch.
  const camera = new THREE.PerspectiveCamera(50, 1, .01, 1000);
  camera.position.set(2, 3, -4);
  camera.rotation.set(0.31, 0.77, 0, 'YXZ');
  camera.updateMatrixWorld(true);
  const truth = camera.getWorldDirection(new THREE.Vector3());
  const read = forwardFromViewMatrix([...camera.matrixWorldInverse.elements]);
  expect(read.x).toBeCloseTo(truth.x, 9);
  expect(read.y).toBeCloseTo(truth.y, 9);
  expect(read.z).toBeCloseTo(truth.z, 9);
});

test('a pure roll about the view axis is rotation, though the forward axis never changes', () => {
  const camera = new THREE.PerspectiveCamera(50, 1, .01, 1000);
  camera.position.set(0, 5, 10);
  camera.rotation.set(0, 0, 0, 'YXZ');
  camera.updateMatrixWorld(true);
  const upright = [...camera.matrixWorldInverse.elements];
  camera.rotation.z = 0.25;
  camera.updateMatrixWorld(true);
  const rolled = [...camera.matrixWorldInverse.elements];

  // The forward axis is identical, so a forward-only test would see nothing.
  const fa = forwardFromViewMatrix(upright), fb = forwardFromViewMatrix(rolled);
  expect(Math.abs(fa.x - fb.x) + Math.abs(fa.y - fb.y) + Math.abs(fa.z - fb.z)).toBeLessThan(1e-12);

  // The full relative rotation sees it.
  expect(rotationBetweenBases(basisFromViewMatrix(upright), basisFromViewMatrix(rolled)))
    .toBeCloseTo(0.25, 9);

  const verdict = judgeCameraMotion([
    { t: 0, elements: upright },
    { t: 16, elements: rolled },
  ]);
  expect(verdict.verdict).toBe('rotating');
  expect(verdict.firstRotation).toBe(16);
});

test('a camera that never moves is still, even while the picture animates', () => {
  // Identical matrices: any pixel change on screen came from the scene, not the camera.
  const position = { x: 0, y: 5, z: 10 };
  const samples = [0, 16, 33, 50, 66].map(t => ({ t, elements: viewMatrix(position, north) }));
  const verdict = judgeCameraMotion(samples);
  expect(verdict.verdict).toBe('still');
  expect(verdict.firstExceedance).toBeNull();
  expect(verdict.firstRotation).toBeNull();
});

test('a camera that only turns reports rotating, with no displacement', () => {
  const position = { x: 0, y: 5, z: 10 };
  const samples = [
    { t: 0, elements: viewMatrix(position, north) },
    { t: 16, elements: viewMatrix(position, { x: 0.2, y: 0, z: -1 }) },
    { t: 33, elements: viewMatrix(position, { x: 0.4, y: 0, z: -1 }) },
  ];
  const verdict = judgeCameraMotion(samples);
  expect(verdict.verdict).toBe('rotating');
  expect(verdict.firstExceedance).toBeNull();
  expect(verdict.firstRotation).toBe(16);
});

test('a real translation reports moving, bracketed by the two samples around it', () => {
  const samples = [
    { t: 100, elements: viewMatrix({ x: 0, y: 5, z: 10 }, north) },
    { t: 116, elements: viewMatrix({ x: 0, y: 5, z: 10 }, north) },
    { t: 133, elements: viewMatrix({ x: 0, y: 5, z: 9.98 }, north) },  // 2 cm
    { t: 150, elements: viewMatrix({ x: 0, y: 5, z: 9.9 }, north) },
  ];
  const verdict = judgeCameraMotion(samples);
  expect(verdict.verdict).toBe('moving');
  expect(verdict.firstExceedance).toBe(133);
  // The limit was crossed between these two samples. That is a bound on the crossing, not a measured
  // onset: the camera moved somewhere inside the interval and the samples cannot say where.
  expect(verdict.bounds).toEqual({ earliest: 116, latest: 133 });
});

test('a slow walk that gains 0.4 mm each frame is moving, and the bracket is the crossing', () => {
  const samples = [];
  for (let index = 0; index < 8; index++) {
    samples.push({ t: index * 16, elements: viewMatrix({ x: 0, y: 5, z: 10 - index * 0.0004 }, north) });
  }
  const verdict = judgeCameraMotion(samples);
  // 0.4 mm per sample never exceeds a 1 mm step, so a per-frame test would call this still.
  expect(verdict.verdict).toBe('moving');
  expect(verdict.displacementMetres).toBeGreaterThan(.001);
  // The crossing happens between the sample still under 1 mm and the first one over it.
  // 0.4 mm per sample: 0.8 mm at 32 ms, 1.2 mm at 48 ms, so the limit is crossed in (32, 48].
  expect(verdict.bounds.earliest).toBe(32);
  expect(verdict.bounds.latest).toBe(48);
  expect(verdict.firstExceedance).toBe(48);
});

test('a sub-millimetre drift is not a movement', () => {
  const samples = [
    { t: 0, elements: viewMatrix({ x: 0, y: 5, z: 10 }, north) },
    { t: 16, elements: viewMatrix({ x: 0, y: 5, z: 9.9995 }, north) },  // 0.5 mm
  ];
  expect(judgeCameraMotion(samples).verdict).toBe('still');
});

test('nothing usable yields unknown, with the reason stated', () => {
  expect(judgeCameraMotion([]).verdict).toBe('unknown');
  expect(judgeCameraMotion([{ t: 0 }]).verdict).toBe('unknown');
  const nan = { t: 16, elements: new Array(16).fill(Number.NaN) };
  const verdict = judgeCameraMotion([{ t: 0, elements: viewMatrix({ x: 0, y: 0, z: 0 }, north) }, nan]);
  expect(verdict.verdict).toBe('unknown');
  expect(verdict.reasons.join(' ')).toMatch(/non-finite|at least 2/);
});

test('a single valid sample cannot decide, and says so rather than guessing still', () => {
  const verdict = judgeCameraMotion([{ t: 0, elements: viewMatrix({ x: 0, y: 0, z: 0 }, north) }]);
  expect(verdict.verdict).toBe('unknown');
  expect(verdict.validSamples).toBe(1);
});
