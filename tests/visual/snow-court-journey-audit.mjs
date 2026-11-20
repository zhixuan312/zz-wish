import assert from 'node:assert/strict';

const maximumBlockedPoints = 3;
const desktopMaximumEntryYaw = 185;
const desktopMaximumEntryView = 185;
const desktopMaximumEntryRate = 20;
const desktopMinimumTurnSeconds = 9;
const desktopActiveYawRate = 1;
const desktopMinimumPoseHoldSeconds = 1;
const phoneMaximumEntryYaw = 145;
const phoneMaximumEntryYawRate = 25;
const angleEpsilon = 1e-8;
const poseEpsilon = 1e-6;
const poseDirectionEpsilon = 2e-6;
// The renderer applies lens changes beyond .001 degrees. A resize can sync
// the remaining fraction to the same authored lens on a chooser draw.
const poseFovEpsilon = .001;
const secondsEpsilon = 1e-8;
const degreesPerRadian = 180 / Math.PI;
const earlierLanternSlots = [-3, -2, -1, 1, 2, 3];
const minimumVisibleLanternRays = 2;
const minimumWalkFraction = .5;
const burnDistanceMetres = [1, 1.4];
const burnShadeHeightFraction = [.25, .35];
const maximumEarlierShadeHeightRatio = .70;
const maximumUnobservedDrawSeconds = .15;

