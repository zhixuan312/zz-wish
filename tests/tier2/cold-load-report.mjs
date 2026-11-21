// Render the canonical cold-load raw records into one Markdown table.
//
// Reads only the JSON the harness wrote, so the numbers in the report cannot drift from the evidence.
// Every column states its unit; input and ready are separate columns because they answer different
// questions, and long-task maximum is given next to the total because a single long frame is what a
// visitor feels.
//
// Usage: node tests/tier2/cold-load-report.mjs --dir DIR [--md OUT.md]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((rows, value, index, all) => {
  if (value.startsWith('--')) rows.push([value.slice(2), all[index + 1] ?? '']);
  return rows;
}, []));
const dir = args.dir ?? 'tmp/cold-canonical';
// A merged matrix directory holds all.json instead of the per-run files, so read whichever exists.
const files = readdirSync(dir);
const single = files.filter(file => /-run-\d+-(canonical|immediate)\.json$/.test(file));
const records = single.length
  ? single.map(file => JSON.parse(readFileSync(join(dir, file), 'utf8')))
  : JSON.parse(readFileSync(join(dir, 'all.json'), 'utf8')).runs;
if (!records.length) throw new Error('No records found in ' + dir);

const fmt = (value, unit) => (value === null || value === undefined ? '—' : `${value}${unit}`);
const conditions = [...new Set(records.map(record => record.condition))];
const lines = [];

lines.push('| condition | phase | run | input (ms) | ready (ms) | Step inside (ms) | wire bytes at Step (MB) | long task total / max (ms) | long tasks | frame p50 / p95 (ms) |');
lines.push('|---|---|---|---|---|---|---|---|---|---|');

for (const condition of conditions) {
  const group = records.filter(record => record.condition === condition)
    .sort((a, b) => (a.phase === b.phase ? a.run - b.run : a.phase.localeCompare(b.phase)));
  for (const record of group) {
    const longTask = record.stepLongTask ?? record.homeShaders ?? {};
    lines.push([
      condition, record.phase, record.run,
      fmt(record.home?.ms, ''), fmt(record.ready?.ms, ''),
      fmt(record.step?.ms, ''),
      fmt(record.step?.bytes === undefined ? null : +(record.step.bytes / 1048576).toFixed(1), ''),
      `${fmt(longTask.totalMs, '')} / ${fmt(longTask.maxMs, '')}`,
      fmt(longTask.count, ''),
      `${fmt(record.stepFrames?.p50, '')} / ${fmt(record.stepFrames?.p95, '')}`,
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
}

// Cover completeness, which must come from the home stage or it is always absent.
lines.push('');
lines.push('| condition | run | phase | cover present | cover ready | cover image decoded |');
lines.push('|---|---|---|---|---|---|');
for (const record of records) {
  const cover = record.homeCover ?? {};
  lines.push([record.condition, record.run, record.phase,
    cover.present === undefined ? '—' : String(cover.present),
    cover.ready ?? '—',
    cover.image ? `${cover.image.complete} ${cover.image.naturalWidth}x${cover.image.naturalHeight}` : '—',
  ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
}

const text = lines.join('\n') + '\n';
if (args.md) writeFileSync(args.md, text);
process.stdout.write(text);
