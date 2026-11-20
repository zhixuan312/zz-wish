import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as THREE from 'three';
import path from '../../../shared/pine-gate-path.json' with { type: 'json' };
import createPlace from '../../../web/src/engine/places/pine-gate-baked.js';
import { hermiteTrack } from '../../../web/src/engine/places/pine-walk-curve.js';

const V3 = (...xyz) => new THREE.Vector3(...xyz);
const pitch = (eye, aim) => THREE.MathUtils.radToDeg(
  Math.atan2(aim.y - eye.y, Math.hypot(aim.x - eye.x, aim.z - eye.z)),
);

for (const phone of [false, true]) {
  test(`the ${phone ? 'phone' : 'desktop'} Pine approach lifts the early view while preserving the original walk`, () => {
    const place = createPlace({ THREE, V3 });
    const start = phone ? place.viewPhone : place.view;
    const choose = phone ? place.nook.choosePhone : place.nook.choose;
    const end = { pos: choose.pos.clone().add(place.nook.at.pos), look: choose.look.clone().add(place.nook.at.pos), fov: choose.fov };
    const [positionKey, fovKey] = phone ? ['phonePosition', 'phoneFov'] : ['position', 'desktopFov'];
    const times = [0, ...path.waypoints.map(waypoint => waypoint.time), path.seconds];
    const positions = [path.entrance[positionKey], ...path.waypoints.map(waypoint => waypoint.position), end.pos.toArray()];
    const looks = [path.entrance.look, ...path.waypoints.map(waypoint => waypoint.look), end.look.toArray()];
    const fovs = [path.entrance[fovKey], ...path.waypoints.map(waypoint => waypoint[fovKey]), end.fov];
    // The reference uses the same monotone track the runtime walks, so this test compares the
    // authored poses and the entrance lift, not a second interpolation scheme.
    const position = hermiteTrack(times, positions);
    const look = hermiteTrack(times, looks);
    const fov = hermiteTrack(times, fovs.map(value => [value]));

    assert.equal(place.walkSeconds, path.seconds);
    assert.deepEqual(start.pos.toArray(), path.entrance[positionKey]);
    assert.equal(start.fov, path.entrance[fovKey]);
    const walk = place.createWalk(start, end, phone);
    const rig = { pos: V3(), look: V3(), fov: 0, amp: 1 };
    for (let seconds = 0; seconds <= path.seconds; seconds += .25) {
      const progress = seconds / path.seconds;
      const at = progress * path.seconds;
      walk(progress, rig);
      const approved = position(at);
      for (let i = 0; i < 3; i++) assert(Math.abs(rig.pos.getComponent(i) - approved[i]) < 1e-9);
      assert.equal(rig.fov, fov(at)[0]);
      const approvedLook = V3().fromArray(look(at));
      assert.equal(rig.look.x, approvedLook.x);
      assert.equal(rig.look.z, approvedLook.z);
      if (seconds >= 12) assert.deepEqual(rig.look.toArray(), approvedLook.toArray());
      if (seconds === 0) assert(rig.look.distanceTo(start.look) < 1e-6, 'The walk starts at the preview aim.');
      if (seconds === 0 || seconds === 6) {
        const pitchIncrease = pitch(rig.pos, rig.look) - pitch(rig.pos, approvedLook);
        const minimumLift = phone ? (seconds === 0 ? 1 : 3.8) : 5.5;
        assert(pitchIncrease >= minimumLift && pitchIncrease < 7);
      }
    }
  });
}
