import assert from 'node:assert/strict';

// Runs in the intercepted development scene, immediately after each real draw.
export function installSnowCourtLanternAudit() {
  let audit;
  let occluders;
  let testedVolume;
  let nearbyTriangles;
  window.__startSnowLanternAudit = () => {
    audit = { frames: [], settledAt: null };
    window.__snowLanternAudit = audit;
  };

  window.__sampleSnowLanternAudit = (THREE, camera, lamp, baked, ignition, stamp) => {
    if (!audit) return;
    const screen = document.querySelector('.ui')?.dataset.screen;
    if (screen !== 'candle' && screen !== 'burning') return;
    const time = performance.now();
    if (ignition === 'settled') audit.settledAt ??= time;
    if (audit.settledAt !== null && time - audit.settledAt >= 10_000) audit.completed = true;

    const forward = camera.getWorldDirection(new THREE.Vector3());
    const frame = { time, screen, ignition, visible: lamp.g.visible && !!lamp.parts?.g,
      stage: ignition ?? (screen === 'candle' ? 'chooser' : screen),
      renderTimeMs: stamp, position: camera.getWorldPosition(new THREE.Vector3()).toArray(),
      modelPosition: lamp.g.getWorldPosition(new THREE.Vector3()).toArray(),
      yawDegrees: THREE.MathUtils.radToDeg(Math.atan2(forward.x, -forward.z)),
      pitchDegrees: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1))),
      fovDegrees: camera.fov, aspect: camera.aspect, blockers: [] };
    audit.frames.push(frame);
    if (!frame.visible) return;

    const project = point => {
      const ndc = point.clone().project(camera);
      return [(ndc.x + 1) / 2, (1 - ndc.y) / 2];
    };
    const silhouette = new THREE.Box2();
    const world = new THREE.Box3();
    const projectInto = (bounds, corners) => {
      for (const point of corners) bounds.expandByPoint(new THREE.Vector2(...project(point)));
    };
    const corners = ({ min, max }, matrix) => [min.x, max.x].flatMap(x =>
      [min.y, max.y].flatMap(y => [min.z, max.z].map(z => new THREE.Vector3(x, y, z).applyMatrix4(matrix))));
    lamp.parts.g.traverseVisible(mesh => {
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const points = corners(geometry.boundingBox, mesh.matrixWorld);
      projectInto(silhouette, points);
      for (const point of points) world.expandByPoint(point);
    });
    frame.lantern = [silhouette.min.toArray(), silhouette.max.toArray()];
    const centre = world.getCenter(new THREE.Vector3());
    frame.distance = camera.position.distanceTo(new THREE.Vector3(...baked.manifest.lampBasis.position));

    // Match the actual shader-expanded quad. The 1 m source plane is only
    // a carrier and is never the size of the flame on screen.
    const flame = lamp.g.children.find(mesh => mesh.material?.uniforms?.uPineFlame && mesh.isMesh);
    const flameUniforms = flame?.material.uniforms;
    const flamePoints = [];
    if (flame?.visible && flameUniforms.uPower.value > 0) {
      const [rightX, , rightZ] = camera.matrixWorld.elements;
      const right = new THREE.Vector3(rightX, 0, rightZ).normalize();
      const wick = flame.getWorldPosition(new THREE.Vector3());
      const scale = flameUniforms.uScale.value;
      for (const y of [0, scale]) for (const side of [-1, 1]) {
        const point = wick.clone().addScaledVector(right, side * scale / 4);
        point.y += y;
        flamePoints.push(point);
      }
      const bounds = new THREE.Box2();
      projectInto(bounds, flamePoints);
      frame.flame = [bounds.min.toArray(), bounds.max.toArray()];
    }

    const controls = document.querySelector(screen === 'candle' ? '.candle-sheet' : '.hud-bottom');
    if (controls) {
      const { left, right, top, bottom } = controls.getBoundingClientRect();
      frame.controls = [left / innerWidth, top / innerHeight, right / innerWidth, bottom / innerHeight];
    }
    if (!occluders) {
      occluders = [];
      baked.group.traverseVisible(mesh => {
        if (mesh.isMesh) occluders.push({ mesh, bounds: new THREE.Box3().setFromObject(mesh) });
      });
    }
    if (ignition === 'settled' && !audit.earlierRow) {
      const earlier = /^(Sun-faded rose-red gauze|Faded dusty rose gauze|Faded iron-red gauze|Thin gauze over low flame)$/;
      const row = new THREE.Box2();
      let clothMeshes = 0;
      for (const { mesh, bounds } of occluders) {
        if (![mesh.material].flat().some(material => earlier.test(material.name))) continue;
        projectInto(row, corners(bounds, new THREE.Matrix4()));
        clothMeshes++;
      }
      audit.earlierRow = { clothMeshes, bounds: [row.min.toArray(), row.max.toArray()] };
    }
    const segment = world.clone().expandByPoint(camera.position);
    for (const point of flamePoints) segment.expandByPoint(point);
    if (!testedVolume?.containsBox(segment)) {
      // The baked model combines many surfaces by material. Restrict those
      // combined meshes to actual triangles in the lamp's sight corridor
      // once, so checking each new frame does not stall the browser.
      testedVolume = segment.clone().expandByScalar(.10);
      nearbyTriangles = [];
      const vertices = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      const triangleBounds = new THREE.Box3();
      for (const { mesh, bounds } of occluders) {
        if (!testedVolume.intersectsBox(bounds)) continue;
        const { index, attributes } = mesh.geometry;
        const count = index?.count ?? attributes.position.count;
        for (let first = 0; first < count; first += 3) {
          for (let vertex = 0; vertex < 3; vertex++) {
            const position = index ? index.getX(first + vertex) : first + vertex;
            vertices[vertex].fromBufferAttribute(attributes.position, position).applyMatrix4(mesh.matrixWorld);
          }
          if (testedVolume.intersectsBox(triangleBounds.setFromPoints(vertices))) {
            nearbyTriangles.push({ mesh, vertices: vertices.map(point => point.clone()) });
          }
        }
      }
    }
    const ray = new THREE.Ray();
    const direction = new THREE.Vector3();
    const intersection = new THREE.Vector3();
    const extent = world.getSize(new THREE.Vector3()).multiplyScalar(.5);
    const cloth = lamp.parts.g.children.find(mesh => mesh.userData.visitorCloth);
    const targets = [...flamePoints];
    // Send rays to the camera-facing cloth vertices, not empty corners of
    // the screen box. Keep the end fittings and the actual flame separately.
    if (cloth) {
      const { geometry } = cloth;
      const { points, segments } = geometry.parameters;
      const normals = new THREE.Matrix3().getNormalMatrix(cloth.matrixWorld);
      const point = new THREE.Vector3(), normal = new THREE.Vector3();
      for (let col = 0; col < segments; col += 8) for (let row = 0; row <= 6; row++) {
        const index = col * points.length + Math.round((points.length - 1) * row / 6);
        point.fromBufferAttribute(geometry.attributes.position, index).applyMatrix4(cloth.matrixWorld);
        normal.fromBufferAttribute(geometry.attributes.normal, index).applyNormalMatrix(normals);
        if (normal.dot(direction.subVectors(camera.position, point)) >= -.06) targets.push(point.clone());
      }
    }
    for (const y of [-1, 1]) targets.push(centre.clone().add(new THREE.Vector3(0, y * extent.y, 0)));
    frame.visibilityRays = targets.length;
    for (const point of targets) {
      direction.subVectors(point, camera.position);
      const far = direction.length() - .002;
      ray.set(camera.position, direction.normalize());
      for (const { mesh, vertices: [a, b, c] } of nearbyTriangles) {
        const hit = ray.intersectTriangle(a, b, c, false, intersection);
        const distance = hit?.distanceTo(camera.position);
        if (distance < far) frame.blockers.push({ name: mesh.name, material: mesh.material.name, distance });
      }
    }
    if (audit.completed) audit = null;
  };
}

