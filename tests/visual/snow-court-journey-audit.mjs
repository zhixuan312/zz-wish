import assert from 'node:assert/strict';

const maximumBlockedPoints = 3;
const maximumEntryYaw = 120;
const minimumNightBurnFraction = .5;
const maximumUnobservedDrawSeconds = .15;

// Installed only by the visual capture. Record pose immediately after the
// real draw and defer the geometry work until after the live walk.
export function installSnowCourtJourneyAudit() {
  let recording;
  window.__startSnowCourtJourneyAudit = () => { recording = { frames: [], visitorGeometry: [] }; };
  window.__sampleSnowCourtJourneyAudit = (THREE, camera, baked, lamp, phase, walk, ignition) => {
    if (!recording || !baked || !walk || recording.complete) return;
    if (phase !== 'travel' && !recording.frames.length) return;
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
    recording.frames.push({
      timestamp, phase, walk, ignition: ignition ?? null,
      position: camera.position.toArray(), rotation: camera.quaternion.toArray(),
      inverseProjection: camera.projectionMatrixInverse.toArray(), near: camera.near,
      direction: camera.getWorldDirection(new THREE.Vector3()).toArray(), visitor,
    });
    if (ignition === 'settled') {
      recording.settledAt ??= timestamp;
      if (timestamp - recording.settledAt >= .6) recording.complete = true;
    }
  };
  window.__snowCourtJourneyComplete = () => recording?.complete === true;
  window.__finishSnowCourtJourneyAudit = () => {
    if (!recording?.complete) throw new Error('Snow Court journey pose trace did not reach settled burning.');
    const { THREE, baked, frames, settledAt, visitorGeometry } = recording;
    recording = null;
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
    return { frames, settledAt, rayDistance, ndcPoints, bakedTriangles, needleTriangles,
      needleMeshNames: crowns.map(mesh => mesh.name), visitorClothVariants: visitorTrees.filter(Boolean).length, visitorClothFrames,
      minimumClothOpacity,
      rayScope: 'Visible baked model and separately loaded crowns, plus each draw’s visitor cloth transform. Counts opaque triangles and old/new cloth with material opacity at least 0.70, respecting near clipping and sidedness.',
      entryStart: mark('snow-p1:entry-start'), entryEnd: mark('snow-p1:entry-end') };
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

export function snowCourtJourneySummary(geometry, presented, referenceLuminance) {
  const { frames, settledAt, entryStart, entryEnd } = geometry;
  assert(frames.length > 120 && frames[0].phase === 'travel' && frames.at(-1).ignition === 'settled',
    'The Snow Court geometry trace must cover the live walk through settled burning.');
  assert(Number.isFinite(entryStart) && Number.isFinite(entryEnd) && entryStart < entryEnd,
    'The Snow Court journey trace lacks actual entry boundaries.');
  assert(Number.isFinite(referenceLuminance) && referenceLuminance > 0,
    'The Snow Court audit needs a measured 22:00 settled burn luminance reference.');
  assert(presented.length > 100 && presented.some(frame => frame.timestamp >= settledAt),
    'The Snow Court compositor trace must continue through settled burning.');
  const floor = referenceLuminance * minimumNightBurnFraction;
  const failures = [];
  for (const [index, frame] of frames.entries()) {
    if (frame.blockedPoints > maximumBlockedPoints) {
      failures.push({ kind: 'nearGeometry', index, timestamp: frame.timestamp, blockedPoints: frame.blockedPoints });
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
    else failures.push({ kind: 'unmatchedPresentedFrame', ...matched });
    if (frame.luminance < floor) failures.push({ kind: 'lowLuminance', ...matched });
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
    if (range.seconds > maximumUnobservedDrawSeconds) failures.push({ kind: 'compositorCaptureGap', ...range });
  }
  return { limits: { maximumBlockedPoints, maximumEntryYaw, minimumNightBurnFraction,
    minimumLuminance: floor, maximumUnobservedDrawSeconds },
    referenceLuminance, entryYaw, entryYawTrace, geometryFrameCount: frames.length,
    maximumBlockedPoints: Math.max(...frames.map(frame => frame.blockedPoints)),
    presentedFrameCount: observed.length, distinctDrawsMatchedToCompositor: matchedDraws.size, maximumPresentedGap,
    unobservedDrawCount: frames.length - matchedDraws.size, unobservedDrawRanges,
    maximumUnobservedDrawSeconds: Math.max(0, ...unobservedDrawRanges.map(range => range.seconds)),
    luminanceSource: 'Every received Chromium compositor JPEG, averaged from a 48×36 reduction in Rec.709 display code values (0–255). Chromium can coalesce draws; unpaired draw ranges remain unverified for luminance.',
    minimumPresentedLuminance: Math.min(...presented.map(frame => frame.luminance)), failures, presented: observed };
}

export function snowCourtNightBurnLuminance(presented, settledAt) {
  const values = presented.filter(frame => frame.timestamp >= settledAt).map(frame => frame.luminance).sort((a, b) => a - b);
  assert(values.length >= 3, 'Expected three compositor frames of the live 22:00 settled burn.');
  const middle = values.length >> 1;
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}
