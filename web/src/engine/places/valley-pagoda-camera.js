import { hermiteTrack } from './pine-walk-curve.js';

export const TOWER_CENTER = [0, 0, -10.6];
export const TOWER_BASE_RADIUS = 2.68;
export const TABLE_CENTER = [7.1, 0, -19];
export const STREAM_X = 14.3;
export const GATE_Z = 18;

// The procedural runtime adds a 2.4 second settle after the route.
export const WALK_SECONDS = 27.6;
export const REVEAL_HOLD_SECONDS = 2.05;
const WALK_RAMP_SECONDS = .65;

export const FOREGROUND_PINES = [
  [-3.4, 21.85, 1.07], [3.4, 21.5, 1.06],
  [-2.55, 20.65, .92], [4.8, 19.6, 1.26],
  [-3.5, 14.8, 1.12], [4.9, 13.3, 1.05],
  [-3.15, 7.65, 1.17], [3.7, 7.9, .82],
  [-6.1, 2.3, 1.24], [8.6, -4.9, 1.21],
];

// World eye position, yaw toward +X from north, and pitch.
const ROUTE = [
  [[-.75, 1.66, 23.7], 2, 8],
  [[-.41, 1.66, 21.15], 1, 1],
  [[0, 1.66, 18], 0, 1],
  [[.07, 1.66, 15.9], 0, 4],
  [[.22, 1.66, 11.4], -1, 12],
  [[.7, 1.66, 6.3], 10, 1],
  [[1.44, 1.66, 2.75], 16, -3],
  [[2.1, 1.66, .35], 9, -2],
  [[3.83, 1.66, -4.95], -31, 0],
  [[4.07, 1.66, -7.18], -36, -3],
  [[4.2, 1.66, -9.6], -33, -5],
  [[4.8, 1.66, -13.4], -2, 0],
  [[5.9, 1.66, -16.65], 19, -4],
  [[6.34, 1.48, -17.62], 19, -9],
];

function distanceFraction(seconds) {
  const moveSeconds = WALK_SECONDS - REVEAL_HOLD_SECONDS;
  const ramp = WALK_RAMP_SECONDS;
  const time = Math.min(seconds, moveSeconds);
  const duration = moveSeconds - ramp;
  if (time < ramp) return time * time / (2 * ramp * duration);
  if (time > moveSeconds - ramp) return 1 - (moveSeconds - time) ** 2 / (2 * ramp * duration);
  return (time - ramp / 2) / duration;
}

const RADIANS = Math.PI / 180;
const PHONE_PULLBACK = 1.45;
const PHONE_CHOOSER_DIP = .10;

export function createValleyPagodaCamera(THREE, V3) {
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

  const walkFov = phone => phone ? 45 : 50;
  const wide = pose(...ROUTE.at(-1), walkFov(false));
  const widePhone = pose(...ROUTE.at(-1), walkFov(true));
  const choose = pose([6.68, .86, -18.06], 24, -17, 48);
  const choosePhone = pose([6.78, .81, -18.06], 19, -18, 44);

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

  // Sample by metres instead of keyframe time to keep the same walking pace
  // around the tower as on the straight parts of the path.
  const curve = new THREE.CatmullRomCurve3(ROUTE.map(([position]) => V3(...position)));
  const samplesPerSegment = 64;
  curve.arcLengthDivisions = (ROUTE.length - 1) * samplesPerSegment;
  const lengths = curve.getLengths();
  const totalLength = lengths.at(-1);
  const directionAt = hermiteTrack(
    ROUTE.map((_, i) => lengths[i * samplesPerSegment] / totalLength),
    ROUTE.map(([, yaw, pitch]) => [yaw, pitch]),
  );

  return {
    // The idle exterior drifts around this gaze. Aim at the distant tower,
    // so the same metre of drift does not push it out of a portrait frame.
    view: pose(...ROUTE[0], walkFov(false), 34),
    viewPhone: pose(...ROUTE[0], walkFov(true), 34),
    wide: nookPose(wide),
    widePhone: nookPose(widePhone, true),
    choose: nookPose(choose),
    choosePhone: nookPose(choosePhone, true, true),
    createWalk(_start, _end, phone) {
      return (progress, rig) => {
        const distance = distanceFraction(progress * WALK_SECONDS);
        const [yaw, pitch] = directionAt(distance);
        const view = pose(curve.getPointAt(distance).toArray(), yaw, pitch, walkFov(phone));
        rig.pos.copy(view.pos);
        rig.look.copy(view.look);
        rig.fov = view.fov;
        rig.amp = 0;
      };
    },
  };
}
