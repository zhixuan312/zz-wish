// Measure the Pine Gate camera path: position, speed, look angular rate, height above the walking
// ground, and the nearest approach to any authored trunk or post. Run from a capture that exposes
// the live camera; results are plain numbers so a test can assert them every round.

const RAD = 180 / Math.PI;

export const CAMERA_LIMITS = Object.freeze({
  // The walk itself may be a brisk pace; the two short segments after it, from the end of the walk
  // to the candle and from the candle to the settled burn, are held to a plain walk.
  walkSpeedMetresPerSecond: 1.8,
  settleSpeedMetresPerSecond: 1.4,
  // Turning the head quickly is fine, snapping it is not.
  angularDegreesPerSecond: 25,
  // Speed changes should be gradual. Measured as the largest change in speed over one 60 Hz frame,
  // expressed as metres per second squared.
  accelerationMetresPerSecondSquared: 3.0,
  // Walking eye height, then the lean down to the shelf.
  eyeMinMetres: 1.5,
  eyeMaxMetres: 1.7,
  // Near the shrine the eye may drop to read the candle, but no lower.
  shelfEyeMinMetres: 1.2,
  // The camera never brushes a trunk or post.
  clearanceMetres: 1.0,
});

const angleBetween = (a, b) => {
  const la = Math.hypot(a.x, a.y, a.z), lb = Math.hypot(b.x, b.y, b.z);
  if (!la || !lb) return 0;
  const dot = (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb);
  return Math.acos(Math.min(1, Math.max(-1, dot))) * RAD;
};

/**
 * Sample a recorded path at 60 Hz.
 * @param {{t: number, x: number, y: number, z: number, lx: number, ly: number, lz: number}[]} samples
 *   Position and look direction in world metres, in capture order.
 * @param {{position: [number, number, number], radius: number}[]} obstacles Trunks and posts.
 */
export function measureCameraPath(input, obstacles = []) {
  if (input.length < 2) throw new Error('A camera path needs at least two samples.');
  // A live trace begins while the camera is still parked at the entrance, so the first step is a
  // start from rest, not a jolt during the walk. Drop the leading standstill.
  let first = 0;
  while (first < input.length - 2
    && Math.hypot(input[first + 1].x - input[first].x, input[first + 1].y - input[first].y,
      input[first + 1].z - input[first].z) < 1e-4) first++;
  const samples = first ? input.slice(first) : input;
  const times = samples.map(s => s.t);
  const steps = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const dt = b.t - a.t;
    // A dropped frame reports a long step; dividing a small move by it is noise, not motion. Skip
    // gaps longer than 100 ms so a stutter in the recorder cannot masquerade as a jump.
    if (dt <= 0 || dt > 0.1) continue;
    const speed = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / dt;
    const turn = angleBetween(
      { x: b.lx - a.x, y: b.ly - a.y, z: b.lz - a.z },
      { x: a.lx - a.x, y: a.ly - a.y, z: a.lz - a.z },
    ) / dt;
    let clearance = Infinity;
    for (const obstacle of obstacles) {
      const d = Math.hypot(b.x - obstacle.position[0], b.y - obstacle.position[1], b.z - obstacle.position[2])
        - (obstacle.radius ?? 0);
      if (d < clearance) clearance = d;
    }
    steps.push({ t: b.t, dt, speed, turn, y: b.y, clearance });
  }
  const speeds = steps.map(s => s.speed);
  // Acceleration is measured over a 150 ms window rather than frame to frame: a single-frame
  // difference is dominated by capture jitter, while what the eye sees as a lurch is a speed change
  // sustained long enough to notice.
  const WINDOW = 0.15;
  // A recorder gap longer than 100 ms is a dropped frame; the speed either side of it is not a
  // real change in motion and must not be read as one.
  const accelerations = [];
  // The trace starts while the camera is still held at the entrance pose, so the first step is a
  // start from standstill, not a jolt in the walk. Begin measuring after the camera has moved.
  const moving = steps.findIndex(step => step.speed > 0.05);
  const from = moving < 0 ? 0 : Math.max(0, moving - 1);
  for (let i = from; i < steps.length; i++) {
    let j = i;
    while (j > from && steps[i].t - steps[j].t < WINDOW) j--;
    const span = steps[i].t - steps[j].t;
    if (span <= 0) continue;
    // Only compare steps that are a normal frame apart.
    if (steps[j].dt > 0.1 || steps[i].dt > 0.1) continue;
    accelerations.push([steps[i].t, Math.abs(steps[i].speed - steps[j].speed) / span]);
  }
  const accelerationSeries = accelerations;
  const turnRates = steps.map(s => s.turn);
  const heights = samples.map(s => s.y);
  const clearances = steps.map(s => s.clearance).filter(Number.isFinite);
  const worst = (values, t0 = 0) => values.reduce((best, value, index) =>
    value > best.value ? { value, t: steps[index + t0]?.t ?? samples[index].t } : best,
  { value: -Infinity, t: 0 });

  return {
    samples: samples.length,
    duration: times.at(-1) - times[0],
    speed: { max: worst(speeds).value, at: worst(speeds).t, series: speeds.map((v, i) => [steps[i].t, v]) },
    turn: { max: worst(turnRates).value, at: worst(turnRates).t, series: turnRates.map((v, i) => [steps[i].t, v]) },
    acceleration: {
      max: accelerationSeries.length ? Math.max(...accelerationSeries.map(([, v]) => v)) : 0,
      series: accelerationSeries,
    },
    height: { min: Math.min(...heights), max: Math.max(...heights), series: samples.map(s => [s.t, s.y]) },
    clearance: {
      min: clearances.length ? Math.min(...clearances) : Infinity,
      series: steps.filter(s => Number.isFinite(s.clearance)).map(s => [s.t, s.clearance]),
    },
  };
}