// Installed only by the visual capture. Record pose immediately after the
// real draw and defer the geometry work until after the live walk.
export function installSnowCourtJourneyAudit() {
  let recording;
  let earlierBurnCloth;
  const earlierCloth = /^(Sun-faded rose-red gauze|Faded dusty rose gauze|Faded iron-red gauze|Thin gauze over low flame)$/;
  const rowSlots = [-3, -2, -1, 1, 2, 3];
  const rowSlot = (x, centre) => Math.round((x - centre) / .34);
  window.__startSnowCourtJourneyAudit = () => { recording = { frames: [], visitorGeometry: [], entryDraws: {} }; };
  window.__markSnowCourtJourneyEntry = boundary => {
    if (recording) recording.entryDraws[boundary] = recording.frames.length;
  };
  window.__sampleSnowCourtJourneyAudit = (THREE, renderer, camera, baked, lamp, phase, walk, walkClock, ignition, renderTimeMs) => {
    if (!recording || !baked || !walk || recording.complete || recording.luminanceError) return;
    const walkSeconds = walkClock?.id === 'snow-roof' ? walkClock.seconds : undefined;
    if (!recording.frames.length && (phase !== 'travel' || !Number.isFinite(walkSeconds))) return;
    recording.THREE = THREE;
    recording.baked = baked;
    const timestamp = (performance.timeOrigin + performance.now()) / 1000;
    const cloth = lamp?.g.visible && lamp.parts?.g.visible
      ? lamp.parts.g.children.find(mesh => mesh.visible && mesh.userData.visitorCloth) : null;
    let visitor;
    if (cloth) {
      let index = recording.visitorGeometry.indexOf(cloth);
      if (index === -1) index = recording.visitorGeometry.push(cloth) - 1;
      visitor = { index, matrix: cloth.matrixWorld.toArray() };
    }
    const screen = document.querySelector('.ui')?.dataset.screen;
    const controls = screen === 'candle' ? document.querySelector('.candle-sheet')
      : screen === 'burning' ? document.querySelector('.hud-bottom') : null;
    const rect = controls?.getBoundingClientRect();
    const [anchorX, anchorY, anchorZ] = baked.manifest.lampBasis.position;
    const radiusMetres = Math.hypot(camera.position.x - anchorX, camera.position.z - anchorZ);
    const frame = {
      timestamp, renderTimeMs, phase, screen, walk, walkSeconds, ignition: ignition ?? null,
      controls: rect && [rect.left / innerWidth, rect.top / innerHeight, rect.right / innerWidth, rect.bottom / innerHeight],
      position: camera.position.toArray(), rotation: camera.quaternion.toArray(),
      fovDegrees: camera.fov, radiusMetres, distanceMetres: Math.hypot(radiusMetres, camera.position.y - anchorY),
      inverseProjection: camera.projectionMatrixInverse.toArray(), near: camera.near,
      direction: camera.getWorldDirection(new THREE.Vector3()).toArray(), visitor,
    };
    recording.frames.push(frame);
    try {
      recording.luminance ??= window.__createSnowCourtDrawLuminance(THREE, renderer);
      recording.luminance.capture(frame);
    } catch (error) {
      recording.luminanceError = error;
      return;
    }
    if (ignition === 'settled') {
      recording.settledAt ??= timestamp;
      if (timestamp - recording.settledAt >= .6) recording.complete = true;
    }
  };
  window.__snowCourtJourneyComplete = () => !!(recording?.complete || recording?.luminanceError);
  window.__finishSnowCourtJourneyAudit = async () => {
    if (recording?.luminanceError) {
      const error = recording.luminanceError;
      await recording.luminance?.finish().catch(() => {});
      recording = null;
      throw error;
    }
    if (!recording?.complete) throw new Error('Snow Court journey pose trace did not reach settled burning.');
    const { THREE, baked, frames, settledAt, visitorGeometry, luminance, entryDraws } = recording;
    recording = null;
    const drawLuminanceSource = await luminance.finish();
    if (!frames.every(frame => Number.isFinite(frame.luminance))) {
      throw new Error('A Snow Court live draw has no pre-UI luminance readback.');
    }
    const rayDistance = 1.2;
    const pathBounds = new THREE.Box3().setFromPoints(frames.map(frame => new THREE.Vector3(...frame.position)))
      .expandByScalar(rayDistance);
    const minimumClothOpacity = .70;
    // The delivered GLB can batch multiple old shades into one material. Count
    // actual cloth at the six authored 0.34 m positions beside the free cord.
    const rowCentre = baked.manifest.lampBasis.position[0];
    const earlierVertices = new Map(rowSlots.map(slot => [slot, new Map()]));
    const vertices = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const bounds = new THREE.Box3();
    // Needles are shipped as another GLB next to the baked model. Recognize
    // the artist's mesh metadata without changing anything in the live scene.
    const crowns = new Set();
    for (const sibling of baked.group.parent.children) {
      if (sibling === baked.group) continue;
      sibling.traverseVisible(object => {
        if (object.userData.snow_court_needle_crowns !== true) return;
        // A glTF with two materials keeps the mark on the parent node.
        object.traverseVisible(mesh => { if (mesh.isMesh) crowns.add(mesh); });
      });
    }
    if (!crowns.size) throw new Error('Expected a separate authored Snow Court needle-crown mesh.');
    function collect(mesh, transform, clip, source, output) {
      const { geometry, material } = mesh;
      const mirrored = transform.determinant() < 0;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (clip && !bounds.copy(geometry.boundingBox).applyMatrix4(transform).intersectsBox(clip)) return;
      const { position } = geometry.attributes;
      const index = geometry.index;
      const size = index?.count ?? position.count;
      const groups = Array.isArray(material) ? geometry.groups : [{ start: 0, count: size, materialIndex: 0 }];
      for (const group of groups) {
        const surface = Array.isArray(material) ? material[group.materialIndex] : material;
        const earlier = earlierCloth.test(surface.name);
        const cloth = mesh.userData.visitorCloth || earlier;
        if (!surface.visible || (surface.transparent && (!cloth || surface.opacity < minimumClothOpacity))) continue;
        const start = Math.max(geometry.drawRange.start, group.start);
        const end = Math.min(size, geometry.drawRange.start + geometry.drawRange.count, group.start + group.count);
        for (let i = start; i + 2 < end; i += 3) {
          for (let j = 0; j < 3; j++) {
            vertices[j].fromBufferAttribute(position, index ? index.getX(i + j) : i + j).applyMatrix4(transform);
          }
          bounds.setFromPoints(vertices);
          if (clip && !bounds.intersectsBox(clip)) continue;
          const worldVertices = (mirrored ? [vertices[0], vertices[2], vertices[1]] : vertices)
            .map(vertex => vertex.clone());
          let earlierSlot;
          if (earlier) {
            const x = worldVertices.reduce((sum, vertex) => sum + vertex.x, 0) / 3;
            earlierSlot = rowSlot(x, rowCentre);
            const mounted = earlierVertices.get(earlierSlot);
            if (!mounted) throw new Error('Earlier Snow Court cloth escaped its side of the free cord.');
            for (const vertex of worldVertices) mounted.set(vertex.toArray().join(','), vertex);
          }
          output.push({
            vertices: worldVertices, bounds: bounds.clone(), source,
            side: surface.side, material: surface.name, mesh: mesh.name, earlierSlot,
            ...(cloth ? { clothOpacity: surface.opacity } : {}),
          });
        }
      }
    }
    const obstacles = [];
    baked.group.traverseVisible(mesh => {
      if (mesh.isMesh) collect(mesh, mesh.matrixWorld, pathBounds, 'baked-model', obstacles);
    });
    const bakedTriangles = obstacles.length;
    const localCrown = new THREE.Matrix4();
    const worldCrown = new THREE.Matrix4();
    for (const mesh of crowns) {
      if (!mesh.isInstancedMesh) {
        collect(mesh, mesh.matrixWorld, pathBounds, 'needle-crowns', obstacles);
        continue;
      }
      for (let index = 0; index < mesh.count; index++) {
        mesh.getMatrixAt(index, localCrown);
        worldCrown.multiplyMatrices(mesh.matrixWorld, localCrown);
        collect(mesh, worldCrown, pathBounds, 'needle-crowns', obstacles);
      }
    }
    const needleTriangles = obstacles.length - bakedTriangles;
    if (!bakedTriangles || !needleTriangles) throw new Error('The journey raycast must cover both baked model and needle crowns.');
    const visitorTrees = visitorGeometry.map(cloth => {
      const triangles = [];
      collect(cloth, new THREE.Matrix4(), null, 'visitor-cloth', triangles);
      return triangles.length ? partition(triangles) : null;
    });
    function partition(triangles) {
      const box = new THREE.Box3();
      for (const triangle of triangles) box.union(triangle.bounds);
      if (triangles.length <= 16) return { box, triangles };
      const size = box.getSize(new THREE.Vector3());
      const axis = size.x >= Math.max(size.y, size.z) ? 'x' : size.y >= size.z ? 'y' : 'z';
      const centreTwice = triangle => triangle.bounds.min[axis] + triangle.bounds.max[axis];
      triangles.sort((a, b) => centreTwice(a) - centreTwice(b));
      const middle = triangles.length >> 1;
      return { box, left: partition(triangles.slice(0, middle)), right: partition(triangles.slice(middle)) };
    }
    const tree = partition(obstacles);
    const ray = new THREE.Ray();
    const clothInverse = new THREE.Matrix4();
    const clothInverseLinear = new THREE.Matrix3();
    const cameraOrigin = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const inverseProjection = new THREE.Matrix4();
    const hit = new THREE.Vector3();
    const boundsHit = new THREE.Vector3();
    let nearest;
    function cast({ box, triangles, left, right }, far, near) {
      if (!box.containsPoint(ray.origin) &&
          (!ray.intersectBox(box, boundsHit) || ray.origin.distanceToSquared(boundsHit) >= far ** 2)) return far;
      if (!triangles) return cast(right, cast(left, far, near), near);
      for (const triangle of triangles) {
        const [a, b, c] = triangle.vertices;
        const intersection = triangle.side === THREE.BackSide ? ray.intersectTriangle(c, b, a, true, hit)
          : ray.intersectTriangle(a, b, c, triangle.side === THREE.FrontSide, hit);
        if (!intersection) continue;
        const distance = ray.origin.distanceTo(hit);
        if (distance < near || distance >= far) continue;
        far = distance;
        const { source, material, mesh, clothOpacity, earlierSlot } = triangle;
        nearest = { distance, source, material, mesh, earlierSlot, ...(clothOpacity === undefined ? {} : { clothOpacity }) };
      }
      return far;
    }
    function pointHit(x, y, nearPlane, farPlane, clothTree) {
      direction.set(x, y, .5).applyMatrix4(inverseProjection).normalize().applyQuaternion(rotation);
      const facing = direction.dot(forward);
      const near = nearPlane / facing;
      ray.set(cameraOrigin, direction);
      nearest = null;
      const far = cast(tree, farPlane, near);
      if (clothTree) {
        const hitStatic = nearest;
        ray.origin.applyMatrix4(clothInverse);
        ray.direction.applyMatrix3(clothInverseLinear);
        const distanceScale = ray.direction.length();
        ray.direction.divideScalar(distanceScale);
        nearest = null;
        cast(clothTree, far * distanceScale, near * distanceScale);
        if (nearest) nearest.distance /= distanceScale;
        else nearest = hitStatic;
      }
      return nearest;
    }
    const clipFromWorld = new THREE.Matrix4();
    const projection = new THREE.Matrix4();
    const worldFromCamera = new THREE.Matrix4();
    const unitScale = new THREE.Vector3(1, 1, 1);
    const local = new THREE.Vector3();
    const projected = new THREE.Vector3();
    const rowBounds = new THREE.Box2();
    const point = new THREE.Vector2();
    const rowRayFractions = [.24, .5, .76];
    function measureEarlierRow(frame, clothTree) {
      projection.copy(inverseProjection).invert();
      worldFromCamera.compose(cameraOrigin, rotation, unitScale).invert();
      clipFromWorld.multiplyMatrices(projection, worldFromCamera);
      return Array.from(earlierVertices, ([slot, cloth]) => {
        rowBounds.makeEmpty();
        let clipped = false;
        let furthest = 0;
        for (const vertex of cloth.values()) {
          local.subVectors(vertex, cameraOrigin);
          if (local.dot(forward) < frame.near) {
            clipped = true;
            continue;
          }
          projected.copy(vertex).applyMatrix4(clipFromWorld);
          clipped ||= projected.z > 1;
          rowBounds.expandByPoint(point.set((projected.x + 1) / 2, (1 - projected.y) / 2));
          furthest = Math.max(furthest, local.length());
        }
        if (rowBounds.isEmpty()) return { slot, bounds: null, fullyFramed: false, visibleRays: 0 };
        const { min, max } = rowBounds;
        const x0 = Math.max(0, min.x), x1 = Math.min(1, max.x);
        const y0 = Math.max(0, min.y), y1 = Math.min(1, max.y);
        const fullyFramed = !clipped && x0 === min.x && x1 === max.x && y0 === min.y && y1 === max.y;
        let visibleRays = 0;
        if (x0 < x1 && y0 < y1) {
          for (const sx of rowRayFractions) for (const sy of rowRayFractions) {
            const x = x0 + (x1 - x0) * sx;
            const y = y0 + (y1 - y0) * sy;
            const ui = frame.controls;
            if (ui && x >= ui[0] && x <= ui[2] && y >= ui[1] && y <= ui[3]) continue;
            if (pointHit(2 * x - 1, 1 - 2 * y, frame.near, furthest + .002, clothTree)?.earlierSlot === slot) visibleRays++;
          }
        }
        return { slot, bounds: [min.toArray(), max.toArray()], fullyFramed, visibleRays };
      });
    }
    const mark = name => (performance.timeOrigin + performance.getEntriesByName(name).at(-1)?.startTime) / 1000;
    const entryStart = mark('snow-p1:entry-start'), entryEnd = mark('snow-p1:entry-end');
    let visitorClothFrames = 0;
    const ndcPoints = [-2 / 3, 0, 2 / 3].flatMap(y => [-2 / 3, 0, 2 / 3].map(x => [x, y]));
    for (const [draw, frame] of frames.entries()) {
      cameraOrigin.fromArray(frame.position);
      rotation.fromArray(frame.rotation);
      forward.fromArray(frame.direction);
      inverseProjection.fromArray(frame.inverseProjection);
      const clothTree = frame.visitor && visitorTrees[frame.visitor.index];
      if (clothTree) {
        visitorClothFrames++;
        clothInverse.fromArray(frame.visitor.matrix).invert();
        clothInverseLinear.setFromMatrix4(clothInverse);
      }
      frame.hits = ndcPoints.map(([x, y]) => pointHit(x, y, frame.near, rayDistance, clothTree));
      frame.centre = frame.hits[4];
      frame.blockedPoints = frame.hits.filter(Boolean).length;
      if ((draw >= entryDraws.start && draw < entryDraws.end) ||
        (frame.screen === 'candle' && frame.ignition === null) || frame.ignition === 'settled') {
        frame.earlierLanterns = measureEarlierRow(frame, clothTree);
      }
      delete frame.rotation;
      delete frame.inverseProjection;
      delete frame.near;
      delete frame.visitor;
    }
    return { frames, settledAt, rayDistance, ndcPoints, bakedTriangles, needleTriangles, drawLuminanceSource,
      lampBasis: baked.manifest.lampBasis.position,
      needleMeshNames: Array.from(crowns, mesh => mesh.name), visitorClothVariants: visitorTrees.filter(Boolean).length, visitorClothFrames,
      minimumClothOpacity,
      rayScope: 'Visible baked model and separately loaded crowns, plus each draw’s visitor cloth transform. Counts opaque triangles and old/new cloth with material opacity at least 0.70, respecting near clipping and sidedness.',
      earlierClothVertices: Object.fromEntries(Array.from(earlierVertices, ([slot, cloth]) => [slot, cloth.size])),
      entryStart, entryEnd, entryDraws };
  };

  // Append the actual shade only to the existing settled projection trace.
  // The cloth range excludes the cord, hoops, tassel, flame, and UI.
  window.__sampleSnowCourtBurnComposition = (THREE, camera, lamp, baked) => {
    const frame = window.__snowLanternAudit?.frames.at(-1);
    if (frame?.screen !== 'burning' || frame.ignition !== 'settled' || frame.burnComposition || !frame.visible) return;
    const cloth = lamp.parts.g.children.find(mesh => mesh.visible && mesh.userData.visitorCloth);
    if (!cloth) return;
    const vertices = cloth.geometry.attributes.position;
    const worldToClip = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const localToClip = worldToClip.clone().multiply(cloth.matrixWorld);
    const bounds = new THREE.Box3();
    const local = new THREE.Vector3(), world = new THREE.Vector3(), ndc = new THREE.Vector3();
    let lowest = Infinity, highest = -Infinity;
    for (let i = 0; i < vertices.count; i++) {
      local.fromBufferAttribute(vertices, i);
      bounds.expandByPoint(world.copy(local).applyMatrix4(cloth.matrixWorld));
      const projectedY = ndc.copy(local).applyMatrix4(localToClip).y;
      lowest = Math.min(lowest, projectedY);
      highest = Math.max(highest, projectedY);
    }
    const centre = bounds.getCenter(new THREE.Vector3());
    if (!earlierBurnCloth) {
      const rowCentre = baked.manifest.lampBasis.position[0];
      earlierBurnCloth = new Map(rowSlots.map(slot => [slot, new Map()]));
      baked.group.traverseVisible(mesh => {
        if (!mesh.isMesh || ![mesh.material].flat().some(material => earlierCloth.test(material.name))) return;
        const positions = mesh.geometry.attributes.position;
        const count = mesh.geometry.index?.count ?? positions.count;
        for (let i = 0; i < count; i++) {
          const index = mesh.geometry.index?.getX(i) ?? i;
          world.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
          const mounted = earlierBurnCloth.get(rowSlot(world.x, rowCentre));
          if (!mounted) throw new Error('Earlier Snow Court cloth escaped its side of the free cord.');
          mounted.set(world.toArray().join(','), world.clone());
        }
      });
    }
    const heightFraction = (highest - lowest) / 2;
    const earlier = Array.from(earlierBurnCloth, ([slot, points]) => {
      let low = Infinity, high = -Infinity, inFront = true;
      for (const point of points.values()) {
        inFront &&= local.copy(point).applyMatrix4(camera.matrixWorldInverse).z < -camera.near;
        const y = ndc.copy(point).applyMatrix4(worldToClip).y;
        low = Math.min(low, y);
        high = Math.max(high, y);
      }
      const projectedHeight = points.size && inFront ? (high - low) / 2 : null;
      return { slot, vertices: points.size, heightFraction: projectedHeight };
    });
    frame.burnComposition = {
      vertices: vertices.count, centre: centre.toArray(), distanceMetres: camera.position.distanceTo(centre),
      heightFraction, earlier,
    };
  };
}

