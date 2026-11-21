import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ebmlSignature = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
export const THRESHOLD_CLIP_PLAN = Object.freeze({ from: 22.5, to: 30, fps: 30 });
export const THRESHOLD_CLIP_FILE = 'live-threshold-to-hold.webm';

export function validThresholdClip(clip, bytes, view) {
  const { from, to, fps } = THRESHOLD_CLIP_PLAN;
  return clip?.file === THRESHOLD_CLIP_FILE && clip.width === view.width && clip.height === view.height
    && clip.mimeType?.startsWith('video/webm') && clip.requestedFps === fps
    && clip.firstFrame?.walkSeconds >= from && clip.firstFrame.walkSeconds < from + .4
    && clip.lastFrame?.walkSeconds >= to && clip.lastFrame.walkSeconds < to + .4
    && clip.submittedFrames >= 100 && clip.maxSubmissionGapMs > 0 && clip.maxSubmissionGapMs <= 500
    && clip.submittedDurationMs >= (to - from - .4) * 1000
    && bytes.length >= 1024 && bytes.length === clip.bytes && bytes.subarray(0, 4).equals(ebmlSignature)
    && clip.sha256 === createHash('sha256').update(bytes).digest('hex');
}

export function pngDimensions(bytes) {
  if (!bytes.subarray(0, 8).equals(pngSignature)) return null;
  let dimensions, hasPixels = false;
  for (let from = 8; from + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(from);
    const end = from + 12 + length;
    if (end > bytes.length) return null;
    const tag = bytes.toString('ascii', from + 4, from + 8);
    if (crc32(bytes.subarray(from + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) return null;
    if (from === 8) {
      if (tag !== 'IHDR' || length !== 13) return null;
      dimensions = [bytes.readUInt32BE(from + 8), bytes.readUInt32BE(from + 12)];
    }
    if (tag === 'IDAT' && length > 0) hasPixels = true;
    if (tag === 'IEND') return hasPixels && length === 0 && end === bytes.length ? dimensions : null;
    from = end;
  }
  return null;
}

export function baselineImages(report, targets, liveCrops) {
  const { width, height } = report.view;
  const viewport = [width, height];
  const images = [
    ['seated-ready-made.png', viewport], ['seated-lit.png', viewport],
    ...['seated', 'lit'].map(name => [`crop-${name}-lamp.png`, [report.crops.lamp.width, report.crops.lamp.height]]),
  ];
  for (const { name } of [...targets, { name: 'entrance' }]) {
    images.push([`diagnostic-${name}.png`, viewport], [`live-${name}.png`, viewport]);
  }
  for (const { name, seconds } of targets) {
    const rect = seconds <= 26 ? report.crops.doorway : report.crops.reveal;
    images.push([`crop-diagnostic-${name}.png`, [rect.width, rect.height]]);
    if (liveCrops) images.push([`crop-live-${name}.png`, [rect.width, rect.height]]);
  }
  return images;
}

export async function hasReusableBaseline(directory, view, source, targets, liveCrops, thresholdClip = false) {
  try {
    const report = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'));
    if (report.failure || report.issues.length || report.source.mode !== 'baseline'
      || report.source.highlandSha256 !== source.highlandSha256 || report.source.cameraSha256 !== source.cameraSha256
      || Object.entries(view).some(([key, value]) => report.view[key] !== value)
      || report.scenes.length !== targets.length + 1
      || !report.lit || !report.readyMade.lampInsideViewport || report.readyMade.lampOverlapsSheet) return false;
    if (thresholdClip) {
      if (report.source.baseline !== source.baseline || !source.sceneModulesSha256
        || Object.entries(source.sceneModulesSha256).some(([file, sha]) => report.source.sceneModulesSha256?.[file] !== sha)
        || !validThresholdClip(report.thresholdClip, await readFile(join(directory, THRESHOLD_CLIP_FILE)), view)) return false;
    }
    for (const { name } of [...targets, { name: 'entrance' }]) {
      const frame = report.scenes.find(scene => scene.name === name);
      if (!frame?.capturePose || !frame.livePose || frame.images?.diagnostic !== `diagnostic-${name}.png`
        || frame.images.live !== `live-${name}.png`) return false;
    }
    const trace = JSON.parse(await readFile(join(directory, 'camera-trace.json'), 'utf8'));
    if (trace.length < 2 || trace.length !== report.trace.frames) return false;
    for (const [filename, [width, height]] of baselineImages(report, targets, liveCrops)) {
      const dims = pngDimensions(await readFile(join(directory, filename)));
      if (!dims || dims[0] !== width || dims[1] !== height || width <= 0 || height <= 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}
