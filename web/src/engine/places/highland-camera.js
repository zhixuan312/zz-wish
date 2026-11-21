import { hermiteTrack } from './pine-walk-curve.js';

export const HIGH_WHITE_WALK_SECONDS = 30;
export const HIGH_WHITE_TRAVEL_SECONDS = 46;
export const HIGH_WHITE_NOOK = [16, 0, 16];

const radians = Math.PI / 180;
const skyHold = [0, 1.66, 25.75];
const route = [
  // Seconds, eye position in metres, yaw from +Z, pitch.
  [0,    [.38, 1.66, 47.3], 181,   0],
  [.35,  [.38, 1.66, 47.3], 181,   0],
  [12,   [.24, 1.66, 37.7], 181,   0],
  [19.5, [.05, 1.66, 32.8], 180,   0],
  [22,   [  0, 1.66, 30.5], 180,   0],
  [24,   [  0, 1.66, 28.0], 180,   1],
  [24.7, [  0, 1.66, 27.0], 180,   4],
  [26,   skyHold,          180,   8],
  [HIGH_WHITE_WALK_SECONDS, skyHold, 180, 8],
  [33.5, [3.25, 1.66, 23.85], 130,  1],
  [37.5, [8.85, 1.66, 22.25], 111, -2],
  [41,   [13.6, 1.65, 20.7], 130,  -3],
  [43.4, [16.45, 1.55, 19.5], 170, -7],
];

const planarView = (V3, pos, yaw, pitch, fov) => {
  const run = 6 * Math.cos(pitch * radians);
  return {
    pos,
    look: V3(pos.x + run * Math.sin(yaw * radians), pos.y + 6 * Math.sin(pitch * radians), pos.z + run * Math.cos(yaw * radians)),
    fov,
  };
};

export function highWhiteCameras(V3) {
  const open = phone => phone ? 63 : 49;
  const entry = phone => phone ? 57 : 44;
  const local = pose => ({
    pos: pose.pos.clone().sub(V3(...HIGH_WHITE_NOOK)),
    look: pose.look.clone().sub(V3(...HIGH_WHITE_NOOK)),
    fov: pose.fov,
  });
  const reveal = phone => planarView(V3, V3(...skyHold), 180, 8, open(phone));
  const choose = { pos: V3(.67, 1.25, 1.09), look: V3(0, 1.005, 0), fov: 32 };
  const choosePhone = { pos: V3(.56, 1.23, .95), look: V3(0, .98, 0) };

  // The existing procedural chooser pulls the phone eye back and lowers its aim.
  // Match that resolved pose so the engine's final chooser move stays stationary.
  const seated = phone => {
    const source = phone ? choosePhone : choose;
    const origin = V3(...HIGH_WHITE_NOOK);
    const look = source.look.clone().add(origin);
    const pos = source.pos.clone().add(origin);
    if (phone) {
      pos.sub(look).multiplyScalar(1.45).add(look);
      look.y -= pos.distanceTo(look) * .10;
    }
    return { pos, look, fov: phone ? 44 : choose.fov };
  };

  function createWalk(_start, _end, phone) {
    const seat = seated(phone);
    const delta = seat.look.clone().sub(seat.pos);
    const yaw = Math.atan2(delta.x, delta.z) / radians + 360;
    const pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z)) / radians;
    const end = [seat.pos.toArray(), yaw, pitch];
    const keys = [...route, [45.75, ...end], [HIGH_WHITE_TRAVEL_SECONDS, ...end]];
    const times = keys.map(key => key[0]);
    const position = hermiteTrack(times, keys.map(key => key[1]));
    const aim = hermiteTrack(times, keys.map(key => key.slice(2)));
    const lens = hermiteTrack([0, 22, 26, 34, 41, 45.75, HIGH_WHITE_TRAVEL_SECONDS],
      [entry(phone), entry(phone), open(phone), open(phone), 48, seat.fov, seat.fov].map(value => [value]));

    return (progress, rig) => {
      const t = progress * HIGH_WHITE_TRAVEL_SECONDS;
      const [heading, tilt] = aim(t);
      rig.pos.fromArray(position(t));
      const view = planarView(V3, rig.pos, heading, tilt, lens(t)[0]);
      rig.look.copy(t >= 45.75 ? seat.look : view.look);
      rig.fov = view.fov;
      // Ease out the same idle drift used by the entrance preview.
      const still = Math.min(1, t / 1.6);
      rig.amp = 1 - still * still * (3 - 2 * still);
    };
  }

  return {
    view: planarView(V3, V3(...route[0][1]), 181, 0, entry(false)),
    viewPhone: planarView(V3, V3(...route[0][1]), 181, 0, entry(true)),
    wide: local(reveal(false)),
    widePhone: local(reveal(true)),
    choose,
    choosePhone,
    seated,
    createWalk,
  };
}
