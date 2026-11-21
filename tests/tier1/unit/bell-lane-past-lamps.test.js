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
