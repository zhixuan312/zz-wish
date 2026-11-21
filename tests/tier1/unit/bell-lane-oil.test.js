import { expect, test } from 'vitest';
import * as THREE from 'three';
import { remainingFuel } from '../../../shared/wax.ts';
import createBellLane from '../../../web/src/engine/places/bell-lane.js';
import { BELL_LANE_CUPS } from '../../../web/src/engine/places/bell-lane-cups.ts';
import { makeBellLaneOilBowl } from '../../../web/src/engine/places/bell-lane-oil.js';

const V3 = (...xyz) => new THREE.Vector3(...xyz);
const lathe = (profile, segments) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
const bellLane = createBellLane({ THREE, V3, lathe });

function visitorCup() {
  const group = new THREE.Group();
  group.position.copy(bellLane.nook.at.pos).add(V3(0, bellLane.nook.y, 0));
  const original = BELL_LANE_CUPS[0];
  const clay = new THREE.MeshStandardMaterial({ color: original.color, roughness: original.roughness });
  const parts = bellLane.nook.makeVisitorCup(group, clay, .5);
  const oil = group.getObjectByName('Bell Lane remaining oil');
  const cup = group.getObjectByName('Bell Lane visitor oil cup');
  return { group, oil, cup, clay, ...parts };
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

test('the reflective oil edge stays below the ceramic rim and retreats at low fuel', () => {
  const { oil, cup, setFuelLevel } = visitorCup();
  oil.geometry.computeBoundingBox();
  cup.geometry.computeBoundingBox();
  const edgeHeight = oil.geometry.boundingBox.max.y;
  expect(edgeHeight).toBeGreaterThan(0);
  expect(oil.position.y + edgeHeight).toBeLessThan(cup.geometry.boundingBox.max.y);
  expect(oil.material.emissive.getHex()).toBe(0);
  expect(oil.material.userData.useSceneEnvironment).toBe(true);
  setFuelLevel(.01);
  expect(oil.scale.y * edgeHeight).toBeLessThan(.00005);
});

test('the rack and lantern use the same cup profile', () => {
  const { cup, clay } = visitorCup();
  const staged = makeBellLaneOilBowl({ THREE, lathe }, clay, -.010);
  const current = cup.geometry.getAttribute('position');
  const stock = staged.geometry.getAttribute('position');
  expect(stock.count).toBe(current.count);
  for (let i = 0; i < stock.count; i++) {
    expect(stock.getX(i)).toBe(current.getX(i));
    expect(stock.getY(i) + .51).toBeCloseTo(current.getY(i), 7);
    expect(stock.getZ(i)).toBe(current.getZ(i));
  }
});

test('switching the current cup keeps its wick and settled fuel without repainting earlier cups', () => {
  const { group, cup, clay, oil, wickMesh, setFuelLevel, setCupFinish } = visitorCup();
  const geometry = cup.geometry;
  const other = new THREE.Group();
  bellLane.nook.makeVisitorCup(other, clay, .5);
  const earlier = other.getObjectByName(cup.name);
  const wick = wickMesh.position.clone();
  setFuelLevel(.65);
  const oilY = oil.position.y;
  for (const finish of [...BELL_LANE_CUPS].reverse()) {
    setCupFinish(finish.id);
    expect(group.getObjectByName(cup.name)).toBe(cup);
    expect(cup.userData.cupId).toBe(finish.id);
    expect(cup.material.color.getHex()).toBe(finish.color);
    expect(cup.material.roughness).toBe(finish.roughness);
    expect(cup.geometry).toBe(geometry);
    expect(wickMesh.position.equals(wick)).toBe(true);
    expect(oil.visible).toBe(true);
    expect(oil.position.y).toBe(oilY);
    expect(earlier.material).toBe(clay);
    expect(earlier.material.color.getHex()).toBe(BELL_LANE_CUPS[0].color);
  }
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
