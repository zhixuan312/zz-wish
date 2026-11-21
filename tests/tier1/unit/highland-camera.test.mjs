import { expect, test } from 'vitest';
import { Vector3 } from 'three';
import { highWhiteTraceMetrics } from '../../../docs/highland/camera-audit.mjs';
import {
  HIGH_WHITE_TRAVEL_SECONDS, HIGH_WHITE_WALK_SECONDS, highWhiteCameras,
} from '../../../web/src/engine/places/highland-camera.js';

const cameras = highWhiteCameras((...vector) => new Vector3(...vector));

for (const [viewport, phone] of [['desktop', false], ['phone', true]]) {
  const frame = (rig, t) => ({
    t, x: rig.pos.x, y: rig.pos.y, z: rig.pos.z,
    lx: rig.look.x, ly: rig.look.y, lz: rig.look.z, fov: rig.fov,
  });
  const walk = cameras.createWalk(null, null, phone);
  const poseAt = t => {
    const rig = { pos: new Vector3(), look: new Vector3() };
    walk(t / HIGH_WHITE_TRAVEL_SECONDS, rig);
    return rig;
  };

  test(`${viewport} crosses the deep doorway at eye height and holds the open sky`, () => {
    const threshold = poseAt(24);
    expect(poseAt(22).pos.z).toBeGreaterThan(28.12);
    expect(threshold.pos.toArray()).toEqual([0, 1.66, 28]);
    const reveal = poseAt(26);
    expect(reveal.pos.z).toBeLessThan(27.15);
    expect(reveal.look.y).toBeGreaterThan(reveal.pos.y);
    const holdEnd = poseAt(HIGH_WHITE_WALK_SECONDS);
    expect(holdEnd.pos.distanceTo(reveal.pos)).toBeLessThan(1e-9);
    expect(holdEnd.look.distanceTo(reveal.look)).toBeLessThan(1e-9);
    expect(holdEnd.fov).toBeCloseTo(reveal.fov);
  });

  test(`${viewport} keeps a clear route and settles at the same pose when skipped`, () => {
    const path = Array.from({ length: HIGH_WHITE_TRAVEL_SECONDS * 120 + 1 }, (_, i) => frame(poseAt(i / 120), i / 120));
    const audit = highWhiteTraceMetrics(path);
    expect(audit.doorway.metres).toBeGreaterThan(1);
    expect(audit.nearestStructure.metres).toBeGreaterThan(.65);
    expect(audit.peakWalkSpeed.value).toBeLessThanOrEqual(1.8);
    expect(audit.peakSeatSpeed.value).toBeLessThanOrEqual(1.4);
    expect(audit.peakTurn.value).toBeLessThan(25);
    const skipped = poseAt(HIGH_WHITE_TRAVEL_SECONDS);
    expect(frame(skipped, HIGH_WHITE_TRAVEL_SECONDS)).toEqual(path.at(-1));
    expect(frame(skipped, HIGH_WHITE_TRAVEL_SECONDS)).toEqual(frame(cameras.seated(phone), HIGH_WHITE_TRAVEL_SECONDS));
    expect(skipped.amp).toBe(0);
  });
}
