// Extend only a NEW /tmp comparison clone; original core/performance snapshots stay intact.
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const target = resolve(process.argv[2] || '');
if (!target.startsWith('/tmp/') || target === '/tmp/one-light-final-mobile-paced2') throw new Error('Supply a new isolated /tmp comparison clone, not the accepted core snapshot.');
execFileSync(process.execPath, ['tests/visual/instrument-flicker.mjs', target], { stdio: 'inherit' });
const path = join(target, 'web/src/engine/scene.js');
let source = await readFile(path, 'utf8');
source = "import { createGeometryControls } from './geometryControls.js';\n" + source;
const start = '// ---------- Start ----------';
if (!source.includes(start) || !source.includes('flickerLab.prepare(); performanceLab.beforeRender(stamp);')) throw new Error('Geometry comparison hooks did not match; source was not overwritten.');
source = source.replace(start, `const geometryLab=createGeometryControls({renderer,camera,getPlace:()=>place});\n${start}`)
  .replace('flickerLab.prepare(); performanceLab.beforeRender(stamp);', 'flickerLab.prepare(); geometryLab.prepare(); performanceLab.beforeRender(stamp);');
await writeFile(path, source);
await copyFile('tests/visual/geometry-controls.mjs', join(target, 'web/src/engine/geometryControls.js'));
const metadataPath = join(target, 'visual-instrumentation.json'), metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
metadata.instrumentedSceneSha256 = createHash('sha256').update(source).digest('hex');
metadata.geometryHelperSha256 = createHash('sha256').update(await readFile('tests/visual/geometry-controls.mjs')).digest('hex');
metadata.geometryComparisonControls = 'Exact recorded camera matrices; optional nearest base-level lightmap filter and flat surface IDs. Snapshot-only diagnostics.';
await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify({ target, geometryHelperSha256: metadata.geometryHelperSha256 }));
