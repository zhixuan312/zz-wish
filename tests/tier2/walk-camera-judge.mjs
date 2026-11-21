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

/** Extract the camera's forward axis (negative Z column of the view rotation). */
export function forwardFromViewMatrix(elements) {
  if (!elements || elements.length !== 16) return null;
  // Column-major: the third column is elements 8, 9, 10; the camera looks down its negative Z.
  return { x: -elements[8], y: -elements[9], z: -elements[10] };
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const angle = (a, b) => {
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
  return Math.acos(dot);
};

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
    return { verdict: 'unknown', firstMovement: null, bounds: { earliest: null, latest: null },
      firstRotation: null, validSamples: valid.length,
      reasons: [...reasons, `only ${valid.length} valid sample(s); at least ${minimum} needed`] };
  }

  let firstRotation = null;
  for (let index = 1; index < valid.length; index++) {
    const previous = valid[index - 1], current = valid[index];
    const a = positionFromViewMatrix(previous.elements), b = positionFromViewMatrix(current.elements);
    const fa = forwardFromViewMatrix(previous.elements), fb = forwardFromViewMatrix(current.elements);
    if (!a || !b || !fa || !fb) { reasons.push('could not read a position or forward axis'); continue; }
    // Two consecutive samples only bracket the change: movement happened between them, not at either.
    if (distance(a, b) > translationLimit) {
      return { verdict: 'moving', firstMovement: current.t,
        bounds: { earliest: previous.t, latest: current.t }, firstRotation, validSamples: valid.length,
        reasons: [...reasons, `translation ${distance(a, b).toFixed(4)} m exceeds ${translationLimit} m `
          + `between ${previous.t} and ${current.t} ms`] };
    }
    if (firstRotation === null && angle(fa, fb) > rotationLimit) firstRotation = current.t;
  }

  if (firstRotation !== null) {
    return { verdict: 'rotating', firstMovement: null, bounds: { earliest: null, latest: null },
      firstRotation, validSamples: valid.length,
      reasons: [...reasons, 'orientation changed while position stayed within the translation limit'] };
  }
  return { verdict: 'still', firstMovement: null, bounds: { earliest: null, latest: null },
    firstRotation: null, validSamples: valid.length,
    reasons: [...reasons, 'neither position nor orientation changed beyond the thresholds'] };
}
