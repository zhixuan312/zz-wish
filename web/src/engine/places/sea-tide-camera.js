import { hermiteTrack } from './pine-walk-curve.js';

// The procedural runtime supplies the remaining 2.4 seconds as its chooser approach.
export const walkSeconds = 27.6;

function facing({ pos, look }) {
  const direction = look.clone().sub(pos);
  return {
    yaw: Math.atan2(direction.x, -direction.z),
    pitch: Math.atan2(direction.y, Math.hypot(direction.x, direction.z)),
    distance: direction.length(),
  };
}

export function createWalk(start, end, phone) {
  const first = facing(start);
  const last = facing(end);
  const finalFov = end.fov ?? (phone ? 44 : 32);
  const turn = Math.atan2(Math.sin(last.yaw - first.yaw), Math.cos(last.yaw - first.yaw));
  const position = hermiteTrack(
    [0, 0.35, 10, 20, 22.3, 23.7, 25, 26.2, 27.4, walkSeconds],
    [start.pos.toArray(), start.pos.toArray(), [0, 1.65, 24], [0, 1.65, 16],
      [0, 1.65, 13.9], [0.65, 1.65, 12.15], [2, 1.65, 10.65],
      [4.05, 1.65, 9.65], end.pos.toArray(), end.pos.toArray()],
  );
  // Keep the gaze inside the lane while approaching its open end. Spread the
  // turn over the crossing and the last steps so the harbour comes into view
  // at walking pace. Interpolate angles at a separate distance from the eye.
  const orientation = hermiteTrack(
    [0, 19.1, 21.45, 23.45, 25.4, 27.25, walkSeconds],
    [0, 0, 0.22, 0.54, 0.85, 1, 1].map(amount => [
      first.yaw + turn * amount,
      first.pitch + (last.pitch - first.pitch) * amount,
      first.distance + (last.distance - first.distance) * amount,
      start.fov + (finalFov - start.fov) * amount,
    ]),
  );

  return (progress, rig) => {
    const seconds = progress * walkSeconds;
    const [yaw, pitch, distance, fov] = orientation(seconds);
    const horizontal = distance * Math.cos(pitch);
    rig.pos.fromArray(position(seconds));
    rig.look.set(
      rig.pos.x + horizontal * Math.sin(yaw),
      rig.pos.y + distance * Math.sin(pitch),
      rig.pos.z - horizontal * Math.cos(yaw),
    );
    rig.fov = fov;
    // The entrance preview has a metre-scale drift. Let it settle while still
    // inside the lane, rather than snapping it off on the first walking frame.
    const settle = Math.min(seconds / 1.5, 1);
    rig.amp = 1 - settle * settle * (3 - 2 * settle);
  };
}
