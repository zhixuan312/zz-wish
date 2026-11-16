// Read-only CPU summary of completed no-video performance evidence.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const path = process.argv[2];
if (!path) throw new Error('Supply the completed snow-performance report.json path.');
const report = JSON.parse(await readFile(path, 'utf8'));
if (!report.finishedAt) throw new Error('Wait for the performance run to finish before summarizing it.');
const output = dirname(path), rows = [], windows = [];
const counts = values => ({ under25ms: values.filter(v => v < 25).length, from25to42ms: values.filter(v => v >= 25 && v < 42).length, from42to59ms: values.filter(v => v >= 42 && v < 59).length, from59to75ms: values.filter(v => v >= 59 && v < 75).length, atLeast75ms: values.filter(v => v >= 75).length });
for (const sample of report.samples) {
  const rafDeltas = [];
  for (const [index, frame] of sample.frames.entries()) {
    const previous = sample.frames[index - 1];
    const rafDelta = previous ? frame.rafTimestampMs - previous.rafTimestampMs : null;
    if (rafDelta !== null) rafDeltas.push(rafDelta);
    rows.push([sample.viewport, sample.name, frame.index, frame.renderStartMs, frame.renderEndMs, frame.rafTimestampMs, rafDelta, frame.intervalMs, frame.cpuSubmitMs, frame.gpuMs]);
  }
  windows.push({ viewport: sample.viewport, name: sample.name, intendedCapFPS: sample.intendedCapFPS, frameBudgetMs: sample.targetFrameBudgetMs,
    valid: sample.valid, fps: sample.fps, frames: sample.renderedFrames, intervalP95Ms: sample.intervals.p95Ms, cpuSubmitP95Ms: sample.cpuSubmit.p95Ms, gpuP95Ms: sample.gpu.p95Ms, gpuStatus: sample.gpu.status,
    intervalDistribution: counts(sample.frames.map(frame => frame.intervalMs).filter(value => value !== null)), rafDeltaDistribution: counts(rafDeltas),
    cameraDelta: sample.cameraMaximumElementDelta, projectionDelta: sample.projectionMaximumElementDelta, validation: sample.validation,
    drawingBuffer: sample.configurationStart.drawingBuffer, pixelRatio: sample.configurationStart.pixelRatio,
    composerSamples: [sample.configurationStart.renderTarget1.samples, sample.configurationStart.renderTarget2.samples],
    materialProfile: sample.deliveryStart?.materialProfile ?? null, lightingState: sample.deliveryStart?.lightingState ?? null });
}
const summary = { createdAt: new Date().toISOString(), sourceReport: path, sourceChanged: report.sourceChanged, productErrors: report.errors, httpErrors: report.resources,
  actualUICleanup: report.cleanup.map(entry => ({ viewport: entry.viewport, succeeded: entry.succeeded, endReasons: entry.records?.map(candle => candle.endReason) ?? [] })),
  deviceScope: report.notes.find(note => note.startsWith('Phone is')),
  intervalDistributionNote: 'Millisecond buckets describe actual render-start and rAF-stamp deltas. They do not assume or claim a queried display refresh rate.', windows };
const csv = [['viewport', 'view', 'frame', 'renderStartMs', 'renderEndMs', 'rafTimestampMs', 'rafDeltaMs', 'actualRenderIntervalMs', 'cpuSubmitMs', 'gpuMs'], ...rows]
  .map(row => row.map(value => value === null || value === undefined ? '' : String(value).includes(',') ? JSON.stringify(String(value)) : String(value)).join(',')).join('\n') + '\n';
await writeFile(join(output, 'frames.csv'), csv);
await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ windows: windows.length, errors: report.errors.length, httpErrors: report.resources.length, sourceChanged: report.sourceChanged, summary: join(output, 'summary.json'), csv: join(output, 'frames.csv') }, null, 2));
