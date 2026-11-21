import { expect, test } from 'vitest';
import * as THREE from 'three';
import createPlace from '../../../web/src/engine/places/highland.js';
import { highWhiteCameras, HIGH_WHITE_TRAVEL_SECONDS } from '../../../web/src/engine/places/highland-camera.js';
import { buildHighWhiteRidges } from '../../../web/src/engine/places/highland-ridges.js';
import { fitHighWhiteChimneys, HIGH_WHITE_PLASTER_UV_SCALE } from '../../../web/src/engine/places/highland-surfaces.js';

const vector = (...components) => new THREE.Vector3(...components);

async function portal() {
  const court = new THREE.Group();
  const context = { G: court, up: [], rnd: () => .5, light: { n: 0 } };
  const noop = () => {};
  const place = createPlace({ THREE, V3: vector, M: () => new THREE.MeshStandardMaterial(),
    ground: noop, box: noop, wallWithHoles: noop, pauseBuild: noop, context });
  await place.build();
  court.updateMatrixWorld(true);
  return { court, place };
}

test('an independent lintel and jambs share metres and origin in their plaster UV', async () => {
  const { court } = await portal();
  for (const [name, width] of [['west jamb', 10.85], ['east jamb', 23.85], ['lintel', 37]]) {
    const mesh = court.getObjectByName(`High White ${name}`);
    const { position, uv, normal } = mesh.geometry.attributes;
    for (const face of [-1, 1]) {
      const faceUV = [];
      for (let i = 0; i < position.count; i++) {
        if (normal.getZ(i) !== face) continue;
        const world = mesh.localToWorld(vector().fromBufferAttribute(position, i));
        expect(uv.getX(i)).toBeCloseTo(world.x * HIGH_WHITE_PLASTER_UV_SCALE, 5);
        expect(uv.getY(i)).toBeCloseTo(world.y * HIGH_WHITE_PLASTER_UV_SCALE, 5);
        faceUV.push(uv.getX(i));
      }
      expect(Math.max(...faceUV) - Math.min(...faceUV)).toBeCloseTo(width * HIGH_WHITE_PLASTER_UV_SCALE, 5);
    }
  }
});

test('the mounted portal and paving keep the routed camera at walking eye height', async () => {
  const { court, place } = await portal();
  const bounds = name => new THREE.Box3().setFromObject(court.getObjectByName(`High White ${name}`));
  const door = ['west jamb', 'east jamb', 'lintel'].map(bounds);
  const pier = bounds('west pier');
  const floors = ['entrance paving', 'court paving', 'threshold stone'].map(bounds);
  const walk = place.createWalk(null, null, false);
  const rig = { pos: vector(), look: vector() };
  let nearestFrame = Infinity, nearestPier = Infinity, minEye = Infinity, maxEye = -Infinity;
  for (let step = 0; step <= 30 * 60; step++) {
    walk(step / 60 / HIGH_WHITE_TRAVEL_SECONDS, rig);
    for (const sign of [-1, 1]) {
      const eye = rig.pos.clone().add(vector(sign * rig.amp, sign * rig.amp * .35, sign * rig.amp * .5));
      const grade = floors.reduce((height, { min, max }) => eye.x >= min.x && eye.x <= max.x &&
        eye.z >= min.z && eye.z <= max.z ? Math.max(height, max.y) : height, 0);
      nearestFrame = Math.min(nearestFrame, ...door.map(solid => solid.distanceToPoint(eye)));
      nearestPier = Math.min(nearestPier, pier.distanceToPoint(eye));
      minEye = Math.min(minEye, eye.y - grade);
      maxEye = Math.max(maxEye, eye.y - grade);
    }
  }
  expect(nearestFrame).toBeGreaterThanOrEqual(.6);
  expect(nearestPier).toBeGreaterThanOrEqual(1);
  expect(minEye).toBeGreaterThanOrEqual(1.5);
  expect(maxEye).toBeLessThanOrEqual(1.7);
});

