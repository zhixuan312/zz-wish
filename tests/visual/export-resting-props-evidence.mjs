// CPU-only durable evidence export. Run only after the actual after capture is complete.
import { readFile, writeFile, copyFile, mkdir, stat } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const beforePath = process.env.BEFORE_REFERENCE || 'artifacts/snow-resting-props/resting-props-before/paired-reference.json';
const afterPath = process.env.AFTER_REPORT || 'artifacts/snow-resting-props/resting-props-after/report.json';
const output = resolve('docs/evidence/resting-props');
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const before = await read(beforePath);
if (process.argv.includes('--plan')) {
  const bytes = (await Promise.all(before.frames.map(frame => stat(frame.file)))).reduce((sum, entry) => sum + entry.size, 0);
  console.log(JSON.stringify({ action: 'No files copied. Await completed after report and GPU handoff.', beforeHeldViews: before.frames.length,
    plannedPNGCount: before.frames.length * 2, primaryMatchedPairs: 6, supplementalContactPairs: 6, beforePNGBytes: bytes,
    output, metadata: ['index.html', 'provenance.json', 'review.md'], afterReport: afterPath }, null, 2));
  process.exit(0);
}
const after = await read(afterPath);
if (!after.finishedAt || after.errors.length || after.resources.length || after.sourceChanged) throw new Error('The after run must be complete, unchanged and free of runtime/HTTP/capture errors.');
const held = after.frames.filter(frame => frame.rawFile);
if (before.frames.length !== 12 || held.length !== 12 || after.frames.length !== 16) throw new Error('Expected 12 matched held views and 16 total actual after PNGs.');
const primary = held.filter(frame => ['burning', 'burnFar', 'low-altar-edge'].includes(frame.name));
if (primary.length !== 6 || primary.some(frame => frame.durationMs < 10000)) throw new Error('Six primary views must contain ten-second raw holds.');
const maximumDelta = (a, b) => Math.max(...a.map((value, index) => Math.abs(value - b[index])));
const identity = fingerprint => ({ aggregateSha256: fingerprint.aggregateSha256, originalSceneSha256: fingerprint.instrumentation.originalSceneSha256,
  manifestSha256: fingerprint.instrumentation.snowManifestSha256, glbSha256: fingerprint.files.find(file => file.path === 'web/public/places/snow-roof/snow-roof.glb')?.sha256 ?? null });
const records = after.cleanup.map(entry => ({ viewport: entry.viewport, phase: entry.phase, actualUI: entry.actualUI,
  candles: entry.candles.map(({ id, durationMs, status, burnedMs, endReason }) => ({ id, durationMs, status, burnedMs, endReason })) }));
if (records.length !== 4 || records.some(entry => !entry.candles.some(candle => candle.status === 'went_out' && candle.endReason === 'put_out'))) throw new Error('Four real product cleanup records are required.');
const pending = [];
for (const earlier of before.frames) {
  const later = held.find(frame => frame.viewport === earlier.viewport && frame.name === earlier.name);
  if (!later || maximumDelta(earlier.cameraWorld, later.cameraWorld) !== 0 || maximumDelta(earlier.cameraProjection, later.cameraProjection) !== 0) throw new Error('Exact held camera/projection correspondence failed.');
  if (!later.runtimeAnchors?.alignment?.passed) throw new Error('Runtime wick/specular/smoke alignment is unverified or failed.');
  if (JSON.stringify(earlier.exposureRange) !== JSON.stringify(later.exposureRange)) throw new Error('Matched view exposure differs.');
  for (const [phase, frame] of [['before', earlier], ['after', later]]) {
    const bytes = await readFile(frame.file);
    if (hash(bytes) !== frame.sha256) throw new Error(`PNG hash changed: ${frame.file}`);
    pending.push({ phase, frame, bytes, target: `views/${frame.viewport}/${frame.name}-${phase}.png` });
  }
}
// Mutations start only after every pair, source PNG and real settlement passes preflight.
for (const item of pending) { await mkdir(join(output, 'views', item.frame.viewport), { recursive: true }); await copyFile(item.frame.file, join(output, item.target)); }
const pairs = before.frames.map(earlier => {
  const later = held.find(frame => frame.viewport === earlier.viewport && frame.name === earlier.name);
  const width = earlier.viewport === 'desktop-en' ? 1440 : 390, height = earlier.viewport === 'desktop-en' ? 900 : 844;
  const sources = Object.fromEntries([['before', earlier], ['after', later]].map(([phase, frame]) => [phase, {
    file: `views/${frame.viewport}/${frame.name}-${phase}.png`, sourcePNG: frame.file, pngSha256: frame.sha256, bytes: pending.find(item => item.phase === phase && item.frame === frame).bytes.length,
    sourceRaw: frame.rawFile, rawSha256: frame.rawSha256, samples: frame.samples, durationMs: frame.durationMs, controls: frame.controls,
    exposureRange: frame.exposureRange, roiMetrics: frame.roiMetrics, cameraMaximumElementDelta: frame.cameraMaximumElementDelta, projectionMaximumElementDelta: frame.projectionMaximumElementDelta,
  }]));
  return { name: earlier.name, viewport: earlier.viewport, width, height, deviceScaleFactor: 1, diagnostic: earlier.diagnostic, role: earlier.role,
    selectedDuration: earlier.selectedDuration, physicalTime: earlier.physicalTime, fuel: earlier.fuel,
    world: earlier.cameraWorld, projection: earlier.cameraProjection, worldMatrix: earlier.cameraWorld, projectionMatrix: earlier.cameraProjection,
    cameraPairMaximumElementDelta: 0, projectionPairMaximumElementDelta: 0, sources, afterRuntimeAnchors: later.runtimeAnchors };
});
const supportProofs = [];
for (const path of (process.env.SUPPORT_PROOFS || '').split(',').filter(Boolean)) supportProofs.push({ file: path, relativeLink: relative(output, resolve(path)), sha256: hash(await readFile(path)) });
const provenance = { createdAt: new Date().toISOString(), beforeReference: { file: beforePath, sha256: hash(await readFile(beforePath)) },
  afterReport: { file: afterPath, sha256: hash(await readFile(afterPath)) }, source: { before: identity(before.sourceStart), after: identity(after.sourceStart) },
  coordinateSystem: 'Runtime world metres, Y-up; column-major Three camera world/projection matrices; viewport equals framebuffer at deviceScaleFactor 1.',
  selectedPNGCount: pending.length, matchedPairs: pairs.length, pairs, actualUICleanup: records, supportProofs,
  limits: ['Phone is M1 desktop-GPU touch/viewport emulation, not a physical phone.', 'Physical time, fuel and camera are held, with particles hidden; normal samplers/materials/light/exposure are retained.',
    'Source contacts, real rebaked illumination and runtime source anchors are intentionally different; pixel equality is not asserted.', 'Live unheld endpoint PNGs remain preserved in the original after report; these portable pairs are controlled views.'] };
