import { expect, test } from 'vitest';
import * as THREE from 'three';
import createBellLane from '../../../web/src/engine/places/bell-lane.js';

const V3 = (...xyz) => new THREE.Vector3(...xyz);

function visitorTag() {
  const { nook } = createBellLane({ THREE, V3, grainTex: new THREE.Texture() });
  const lamp = new THREE.Group();
  const { setProgress } = nook.makeVisitorWishTag(lamp);
  return {
    nook, lamp, setProgress,
    rig: lamp.getObjectByName('Bell Lane wish tag rig'),
    tag: lamp.getObjectByName('Bell Lane visitor tag'),
    cord: lamp.getObjectByName('Bell Lane wish tag cord'),
    knot: lamp.getObjectByName('Bell Lane wish tag knot'),
  };
}

test('the current lantern starts with the tag resting clear of the oil cup', () => {
  const { lamp, rig, tag, knot } = visitorTag();
  const bounds = new THREE.Box3().setFromObject(tag);
  expect(rig.parent).toBe(lamp);
  expect(tag.parent).toBe(rig);
  expect(rig.userData.state).toBe('loose');
  expect(knot.visible).toBe(false);
  expect(bounds.min.y).toBeGreaterThan(.510);
  expect(bounds.min.x).toBeGreaterThan(.024);
  expect(bounds.max.x).toBeLessThan(.13);
  expect(bounds.min.z).toBeGreaterThan(-.13);
});

test('the cord uses a real eyelet and reaches around the current lattice post', () => {
  const { lamp, rig, tag, cord, knot, setProgress } = visitorTag();
  const blank = new THREE.Mesh(tag.geometry, tag.material);
  const through = new THREE.Raycaster(V3(0, .032, .1), V3(0, 0, -1));
  const face = new THREE.Raycaster(V3(.012, .032, .1), V3(0, 0, -1));
  expect(through.intersectObject(blank)).toHaveLength(0);
  expect(face.intersectObject(blank).length).toBeGreaterThan(0);

  setProgress(.51);
  expect(rig.userData.state).toBe('tying');
  expect(tag.position.y).toBeGreaterThan(.53);
  expect(knot.visible).toBe(false);

  setProgress(1);
  lamp.updateMatrixWorld(true);
  expect(rig.userData.state).toBe('tied');
  expect(knot.position.toArray()).toEqual([.11, .479, -.11]);
  expect(knot.visible).toBe(true);
  expect(tag.position.y).toBeLessThan(knot.position.y);
  for (const strand of [cord.children[1], cord.children[3]]) {
    const end = strand.localToWorld(V3(0, .5, 0)).sub(knot.position);
    expect(Math.hypot(end.x, end.z)).toBeCloseTo(.0175, 3);
    expect(end.y).toBeCloseTo(.001, 8);
  }

  const tiedPose = tag.position.clone();
  setProgress(1);
  expect(tag.position.equals(tiedPose)).toBe(true);
  setProgress(0);
  expect(rig.userData.state).toBe('loose');
  expect(knot.visible).toBe(false);
  expect(tag.position.y).toBeGreaterThan(.51);
});

test.each([['choose', 1440, 900], ['choosePhone', 390, 844]])('the %s seat keeps the tied face and current wick in view', (view, width, height) => {
  const { nook, setProgress, tag } = visitorTag();
  const pose = nook[view];
  const camera = new THREE.PerspectiveCamera(pose.fov, width / height);
  camera.position.copy(pose.pos);
  camera.lookAt(pose.look);
  camera.updateMatrixWorld();
  setProgress(1);
  const face = tag.position.clone().add(V3(0, nook.y, 0)).project(camera);
  const wick = V3(0, nook.y + .536, 0).project(camera);
  expect(face.x).toBeGreaterThan(-1);
  expect(face.x).toBeLessThan(wick.x - .08);
  expect(face.y).toBeGreaterThan(-.17);
});
