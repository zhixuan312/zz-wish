// Read existing capture files only. This does not launch a browser or a test suite.
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, relative, join } from 'node:path';

const evidence = process.env.EVIDENCE || 'before';
const root = resolve(`artifacts/snow-journey/${evidence}`);
const out = resolve('docs/evidence/snow-journey');
const reportBytes = await readFile(join(root, 'report.json'));
const report = JSON.parse(reportBytes);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const range = values => [Math.min(...values), Math.max(...values)];
const rel = path => relative(process.cwd(), path);
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const invalidParticleControl = evidence === 'before';
const validity = {
  normalJourneySequences: 'Valid camera-still raw framebuffer observations with normal scene animation.',
  temporalGradeCausalProbe: 'Valid. Both controls freeze physical animation; changing only the temporal grade time causes the measured pixel changes.',
  particleIsolation: invalidParticleControl ? 'Invalid for causal particle isolation: this run hid particle objects once, but weather update code re-enabled their visibility. The raw numbers are retained unchanged. The corrected helper hides them every render and records visible particle object counts; a rerun is pending GPU handoff.' : 'Check visibleParticles telemetry is zero throughout the intended particle-hidden control.',
  allStaticControl: 'Valid static-image observation. Even if particle object visibility is re-enabled, their animation clock is frozen. This does not prove that every particle is hidden.',
};

const sequences = [];
for (const item of report.sequences) {
  const path = resolve(item.rawFile);
  const bytes = await readFile(path);
  const raw = JSON.parse(bytes);
  const samples = raw.samples.slice(1);
  const lights = [...new Set(raw.samples.flatMap(sample => sample.lights.map(light => light.id)))].map(id => {
    const rows = raw.samples.map(sample => sample.lights.find(light => light.id === id)).filter(Boolean);
    const start = rows[0].position;
    return { id, type: rows[0].type, intensityRange: range(rows.map(row => row.intensity)), maximumWorldPositionDelta: Math.max(...rows.flatMap(row => row.position.map((value, index) => Math.abs(value - start[index])))) };
  });
  sequences.push({
    viewport: item.viewport, name: item.name, sourceFile: rel(path), sha256: hash(bytes),
    validity: invalidParticleControl && item.name === 'diagnostic-burning-fixed-grade-no-particles' ? 'Invalid particle-isolation control; do not use to attribute residual flicker.' : 'Valid within the stated controls and ROI limits.',
    renderedFrames: raw.samples.length, durationMs: raw.samples.at(-1).elapsedMs,
    observedRenderedFramesPerSecond: (raw.samples.length - 1) / (raw.samples.at(-1).elapsedMs / 1000),
    cameraMaximumElementDelta: raw.cameraMaximumElementDelta,
    projectionMaximumElementDelta: raw.projectionMaximumElementDelta,
    controls: raw.controls, place: raw.place ?? null,renderInfo:raw.renderInfo??null, lamp: raw.lamp ?? null, walk: raw.walk ?? null,
    temporalGradeUniformPresent: raw.temporalGradeUniformPresent ?? null,
    exposureRange: range(raw.samples.map(sample => sample.exposure)),
    bloomStrengthRange: range(raw.samples.map(sample => sample.bloomStrength)),
    bloomThresholdRange: range(raw.samples.map(sample => sample.bloomThreshold)),
    visibleParticleObjectsRange: raw.samples.every(sample => Number.isFinite(sample.visibleParticles)) ? range(raw.samples.map(sample => sample.visibleParticles)) : null,
    lampMatrixMaximumElementDelta: raw.samples.every(sample => sample.lampWorldMatrix) ? Math.max(...raw.samples.flatMap(sample => sample.lampWorldMatrix.map((value, index) => Math.abs(value - raw.samples[0].lampWorldMatrix[index])))) : null,
    burnRanges: raw.samples.every(sample => sample.burn) ? Object.fromEntries(Object.keys(raw.samples[0].burn).filter(key => typeof raw.samples[0].burn[key] === 'number').map(key => [key, range(raw.samples.map(sample => sample.burn[key]))])) : null,
    shadowMapAutoUpdateValues: [...new Set(raw.samples.map(sample => sample.shadowMapAutoUpdate).filter(value => value !== undefined))],
    lights,
    rois: raw.rois.map(roi => {
      const rows = samples.map(sample => sample.rois[roi.name]);
      return { name: roi.name, type: roi.type, overlapsLampBodyBounds: roi.overlapsLampBodyBounds ?? null, pixels: roi.pixels, rawLuminance: roi.rawLuminance ?? null, meanLuminance: mean(rows.map(row => row.mean)), meanPixelRmsDelta: mean(rows.map(row => row.rmsDelta)), maximumPixelRmsDelta: Math.max(...rows.map(row => row.rmsDelta)), meanAbsoluteRoiMeanDelta: mean(rows.map(row => Math.abs(row.signedMeanDelta))), meanChangedPixelFraction: mean(rows.map(row => row.changedPixelFraction)), meanOver3LsbPixelFraction: mean(rows.map(row => row.over3LsbFraction)), retainedRawFramesByteIdentical: roi.raw.every(frame => frame.rgbaBase64 === roi.raw[0].rgbaBase64) };
    }),
  });
}

