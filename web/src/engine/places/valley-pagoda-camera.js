import { hermiteTrack } from './pine-walk-curve.js';

export const TOWER_CENTER = [0, 0, -10.6];
export const TOWER_BASE_RADIUS = 2.68;
export const TABLE_CENTER = [7.1, 0, -19];
export const STREAM_X = 14.3;
export const GATE_Z = 18;

// The procedural runtime adds a 2.4 second settle after the route.
export const WALK_SECONDS = 27.6;

export const FOREGROUND_PINES = [
  [-3.4, 24.5, 1.07], [3.4, 24.0, 1.06],
  [-2.55, 20.65, .92], [4.8, 19.6, 1.26],
  [-3.5, 14.8, 1.12], [4.9, 13.3, 1.05],
  [-3.15, 7.65, 1.17], [3.7, 7.9, .82],
  [-6.1, 2.3, 1.24], [8.6, -4.9, 1.21],
];

// Seconds, world eye position, yaw toward +X from north, and pitch.
const ROUTE = [
  [0, [-.85, 1.66, 27.6], 2, 6],
  [.25, [-.85, 1.66, 27.6], 2, 6],
  [1.5, [-.78, 1.66, 26.55], 1, 6],
  [4.3, [-.41, 1.66, 22.25], 1, 1],
  [6.8, [0, 1.66, 18], 0, 1],
  [8, [.07, 1.66, 15.9], 0, 4],
  [10.5, [.22, 1.66, 11.4], -1, 12],
  [13.3, [.7, 1.66, 6.3], 10, 1],
  [15.3, [1.44, 1.66, 2.75], 16, -3],
  [16.7, [2.1, 1.66, .35], 9, -2],
  [19.6, [3.83, 1.66, -4.95], -31, 0],
  [20.8, [4.07, 1.66, -7.18], -36, -3],
  [22.2, [4.2, 1.66, -9.6], -33, -5],
  [24.4, [4.8, 1.66, -13.4], -2, 0],
  [26.5, [5.9, 1.66, -16.65], 26, -4],
];

const RADIANS = Math.PI / 180;
const PHONE_PULLBACK = 1.45;
const PHONE_CHOOSER_DIP = .10;

export function createValleyPagodaCamera(V3) {
  const table = V3(...TABLE_CENTER);
  const pose = (position, yaw, pitch, fov, distance = 1.75) => {
    const pos = V3(...position);
    const heading = yaw * RADIANS;
    const tilt = pitch * RADIANS;
    const horizontal = Math.cos(tilt) * distance;
    return {
      pos,
      look: pos.clone().add(V3(
        Math.sin(heading) * horizontal,
        Math.sin(tilt) * distance,
        -Math.cos(heading) * horizontal,
      )),
      fov,
    };
  };

  const wide = pose([6.34, 1.48, -17.62], 26, -9, 50);
  const widePhone = pose([6.34, 1.48, -17.62], 26, -9, 45);
  const choose = pose([6.68, .86, -18.06], 24, -17, 48);
  const choosePhone = pose([6.68, .81, -18.06], 24, -23, 44);

  // Convert world poses to nook coordinates. The existing narrow-screen
  // transform pulls the eye away from its aim and dips the chooser's aim.
  // Encode its inputs from the desired physical poses so both share the route.
  const nookPose = (view, phone = false, chooser = false) => {
    const look = view.look.clone();
    if (chooser) {
      const delta = look.clone().sub(view.pos);
      const dip = PHONE_CHOOSER_DIP;
      look.y += (dip * dip * delta.y +
        dip * Math.sqrt(delta.y * delta.y + (1 - dip * dip) *
          (delta.x * delta.x + delta.z * delta.z))) / (1 - dip * dip);
    }
    const pos = phone
      ? look.clone().addScaledVector(view.pos.clone().sub(look), 1 / PHONE_PULLBACK)
      : view.pos.clone();
    return { pos: pos.sub(table), look: look.sub(table), fov: view.fov };
  };

  const walkRows = [
    ...ROUTE,
    [27.25, wide.pos.toArray(), 26, -9],
    [WALK_SECONDS, wide.pos.toArray(), 26, -9],
  ];
  const times = walkRows.map(([seconds]) => seconds);
  const positionAt = hermiteTrack(times, walkRows.map(([, position]) => position));
  const directionAt = hermiteTrack(times, walkRows.map(([, , yaw, pitch]) => [yaw, pitch]));
  const walkFov = phone => phone ? 45 : 50;

  return {
    view: pose(ROUTE[0][1], ...ROUTE[0].slice(2), walkFov(false)),
    viewPhone: pose(ROUTE[0][1], ...ROUTE[0].slice(2), walkFov(true)),
    wide: nookPose(wide),
    widePhone: nookPose(widePhone, true),
    choose: nookPose(choose),
    choosePhone: nookPose(choosePhone, true, true),
    createWalk(_start, _end, phone) {
      return (progress, rig) => {
        const seconds = progress * WALK_SECONDS;
        const [yaw, pitch] = directionAt(seconds);
        const view = pose(positionAt(seconds), yaw, pitch, walkFov(phone));
        rig.pos.copy(view.pos);
        rig.look.copy(view.look);
        rig.fov = view.fov;
        rig.amp = 0;
      };
    },
  };
}
