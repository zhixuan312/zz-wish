// Browser-only capture instrumentation copied into a frozen review checkout.
export function createFlickerLab({ renderer, camera, grade, bloom, scene, flamePosition, placeInfo, lamp, lampInfo, burnState, renderInfo }) {
  const lab = { lockCamera: false, freezeScene: false, freezeGrade: false, freezeDaylight: false, freezeFlame: false, freezeLampMotion: false, freezeShadows: false, freezeFuel: false, disableBloom: false, hideParticles: false, pauseTweens: false, result: null, recording: null };
  const hidden = new Map();
  const daylightHolds = new Map();
  // Flame halos remain with the flame control; weather, dust, mist and smoke are particles.
  const isParticle = object => object.isPoints || object.isLineSegments || (object.isSprite && !object.userData.visualKeepForParticleControl);
  const gl = renderer.getContext();
  lab.prepare = () => {
    if (lab.hideParticles) scene().traverse(object => {
      if (isParticle(object)) { if (!hidden.has(object)) hidden.set(object, object.visible); object.visible = false; }
    });
    else { for (const [object, visible] of hidden) object.visible = visible; hidden.clear(); }
    if (lab.freezeShadows) {
      lab.shadowAutoUpdate ??= renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
    } else if (lab.shadowAutoUpdate !== undefined) {
      renderer.shadowMap.autoUpdate = lab.shadowAutoUpdate; delete lab.shadowAutoUpdate;
      renderer.shadowMap.needsUpdate = true;
    }
  };
  lab.begin = ({ name, seconds = 10, rois }) => {
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const list = rois || [
      { name: 'left_structure', type: 'structure', x: .18, y: .48 },
      { name: 'right_structure', type: 'structure', x: .82, y: .48 },
      { name: 'lower_floor', type: 'structure', x: .5, y: .86 },
      { name: 'upper_control', type: 'sky_or_structure', x: .82, y: .12 },
    ];
    const flame = flamePosition?.();
    if (flame) { flame.project(camera); list.push({ name: 'flame_control', type: 'flame', x: (flame.x + 1) / 2, y: (1 - flame.y) / 2 }); }
    lab.result = null;
    const geometry = lampInfo?.() ?? null;
    if (geometry?.worldBounds) {
      const projected = [];
      for (const x of [geometry.worldBounds.min[0], geometry.worldBounds.max[0]]) for (const y of [geometry.worldBounds.min[1], geometry.worldBounds.max[1]]) for (const z of [geometry.worldBounds.min[2], geometry.worldBounds.max[2]]) {
        const point = camera.position.clone().set(x, y, z).project(camera); projected.push([(point.x + 1) / 2, (1 - point.y) / 2]);
      }
      geometry.screenBounds = { left: Math.min(...projected.map(point => point[0])), right: Math.max(...projected.map(point => point[0])), top: Math.min(...projected.map(point => point[1])), bottom: Math.max(...projected.map(point => point[1])) };
    }
    lab.recording = { name, seconds, place: placeInfo?.() ?? null, renderInfo:renderInfo?.()??null, lamp: geometry, walk: window.__walkProgress ? structuredClone(window.__walkProgress) : null, temporalGradeUniformPresent: !!grade.uniforms.uTime, start: performance.now(), width, height, samples: [], rois: list.map(roi => {
      const size = Math.min(64, width, height), x = Math.max(0, Math.min(width - size, Math.round(width * roi.x - size / 2))), top = Math.max(0, Math.min(height - size, Math.round(height * roi.y - size / 2)));
      const bounds = geometry?.visible && geometry.screenBounds;
      const overlapsLampBodyBounds = !!bounds && x / width < bounds.right && (x + size) / width > bounds.left && top / height < bounds.bottom && (top + size) / height > bounds.top;
      return { ...roi, overlapsLampBodyBounds, pixels: { x, y: height - top - size, top, width: size, height: size }, previous: null, raw: [], luminanceNumerators: [] };
    }), cameraStart: camera.matrixWorld.toArray(), projectionStart: camera.projectionMatrix.toArray(), cameraMaximumElementDelta: 0, projectionMaximumElementDelta: 0 };
  };
  lab.afterRender = () => {
    const record = lab.recording; if (!record) return;
    const now = performance.now(), elapsed = now - record.start;
    const matrix = camera.matrixWorld.toArray();
    record.cameraMaximumElementDelta = Math.max(record.cameraMaximumElementDelta, ...matrix.map((value, index) => Math.abs(value - record.cameraStart[index])));
    record.projectionMaximumElementDelta = Math.max(record.projectionMaximumElementDelta, ...camera.projectionMatrix.toArray().map((value, index) => Math.abs(value - record.projectionStart[index])));
    const lights = []; scene().traverse(object => { if (object.isLight) lights.push({ id: object.id, type: object.type, intensity: object.intensity, position: object.getWorldPosition(camera.position.clone()).toArray() }); });
    let visibleParticles = 0; scene().traverse(object => { if (isParticle(object)) { let visible = true; for (let parent = object; parent; parent = parent.parent) if (!parent.visible) visible = false; if (visible) visibleParticles++; } });
    const movingLamp = lamp?.(); movingLamp?.updateWorldMatrix(true, false);
    const sample = { elapsedMs: elapsed, visibleParticles, exposure: renderer.toneMappingExposure, bloomStrength: bloom.strength, bloomThreshold: bloom.threshold, shadowMapAutoUpdate: renderer.shadowMap.autoUpdate, daylight: lab.currentDaylight ?? null, lampWorldMatrix: movingLamp?.matrixWorld.toArray() ?? null, burn: burnState?.() ?? null, lights, rois: {} };
    for (const roi of record.rois) {
      const p = roi.pixels, bytes = new Uint8Array(p.width * p.height * 4); gl.readPixels(p.x, p.y, p.width, p.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      const count = p.width * p.height, luminance = new Float64Array(count), numerators = new Uint32Array(count); let mean = 0, squared = 0, absolute = 0, deltaMean = 0, changed = 0, large = 0;
      for (let i = 0; i < count; i++) {
        const offset = i * 4, value = .2126 * bytes[offset] + .7152 * bytes[offset + 1] + .0722 * bytes[offset + 2]; luminance[i] = value; mean += value;
        numerators[i] = 2126 * bytes[offset] + 7152 * bytes[offset + 1] + 722 * bytes[offset + 2];
        if (roi.previous) { const difference = value - roi.previous[i]; squared += difference * difference; absolute += Math.abs(difference); deltaMean += difference; if (Math.abs(difference) > .1) changed++; if (Math.abs(difference) > 3) large++; }
      }
      sample.rois[roi.name] = { mean: mean / count, rmsDelta: roi.previous ? Math.sqrt(squared / count) : null, meanAbsoluteDelta: roi.previous ? absolute / count : null, signedMeanDelta: roi.previous ? deltaMean / count : null, changedPixelFraction: changed / count, over3LsbFraction: large / count };
      roi.previous = luminance;
      roi.luminanceNumerators.push(numerators);
      if (record.samples.length < 2 || (elapsed >= record.seconds * 500 && !roi.midSaved) || elapsed >= record.seconds * 1000) {
        if (elapsed >= record.seconds * 500) roi.midSaved = true;
        let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
        roi.raw.push({ elapsedMs: elapsed, rgbaBase64: btoa(binary) });
      }
    }
    record.samples.push(sample);
    if (elapsed >= record.seconds * 1000) {
      lab.recording = null;
      const controls = { lockCamera: lab.lockCamera, freezeScene: lab.freezeScene, freezeGrade: lab.freezeGrade, freezeDaylight: lab.freezeDaylight, freezeFlame: lab.freezeFlame, freezeLampMotion: lab.freezeLampMotion, freezeShadows: lab.freezeShadows, freezeFuel: lab.freezeFuel, disableBloom: lab.disableBloom, hideParticles: lab.hideParticles };
      // Compression happens after acquisition. The metrics above use unencoded pixels.
      void (async () => {
        try {
          const rois = await Promise.all(record.rois.map(async ({ previous: _previous, midSaved: _midSaved, luminanceNumerators, ...roi }) => {
            const stream = new Blob(luminanceNumerators).stream().pipeThrough(new CompressionStream('gzip'));
            const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
            let binary = ''; for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
            return { ...roi, rawLuminance: { format: 'uint32 little-endian, frames concatenated in sample order, rows in WebGL bottom-to-top order', divisor: 10000, coefficients: [2126, 7152, 722], frames: luminanceNumerators.length, pixelsPerFrame: roi.pixels.width * roi.pixels.height, gzipBase64: btoa(binary) } };
          }));
          lab.result = { ...record, rois, controls };
        } catch (error) { lab.result = { ...record, rois: [], controls, packingError: error.stack || String(error) }; }
      })();
    }
  };
  lab.gradeTime = time => {
    if (lab.freezeScene) time = (performance.now() / 1000) % 10;
    if (!lab.freezeGrade) { lab.gradeHold = time; return time; }
    return lab.gradeHold ?? 0;
  };
  lab.daylight = (value, channel = 'rounded') => {
    if (!lab.freezeDaylight || !daylightHolds.has(channel)) daylightHolds.set(channel, structuredClone(value));
    const result = lab.freezeDaylight ? daylightHolds.get(channel) : value;
    lab.currentDaylight = { ...lab.currentDaylight, [channel]: structuredClone(result) };
    return result;
  };
  lab.flameTime = time => {
    if (!lab.freezeFlame) { lab.flameHold = time; return time; }
    return lab.flameHold ?? time;
  };
  lab.lampTime = time => {
    if (!lab.freezeLampMotion) { lab.lampHold = time; return time; }
    return lab.lampHold ?? time;
  };
  lab.applyBloom = value => { bloom.enabled = value && !lab.disableBloom; };
  lab.grade = grade;
  lab.renderInfo = renderInfo;
  window.__flickerLab = lab; return lab;
}