let source = report.sourceFingerprints ?? null;
if (evidence === 'before') {
  const baseline = '/tmp/one-light-snow-single-baseline';
  const revision = execFileSync('git', ['rev-parse', '9d1b680'], { encoding: 'utf8' }).trim();
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', revision, '--', 'web/src'], { encoding: 'utf8' }).trim().split('\n');
  const files = [];
  for (const path of paths) {
    try {
      const snapshotPath = join(baseline, path + (path.endsWith('/scene.js') ? '.uninstrumented' : ''));
      const bytes = await readFile(snapshotPath);
      const committed = execFileSync('git', ['show', `${revision}:${path}`]);
      files.push({ path, sha256: hash(bytes), matchesCommittedRevision: bytes.equals(committed) });
    } catch (error) { files.push({ path, error: error.message }); }
  }
  source = { label: 'Actual procedural before state; Blender-baked Snow Roof was not active.', frozenCheckout: baseline, committedRevision: revision, frontendFiles: files, originalSceneSha256: files.find(file => file.path.endsWith('/scene.js'))?.sha256, snapshotOnlyChanges: ['Raw framebuffer capture helper and scene instrumentation.', 'Vite API proxy uses the isolated API on port 8792.', 'Camera drift disabled and walk inspection holds for measurement.'] };
}

const screenshots = await Promise.all(report.views.map(async view => {
  const path = join(root, view.viewport, `${view.name}.png`), bytes = await readFile(path);
  return { ...view, file: rel(path), sha256: hash(bytes), bytes: bytes.length };
}));
const videos = [];
for (const viewport of [...new Set(report.views.map(view => view.viewport))]) {
  for (const file of await readdir(join(root, viewport, 'video'))) {
    const path = join(root, viewport, 'video', file);
    videos.push({ viewport, role: report.videos?.find(video => resolve(video.file) === path)?.role ?? 'whole-UI-journey', file: rel(path), bytes: (await stat(path)).size });
  }
}
const records = report.records.map(record => ({ viewport: record.viewport, stage: record.stage, hiddenObserved: record.hiddenObserved ?? null, candles: record.candles.map(candle => ({ id: candle.id, wishId: candle.wishId, placeId: candle.placeId, durationMs: candle.durationMs, status: candle.status, burnedMs: candle.burnedMs, endReason: candle.endReason })) }));
const summary = {
  evidence, source, runtime: report.runtime ?? null, capturedAt: report.createdAt, finishedAt: report.finishedAt,
  method: 'Ten-second sequences read raw display RGB framebuffer regions immediately after rendering. Rec.709 weighted luminance is measured on a 0–255 code-value scale before video encoding. Per-pixel frame-to-frame RMS is averaged over the sequence; ROI mean deltas are reported separately.',
  validity,
  coverage: { screenshots: screenshots.length, tenSecondSequences: sequences.length, allCameraMatricesExactlyStill: sequences.every(sequence => sequence.cameraMaximumElementDelta === 0), allProjectionMatricesExactlyStill: sequences.every(sequence => sequence.projectionMaximumElementDelta === 0), viewports: ['1440×900 desktop, English primary language', '390×844 touch emulation, Chinese primary language'], originalHomeCoverRetained: true, onlySnowRoofJourneySelected: true },
  verification: { productPageErrors: report.errors.filter(error=>error.stack&&!error.fatal),captureFailures:report.errors.filter(error=>!error.stack||error.fatal), consoleAndHttpErrorLog: report.consoleErrors, visibilityEvents: report.visibilityEvents ?? [], interactions: report.interactions ?? [], horizontalOverflowFindings: screenshots.flatMap(view => view.layoutOverflow.map(finding => ({ viewport: view.viewport, state: view.name, finding }))), savedRecords: records },
  limits: [
    'The phone is a desktop-GPU viewport/touch emulation, not a physical phone performance measurement.',
    'Raw framebuffer statistics exclude HTML overlays. Canvas ROIs behind opaque panels describe the underlying 3D scene, while the PNGs and video show the actual composite UI.',
    'Rectangular structural ROIs can be crossed by weather and dust. They are not semantic geometry masks.',
    'The projected flame-position ROI can include a translucent shade; it is a control region, not a guaranteed unobstructed flame-only mask.',
    'The initial before runner did not retain HTTP response URLs. Three console 404 messages are preserved without conclusively attributing all of them to a resource.',
    'Walk captures use the actual continuous path with pauses after crossing progress thresholds 0.25, 0.50 and 0.75. Exact progress/position at each pause was not retained in the original raw files.',
    'Natural completion is actual product settlement with controlled client/server clock acceleration in the isolated visual database. It is not a ten-minute endurance burn.',
    'No audible sound, keyboard/screen-reader pass, browser zoom pass or physical-device thermal/endurance measurement was performed.',
    'Observed frame rates include synchronous raw readback and video capture. They are instrumentation timing, not an uninstrumented performance benchmark.',
  ],
  report: { file: rel(join(root, 'report.json')), sha256: hash(reportBytes) }, screenshots, videos, sequences,
};
await mkdir(out, { recursive: true });
await writeFile(join(out, `${evidence}-summary.json`), JSON.stringify(summary, null, 2) + '\n');
await writeFile(join(out, `${evidence}-validity.json`), JSON.stringify({ evidence, reportSha256: hash(reportBytes), validity }, null, 2) + '\n');

