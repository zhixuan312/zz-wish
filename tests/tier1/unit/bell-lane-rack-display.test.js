import { expect, test } from 'vitest';
import * as THREE from 'three';
import { bellLaneCameras } from '../../../web/src/engine/places/bell-lane-camera.js';
import { bellLaneRack, bellLaneTransfer } from '../../../web/src/engine/places/bell-lane-rack.js';
import { bellLaneRackDisplay, makeBellLaneSavedTag } from '../../../web/src/engine/places/bell-lane-rack-display.js';
import { PRESET_SHAPES, sizedPreset } from '../../../shared/rules.ts';

const V3 = (...xyz) => new THREE.Vector3(...xyz);
const drum = minutes => sizedPreset(PRESET_SHAPES.shade[0].rows, minutes);

function latticeFixture(rows, slot, tagSide) {
  const lamp = new THREE.Group();
  lamp.position.y = .46;
  if (slot) bellLaneTransfer(slot, 1, lamp.position);
  const scale = Math.max(1.8, .05 / Math.max(...rows.map(row => row.r)));
  const rings = rows.map(({ r, y }) => [Math.max(.002, r * scale), .52 + y * scale]);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(.26, .02, .26));
  tray.position.y = .5;
  const geometry = new THREE.LatheGeometry(rings.map(([r, y]) => new THREE.Vector2(Math.SQRT2 * r, y)), 4);
  const faces = Array.from(geometry.index.array);
  const sideSize = 6 * (rings.length - 1);
  faces.splice(sideSize, sideSize);
  geometry.setIndex(faces);
  const shell = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  shell.rotation.y = Math.PI / 4;
  lamp.add(tray, shell);
  if (tagSide) {
    const path = new THREE.CatmullRomCurve3(rings.map(([r, y]) => V3(r, y, -r)));
    const post = new THREE.Mesh(new THREE.TubeGeometry(path, 16, .006, 4));
    lamp.add(post);
    makeBellLaneSavedTag({ THREE, grainTex: null }, lamp, post, tagSide).setProgress(1);
  }
  lamp.updateMatrixWorld(true);
  return { lamp, tray, shell, tag: lamp.getObjectByName('Bell Lane visitor tag') };
}

test('rack display hints preserve every saved ID, slot, and next address', () => {
  const lamps = Array.from({ length: 12 }, (_, id) => Object.freeze({ id, remaining: .6 }));
  for (let count = 0; count <= lamps.length; count++) {
    const history = lamps.slice(0, count);
    const original = bellLaneRack(history);
    const display = bellLaneRackDisplay(history);
    expect(display.next).toBe(original.next);
    expect(display.previous.map(({ lamp: { id }, slot }) => ({ id, slot }))).toEqual(
      original.previous.map(({ lamp: { id }, slot }) => ({ id, slot })),
    );
    expect(display.previous.every(({ lamp }) => Math.abs(lamp.rackDisplay) === 1)).toBe(true);
  }
});

test.each([[1440, 900, 'choose'], [390, 844, 'choosePhone']])(
  'the saved tags remain separated and visible around the current shade at %d×%d',
  (width, height, view) => {
    const { previous } = bellLaneRackDisplay([{ id: 'second' }, { id: 'first' }]);
    const [left, right] = previous.map(({ lamp, slot }, i) => latticeFixture(drum(i === 0 ? 10 : 30), slot, lamp.rackDisplay));
    const current = latticeFixture(drum(30));
    const pose = bellLaneCameras(V3)[view];
    const camera = new THREE.PerspectiveCamera(pose.fov, width / height);
    camera.position.copy(pose.pos);
    camera.lookAt(pose.look);
    camera.updateMatrixWorld();
    const x = item => item.getWorldPosition(V3()).project(camera).x;
    expect(x(left.tag)).toBeLessThan(x(current.tray) - .08);
    expect(x(right.tag)).toBeGreaterThan(x(current.tray) + .08);
    for (const [detail, other] of [[left, right], [right, left]]) {
      let openRays = 0;
      for (const dx of [-.016, -.008, 0, .008, .016]) {
        for (const dy of [-.027, -.009, .009, .025]) {
          const point = detail.tag.localToWorld(V3(dx, dy, -.002));
          const direction = point.clone().sub(pose.pos);
          const ray = new THREE.Raycaster(pose.pos, direction.clone().normalize(), 0, direction.length() - .001);
          if (!ray.intersectObjects([current.tray, current.shell, other.tray, other.shell], false).length) openRays++;
        }
      }
      expect(openRays).toBeGreaterThanOrEqual(16);
    }
  },
);