// Decode the actual Chromium compositor JPEGs after recording. This reads
// neither scene materials nor exposure uniforms and includes product UI.
export async function snowCourtPresentedLuminance(encodedFrames) {
  const canvas = new OffscreenCanvas(48, 36);
  const pixels = canvas.getContext('2d', { willReadFrequently: true });
  pixels.imageSmoothingQuality = 'high';
  const measured = [];
  for (const encoded of encodedFrames) {
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    try {
      pixels.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const { data } = pixels.getImageData(0, 0, canvas.width, canvas.height);
      let luminance = 0;
      for (let i = 0; i < data.length; i += 4) luminance += .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
      measured.push(luminance / (canvas.width * canvas.height));
    } finally {
      bitmap.close();
    }
  }
  return measured;
}

export function snowCourtWalkDraws({ frames, entryStart, entryDraws }, durationSeconds) {
  const isWalk = frame => frame.phase === 'travel' && frame.walk === 'walking'
    && frame.walkSeconds >= 0 && frame.walkSeconds <= durationSeconds;
  // The entry callback follows the final walk draw in execution order,
  // even if both observations land in the same clock quantum.
  const walk = frames.slice(0, entryDraws.start).filter(isWalk);
  const legacy = walk.filter(frame => frame.timestamp < entryStart);
  const coverage = {
    drawCount: walk.length,
    firstWalkSeconds: walk[0]?.walkSeconds ?? null,
    lastWalkSeconds: walk.at(-1)?.walkSeconds ?? null,
    lastWalkTimestamp: walk.at(-1)?.timestamp ?? null,
    entryStartTimestamp: entryStart,
    entryStartDraw: entryDraws.start,
    legacyDrawCount: legacy.length,
    legacyLastWalkSeconds: legacy.at(-1)?.walkSeconds ?? null,
  };
  assert(walk.length > 120 && walk[0].walkSeconds < .5 && walk.at(-1).walkSeconds >= durationSeconds - .01,
    'Expected a continuous draw trace for the complete authored Snow Court walk. ' + JSON.stringify(coverage));
  return { walk, coverage };
}

