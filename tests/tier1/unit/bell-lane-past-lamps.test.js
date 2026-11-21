import { expect, test, vi } from 'vitest';
import * as THREE from 'three';
import createBellLane from '../../../web/src/engine/places/bell-lane.js';
import { PRESET_SHAPES } from '../../../shared/rules.ts';

const V3 = (...xyz) => new THREE.Vector3(...xyz);

test('the Bell Lane rack has four earlier-lamp places grounded on the shelf, away from the current lamp', () => {
  const { nook } = createBellLane({ THREE, V3 });
  expect(nook.pastLampSlots).toHaveLength(4);
  for (const [x, y, z, scale, yaw] of nook.pastLampSlots) {
    // The lattice base is 26 cm square before scaling and yaw.
    const halfWidth = .13 * scale * (Math.abs(Math.sin(yaw)) + Math.abs(Math.cos(yaw)));
    expect(y).toBe(nook.y);
    expect(Math.abs(x) + halfWidth).toBeLessThan(2.11 / 2);
    expect(Math.abs(z) + halfWidth).toBeLessThan(.56 / 2);
    expect(Math.abs(x) - halfWidth).toBeGreaterThan(.13);
  }
});

test('the two newest lamp positions flank the current shade in both seated views', () => {
  const { nook } = createBellLane({ THREE, V3 });
  for (const [view, aspect] of [[nook.choose, 1440 / 900], [nook.choosePhone, 390 / 844]]) {
    const camera = new THREE.PerspectiveCamera(view.fov, aspect);
    camera.position.copy(view.pos);
    camera.lookAt(view.look);
    camera.updateMatrixWorld();
    const current = V3(0, nook.y + .58, 0).project(camera);
    const [left, right] = nook.pastLampSlots.slice(0, 2).map(([x, y, z, scale]) => V3(x, y + .58 * scale, z).project(camera));
    expect(left.x).toBeGreaterThan(-1);
    expect(left.x).toBeLessThan(current.x);
    expect(right.x).toBeGreaterThan(current.x);
    expect(right.x).toBeLessThan(1);
  }
});

test('the private lattice uses the saved shape, colour and fuel in the same oil cup as the current lamp', () => {
  const unlitLattice = vi.fn(() => new THREE.Group());
  const { nook } = createBellLane({ THREE, V3, unlitLattice });
  const shape = { kind: 'shade', rows: PRESET_SHAPES.shade[1].rows, color: 0xf2e4c4 };
  for (const [status, remaining] of [['went_out', .68], ['burned_down', 0]]) {
    const saved = { id: status, shape, status, remaining };
    nook.makePastLamp(saved);
    expect(unlitLattice).toHaveBeenLastCalledWith(saved, nook.makeVisitorCup);
  }
});

test('the visitor lamp lifts into the display row and lands clear of the existing return slots', () => {
  const { nook } = createBellLane({ THREE, V3 });
  const { slot, position } = nook.visitorLampPlacement;
  const start = V3(), middle = V3(), end = V3();
  position(0, start);
  position(.5, middle);
  position(1, end);
  expect(slot).toBe('visitor');
  expect(start.toArray()).toEqual([0, nook.y, 0]);
  expect(end.y).toBe(nook.y);
  expect(end.z).toBeGreaterThan(.1);
  expect(end.z + .121).toBeLessThan(.28);
  expect(middle.y).toBeGreaterThan(nook.y + .06);
  expect(middle.z).toBeGreaterThan(start.z);
  expect(middle.z).toBeLessThan(end.z);
  for (const [x, , , scale, yaw] of nook.pastLampSlots) {
    const halfWidth = .13 * scale * (Math.abs(Math.sin(yaw)) + Math.abs(Math.cos(yaw)));
    expect(Math.abs(x - end.x) - halfWidth).toBeGreaterThan(.13);
  }
  for (const [view, aspect] of [[nook.choose, 1440 / 900], [nook.choosePhone, 390 / 844]]) {
    const camera = new THREE.PerspectiveCamera(view.fov, aspect);
    camera.position.copy(view.pos);
    camera.lookAt(view.look);
    camera.updateMatrixWorld();
    for (const anchor of [start, middle, end]) {
      const wick = anchor.clone().add(V3(0, .536, 0)).project(camera);
      expect(Math.abs(wick.x)).toBeLessThan(.7);
      expect(Math.abs(wick.y)).toBeLessThan(.7);
    }
  }
});
