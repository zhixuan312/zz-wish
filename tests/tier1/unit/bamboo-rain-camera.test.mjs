import { expect, test } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { ARRIVAL_SECONDS, WALK_SECONDS, bambooRainCameras } from '../../../web/src/engine/places/bamboo-rain-camera.js';
import { CAMERA_LIMITS, cameraPathViolations, measureCameraPath } from '../../visual/pine-camera-path.mjs';

const V3 = (x, y, z) => new Vector3(x, y, z);
const nook = { pos: V3(-9.3, .35, 6), ry: Math.PI / 2 };
const cameras = bambooRainCameras(V3, nook);
const worldPoint = point => point.clone().applyAxisAngle(V3(0, 1, 0), nook.ry).add(nook.pos);
const worldPose = pose => ({ pos: worldPoint(pose.pos), look: worldPoint(pose.look), fov: pose.fov });
const freshRig = () => ({ pos: V3(0, 0, 0), look: V3(0, 0, 0), fov: 0, amp: 0 });

for (const phone of [false, true]) {
  const viewport = phone ? 'phone' : 'desktop';
  const entrance = phone ? cameras.viewPhone : cameras.view;
  const held = worldPose(phone ? cameras.widePhone : cameras.wide);
  const seated = worldPose(phone ? cameras.choosePhone : cameras.choose);

  test(`${viewport} route crosses the wet edge and holds the shelter reveal at 30 seconds`, () => {
    const walk = cameras.createWalk(entrance, held, phone);
    const rig = freshRig();
    expect(WALK_SECONDS).toBe(30);
    walk(0, rig);
    expect(rig.pos.distanceTo(entrance.pos)).toBeLessThan(1e-9);
    expect(rig.look.distanceTo(entrance.look)).toBeLessThan(1e-9);
    walk(22 / WALK_SECONDS, rig);
    expect(rig.pos.x).toBeGreaterThan(nook.pos.x + 1.84);
    walk(26 / WALK_SECONDS, rig);
    expect(rig.pos.x).toBeLessThan(nook.pos.x + 1.80);
    expect(rig.pos.z).toBeGreaterThan(9);
    expect(rig.pos.z).toBeLessThan(10.3);
    walk((WALK_SECONDS - 1) / WALK_SECONDS, rig);
    expect(rig.pos.distanceTo(held.pos)).toBeLessThan(1e-9);
    expect(rig.look.distanceTo(held.look)).toBeLessThan(1e-9);
    walk(1, rig);
    expect(rig.pos.distanceTo(held.pos)).toBeLessThan(1e-9);
    expect(rig.look.distanceTo(held.look)).toBeLessThan(1e-9);
    expect(rig.fov).toBeGreaterThan(entrance.fov);
  });

  test(`${viewport} walk and seating stay continuous and share the skipped endpoint`, () => {
    const walk = cameras.createWalk(entrance, held, phone);
    const arrive = cameras.createArrival(held, seated);
    const rig = freshRig();
    const samples = [];
    const append = t => {
      const [x, y, z] = rig.pos.toArray();
      const [lx, ly, lz] = rig.look.toArray();
      samples.push({ t, x, y, z, lx, ly, lz });
    };
    for (let frame = 0; frame <= WALK_SECONDS * 60; frame++) {
      walk(frame / (WALK_SECONDS * 60), rig);
      append(frame / 60);
    }
    arrive(0, rig);
    expect(rig.pos.distanceTo(held.pos)).toBeLessThan(1e-9);
    expect(rig.look.distanceTo(held.look)).toBeLessThan(1e-9);
    for (let frame = 1; frame <= ARRIVAL_SECONDS * 60; frame++) {
      arrive(frame / (ARRIVAL_SECONDS * 60), rig);
      append(WALK_SECONDS + frame / 60);
    }
    const obstacles = [
      { position: [-7.98, 1.62, 10.55], radius: .16 },
      { position: [-7.98, 1.62, 2.90], radius: .16 },
    ];
    const report = measureCameraPath(samples, obstacles);
    const failures = cameraPathViolations(report, CAMERA_LIMITS, { afterWalk: WALK_SECONDS });
    expect(failures, failures.join(', ')).toEqual([]);
    // Pole clearance is measured horizontally since a camera can pass a tall pole at any height.
    for (const { position: [x, , z], radius } of obstacles) {
      expect(Math.min(...samples.map(point => Math.hypot(point.x - x, point.z - z) - radius)))
        .toBeGreaterThanOrEqual(CAMERA_LIMITS.clearanceMetres);
    }

    // Each jamb is 2.4 m deep. Include its inside corner while the path turns left.
    const jambs = [[-3.5, -1.4], [1.4, 3.5]];
    for (const [left, right] of jambs) {
      const clearance = Math.min(...samples.map(({ x, z }) =>
        Math.hypot(Math.max(left - x, 0, x - right), Math.max(16.8 - z, 0, z - 19.2))));
      expect(clearance).toBeGreaterThanOrEqual(CAMERA_LIMITS.clearanceMetres);
    }

    const skip = freshRig();
    walk(1, skip);
    arrive(1, skip);
    expect(skip.pos.distanceTo(seated.pos)).toBeLessThan(1e-9);
    expect(skip.look.distanceTo(seated.look)).toBeLessThan(1e-9);
    expect(skip.pos.distanceTo(rig.pos)).toBeLessThan(1e-9);
    expect(skip.look.distanceTo(rig.look)).toBeLessThan(1e-9);
    expect(skip.fov).toBe(seated.fov);
  });

  test(`${viewport} seated view projects the lamp, tile ends and channel before the chooser sheet`, () => {
    const [width, height] = phone ? [390, 844] : [1440, 900];
    const pose = phone ? cameras.choosePhone : cameras.choose;
    const camera = new PerspectiveCamera(pose.fov, width / height, .015, 150);
    camera.position.copy(pose.pos);
    camera.lookAt(pose.look);
    camera.updateMatrixWorld(true);
    const targets = [
      V3(0, .91, 0),
      V3(0, 1.09, 0),
      V3(3.35, 2.80, 1.89),
      V3(3.35, -.259, 1.89),
    ];
    for (const target of targets) {
      const view = target.project(camera);
      const x = (1 + view.x) * width / 2;
      const y = (1 - view.y) * height / 2;
      expect(x).toBeGreaterThan(5);
      expect(x).toBeLessThan(phone ? width - 5 : width * .96 - 380);
      expect(y).toBeGreaterThan(5);
      expect(y).toBeLessThan(phone ? height * .60 : height - 5);
    }
  });
}
