/** Cubic distance keys preserve pacing separately from the shape of the trail. */
function distanceBetween(keys, time) {
  let i = 0;
  while (i < keys.length - 2 && time > keys[i + 1][0]) i++;
  const [start, a, speedA] = keys[i];
  const [end, b, speedB] = keys[i + 1];
  const duration = end - start;
  const u = Math.max(0, Math.min(1, (time - start) / duration));
  const u2 = u * u;
  const u3 = u * u2;
  return (2 * u3 - 3 * u2 + 1) * a + (-2 * u3 + 3 * u2) * b
    + (u3 - 2 * u2 + u) * speedA * duration + (u3 - u2) * speedB * duration;
}

function measureCurve(THREE, points) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const intervals = 180;
  curve.arcLengthDivisions = intervals * (points.length - 1);
  const lengths = curve.getLengths();
  return { curve, at: index => lengths[index * intervals], length: lengths.at(-1) };
}

function sightlineTrack(THREE, poses, times) {
  const directions = poses.flatMap(({ pos, look }) => look.clone().sub(pos).normalize().toArray());
  return new THREE.VectorKeyframeTrack('direction', times, directions,
    THREE.InterpolateSmooth).createInterpolant();
}

/** The crest finishes moving at the reveal, then holds its view for two seconds. */
export function winterCourtWalk(THREE, site, start, phone) {
  const poses = site.walk.slice(0, -1).map(({ position, look, fov }) => ({
    pos: new THREE.Vector3(...position),
    look: new THREE.Vector3(...look),
    fov: fov + (phone ? 5 : 0),
  }));
  poses[0] = start;
  const { curve, at, length } = measureCurve(THREE, poses.map(({ pos }) => pos));
  const distance = [
    [0, 0, 0],
    [.8, .61, 1.55],
    [12, at(2), 1.54],
    [22, at(4), 1.34],
    [26, at(6), 1.49],
    [28, length, 0],
  ];
  const times = [0, 6, 12, 17, 22, 24, 26, 28];
  const look = sightlineTrack(THREE, poses, times);
  const lens = new THREE.NumberKeyframeTrack('fov', times, poses.map(({ fov }) => fov),
    THREE.InterpolateSmooth).createInterpolant();
  const direction = new THREE.Vector3();
  return (progress, rig) => {
    const time = Math.min(28, progress * site.walkSeconds);
    curve.getPointAt(distanceBetween(distance, time) / length, rig.pos);
    const z = rig.pos.z;
    const sweep = (low, middle, high, end) => THREE.MathUtils.smoothstep(z, low, middle)
      * (1 - THREE.MathUtils.smoothstep(z, high, end));
    // Stay clear of the hanging needles, then step up onto the gate tread.
    const forest = sweep(29.9, 34.05, 35.12, 38.3);
    rig.pos.x += .41 * forest;
    rig.pos.y += .029 * sweep(12, 12.33, 12.77, 13.2) - .101 * forest;
    direction.fromArray(look.evaluate(time)).normalize();
    rig.look.copy(rig.pos).add(direction);
    rig.fov = lens.evaluate(time)[0];
    rig.amp = 0;
  };
}

export const winterCourtEntrySeconds = 16.25;

function viewingAngles({ pos, look }) {
  const direction = look.clone().sub(pos).normalize();
  return [Math.atan2(direction.x, -direction.z), Math.asin(direction.y)];
}

/** Follow the swept lane and finish the turn gradually behind the lamp. */
export function winterCourtEntry(THREE, start, end) {
  const points = [
    start.pos,
    new THREE.Vector3(-1.02, 3.33, 4.12),
    new THREE.Vector3(-.80, 3.35, 1.1),
    new THREE.Vector3(-.20, 3.38, -2.59),
    new THREE.Vector3(-.07, 3.53, -3.55),
    new THREE.Vector3(-.03, 3.66, -4.44),
    new THREE.Vector3(.01, 3.66, -6.65),
    end.pos,
  ];
  const { curve, length } = measureCurve(THREE, points);
  const duration = winterCourtEntrySeconds;
  const ramp = 1.55;
  const speed = length / (duration - ramp);
  const distances = [
    [0, 0, 0],
    [ramp, speed * ramp / 2, speed],
    [duration - ramp, length - speed * ramp / 2, speed],
    [duration, length, 0],
  ];
  const [yaw0, pitch0] = viewingAngles(start);
  const [yaw1, pitch1] = viewingAngles(end);
  const turn = THREE.MathUtils.euclideanModulo(yaw1 - yaw0 + Math.PI, Math.PI * 2) - Math.PI;
  const startDistance = start.pos.distanceTo(start.look);
  const endDistance = end.pos.distanceTo(end.look);
  const direction = new THREE.Vector3();
  return (progress, rig) => {
    const time = progress * duration;
    curve.getPointAt(distanceBetween(distances, time) / length, rig.pos);
    const depth = -rig.pos.z;
    const pulse = (low, middle, high, end) => THREE.MathUtils.smoothstep(depth, low, middle)
      * (1 - THREE.MathUtils.smoothstep(depth, high, end));
    // Pass the half-open hall leaf on its clear side while climbing the two treads.
    rig.pos.x += .365 * pulse(2.05, 3.03, 4.16, 5.08);
    rig.pos.y += .045 * pulse(3.10, 3.26, 3.75, 4.21) - .018 * pulse(2.62, 2.81, 2.94, 3.13);

    const angle = THREE.MathUtils.smoothstep(time, 2.75, duration);
    const yaw = yaw0 + turn * angle;
    const pitch = THREE.MathUtils.lerp(pitch0, pitch1, angle);
    direction.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    rig.look.copy(rig.pos).addScaledVector(direction, THREE.MathUtils.lerp(startDistance, endDistance, angle));
    rig.fov = THREE.MathUtils.lerp(start.fov, end.fov, angle);
  };
}