const link = path => escape(relative(out, resolve(path)));
const figures = viewport => screenshots.filter(view => view.viewport === viewport).map((view, index) => `<figure id="${escape(viewport)}-${escape(view.name)}"><figcaption>${index + 1}. ${escape(view.name)}</figcaption><a href="${link(view.file)}"><img loading="lazy" src="${link(view.file)}" alt="${escape(viewport)}: ${escape(view.name)}"></a></figure>`).join('\n');
const tableRows = sequences.map(sequence => `<tr><td><a href="${link(sequence.sourceFile)}">${escape(sequence.viewport)} / ${escape(sequence.name)}</a></td><td>${sequence.renderedFrames}</td><td>${sequence.cameraMaximumElementDelta}</td><td>${sequence.rois.filter(roi => roi.type === 'structure').map(roi => `${escape(roi.name)}: ${roi.meanPixelRmsDelta.toFixed(6)}`).join('<br>')}</td><td>${escape(sequence.validity)}</td></tr>`).join('\n');
const phaseDescription = report.state === 'after' ? 'This is the frozen after delivery. Check each Snow Roof sequence has baked=true and the delivered manifest in its metadata.' : 'This is the frozen procedural before state. It does not show the Blender-baked delivery.';
const particleNote = invalidParticleControl ? 'The original “fixed grade, no particles” control is invalid as particle isolation: weather code re-enabled visibility. Its numbers are preserved, and no particle-causality claim is made. The fully frozen image control and temporal-grade isolation remain valid.' : 'Diagnostic controls are identified separately from normal product behavior. Check particle-object counts, camera matrices, fuel, lamp transforms and daylight telemetry before attributing residual changes.';
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Snow Roof ${escape(evidence)} evidence</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:32px;color:#24221d;background:#f6f3eb}main{max-width:1500px;margin:auto}h1{font-family:Georgia,serif}a{color:#67420e}p{max-width:90ch}.note{border-left:4px solid #bb7d28;padding:12px;background:#fff8e8}.gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.phone{grid-template-columns:repeat(4,minmax(0,1fr))}figure{margin:0;background:white;border:1px solid #d5ccbb}figcaption{padding:8px 12px}img{display:block;width:100%;height:auto}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #cfc6b5;padding:8px;text-align:left;vertical-align:top}.links{display:flex;gap:20px;flex-wrap:wrap}@media(max-width:700px){body{margin:16px}.gallery,.phone{grid-template-columns:1fr}}</style><main><h1>Snow Roof: ${escape(evidence)} evidence</h1><p>${phaseDescription} The original home cover remains part of the journey.</p><p>${screenshots.length} screenshot states and ${sequences.length} ten-second raw-frame sequences cover both sizes. Camera and projection stillness: ${summary.coverage.allCameraMatricesExactlyStill && summary.coverage.allProjectionMatricesExactlyStill ? 'all matrices exactly unchanged' : 'movement detected; inspect the error log'}.</p><div class="links"><a href="${evidence}-summary.json">Exact summary and hashes</a><a href="${evidence}-validity.json">Diagnostic validity</a><a href="flicker-findings.md">Measured flicker findings</a><a href="before-review.md">Before journey review</a></div><p class="note">${particleNote}</p><h2>Videos</h2>${videos.map(video => `<p><a href="${link(video.file)}">${escape(video.viewport)} · ${escape(video.role)} video</a> (${(video.bytes / 1048576).toFixed(1)} MiB)</p>`).join('')}<h2>Desktop · 1440 × 900</h2><div class="gallery">${figures('desktop-en')}</div><h2>Phone · 390 × 844 touch emulation</h2><div class="gallery phone">${figures('phone-zh')}</div><h2>Raw-frame sequence measurements</h2><p>RMS uses luminance code levels / 255. Rectangular ROIs may be crossed by particles. Click a sequence for retained raw ROI samples and per-rendered-frame telemetry.</p><table><thead><tr><th>Sequence</th><th>Frames</th><th>Camera delta</th><th>Mean per-pixel RMS</th><th>Validity</th></tr></thead><tbody>${tableRows}</tbody></table><h2>Limits</h2><ul>${summary.limits.map(limit => `<li>${escape(limit)}</li>`).join('')}</ul></main></html>`;
await writeFile(join(out, `${evidence}-journey.html`), html);
console.log(JSON.stringify({ file: rel(join(out, `${evidence}-summary.json`)), screenshots: screenshots.length, sequences: sequences.length, allCamerasStill: summary.coverage.allCameraMatricesExactlyStill, frontendFilesMatchingRevision: source?.frontendFiles.filter(file => file.matchesCommittedRevision).length, frontendFilesTotal: source?.frontendFiles.length }, null, 2));
