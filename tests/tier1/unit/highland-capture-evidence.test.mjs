import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { baselineImages, hasReusableBaseline, THRESHOLD_CLIP_FILE, validThresholdClip } from '../../../docs/highland/capture-evidence.mjs';

function chunk(name, data) {
  const bytes = Buffer.concat([Buffer.alloc(4), Buffer.from(name), data, Buffer.alloc(4)]);
  bytes.writeUInt32BE(data.length, 0);
  bytes.writeUInt32BE(crc32(bytes.subarray(4, bytes.length - 4)), bytes.length - 4);
  return bytes;
}

function png(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc((width * 4 + 1) * height))), chunk('IEND', Buffer.alloc(0))]);
}

test('resume reuses a complete baseline and reruns one with missing, wrong-size, or newly requested images', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'high-white-resume-'));
  const view = { name: 'phone', width: 4, height: 6, hour: 22, touch: true, key: 'phone-22' };
  const source = { mode: 'baseline', highlandSha256: 'test-scene', cameraSha256: 'test-camera' };
  const targets = [{ name: 'threshold-24s', seconds: 24 }, { name: 'open-court-29s', seconds: 29 }];
  const read = (opts = {}) => hasReusableBaseline(directory, opts.view ?? view, source, targets, opts.liveCrops ?? true);
  const report = { view, source, issues: [], trace: { frames: 2 }, lit: { position: [0, 1, 2] },
    readyMade: { lampInsideViewport: true, lampOverlapsSheet: false },
    crops: { doorway: { width: 4, height: 3 }, reveal: { width: 3, height: 3 }, lamp: { width: 2, height: 3 } },
    scenes: ['entrance', ...targets.map(target => target.name)].map(name => ({ name, capturePose: {}, livePose: {},
      images: { diagnostic: `diagnostic-${name}.png`, live: `live-${name}.png` } })) };
  try {
    await writeFile(join(directory, 'report.json'), JSON.stringify(report));
    await writeFile(join(directory, 'camera-trace.json'), JSON.stringify([{}, {}]));
    for (const [filename, dimensions] of baselineImages(report, targets, true)) {
      await writeFile(join(directory, filename), png(...dimensions));
    }
    expect(await read()).toBe(true);
    expect(await read({ view: { ...view, hour: 13 } })).toBe(false);
    await unlink(join(directory, 'live-threshold-24s.png'));
    expect(await read()).toBe(false);
    await writeFile(join(directory, 'live-threshold-24s.png'), png(4, 5));
    expect(await read()).toBe(false);
    await writeFile(join(directory, 'live-threshold-24s.png'), png(4, 6));
    await unlink(join(directory, 'crop-live-threshold-24s.png'));
    expect(await read({ liveCrops: false })).toBe(true);
    expect(await read()).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('threshold clip needs verified bytes, native size, and continuous threshold-to-hold timing', () => {
  const view = { width: 390, height: 844 };
  const bytes = Buffer.alloc(1024);
  bytes.writeUInt32BE(0x1a45dfa3);
  const clip = {
    file: THRESHOLD_CLIP_FILE, mimeType: 'video/webm;codecs=vp8', ...view, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), requestedFps: 30, submittedFrames: 221,
    firstFrame: { walkSeconds: 22.51 }, lastFrame: { walkSeconds: 30.01 },
    submittedDurationMs: 7500, maxSubmissionGapMs: 50,
  };
  expect(validThresholdClip(clip, bytes, view)).toBe(true);
  expect(validThresholdClip({ ...clip, width: 380 }, bytes, view)).toBe(false);
  expect(validThresholdClip({ ...clip, lastFrame: { walkSeconds: 29.7 } }, bytes, view)).toBe(false);
  expect(validThresholdClip({ ...clip, maxSubmissionGapMs: 600 }, bytes, view)).toBe(false);
  const corrupted = Buffer.from(bytes);
  corrupted[999] ^= 0x80;
  expect(validThresholdClip(clip, corrupted, view)).toBe(false);
});
