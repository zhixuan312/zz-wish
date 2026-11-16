// Assemble pre-bake CPU geometry evidence without opening a browser or changing a scene.
// node tests/visual/blender-geometry-compare.mjs --preview art/build/snow-roof-preview --output docs/evidence/blender-pilot/geometry-review
import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { Euler, PerspectiveCamera, Quaternion, Vector3, MathUtils } from 'three';
const flags = Object.fromEntries(process.argv.slice(2).reduce((rows, token, index, all) => token.startsWith('--') ? [...rows, [token.slice(2), all[index + 1]]] : rows, []));
const preview = resolve(flags.preview || 'art/build/snow-roof-preview');
const supplements = (flags.supplement || '').split(',').filter(Boolean).map(path => resolve(path));
const output = resolve(flags.output || 'docs/evidence/blender-pilot/geometry-review');
const manifest = JSON.parse(await readFile('docs/evidence/blender-pilot/reference-cameras.json', 'utf8'));
const matched = ['outside', 'walk-1', 'walk-2', 'walk-3', 'choose', 'lit'];
const extras = [
  { label: 'Eave construction detail', required: true, names: ['EaveDetail', 'Detail_eaves', 'Detail_eave'] },
  { label: 'Door, column base and floor detail', required: true, names: ['DoorFloorDetail', 'Detail_door-floor', 'Detail_floor'] },
  { label: 'Ridge and tile-course detail', required: false, names: ['RoofRidgeDetail', 'TileCourseDetail'] },
  { label: 'Painted beam and bracket detail', required: false, names: ['BeamJoineryDetail'] },
  { label: 'Close tile overlap inspection', required: false, names: ['TileCourseDetail'] },
  { label: 'Close step edge inspection', required: false, names: ['StepEdgeDetail'] },
];
const report = { createdAt: new Date().toISOString(), previewDirectory: preview, matched: [], details: [], notes: [
  'Construction review only, before new bakes. Lighting setup is not modified by this assembler.',
  'Reference camera recovery limitations remain in reference-cameras.json. Matched means the intended camera, not proven visual alignment.',
  'A file being present or source code naming a feature does not establish that a construction criterion is visible.',
] };
await mkdir(output, { recursive: true });
let metadata = null;
try { metadata = JSON.parse(await readFile(join(preview, 'preview.json'), 'utf8')); await copyFile(join(preview, 'preview.json'), join(output, 'preview.json')); report.previewMetadata = metadata; }
catch { report.notes.push('Preview camera metadata is not yet available; camera alignment is unverified.'); }
report.supplementalMetadata = [];
for (const [index, directory] of supplements.entries()) {
  try { const data = JSON.parse(await readFile(join(directory, 'preview.json'), 'utf8')); report.supplementalMetadata.push({ directory, metadata: data }); await copyFile(join(directory, 'preview.json'), join(output, `preview-supplement-${index + 1}.json`)); } catch { report.notes.push(`No supplemental camera metadata found in ${directory}.`); }
}
const dataImage = data => `data:image/png;base64,${data.toString('base64')}`;
const findImage = async names => {
  for (const directory of [preview, ...supplements]) for (const name of names) try { const path = join(directory, `${name}.png`); const data = await readFile(path); return { name, path, data }; } catch { /* Try the next documented camera alias. */ }
  return null;
};
const sections = [];
for (const stage of matched) {
  const oldPath = `docs/evidence/blender-pilot/reference-desktop/${stage}.png`;
  const oldImage = await readFile(oldPath); const image = await findImage([`Reference_${stage}`]);
  const camera = metadata?.cameras?.find(camera => camera.name === `Reference_${stage}`);
  const expected = manifest.desktop[stage];
  let sourcePoseCheck = null;
  if (camera) {
    const world = [camera.position[0], camera.position[2], -camera.position[1]];
    const fov = camera.sensorFit === 'VERTICAL' ? 2 * Math.atan(camera.sensorHeight / (2 * camera.lens)) * 180 / Math.PI : null;
    const cameraPose = new PerspectiveCamera(); cameraPose.up.set(0, 0, 1); cameraPose.position.set(expected.position[0], -expected.position[2], expected.position[1]);
    cameraPose.lookAt(new Vector3(expected.target[0], -expected.target[2], expected.target[1]));
    // Blender XYZ Euler is composed as Rz*Ry*Rx; Three.js expresses that composition with order ZYX.
    const actualRotation = new Quaternion().setFromEuler(new Euler(...camera.rotationEuler, 'ZYX'));
    sourcePoseCheck = { positionMetres: world, deltaMetres: Math.hypot(...world.map((value, index) => value - expected.position[index])), verticalFovDegrees: fov, sensorFit: camera.sensorFit, expectedVerticalFovDegrees: manifest.camera.verticalFovDegrees.desktop, rotationDeltaDegrees: MathUtils.radToDeg(cameraPose.quaternion.angleTo(actualRotation)), rotationConvention: 'Blender XYZ: Rz*Ry*Rx, converted with Three.js Euler ZYX' };
  }
  const entry = { stage, expectedCamera: expected, sourcePoseCheck, image: image ? `${stage}.png` : null, status: image ? 'available for visual review' : 'unverified: no new image' };
  if (image) { await copyFile(image.path, join(output, `${stage}.png`)); entry.sha256 = createHash('sha256').update(image.data).digest('hex'); }
  report.matched.push(entry);
  sections.push(`<section><h2>${stage}</h2><div class="pair"><figure><figcaption>Old round 1 reference</figcaption><img src="${dataImage(oldImage)}"></figure><figure><figcaption>New CPU construction preview</figcaption>${image ? `<img src="${dataImage(image.data)}">` : '<p class="missing">Unverified: this camera has not been rendered.</p>'}</figure></div></section>`);
}
for (const detail of extras) {
  const image = await findImage(detail.names);
  const entry = { label: detail.label, required: detail.required, sourcePath: image?.path ?? null, camera: image?.name ?? null, status: image ? 'available for visual review' : 'unverified: no detail image' };
  if (image) { await copyFile(image.path, join(output, `${image.name}.png`)); entry.sha256 = createHash('sha256').update(image.data).digest('hex'); }
  report.details.push(entry);
  if (image || detail.required) sections.push(`<section><h2>${detail.label}</h2>${image ? `<img class="detail" src="${dataImage(image.data)}">` : '<p class="missing">Unverified: supplemental angle is still missing.</p>'}</section>`);
}
try { report.builderAtComparison = { path: 'art/blender/snow_roof.py', sha256: createHash('sha256').update(await readFile('art/blender/snow_roof.py')).digest('hex') }; } catch { /* Source may be outside the chosen checkout. */ }
try { const info = await stat(metadata.scene); report.blendAtComparison = { path: metadata.scene, bytes: info.size, modifiedAt: info.mtime.toISOString() }; } catch { /* Metadata or the source blend may not yet be available. */ }
const html = `<!doctype html><meta charset="utf-8"><title>Snow Roof construction review before baking</title><style>*{box-sizing:border-box}body{margin:0 auto;max-width:1600px;background:#111513;color:#eee5d3;font:16px/1.5 system-ui}header{padding:20px}h1{font-size:26px;margin:0 0 10px}h2{font-size:18px;margin:0;padding:10px 12px}section{border-top:1px solid #485047}.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}figure{margin:0}figcaption{padding:6px 12px;color:#c8c2b8}img{display:block;width:100%;height:auto}.missing{padding:32px;color:#e8ad77}.detail{max-width:1200px;margin:auto}</style><header><h1>Snow Roof: geometry review before baking</h1><p>Six source framing references and two supplemental construction angles. Low-sample CPU images establish visible geometry only. Lighting is preserved; unseen features remain unverified. Camera provenance and missing views are recorded in geometry-evidence.json.</p></header>${sections.join('')}`;
await writeFile(join(output, 'comparison.html'), html); await writeFile(join(output, 'geometry-evidence.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, matchedAvailable: report.matched.filter(view => view.image).length, matchedRequired: 6, detailsAvailable: report.details.filter(view => view.camera).length, detailsRequired: extras.filter(detail => detail.required).length }));