function viewAngle(a, b) {
  const [ax, ay, az] = a, [bx, by, bz] = b;
  const cross = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  return Math.atan2(cross, ax * bx + ay * by + az * bz) * degreesPerRadian;
}

function sameEntryPose(a, b) {
  const offset = Math.hypot(...a.position.map((value, axis) => value - b.position[axis]));
  return offset <= poseEpsilon && viewAngle(a.direction, b.direction) <= poseDirectionEpsilon
    && Math.abs(a.fovDegrees - b.fovDegrees) <= poseFovEpsilon;
}

function desktopEntryHold(frames, firstEntryDraw, boundaryEnd, firstChooserDraw, failures) {
  if (firstChooserDraw < 0) {
    failures.push({ kind: 'missingEntryChooser' });
    return null;
  }
  if (firstChooserDraw < boundaryEnd) failures.push({ kind: 'entryChooserBeforeEnd', firstChooserDraw, boundaryEnd });
  const lastHoldDraw = firstChooserDraw - 1;
  const heldPose = frames[lastHoldDraw];
  let firstHoldDraw = lastHoldDraw;
  while (firstHoldDraw > firstEntryDraw && sameEntryPose(frames[firstHoldDraw - 1], heldPose)) firstHoldDraw--;
  // Stop strictly before the chooser. The opening draw can expose a pose
  // jump. It cannot add time to the evidence for a pre-chooser hold.
  const seconds = (heldPose.renderTimeMs - frames[firstHoldDraw].renderTimeMs) / 1000;
  if (!Number.isFinite(seconds) || seconds + secondsEpsilon < desktopMinimumPoseHoldSeconds) {
    failures.push({ kind: 'entryPoseHold', actual: seconds, minimum: desktopMinimumPoseHoldSeconds });
  }
  let lastChooserDraw = firstChooserDraw;
  while (frames[lastChooserDraw + 1]?.screen === 'candle' && frames[lastChooserDraw + 1].ignition === null) lastChooserDraw++;
  const jump = frames.slice(firstChooserDraw, lastChooserDraw + 1).findIndex(frame => !sameEntryPose(frame, heldPose));
  if (jump >= 0) failures.push({ kind: 'entryPoseJump', draw: firstChooserDraw + jump, lastHoldDraw });
  return { seconds, firstHoldDraw, lastHoldDraw, firstChooserDraw, lastChooserDraw };
}

