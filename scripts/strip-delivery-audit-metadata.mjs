#!/usr/bin/env node
/** Explicit delivery-only header change. Native source/transport stay intact. */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AUDIT_ONLY_SCENE_KEYS = Object.freeze(['source_lightmap_charts', 'resting_contact_audit', 'resting_contact_groups']);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value));

export function stripAuditSceneExtras(extras) {
  const retained = { ...extras }, removed = [];
  for (const key of AUDIT_ONLY_SCENE_KEYS) if (Object.hasOwn(retained, key)) {
    const value = retained[key];
    removed.push({ key, value, keyValueSha256: sha(jsonBytes({ [key]: value })), keyValueBytes: jsonBytes({ [key]: value }).length, valueSha256: sha(jsonBytes(value)) });
    delete retained[key];
  }
  return { retained, removed };
}

function chunks(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw Error('Expected complete GLB2');
  const result = [];
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    result.push({ type, full: bytes.subarray(offset, offset + 8 + length), data: bytes.subarray(offset + 8, offset + 8 + length) });
    offset += 8 + length;
  }
  if (result.length !== 2 || result[0].type !== 0x4e4f534a || result[1].type !== 0x004e4942) throw Error('Expected only JSON and BIN chunks');
  return result;
}

async function main() {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--input', '--output', '--receipt'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw Error('Use --input PATH --output NEW_art/build/PATH --receipt NEW_JSON');
    options[args[i]] = resolve(args[i + 1]);
  }
  if (Object.keys(options).length !== 3) throw Error('All three explicit paths are required');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), build = resolve(root, 'art/build');
  for (const key of ['--output', '--receipt']) {
    const name = relative(build, options[key]);
    if (isAbsolute(name) || name === '..' || name.startsWith('../')) throw Error('Separate ignored art/build output required');
    if (await access(options[key]).then(() => true, () => false)) throw Error('Output already exists');
  }
  const input = await readFile(options['--input']), inputHash = sha(input), parts = chunks(input);
  const before = JSON.parse(parts[0].data.toString()), after = structuredClone(before), removed = [];
  for (let index = 0; index < after.scenes.length; index++) {
    const result = stripAuditSceneExtras(after.scenes[index].extras ?? {});
    after.scenes[index].extras = result.retained;
    removed.push(...result.removed.map(row => ({ scene: index, ...row })));
  }
  if (!removed.length) throw Error('No approved audit-only keys exist; refusing an unneeded derivative');
  const encoded = jsonBytes(after), padded = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 0x20); encoded.copy(padded);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + padded.length + parts[1].full.length, 8); header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const output = Buffer.concat([header, padded, parts[1].full]), decoded = chunks(output);
  if (!decoded[1].full.equals(parts[1].full)) throw Error('BIN chunk changed');
  const restore = JSON.parse(decoded[0].data.toString());
  for (const row of removed) restore.scenes[row.scene].extras[row.key] = row.value;
  // Deep comparison ignores property ordering, and permits no other changes.
  function equal(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a).sort();
    return JSON.stringify(keys) === JSON.stringify(Object.keys(b).sort()) && keys.every(key => equal(a[key], b[key]));
  }
  if (!equal(restore, before)) throw Error('JSON changed outside explicit scene audit keys');
  if (sha(await readFile(options['--input'])) !== inputHash) throw Error('Frozen input changed');
  const removedPath = options['--receipt'].replace(/\.json$/, '') + '.removed-values.json';
  await mkdir(dirname(options['--output']), { recursive: true }); await mkdir(dirname(options['--receipt']), { recursive: true });
  await writeFile(removedPath, JSON.stringify({ inputSha256: inputHash, removed }, null, 2) + '\n', { flag: 'wx' });
  await writeFile(options['--output'], output, { flag: 'wx' });
  const receipt = { scope: 'Explicit delivery-only metadata derivative, not source-identical. Native source/prepared/raw and all transport remain untouched. Independent decoded geometry/contact review is required.', input: { path: relative(root, options['--input']), sha256: inputHash, bytes: input.length }, output: { path: relative(root, options['--output']), sha256: sha(output), bytes: output.length }, savedBytes: input.length - output.length, approvedSceneKeys: AUDIT_ONLY_SCENE_KEYS, removed: removed.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'value'))), fullRemovedValues: { path: relative(root, removedPath), sha256: sha(await readFile(removedPath)) }, jsonBytes: { before: parts[0].data.length, after: padded.length }, invariants: { entireOriginalBinChunkByteExact: true, binSha256: sha(parts[1].data), allOtherJsonDataDeepExact: true, allRuntimeAnchorsConfigsAndSourceLicenseIdentityRetained: true, positionNormalUV0UV1TintIndexMaterialImageAndNodeDataUnchanged: true, sourcePreparedRawUnchanged: true }, encodersUsed: 0, quantizationPasses: 0, generatorSha256: sha(await readFile(fileURLToPath(import.meta.url))) };
  await writeFile(options['--receipt'], JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log('DELIVERY_METADATA_STRIP', JSON.stringify({ output: receipt.output, savedBytes: receipt.savedBytes, receipt: options['--receipt'] }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
