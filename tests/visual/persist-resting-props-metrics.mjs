// Durable CPU-only metrics from completed capture files. No browser or rendering.
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const output = 'docs/evidence/resting-props';
const capturePath = 'artifacts/snow-resting-props/resting-props-after/report.json';
const performancePath = 'artifacts/snow-performance/resting-props-after-phone/report.json';
const capture = await read(capturePath), before = await read('artifacts/snow-resting-props/resting-props-before/paired-reference.json');
const performance = await read(performancePath), performanceSummary = await read('artifacts/snow-performance/resting-props-after-phone/summary.json');
for (const report of [capture, performance]) if (!report.finishedAt || report.errors.length || report.sourceChanged) throw new Error('Only clean, completed and unchanged runs can be persisted.');
const held = capture.frames.filter(frame => frame.rawFile), primary = held.filter(frame => ['burning', 'burnFar', 'low-altar-edge'].includes(frame.name));
if (capture.frames.length !== 16 || held.length !== 12 || primary.length !== 6 || primary.some(frame => frame.durationMs < 10000)) throw new Error('Incomplete requested after coverage.');
const sourceIdentity = { originalSceneSha256: capture.sourceStart.instrumentation.originalSceneSha256, manifestSha256: capture.sourceStart.instrumentation.snowManifestSha256,
  glbSha256: capture.sourceStart.files.find(file => file.path === 'web/public/places/snow-roof/snow-roof.glb').sha256,
  descriptorSha256: capture.sourceStart.files.find(file => file.path === 'web/src/engine/places/snow-roof-baked.js').sha256,
  aggregateSha256: capture.sourceStart.aggregateSha256 };
const measurements = held.flatMap(frame => frame.runtimeAnchors.alignment.matches.map(measurement => ({ viewport: frame.viewport, view: frame.name, ...measurement })));
if (measurements.length !== 132 || measurements.some(measurement => !measurement.passed || !Number.isFinite(measurement.maximumElementDelta))) throw new Error('All 132 source/runtime anchor measurements are required.');
const maximumAnchorDelta = Math.max(...measurements.map(measurement => measurement.maximumElementDelta));
const anchorPath = `${output}/runtime-anchor-comparison.json`;
await writeFile(anchorPath, JSON.stringify({ source: sourceIdentity, captureReport: { file: capturePath, sha256: hash(await readFile(capturePath)) },
  contract: 'Six liveFlame group origins compare to source wickTip; four specular PointLight world positions compare to pointLight; smokeAt emission input is transformed through its real live parent and compared to static_incense_smoke_engine. The visible flame quad internally rises 2 mm; historical flameAnchor is not the liveFlame input.',
  heldViews: held.length, measurements: measurements.length, toleranceMetres: 1e-8, maximumElementDeltaMetres: maximumAnchorDelta, records: measurements }, null, 2) + '\n');
const maxDelta = (a, b) => Math.max(...a.map((value, index) => Math.abs(value - b[index])));
const endpoints = held.filter(frame => !frame.diagnostic).map(frame => { const old = before.frames.find(item => item.name === frame.name && item.viewport === frame.viewport); return {
  viewport: frame.viewport, view: frame.name, actualRigPosition: frame.rig.position, actualRigLook: frame.rig.look, actualRigFov: frame.rig.fov,
  actualRigPositionBeforeDelta: maxDelta(frame.rig.position, old.rig.position), actualRigLookBeforeDelta: maxDelta(frame.rig.look, old.rig.look), actualRigFovBeforeDelta: Math.abs(frame.rig.fov - old.rig.fov), ignition: frame.ignition }; });
const captureSummary = { source: sourceIdentity, sourceReport: { file: capturePath, sha256: hash(await readFile(capturePath)) },
  afterPNGs: capture.frames.length, liveEndpointPNGsInOriginalReport: 4, durableAfterHeldPNGs: 12, durableBeforeAfterPNGs: 24, primaryTenSecondHolds: primary.length,
  runtimeErrors: capture.errors, httpErrors: capture.resources, sourceChanged: capture.sourceChanged, maximumFrozenRoiMeanPixelRmsDelta: Math.max(...held.flatMap(frame => frame.roiMetrics.map(roi => roi.meanPixelRmsDelta))),
  maximumHeldCameraElementDelta: Math.max(...held.map(frame => frame.cameraMaximumElementDelta)), maximumHeldProjectionElementDelta: Math.max(...held.map(frame => frame.projectionMaximumElementDelta)),
  maximumPairedCameraElementDelta: Math.max(...held.map(frame => frame.referenceCameraMaximumElementDelta)), maximumPairedProjectionElementDelta: Math.max(...held.map(frame => frame.referenceProjectionMaximumElementDelta)),
  runtimeAnchors: { file: 'runtime-anchor-comparison.json', sha256: hash(await readFile(anchorPath)), actualMeasurements: measurements.length, maximumElementDeltaMetres: maximumAnchorDelta }, actualProductEndpoints: endpoints,
  holds: held.map(frame => ({ viewport: frame.viewport, view: frame.name, diagnostic: frame.diagnostic, samples: frame.samples, durationMs: frame.durationMs, physicalTime: frame.physicalTime, fuel: frame.fuel,
    rawFile: frame.rawFile, rawSha256: frame.rawSha256, exposureRange: frame.exposureRange, controls: frame.controls, visibleParticleObjectsRange: frame.visibleParticleObjectsRange, roiMetrics: frame.roiMetrics })),
  actualUICleanup: capture.cleanup.map(entry => ({ viewport: entry.viewport, phase: entry.phase, actualUI: entry.actualUI,
    candles: entry.candles.map(({ id, durationMs, burnedMs, status, endReason }) => ({ id, durationMs, burnedMs, status, endReason })) })),
  scope: 'Exact held views retain normal materials, samplers, exposure and bloom, with fixed time/fuel/camera and particles hidden. Raw Rec.709 luminance is measured in 0–255 code values; structural rectangles are not semantic masks. Phone is M1 emulation at deviceScaleFactor1.' };
