import { hermiteTrack } from './pine-walk-curve.js';

export const WALK_SECONDS = 30;
export const ARRIVAL_SECONDS = 5.2;

const radians = Math.PI / 180;
const ROUTE = [
  // Time, world position, yaw from +Z, pitch.
  [0, [.30, 1.64, 35.2], 181, 2],
  [.4, [.30, 1.64, 35.2], 181, 2],
  [2.2, [.23, 1.64, 34.15], 181, 2],
  [7, [.10, 1.64, 28.8], 180, 1],
  [12, [.10, 1.64, 23.3], 179, 1],
  [15.5, [.08, 1.64, 19.45], 180, 0],
  [17.5, [-.10, 1.62, 17.05], 185, 0],
  [18.6, [-.42, 1.62, 15.85], 201, 0],
  [20.25, [-2.52, 1.62, 14.39], 219, 0],
  [22, [-4.98, 1.62, 12.61], 222, -2],
  [23.5, [-6.65, 1.62, 10.92], 212, -4],
  [24.5, [-6.88, 1.75, 9.92], 200, -4],
  [25.2, [-7.16, 1.84, 9.53], 190, -2],
  [26.3, [-8.02, 1.97, 9.20], 173, 1],
  [28.65, [-8.24, 1.97, 8.45], 154, 1],
  [WALK_SECONDS, [-8.24, 1.97, 8.45], 154, 1],
];
const times = ROUTE.map(([time]) => time);
const walkPosition = hermiteTrack(times, ROUTE.map(([, position]) => position));
const walkAngles = hermiteTrack(times, ROUTE.map(([, , yaw, pitch]) => [yaw, pitch]));

function aim(V3, pos, yaw, pitch, reach) {
  const horizontal = reach * Math.cos(pitch);
  return V3(
    pos.x + horizontal * Math.sin(yaw),
    pos.y + reach * Math.sin(pitch),
    pos.z + horizontal * Math.cos(yaw),
  );
}

function smoothstep(progress) {
  const t = Math.max(0, Math.min(progress, 1));
  return t * t * (3 - 2 * t);
}

function angles({ pos, look }) {
  const normal = look.clone().sub(pos);
  return [Math.atan2(normal.x, normal.z), Math.atan2(normal.y, Math.hypot(normal.x, normal.z))];
}

export function bambooRainCameras(V3, nook) {
  const pose = (position, yaw, pitch, fov, reach = 6) => {
    const pos = V3(...position);
    return { pos, look: aim(V3, pos, yaw * radians, pitch * radians, reach), fov };
  };
  const cosine = Math.cos(nook.ry);
  const sine = Math.sin(nook.ry);
  const toNook = view => {
    const local = value => {
      const p = value.clone().sub(nook.pos);
      return V3(cosine * p.x - sine * p.z, p.y, sine * p.x + cosine * p.z);
    };
    return { pos: local(view.pos), look: local(view.look), fov: view.fov };
  };
  const opening = phone => phone ? 60 : 45;
  const revealed = phone => phone ? 70 : 54;
  const walkPose = (t, phone) => {
    const [yaw, pitch] = walkAngles(t);
    const open = smoothstep((t - 24.3) / 3.5);
    return pose(walkPosition(t), yaw, pitch, opening(phone) + (revealed(phone) - opening(phone)) * open);
  };

  // Angle along the dry shelf into the courtyard. The portrait lens keeps the
  // cup left of the tile-to-channel sightline and above the chooser sheet.
  const choose = pose([-1.13, 1.26, .10], 81, -5, 51, 1.6);
  const choosePhone = pose([-1.36, 1.24, -.04], 79, -13, 66, 1.9);
  return {
    view: walkPose(0, false),
    viewPhone: walkPose(0, true),
    wide: toNook(walkPose(WALK_SECONDS, false)),
    widePhone: toNook(walkPose(WALK_SECONDS, true)),
    choose,
    choosePhone,
    // Use the same composition at both steps, including on the existing ignition.
    burn: choose,
    burnPhone: choosePhone,

    createWalk(_start, _end, phone) {
      return (progress, rig) => {
        const t = progress * WALK_SECONDS;
        const view = walkPose(t, phone);
        rig.pos.copy(view.pos);
        rig.look.copy(view.look);
        rig.fov = view.fov;
        // Ease off the product entrance's suspended-camera drift during the first strides.
        rig.amp = 1 - smoothstep(t / 5);
      };
    },

    createArrival(start, end) {
      const [yaw, pitch] = angles(start);
      const [endYaw, endPitch] = angles(end);
      const swing = Math.atan2(Math.sin(endYaw - yaw), Math.cos(endYaw - yaw));
      const startReach = start.pos.distanceTo(start.look);
      const endReach = end.pos.distanceTo(end.look);
      return (progress, rig) => {
        // Reach the seated position before the chooser appears so the eye has time to rest.
        const blend = smoothstep(progress * ARRIVAL_SECONDS / (ARRIVAL_SECONDS - .45));
        rig.pos.lerpVectors(start.pos, end.pos, blend);
        rig.look.copy(aim(V3, rig.pos, yaw + swing * blend, pitch + (endPitch - pitch) * blend,
          startReach + (endReach - startReach) * blend));
        rig.fov = start.fov + (end.fov - start.fov) * blend;
        rig.amp = 0;
      };
    },
  };
}
