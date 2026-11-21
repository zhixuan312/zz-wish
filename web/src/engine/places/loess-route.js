// World metres. The carved lane, walking camera and review all share this grade.
export const gateZ = 16.3;
export const walkSeconds = 27.6; // The procedural engine then seats the visitor over 2.4 s.
export const routeBeats = [
  { at: 0, id: 'cart-lane' }, { at: 5, id: 'descent' }, { at: 13, id: 'threshold' },
  { at: 15.2, id: 'court-reveal' }, { at: 18.1, id: 'reveal-end' },
  { at: 25, id: 'window' }, { at: walkSeconds, id: 'seat-start' }, { at: 30, id: 'chooser' },
];

const blend = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function cartRut(x, z) {
  const offset = Math.abs(x - (1 + .09 * Math.sin(z * .55)));
  return (1 - smooth(.025, .23, Math.abs(offset - .66))) * smooth(17, 22, z);
}

export function routeGround(x, z) {
  const grade = 2.18 * smooth(15.5, 26.5, z);
  const cutHalfWidth = blend(15.2, 2.45, smooth(12.3, 17.6, z));
  const bank = smooth(cutHalfWidth, cutHalfWidth + 3.8, Math.abs(x - 1));
  return blend(grade, 2.45 + .14 * Math.sin(x * .36 + z * .12), bank) - .052 * cartRut(x, z);
}

// Conservative distance to the passage, open door leaf and near window stone.
// The floor is measured separately as eye height above the terrain.
const gateSolids = [
  [-9, -.2, 0, 2.7, gateZ - .8, gateZ],
  [3.2, 9, 0, 2.7, gateZ - .8, gateZ],
  [-.325, 3.325, 2.69, 2.87, gateZ - .825, gateZ + .125],
  [-.68, .68, .91, 1.096, -3.66, -2.817],
];
const distanceToBox = (x, y, z, [left, right, bottom, top, back, front]) => Math.hypot(
  Math.max(0, left - x, x - right), Math.max(0, bottom - y, y - top), Math.max(0, back - z, z - front),
);
export function routeClearance(x, y, z) {
  const dx = x - 3.17, dz = z - (gateZ - .9);
  const cos = Math.cos(-1.25), sin = Math.sin(-1.25);
  const door = distanceToBox(dx * cos - dz * sin, y, dx * sin + dz * cos, [-.65, .65, .005, 2.455, -.04, .04]);
  return Math.min(door, ...gateSolids.map(solid => distanceToBox(x, y, z, solid)));
}

// A Hermite track has a shared tangent across each authored time key. Position,
// heading and FOV stay continuous through the gate and the walking reveal.
function track(keys) {
  const tangents = keys.map(([t, value], i) => {
    if (i === 0 || i === keys.length - 1) return 0;
    const [before, prior] = keys[i - 1], [after, next] = keys[i + 1];
    const a = (value - prior) / (t - before), b = (next - value) / (after - t);
    return a * b <= 0 ? 0 : 2 * a * b / (a + b);
  });
  return seconds => {
    let i = 1;
    while (i < keys.length - 1 && seconds > keys[i][0]) i++;
    const [t0, a] = keys[i - 1], [t1, b] = keys[i];
    const span = t1 - t0, t = Math.min(1, Math.max(0, (seconds - t0) / span));
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * span * tangents[i - 1]
      + (-2 * t3 + 3 * t2) * b + (t3 - t2) * span * tangents[i];
  };
}

export function createLoessWalk(start, end, phone) {
  const seatLook = end.look.clone();
  // The engine pulls portrait back in its wide pose, then lowers only the chooser aim.
  if (phone) seatLook.y -= end.pos.distanceTo(seatLook) * .10;
  const startDirection = start.look.clone().sub(start.pos);
  const finalDirection = seatLook.clone().sub(end.pos);
  const yawOf = dir => Math.atan2(dir.x, -dir.z);
  const pitchOf = dir => Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
  const rad = deg => deg * Math.PI / 180;
  const xAt = track([[0, start.pos.x], [5, 1.62], [11, 1.36], [15.2, 1.23], [20, .99], [24, 1.10], [walkSeconds, end.pos.x + .17]]);
  const zAt = track([[0, start.pos.z], [4, 26.9], [8, 22.25], [13, 16.2], [15.2, 13.7], [18.1, 10.3], [22, 5.55], [25, 1.6], [walkSeconds, end.pos.z + .53]]);
  const yawAt = track([[0, yawOf(startDirection)], [5, rad(-5)], [11, rad(-1)], [15.2, rad(-8)], [18.1, rad(-8)], [22, rad(-11)], [walkSeconds, yawOf(finalDirection)]]);
  const pitchAt = track([[0, pitchOf(startDirection)], [7, rad(-4)], [12.7, rad(-2)], [15.2, rad(12)], [18.1, rad(12)], [22, rad(4)], [walkSeconds, pitchOf(finalDirection)]]);
  const fovAt = track([[0, start.fov], [12.25, start.fov], [15.2, phone ? 61 : 51], [18.1, phone ? 61 : 51], [walkSeconds, end.fov ?? (phone ? 44 : 32)]]);
  return (progress, rig) => {
    const seconds = progress * walkSeconds;
    const x = xAt(seconds), z = zAt(seconds);
    const eye = blend(1.67, end.pos.y + .19, smooth(25, walkSeconds, seconds));
    const h = routeGround(x, z) + eye;
    const yaw = yawAt(seconds), pitch = pitchAt(seconds);
    const focus = blend(startDirection.length(), 5.5, smooth(0, 3, seconds));
    const distance = blend(focus, finalDirection.length(), smooth(23, walkSeconds, seconds));
    rig.pos.set(x, h, z);
    rig.look.set(
      x + Math.sin(yaw) * Math.cos(pitch) * distance,
      h + Math.sin(pitch) * distance,
      z - Math.cos(yaw) * Math.cos(pitch) * distance,
    );
    rig.fov = fovAt(seconds);
    rig.amp = .006;
  };
}
