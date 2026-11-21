// Synthetic checks for the camera-motion judge. No browser, no GPU, no build.
//
// The point is to pin the judge's decisions on matrices whose answer is known by construction:
// a camera that never moves, one that only turns, one that translates, and a sequence with nothing
// usable in it. The position extraction is checked against a matrix built by hand, because a wrong
// inverse-translation reading would make "still" and "moving" indistinguishable.
import { expect, test } from 'vitest';
import { judgeCameraMotion, positionFromViewMatrix, forwardFromViewMatrix } from './walk-camera-judge.mjs';

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

test('a camera that never moves is still, even while the picture animates', () => {
  // Identical matrices: any pixel change on screen came from the scene, not the camera.
  const position = { x: 0, y: 5, z: 10 };
  const samples = [0, 16, 33, 50, 66].map(t => ({ t, elements: viewMatrix(position, north) }));
  const verdict = judgeCameraMotion(samples);
  expect(verdict.verdict).toBe('still');
  expect(verdict.firstMovement).toBeNull();
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
  expect(verdict.firstMovement).toBeNull();
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
  expect(verdict.firstMovement).toBe(133);
  // The change happened between these two samples, so the true onset lies in this closed interval.
  expect(verdict.bounds).toEqual({ earliest: 116, latest: 133 });
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
