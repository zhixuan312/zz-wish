import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import * as THREE from 'three';
import createPlace from '../../../web/src/engine/places/sea-tide.js';

const V3 = (...coordinates) => new THREE.Vector3(...coordinates);
const route = createPlace({ V3 });
const wall = { west: 2.5, east: 3.5, south: 14, north: 34 };
const up = V3(0, 1, 0);

function readPose(pose, phone, chooser = false) {
  const { pos: origin, ry } = route.nook.at;
  const world = point => point.clone().applyAxisAngle(up, ry).add(origin);
  const look = world(pose.look);
  const pos = world(pose.pos);
  if (phone) {
    pos.sub(look).multiplyScalar(1.45).add(look);
    if (chooser) look.y -= pos.distanceTo(look) * 0.1;
  }
  return { pos, look, fov: phone ? undefined : pose.fov };
}

function wallDistance({ x, z }) {
  return Math.hypot(
    Math.max(wall.west - x, 0, x - wall.east),
    Math.max(wall.south - z, 0, z - wall.north),
  );
}

for (const phone of [false, true]) {
  const viewport = phone ? 'phone' : 'desktop';
  test(`${viewport} Tide route clears the wall, turns at walking pace and reaches the authored pose`, () => {
    const start = (phone && route.viewPhone) || route.view;
    const wide = (phone && route.nook.widePhone) || route.nook.wide;
    const choose = (phone && route.nook.choosePhone) || route.nook.choose || wide;
    const end = readPose(wide, phone);
    const seated = readPose(choose, phone, true);
    const walk = route.createWalk({ ...start, fov: start.fov ?? (phone ? 44 : 32) }, end, phone);
    const rig = { pos: V3(), look: V3(), amp: 0, fov: 0 };
    assert.equal(route.walkSeconds + 2.4, 30);
    assert.equal(route.verticalCameraDrift, 0);

    walk(0, rig);
    assert.ok(rig.pos.distanceTo(start.pos) < 1e-6);
    assert.ok(rig.look.distanceTo(start.look) < 1e-6);

    walk(18 / route.walkSeconds, rig);
    assert.ok(rig.pos.x < wall.west && rig.pos.z > wall.south);
    assert.ok(rig.look.z < rig.pos.z);
    walk(26.2 / route.walkSeconds, rig);
    assert.ok(rig.pos.x > wall.east && rig.pos.z < wall.south);
    assert.ok(rig.look.x > rig.pos.x);

    let previousPosition, previousDirection;
    let peakWalkingSpeed = 0, peakOtherSpeed = 0;
    let minimumClearance = Infinity;
    let peakTurn = 0;
    const fps = 120;
    for (let frame = 0; frame <= 30 * fps; frame++) {
      const seconds = frame / fps;
      walk(Math.min(1, seconds / route.walkSeconds), rig);
      if (seconds > route.walkSeconds) {
        // Match the stock final moveCam easing, including the portrait pullback.
        const t = (seconds - route.walkSeconds) / 2.4;
        const ease = t < 0.5 ? 4 * t ** 3 : 1 - (2 - 2 * t) ** 3 / 2;
        rig.pos.lerp(seated.pos, ease);
        rig.look.lerp(seated.look, ease);
      }
      if (seconds <= route.walkSeconds) {
        const { x, y, z } = rig.pos;
        const deck = Math.abs(x) <= 2.69 && z >= 12.5 && z <= 35.5 ? .122 : .12;
        const eye = y - deck;
        assert.ok(eye >= 1.50 && eye <= 1.70, `Authored walking eye ${eye.toFixed(3)} m at ${seconds.toFixed(2)} s`);
      }
      minimumClearance = Math.min(minimumClearance, wallDistance(rig.pos));
      const direction = rig.look.clone().sub(rig.pos).normalize();
      if (previousDirection) {
        peakTurn = Math.max(peakTurn, THREE.MathUtils.radToDeg(previousDirection.angleTo(direction)) * fps);
        const speed = previousPosition.distanceTo(rig.pos) * fps;
        if (seconds <= route.walkSeconds) peakWalkingSpeed = Math.max(peakWalkingSpeed, speed);
        else peakOtherSpeed = Math.max(peakOtherSpeed, speed);
      }
      previousPosition = rig.pos.clone();
      previousDirection = direction;
    }
    assert.ok(minimumClearance >= 0.6, `Granite wall clearance ${minimumClearance.toFixed(2)} m`);
    assert.ok(peakTurn <= 25, `Maximum angular speed ${peakTurn.toFixed(2)}°/s`);
    assert.ok(peakWalkingSpeed <= 1.8, `Maximum walking speed ${peakWalkingSpeed.toFixed(3)} m/s`);
    assert.ok(peakOtherSpeed <= 1.4, `Maximum chooser speed ${peakOtherSpeed.toFixed(3)} m/s`);
    assert.ok(rig.pos.distanceTo(seated.pos) < 1e-6);
    assert.ok(rig.look.distanceTo(seated.look) < 1e-6);

    // Skip may arrive from any progress. The authored endpoint is independent of that history.
    walk(0.35, rig);
    walk(1, rig);
    assert.ok(rig.pos.distanceTo(end.pos) < 1e-6);
    assert.ok(rig.look.distanceTo(end.look) < 1e-6);
  });
}


test('Tide builds its wall deposits and animated harbour water before the first preview', async () => {
  const noGeometry = () => {};
  const context = { G: new THREE.Group(), up: [] };
  const helpers = {
    THREE, V3, context,
    M: () => new THREE.MeshStandardMaterial(),
    roofMat: noGeometry, pave: noGeometry, hallB: noGeometry, peak: noGeometry, water: noGeometry,
    box: noGeometry, gateB: noGeometry, pauseBuild: noGeometry, rock: noGeometry, put: noGeometry,
    wallWithHoles: noGeometry, otherLamp: noGeometry,
  };
  const canvas = { getContext: () => ({ fillRect: noGeometry }) };
  vi.stubGlobal('document', { createElement: () => canvas });
  try {
    const tide = createPlace(helpers);
    await tide.build();
    await tide.nook.build(helpers);
    assert.ok(context.G.getObjectByName('Salt on the descending return'));
    assert.equal(context.up.length, 1);
    const sea = context.G.getObjectByName('Tide Temple harbour water');
    assert.ok(sea);
    assert.equal(sea.position.y, -2.8);
    context.up[0](1 / 60, 2, { n: .7, g: .2 });
    assert.equal(sea.material.uniforms.uTime.value, 2);
    assert.equal(sea.material.uniforms.uNight.value, .7);
  } finally {
    vi.unstubAllGlobals();
  }
});
