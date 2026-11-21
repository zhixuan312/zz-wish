import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import fixture from './fixtures/loading-shader-parity.json' with { type: 'json' };

const [rootArg, ...flags] = process.argv.slice(2);
const baselineOnly = flags.includes('--baseline-only');
const match = flags.find(flag => flag.startsWith('--match='))?.slice(8);
assert(rootArg && !rootArg.startsWith('-') && flags.length === Number(baselineOnly) + Number(Boolean(match)),
  'Usage: node tests/visual/loading-shaders-pixel-diff.mjs <root> [--baseline-only] [--match=place/viewport/hour]');
const root = resolve(rootArg);
const sides = baselineOnly ? ['before', 'before-repeat'] : ['before', 'before-repeat', 'after'];
const phaseForStage = {
  'cover-first-visible': 'wish',
  'place-first-visible': 'place',
  'walk-28s': 'travel',
  'burning-settled': 'burning',
};
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const isSha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isRevision = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const isMatrix = value => Array.isArray(value) && value.length === 16 && value.every(Number.isFinite);
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

assert.equal(fixture.schemaVersion, 1);
assert.equal(fixture.requiredChangedPixels, 0);
assert.equal(fixture.requiredMaxRgbaDelta, 0);
const run = await readJson(join(root, 'run.json'));
assert.equal(run.schemaVersion, 1, 'Invalid run.json schema version.');
assert.equal(run.baseline?.sourceRev, fixture.baseline, 'The run did not use the pinned release baseline.');
assert(isSha256(run.baseline.sourceSha256), 'Invalid baseline source SHA-256 in run.json.');
if (!baselineOnly) {
  assert(isRevision(run.candidate?.sourceRev) && run.candidate.sourceRev !== fixture.baseline,
    'run.json must identify an immutable candidate revision distinct from the baseline.');
  assert(isSha256(run.candidate.sourceSha256), 'Invalid candidate source SHA-256 in run.json.');
}

