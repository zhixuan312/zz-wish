// A camera track through authored keyframes at uneven times.
//
// three.js offers smoothstep (which comes to a standstill at every keyframe, so the camera stops and
// starts at each beat) and uniform Catmull-Rom (which assumes evenly spaced keys and overshoots
// wildly when they are not). A walk needs neither: it needs a curve that passes through every
// authored pose, keeps its speed continuous, and never swings past a pose.
//
// This is the standard monotone cubic Hermite construction (Fritsch-Carlson): tangents are the
// centred difference, then limited so each component stays monotone between its two keys. That gives
// C1 continuity with no overshoot.

function tangents(times, values) {
  const n = times.length;
  const m = values.map(() => 0);
  const delta = [];
  for (let i = 0; i < n - 1; i++) delta.push((values[i + 1] - values[i]) / (times[i + 1] - times[i]));
  for (let i = 0; i < n; i++) {
    if (i === 0) m[i] = delta[0] ?? 0;
    else if (i === n - 1) m[i] = delta[n - 2] ?? 0;
    else if (delta[i - 1] * delta[i] <= 0) m[i] = 0;              // a turning point: settle here
    else m[i] = (delta[i - 1] + delta[i]) / 2;
  }
  // Fritsch-Carlson limiter: keeps each segment monotone, so the curve never overshoots a pose.
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / delta[i], b = m[i + 1] / delta[i];
    const s = a * a + b * b;
    if (s > 9) {
      const scale = 3 / Math.sqrt(s);
      m[i] = scale * a * delta[i];
      m[i + 1] = scale * b * delta[i];
    }
  }
  return m;
}

/**
 * Build a sampler for one component set.
 * @param {number[]} times Keyframe times in seconds, strictly increasing.
 * @param {number[][]} rows One array of components per keyframe.
 * @returns {(t: number) => number[]}
 */
export function hermiteTrack(times, rows) {
  if (times.length < 2) throw new Error('A camera track needs at least two keyframes.');
  const width = rows[0].length;
  const tangentsByComponent = Array.from({ length: width }, (_, c) =>
    tangents(times, rows.map(row => row[c])));
  return t => {
    if (t <= times[0]) return rows[0].slice();
    if (t >= times[times.length - 1]) return rows[rows.length - 1].slice();
    for (let i = 1; i < times.length; i++) {
      if (t > times[i]) continue;
      const h = times[i] - times[i - 1];
      const s = (t - times[i - 1]) / h;
      const s2 = s * s, s3 = s2 * s;
      const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s;
      const h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
      return rows[i - 1].map((v, c) => {
        const m0 = tangentsByComponent[c][i - 1], m1 = tangentsByComponent[c][i];
        return h00 * v + h10 * h * m0 + h01 * rows[i][c] + h11 * h * m1;
      });
    }
    return rows[rows.length - 1].slice();
  };
}

/**
 * The last stretch of the Pine Gate walk: round the shrine to the chooser pose.
 *
 * Both the runtime and the Tier 1 camera test call this, so the timing under test is the timing that
 * ships. It bows out to the shrine's seaward side because a straight line from the reveal grazes the
 * lamp shrine's crown, and it is timed for the slower of two budgets: the walking pace over the
 * route's own arc, and the look limit over the angle the aim must swing.
 *
 * @param {{THREE: object, from: object, to: object, hold: {approachMetresPerSecond?: number,
 *   lookDegreesPerSecond?: number}}} args
 * @returns {{ route: object, seconds: number, metres: number, swing: number, fromAim: object, toAim: object }}
 */
export function shrineApproach({ THREE, from, to, hold }) {
  const pace = hold?.approachMetresPerSecond ?? 1.4;
  const turnLimit = hold?.lookDegreesPerSecond ?? 20;
  // The shrine stands at the lamp anchor; its envelope is a little over a metre across.
  const anchor = new THREE.Vector3(-1.8, 5.0, .9);
  const around = new THREE.Vector3(to.pos.x + 1.05, to.pos.y + .10, to.pos.z + .55);
  if (around.distanceTo(anchor) < 1.35) around.copy(anchor).add(new THREE.Vector3(1.45, .10, .35));
  const route = new THREE.CatmullRomCurve3([from.pos.clone(), around, to.pos.clone()], false, 'centripetal');
  const metres = route.getLength();
  const fromAim = from.look.clone().sub(from.pos).normalize();
  const toAim = to.look.clone().sub(to.pos).normalize();
  const swing = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(fromAim.dot(toAim), -1, 1)));
  // Smoothstep peaks at 1.5x its average, so both budgets use the peak.
  const seconds = Math.max(1.6, (metres * 1.5) / pace, (swing * 1.5) / turnLimit);
  return { route, seconds, metres, swing, fromAim, toAim };
}
