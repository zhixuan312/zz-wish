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

function viewingAngles({ pos, look }) {
  const direction = look.clone().sub(pos).normalize();
  return [Math.atan2(direction.x, -direction.z), Math.asin(direction.y)];
}

function lookAlong(THREE, rig, yaw, pitch, distance) {
  const horizontal = Math.cos(pitch) * distance;
  rig.look.copy(rig.pos);
  rig.look.x += Math.sin(yaw) * horizontal;
  rig.look.y += Math.sin(pitch) * distance;
  rig.look.z -= Math.cos(yaw) * horizontal;
}

// Integrate the smooth turn speed so the view can finish before the chooser.
function desktopEntryHeading(THREE, time, arrival) {
  const start = 8.05;
  const accelerate = 1.10;
  const brake = .45;
  const cruise = arrival - start - accelerate - brake;
  const smoothArea = amount => amount ** 3 * (1 - .5 * amount);
  const { clamp } = THREE.MathUtils;
  const rampIn = clamp((time - start) / accelerate, 0, 1);
  const steady = clamp(time - start - accelerate, 0, cruise);
  const rampOut = clamp((time - arrival + brake) / brake, 0, 1);
  const travelled = accelerate * smoothArea(rampIn) + steady + brake * (rampOut - smoothArea(rampOut));
  return travelled / (cruise + (accelerate + brake) / 2);
}

/** Cross the hall doorway head-on, then follow the aisle beside the lamp row. */
export function winterCourtEntry(THREE, start, end, phone) {
  const points = [
    start.pos,
    new THREE.Vector3(-1.02, 3.33, 4.12),
    new THREE.Vector3(-.72, 3.35, 1.1),
    new THREE.Vector3(.09, 3.38, -2.59),
    new THREE.Vector3(.28, 3.53, -3.55),
    new THREE.Vector3(.29, 3.66, -4.44),
    new THREE.Vector3(.48, 3.655, -5.13),
    new THREE.Vector3(1.66, 3.65, -5.22),
    new THREE.Vector3(1.95, 3.65, -6.24),
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
  const arrival = phone ? duration : duration - 1.1;
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
  const phoneTurn = [
    [10.15, 0, 0],
    [12.10, .20, .159],
    [14.45, .58, .155],
    [17.10, .94, .078],
    [duration, 1, 0],
  ];
  const startDistance = start.pos.distanceTo(start.look);
  const endDistance = end.pos.distanceTo(end.look);
  return (progress, rig) => {
    const time = Math.min(progress * duration, arrival);
    // Keep the approach cadence and use the last part of the aisle to reach
    // the final composition before the desktop chooser opens.
    const aisleProgress = THREE.MathUtils.smoothstep(time, insideTime, arrival);
    const positionTime = time + (duration - arrival) * aisleProgress;
    curve.getPointAt(distanceBetween(distances, positionTime) / length, rig.pos);
    // Look into the hall through the opening, then turn across it as the
    // aisle opens into view. The gaze finishes on the lamp and snowy door.
    const approach = THREE.MathUtils.smoothstep(time, 0, 7.6);
    const angle = phone ? distanceBetween(phoneTurn, time) : desktopEntryHeading(THREE, time, arrival);
    const yaw = yaw0 * (1 - approach) + turn * angle;
    const finalPitch = THREE.MathUtils.smoothstep(time, phone ? 15 : 9.2, arrival);
    const pitch = THREE.MathUtils.lerp(pitch0 * (1 - approach), pitch1, finalPitch);
    lookAlong(THREE, rig, yaw, pitch, THREE.MathUtils.lerp(startDistance, endDistance, angle));
    const lens = THREE.MathUtils.lerp(start.fov, end.fov, angle);
    // Portrait needs a wider view to see the full beam through the doorway.
    // Return to the chooser lens gradually before the visitor reaches the cord.
    const wide = phone ? smoothWindow(THREE, time, 0, 8.25, 9.6, duration) : 0;
    rig.fov = THREE.MathUtils.lerp(lens, 90, wide);
  };
}

/** Round the visitor's side of the beam as the light spreads. */
export function winterCourtBurnSettle(THREE, cord, start, end) {
  const { lerp, smoothstep, euclideanModulo } = THREE.MathUtils;
  const radius = pose => Math.hypot(pose.pos.x - cord[0], pose.pos.z - cord[2]);
  const azimuth = pose => Math.atan2(pose.pos.x - cord[0], pose.pos.z - cord[2]);
  const wrap = delta => euclideanModulo(delta + Math.PI, 2 * Math.PI) - Math.PI;
  const radiusStart = radius(start), radiusEnd = radius(end);
  const orbitStart = azimuth(start), orbitDelta = wrap(azimuth(end) - orbitStart);
  const [yawStart, pitchStart] = viewingAngles(start);
  const [yawEnd, pitchEnd] = viewingAngles(end);
  const yawDelta = wrap(yawEnd - yawStart);
  return (progress, rig) => {
    const t = smoothstep(progress, .025, .99);
    const r = lerp(radiusStart, radiusEnd, t), angle = orbitStart + orbitDelta * t;
    rig.pos.set(cord[0] + Math.sin(angle) * r, lerp(start.pos.y, end.pos.y, t), cord[2] + Math.cos(angle) * r);
    lookAlong(THREE, rig, yawStart + yawDelta * t, lerp(pitchStart, pitchEnd, t), 3.5);
    const aperture = fov => Math.tan(THREE.MathUtils.degToRad(fov / 2));
    rig.fov = THREE.MathUtils.radToDeg(2 * Math.atan(lerp(aperture(start.fov), aperture(end.fov), t)));
  };
}
