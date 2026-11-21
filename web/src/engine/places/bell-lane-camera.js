import { hermiteTrack } from './pine-walk-curve.js';

export const WALK_SECONDS = 30;
export const TURN_SECONDS = 12.5;
export const DOOR_Z = 9.73;
export const WINDOW = [2.99, 1.53, 14.8];
export const LAMP = [-1.06, 0, 7];
export const TREE = [-1.42, 0, .6];
export const BELL = [2.3, 0, -2.7];

const route = [
  // Seconds, position, yaw from +Z, pitch.
  [0, [ .40, 1.66, 46.0], 177, 1],
  [.18, [ .40, 1.66, 46.0], 177, 1],
  [1.4, [ .32, 1.66, 45.1], 177, 1],
  [12, [ .25, 1.66, 29.7], 174, 0],
  [17, [ .49, 1.66, 21.5], 162, -1],
  [18.3, [ .45, 1.66, 19.25], 157, -1],
  [20, [ .22, 1.66, 16.3], 175, 0],
  [22, [ 0, 1.66, 13.1], 180, 0],
  [24.4, [ 0, 1.66, DOOR_Z], 180, 0],
  [26, [ 0, 1.66, 7.80], 179, 4],
  [28.5, [ .03, 1.66, 6.15], 180, 5],
  [29.5, [ .03, 1.66, 6.05], 180, 5],
  [30, [ .03, 1.66, 6.05], 180, 5],
];
const rad = Math.PI / 180;

function aimAt(V3, pos, yaw, pitch) {
  const horizontal = 6 * Math.cos(pitch);
  return V3(pos.x + horizontal * Math.sin(yaw), pos.y + 6 * Math.sin(pitch), pos.z + horizontal * Math.cos(yaw));
}

export function bellLaneCameras(V3) {
  const pose = ([, position, yaw, pitch], fov) => {
    const pos = V3(...position);
    return { pos, look: aimAt(V3, pos, yaw * rad, pitch * rad), fov };
  };
  const lens = phone => phone ? 61 : 48;
  const portraitOpening = t => {
    const k = Math.min(1, Math.max(0, (t - 24.1) / 3.0));
    return k * k * (3 - 2 * k);
  };
  const inNook = view => ({
    pos: view.pos.clone().sub(V3(...LAMP)),
    look: view.look.clone().sub(V3(...LAMP)),
    fov: view.fov,
  });
  const reveal = phone => {
    const [time, position, yaw, pitch] = route.at(-1);
    return pose([time, position, yaw + Number(phone), pitch], phone ? 72 : lens(false));
  };
  // View down the rack from just behind the nearest stand. This separates the
  // two restored shades when the chooser still holds a tall shade in front.
  const seat = phone => pose([0, [-1.54, 1.24, 5.30], phone ? 18.5 : 19, phone ? -12 : -9], phone ? 56 : 43);
  const time = route.map(k => k[0]);
  const position = hermiteTrack(time, route.map(k => k[1]));
  const direction = hermiteTrack(time, route.map(k => k.slice(2)));

  return {
    view: pose(route[0], lens(false)),
    viewPhone: pose(route[0], lens(true)),
    wide: inNook(reveal(false)),
    widePhone: inNook(reveal(true)),
    choose: inNook(seat(false)),
    choosePhone: inNook(seat(true)),
    createWalk(_start, _end, phone) {
      return (progress, rig) => {
        const t = progress * WALK_SECONDS;
        const [yaw, pitch] = direction(t);
        const unmask = phone ? portraitOpening(t) : 0;
        rig.pos.fromArray(position(t));
        rig.look.copy(aimAt(V3, rig.pos, (yaw + unmask) * rad, pitch * rad));
        // The portrait lens opens while crossing the real jamb, finishing well
        // before the court hold. The landscape lens and seated views stay fixed.
        rig.fov = lens(phone) + 11 * unmask;
        rig.amp = 0;
      };
    },
    createArrival(start, end) {
      const angles = ({ pos, look }) => {
        const delta = look.clone().sub(pos);
        return [Math.atan2(delta.x, delta.z), Math.atan2(delta.y, Math.hypot(delta.x, delta.z))];
      };
      const [yaw, pitch] = angles(start);
      const [endYaw, endPitch] = angles(end);
      const turn = Math.atan2(Math.sin(endYaw - yaw), Math.cos(endYaw - yaw));
      return (progress, rig) => {
        const k = Math.min(1, progress * TURN_SECONDS / (TURN_SECONDS - 1));
        const ease = k * k * (3 - 2 * k);
        rig.pos.lerpVectors(start.pos, end.pos, ease);
        rig.look.copy(aimAt(V3, rig.pos, yaw + turn * ease, pitch + (endPitch - pitch) * ease));
        rig.fov = start.fov + (end.fov - start.fov) * ease;
      };
    },
  };
}
