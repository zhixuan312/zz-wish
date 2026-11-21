import { expect, test } from 'vitest';
import { Mesh, MeshBasicMaterial, PlaneGeometry, Raycaster, Vector3 } from 'three';
import { wallBetween } from '../../../web/src/engine/places/cloud-cliff-route.js';

function wallAt(z) {
  const wall = new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial());
  wall.position.z = z;
  wall.updateMatrixWorld();
  return wall;
}

const camera = new Vector3(0, 0, 0);
const target = new Vector3(0, 0, -5);

test('a wall before the Cloud Cliff target blocks the view', () => {
  const raycaster = new Raycaster();
  expect(wallBetween(raycaster, camera, target, wallAt(-2))).toBe(true);
  expect(raycaster.far).toBe(Infinity);
});

test('a wall behind the Cloud Cliff target does not block the view or cap the next query', () => {
  const raycaster = new Raycaster(undefined, undefined, 0, 12);
  const farWall = wallAt(-8);
  expect(wallBetween(raycaster, camera, target, farWall)).toBe(false);
  expect(raycaster.far).toBe(12);
  expect(raycaster.intersectObject(farWall, false)[0]?.distance).toBe(8);
});
