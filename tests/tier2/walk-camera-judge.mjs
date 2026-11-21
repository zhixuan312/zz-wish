// Decide whether a camera actually displaced, from a sequence of view matrices.
//
// The problem this solves: a canvas difference cannot tell a camera move from a fade, a shader
// animation, or a rotating camera that stands still. A view matrix can. From `matrixWorldInverse` the
// camera position is the negated translation of the rotation part, so two samples can be compared for
// translation separately from rotation.
//
// Scope: this judges the MAIN render camera only. Shadow cameras and secondary cameras are different
// objects with their own matrices; a sequence from any of them must not be passed in here, and the
// caller is responsible for taking the matrix from the main camera.
//
// Nothing here claims knowledge of production: the production bundle exposes no camera reference
// (see tests/tier2/README-walk-judge.md), so this module is only as good as the samples given to it.
//
// Every decision is one of:
//   'moving'  — translation between consecutive samples exceeds the threshold
//   'rotating'— the camera turned but its position stayed within the threshold
//   'still'   — neither position nor orientation changed beyond the thresholds
//   'unknown' — not enough valid samples to decide

/** Extract the camera position from a view matrix (world-inverse). */
export function positionFromViewMatrix(elements) {
  if (!elements || elements.length !== 16) return null;
  // A world-inverse matrix is [R^T | -R^T p], so its translation column is NOT -p: the camera position
  // must be recovered as p = -R^T^-1 t. Column-major storage means the 3x3 rotation occupies elements
  // 0-2, 4-6 and 8-10, and its transpose times t is the dot product of each ROW of the inverse's rotation
  // with t. Reading the translation alone is only correct when the camera has no rotation, which is why
  // a rotating camera looked like it was moving.
  const t = [elements[12], elements[13], elements[14]];
  return {
    x: -(elements[0] * t[0] + elements[1] * t[1] + elements[2] * t[2]),
    y: -(elements[4] * t[0] + elements[5] * t[1] + elements[6] * t[2]),
    z: -(elements[8] * t[0] + elements[9] * t[1] + elements[10] * t[2]),
  };
}

/** Extract the camera's world forward axis from a view matrix (world-inverse). */
export function forwardFromViewMatrix(elements) {
  if (!elements || elements.length !== 16) return null;
  // The world-inverse's third ROW is the camera's world-space forward basis, and the camera looks down
  // the negative Z of its own frame. Column-major storage places that row at elements 2, 6 and 10.
  // Verified against camera.getWorldDirection() for a non-axis-aligned yaw+pitch pose: exact.
  // Using elements 8, 9, 10 instead reads the third COLUMN, which happens to agree only for rotations
  // with no pitch and no roll.
  return { x: -elements[2], y: -elements[6], z: -elements[10] };
}

/** The camera's rotation as a 3x3 basis, read from the view matrix. */
export function basisFromViewMatrix(elements) {
  if (!elements || elements.length !== 16) return null;
  // Column-major: column i is elements [4i, 4i+1, 4i+2]. The world rotation is the transpose of the
  // inverse's rotation, so the basis columns are the inverse's rows.
  return [
    [elements[0], elements[4], elements[8]],
    [elements[1], elements[5], elements[9]],
    [elements[2], elements[6], elements[10]],
  ];
}

/**
 * Relative rotation angle between two camera bases, in radians.
 *
 * The full 3x3 relative rotation is used, not just the forward direction: a pure roll about the view
 * axis leaves the forward vector unchanged, so a forward-only test reports "no rotation" for a camera
 * that visibly turned on its own axis. For orthonormal bases the angle satisfies
 * cos(theta) = (trace(Ra^T Rb) - 1) / 2.
 */
export function rotationBetweenBases(a, b) {
  if (!a || !b) return null;
  let trace = 0;
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) trace += a[row][column] * b[row][column];
  }
  const cosine = Math.max(-1, Math.min(1, (trace - 1) / 2));
  return Math.acos(cosine);
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * Judge a camera sample sequence.
 *
 * @param {Array<{t:number, elements:number[]}>} samples view matrices with times in milliseconds
 * @param {{translationMetres?:number, rotationRadians?:number, minimumSamples?:number}} [options]
 * @returns {{verdict:string, firstMovement:number|null, bounds:{earliest:number|null, latest:number|null},
 *            firstRotation:number|null, reasons:string[], validSamples:number}}
 */
export function judgeCameraMotion(samples, options = {}) {
  const translationLimit = options.translationMetres ?? 1e-3;   // 1 mm
  const rotationLimit = options.rotationRadians ?? 1e-3;         // ~0.06 degrees
  const minimum = options.minimumSamples ?? 2;
  const reasons = [];
  const valid = (samples ?? []).filter(sample => {
    const ok = sample && Number.isFinite(sample.t) && Array.isArray(sample.elements)
      && sample.elements.length === 16 && sample.elements.every(Number.isFinite);
    if (!ok) reasons.push('dropped a sample with a missing or non-finite matrix');
    return ok;
  }).sort((a, b) => a.t - b.t);

  if (valid.length < minimum) {
    return { verdict: 'unknown', firstExceedance: null, bounds: null, firstRotation: null,
      validSamples: valid.length,
      reasons: [...reasons, `only ${valid.length} valid sample(s); at least ${minimum} needed`] };
  }

  // Displacement is measured from the first sample, which the caller takes before the Step click. A
  // per-frame comparison would miss a slow walk: 0.4 mm each frame never exceeds a 1 mm step limit, yet
  // two millimetres accumulate in five frames and that is real movement.
  const reference = positionFromViewMatrix(valid[0].elements);
  const referenceBasis = basisFromViewMatrix(valid[0].elements);
  if (!reference || !referenceBasis) {
    return { verdict: 'unknown', firstExceedance: null, bounds: null, firstRotation: null,
      validSamples: valid.length, reasons: [...reasons, 'the reference matrix could not be read'] };
  }

  let firstRotation = null;
  for (const sample of valid) {
    const position = positionFromViewMatrix(sample.elements);
    const basis = basisFromViewMatrix(sample.elements);
    if (!position || !basis) { reasons.push('could not read a position or basis'); continue; }
    if (firstRotation === null && rotationBetweenBases(referenceBasis, basis) > rotationLimit) {
      firstRotation = sample.t;
    }
    const travelled = distance(reference, position);
    if (travelled > translationLimit) {
      // The first sample past the limit bounds where the limit was crossed, not where motion began: a
      // continuous 0.4 mm per frame walk crosses 1 mm somewhere inside this interval.
      const index = valid.indexOf(sample);
      const previous = index > 0 ? valid[index - 1].t : null;
      return { verdict: 'moving', firstExceedance: sample.t,
        bounds: { earliest: previous, latest: sample.t },
        displacementMetres: travelled, firstRotation, validSamples: valid.length,
        reasons: [...reasons, `travelled ${travelled.toFixed(4)} m from the reference at ${valid[0].t} ms, `
          + `exceeding ${translationLimit} m at ${sample.t} ms`] };
    }
  }

  if (firstRotation !== null) {
    return { verdict: 'rotating', firstExceedance: null, bounds: null, firstRotation,
      validSamples: valid.length,
      reasons: [...reasons, 'orientation changed while position stayed within the translation limit, '
        + 'measured on the full relative rotation so a pure roll counts'] };
  }
  return { verdict: 'still', firstExceedance: null, bounds: null, firstRotation: null,
    validSamples: valid.length,
    reasons: [...reasons, 'neither position nor orientation changed beyond the thresholds'] };
}