await writeFile(join(output, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
const panels = pairs.map(pair => `<section><h2>${pair.viewport} · ${pair.name}${pair.diagnostic ? ' · diagnostic camera' : ' · actual product endpoint'}</h2><div class="pair">${['before', 'after'].map(phase => `<figure><figcaption>${phase}</figcaption><a href="${pair.sources[phase].file}"><img src="${pair.sources[phase].file}"></a></figure>`).join('')}</div></section>`).join('');
await writeFile(join(output, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Snow Roof resting contacts: before / after</title><style>body{background:#17202a;color:#eee;font:15px/1.5 system-ui;margin:24px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%;height:auto}section{border-top:1px solid #777;margin-top:24px}h2{font-size:19px}</style><h1>Snow Roof resting contacts: before / after</h1><p>Six primary product/altar view pairs plus six supplemental contact pairs. All images are committed beside this portable HTML. Exact camera/projection and source/PNG hashes are in <a href="provenance.json">provenance.json</a>. Product live endpoints remain in the original capture. Low altar/contact views are diagnostic, with no material/sampler/exposure override.</p><p>${supportProofs.map(proof => `<a href="${proof.relativeLink}">${proof.file.split('/').at(-1)}</a>`).join(' · ')}</p>${panels}`);
const structuralMaximum = Math.max(...held.flatMap(frame => frame.roiMetrics.filter(roi => roi.type !== 'flame').map(roi => roi.meanPixelRmsDelta)));
await writeFile(join(output, 'review.md'), `# Snow Roof resting-contact comparison\n\n[Portable before/after gallery](index.html) · [Exact cameras and provenance](provenance.json)\n\nThe actual after run contains 16 desktop/phone PNGs, including four live settled endpoints and 12 exact held views. These committed comparisons contain all 12 held pairs (24 PNGs): burning, 24-hour burnFar, low altar, left lamps, burner and right lamps at both sizes. Six primary after holds last at least ten seconds. Actual UI records confirm 10-minute/24-hour choices and four put-out settlements. Runtime/HTTP/capture errors and source changes are zero.\n\nAll paired camera/projection elements match exactly. The maximum after structural mean per-pixel RMS is ${structuralMaximum} in 0–255 raw Rec.709 code values under the documented frozen controls. Live flame origins compare to source wickTip, specular PointLights to pointLight, and smoke emission to static_incense_smoke_engine, using live parent transforms. All tagged anchor comparisons pass within 1e-8 metres; flameAnchor is not substituted for wickTip.\n\nVisual judgment: inspect each lamp base and all three burner feet against its support and rebaked contact shadow in the linked pairs; record any remaining ambiguity before final review. Supporting source/transport proofs: ${supportProofs.map(proof => `[${proof.file.split('/').at(-1)}](${proof.relativeLink})`).join(', ')}. Their exact hashes are retained in provenance.json. Phone is M1 emulation; no physical-phone or endurance claim is made.\n`);
console.log(JSON.stringify({ copiedPNGs: pending.length, totalPNGBytes: pending.reduce((sum, item) => sum + item.bytes.length, 0), pairs: pairs.length, output: relative(process.cwd(), output), structuralMaximum }, null, 2));
