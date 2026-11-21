import { expect, test } from 'vitest';
import * as THREE from 'three';
import createBellLane from '../../../web/src/engine/places/bell-lane.js';
import { PRESET_SHAPES, sizedPreset } from '../../../shared/rules.ts';

const V3 = (...xyz) => new THREE.Vector3(...xyz);

const preset = (index, minutes) => sizedPreset(PRESET_SHAPES.shade[index].rows, minutes);
const drawn = [
  { y: 0, r: .004 }, { y: .02, r: .004 }, { y: .07, r: .049 }, { y: .12, r: .031 },
];

function visitorTag(rows = preset(0, 10)) {
  const { nook } = createBellLane({ THREE, V3, grainTex: new THREE.Texture() });
  const lamp = new THREE.Group();
  const tray = new THREE.Mesh(new THREE.BoxGeometry(.26, .02, .26));
  tray.position.y = .5;
  const rackPost = new THREE.Mesh(new THREE.BoxGeometry(.022, .5, .022));
  rackPost.position.set(.11, .25, -.11);
  const scale = Math.max(1.8, .05 / Math.max(...rows.map(row => row.r)));
  const path = new THREE.CatmullRomCurve3(rows.map(({ r, y }) => {
    const width = Math.max(.002, r * scale);
    return V3(width, .52 + y * scale, -width);
  }));
  const post = new THREE.Mesh(new THREE.TubeGeometry(path, 16, .006, 4));
  lamp.add(rackPost, tray, post);
  const { setProgress } = nook.makeVisitorWishTag(lamp, post);
  return {
    nook, lamp, setProgress, post, rackPost, tray,
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

test('the tag has an open eyelet and can reset to the tray after tying', () => {
  const { lamp, rig, tag, knot, setProgress } = visitorTag();
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
  expect(knot.visible).toBe(true);
  expect(tag.position.y).toBeLessThan(knot.position.y);

  const tiedPose = tag.position.clone();
  setProgress(1);
  expect(tag.position.equals(tiedPose)).toBe(true);
  setProgress(0);
  expect(rig.userData.state).toBe('loose');
  expect(knot.visible).toBe(false);
  expect(tag.position.y).toBeGreaterThan(.51);
});

test.each([
  ['ten-minute drum', preset(0, 10)],
  ['full-day bell', preset(2, 1440)],
  ['narrow-bottom drawing', drawn],
  ['tall narrow drawing', [{ y: 0, r: .006 }, { y: .065, r: .007 }, { y: .12, r: .006 }]],
  ['short wide drawing', [{ y: 0, r: .045 }, { y: .005, r: .048 }, { y: .012, r: .043 }]],
])('the cord encloses the rendered shade post above the tray for %s', (_name, rows) => {
  const { lamp, post, rackPost, tray, tag, cord, knot, setProgress } = visitorTag(rows);
  setProgress(1);
  lamp.updateMatrixWorld(true);
  const pos = post.geometry.getAttribute('position');
  const rings = post.geometry.tangents.map((_tangent, i) => {
    const points = [0, 1, 2, 3].map(j => V3().fromBufferAttribute(pos, i * 5 + j));
    const center = points.reduce((sum, point) => sum.add(point), V3()).multiplyScalar(.25);
    return { center, points, tangent: post.geometry.tangents[i] };
  });
  // Use the rendered vertices, not the path sampled by the implementation.
  const attached = rings.find(ring => ring.center.distanceTo(knot.position) < 1e-6);
  expect(attached).toBeDefined();
  const wrap = knot.children[0];
  const { radius, tube } = wrap.geometry.parameters;
  const woodRadius = Math.max(...attached.points.map(point => point.distanceTo(attached.center)));
  const wrapAxis = V3(0, 1, 0).applyQuaternion(knot.quaternion);
  expect(wrapAxis.dot(attached.tangent)).toBeGreaterThan(.99999);
  expect(radius - tube).toBeLessThanOrEqual(woodRadius);
  expect(radius + tube).toBeGreaterThan(woodRadius);
  const trayBounds = new THREE.Box3().setFromObject(tray);
  expect(knot.position.y).toBeGreaterThan(trayBounds.max.y + .008);
  expect(new THREE.Box3().setFromObject(rackPost).containsPoint(knot.position)).toBe(false);
  expect(tag.position.z).toBeLessThan(-.13);
  const flame = new THREE.Line3(V3(0, .536, 0), V3(0, .576, 0));
  expect(flame.closestPointToPoint(knot.position, true, V3()).distanceTo(knot.position)).toBeGreaterThanOrEqual(.028);
  for (const strand of cord.children.slice(0, 4)) {
    for (const y of [-.5, -.25, 0, .25, .5]) {
      expect(trayBounds.containsPoint(strand.localToWorld(V3(0, y, 0)))).toBe(false);
    }
  }
  for (const strand of [cord.children[1], cord.children[3]]) {
    const end = knot.worldToLocal(strand.localToWorld(V3(0, .5, 0)));
    expect(Math.hypot(end.x, end.z)).toBeCloseTo(radius, 6);
    expect(end.y).toBeCloseTo(0, 8);
  }
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
