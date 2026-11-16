// CPU-only index of real UI before/after contact captures. No browser or renderer.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative, join } from 'node:path';
import { createHash } from 'node:crypto';

const root = 'artifacts/snow-resting-props';
const state = process.env.STATE || 'before';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const originalPath = `${root}/resting-props-${state}/report.json`;
const original = await read(originalPath), output = dirname(originalPath);
const reports = [{ path: originalPath, data: original }];
if (state === 'before') for (const tag of ['before-overview-repair', 'before-phone-contact-repair']) {
  const path = `${root}/resting-props-${tag}/report.json`; reports.push({ path, data: await read(path) });
}
for (const { path, data } of reports) if (!data.finishedAt || data.errors.length || data.resources.length || data.sourceChanged) throw new Error(`Invalid completed capture: ${path}`);
const selected = original.frames.map(frame => {
  const replacement = reports.slice(1).flatMap(report => report.data.frames).find(candidate => candidate.rawFile && candidate.viewport === frame.viewport && candidate.name === frame.name);
  return replacement || frame;
});
const held = selected.filter(frame => frame.rawFile);
if (held.length !== 12) throw new Error('Expected six exact held views at each size.');
const sources = await Promise.all(reports.map(async report => ({ file: report.path, sha256: hash(await readFile(report.path)), sourceSceneSha256: report.data.sourceStart.instrumentation.originalSceneSha256, manifestSha256: report.data.sourceStart.instrumentation.snowManifestSha256 })));
if (sources.some(source => source.sourceSceneSha256 !== sources[0].sourceSceneSha256 || source.manifestSha256 !== sources[0].manifestSha256)) throw new Error('Capture source/manifest changed between framing repairs.');
const reference = { state, createdAt: new Date().toISOString(), sourceStart: original.sourceStart, sources, frames: held, notes: [
  'Selected exact held views only. Live endpoint PNGs and all initial framing attempts remain preserved in the original reports.',
  'Desktop low overview replaces its clipped first attempt; three phone contact close-ups replace initially narrow cropped attempts. Materials, exposure, lighting and source/assets were unchanged.',
  'Use these exact world and projection matrices for the after comparison and native camera references. Diagnostic camera views are explicitly labelled.' ] };
await writeFile(join(output, 'paired-reference.json'), JSON.stringify(reference, null, 2) + '\n');
const cameras = [];
for (const frame of held) {
  const raw = await read(frame.rawFile);
  cameras.push({ name: frame.name, viewport: frame.viewport, width: raw.width, height: raw.height, deviceScaleFactor: 1, diagnostic: frame.diagnostic, role: frame.role,
    sourceImage: frame.file, sourceRaw: frame.rawFile, physicalTime: frame.physicalTime, fuel: frame.fuel, controls: frame.controls,
    position: frame.cameraWorld.slice(12, 15), look: frame.rig.look, verticalFovDegrees: 2 * Math.atan(1 / frame.cameraProjection[5]) * 180 / Math.PI,
    world: frame.cameraWorld, projection: frame.cameraProjection, worldMatrix: frame.cameraWorld, projectionMatrix: frame.cameraProjection,
    sourceSceneSha256: sources[0].sourceSceneSha256, manifestSha256: sources[0].manifestSha256, selectedDuration: frame.selectedDuration });
}
await writeFile(join(output, 'native-cameras.json'), JSON.stringify({ coordinateSystem: 'Runtime world metres, Y up. Column-major Three camera world and projection matrices. Width/height are both CSS and framebuffer pixels at DPR 1. Native Blender conversion must preserve this projection.', sources, cameras }, null, 2) + '\n');
const tenSecond = held.filter(frame => frame.durationMs >= 10000);
const allRms = held.flatMap(frame => frame.roiMetrics.map(roi => roi.meanPixelRmsDelta));
const compact = { state, sources, selectedFrames: selected.length, heldFrames: held.length, tenSecondHolds: tenSecond.length,
  maximumCameraElementDelta: Math.max(...held.map(frame => frame.cameraMaximumElementDelta)), maximumProjectionElementDelta: Math.max(...held.map(frame => frame.projectionMaximumElementDelta)),
  maximumMeanPixelRmsDelta: Math.max(...allRms), runtimeErrors: reports.flatMap(report => report.data.errors), httpErrors: reports.flatMap(report => report.data.resources),
  actualPutOutRecords: reports.flatMap(report => report.data.cleanup.map(cleanup => ({ viewport: cleanup.viewport, phase: cleanup.phase, candles: cleanup.candles }))),
  frames: held.map(({ viewport, name, file, rawFile, role, diagnostic, selectedDuration, cameraWorld, cameraProjection, physicalTime, fuel, samples, durationMs, roiMetrics, exposureRange }) => ({ viewport, name, file, rawFile, role, diagnostic, selectedDuration, cameraWorld, cameraProjection, physicalTime, fuel, samples, durationMs, roiMetrics, exposureRange })) };