test('the inner west return reaches the edge of the existing desktop threshold view', () => {
  const rig = { pos: vector(), look: vector() };
  highWhiteCameras(vector).createWalk(null, null, false)(24 / HIGH_WHITE_TRAVEL_SECONDS, rig);
  const camera = new THREE.PerspectiveCamera(rig.fov, 1440 / 900, .01, 1000);
  camera.position.copy(rig.pos);
  camera.lookAt(rig.look);
  camera.updateMatrixWorld();
  const insideEdge = vector(-1.146, 1.66, 26.101).project(camera);
  expect(insideEdge.x).toBeGreaterThan(-1);
  expect(insideEdge.x).toBeLessThan(-.7);
  expect(insideEdge.z).toBeGreaterThan(-1);
  expect(insideEdge.z).toBeLessThan(1);
});

test('both hall returns and successive floor slabs are visible through the reveal opening', async () => {
  const { court } = await portal();
  const passage = court.children.filter(mesh => mesh.name.startsWith('High White hall passage'));
  const eye = vector(.65, 1.66, 26.1);
  const firstHit = target => new THREE.Raycaster(eye, target.sub(eye).normalize())
    .intersectObjects(passage)[0];

  for (const [side, x] of [['west', -1.02], ['east', 1.02]]) {
    const hit = firstHit(vector(x, 1.4, -1));
    expect(hit.object.name).toBe(`High White hall passage ${side} return`);
    expect(hit.point.z).toBeLessThan(-1.78);
    expect(hit.point.z).toBeGreaterThan(-5.18);
  }
  const floor = [-2.035, -4.335].map(z => firstHit(vector(0, .08, z)));
  expect(floor.map(hit => hit.object.name)).toEqual(['High White hall passage slab 1', 'High White hall passage slab 3']);
  expect(floor[1].distance - floor[0].distance).toBeGreaterThan(2);
});

test('the ridges leave the center of the reveal sky above the hall', () => {
  const court = new THREE.Group();
  buildHighWhiteRidges({ THREE, context: { G: court, light: { n: 0 } } });
  court.updateMatrixWorld(true);
  const eye = vector(.65, 1.66, 26.1);
  const rayAt = angle => {
    const r = THREE.MathUtils.degToRad(angle);
    return new THREE.Raycaster(eye, vector(0, Math.sin(r), -Math.cos(r))).intersectObject(court).length;
  };
  expect(court.children.length).toBe(3);
  expect(rayAt(7.5)).toBeGreaterThan(0);
  expect(rayAt(15)).toBe(0);
});

test('chimney lip and glass seat follow the chosen vessel without altering shared glass', () => {
  const nook = new THREE.Group(), up = [], light = { n: 1 };
  const context = { G: nook, up, light, others: [] };
  const sharedGlass = new THREE.MeshPhysicalMaterial({ transparent: true, opacity: .07 });
  const visitor = new THREE.Group();
  nook.add(visitor);
  const makeVessel = top => {
    const vessel = new THREE.Group();
    const chimney = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(.022, .05), new THREE.Vector2(.019, top)]), sharedGlass);
    chimney.renderOrder = 3;
    vessel.add(chimney);
    visitor.add(vessel);
    return { vessel, chimney };
  };
  fitHighWhiteChimneys(THREE, context);
  const first = makeVessel(.17);
  up[0](0, 0, light);
  up[0](0, 1, light);
  expect(first.chimney.material).not.toBe(sharedGlass);
  expect(first.chimney.children.map(child => child.position.y)).toEqual([.05, .17]);
  expect(sharedGlass.opacity).toBe(.07);
  visitor.remove(first.vessel);
  const replacement = makeVessel(.21);
  up[0](0, 2, light);
  expect(replacement.chimney.children.map(child => child.position.y)).toEqual([.05, .21]);
});
