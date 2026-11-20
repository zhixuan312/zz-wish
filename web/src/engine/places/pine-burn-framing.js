// Where the lit subject lands on screen, and whether the camera is closing in on it.
//
// The burning views must keep the whole tray and the flame inside the safe area, must not hide the
// lamp behind a pillar or the gate frame, and must never pull back after ignition. Those are
// geometric questions about a camera pose, so they live here as pure functions: the browser test
// feeds them the live camera each frame, and a unit test can check the same code against authored
// poses without a renderer.

/**
 * Project a world point through a camera-like pose.
 * @param {{x: number, y: number, z: number}} point
 * @param {{pos: {x: number, y: number, z: number}, look: {x: number, y: number, z: number},
 *   fov: number, aspect: number}} view
 * @returns {{x: number, y: number, depth: number}} Screen coordinates in 0..1 with y down.
 */
export function projectPoint(point, view) {
  const dir = { x: view.look.x - view.pos.x, y: view.look.y - view.pos.y, z: view.look.z - view.pos.z };
  const length = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const forward = { x: dir.x / length, y: dir.y / length, z: dir.z / length };
  // Any stable right vector works; the camera has no roll in these views.
  // right = forward x worldUp, up = right x forward. With a y-up world that gives a stable frame
  // with no roll, which these authored cameras never have.
  const worldUp = { x: 0, y: 1, z: 0 };
  let right = {
    x: forward.y * worldUp.z - forward.z * worldUp.y,
    y: forward.z * worldUp.x - forward.x * worldUp.z,
    z: forward.x * worldUp.y - forward.y * worldUp.x,
  };
  const rightLength = Math.hypot(right.x, right.y, right.z);
  if (rightLength < 1e-6) right = { x: 1, y: 0, z: 0 };
  else right = { x: right.x / rightLength, y: right.y / rightLength, z: right.z / rightLength };
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  const offset = { x: point.x - view.pos.x, y: point.y - view.pos.y, z: point.z - view.pos.z };
  const depth = offset.x * forward.x + offset.y * forward.y + offset.z * forward.z;
  const tanHalf = Math.tan(view.fov * Math.PI / 360);
  const sx = (offset.x * right.x + offset.y * right.y + offset.z * right.z) / (depth * tanHalf * view.aspect);
  const sy = (offset.x * up.x + offset.y * up.y + offset.z * up.z) / (depth * tanHalf);
  return { x: .5 + sx * .5, y: .5 - sy * .5, depth };
}

/**
 * The screen box of a world-space box, plus whether it is wholly inside a safe area.
 * @param {{min: number[], max: number[]}} box World corners.
 * @param {object} view Camera pose.
 * @param {{left: number, right: number, top: number, bottom: number}} safe Fractions of the frame.
 */
export function screenBox(box, view, safe = { left: 0, right: 1, top: 0, bottom: 1 }) {
  const xs = [], ys = [];
  let depth = Infinity;
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) {
        const p = projectPoint({ x, y, z }, view);
        xs.push(p.x); ys.push(p.y); depth = Math.min(depth, p.depth);
      }
    }
  }
  const rect = { left: Math.min(...xs), right: Math.max(...xs),
    top: Math.min(...ys), bottom: Math.max(...ys), depth };
  rect.inside = depth > 0 && rect.left >= safe.left && rect.right <= safe.right
    && rect.top >= safe.top && rect.bottom <= safe.bottom;
  return rect;
}

/**
 * Whether a nearer solid stands between the camera and the subject, by testing the segment against
 * an axis-aligned box.
 */
export function segmentHitsBox(from, to, box) {
  // Accept a point as either {x,y,z} or [x,y,z], since callers hand over both shapes.
  const at = (point, axis, index) => (Array.isArray(point) ? point[index] : point[axis]);
  let t0 = 0, t1 = 1;
  for (const axis of ['x', 'y', 'z']) {
    const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    const start = at(from, axis, index), delta = at(to, axis, index) - start;
    const low = box.min[index], high = box.max[index];
    if (Math.abs(delta) < 1e-9) {
      if (start < low || start > high) return false;
      continue;
    }
    let near = (low - start) / delta, far = (high - start) / delta;
    if (near > far) [near, far] = [far, near];
    t0 = Math.max(t0, near); t1 = Math.min(t1, far);
    if (t0 > t1) return false;
  }
  // A hit that only touches the far end is the subject itself; one that only touches the near end
  // is the camera. Only a box the ray passes through in between counts as an occluder.
  // Only a box the ray enters some way along and leaves before the subject counts. Touching the far
  // end is the subject itself, and touching the near end is the camera.
  return t0 > 1e-6 && t1 < 1 - 1e-6;
}

/** Distance from a camera pose to the wick, in metres. */
export function wickDistance(view, wick) {
  return Math.hypot(view.pos.x - wick.x, view.pos.y - wick.y, view.pos.z - wick.z);
}

/**
 * Check a whole recorded settle: the tray and flame stay in the safe area, nothing occludes them,
 * and the camera never backs away from the wick.
 */
export function reviewBurnFrames(frames, {
  safe = { left: .12, right: .88, top: .10, bottom: .62 },
  occluders = [],
} = {}) {
  const failures = [];
  let previous = null, closest = Infinity;
  for (const frame of frames) {
    const tray = screenBox(frame.tray, frame.view, safe);
    const flame = screenBox(frame.flame, frame.view, safe);
    if (!tray.inside) failures.push(`t ${frame.t.toFixed(2)}: tray leaves the safe area`);
    if (!flame.inside) failures.push(`t ${frame.t.toFixed(2)}: flame leaves the safe area`);
    for (const box of occluders) {
      if (segmentHitsBox(frame.view.pos, frame.wick, box)) {
        failures.push(`t ${frame.t.toFixed(2)}: line to the wick passes through an occluder`);
      }
    }
    const distance = wickDistance(frame.view, frame.wick);
    if (previous !== null && distance > previous + 1e-3) {
      failures.push(`t ${frame.t.toFixed(2)}: pulled back from the wick (${previous.toFixed(3)} -> ${distance.toFixed(3)})`);
    }
    previous = distance;
    closest = Math.min(closest, distance);
  }
  return { failures, closest };
}
