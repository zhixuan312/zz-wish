import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [baselineArg, candidateArg, referencesArg, outputArg] = process.argv.slice(2);
assert(baselineArg && candidateArg && referencesArg && outputArg,
  'Usage: node pine-realism-review.mjs BASELINE_CAPTURE CANDIDATE_CAPTURE_OR_DASH REFERENCE_DIR NEW_OUTPUT_DIR');
const baseline = resolve(baselineArg);
const candidate = candidateArg === '-' ? null : resolve(candidateArg);
const referenceDir = resolve(referencesArg);
const output = resolve(outputArg);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));

const sizes = {
  reveal: { stage: 'terrace-reveal-28s', rect: [390, 120, 1000, 620], reference: 'terrace' },
  wax: { stage: 'day-burning', rect: [330, 125, 780, 720], reference: 'candle' },
};
const imageSize = [1440, 900];
const signature = Buffer.from('89504e470d0a1a0a', 'hex');
const tiles = [];
const pairs = [];
const shots = {};

function distance(a, b) {
  return Math.hypot(...a.map((value, i) => value - b[i]));
}

function angle(a, b) {
  const cosine = a.reduce((dot, value, i) => dot + value * b[i], 0) / (Math.hypot(...a) * Math.hypot(...b));
  return Math.acos(Math.min(1, Math.max(-1, cosine))) * 180 / Math.PI;
}

async function verifyOriginalPng(source, expected) {
  const bytes = await readFile(source);
  assert(bytes.subarray(0, 8).equals(signature) && bytes.subarray(12, 16).toString() === 'IHDR');
  assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], imageSize);
  assert.equal(sha256(bytes), expected, `Original screenshot was modified: ${source}`);
}

async function solarEvidence(directory, report, day) {
  const config = report.solarConfig;
  assert(config.file === 'shared/pine-gate-daylight.json' && /^[a-f0-9]{64}$/.test(config.sha256));
  const theta = config.solarElevationDegrees * Math.PI / 180;
  // Cycles compiles the authored azimuth as 2π − azimuth before evaluating its sky.
  const cyclesAzimuth = 2 * Math.PI - config.solarAzimuthDegrees * Math.PI / 180;
  const expected = [-Math.cos(theta) * Math.sin(cyclesAzimuth), Math.sin(theta), -Math.cos(theta) * Math.cos(cyclesAzimuth)];
  const audit = day.solarDiagnostic;
  assert.equal(audit.file, 'diagnostics/solar-disc.png');
  assert.deepEqual(audit.pixels, imageSize);
  const source = join(directory, audit.file);
  await verifyOriginalPng(source, audit.sha256);
  const vectors = {};
  const errors = [];
  for (const [name, readout, diagnostic] of [
    ...day.shots.map(frame => [frame.file, frame.solar, false]),
    ['diagnostic-before', audit.before.solar, true], ['diagnostic-after', audit.after.solar, true],
  ]) {
    assert(readout.diagnostic === diagnostic && readout.lightType === 'DirectionalLight' && readout.bakedLighting);
    const deviation = {
      skyUniform: angle(readout.skyUniform, expected), skyWorld: angle(readout.skyDirection, expected),
      towardLight: angle(readout.towardLight, expected), lightToTarget: angle(readout.lightToTarget, expected.map(axis => -axis)),
    };
    if (Object.values(deviation).some(value => !Number.isFinite(value) || value > .03)) errors.push(`${name}: signed solar direction differs from the shared config.`);
    if (readout.liveCastShadow || !(readout.lightIntensity > 0)) errors.push(`${name}: unexpected live directional shadow or intensity.`);
    vectors[name] = { ...readout, deviationDegrees: deviation };
  }
  const normalized = audit.before.solar.projectedSky;
  const validProjection = ndc => ndc?.length === 2 && ndc.every(value => Number.isFinite(value) && Math.abs(value) < .7);
  assert(validProjection(normalized), 'The diagnostic camera did not project the sky disc in its visible interior.');
  if ([audit.before.solar.projectedLight, audit.after.solar.projectedSky, audit.after.solar.projectedLight]
    .some(ndc => !validProjection(ndc) || distance(normalized, ndc) > .001)) {
    errors.push('Diagnostic solar projection diverged or moved during capture.');
  }
  const pixel = [(normalized[0] + 1) * imageSize[0] / 2, (1 - normalized[1]) * imageSize[1] / 2];
  const projectedRadiusPixels = Math.tan(config.solarDiameterDegrees * Math.PI / 360)
    * imageSize[1] / (2 * Math.tan(audit.before.camera.fov * Math.PI / 360));
  return { config, expectedDirection: expected, source, sourceSha256: audit.sha256, pixel, projectedRadiusPixels, vectors, errors,
    scope: 'The sky disc and the directional light are live. The live Pine DirectionalLight casts no solar shadow. Static Pine surfaces use Cycles day lightmaps. Cycles shadow measurements have their own evidence.' };
}

