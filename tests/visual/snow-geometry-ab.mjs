// Optical geometry diagnostic, not a suite or a final adoption/performance claim.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, resolve, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { Matrix4, Vector3 } from 'three';
import { fingerprintCaptureSource } from './capture-source-fingerprint.mjs';
import { readCaptureManifest, assertServedSnapshot } from './capture-preflight.mjs';

const output = resolve('artifacts/snow-geometry-ab', process.env.EVIDENCE || 'float32-position');
const core = process.env.CORE_ROOT || 'artifacts/snow-journey/final-delivery';
const pairKind = process.env.PAIR_KIND || 'position';
if (!['position', 'padding'].includes(pairKind)) throw new Error('PAIR_KIND must be position or padding.');
const candidates = pairKind === 'padding' ? [
  { name: 'float32', source: process.env.REFERENCE_SOURCE || '/tmp/one-light-snow-float32-diagnostic', base: process.env.REFERENCE_URL || 'http://127.0.0.1:5195', label: 'Preserved unpadded authored FLOAT32 diagnostic.' },
  { name: 'float32-padded', source: process.env.CANDIDATE_SOURCE || '/tmp/one-light-snow-padding-diagnostic', base: process.env.CANDIDATE_URL || 'http://127.0.0.1:5197', label: 'Same FLOAT32 geometry/materials, geometry-certified hidden-texel padding on hall-night/court-night only; diagnostic, not adoption.' },
] : [
  { name: 'position16', source: process.env.REFERENCE_SOURCE || '/tmp/one-light-snow-position16-diagnostic', base: process.env.REFERENCE_URL || 'http://127.0.0.1:5196', label: 'Current optimized 16-bit positions, 466,874 triangles.' },
  { name: 'float32', source: process.env.CANDIDATE_SOURCE || '/tmp/one-light-snow-float32-diagnostic', base: process.env.CANDIDATE_URL || 'http://127.0.0.1:5195', label: 'Genuine authored FLOAT32 positions, unpruned 650,624 triangles; diagnostic only.' },
];
const modes = (process.env.CONTROLS || 'normal').split(',');
if (modes.some(mode => !['normal', 'nearest-mip0', 'surface-id', 'white-baked', 'unlit-albedo'].includes(mode))) throw new Error('Unknown diagnostic control.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const entries = [];
for (const candidate of candidates) {
  const manifest = await readCaptureManifest(candidate.source, { requireFinalBanks: true });
  const source = await fingerprintCaptureSource(candidate.source);
  if (!source.instrumentation?.geometryHelperSha256) throw new Error('Use the new geometry-instrumented comparison clones.');
  for (const item of manifest.files) {
    const file = source.files.find(file => file.path === `web/public/places/snow-roof/${item.uri}`);
    if (!file || file.sha256 !== item.sha256 || (await stat(join(candidate.source, file.path))).size !== item.bytes) throw new Error(`Integrity failed for ${candidate.name}/${item.uri}.`);
  }
  const lightmaps = Object.entries(manifest.lightmaps).flatMap(([region, maps]) => Object.entries(maps).map(([pass, map]) => ({ region, pass, sha256: source.files.find(file => file.path === `web/public/places/snow-roof/${map.uri}`).sha256, scale: map.scale, logRange: map.logRange, logGain: map.logGain }))).sort((a,b)=>(a.region+'/'+a.pass).localeCompare(b.region+'/'+b.pass));
  const bytes = await readFile(join(candidate.source, 'web/public/places/snow-roof', manifest.scene));
  const jsonLength = bytes.readUInt32LE(12), document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binOffset = 20 + jsonLength + 8;
  const imageHashes = document.images.map(image => { const view = document.bufferViews[image.bufferView]; return hash(bytes.subarray(binOffset + (view.byteOffset || 0), binOffset + (view.byteOffset || 0) + view.byteLength)); }).sort();
  const positionTypes = document.meshes.flatMap(mesh => mesh.primitives.map(primitive => document.accessors[primitive.attributes.POSITION].componentType));
  entries.push({ ...candidate, manifest, fingerprint: source, glbSha256: hash(bytes), lightmaps, materialSha256: hash(JSON.stringify(document.materials)), imageHashes, positionTypes });
}
const [a, b] = entries;
const changedMaps = a.lightmaps.filter((map,index)=>map.sha256!==b.lightmaps[index]?.sha256).map(map=>map.region+'/'+map.pass);
const decodeUnchanged = JSON.stringify(a.lightmaps.map(({sha256,...map})=>map)) === JSON.stringify(b.lightmaps.map(({sha256,...map})=>map));
const expectedChanges = ['court/night','hall/night'];
const validMapChanges = pairKind === 'padding' ? decodeUnchanged && JSON.stringify(changedMaps)===JSON.stringify(expectedChanges) : JSON.stringify(a.lightmaps)===JSON.stringify(b.lightmaps);
const validPositions = pairKind === 'padding' ? a.glbSha256===b.glbSha256 && [...a.positionTypes,...b.positionTypes].every(type=>type===5126) : a.positionTypes.every(type=>type===5122)&&b.positionTypes.every(type=>type===5126);
if (a.fingerprint.instrumentation.originalSceneSha256 !== b.fingerprint.instrumentation.originalSceneSha256
  || (!process.env.RUN_CANDIDATES && a.fingerprint.instrumentation.geometryHelperSha256 !== b.fingerprint.instrumentation.geometryHelperSha256)
  || !validMapChanges || a.materialSha256 !== b.materialSha256
  || JSON.stringify(a.imageHashes) !== JSON.stringify(b.imageHashes)
  || !validPositions) throw new Error('Source, allowed lightmap payload changes, materials/images or actual positions do not match the intended diagnostic.');
const proofPath = 'art/build/snow-roof-float32-position-diagnostic/independent-position-stream-proof.json';
const proof = await readFile(proofPath);
const sizes = [{ name: 'desktop-en', width: 1440, height: 900, locale: 'en-US', phone: false }, { name: 'phone-zh', width: 390, height: 844, locale: 'zh-CN', phone: true }].filter(size => !process.env.VIEWPORT || size.name.startsWith(process.env.VIEWPORT));
let paddingProof=null;
if(pairKind==='padding'){
  if(!process.env.PADDING_PROOF)throw new Error('Padding comparison requires PADDING_PROOF pointing to the completed receipt.');
  const receiptBytes=await readFile(process.env.PADDING_PROOF),receipt=JSON.parse(receiptBytes);
  const changedPath=join(dirname(process.env.PADDING_PROOF),receipt.changedProof),changedHash=hash(await readFile(changedPath));
  if(receipt.geometry.sha256!==a.glbSha256||changedHash!==receipt.changedProofSha256||receipt.noRadianceThreshold!==true
    ||['court','hall'].some(region=>receipt.regions[region].changedOutsideCertified!==0||receipt.regions[region].uncertifiedAndVisibleBaseRGBAFloatBitsUnchanged!==true||receipt.regions[region].ktxSha256!==b.lightmaps.find(map=>map.region===region&&map.pass==='night').sha256))throw new Error('Padding receipt/changed-texel proof does not bind the intended geometry and two payloads.');
  paddingProof={path:process.env.PADDING_PROOF,sha256:hash(receiptBytes),changedPath,changedSha256:changedHash,policy:receipt.policy,changedBasePixels:Object.fromEntries(['court','hall'].map(region=>[region,receipt.regions[region].changedBasePixels])),sourceBakeFingerprint:receipt.sourceBakeFingerprint};
  if(process.env.PADDING_INDEPENDENT_PROOF)paddingProof.independent={path:process.env.PADDING_INDEPENDENT_PROOF,sha256:hash(await readFile(process.env.PADDING_INDEPENDENT_PROOF))};
}
const report = { createdAt: new Date().toISOString(), pairKind, changedMaps, paddingProof, candidates: entries, independentProof: { path: proofPath, sha256: hash(proof) }, controls: modes, frames: [], errors: [], resources: [], notes: [
  'First optical pass uses normal original samplers/exposure only, with particles hidden and identical fixed physical/flame time on both candidates.',
  'Exact camera world/projection matrices come from the completed core walk-2/3 recordings. This is a held comparison view, not a claim that the live threshold landed on an identical frame.',
  'The FLOAT32 candidate is deliberately unpruned. Its additional proven enclosed roof faces are expected invisible; it is not a final adoption or frame-budget candidate.',
  'Nearest base-level lightmaps and flat surface-ID materials are separate opt-in controls. They change diagnostic rendering temporarily, never source assets or bakes.',
  pairKind==='padding'?'Padding comparison requires bit-identical FLOAT32 GLB, materials/images and decode parameters. Only court/night and hall/night payload hashes may differ; the other ten maps must be identical. Hidden-mask/visible-base certification is supplied by the baker proof, not inferred from screenshots.':'Position-format comparison retains identical lightmap payloads.',
] };
await mkdir(output, { recursive: true });
const save = () => writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await save();
if(process.argv.includes('--preflight-only')){console.log(JSON.stringify({pairKind,changedMaps,paddingProof,originalSceneSha256:a.fingerprint.instrumentation.originalSceneSha256,glbSha256:a.glbSha256,output},null,2));process.exit(0);}
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const re = (zh, en) => new RegExp(`${zh}|${en}`);
try {
  for (const size of sizes) for (const candidate of entries.filter(entry => !process.env.RUN_CANDIDATES || process.env.RUN_CANDIDATES.split(',').includes(entry.name))) {
    const directory = join(output, candidate.name, size.name); await mkdir(directory, { recursive: true });
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, locale: size.locale, hasTouch: size.phone, isMobile: size.phone });
    await context.addInitScript(() => { Date.prototype.getHours = () => 22; Date.prototype.getMinutes = () => 0; Date.prototype.getSeconds = () => 0; Date.prototype.getMilliseconds = () => 0; window.__visualFreezeCamera = true; });
    const page = await context.newPage(); page.setDefaultTimeout(120000);
    const act = locator => size.phone ? locator.tap() : locator.click(), button = name => page.getByRole('button', { name });
    page.on('pageerror', error => report.errors.push({ candidate: candidate.name, viewport: size.name, error: error.stack }));
    page.on('console', message => { if (message.type() === 'error') report.errors.push({ candidate: candidate.name, viewport: size.name, console: message.text(), location: message.location() }); });
    page.on('response', response => { if (response.status() >= 400) report.resources.push({ candidate: candidate.name, viewport: size.name, status: response.status(), url: response.url() }); });
    try {
      await page.goto(candidate.base); await page.bringToFront(); await page.waitForFunction(() => window.__ready && window.__geometryLab);
      await assertServedSnapshot(page, candidate.fingerprint); await page.evaluate(() => document.fonts.ready.then(() => true));
      await page.getByLabel(re('你的愿望', 'Your wish')).fill(size.phone ? '愿这一盏灯，陪伴安静的夜晚。' : 'May this lamp keep someone company.');
      await act(button(re('许好了', 'Set my wish'))); await button(re('走进院里', 'Step inside')).waitFor();
      await page.waitForFunction(() => Number(getComputedStyle(document.getElementById('fade')).opacity) < .01);
      await act(button(re('走进院里', 'Step inside')));
      for (const [name, fraction] of [['walk-2', .5], ['walk-3', .75]].filter(([name]) => !process.env.POSES || process.env.POSES.split(',').includes(name))) {
        const reference = JSON.parse(await readFile(join(core, size.name, 'sequences', `${name}.json`)));
        const world = new Matrix4().fromArray(reference.cameraStart), position = new Vector3().setFromMatrixPosition(world), direction = new Vector3(0, 0, -1).transformDirection(world);
        const pose = { position: position.toArray(), look: position.clone().addScaledVector(direction, 10).toArray(), fov: 2 * Math.atan(1 / reference.projectionStart[5]) * 180 / Math.PI };
        await page.waitForFunction(fraction => window.__walkProgress?.progress >= fraction, fraction);
        const previous = await page.evaluate(pose => {
          const previous = window.__captureCameraState(), lab = window.__flickerLab;
          Object.assign(lab, { lockCamera: true, pauseTweens: true, freezeScene: true, freezeDaylight: true, freezeFuel: true, freezeFlame: true, freezeLampMotion: true, hideParticles: true, flameHold: 17, lampHold: 17 });
          window.__captureSetCamera(pose); window.__captureSetPhysicalState({ time: 17, fuel: 1 }); return previous;
        }, pose);
        await page.evaluate(reference => window.__geometryLab.setExactCamera({ world: reference.cameraStart, projection: reference.projectionStart }), reference);
        for (const mode of modes) {
          const diagnostic = await page.evaluate(mode => window.__geometryLab.setMode(mode), mode);
          await page.waitForTimeout(500);
          await page.evaluate(name => window.__flickerLab.begin({ name, seconds: .6 }), `${name}-${mode}`);
          await page.waitForFunction(() => window.__flickerLab.result !== null);
          const raw = await page.evaluate(() => window.__flickerLab.result);
          if (raw.packingError) throw new Error(raw.packingError);
          const maximum = (x, y) => Math.max(...x.map((value, index) => Math.abs(value - y[index])));
          if (maximum(raw.cameraStart, reference.cameraStart) !== 0 || maximum(raw.projectionStart, reference.projectionStart) !== 0 || raw.cameraMaximumElementDelta !== 0 || raw.projectionMaximumElementDelta !== 0 || raw.samples.some(sample => sample.visibleParticles !== 0)) throw new Error('Exact held-camera or hidden-particle comparison control failed.');
          const file = join(directory, `${name}-${mode}.png`); await page.screenshot({ path: file });
          const metadata = await page.evaluate(() => ({ delivery: window.__captureDeliveryInfo(), actualWalkSignal: window.__walkProgress, renderInfo: window.__flickerLab.renderInfo() }));
          report.frames.push({ candidate: candidate.name, viewport: size.name, name, mode, file, reference: { file: join(core, size.name, 'sequences', `${name}.json`), world: reference.cameraStart, projection: reference.projectionStart, walk: reference.walk }, actualCamera: raw.cameraStart, actualProjection: raw.projectionStart, exposure: raw.samples.map(sample => sample.exposure), maximumStaticRms: Math.max(...raw.samples.flatMap(sample => Object.values(sample.rois).map(roi => roi.rmsDelta ?? 0))), diagnostic, ...metadata });
          await save(); console.log('GEOMETRY', candidate.name, size.name, name, mode, JSON.stringify({ errors: report.errors.length, httpErrors: report.resources.length }));
        }
        await page.evaluate(previous => { window.__geometryLab.reset(); window.__captureSetCamera(previous); Object.assign(window.__flickerLab, { pauseTweens: false, freezeScene: false, freezeDaylight: false, freezeFuel: false, freezeFlame: false, freezeLampMotion: false, hideParticles: false }); }, previous);
      }
    } catch (error) { report.errors.push({ candidate: candidate.name, viewport: size.name, fatal: error.stack }); await page.screenshot({ path: join(directory, 'failure.png') }).catch(() => {}); }
    finally { await context.close(); await save(); }
  }
} finally {
  await browser.close();
  for (const candidate of entries) { candidate.sourceEnd = await fingerprintCaptureSource(candidate.source); candidate.sourceChanged = candidate.sourceEnd.aggregateSha256 !== candidate.fingerprint.aggregateSha256; if (candidate.sourceChanged) report.errors.push({ candidate: candidate.name, error: 'Diagnostic source/assets changed during capture.' }); }
  const references = report.frames.filter(frame => frame.candidate === entries[0].name);
  const panels = (references.length ? references : report.frames).map(left => {
    if (!references.length) return `<section><h2>${left.candidate} · ${left.viewport} · ${left.name} · ${left.mode}</h2><a href="${relative(output, left.file)}"><img style="max-width:1440px" src="${relative(output, left.file)}"></a></section>`;
    const right = report.frames.find(frame => frame.candidate === entries[1].name && frame.viewport === left.viewport && frame.name === left.name && frame.mode === left.mode);
    return `<section><h2>${left.viewport} · ${left.name} · ${left.mode}</h2><div class="pair">${[left, right].map(frame => frame ? `<figure><figcaption>${frame.candidate}</figcaption><a href="${relative(output, frame.file)}"><img src="${relative(output, frame.file)}"></a></figure>` : '<p>Missing candidate frame.</p>').join('')}</div></section>`;
  }).join('');
  const title=pairKind==='padding'?'Snow-bank hidden-texel padding diagnostic':'Snow-bank position precision diagnostic';
  await writeFile(join(output, 'comparison.html'), `<!doctype html><meta charset="utf-8"><title>${title}</title><style>body{margin:20px;background:#181c1a;color:#eee;font:15px/1.5 system-ui}.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}figure{margin:0}img{width:100%;height:auto}section{border-top:1px solid #68716a;margin-top:20px}h2{font-size:18px}</style><h1>${title}</h1><p>Recorded core walk-2/3 camera matrices are exactly reused. Normal sampler/exposure comparisons come first. FLOAT32 is unpruned diagnostic geometry, not final adoption. ${pairKind==='padding'?'The GLB, materials and ten unaffected maps must remain byte-identical; only the two certified night-map payloads may differ.':''} Optional controls are labelled separately. Click images for native pixels.</p>${panels}`);
  report.finishedAt = new Date().toISOString(); await save();
  console.log('GEOMETRY_DONE', JSON.stringify({ frames: report.frames.length, errors: report.errors.length, httpErrors: report.resources.length, output }));
  if (report.errors.length || report.resources.length) process.exitCode = 1;
}
