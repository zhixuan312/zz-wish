import assert from 'node:assert/strict';

// Runs in the intercepted development scene, immediately after each real draw.
export function installSnowCourtLanternAudit() {
  let audit;
  let occluders;
  window.__startSnowLanternAudit = () => {
    audit = { frames: [], settledAt: null };
    window.__snowLanternAudit = audit;
  };

  window.__sampleSnowLanternAudit = (THREE, camera, lamp, baked, ignition) => {
    if (!audit) return;
    const screen = document.querySelector('.ui')?.dataset.screen;
    if (screen !== 'candle' && screen !== 'burning') return;
    const time = performance.now();
    if (ignition === 'settled') audit.settledAt ??= time;
    if (audit.settledAt !== null && time - audit.settledAt >= 10_000) audit.completed = true;

    const frame = { time, screen, ignition, visible: lamp.g.visible && !!lamp.parts?.g,
      aspect: camera.aspect, position: camera.position.toArray(), blockers: [] };
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
    const candidates = occluders.filter(({ bounds }) => segment.intersectsBox(bounds));
    const ray = new THREE.Raycaster();
    const direction = new THREE.Vector3();
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
      ray.far = direction.length() - .002;
      ray.set(camera.position, direction.normalize());
      for (const { mesh, bounds } of candidates) {
        const entering = bounds.containsPoint(camera.position) ? camera.position : ray.ray.intersectBox(bounds, new THREE.Vector3());
        if (!entering || entering.distanceTo(camera.position) > ray.far) continue;
        const hit = ray.intersectObject(mesh, false)[0];
        if (hit) frame.blockers.push({ name: mesh.name, material: hit.object.material.name, distance: hit.distance });
      }
    }
    if (audit.completed) audit = null;
  };
}

export function validateSnowCourtLanternAudit(audit, width, height) {
  assert(audit?.completed && audit.frames.length > 120, 'Expected every rendered frame through ten seconds of settled burning.');
  const { frames, settledAt } = audit;
  assert(frames.at(-1).time - settledAt >= 10_000);
  assert(frames.some(frame => frame.screen === 'candle') && frames.some(frame => frame.flame)
    && frames.some(frame => frame.ignition === 'spreading'), 'Projection audit missed a required lantern phase.');
  const failures = [];
  const row = audit.earlierRow;
  if (!row?.clothMeshes || row.bounds[0].some(axis => axis < 0) || row.bounds[1].some(axis => axis > 1)) {
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