await writeFile(`${output}/after-capture-summary.json`, JSON.stringify(captureSummary, null, 2) + '\n');
if (performance.samples.length !== 1) throw new Error('Expected exactly one phone performance window.');
const sample = performance.samples[0], window = performanceSummary.windows[0];
const geometry = async root => { const bytes = await readFile(join(root, 'web/public/places/snow-roof/snow-roof.glb')), gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()); let vertices = 0, triangles = 0;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) { if ((primitive.mode ?? 4) !== 4) throw new Error('Unexpected nontriangle mode.'); vertices += gltf.accessors[primitive.attributes.POSITION].count; triangles += gltf.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3; }
  return { bytes: bytes.length, vertices, triangles }; };
const beforeGeometry = await geometry(before.sourceStart.root), afterGeometry = await geometry(capture.sourceStart.root);
const timing = { source: sourceIdentity, sourceReport: { file: performancePath, sha256: hash(await readFile(performancePath)) }, intendedCapFPS: 30, seconds: 10,
  fps: sample.fps, renderedFrames: sample.renderedFrames, intervals: sample.intervals, intervalDistribution: window.intervalDistribution, rafDeltaDistribution: window.rafDeltaDistribution,
  cpuSubmit: sample.cpuSubmit, gpu: sample.gpu, valid: sample.valid, validation: sample.validation, visibilityStart: sample.visibilityStart, visibilityChanges: sample.visibilityChanges, configurationChanges: sample.configurationChanges,
  configurationStart: sample.configurationStart, configurationEnd: sample.configurationEnd, cameraMaximumElementDelta: sample.cameraMaximumElementDelta, projectionMaximumElementDelta: sample.projectionMaximumElementDelta,
  runtime: performance.runtime, precondition: sample.precondition, delivery: { materialProfile: sample.deliveryStart.materialProfile, lightmapCodec: sample.deliveryStart.lightmapCodec, lightingState: sample.deliveryStart.lightingState },
  actualUICleanup: performanceSummary.actualUICleanup, errors: performance.errors, httpErrors: performance.resources, sourceChanged: performance.sourceChanged,
  geometry: { before: beforeGeometry, after: afterGeometry, triangleDelta: afterGeometry.triangles - beforeGeometry.triangles, vertexDelta: afterGeometry.vertices - beforeGeometry.vertices },
  timingScope: sample.timingScope, interpretation: 'One headed Chrome Metal no-video/no-readback window on M1 phone viewport/touch emulation at deviceScaleFactor 2. The mean is 30 FPS and GPU p95 is within 33.33 ms; interval p95 is 48.42 ms with 24 short and 24 long intervals. No improved frame-pacing claim or cause attribution is made.' };
await mkdir(`${output}/performance`, { recursive: true });
await writeFile(`${output}/performance/phone-burning.json`, JSON.stringify(timing, null, 2) + '\n');
await copyFile('artifacts/snow-performance/resting-props-after-phone/frames.csv', `${output}/performance/frames.csv`);
const provenancePath = `${output}/provenance.json`, provenance = await read(provenancePath);
for (const name of ['runtime-anchor-comparison.json', 'after-capture-summary.json', 'performance/phone-burning.json', 'performance/frames.csv']) {
  const entry = { file: `${output}/${name}`, relativeLink: name, sha256: hash(await readFile(`${output}/${name}`)) };
  provenance.supportProofs = [...provenance.supportProofs.filter(proof => proof.file !== entry.file), entry];
}
await writeFile(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
const indexPath = `${output}/index.html`, index = (await readFile(indexPath, 'utf8')).replace(/<p><a href="after-capture-summary.json">[\s\S]*?<\/p>/, '');
await writeFile(indexPath, index.replace('</h1>', '</h1><p><a href="after-capture-summary.json">Capture summary</a> · <a href="runtime-anchor-comparison.json">132 actual runtime anchor measurements</a> · <a href="performance/phone-burning.json">Single phone timing result</a> · <a href="performance/frames.csv">Per-frame timing CSV</a></p>'));
console.log(JSON.stringify({ heldViews: held.length, actualAnchorMeasurements: measurements.length, anchorMaximumElementDeltaMetres: maximumAnchorDelta,
  afterCaptureSummary: `${output}/after-capture-summary.json`, anchors: anchorPath, performance: `${output}/performance/phone-burning.json`, intervalP95Ms: sample.intervals.p95Ms, geometryTriangleDelta: timing.geometry.triangleDelta }, null, 2));
