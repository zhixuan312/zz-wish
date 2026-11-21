import { expect, test } from 'vitest';
import { Matrix4, Quaternion, Raycaster, Scene, Vector3 } from 'three';
import * as THREE from 'three';
import { addCloudCliffGorge, createGorgeSurface, GORGE_PROBES } from '../../../web/src/engine/places/cloud-cliff-gorge.js';

test('the joined gorge supplies the actual floor and both wall probes on one mesh', () => {
  const scene = new Scene();
  const surface = addCloudCliffGorge(THREE, scene, {});
  scene.updateMatrixWorld();
  const ray = new Raycaster();
  const down = new Vector3(0, -1, 0);
  for (const query of [...Object.values(GORGE_PROBES), [151.1, -23.2], [152.9, -21.7]]) {
    const [x, height, z] = surface.pointAt(...query);
    ray.set(new Vector3(x, height + 100, z), down);
    expect(ray.intersectObject(surface.mesh, false)[0]?.distance).toBeCloseTo(100, 3);
  }
  const points = Object.fromEntries(Object.entries(GORGE_PROBES).map(([name, query]) =>
    [name, surface.pointAt(...query)]));
  expect(points.nearBank[1]).toBeGreaterThan(points.valleyBed[1] + 30);
  expect(points.farBank[1]).toBeGreaterThan(points.valleyBed[1] + 40);
});

test('the gorge does not occlude contact at the target but stops a ray that enters the slope first', () => {
  const surface = createGorgeSurface();
  const target = new Vector3(...surface.pointAt(149.2, 23.8));
  const origin = target.clone().add(new Vector3(0, 10, 0));
  expect(surface.blocksSegment(origin, target)).toBe(false);
  expect(surface.blocksSegment(origin, target.clone().sub(new Vector3(0, 1, 0)))).toBe(true);
});

test('the gorge visibility query agrees with taking a segment against the render mesh', () => {
  const scene = new Scene();
  const surface = addCloudCliffGorge(THREE, scene, {});
  scene.updateMatrixWorld();
  const origin = new Vector3(10.45, 1.62, 5.9);
  const ray = new Raycaster();
  const targets = [[150, -22], [181, -35], [211, 0], [323, 32], [414, 0],
    [440, -32], [445.3, -38.6], [453.2, -20.8], [640, 80]];
  for (const query of targets) {
    const target = new Vector3(...surface.pointAt(...query));
    const direction = target.clone().sub(origin);
    ray.far = direction.length() - .006;
    ray.set(origin, direction.normalize());
    const actualHit = ray.intersectObject(surface.mesh, false).length > 0;
    expect(surface.blocksSegment(origin, target), query.join(', ')).toBe(actualHit);
  }
});

test('the loose bend rock sits on the rendered fan and bank', () => {
  const scene = new Scene();
  const { mesh } = addCloudCliffGorge(THREE, scene, {});
  scene.updateMatrixWorld();
  const gravel = scene.getObjectByName('Cloud Cliff bend scree');
  const transform = new Matrix4();
  const position = new Vector3(), scale = new Vector3(), rotation = new Quaternion();
  const down = new Vector3(0, -1, 0);
  const ray = new Raycaster();
  expect(gravel.count).toBeGreaterThan(0);
  for (let index = 0; index < gravel.count; index++) {
    gravel.getMatrixAt(index, transform);
    transform.decompose(position, rotation, scale);
    ray.set(position.clone().addScaledVector(down, -100), down);
    const ground = ray.intersectObject(mesh, false)[0];
    expect(Math.abs(ground.distance - 100)).toBeLessThan(scale.y / 3);
  }
});
