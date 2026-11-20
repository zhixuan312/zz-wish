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

function measureCurve(THREE, points, adjust) {
  const spline = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const curve = new THREE.Curve();
  curve.getPoint = (time, target) => adjust(spline.getPoint(time, target));
  const intervals = 180;
  curve.arcLengthDivisions = intervals * (points.length - 1);
  const lengths = curve.getLengths();
  return { curve, at: index => lengths[index * intervals], length: lengths.at(-1) };
}

function smoothWindow(THREE, value, low, rise, fall, high) {
  return THREE.MathUtils.smoothstep(value, low, rise)
    * (1 - THREE.MathUtils.smoothstep(value, fall, high));
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
  const { curve, at, length } = measureCurve(THREE, poses.map(({ pos }) => pos), point => {
    // Stay clear of the hanging needles, then step up onto the gate tread.
    const forest = smoothWindow(THREE, point.z, 29.9, 34.05, 35.12, 38.3);
    point.x += .41 * forest;
    point.y += .029 * smoothWindow(THREE, point.z, 12, 12.33, 12.77, 13.2) - .101 * forest;
    return point;
  });
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
    direction.fromArray(look.evaluate(time)).normalize();
    rig.look.copy(rig.pos).add(direction);
    rig.fov = lens.evaluate(time)[0];
    rig.amp = 0;
  };
}

export const winterCourtEntrySeconds = 19;

function easedDistance(start, end, distance, ramp) {
  const speed = distance / (end - start - ramp);
  return [
    [start, 0, 0],
    [start + ramp, speed * ramp / 2, speed],
    [end - ramp, distance - speed * ramp / 2, speed],
    [end, distance, 0],
  ];
}

function viewingAngles({ pos, look }) {
  const direction = look.clone().sub(pos).normalize();
  return [Math.atan2(direction.x, -direction.z), Math.asin(direction.y)];
}

/** Cross the hall doorway head-on, then follow the aisle beside the lamp row. */
export function winterCourtEntry(THREE, start, end) {
  const points = [
    start.pos,
    new THREE.Vector3(-1.02, 3.33, 4.12),
    new THREE.Vector3(-.72, 3.35, 1.1),
    new THREE.Vector3(.09, 3.38, -2.59),
    new THREE.Vector3(.28, 3.53, -3.55),
    new THREE.Vector3(.29, 3.66, -4.44),
    new THREE.Vector3(.48, 3.655, -5.13),
    new THREE.Vector3(1.85, 3.65, -5.22),
    new THREE.Vector3(2.38, 3.65, -6.31),
    new THREE.Vector3(end.pos.x, 3.65, -7.82),
    end.pos,
  ];
  const { curve, at, length } = measureCurve(THREE, points, point => {
    // Lift across the two hall treads while the path holds the doorway centre.
    const depth = -point.z;
    point.y += .045 * smoothWindow(THREE, depth, 3.10, 3.26, 3.75, 4.21)
      - .018 * smoothWindow(THREE, depth, 2.62, 2.81, 2.94, 3.13);
    return point;
  });
  const duration = winterCourtEntrySeconds;
  const insideTime = 11.65;
  const cadence = 1.28;
  const ramp = 1.5;
  const aisleSpeed = (length - at(5)) / (duration - insideTime - ramp / 2);
  const distances = [
    [0, 0, 0],
    [ramp, cadence * ramp / 2, cadence],
    [insideTime - 2.1, at(5) - cadence, cadence],
    [insideTime, at(5), aisleSpeed],
    [duration - ramp, length - aisleSpeed * ramp / 2, aisleSpeed],
    [duration, length, 0],
  ];
  const [yaw0, pitch0] = viewingAngles(start);
  const [yaw1, pitch1] = viewingAngles(end);
  const turn = THREE.MathUtils.euclideanModulo(yaw1 + Math.PI, Math.PI * 2) - Math.PI;
  const turnKeys = easedDistance(insideTime + .32, duration, 1, 1.15);
  const startDistance = start.pos.distanceTo(start.look);
  const endDistance = end.pos.distanceTo(end.look);
  const direction = new THREE.Vector3();
  return (progress, rig) => {
    const time = progress * duration;
    curve.getPointAt(distanceBetween(distances, time) / length, rig.pos);
    // Look into the hall through the opening, then turn across it as the
    // aisle opens into view. The gaze finishes on the lamp and snowy door.
    const approach = THREE.MathUtils.smoothstep(time, 0, 7.6);
    const angle = distanceBetween(turnKeys, time);
    const yaw = yaw0 * (1 - approach) + turn * angle;
    const pitch = THREE.MathUtils.lerp(pitch0 * (1 - approach), pitch1, angle);
    direction.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    rig.look.copy(rig.pos).addScaledVector(direction, THREE.MathUtils.lerp(startDistance, endDistance, angle));
    rig.fov = THREE.MathUtils.lerp(start.fov, end.fov, angle);
  };
}
