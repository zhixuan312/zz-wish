// Independent, read-only recomputation from captured per-pixel luminance.
// Usage: node tests/visual/recompute-flicker-luma.mjs artifacts/.../sequences/burning.json
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const paths = process.argv.slice(2);
if (!paths.length) throw new Error('Pass one or more existing raw sequence JSON paths. This command never opens a browser.');
const results = [];
for (const path of paths) {
  const sequence = JSON.parse(await readFile(path, 'utf8'));
  const rois = [];
  for (const roi of sequence.rois) {
    if (!roi.rawLuminance?.file) { rois.push({ name: roi.name, unavailable: 'This original run retained raw RGBA representatives and per-frame telemetry, but not every pixel of every frame.' }); continue; }
    const descriptor = roi.rawLuminance, compressed = await readFile(descriptor.file);
    if (descriptor.frames !== sequence.samples.length || descriptor.pixelsPerFrame !== roi.pixels.width * roi.pixels.height) throw new Error(`Raw frame/pixel descriptor mismatch: ${descriptor.file}`);
    if (createHash('sha256').update(compressed).digest('hex') !== descriptor.sha256) throw new Error(`Compressed luminance hash mismatch: ${descriptor.file}`);
    const bytes = gunzipSync(compressed);
    const expected = descriptor.frames * descriptor.pixelsPerFrame * 4;
    if (bytes.length !== expected) throw new Error(`Luminance byte length mismatch: ${descriptor.file}: ${bytes.length} vs ${expected}`);
    if (new Uint8Array(new Uint32Array([1]).buffer)[0] !== 1) throw new Error('This analysis command requires a little-endian CPU.');
    const pixels = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
    const rows = []; let maximumMetricDifference = 0;
    for (let frame = 1; frame < descriptor.frames; frame++) {
      let squared = 0, signed = 0, changed = 0, over3 = 0;
      const offset = frame * descriptor.pixelsPerFrame, previous = offset - descriptor.pixelsPerFrame;
      for (let pixel = 0; pixel < descriptor.pixelsPerFrame; pixel++) {
        const difference = (pixels[offset + pixel] - pixels[previous + pixel]) / descriptor.divisor;
        squared += difference * difference; signed += difference;
        if (Math.abs(difference) > .1) changed++;
        if (Math.abs(difference) > 3) over3++;
      }
      const rms = Math.sqrt(squared / descriptor.pixelsPerFrame), meanDelta = signed / descriptor.pixelsPerFrame;
      const reported = sequence.samples[frame].rois[roi.name];
      maximumMetricDifference = Math.max(maximumMetricDifference, Math.abs(rms - reported.rmsDelta), Math.abs(meanDelta - reported.signedMeanDelta));
      rows.push({ rms, meanDelta, changed: changed / descriptor.pixelsPerFrame, over3: over3 / descriptor.pixelsPerFrame });
    }
    const average = key => rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
    rois.push({ name: roi.name, frames: descriptor.frames, pixelsPerFrame: descriptor.pixelsPerFrame, meanPixelRmsDelta: average('rms'), maximumPixelRmsDelta: Math.max(...rows.map(row => row.rms)), meanAbsoluteRoiMeanDelta: rows.reduce((sum, row) => sum + Math.abs(row.meanDelta), 0) / rows.length, meanChangedPixelFraction: average('changed'), meanOver3LsbPixelFraction: average('over3'), maximumDifferenceFromReportedFloat64Metrics: maximumMetricDifference, matchesReportedMetricsWithin1eMinus8: maximumMetricDifference < 1e-8 });
  }
  results.push({ source: path, name: sequence.name, rois });
}
const text = JSON.stringify({ method: 'Lossless uint32 Rec.709 numerator / 10000, recomputed independently from gzip pixel arrays; no video decoding.', results }, null, 2) + '\n';
if (process.env.OUT) await writeFile(process.env.OUT, text);
else process.stdout.write(text);