function pngChunk(type, payload) {
  const tag = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(payload.length + 12);
  chunk.writeUInt32BE(payload.length, 0);
  tag.copy(chunk, 4);
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, chunk.length - 4)), chunk.length - 4);
  return chunk;
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rowBytes = width * 4;
  const scanlines = Buffer.alloc(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    rgba.copy(scanlines, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
  }
  return Buffer.concat([
    pngSignature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function ensureSourcePng(directory, side, width, height, rgba, receipt) {
  const path = join(directory, `${side}.png`);
  const existing = await readFile(path).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (existing) {
    assert(existing.length >= 24 && existing.subarray(0, 8).equals(pngSignature)
      && existing.toString('ascii', 12, 16) === 'IHDR', `${side}.png is not a PNG.`);
    assert.deepEqual([existing.readUInt32BE(16), existing.readUInt32BE(20)], [width, height],
      `${side}.png has the wrong dimensions.`);
    const expectedSha256 = receipt.pngSha256 ?? sha256(encodePng(width, height, rgba));
    assert.equal(sha256(existing), expectedSha256, `${side}.png does not match its receipt or the generated raw frame.`);
  } else {
    assert.equal(receipt.pngSha256, undefined, `${side}.png is missing despite a PNG hash in its receipt.`);
    await writeFile(path, encodePng(width, height, rgba), { flag: 'wx' });
  }
}

function comparePixels(before, after, width, height) {
  const diff = Buffer.alloc(before.length);
  let changedPixels = 0;
  let maxDelta = 0;
  let left = width, top = height, right = -1, bottom = -1;
  for (let i = 0; i < before.length; i += 4) {
    const delta = Math.max(
      Math.abs(before[i] - after[i]), Math.abs(before[i + 1] - after[i + 1]),
      Math.abs(before[i + 2] - after[i + 2]), Math.abs(before[i + 3] - after[i + 3]),
    );
    diff[i + 3] = 255;
    if (delta === 0) continue;
    changedPixels++;
    maxDelta = Math.max(maxDelta, delta);
    diff[i] = 255;
    diff[i + 2] = 255;
    const pixel = i / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return {
    diff,
    totalPixels: width * height,
    changedPixels,
    maxDelta,
    bounds: changedPixels ? { x: left, y: top, width: right - left + 1, height: bottom - top + 1 } : null,
  };
}

async function readFrame(directory, side, spec, stage, width, height) {
  const receipt = await readJson(join(directory, `${side}.json`));
  assert.equal(receipt.schemaVersion, 1, `${side}: invalid receipt schema version.`);
  assert.equal(receipt.side, side, `${side}: receipt is for a different capture.`);
  assert.equal(receipt.placeId, spec.place, `${side}: wrong place.`);
  assert.equal(receipt.hour, spec.hour, `${side}: wrong hour.`);
  assert.equal(receipt.wallTime, spec.wallTime, `${side}: wrong fixed wall time.`);
  assert.equal(receipt.stage, stage, `${side}: wrong lifecycle stage.`);
  assert.deepEqual(receipt.viewport, { width, height, deviceScaleFactor: 1 }, `${side}: wrong viewport or DPR.`);
  assert.equal(receipt.manifestSha256, spec.manifestSha256, `${side}: served manifest differs from the pinned fixture.`);
  const expectedSource = side === 'after' ? run.candidate : run.baseline;
  assert.equal(receipt.sourceRev, expectedSource.sourceRev, `${side}: wrong source revision.`);
  assert.equal(receipt.sourceSha256, expectedSource.sourceSha256, `${side}: wrong source fingerprint.`);
  assert(typeof receipt.renderer === 'string' && receipt.renderer.trim()
    && !/swiftshader|llvmpipe|software rasterizer|software adapter/i.test(receipt.renderer),
  `${side}: expected a hardware renderer.`);
  assert(typeof receipt.quality === 'string' && receipt.quality.trim(), `${side}: missing quality setting.`);
  const frame = receipt.frame;
  assert.equal(frame?.phase, phaseForStage[stage], `${side}: draw phase does not match the lifecycle stage.`);
  assert(Number.isSafeInteger(frame.ordinal) && frame.ordinal >= 0, `${side}: invalid fixture draw ordinal.`);
  assert.deepEqual(frame.drawingBuffer, [width, height], `${side}: wrong drawing-buffer dimensions.`);
  assert(isMatrix(frame.cameraWorld) && isMatrix(frame.cameraProjection), `${side}: missing finite camera matrices.`);
  const rgba = await readFile(join(directory, `${side}.rgba`));
  assert.equal(rgba.length, width * height * 4, `${side}: wrong packed RGBA byte length.`);
  assert.equal(sha256(rgba), receipt.rgbaSha256, `${side}: raw frame SHA-256 mismatch.`);
  return { side, receipt, rgba };
}

function assertMatchedDraw(before, comparison) {
  const a = before.receipt;
  const b = comparison.receipt;
  const label = `before versus ${comparison.side}`;
  assert.equal(b.renderer, a.renderer, `${label}: hardware renderer differs.`);
  assert.equal(b.quality, a.quality, `${label}: render quality differs.`);
  assert.equal(b.frame.ordinal, a.frame.ordinal, `${label}: fixture draw ordinal differs.`);
  assert.deepEqual(b.frame.cameraWorld, a.frame.cameraWorld, `${label}: world camera matrix differs.`);
  assert.deepEqual(b.frame.cameraProjection, a.frame.cameraProjection, `${label}: projection matrix differs.`);
}

const report = {
  schemaVersion: 1,
  mode: baselineOnly ? 'baseline-only' : 'candidate',
  source: { baseline: run.baseline, ...(baselineOnly ? {} : { candidate: run.candidate }) },
  requiredChangedPixels: fixture.requiredChangedPixels,
  requiredMaxRgbaDelta: fixture.requiredMaxRgbaDelta,
  diffLegend: 'Each changed pixel is opaque magenta. Unchanged pixels are opaque black. All four RGBA channels are compared.',
  stages: [],
};
const cases = fixture.cases.filter(spec => !match || [spec.place, spec.viewport, spec.hour].join('/') === match);
assert(cases.length, 'The fixture filter did not match a case.');
for (const spec of cases) {
  const [width, height] = fixture.dimensions[spec.viewport];
  for (const stage of spec.capturedStages) {
    const path = spec.relativePath.replace('<stage>', stage);
    const directory = join(root, path);
    const row = { path, placeId: spec.place, viewport: spec.viewport, hour: spec.hour, stage, manifestSha256: spec.manifestSha256,
      images: {}, comparisons: [], errors: [] };
    report.stages.push(row);
    const frames = new Map();
    for (const side of sides) {
      try {
        const frame = await readFrame(directory, side, spec, stage, width, height);
        await ensureSourcePng(directory, side, width, height, frame.rgba, frame.receipt);
        frames.set(side, frame);
        row.images[side] = { png: `${side}.png`, raw: `${side}.rgba`, receipt: `${side}.json`, sha256: frame.receipt.rgbaSha256 };
      } catch (error) {
        row.errors.push(`${side}: ${error.message}`);
      }
    }
    for (const side of sides.slice(1)) {
      if (!frames.has('before') || !frames.has(side)) continue;
      const before = frames.get('before');
      const comparison = frames.get(side);
      try {
        assertMatchedDraw(before, comparison);
        const { diff, ...counts } = comparePixels(before.rgba, comparison.rgba, width, height);
        const file = side === 'before-repeat' ? 'baseline-repeat-diff.png' : 'diff.png';
        await writeFile(join(directory, file), encodePng(width, height, diff));
        const passed = counts.changedPixels === fixture.requiredChangedPixels && counts.maxDelta === fixture.requiredMaxRgbaDelta;
        row.comparisons.push({ side, file, ...counts, passed });
        if (!passed) row.errors.push(`${side}: ${counts.changedPixels} changed pixels, max RGBA delta ${counts.maxDelta}.`);
      } catch (error) {
        row.errors.push(`${side}: ${error.message}`);
      }
    }
    row.passed = row.errors.length === 0 && row.comparisons.length === sides.length - 1;
    if (!row.passed) console.error(`${path}: ${row.errors.join(' ') || 'Missing comparison.'}`);
  }
}
const comparisons = report.stages.flatMap(row => row.comparisons);
report.summary = {
  stages: report.stages.length,
  comparisons: comparisons.length,
  failedStages: report.stages.filter(row => !row.passed).length,
  changedPixels: comparisons.reduce((sum, row) => sum + row.changedPixels, 0),
  maxDelta: comparisons.length ? Math.max(...comparisons.map(row => row.maxDelta)) : null,
};
const reportPath = join(root, baselineOnly ? 'baseline-parity-report.json' : 'pixel-parity-report.json');
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log('LOADING_SHADER_PARITY', JSON.stringify({ report: reportPath, ...report.summary }));
if (report.summary.failedStages) process.exitCode = 1;
