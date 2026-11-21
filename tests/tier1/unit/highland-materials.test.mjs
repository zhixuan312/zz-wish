import { expect, test } from 'vitest';
import * as THREE from 'three';
import { highWhiteCameras, HIGH_WHITE_TRAVEL_SECONDS } from '../../../web/src/engine/places/highland-camera.js';
import { buildHighWhiteRidges } from '../../../web/src/engine/places/highland-ridges.js';
import { fitHighWhiteChimneys } from '../../../web/src/engine/places/highland-surfaces.js';

const vector = (...components) => new THREE.Vector3(...components);

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
