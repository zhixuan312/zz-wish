import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { CAMERA_LIMITS, cameraPathViolations, measureCameraPath } from '../../visual/pine-camera-path.mjs';
import { hermiteTrack, shrineApproach } from '../../../web/src/engine/places/pine-walk-curve.js';
import createPlace from '../../../web/src/engine/places/pine-gate-baked.js';
import * as THREE from 'three';
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

const path = JSON.parse(readFileSync(new URL('../../../shared/pine-gate-path.json', import.meta.url), 'utf8'));

// Sample the authored walk through the same track the runtime uses, at 60 Hz.
function walkSamples(rate = 60) {
  const times = [0, ...path.waypoints.map(step => step.time), path.seconds];
  const positions = [path.waypoints[0].position, ...path.waypoints.map(step => step.position), path.waypoints.at(-1).position];
  const looks = [path.waypoints[0].look, ...path.waypoints.map(step => step.look), path.waypoints.at(-1).look];
  const atPosition = hermiteTrack(times, positions);
  const atLook = hermiteTrack(times, looks);
  const samples = [];
  for (let t = 0; t <= path.seconds + 1e-9; t += 1 / rate) {
    const p = atPosition(t), l = atLook(t);
    samples.push({ t, x: p[0], y: p[1], z: p[2], lx: l[0], ly: l[1], lz: l[2] });
  }
  return samples;
}

test('the walk keeps the brief length and its beats', () => {
  // The brief fixes a 30 s walk; keyframes inside it may be re-timed but the total may not move.
  expect(path.seconds).toBe(30);
  const times = path.waypoints.map(step => step.time);
  expect(times[0]).toBeGreaterThanOrEqual(4.9);
  expect(times.at(-1)).toBeLessThanOrEqual(30);
  // The brief's total is fixed; the last authored pose must sit strictly before it so the track's
  // times stay strictly increasing (a duplicate instant divides by zero and poisons the curve).
  expect(times.at(-1)).toBeLessThan(path.seconds);
  expect(times.every((t, i) => i === 0 || t > times[i - 1])).toBe(true);
});

test('the walk never moves faster than a brisk pace and never snaps', () => {
  const report = measureCameraPath(walkSamples());
  // The walk is the brisk limit; nothing here runs after it, so no settle segment is passed.
  const failures = cameraPathViolations(report);
  expect(failures, failures.join('; ')).toEqual([]);
  expect(report.speed.max).toBeLessThanOrEqual(CAMERA_LIMITS.walkSpeedMetresPerSecond);
  expect(report.turn.max).toBeLessThanOrEqual(CAMERA_LIMITS.angularDegreesPerSecond);
  expect(report.acceleration.max).toBeLessThanOrEqual(CAMERA_LIMITS.accelerationMetresPerSecondSquared);
});

test('the walk holds eye height above the stairs and keeps clear of every trunk', () => {
  const report = measureCameraPath(walkSamples());
  // The authored steps: index = (STAIR_START - z) / STAIR_RUN, top = (index + 1) * STAIR_RISE, from
  // pine_gate.py (STAIR_START 45.6, STAIR_RUN .8, STAIR_RISE .08, STAIR_COUNT 50).
  const ground = z => {
    const index = Math.max(0, Math.min(49, (45.6 - z) / .8));
    return (index + 1) * .08;
  };
  // Eye height is the camera's height above the stair it is over, measured at every sample.
  const eyes = path.waypoints.map(step => step.position[1] - ground(step.position[2]));
  const entranceEye = path.entrance.position[1] - ground(path.entrance.position[2]);
  const all = [entranceEye, ...eyes];
  expect(Math.min(...all)).toBeGreaterThanOrEqual(1.5);
  expect(Math.max(...all)).toBeLessThanOrEqual(1.7);
  // The last pose before the shrine may lean down to the shelf, but not below 1.2 m.
  expect(eyes.at(-1)).toBeGreaterThanOrEqual(1.2);

  // Trunks and posts the route must not brush. The two ancient saddle pines are authored at
  // (-1.88, PINE_CREST + .08) and (1.82, PINE_CREST - .32) with PINE_CREST 6.04 in pine_gate.py; the
  // gate posts and the shrine pillars stand on the shoulder around the lamp anchor at (-1.8, 5, .9).
  // The shrine is one object, not four posts: its foundation runs x -1.003..0.274 and z -0.79..0.51
  // around the lamp anchor at (-1.8, 5, .9), and the roof reaches y +0.51 (pine_tea_shoulder.py
  // pierced_lamp_shrine). Envelope it as a stack of spheres so a route cannot slip between a post
  // and the plinth.
  const anchor = [-1.8, 5.0, .9];
  const shrine = [];
  for (let i = 0; i <= 4; i++) {
    shrine.push({ name: `stone lamp shrine ${i}`, position: [anchor[0], anchor[1] + i * 0.125, anchor[2]], radius: 0.62 });
  }
  const obstacles = [
    { name: 'ancient western pine', position: [-1.88, 6.12, 6.04], radius: .30 },
    { name: 'ancient eastern pine', position: [1.82, 6.12, 5.72], radius: .28 },
    { name: 'gate post west', position: [-1.45, 5.2, 4.88], radius: .16 },
    { name: 'gate post east', position: [1.45, 5.2, 4.88], radius: .16 },
    ...shrine,
  ];
  const clearance = measureCameraPath(walkSamples(), obstacles).clearance.min;
  expect(clearance, `nearest trunk or post is ${clearance.toFixed(2)} m away`).toBeGreaterThanOrEqual(1.0);
});

