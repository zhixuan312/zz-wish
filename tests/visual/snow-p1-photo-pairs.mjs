import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const usage = 'Usage: node tests/visual/snow-p1-photo-pairs.mjs [--p2] CAPTURE_REPORT REFERENCE_DIR NEW_OUTPUT_DIR';
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log(usage);
  process.exit(0);
}
const p2 = args[0] === '--p2';
const milestone = p2 ? 'P2' : 'P1';
if (p2) args.shift();
assert.equal(args.length, 3, usage);
const [captureReport, referenceDir, output] = args.map(path => resolve(path));

const p1Stages = {
  'snow-road-06s': { reference: '01-snow-road', hour: 13, seconds: 6 },
  'gate-lights-17s': { reference: '02-distant-gate-lamps', hour: 13, seconds: 17 },
  'gate-shadow-24s': { reference: '03-gate-threshold', hour: 13, seconds: 24 },
  'court-peak-28s': { reference: '04-court-and-peak', hour: 13, seconds: 28 },
  'day-burning': { reference: '05-burning-day', hour: 13, seconds: null },
  'night-burning': { reference: '06-burning-night', hour: 22, seconds: null },
};
const p2Stages = Object.fromEntries([['day', 13], ['night', 22]].flatMap(([look, hour]) => {
  const route = Object.entries(p1Stages).filter(([, stage]) => stage.seconds !== null);
  return [
    [`${look}-entrance`, { reference: '01-snow-road', hour, seconds: null }],
    ...route.map(([name, stage]) => [`${look}-${name}`, { ...stage, hour }]),
    [`${look}-burning`, p1Stages[`${look}-burning`]],
  ];
}));
const stages = p2 ? p2Stages : p1Stages;
const imageSize = [1440, 900];
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const isDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function referenceLightingNote(name, hour) {
  if (hour === 13) return 'The app is set to 13:00. The daytime photograph’s exact hour is unverified.';
  if (name === 'night-burning') return 'The app is set to 22:00. The photograph is a night lantern reference.';
  return 'The app is set to 22:00. The daytime photograph is reused for route form, scale and materials.';
}

async function readRegular(path) {
  assert((await lstat(path)).isFile(), `Expected a regular file: ${path}`);
  return readFile(path);
}

function checkPng(bytes, dimensions, path) {
  assert(bytes.length >= 24 && bytes.subarray(0, 8).equals(pngSignature)
    && bytes.toString('ascii', 12, 16) === 'IHDR', `Invalid PNG: ${path}`);
  assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], dimensions, `Wrong PNG dimensions: ${path}`);
}

const reportBytes = await readRegular(captureReport);
const report = JSON.parse(reportBytes);
assert.deepEqual([report.viewport?.width, report.viewport?.height], imageSize, 'Expected a 1440 × 900 Snow Roof capture.');
if (p2) {
  assert.equal(report.milestone, 'P2', 'Use a capture produced with --p2.');
  assert.deepEqual(report.readinessMisses, [], 'The P2 report missed the five-second entry budget.');
}
assert.deepEqual(report.captures?.map(frame => frame.name), Object.keys(stages),
  p2 ? 'Expected both hours for all six Snow Roof P2 views.' : 'Expected all six Snow Roof P1 views.');
for (const field of ['errors', 'httpErrors', 'viteUpdates']) {
  assert.deepEqual(report[field], [], `The capture report contains ${field}.`);
}
assert(/^[a-f0-9]{40}$/.test(report.sourceRev) && isDigest(report.sourceSha256)
  && report.sourceSha256 === report.sourceEndSha256 && report.sourceUnchanged === true,
  'Expected an unchanged, identified capture source.');
assert(isDigest(report.ordinaryManifestSha256) && report.ordinaryManifestUnchanged === true
  && isDigest(report.preview?.manifestSha256), 'Expected a verified candidate and unchanged ordinary manifest.');

const referenceManifest = join(referenceDir, 'references.json');
const referenceBytes = await readRegular(referenceManifest);
const entries = JSON.parse(referenceBytes).entries;
assert(Array.isArray(entries), 'Missing the photo reference entries.');
const references = new Map();
const referenceFiles = new Set();
for (const entry of entries) {
  assert(typeof entry.stage === 'string' && !references.has(entry.stage) && typeof entry.file === 'string'
    && /^[a-z0-9-]+\.jpg$/.test(entry.file) && !referenceFiles.has(entry.file)
    && isDigest(entry.sha256), 'Invalid or duplicate reference identity.');
  const photo = await readRegular(join(referenceDir, entry.file));
  assert(photo.length > 0 && photo.length === entry.bytes && sha(photo) === entry.sha256,
    `Reference bytes changed: ${entry.file}`);
  references.set(entry.stage, { ...entry, photo });
  referenceFiles.add(entry.file);
}

