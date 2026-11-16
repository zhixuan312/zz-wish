// Read-only fingerprints for the served capture source and delivered Snow Roof assets.
import { readdir, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
async function files(path) {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    const result = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const child = join(path, entry.name);
      result.push(...(entry.isDirectory() ? await files(child) : [child]));
    }
    return result;
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
export async function fingerprintCaptureSource(root) {
  const sourcePaths = await files(join(root, 'web/src'));
  const sharedPaths = await files(join(root, 'shared'));
  const assetPaths = await files(join(root, 'web/public/places/snow-roof'));
  const rows = [];
  for (const path of [...sourcePaths, ...sharedPaths, ...assetPaths]) rows.push({ path: relative(root, path), sha256: await digest(path) });
  let instrumentation = null;
  try { instrumentation = JSON.parse(await readFile(join(root, 'visual-instrumentation.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { root, sourceFiles: sourcePaths.length, sharedFiles: sharedPaths.length, deliveredSnowFiles: assetPaths.length, instrumentation, files: rows, aggregateSha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
}