function entryCameraSummary(frames, boundary, phone, failures) {
  // Start at the last draw before the entry callback. Desktop motion must
  // finish before the UI appears, even if its callback and that draw differ.
  const firstDraw = boundary.start - 1;
  const firstChooser = phone ? -1 : frames.findIndex((frame, index) => index >= boundary.start && frame.screen === 'candle');
  const lastDraw = Math.max(boundary.end, firstChooser);
  const entry = frames.slice(firstDraw, lastDraw + 1);
  const headings = entry.map(frame => Math.atan2(frame.direction[0], -frame.direction[2]));
  const maximumEntryYaw = phone ? phoneMaximumEntryYaw : desktopMaximumEntryYaw;
  const maximumEntryYawRate = phone ? phoneMaximumEntryYawRate : desktopMaximumEntryRate;
  let entryYaw = 0, entryView = 0, peakYawRate = 0, peakViewRate = 0;
  let activeTurnSeconds = 0, activeIntervals = 0, firstTurningDraw, lastTurningDraw;
  const firstDrawOutsideTurn = firstChooser >= 0 ? firstChooser : boundary.end;
  for (let i = 1; i < entry.length; i++) {
    const delta = headings[i] - headings[i - 1];
    const yaw = Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) * degreesPerRadian;
    const view = phone ? yaw : viewAngle(entry[i - 1].direction, entry[i].direction);
    const dt = (entry[i].renderTimeMs - entry[i - 1].renderTimeMs) / 1000;
    entryYaw += yaw;
    entryView += view;
    if (Number.isFinite(dt) && dt > 0) {
      const yawRate = yaw / dt;
      peakYawRate = Math.max(peakYawRate, yawRate);
      peakViewRate = Math.max(peakViewRate, view / dt);
      const draw = firstDraw + i;
      // Small horizon recentering and pauses cannot make a short main turn
      // count as a slow one. Count only substantive turn intervals before UI.
      if (!phone && draw < firstDrawOutsideTurn && yawRate > desktopActiveYawRate + angleEpsilon) {
        activeTurnSeconds += dt;
        activeIntervals++;
        firstTurningDraw ??= draw;
        lastTurningDraw = draw;
      }
    } else if (!Number.isFinite(dt) || dt < 0 || Math.max(yaw, view) > angleEpsilon) {
      failures.push({ kind: 'invalidEntryDrawTime', index: firstDraw + i, dtSeconds: dt });
    }
  }
  if (entryYaw > maximumEntryYaw + angleEpsilon) failures.push({ kind: 'entryYaw', actual: entryYaw, maximum: maximumEntryYaw });
  if (peakYawRate > maximumEntryYawRate + angleEpsilon) {
    failures.push({ kind: 'entryYawRate', actual: peakYawRate, maximum: maximumEntryYawRate });
  }
  const limits = { maximumEntryYaw, maximumEntryYawRate };
  const entryYawTrace = {
    method: 'Sum of absolute shortest wrapped yaw deltas between actual draws bracketing the entry. Rates use the animation frame timestamps that advanced the camera.',
    firstDraw, lastDraw, drawCount: headings.length, start: frames[firstDraw].timestamp, end: frames[lastDraw].timestamp,
    initialDegrees: headings[0] * degreesPerRadian, finalDegrees: headings.at(-1) * degreesPerRadian,
    maximumDegreesPerSecond: peakYawRate,
  };
  if (!phone) {
    const turnLens = firstTurningDraw === undefined ? [] :
      frames.slice(firstTurningDraw - 1, lastTurningDraw + 1).map(frame => frame.fovDegrees);
    const turnLensRange = turnLens.length ? [Math.min(...turnLens), Math.max(...turnLens)] : [];
    if (turnLensRange.length && turnLensRange[1] - turnLensRange[0] > poseFovEpsilon) {
      failures.push({ kind: 'entryTurnFov', actual: turnLensRange, tolerance: poseFovEpsilon });
    }
    if (activeTurnSeconds + secondsEpsilon < desktopMinimumTurnSeconds) {
      failures.push({ kind: 'entryTurnSpan', actual: activeTurnSeconds, minimum: desktopMinimumTurnSeconds });
    }
    if (entryView > desktopMaximumEntryView + angleEpsilon) {
      failures.push({ kind: 'entryViewTravel', actual: entryView, maximum: desktopMaximumEntryView });
    }
    if (peakViewRate > desktopMaximumEntryRate + angleEpsilon) {
      failures.push({ kind: 'entryViewRate', actual: peakViewRate, maximum: desktopMaximumEntryRate });
    }
    Object.assign(limits, { maximumEntryView: desktopMaximumEntryView, maximumEntryViewRate: desktopMaximumEntryRate,
      minimumEntryTurnSeconds: desktopMinimumTurnSeconds, minimumEntryPoseHoldSeconds: desktopMinimumPoseHoldSeconds });
    Object.assign(entryYawTrace, { totalViewDegrees: entryView, maximumViewDegreesPerSecond: peakViewRate,
      activeTurn: {
        method: 'Sum of pre-chooser animation intervals with absolute yaw rate above 1°/s. Pauses and low-rate recentering are excluded.',
        seconds: activeTurnSeconds, intervals: activeIntervals, firstTurningDraw, lastTurningDraw, fovDegrees: turnLensRange,
      },
      poseHold: desktopEntryHold(frames, firstDraw, boundary.end, firstChooser, failures) });
  }
  return { limits, entryYaw, entryYawTrace };
}