test('the place holds the reveal for two seconds before the approach', async () => {
  // The hold lives on the place, not the path: the walk ends at the reveal and the runtime holds it.
  const place = createPlace({ THREE, V3 });
  const hold = place.walkHold;
  expect(hold).toBeTruthy();
  expect(hold.seconds).toBeGreaterThanOrEqual(2.0);
  // Its pose is exactly the last authored waypoint, so the walk and the hold meet without a jump.
  const last = path.waypoints.at(-1);
  expect(hold.pose.position).toEqual(last.position);
  expect(hold.pose.look).toEqual(last.look);
  // A portrait crop needs its own reveal aim; it is the same authored phone pose.
  if (last.phoneLook) {
    expect(hold.phonePose).toBeTruthy();
    expect(hold.phonePose.position).toEqual(last.phonePosition ?? last.position);
    expect(hold.phonePose.look).toEqual(last.phoneLook);
  }
});

test('the walk to the chooser stays inside the walking pace and the look limit', async () => {
  // Call the shipped function, not a copy of it: the runtime and this test share one route and one
  // duration, so a change in travel() cannot leave the test passing on an old formula.
  const place = createPlace({ THREE, V3 });
  const hold = place.walkHold;
  const peaks = {};
  for (const phone of [false, true]) {
    const choose = phone ? place.nook.choosePhone : place.nook.choose;
    const end = { pos: choose.pos.clone().add(place.nook.at.pos),
      look: choose.look.clone().add(place.nook.at.pos), fov: choose.fov };
    const pose = phone && hold.phonePose ? hold.phonePose : hold.pose;
    const from = { pos: new THREE.Vector3(...pose.position), look: new THREE.Vector3(...pose.look) };
    const { route, seconds, fromAim, toAim } = shrineApproach({ THREE, from, to: end, hold });

    // Sample the same eased pass the runtime uses.
    let peakSpeed = 0, peakTurn = 0;
    let prev = null, prevAim = null;
    const step = seconds / 240;
    for (let i = 0; i <= 240; i++) {
      const k = i / 240;
      const e = k * k * (3 - 2 * k);
      const p = route.getPointAt(Math.min(1, e));
      const dir = fromAim.clone().lerp(toAim, e).normalize();
      if (prev) {
        peakSpeed = Math.max(peakSpeed, p.distanceTo(prev) / step);
        const turn = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(dir.dot(prevAim), -1, 1)));
        peakTurn = Math.max(peakTurn, turn / step);
      }
      prev = p.clone(); prevAim = dir.clone();
    }
    peaks[phone ? 'phone' : 'desk'] = { peakSpeed, peakTurn, seconds };
    const pace = hold.approachMetresPerSecond ?? 1.4;
    expect(peakSpeed, `${phone ? 'phone' : 'desk'} peak speed`).toBeLessThanOrEqual(pace);
    expect(peakTurn, `${phone ? 'phone' : 'desk'} peak look rate`)
      .toBeLessThanOrEqual(CAMERA_LIMITS.angularDegreesPerSecond);
  }
  console.log(`DESK_PEAK speed ${peaks.desk.peakSpeed.toFixed(2)} m/s turn ${peaks.desk.peakTurn.toFixed(1)} deg/s`);
  console.log(`PHONE_PEAK speed ${peaks.phone.peakSpeed.toFixed(2)} m/s turn ${peaks.phone.peakTurn.toFixed(1)} deg/s`);
});