let solar;

async function captureEvidence(directory, kind) {
  const report = await readJson(join(directory, 'report.json'));
  assert(report.directionVerified && report.delivery.preview && report.delivery.publicManifestUnchanged);
  assert.equal(report.cameraDrift, 'product default');
  assert(!report.runs.some(run => run.errors.length || run.viteUpdates.length), 'Capture contains errors or source drift.');
  if (kind === 'candidate') {
    assert(report.realismOnly);
    assert.equal(report.runs.length, 2);
    assert.deepEqual(report.frames, Object.values(sizes).map(view => view.stage));
    const phone = report.runs.find(run => run.realismPerformanceOnly);
    assert(phone?.label === 'phone-zh' && phone.visualHour === 13 && phone.performance.fps > 0);
    assert(report.delivery.realismBase.totalBytes <= 15_000_000);
    assert.deepEqual(phone.shots, []);
  }
  const run = report.runs.find(run => run.direction === 'day' && run.label === 'desktop-en');
  assert(run?.visualHour === 13 && run.label === 'desktop-en' && run.lighting.agx);
  assert(run.lighting.loadedPasses.includes('day'));
  const frames = {};
  for (const [key, view] of Object.entries(sizes)) {
    const file = `desktop-en/${view.stage}.png`;
    const shot = run.shots.find(frame => frame.file === file);
    assert(shot && !shot.camera.overview && shot.wax.baked);
    const source = join(directory, file);
    assert.deepEqual(shot.pixels, imageSize);
    await verifyOriginalPng(source, shot.sha256);
    if (key === 'reveal') {
      assert.equal(shot.targetWalkSeconds, 28);
      assert(shot.walkClock.seconds >= 28 && shot.walkClockAfter.seconds <= 28.9);
      assert.equal(shot.walkClock.durationSeconds, 30);
    } else {
      assert(shot.wax.state === 'burning' && shot.ignition.state === 'settled' && shot.wax.remaining > .99);
    }
    const tile = join(output, `${key}-${kind}.png`);
    frames[key] = { source: relative(output, source), sha256: shot.sha256, camera: shot.camera };
    tiles.push({ source, output: tile, rect: view.rect, sourceSize: imageSize });
  }
  shots[kind] = { sourceRev: report.sourceRev, manifestSha256: report.delivery.manifestSha256, frames };
  if (kind === 'candidate') solar = await solarEvidence(directory, report, run);
}

await captureEvidence(baseline, 'baseline');
if (candidate) {
  await captureEvidence(candidate, 'candidate');
  for (const key of Object.keys(sizes)) {
    const a = shots.baseline.frames[key].camera, b = shots.candidate.frames[key].camera;
    const motion = key === 'reveal';
    assert(distance(a.position, b.position) < (motion ? .20 : .015), `${key} camera position changed.`);
    assert(distance(a.direction, b.direction) < (motion ? .04 : .015), `${key} camera heading changed.`);
    assert(Math.abs(a.fov - b.fov) < (motion ? 1 : .05), `${key} lens changed.`);
  }
}

