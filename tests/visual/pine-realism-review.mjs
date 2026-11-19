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
    const bytes = await readFile(source);
    assert(bytes.subarray(0, 8).equals(signature) && bytes.subarray(12, 16).toString() === 'IHDR');
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], imageSize);
    assert.deepEqual(shot.pixels, imageSize);
    assert.equal(sha256(bytes), shot.sha256, `Original screenshot was modified: ${file}`);
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
  await writeFile(config, JSON.stringify({ tiles, pairs }));
  execFileSync('/usr/bin/swift', ['-module-cache-path', join(temporary, 'modules'),
    fileURLToPath(new URL('./pine-realism-pixels.swift', import.meta.url)), config], { stdio: 'inherit' });
  const products = await Promise.all([...tiles, ...pairs].map(async item => ({ file: relative(output, item.output),
    sha256: sha256(await readFile(item.output)) })));
  await writeFile(join(output, 'comparison.json'), JSON.stringify({
    method: 'Unscaled native crops. Each cropped image and side-by-side was decoded again and verified against the exact source pixels in sRGB.',
    complete: !!candidate, views: sizes, shots, references, products,
  }, null, 2) + '\n');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