export function snowCourtJourneySummary(geometry, presented, durationSeconds, { phone = false, desktopRow = 'full' } = {}) {
  const { frames, settledAt, entryStart, entryEnd, entryDraws: boundary } = geometry;
  assert(frames.length > 120 && frames[0].phase === 'travel' && frames.at(-1).ignition === 'settled',
    'The Snow Court geometry trace must cover the live walk through settled burning.');
  assert(Number.isFinite(entryStart) && Number.isFinite(entryEnd) && entryStart < entryEnd
    && Number.isInteger(boundary?.start) && Number.isInteger(boundary?.end)
    && boundary.start > 0 && boundary.start < boundary.end && boundary.end < frames.length,
    'The Snow Court journey trace lacks actual entry boundaries.');
  const { walk, coverage } = snowCourtWalkDraws(geometry, durationSeconds);
  assert(walk.every(frame => Number.isFinite(frame.luminance)), 'The walk baseline requires every rendered draw.');
  const referenceLuminance = walk.reduce((total, frame) => total + frame.luminance, 0) / walk.length;
  assert(referenceLuminance > 0, 'Expected a visible authored walk luminance baseline.');
  const presentedWalk = presented.filter(frame => frame.timestamp >= walk[0].timestamp && frame.timestamp < entryStart);
  assert(presentedWalk.length >= 3, 'Expected the authored walk in the independent compositor trace.');
  const presentedReferenceLuminance = presentedWalk.reduce((total, frame) => total + frame.luminance, 0) / presentedWalk.length;
  assert(presented.length > 100 && presented.some(frame => frame.timestamp >= settledAt),
    'The Snow Court compositor trace must continue through settled burning.');
  const floor = referenceLuminance * minimumWalkFraction;
  const presentedFloor = presentedReferenceLuminance * minimumWalkFraction;
  const failures = [], presentedWarnings = [];
  for (const [index, frame] of frames.entries()) {
    if (frame.blockedPoints > maximumBlockedPoints) {
      failures.push({ kind: 'nearGeometry', index, timestamp: frame.timestamp, blockedPoints: frame.blockedPoints });
    }
    if (!Number.isFinite(frame.luminance)) failures.push({ kind: 'missingDrawLuminance', index, timestamp: frame.timestamp });
    else if (frame.luminance < floor) {
      failures.push({ kind: 'lowLuminance', index, timestamp: frame.timestamp, luminance: frame.luminance });
    }
  }
  const entry = entryCameraSummary(frames, boundary, phone, failures);

  const earlierRow = earlierLanternSummary(geometry, phone, desktopRow, failures);
  let draw = 0;
  const observed = [];
  let maximumPresentedGap = 0;
  const matchedDraws = new Set();
  for (const frame of presented) {
    while (frames[draw + 1]?.timestamp <= frame.timestamp) draw++;
    const matched = { ...frame, draw, drawOffsetSeconds: frame.timestamp - frames[draw].timestamp };
    maximumPresentedGap = Math.max(maximumPresentedGap,
      observed.length ? frame.timestamp - observed.at(-1).timestamp : 0);
    observed.push(matched);
    if (frame.stamped && Math.abs(matched.drawOffsetSeconds) <= maximumUnobservedDrawSeconds) matchedDraws.add(draw);
    else presentedWarnings.push({ kind: 'unmatchedPresentedFrame', ...matched });
    if (frame.luminance < presentedFloor) presentedWarnings.push({ kind: 'lowPresentedLuminance', ...matched });
  }
  const unobservedDrawRanges = [];
  for (let i = 0; i < frames.length;) {
    if (matchedDraws.has(i)) {
      i++;
      continue;
    }
    const first = i;
    while (++i < frames.length && !matchedDraws.has(i)) {
      // Capture may coalesce isolated draws. Preserve the actual intervals
      // so the report can distinguish them from a sustained missing burst.
    }
    const last = i - 1;
    const range = { first, last, start: frames[first].timestamp, end: frames[last].timestamp };
    range.seconds = range.end - range.start;
    unobservedDrawRanges.push(range);
    if (range.seconds > maximumUnobservedDrawSeconds) presentedWarnings.push({ kind: 'compositorCaptureGap', ...range });
  }
  return { limits: { maximumBlockedPoints, ...entry.limits, minimumWalkFraction,
    minimumLuminance: floor, compositorMinimumLuminance: presentedFloor, maximumUnobservedDrawSeconds },
    referenceLuminance, presentedReferenceLuminance,
    walkBaseline: { method: 'Arithmetic mean of this context’s actual pre-UI draws from the start of the authored walk through its held reveal, before hall entry.',
      ...coverage,
      firstTimestamp: walk[0].timestamp, lastTimestamp: walk.at(-1).timestamp, compositorFrameCount: presentedWalk.length },
    entryYaw: entry.entryYaw, entryYawTrace: entry.entryYawTrace, earlierRow, geometryFrameCount: frames.length,
    drawLuminanceFrameCount: frames.filter(frame => Number.isFinite(frame.luminance)).length,
    minimumDrawLuminance: Math.min(...frames.map(frame => frame.luminance ?? Infinity)),
    maximumBlockedPoints: Math.max(...frames.map(frame => frame.blockedPoints)),
    presentedFrameCount: observed.length, distinctDrawsMatchedToCompositor: matchedDraws.size, maximumPresentedGap,
    unobservedDrawCount: frames.length - matchedDraws.size, unobservedDrawRanges,
    maximumUnobservedDrawSeconds: Math.max(0, ...unobservedDrawRanges.map(range => range.seconds)),
    drawLuminanceUnits: 'Mean 48×36 Rec.709 display code values (0–255) sampled from the final pre-UI framebuffer of every live draw.',
    compositorLuminanceSource: 'Every received Chromium compositor JPEG, averaged from a 48×36 reduction in Rec.709 display code values (0–255). Chromium may coalesce draws. Gaps in screenshots are independent of the draw luminance gate.',
    minimumPresentedLuminance: Math.min(...presented.map(frame => frame.luminance)),
    failures, presentedWarnings, presented: observed };
}