const references = await readJson(join(referenceDir, 'manifest.json'));
for (const [key, view] of Object.entries(sizes)) {
  const reference = references[view.reference];
  assert(reference.author && reference.title && reference.license && /^https:\/\//.test(reference.sourceUrl)
    && /^https:\/\//.test(reference.licenseUrl) && /^[a-z-]+\.jpg$/.test(reference.file));
  const source = join(referenceDir, reference.file);
  assert.equal(sha256(await readFile(source)), reference.sha256, `Reference changed: ${reference.file}`);
  assert.deepEqual(reference.crop.slice(2), view.rect.slice(2));
  const referenceTile = join(output, `${key}-photo.png`);
  const baselineTile = join(output, `${key}-baseline.png`);
  tiles.push({ source, output: referenceTile, rect: reference.crop, sourceSize: reference.dimensions });
  pairs.push({ left: referenceTile, right: baselineTile, output: join(output, `${key}-photo-vs-p1.png`) });
  if (candidate) {
    const candidateTile = join(output, `${key}-candidate.png`);
    pairs.push({ left: referenceTile, right: candidateTile, output: join(output, `${key}-photo-vs-r1.png`) });
    pairs.push({ left: baselineTile, right: candidateTile, output: join(output, `${key}-p1-vs-r1.png`) });
  }
}

const candlePhoto = references.candle;
tiles.push({ source: join(referenceDir, candlePhoto.file), output: join(output, 'wax-photo-flame.png'),
  rect: candlePhoto.flameCrop, sourceSize: candlePhoto.dimensions });

await mkdir(output);
const temporary = await mkdtemp(join(tmpdir(), 'pine-realism-pixels-'));
try {
  const config = join(temporary, 'pixels.json');
  const solarPixels = join(temporary, 'solar.json');
  await writeFile(config, JSON.stringify({ tiles, pairs,
    ...(solar ? { solar: { source: solar.source, expected: solar.pixel, output: solarPixels } } : {}) }));
  execFileSync('/usr/bin/swift', ['-module-cache-path', join(temporary, 'modules'),
    fileURLToPath(new URL('./pine-realism-pixels.swift', import.meta.url)), config], { stdio: 'inherit' });
  if (solar) {
    const result = await readJson(solarPixels);
    const offsetPixels = result.centroid ? distance(result.centroid, solar.pixel) : null;
    if (offsetPixels === null || offsetPixels > 8 || result.touchesSearchEdge || result.area < 12) {
      solar.errors.push('The bright disc could not be isolated within eight pixels of its projected direction.');
    }
    const summary = { ...solar, source: relative(output, solar.source), result, offsetPixels };
    await writeFile(join(output, 'solar-runtime.json'), JSON.stringify(summary, null, 2) + '\n');
    console.log('Solar disc observation', JSON.stringify({ expected: solar.pixel, measured: result.centroid,
      offsetPixels, contrast: result.contrast, area: result.area }));
  }
  const products = await Promise.all([...tiles, ...pairs].map(async item => ({ file: relative(output, item.output),
    sha256: sha256(await readFile(item.output)) })));
  await writeFile(join(output, 'comparison.json'), JSON.stringify({
    method: 'Unscaled native crops. Each cropped image and side-by-side was decoded again and verified against the exact source pixels in sRGB.',
    complete: !!candidate && !solar?.errors.length, views: sizes, shots, references, products,
    ...(solar ? { solarProof: { file: 'solar-runtime.json', errors: solar.errors } } : {}),
  }, null, 2) + '\n');
  if (solar) assert.deepEqual(solar.errors, [], 'Solar proof failed. Raster sheets and measurements are retained.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
