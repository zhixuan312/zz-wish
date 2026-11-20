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
export function measureCameraPath(samples, obstacles = []) {
  if (samples.length < 2) throw new Error('A camera path needs at least two samples.');
  const times = samples.map(s => s.t);
  const steps = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const dt = b.t - a.t;
    if (dt <= 0) continue;
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
  const accelerations = steps.slice(1).map((s, i) => Math.abs(s.speed - steps[i].speed) / s.dt);
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
      max: accelerations.length ? Math.max(...accelerations) : 0,
      series: accelerations.map((v, i) => [steps[i + 1].t, v]),
    },
    height: { min: Math.min(...heights), max: Math.max(...heights), series: samples.map(s => [s.t, s.y]) },
    clearance: {
      min: clearances.length ? Math.min(...clearances) : Infinity,
      series: steps.filter(s => Number.isFinite(s.clearance)).map(s => [s.t, s.clearance]),
    },
  };
}

/** The first point at which a measurement breaks its limit, or null when it holds throughout. */
export function cameraPathViolations(report, limits = CAMERA_LIMITS) {
  const failures = [];
  if (report.speed.max > limits.walkSpeedMetresPerSecond) {
    failures.push(`speed ${report.speed.max.toFixed(2)} m/s at ${report.speed.at.toFixed(1)} s exceeds ${limits.walkSpeedMetresPerSecond}`);
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