await writeFile(join(output, 'summary.json'), JSON.stringify(compact, null, 2) + '\n');
const panels = selected.map(frame => `<section><h2>${frame.viewport} · ${frame.name}</h2><p>${frame.role}</p><a href="${relative(resolve(output), resolve(frame.file))}"><img src="${relative(resolve(output), resolve(frame.file))}"></a></section>`).join('');
await writeFile(join(output, 'selected-gallery.html'), `<!doctype html><meta charset="utf-8"><title>Resting props ${state}: selected evidence</title><style>body{background:#17202a;color:#eee;font:15px/1.5 system-ui;margin:24px}img{max-width:100%;height:auto}section{border-top:1px solid #777;margin-top:24px}h2{font-size:19px}</style><h1>Resting props ${state}: selected evidence</h1><p>Actual 10-minute burning and 24-hour burnFar endpoints, plus explicitly diagnostic low altar/left/burner/right views. Before pairing holds time 17, full fuel and exact camera, hides particles, and retains normal samplers/materials/light/exposure. The first clipped desktop overview and narrow phone contact attempts remain in original reports, but the repaired views are selected here. <a href="paired-reference.json">Exact paired reference</a> · <a href="native-cameras.json">Native camera aliases</a> · <a href="report.json">Original report</a></p>${panels}`);
if (state === 'after') {
  const beforePath = process.env.REFERENCE_REPORT || `${root}/resting-props-before/paired-reference.json`, before = await read(beforePath);
  const maximumDelta = (a, b) => Math.max(...a.map((value, index) => Math.abs(value - b[index])));
  const pairs = held.map(after => {
    const earlier = before.frames.find(frame => frame.viewport === after.viewport && frame.name === after.name);
    if (!earlier) throw new Error(`Before pair missing: ${after.viewport}/${after.name}`);
    const cameraDelta = maximumDelta(earlier.cameraWorld, after.cameraWorld), projectionDelta = maximumDelta(earlier.cameraProjection, after.cameraProjection);
    if (cameraDelta !== 0 || projectionDelta !== 0) throw new Error('Exact after camera pairing failed.');
    return { viewport: after.viewport, name: after.name, diagnostic: after.diagnostic, before: earlier.file, after: after.file, beforeRaw: earlier.rawFile, afterRaw: after.rawFile, cameraDelta, projectionDelta, physicalTime: after.physicalTime, fuel: after.fuel };
  });
  await writeFile(join(output, 'comparison.json'), JSON.stringify({ beforeReference: beforePath, afterReport: originalPath, pairs,
    note: 'Held physical time/camera match exactly. Source contact geometry, real rebaked illumination and corrected runtime emitter anchors are intentionally different; pixel equality is not asserted.' }, null, 2) + '\n');
  const pairPanels = pairs.map(pair => `<section><h2>${pair.viewport} · ${pair.name}${pair.diagnostic ? ' · diagnostic camera' : ' · actual product endpoint'}</h2><div class="pair">${['before', 'after'].map(phase => `<figure><figcaption>${phase}</figcaption><a href="${relative(resolve(output), resolve(pair[phase]))}"><img src="${relative(resolve(output), resolve(pair[phase]))}"></a></figure>`).join('')}</div></section>`).join('');
  await writeFile(join(output, 'comparison.html'), `<!doctype html><meta charset="utf-8"><title>Resting props before / after</title><style>body{background:#17202a;color:#eee;font:15px/1.5 system-ui;margin:24px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%;height:auto}section{border-top:1px solid #777;margin-top:24px}h2{font-size:19px}</style><h1>Resting props before / after</h1><p>Exact held camera/projection and physical phase. Normal materials, samplers, lighting controls and exposure. Rebuilt contacts and actual rebaked illumination are intentionally different. Diagnostic views are labelled; live unheld endpoints remain in the separate gallery.</p>${pairPanels}`);
}
console.log(JSON.stringify({ state, selectedFrames: selected.length, heldFrames: held.length, tenSecondHolds: tenSecond.length, maximumMeanPixelRmsDelta: compact.maximumMeanPixelRmsDelta, reference: join(output, 'paired-reference.json'), cameras: join(output, 'native-cameras.json') }, null, 2));
