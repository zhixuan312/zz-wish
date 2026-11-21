import { Vector3 } from 'three';
import { measureCameraPath } from '../../tests/visual/pine-camera-path.mjs';
import { HIGH_WHITE_WALK_SECONDS } from '../../web/src/engine/places/highland-camera.js';

// Conservative world-space envelopes for the doorway and the solids beside
// the route. Dimensions come from the entrance wall, east wing and nook in
// highland.js. The camera is on the open side of the other court buildings.
const walls = [
  ['west jamb', [-12, 0, 27.15], [-1.15, 3.6, 28.12]],
  ['east jamb', [1.15, 0, 27.15], [25, 3.6, 28.12]],
  ['lintel', [-1.15, 2.8, 27.15], [1.15, 3.6, 28.13]],
  ['inner west return', [-2.60, 0, 26.099], [-1.146, 3.24, 27.152]],
  ['inner west coping', [-2.68, 3.24, 26.06], [-1.125, 3.38, 27.18]],
  ['threshold stone', [-1.15, .049, 26.23], [1.15, .122, 28.15]],
  ['west court wall', [-12.35, 0, -2.3], [-11.65, 3.4, 27.7]],
  ['east court wall', [24.65, 0, -2.3], [25.35, 3.4, 27.7]],
  ['hall face', [-11.5, 0, -1.8], [14.5, 4.5, -1]],
  ['east wing west wall', [15.7, 0, 5.5], [16.3, 2.7, 14.7]],
  ['east wing north return', [20.7, 0, 14.8], [24.7, 2.7, 15.4]],
  ['nook back wall', [15.7, 0, 15.145], [20.3, 2.7, 15.695]],
  ['nook west wall', [15.145, 0, 15.4], [15.695, 2.7, 18.8]],
  ['lamp ledge', [15.7, .86, 15.7], [16.34, .92, 16.22]],
  ['lamp ledge support', [15.72, 0, 16.14], [16.32, .86, 16.22]],
  ['entrance paving', [-2.1, 0, 26], [2.1, .12, 52]],
  ['court paving', [-11.5, 0, -4], [21.5, .08, 28]],
];

function clearance(row, [name, lo, hi]) {
  const signed = [row.x, row.y, row.z].map((m, i) => Math.max(lo[i] - m, m - hi[i]));
  const distance = Math.max(...signed) < 0 ? Math.max(...signed) : Math.hypot(...signed.map(v => Math.max(0, v)));
  return { name, metres: distance, at: row.t };
}

export function highWhiteTraceMetrics(rows) {
  const { duration, samples, acceleration, height } = measureCameraPath(rows);
  const direction = row => new Vector3(row.lx - row.x, row.ly - row.y, row.lz - row.z);
  const peakTurn = { value: 0, at: rows[0].t };
  const peakWalkSpeed = { value: 0, at: rows[0].t };
  const peakSeatSpeed = { value: 0, at: rows[0].t };
  for (let index = 1; index < rows.length; index++) {
    const before = rows[index - 1], after = rows[index];
    const dt = after.t - before.t;
    if (dt <= 0) continue;
    const turn = direction(before).angleTo(direction(after)) * (180 / Math.PI) / dt;
    if (turn > peakTurn.value) Object.assign(peakTurn, { value: turn, at: after.t });
    const speed = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z) / dt;
    // Include an edge that straddles the boundary in both phases, so neither
    // limit can hide a speed jump at the end of the reveal hold.
    if ((before.walkSeconds ?? before.t) < HIGH_WHITE_WALK_SECONDS && speed > peakWalkSpeed.value)
      Object.assign(peakWalkSpeed, { value: speed, at: after.t });
    if ((after.walkSeconds ?? after.t) > HIGH_WHITE_WALK_SECONDS && speed > peakSeatSpeed.value)
      Object.assign(peakSeatSpeed, { value: speed, at: after.t });
  }
  const closest = (frames, solids) => frames.reduce((minimum, frame) => {
    for (const solid of solids) {
      const candidate = clearance(frame, solid);
      if (candidate.metres < minimum.metres) minimum = candidate;
    }
    return minimum;
  }, { metres: Infinity });
  const { min, max } = height;
  return {
    duration, samples,
    peakWalkSpeed, peakSeatSpeed,
    peakTurn,
    peakAcceleration: acceleration.max,
    height: { min, max },
    nearestStructure: closest(rows, walls),
    doorway: closest(rows.filter(row => row.z <= 28 && row.z >= 27.15), walls.slice(0, 3)),
  };
}
