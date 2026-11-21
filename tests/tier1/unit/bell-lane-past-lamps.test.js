import { expect, test, vi } from 'vitest';
import * as THREE from 'three';
import createBellLane from '../../../web/src/engine/places/bell-lane.js';
import { BELL_LANE_SHELF } from '../../../web/src/engine/places/bell-lane-rack.js';
import { PRESET_SHAPES } from '../../../shared/rules.ts';

const V3 = (...xyz) => new THREE.Vector3(...xyz);
const at = (nook, slot, progress = 1) => {
  const position = V3();
  nook.visitorLampPlacement.position(slot, progress, position);
  return position;
};

test('the exact saved lamp returns to its landing address and the next lamp has an empty address', () => {
  const { nook } = createBellLane({ THREE, V3 });
  const { layout } = nook.visitorLampPlacement;
  const history = [];
  const positions = new Map();
  for (let i = 0; i < 12; i++) {
    const visit = layout(history);
    const lamp = { id: `saved-${i}` };
    const landing = at(nook, visit.next).toArray();
    expect(visit.previous.map(({ slot }) => slot.id)).not.toContain(visit.next.id);
    expect(visit.previous.map(({ slot }) => at(nook, slot).toArray())).not.toContainEqual(landing);
    positions.set(lamp.id, { address: visit.next.id, landing });
    history.unshift(lamp);

    const revisit = layout(history.map(saved => ({ ...saved })));
    expect(revisit.previous.map(({ lamp: saved }) => saved.id)).toEqual(history.slice(0, 4).map(saved => saved.id));
    for (const { lamp: saved, slot } of revisit.previous) {
      expect({ address: slot.id, landing: at(nook, slot).toArray() }).toEqual(positions.get(saved.id));
    }
  }
});

test('each transfer keeps the full-size base on the shelf and clear of occupied addresses', () => {
  const { nook } = createBellLane({ THREE, V3 });
  const { layout } = nook.visitorLampPlacement;
  const shelf = BELL_LANE_SHELF;
  const history = Array.from({ length: 10 }, (_, id) => ({ id }));
  for (let count = 5; count < history.length; count++) {
    const { previous, next } = layout(history.slice(0, count));
    const occupied = previous.map(({ slot }) => at(nook, slot));
    expect(at(nook, next, 0).toArray()).toEqual([0, nook.y, 0]);
    expect(at(nook, next, .45).y).toBeGreaterThan(nook.y + .06);
    expect(at(nook, next).y).toBe(nook.y);
    for (let i = 0; i <= 100; i++) {
      const { x, z } = at(nook, next, i / 100);
      expect(Math.abs(x) + .13).toBeLessThan(shelf.width / 2);
      expect(z - .13).toBeGreaterThan(shelf.front);
      expect(z + .13).toBeLessThan(shelf.back);
      for (const prior of occupied) {
        // Both trays are .26 m square. The swept footprint must clear one axis.
        expect(Math.max(Math.abs(x - prior.x), Math.abs(z - prior.z))).toBeGreaterThan(.26);
      }
    }
  }
});

test('the first two transfers and all settled wick locations stay in the seated view', () => {
  const { nook } = createBellLane({ THREE, V3 });
  const { layout } = nook.visitorLampPlacement;
  for (const [view, aspect] of [[nook.choose, 1440 / 900], [nook.choosePhone, 390 / 844]]) {
    const camera = new THREE.PerspectiveCamera(view.fov, aspect);
    camera.position.copy(view.pos);
    camera.lookAt(view.look);
    camera.updateMatrixWorld();
    for (let i = 0; i < 5; i++) {
      const { next } = layout(Array.from({ length: i }, (_, id) => ({ id })));
      for (const progress of (i < 2 ? [0, .25, .5, .75, 1] : [1])) {
        const wick = at(nook, next, progress).add(V3(0, .536, 0)).project(camera);
        expect(Math.abs(wick.x)).toBeLessThan(.95);
        expect(Math.abs(wick.y)).toBeLessThan(.7);
      }
    }
  }
});

test('the private lattice uses the saved shape, colour and fuel with the same cup and tied-tag builders', () => {
  const unlitLattice = vi.fn(() => new THREE.Group());
  const { nook } = createBellLane({ THREE, V3, unlitLattice });
  const shape = { kind: 'shade', rows: PRESET_SHAPES.shade[1].rows, color: 0xf2e4c4 };
  for (const [status, remaining] of [['went_out', .68], ['burned_down', 0]]) {
    const saved = { id: status, shape, status, remaining };
    nook.makePastLamp(saved);
    expect(unlitLattice).toHaveBeenLastCalledWith(saved, nook.makeVisitorCup, nook.makeVisitorWishTag);
  }
});