const frames = await Promise.all(report.captures.map(async frame => {
  const { name } = frame;
  const stage = stages[name];
  assert.equal(frame.file, `${name}.png`, 'Unexpected capture filename.');
  assert.equal(frame.hour, stage.hour, `Unexpected lighting preset for ${name}.`);
  assert.equal(frame.targetWalkSeconds, stage.seconds, `Unexpected walk time for ${name}.`);
  const path = join(dirname(captureReport), frame.file);
  const capture = await readRegular(path);
  checkPng(capture, imageSize, path);
  assert(isDigest(frame.sha256) && sha(capture) === frame.sha256, `Capture bytes changed: ${frame.file}`);

  const reference = references.get(stage.reference);
  assert(reference, `Missing reference for ${name}.`);
  const { photo, pixelSize, suggestedCropTopLeftXYWH: photoCrop, ...credit } = reference;
  assert([credit.title, credit.author, credit.license, credit.matches, credit.gap]
    .every(value => typeof value === 'string' && value.trim()), `Incomplete photo credit for ${name}.`);
  for (const url of [credit.page, credit.licenseUrl, credit.download]) {
    assert(new URL(url).protocol === 'https:', `Invalid photo credit URL for ${name}.`);
  }
  assert(Array.isArray(pixelSize) && pixelSize.length === 2
    && pixelSize.every(size => Number.isSafeInteger(size) && size > 0), `Invalid reference dimensions for ${name}.`);
  assert(Array.isArray(photoCrop) && photoCrop.length === 4 && photoCrop.every(Number.isSafeInteger),
    `Invalid reference crop for ${name}.`);
  const [x, y, width, height] = photoCrop;
  assert(x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= pixelSize[0] && y + height <= pixelSize[1]
    && width <= imageSize[0] && height <= imageSize[1] && width * imageSize[1] === height * imageSize[0],
    `Reference crop must fit both images and match the game aspect ratio: ${name}.`);
  const appCrop = [Math.floor((imageSize[0] - width) / 2), Math.floor((imageSize[1] - height) / 2), width, height];
  const referenceNote = p2 ? referenceLightingNote(name, frame.hour) : undefined;
  return { frame, capture, photo, pixelSize, photoCrop, appCrop, credit, referenceNote };
}));

await mkdir(output);
for (const directory of ['full', 'crops', 'pairs']) await mkdir(join(output, directory));
const scratch = await mkdtemp(join(tmpdir(), `snow-${milestone.toLowerCase()}-photo-pairs-`));
try {
  const tiles = [], pairs = [], views = [];
  const copiedPhotos = new Set();
  for (const { frame, capture, photo, pixelSize, photoCrop, appCrop, credit, referenceNote } of frames) {
    const { name } = frame;
    const full = `full/${frame.file}`;
    const app = `crops/${name}-app.png`;
    const reference = `crops/${name}-photo.png`;
    const pair = `pairs/${name}.png`;
    const photoSource = join(scratch, credit.file);
    await writeFile(join(output, full), capture);
    if (!copiedPhotos.has(credit.file)) {
      await writeFile(photoSource, photo);
      copiedPhotos.add(credit.file);
    }
    tiles.push(
      { source: join(output, full), output: join(output, app), rect: appCrop, sourceSize: imageSize },
      { source: photoSource, output: join(output, reference), rect: photoCrop, sourceSize: pixelSize },
    );
    pairs.push({ left: join(output, reference), right: join(output, app), output: join(output, pair) });
    views.push({ name, hour: frame.hour, targetWalkSeconds: frame.targetWalkSeconds, full, app, reference, pair,
      captureSha256: frame.sha256, appCrop, photoCrop, photoSize: pixelSize, photo: credit,
      ...(referenceNote ? { referenceNote } : {}) });
  }
  const config = join(scratch, 'pixels.json');
  await writeFile(config, JSON.stringify({ tiles, pairs }));
  execFileSync('/usr/bin/swift', ['-module-cache-path', join(scratch, 'modules'),
    fileURLToPath(new URL('./pine-realism-pixels.swift', import.meta.url)), config], { stdio: 'inherit' });

  const products = [];
  for (const { name, full, app, reference, pair, captureSha256, appCrop } of views) {
    const [width, height] = appCrop.slice(2);
    for (const [file, dimensions] of [[full, imageSize], [app, [width, height]],
      [reference, [width, height]], [pair, [width * 2 + 16, height]]]) {
      const bytes = await readRegular(join(output, file));
      checkPng(bytes, dimensions, file);
      const sha256 = sha(bytes);
      if (file === full) assert.equal(sha256, captureSha256, `Full frame pixels changed: ${name}`);
      products.push({ file, dimensions, bytes: bytes.length, sha256 });
    }
  }

  const note = [
    `# Snow Roof Court ${milestone} photo references`,
    'Review references only. The photograph is on the left of each sheet. The app crop is on the right.',
    'Both crops retain their native pixel scale. Full app captures are byte-for-byte copies.',
    ...views.map(({ name, pair, photo, referenceNote }) => [
      `## ${name}`,
      `[Side-by-side crop](${pair})`,
      `${photo.title} by ${photo.author}. Cropped for framing. [Original](${photo.page}) · [${photo.license}](${photo.licenseUrl})`,
      ...(referenceNote ? [referenceNote] : []),
      photo.matches,
      photo.gap,
    ].join('\n\n')),
  ].join('\n\n') + '\n';
  await writeFile(join(output, 'references.md'), note);
  await writeFile(join(output, 'comparison.json'), JSON.stringify({
    ...(p2 ? { milestone } : {}),
    captureReport, captureReportSha256: sha(reportBytes), sourceRev: report.sourceRev, sourceSha256: report.sourceSha256,
    candidateManifestSha256: report.preview.manifestSha256, ordinaryManifestSha256: report.ordinaryManifestSha256,
    errors: report.errors.length, httpErrors: report.httpErrors.length, sourceReloads: report.viteUpdates.length,
    referenceManifest, referenceManifestSha256: sha(referenceBytes), verifiedReferenceCount: references.size,
    photoUse: 'Review only. Attribution and source licenses are in references.md.',
    cropMethod: 'Native 1:1 sRGB pixels. Full app PNGs are unchanged. All crops and pairs are decoded and compared pixel by pixel.',
    views, products,
  }, null, 2) + '\n');
  console.log(`SNOW_${milestone}_PHOTO_PAIRS`, JSON.stringify({ comparisons: views.length, products: products.length, output }));
} finally {
  await rm(scratch, { recursive: true, force: true });
}