export function validateSnowCourtLanternAudit(audit, width, height, { requireSettledRow = true } = {}) {
  assert(audit?.completed && audit.frames.length > 120, 'Expected every rendered frame through ten seconds of settled burning.');
  const { frames, settledAt } = audit;
  assert(frames.at(-1).time - settledAt >= 10_000);
  assert(frames.some(frame => frame.screen === 'candle') && frames.some(frame => frame.flame)
    && frames.some(frame => frame.ignition === 'spreading'), 'Projection audit missed a required lantern phase.');
  const failures = [];
  const row = audit.earlierRow;
  if (requireSettledRow && (!row?.clothMeshes || row.bounds[0].some(axis => axis < 0) || row.bounds[1].some(axis => axis > 1))) {
    failures.push({ reasons: ['earlier lantern row missing or clipped'] });
  }
  const left = .1, right = .9, top = .12, clearance = .05;
  let previousDistance = null, minimumMargin = Infinity;
  for (const [index, frame] of frames.entries()) {
    const reasons = [];
    if (!frame.visible || !frame.lantern) {
      failures.push({ index, reasons: ['missing lantern'] });
      continue;
    }
    if (Math.abs(frame.aspect - width / height) > .0001) reasons.push('viewport aspect');
    if (frame.visibilityRays < 12 || !Number.isFinite(frame.distance)) reasons.push('missing geometry samples');
    const [uiLeft, uiTop] = frame.controls ?? [1, 1];
    for (const [[x0, y0], [x1, y1]] of [frame.lantern, ...(frame.flame ? [frame.flame] : [])]) {
      const bottom = uiLeft < left ? uiTop - clearance : 1 - clearance;
      const margin = Math.min(x0 - left, right - x1, y0 - top, bottom - y1,
        uiLeft >= left ? uiLeft - clearance - x1 : Infinity);
      minimumMargin = Math.min(minimumMargin, margin);
      if (margin < 0) reasons.push('outside safe rectangle');
    }
    if (frame.blockers.length) reasons.push('static object in front of lantern');
    if (frame.ignition) {
      // The suspended shade sways; camera distance uses its fixed wick seat.
      if (previousDistance !== null && frame.distance > previousDistance + .000001) reasons.push('camera moved away');
      previousDistance = frame.distance;
    }
    if (reasons.length) failures.push({ index, reasons: [...new Set(reasons)] });
  }
  return { frameCount: frames.length, settledSeconds: (frames.at(-1).time - settledAt) / 1000,
    minimumMargin, earlierRow: row, visibilityRays: frames.reduce((sum, frame) => sum + (frame.visibilityRays ?? 0), 0), failures };
}


