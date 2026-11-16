// Copy only into a frozen capture checkout. Hook immediately around composer.render().
// This helper never reads pixels, records video, waits on the GPU, or alters animation.
export function createPerformanceLab({ renderer, camera, composer = null }) {
  const gl = renderer.getContext();
  const webgl2 = !!renderer.capabilities.isWebGL2;
  const timer = webgl2 ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
  const lab = { result: null, recording: null };
  const onVisibility = event => {
    const record = lab.recording;
    if (!record || record.phase !== 'recording') return;
    record.visibility = document.visibilityState;
    record.visibilityChanges.push({ atMs: performance.now(), state: record.visibility, trusted: event.isTrusted });
  };
  document.addEventListener('visibilitychange', onVisibility);
  const array = value => value?.toArray ? value.toArray() : null;
  const matrix = () => ({ world: array(camera.matrixWorld), projection: array(camera.projectionMatrix) });
  const percentile = (values, q) => {
    if (!values.length) return null;
    const ordered = [...values].sort((a, b) => a - b), index = (ordered.length - 1) * q;
    return ordered[Math.floor(index)] + (ordered[Math.ceil(index)] - ordered[Math.floor(index)]) * (index % 1);
  };
  const summary = values => ({ samples: values.length, meanMs: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, p50Ms: percentile(values, .5), p95Ms: percentile(values, .95), p99Ms: percentile(values, .99), maxMs: values.length ? Math.max(...values) : null });
  const sampleCounts = format => {
    if (!webgl2) return { supported: [], reason: 'WebGL1' };
    try { return { supported: Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, format, gl.SAMPLES) ?? []) }; }
    catch (error) { return { supported: [], reason: String(error) }; }
  };
  const supportedSamples = { rgba16f: sampleCounts(gl.RGBA16F), depthComponent24: sampleCounts(gl.DEPTH_COMPONENT24) };
  const target = value => value ? { width: value.width, height: value.height, samples: value.samples, textureType: value.texture.type, depthBuffer: value.depthBuffer, stencilBuffer: value.stencilBuffer } : null;
  const configuration = () => ({ pixelRatio: renderer.getPixelRatio(), drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], contextAttributes: gl.getContextAttributes(), supportedSamples, renderTarget1: target(composer?.renderTarget1), renderTarget2: target(composer?.renderTarget2), shadowMap: { enabled: renderer.shadowMap.enabled, type: renderer.shadowMap.type }, exposure: renderer.toneMappingExposure });
  const rendererInfo = () => ({ render: { ...renderer.info.render }, memory: { ...renderer.info.memory }, programs: renderer.info.programs?.length ?? null });
  const delta = (a, b) => a && b ? Math.max(...a.map((value, i) => Math.abs(value - b[i]))) : null;
  const releaseQueries = record => {
    if (record.current?.query) {
      gl.endQuery(timer.TIME_ELAPSED_EXT); gl.deleteQuery(record.current.query); record.current.query = null;
    }
    for (const item of record.pending) gl.deleteQuery(item.query);
    record.pending.length = 0;
  };
  const poll = record => {
    if (!record.gpuEnabled) return;
    if (gl.getParameter(timer.GPU_DISJOINT_EXT)) {
      record.disjoint = true;
      for (const item of record.pending) gl.deleteQuery(item.query);
      record.pending.length = 0;
      return;
    }
    for (let i = record.pending.length - 1; i >= 0; i--) {
      const item = record.pending[i];
      if (!gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)) continue;
      const elapsed = gl.getQueryParameter(item.query, gl.QUERY_RESULT);
      if (!record.disjoint) item.frame.gpuMs = elapsed / 1e6;
      gl.deleteQuery(item.query); record.pending.splice(i, 1);
    }
  };
  const finish = (record, reason = 'complete') => {
    if (lab.recording !== record) return;
    releaseQueries(record);
    renderer.info.autoReset = record.originalAutoReset;
    const frames = record.frames, first = frames[0], last = frames.at(-1);
    if (record.disjoint) for (const frame of frames) frame.gpuMs = null;
    const intervalSpan = frames.length > 1 ? last.renderStartMs - first.renderStartMs : null;
    const gpuValues = record.disjoint ? [] : frames.map(frame => frame.gpuMs).filter(value => value !== null);
    const gpuStatus = !record.gpuRequested ? 'disabled' : !timer ? 'unsupported' : record.disjoint ? 'disjoint' : gpuValues.length === frames.length ? 'complete' : 'incomplete';
    const result = {
      name: record.name, reason, valid: reason === 'complete' && record.visibilityStart === 'visible' && record.visibilityChanges.length === 0 && !gl.isContextLost(), targetSeconds: record.seconds,
      createdAt: record.createdAt, timeOriginMs: performance.timeOrigin, beginMs: record.beginMs,
      firstRenderMs: first?.renderStartMs ?? null, lastRenderMs: last?.renderStartMs ?? null, measuredRenderSpanMs: intervalSpan,
      renderedFrames: frames.length, fps: intervalSpan > 0 ? (frames.length - 1) * 1000 / intervalSpan : null,
      intervals: summary(frames.map(frame => frame.intervalMs).filter(value => value !== null)), cpuSubmit: summary(frames.map(frame => frame.cpuSubmitMs)),
      gpu: { requested: record.gpuRequested, supported: !!timer, status: gpuStatus, disjointObserved: record.disjoint, droppedQueries: record.droppedQueries, ...summary(gpuValues) },
      cameraStart: record.cameraStart, cameraEnd: record.cameraEnd ?? matrix(), cameraMaximumElementDelta: record.cameraDelta, projectionMaximumElementDelta: record.projectionDelta,
      configurationStart: record.configurationStart, configurationEnd: record.configurationEnd ?? configuration(), configurationChanges: record.configurationChanges,
      rendererInfoStart: record.rendererInfoStart, rendererInfoEnd: last?.rendererInfo ?? rendererInfo(), visibilityStart: record.visibilityStart, visibilityChanges: record.visibilityChanges,
      rendererInfoScope: 'autoReset temporarily disabled and counters reset before each composer render; per-frame counts aggregate its passes. Original autoReset is restored.',
      timingScope: 'Actual composer-render hook timestamps. CPU submit is wall time around composer.render(), including any driver stall, not CPU utilization. GPU queries are asynchronous and never awaited synchronously. Pending queries drain outside the timed render window for at most 2 seconds.',
      frames,
    };
    lab.recording = null; lab.result = result; record.resolve(result);
  };
  lab.begin = ({ name = 'render-performance', seconds = 10, gpu = true } = {}) => {
    if (lab.recording) throw new Error('A performance interval is already active.');
    if (!(seconds > 0 && seconds <= 60)) throw new Error('Performance interval must be between 0 and 60 seconds.');
    if (window.__flickerLab?.recording) throw new Error('Disable the raw-frame recorder before performance measurement.');
    lab.result = null;
    const done = new Promise(resolve => {
      lab.recording = { name, seconds, beginMs: performance.now(), createdAt: new Date().toISOString(), resolve, phase: 'recording', frames: [], current: null, pending: [],
        gpuRequested: gpu, gpuEnabled: gpu && !!timer, disjoint: false, droppedQueries: 0, originalAutoReset: renderer.info.autoReset,
        cameraStart: matrix(), cameraDelta: 0, projectionDelta: 0, configurationStart: configuration(), configurationChanges: [], rendererInfoStart: rendererInfo(), visibilityChanges: [], visibilityStart: document.visibilityState, visibility: document.visibilityState };
    });
    renderer.info.autoReset = false;
    return done;
  };
  lab.beforeRender = rafTimestampMs => {
    const record = lab.recording;
    if (!record) return;
    if (gl.isContextLost()) { finish(record, 'context-lost'); return; }
    poll(record);
    if (record.phase === 'draining') {
      if (!record.pending.length || performance.now() - record.drainStartMs >= 2000) finish(record);
      return;
    }
    if (record.current) throw new Error('beforeRender must be paired with afterRender.');
    renderer.info.reset();
    const frame = { index: record.frames.length, renderStartMs: null, renderEndMs: null, rafTimestampMs: Number.isFinite(rafTimestampMs) ? rafTimestampMs : null, intervalMs: null, cpuSubmitMs: null, gpuMs: null };
    let query = null;
    if (record.gpuEnabled && !record.disjoint && record.pending.length < 32) {
      if (gl.getQuery(timer.TIME_ELAPSED_EXT, gl.CURRENT_QUERY) === null) {
        query = gl.createQuery();
        if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query); else record.droppedQueries++;
      } else record.droppedQueries++;
    } else if (record.gpuEnabled && !record.disjoint) record.droppedQueries++;
    frame.renderStartMs = performance.now();
    record.current = { frame, query };
  };
  lab.afterRender = () => {
    const end = performance.now(), record = lab.recording;
    if (!record || !record.current) return;
    if (gl.isContextLost()) { finish(record, 'context-lost'); return; }
    const { frame, query } = record.current;
    if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); record.pending.push({ frame, query }); }
    record.current = null;
    frame.renderEndMs = end; frame.cpuSubmitMs = end - frame.renderStartMs;
    frame.intervalMs = record.frames.length ? frame.renderStartMs - record.frames.at(-1).renderStartMs : null;
    frame.rendererInfo = rendererInfo(); record.frames.push(frame);
    const currentCamera = matrix();
    record.cameraEnd = currentCamera;
    record.cameraDelta = Math.max(record.cameraDelta, delta(record.cameraStart.world, currentCamera.world) ?? 0);
    record.projectionDelta = Math.max(record.projectionDelta, delta(record.cameraStart.projection, currentCamera.projection) ?? 0);
    if (document.visibilityState !== record.visibility) { record.visibilityChanges.push({ atMs: end, state: document.visibilityState }); record.visibility = document.visibilityState; }
    const currentConfiguration = configuration();
    record.configurationEnd = currentConfiguration;
    const previousConfiguration = record.configurationChanges.at(-1)?.configuration ?? record.configurationStart;
    if (JSON.stringify(currentConfiguration) !== JSON.stringify(previousConfiguration)) record.configurationChanges.push({ atMs: end, configuration: currentConfiguration });
    poll(record);
    if (gl.isContextLost()) { finish(record, 'context-lost'); return; }
    if (end - record.frames[0].renderStartMs >= record.seconds * 1000) {
      record.phase = 'draining'; record.drainStartMs = end;
      renderer.info.autoReset = record.originalAutoReset;
      if (!record.pending.length) finish(record);
    }
  };
  lab.stop = (reason = 'stopped') => { if (lab.recording) finish(lab.recording, reason); };
  lab.dispose = () => { lab.stop('disposed'); document.removeEventListener('visibilitychange', onVisibility); if (window.__performanceLab === lab) delete window.__performanceLab; };
  lab.configuration = configuration;
  window.__performanceLab = lab;
  return lab;
}
