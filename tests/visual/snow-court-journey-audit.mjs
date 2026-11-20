import assert from 'node:assert/strict';

const maximumBlockedPoints = 3;
const maximumEntryYaw = 120;
const minimumWalkFraction = .5;
const burnDistanceMetres = [1, 1.4];
const burnShadeHeightFraction = [.25, .35];
const maximumUnobservedDrawSeconds = .15;

// Installed only by the visual capture. Record pose immediately after the
// real draw and defer the geometry work until after the live walk.
export function installSnowCourtJourneyAudit() {
  let recording;
  window.__startSnowCourtJourneyAudit = () => { recording = { frames: [], visitorGeometry: [] }; };
  window.__sampleSnowCourtJourneyAudit = (THREE, renderer, camera, baked, lamp, phase, walk, walkClock, ignition) => {
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
    const frame = {
      timestamp, phase, walk, walkSeconds, ignition: ignition ?? null,
      position: camera.position.toArray(), rotation: camera.quaternion.toArray(),
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
    const { THREE, baked, frames, settledAt, visitorGeometry, luminance } = recording;
    recording = null;
    const drawLuminanceSource = await luminance.finish();
    if (!frames.every(frame => Number.isFinite(frame.luminance))) {
      throw new Error('A Snow Court live draw has no pre-UI luminance readback.');
    }
    const rayDistance = 1.2;
    const pathBounds = new THREE.Box3().setFromPoints(frames.map(frame => new THREE.Vector3(...frame.position)))
      .expandByScalar(rayDistance);
    const minimumClothOpacity = .70;
    const earlierCloth = /^(Sun-faded rose-red gauze|Faded dusty rose gauze|Faded iron-red gauze|Thin gauze over low flame)$/;
    const vertices = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const bounds = new THREE.Box3();
    // Needles are shipped as another GLB next to the baked model. Recognize
    // the artist's mesh metadata without changing anything in the live scene.
    const crowns = [];
    for (const sibling of baked.group.parent.children) {
      if (sibling === baked.group) continue;
      sibling.traverseVisible(mesh => {
        if (mesh.isMesh && mesh.userData.snow_court_needle_crowns === true) crowns.push(mesh);
      });
    }
    if (!crowns.length) throw new Error('Expected a separate authored Snow Court needle-crown mesh.');
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
        const cloth = mesh.userData.visitorCloth || earlierCloth.test(surface.name);
        if (!surface.visible || (surface.transparent && (!cloth || surface.opacity < minimumClothOpacity))) continue;
        const start = Math.max(geometry.drawRange.start, group.start);
        const end = Math.min(size, geometry.drawRange.start + geometry.drawRange.count, group.start + group.count);
        for (let i = start; i + 2 < end; i += 3) {
          for (let j = 0; j < 3; j++) {
            vertices[j].fromBufferAttribute(position, index ? index.getX(i + j) : i + j).applyMatrix4(transform);
          }
          bounds.setFromPoints(vertices);
          if (clip && !bounds.intersectsBox(clip)) continue;
          output.push({
            vertices: (mirrored ? [vertices[0], vertices[2], vertices[1]] : vertices).map(vertex => vertex.clone()),
            bounds: bounds.clone(), source,
            side: surface.side, material: surface.name, mesh: mesh.name,
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
    for (const mesh of crowns) collect(mesh, mesh.matrixWorld, pathBounds, 'needle-crowns', obstacles);
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
        const { source, material, mesh, clothOpacity } = triangle;
        nearest = { distance, source, material, mesh, ...(clothOpacity === undefined ? {} : { clothOpacity }) };
      }
      return far;
    }
    let visitorClothFrames = 0;
    const ndcPoints = [-2 / 3, 0, 2 / 3].flatMap(y => [-2 / 3, 0, 2 / 3].map(x => [x, y]));
    for (const frame of frames) {
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
      frame.hits = ndcPoints.map(([x, y]) => {
        direction.set(x, y, .5).applyMatrix4(inverseProjection).normalize().applyQuaternion(rotation);
        const near = frame.near / direction.dot(forward);
        ray.set(cameraOrigin, direction);
        nearest = null;
        const far = cast(tree, rayDistance, near);
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
      });
      frame.centre = frame.hits[4];
      frame.blockedPoints = frame.hits.filter(Boolean).length;
      delete frame.rotation;
      delete frame.inverseProjection;
      delete frame.near;
      delete frame.visitor;
    }
    const mark = name => (performance.timeOrigin + performance.getEntriesByName(name).at(-1)?.startTime) / 1000;
    return { frames, settledAt, rayDistance, ndcPoints, bakedTriangles, needleTriangles, drawLuminanceSource,
      needleMeshNames: crowns.map(mesh => mesh.name), visitorClothVariants: visitorTrees.filter(Boolean).length, visitorClothFrames,
      minimumClothOpacity,
      rayScope: 'Visible baked model and separately loaded crowns, plus each draw’s visitor cloth transform. Counts opaque triangles and old/new cloth with material opacity at least 0.70, respecting near clipping and sidedness.',
      entryStart: mark('snow-p1:entry-start'), entryEnd: mark('snow-p1:entry-end') };
  };

  // Append the actual shade only to the existing settled projection trace.
  // The cloth range excludes the cord, hoops, tassel, flame, and UI.
  window.__sampleSnowCourtBurnComposition = (THREE, camera, lamp) => {
    const frame = window.__snowLanternAudit?.frames.at(-1);
    if (frame?.screen !== 'burning' || frame.ignition !== 'settled' || frame.burnComposition || !frame.visible) return;
    const cloth = lamp.parts.g.children.find(mesh => mesh.visible && mesh.userData.visitorCloth);
    if (!cloth) return;
    const vertices = cloth.geometry.attributes.position;
    const localToClip = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .multiply(cloth.matrixWorld);
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
    const centre = bounds.getCenter(world);
    frame.burnComposition = {
      vertices: vertices.count, centre: centre.toArray(), distanceMetres: camera.position.distanceTo(centre),
      heightFraction: (highest - lowest) / 2,
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

export function snowCourtJourneySummary(geometry, presented, durationSeconds) {
  const { frames, settledAt, entryStart, entryEnd } = geometry;
  assert(frames.length > 120 && frames[0].phase === 'travel' && frames.at(-1).ignition === 'settled',
    'The Snow Court geometry trace must cover the live walk through settled burning.');
  assert(Number.isFinite(entryStart) && Number.isFinite(entryEnd) && entryStart < entryEnd,
    'The Snow Court journey trace lacks actual entry boundaries.');
  // The authored walk clock starts only when the route tween draws. Keep
  // its held reveal, and stop before the separate hall-entry movement.
  const walk = frames.filter(frame => frame.phase === 'travel' && frame.walk === 'walking'
    && frame.timestamp < entryStart && frame.walkSeconds >= 0 && frame.walkSeconds <= durationSeconds);
  assert(walk.length > 120 && walk[0].walkSeconds < .5 && walk.at(-1).walkSeconds >= durationSeconds - .01,
    'Expected a continuous draw trace for the complete authored Snow Court walk.');
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
  // Include every actual draw bracketing the entry marks. Sum the absolute
  // shortest wrapped horizontal turn of consecutive headings. Opposite
  // turns add, and a ±180° crossing never manufactures a 360° turn.
  const firstEntryDraw = frames.findLastIndex(frame => frame.timestamp <= entryStart);
  const lastEntryDraw = frames.findIndex(frame => frame.timestamp >= entryEnd);
  assert(firstEntryDraw >= 0 && lastEntryDraw > firstEntryDraw, 'The Snow Court draws do not bracket the entry marks.');
  const headings = frames.slice(firstEntryDraw, lastEntryDraw + 1)
    .map(frame => Math.atan2(frame.direction[0], -frame.direction[2]));
  let entryYaw = 0;
  for (let i = 1; i < headings.length; i++) {
    const delta = headings[i] - headings[i - 1];
    entryYaw += Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
  }
  entryYaw *= 180 / Math.PI;
  const entryYawTrace = {
    method: 'Sum of absolute shortest wrapped horizontal yaw deltas between consecutive actual draws bracketing the entry marks.',
    firstDraw: firstEntryDraw, lastDraw: lastEntryDraw, drawCount: headings.length,
    start: frames[firstEntryDraw].timestamp, end: frames[lastEntryDraw].timestamp,
    initialDegrees: headings[0] * 180 / Math.PI, finalDegrees: headings.at(-1) * 180 / Math.PI,
  };
  if (entryYaw > maximumEntryYaw) failures.push({ kind: 'entryYaw', actual: entryYaw, maximum: maximumEntryYaw });
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
  return { limits: { maximumBlockedPoints, maximumEntryYaw, minimumWalkFraction,
    minimumLuminance: floor, compositorMinimumLuminance: presentedFloor, maximumUnobservedDrawSeconds },
    referenceLuminance, presentedReferenceLuminance,
    walkBaseline: { method: 'Arithmetic mean of this context’s actual pre-UI draws from the start of the authored walk through its held reveal, before hall entry.',
      drawCount: walk.length, firstWalkSeconds: walk[0].walkSeconds, lastWalkSeconds: walk.at(-1).walkSeconds,
      firstTimestamp: walk[0].timestamp, lastTimestamp: walk.at(-1).timestamp, compositorFrameCount: presentedWalk.length },
    entryYaw, entryYawTrace, geometryFrameCount: frames.length,
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

export function snowCourtBurnCompositionSummary(audit) {
  const failures = [];
  let settledFrames = 0;
  const distances = [], shadeHeights = [];
  for (const [index, frame] of audit.frames.entries()) {
    if (frame.screen !== 'burning' || frame.ignition !== 'settled') continue;
    settledFrames++;
    const { distanceMetres, heightFraction, vertices } = frame.burnComposition ?? {};
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
  }
  assert(settledFrames > 0, 'Expected the settled Snow Court burn in the lantern trace.');
  const range = values => values.length ? [Math.min(...values), Math.max(...values)] : null;
  return {
    method: 'Every settled draw of the one-hour Red gauze preset. Distance is from the camera to the world bounds centre of the visible cloth mesh. Height is the actual cloth vertex projection range divided by full frame height.',
    limits: { distanceMetres: burnDistanceMetres, heightFraction: burnShadeHeightFraction },
    settledFrames, measuredFrames: distances.length, distanceMetres: range(distances), heightFraction: range(shadeHeights),
    failures,
  };
}
