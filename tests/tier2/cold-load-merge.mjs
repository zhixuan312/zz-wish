// Merge the per-batch canonical records into one matrix set, then report on it.
//
// Each batch writes its own directory so a partial or failed batch can never overwrite a good record.
// This script reads those directories in order, refuses duplicate (condition, run, phase) keys, writes a
// combined all.json, and prints its SHA-256 so the report can cite one digest.
//
// Usage: node tests/tier2/cold-load-merge.mjs --out DIR --in DIR [--in DIR ...]
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const args = { inputs: [] };
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index++) {
  const key = argv[index];
  if (key === '--in') args.inputs.push(argv[++index]);
  else if (key.startsWith('--')) args[key.slice(2)] = argv[++index];
}
if (!args.out || !args.inputs.length) {
  throw new Error('Usage: cold-load-merge.mjs --out DIR --in DIR [--in DIR ...]');
}
mkdirSync(args.out, { recursive: true });

const runs = [];
const seen = new Map();
const environment = {};
for (const dir of args.inputs) {
  let files;
  try { files = readdirSync(dir); }
  catch { console.warn('SKIP missing batch directory: ' + dir); continue; }
  const batchRecords = [];
  for (const file of files.filter(name => /-run-\d+-(canonical|immediate)\.json$/.test(name))) {
    const record = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    record.batch = dir.split('/').filter(Boolean).at(-1);
    const key = `${record.condition}|${record.run}|${record.phase}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate record ${key}: ${seen.get(key)} and ${dir}/${file}`);
    }
    seen.set(key, `${dir}/${file}`);
    batchRecords.push(record);
  }
  // Environment is taken from the first batch that has one; all batches record it identically.
  if (!environment.commit) {
    try {
      const all = JSON.parse(readFileSync(join(dir, 'all.json'), 'utf8'));
      Object.assign(environment, all.environment ?? {});
    } catch { /* a batch that failed early has no all.json */ }
  }
  runs.push(...batchRecords);
}

const order = { canonical: 0, immediate: 1 };
runs.sort((a, b) => a.condition.localeCompare(b.condition) || a.run - b.run
  || order[a.phase] - order[b.phase]);

const payload = { environment, batches: args.inputs, count: runs.length, runs };
const text = JSON.stringify(payload, null, 2) + '\n';
writeFileSync(join(args.out, 'all.json'), text);
const digest = createHash('sha256').update(text).digest('hex');
console.log('MERGED', runs.length, 'records from', args.inputs.length, 'batches');
console.log('ALL_JSON_SHA256', digest);
if (runs.length !== 18) console.warn(`WARN expected 18 records, found ${runs.length}`);