function earlierLanternSummary({ frames, earlierClothVertices, entryDraws }, phone, desktopRow, failures) {
  const slotCounts = earlierLanternSlots.map(slot => earlierClothVertices?.[slot] ?? 0);
  if (slotCounts.some(count => !count)) failures.push({ kind: 'missingEarlierLanternCloth', slotCounts });
  const measured = frames.flatMap((frame, index) => {
    if (!frame.earlierLanterns) return [];
    const visible = frame.earlierLanterns.filter(shade => shade.visibleRays >= minimumVisibleLanternRays);
    return [{ index, timestamp: frame.timestamp, screen: frame.screen, ignition: frame.ignition,
      fullyVisibleSlots: visible.filter(shade => shade.fullyFramed).map(shade => shade.slot),
      visibleSlots: visible.map(shade => shade.slot) }];
  });
  const approach = measured.filter(frame => frame.ignition === null &&
    ((frame.index >= entryDraws.start && frame.index < entryDraws.end) || frame.screen === 'candle'));
  const settled = measured.filter(frame => frame.ignition === 'settled');
  const full = frame => frame.fullyVisibleSlots.length === earlierLanternSlots.length;
  const fullApproach = approach.filter(full);
  if (phone && !fullApproach.length) failures.push({ kind: 'missingPhoneFullRowBeforeIgnition',
    maximumFullyVisible: Math.max(0, ...approach.map(frame => frame.fullyVisibleSlots.length)) });
  if (!settled.length) failures.push({ kind: 'missingSettledEarlierLanternDraws' });
  for (const frame of settled) {
    const bothSides = frame.visibleSlots.some(slot => slot < 0) && frame.visibleSlots.some(slot => slot > 0);
    if (phone && !bothSides) failures.push({ kind: 'missingSettledPhoneNeighbors', ...frame });
    if (!phone && desktopRow === 'full' && !full(frame)) failures.push({ kind: 'missingSettledDesktopFullRow', ...frame });
    if (!phone && desktopRow === 'paired') {
      const left = frame.fullyVisibleSlots.filter(slot => slot < 0).length;
      const right = frame.fullyVisibleSlots.length - left;
      if (left < 2 || right < 2) failures.push({ kind: 'missingSettledDesktopPair', ...frame });
    }
  }
  return {
    method: 'Actual GLB cloth geometry, grouped by the six beam positions. Full visibility requires the whole shade to project into the frame and at least two unobscured cloth hits on a 3×3 inset grid. Rays account for opaque surfaces, both old and visitor cloth, the near plane and visible control rectangles.',
    slotCounts, minimumVisibleLanternRays, desktopRow: phone ? null : desktopRow,
    approachDraws: approach.length, fullApproachDraws: fullApproach.length, firstFullApproach: fullApproach[0] ?? null,
    settledDraws: settled.length, firstSettled: settled[0] ?? null,
    minimumSettledVisible: settled.length ? Math.min(...settled.map(frame => frame.visibleSlots.length)) : null,
    minimumSettledFullyVisible: settled.length ? Math.min(...settled.map(frame => frame.fullyVisibleSlots.length)) : null,
  };
}