// Evaluate the path independently of projected screen-space motion or the
// elapsed time of the measurement itself. The renderer passes its actual
// animation timestamp, which is also the time used to advance the tweens.
export function validateSnowCourtSettleCamera(audit, phone) {
  const desktopTranslationMetres = .1;
  const spreadingSeconds = [13, 15];
  const maximumSpeedMetresPerSecond = .35;
  const maximumYawDegreesPerSecond = 10;
  const maximumPitchRangeDegrees = 10;
  const fixedFovToleranceDegrees = 1e-6;
  const positionEpsilon = .000001;
  const numericEpsilon = 1e-8;
  const { frames } = audit;
  const first = frames.findIndex(frame => frame.stage === 'chooser' && frame.visible);
  const settled = frames.findIndex(frame => frame.stage === 'settled' && frame.screen === 'burning');
  const spread = frames.findIndex(frame => frame.stage === 'spreading');
  const failures = [];
  const limits = phone ? { spreadingSeconds, maximumSpeedMetresPerSecond, maximumYawDegreesPerSecond,
    maximumPitchRangeDegrees, fixedFovToleranceDegrees, monotonicDistance: true } : { desktopTranslationMetres };
  if (first < 0 || spread <= first || settled <= spread) {
    return { limits, failures: [{ kind: 'missingCameraStage', first, spread, settled }] };
  }

  const translation = (a, b) => Math.hypot(...a.map((axis, index) => axis - b[index]));
  const wrappedYaw = (a, b) => ((a - b + 540) % 360) - 180;
  const validPoint = point => point?.length === 3 && point.every(Number.isFinite);
  const hasPose = frame => validPoint(frame.position) && validPoint(frame.modelPosition)
    && [frame.renderTimeMs, frame.yawDegrees, frame.pitchDegrees, frame.fovDegrees, frame.distance].every(Number.isFinite);
  if (!hasPose(frames[first]) || !hasPose(frames[spread]) || !hasPose(frames[settled])) {
    return { limits, failures: [{ kind: 'missingCameraPose', indices: [first, spread, settled].filter(i => !hasPose(frames[i])) }] };
  }
  const pitch = [], lenses = [];
  let previous, maxExcursion = 0, pathLength = 0, duplicateDraws = 0, measuredIntervals = 0;
  let maxSpeed = 0, maxYawRate = 0, maxFovRate = 0, maxAdvance = 0, firstMotion, lastMotion;
  for (let index = first; index <= settled; index++) {
    const frame = frames[index];
    if (!hasPose(frame)) {
      failures.push({ kind: 'missingCameraPose', index });
      continue;
    }
    pitch.push(frame.pitchDegrees);
    lenses.push(frame.fovDegrees);
    maxExcursion = Math.max(maxExcursion, translation(frame.position, frames[first].position));
    if (!previous) {
      previous = frame;
      continue;
    }

    const dtSeconds = (frame.renderTimeMs - previous.renderTimeMs) / 1000;
    const translationMetres = translation(frame.position, previous.position);
    const yawDeltaDegrees = wrappedYaw(frame.yawDegrees, previous.yawDegrees);
    if (dtSeconds <= 0) {
      const changed = translationMetres > positionEpsilon || Math.abs(yawDeltaDegrees) > numericEpsilon
        || Math.abs(frame.pitchDegrees - previous.pitchDegrees) > numericEpsilon
        || Math.abs(frame.fovDegrees - previous.fovDegrees) > numericEpsilon;
      if (dtSeconds < 0 || changed) failures.push({ kind: 'invalidCameraTimeStep', index, dtSeconds, changed });
      else duplicateDraws++;
      continue;
    }

    const speedMetresPerSecond = translationMetres / dtSeconds;
    const yawDegreesPerSecond = yawDeltaDegrees / dtSeconds;
    const fovDegreesPerSecond = (frame.fovDegrees - previous.fovDegrees) / dtSeconds;
    const distanceDeltaMetres = frame.distance - previous.distance;
    frame.cameraMotion = { dtSeconds, translationMetres, speedMetresPerSecond, yawDeltaDegrees,
      yawDegreesPerSecond, fovDegreesPerSecond, distanceDeltaMetres };
    measuredIntervals++;
    pathLength += translationMetres;
    maxSpeed = Math.max(maxSpeed, speedMetresPerSecond);
    maxYawRate = Math.max(maxYawRate, Math.abs(yawDegreesPerSecond));
    maxFovRate = Math.max(maxFovRate, Math.abs(fovDegreesPerSecond));
    maxAdvance = Math.max(maxAdvance, distanceDeltaMetres);
    if (translationMetres > positionEpsilon && index >= spread) {
      firstMotion ??= previous.renderTimeMs;
      lastMotion = frame.renderTimeMs;
    }
    if (phone) {
      if (speedMetresPerSecond > maximumSpeedMetresPerSecond + numericEpsilon) {
        failures.push({ kind: 'cameraSpeed', index, speedMetresPerSecond });
      }
      if (Math.abs(yawDegreesPerSecond) > maximumYawDegreesPerSecond + numericEpsilon) {
        failures.push({ kind: 'cameraYawRate', index, yawDegreesPerSecond });
      }
      if (distanceDeltaMetres > positionEpsilon) failures.push({ kind: 'cameraDistanceIncreased', index, distanceDeltaMetres });
      if (translationMetres > positionEpsilon && index < spread) failures.push({ kind: 'cameraMovedBeforeSpreading', index, translationMetres });
    }
    previous = frame;
  }

  const chooserToSettledMetres = translation(frames[settled].position, frames[first].position);
  const spreadingPhaseSeconds = (frames[settled].renderTimeMs - frames[spread].renderTimeMs) / 1000;
  const movingSeconds = firstMotion === undefined ? 0 : (lastMotion - firstMotion) / 1000;
  const pitchRange = Math.max(...pitch) - Math.min(...pitch);
  const fovRange = Math.max(...lenses) - Math.min(...lenses);
  if (phone) {
    if (spreadingPhaseSeconds < spreadingSeconds[0] || spreadingPhaseSeconds > spreadingSeconds[1]) {
      failures.push({ kind: 'spreadingDuration', spreadingPhaseSeconds });
    }
    if (movingSeconds < spreadingSeconds[0] || movingSeconds > spreadingSeconds[1]) {
      failures.push({ kind: 'cameraMotionDuration', movingSeconds });
    }
    if (pitchRange > maximumPitchRangeDegrees + numericEpsilon) failures.push({ kind: 'cameraPitchRange', pitchRange });
    if (fovRange > fixedFovToleranceDegrees) failures.push({ kind: 'cameraFovChanged', fovRange });
  } else if (Math.max(chooserToSettledMetres, maxExcursion, pathLength) > desktopTranslationMetres + numericEpsilon) {
    failures.push({ kind: 'desktopCameraTranslation', chooserToSettledMetres, maxExcursion, pathLength });
  }
  return { limits, first, spread, settled, measuredIntervals, duplicateDraws, chooserToSettledMetres, maxExcursion,
    pathLength, spreadingPhaseSeconds, movingSeconds, maxSpeed, maxYawRate, pitchRange,
    fovRange, maxFovRate,
    startDistanceMetres: frames[first].distance, settledDistanceMetres: frames[settled].distance, maxAdvance,
    method: 'Chronological animation timestamps and post-render camera positions. Rates use unmodified elapsed time. Yaw rate is the shortest signed horizontal delta. Distance uses the fixed lamp basis.',
    failures };
}