test('the outward tie grips the opposite physical post and remains blank and non-emissive', () => {
  const { lamp, tag } = latticeFixture(drum(30), null, -1);
  const knot = lamp.getObjectByName('Bell Lane wish tag knot');
  const post = lamp.children.find(object => object.geometry?.type === 'TubeGeometry');
  const matchingFrontPost = post.geometry.parameters.path.getSpacedPoints(16)
    .map(point => lamp.localToWorld(V3(-point.x, point.y, point.z)));
  const center = knot.getWorldPosition(V3());
  expect(matchingFrontPost.some(point => point.distanceTo(center) < 1e-6)).toBe(true);
  expect(tag.material.emissive.getHex()).toBe(0);
  expect(tag.material.emissiveMap).toBeNull();
  expect(tag.getWorldPosition(V3()).x).toBeLessThan(0);
});

test('saved tag boards clear the next tray along all five transfer paths', () => {
  const records = Array.from({ length: 9 }, (_, id) => ({ id }));
  for (let count = 5; count <= records.length; count++) {
    const { previous, next } = bellLaneRackDisplay(records.slice(0, count));
    const tagBounds = previous.map(({ lamp, slot }) => new THREE.Box3().setFromObject(
      latticeFixture(drum(1440), slot, lamp.rackDisplay).tag,
    ));
    for (let frame = 0; frame <= 100; frame++) {
      const center = V3();
      bellLaneTransfer(next, frame / 100, center);
      center.y += .5;
      const movingTray = new THREE.Box3().setFromCenterAndSize(center, V3(.26, .02, .26));
      expect(tagBounds.every(bounds => !bounds.intersectsBox(movingTray))).toBe(true);
    }
  }
});


test.each([[1440, 900, 'choose', 0], [390, 844, 'choosePhone', 24]])(
  'a tall chooser shade leaves both saved paper bodies visible at %d×%d',
  (width, height, view, minimumPaperWidth) => {
    const { previous } = bellLaneRackDisplay([{ id: 'tall' }, { id: 'drum' }]);
    const tall = sizedPreset(PRESET_SHAPES.shade[1].rows, 10);
    const current = latticeFixture(tall);
    const [left, right] = previous.map(({ slot, lamp }, i) =>
      latticeFixture(i === 0 ? tall : drum(30), slot, lamp.rackDisplay));
    const pose = bellLaneCameras(V3)[view];
    const camera = new THREE.PerspectiveCamera(pose.fov, width / height);
    camera.position.copy(pose.pos);
    camera.lookAt(pose.look);
    camera.updateMatrixWorld();
    const solids = [current, left, right].flatMap(({ tray, shell }) => [tray, shell]);
    for (const { shell } of [left, right]) {
      const projected = [];
      const points = shell.geometry.getAttribute('position');
      for (let i = 0; i < points.count; i++) {
        projected.push(V3().fromBufferAttribute(points, i).applyMatrix4(shell.matrixWorld).project(camera));
      }
      const [minX, maxX] = [Math.min, Math.max].map(fn => fn(...projected.map(point => point.x)));
      const [minY, maxY] = [Math.min, Math.max].map(fn => fn(...projected.map(point => point.y)));
      const ray = new THREE.Raycaster();
      const samples = 25;
      const columnWidth = (maxX - minX) * width / (2 * samples);
      let silhouette = 0, clear = 0;
      const paperWidths = [];
      for (let row = 0; row < samples; row++) {
        let run = 0;
        let longestRun = 0;
        for (let column = 0; column < samples; column++) {
          const x = THREE.MathUtils.lerp(minX, maxX, (column + .5) / samples);
          const y = THREE.MathUtils.lerp(minY, maxY, (row + .5) / samples);
          ray.setFromCamera(new THREE.Vector2(x, y), camera);
          const hitsPaper = ray.intersectObject(shell, false).length > 0;
          if (hitsPaper) silhouette++;
          if (hitsPaper && Math.abs(x) < 1 && Math.abs(y) < 1 && ray.intersectObjects(solids, false)[0]?.object === shell) {
            clear++;
            run++;
            longestRun = Math.max(longestRun, run);
          } else {
            run = 0;
          }
        }
        paperWidths.push(longestRun * columnWidth);
      }
      expect(clear / silhouette).toBeGreaterThan(.30);
      // A wide strip at the very top can pass an area check while the body
      // still reads as a narrow edge. Measure the middle of each shade.
      const outerRows = Math.floor(samples / 4);
      const middleWidths = paperWidths.slice(outerRows, samples - outerRows).sort((a, b) => a - b);
      expect(middleWidths[Math.floor(middleWidths.length / 2)]).toBeGreaterThan(minimumPaperWidth);
    }
  },
);