export function snowCourtBurnCompositionSummary(audit) {
  const failures = [];
  let settledFrames = 0;
  const distances = [], shadeHeights = [];
  const oldShadeRatios = new Map(earlierLanternSlots.map(slot => [slot, []]));
  for (const [index, frame] of audit.frames.entries()) {
    if (frame.screen !== 'burning' || frame.ignition !== 'settled') continue;
    settledFrames++;
    const { distanceMetres, heightFraction, vertices, earlier } = frame.burnComposition ?? {};
    if (!vertices || !Number.isFinite(distanceMetres) || !Number.isFinite(heightFraction)) {
      failures.push({ index, kind: 'missingBurnShade' });
      continue;
    }
    distances.push(distanceMetres);
    shadeHeights.push(heightFraction);
    if (distanceMetres < burnDistanceMetres[0] || distanceMetres > burnDistanceMetres[1]) {
      failures.push({ index, kind: 'burnDistance', distanceMetres });
    }
    if (heightFraction < burnShadeHeightFraction[0] || heightFraction > burnShadeHeightFraction[1]) {
      failures.push({ index, kind: 'burnShadeHeight', heightFraction });
    }
    for (const [slot, ratios] of oldShadeRatios) {
      const shade = earlier?.find(item => item.slot === slot);
      if (!shade?.vertices || !Number.isFinite(shade.heightFraction) || shade.heightFraction <= 0) {
        failures.push({ index, kind: 'missingEarlierBurnShade', slot });
        continue;
      }
      const ratio = shade.heightFraction / heightFraction;
      ratios.push(ratio);
      if (ratio > maximumEarlierShadeHeightRatio) {
        failures.push({ index, kind: 'earlierBurnShadeTooLarge', slot, ratio });
      }
    }
  }
  assert(settledFrames > 0, 'Expected the settled Snow Court burn in the lantern trace.');
  const range = values => values.length ? [Math.min(...values), Math.max(...values)] : null;
  return {
    method: 'Every settled draw of the one-hour Red gauze preset. Distance is from the camera to the world bounds centre of the visitor cloth. Project all actual cloth vertices. Ratios use full, unclipped heights so a partially visible or offscreen old shade cannot pass by cropping.',
    limits: { distanceMetres: burnDistanceMetres, heightFraction: burnShadeHeightFraction, maximumEarlierShadeHeightRatio },
    settledFrames, measuredFrames: distances.length, distanceMetres: range(distances), heightFraction: range(shadeHeights),
    earlierShadeHeightRatioBySlot: Object.fromEntries(Array.from(oldShadeRatios, ([slot, ratios]) => [slot, range(ratios)])),
    failures,
  };
}