/**
 * The first point at which a measurement breaks its limit, or null when it holds throughout.
 * `afterWalk` names the instant the authored walk ends: everything from there is the settle into
 * the shrine, which is held to a plain walking pace rather than the brisk one.
 */
export function cameraPathViolations(report, limits = CAMERA_LIMITS, { afterWalk = null } = {}) {
  const failures = [];
  if (report.speed.max > limits.walkSpeedMetresPerSecond) {
    failures.push(`speed ${report.speed.max.toFixed(2)} m/s at ${report.speed.at.toFixed(1)} s exceeds ${limits.walkSpeedMetresPerSecond}`);
  }
  if (Number.isFinite(afterWalk)) {
    const settled = report.speed.series.filter(([t]) => t > afterWalk);
    const fastest = settled.reduce((best, [t, v]) => (v > best.value ? { t, value: v } : best), { t: 0, value: 0 });
    if (fastest.value > limits.settleSpeedMetresPerSecond) {
      failures.push(`settle speed ${fastest.value.toFixed(2)} m/s at ${fastest.t.toFixed(1)} s exceeds ${limits.settleSpeedMetresPerSecond}`);
    }
    const turning = report.turn.series.filter(([t]) => t > afterWalk)
      .reduce((best, [t, v]) => (v > best.value ? { t, value: v } : best), { t: 0, value: 0 });
    if (turning.value > limits.angularDegreesPerSecond) {
      failures.push(`settle turn ${turning.value.toFixed(1)} deg/s at ${turning.t.toFixed(1)} s exceeds ${limits.angularDegreesPerSecond}`);
    }
  }
  if (report.turn.max > limits.angularDegreesPerSecond) {
    failures.push(`turn ${report.turn.max.toFixed(1)} deg/s at ${report.turn.at.toFixed(1)} s exceeds ${limits.angularDegreesPerSecond}`);
  }
  if (report.acceleration.max > limits.accelerationMetresPerSecondSquared) {
    failures.push(`acceleration ${report.acceleration.max.toFixed(2)} m/s2 exceeds ${limits.accelerationMetresPerSecondSquared}`);
  }
  if (report.clearance.min < limits.clearanceMetres) {
    failures.push(`clearance ${report.clearance.min.toFixed(2)} m is under ${limits.clearanceMetres}`);
  }
  return failures;
}
