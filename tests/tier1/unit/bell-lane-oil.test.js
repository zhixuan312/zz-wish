import { expect, test } from 'vitest';
import * as THREE from 'three';
import { remainingFuel } from '../../../shared/wax.ts';
import createBellLane from '../../../web/src/engine/places/bell-lane.js';

const V3 = (...xyz) => new THREE.Vector3(...xyz);
const lathe = (profile, segments) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
const bellLane = createBellLane({ THREE, V3, lathe });

function visitorCup() {
  const group = new THREE.Group();
  group.position.copy(bellLane.nook.at.pos).add(V3(0, bellLane.nook.y, 0));
  const parts = bellLane.nook.makeVisitorCup(group, new THREE.MeshStandardMaterial(), .5);
  const oil = group.getObjectByName('Bell Lane remaining oil');
  const cup = group.getObjectByName('Bell Lane visitor oil cup');
  return { group, oil, cup, ...parts };
}

test('Bell Lane stops at the settled fuel fraction, exposes the dry cup at zero, and can refill on a new offer', () => {
  const { oil, cup, wickMesh, setFuelLevel } = visitorCup();
  const full = oil.position.y;
  const originalWick = wickMesh.position.clone();
  const remaining = remainingFuel(14_425, 600_000);
  setFuelLevel(remaining);
  const earlyHeight = oil.position.y;
  expect(oil.visible).toBe(true);
  expect(earlyHeight).toBeLessThan(full);

  setFuelLevel(remainingFuel(600_000, 600_000));
  const floor = oil.position.y;
  expect((earlyHeight - floor) / (full - floor)).toBeCloseTo(remaining, 10);
  expect(oil.visible).toBe(false);
  expect(cup.visible).toBe(true);
  expect(wickMesh.position.equals(originalWick)).toBe(true);
  wickMesh.geometry.computeBoundingBox();
  expect(wickMesh.position.y + wickMesh.geometry.boundingBox.max.y).toBeCloseTo(.54, 8);

  setFuelLevel(1);
  expect(oil.visible).toBe(true);
  expect(oil.position.y).toBe(full);
});

test.each(['choose', 'choosePhone'])(
  'the fixed seated %s angle can see the oil even near the clay floor', view => {
    const { cup, group, oil, setFuelLevel } = visitorCup();
    setFuelLevel(.01);
    group.updateMatrixWorld(true);
    const camera = bellLane.nook[view].pos.clone().add(bellLane.nook.at.pos);
    const center = oil.getWorldPosition(V3());
    let visiblePoints = 0;
    for (let x = -.015; x <= .015; x += .005) for (let z = -.015; z <= .015; z += .005) {
      if (Math.hypot(x, z) >= .019) continue;
      const ray = center.clone().add(V3(x, 0, z)).sub(camera);
      const caster = new THREE.Raycaster(camera, ray.clone().normalize(), 0, ray.length() + .001);
      if (caster.intersectObjects([cup, oil], false)[0]?.object === oil) visiblePoints++;
    }
    expect(visiblePoints).toBeGreaterThan(8);
  },
);
