// Material-profile A/B only. Preparation does not authorize launching Chrome.
// Run after GPU handoff against two frozen, instrumented sources with identical code/lightmaps.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { inspectCandidatePair } from './candidate-preflight.mjs';
import { assertServedSnapshot } from './capture-preflight.mjs';
import { fingerprintCaptureSource } from './capture-source-fingerprint.mjs';

const candidates = [
  { name: 'quality', source: process.env.QUALITY_SOURCE || '/tmp/one-light-final-quality', base: process.env.QUALITY_URL || 'http://127.0.0.1:5191', receipt: process.env.QUALITY_RECEIPT || 'art/build/snow-roof-final-quality-optimized-postbatch/snow-roof.receipt.json' },
  { name: 'mobile', source: process.env.MOBILE_SOURCE || '/tmp/one-light-final-mobile', base: process.env.MOBILE_URL || 'http://127.0.0.1:5192', receipt: process.env.MOBILE_RECEIPT || 'art/build/snow-roof-final-mobile-optimized-postbatch/snow-roof.receipt.json' },
];
for (const candidate of candidates) {
  if (!resolve(candidate.source).startsWith('/tmp/') || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(candidate.base).hostname)) throw new Error('Use local frozen /tmp candidates only.');
}
const preflight = await inspectCandidatePair(candidates);
const output = resolve('artifacts/snow-candidate-ab', process.env.EVIDENCE || 'final');
const sizes = [{ name: 'desktop-en', width: 1440, height: 900, locale: 'en-US', phone: false }, { name: 'phone-zh', width: 390, height: 844, locale: 'zh-CN', phone: true }]
  .filter(size => !process.env.VIEWPORT || size.name.startsWith(process.env.VIEWPORT));
const details = [
  { name: 'detail-scanned-altar', position: [1.1, 1.85, -1.75], look: [0, 1.32, -4.85], fov: 40 },
  { name: 'detail-painted-screen', position: [0, 2.75, -1.6], look: [0, 3.08, -6.25], fov: 43 },
  { name: 'detail-brass-burner', position: [.35, 2.08, -4.05], look: [0, 1.76, -4.85], fov: 32 },
  { name: 'detail-painted-beam', position: [.2, 3.6, -.2], look: [1.6, 4.85, -2.18], fov: 32 },
  { name: 'detail-polished-floor', position: [2.4, 1.45, 1.3], look: [1.25, .60, -1.2], fov: 40 },
];
const report = { createdAt: new Date().toISOString(), preflight, frames: [], runtime: [], errors: [], resources: [], records: [], alignment: [], notes: [
  'Controlled material comparison at local 22:00, using identical product source, lightmap payloads/decode parameters and preserved geometry proofs.',
  'Both viewport sizes use deviceScaleFactor 1 on the M1 desktop GPU. The later performance phone separately uses deviceScaleFactor 2.',
  'Normal frames use actual product UI camera poses. The five close cameras are explicit diagnostic views, with HTML controls temporarily hidden; they are not proposed journey cameras.',
  'Camera, physical time, flame clock, lamp rotation, fuel and daylight are held at the same controlled values. Weather, dust and smoke are hidden after scene updates. This is a material comparison, not the normal animated appearance.',
  'No pixel-equivalence claim is made between texture profiles. Matched camera matrices, controlled state and short lossless static sequences establish comparison conditions.',
  'Source-derived diagnostic poses were supplied by the scene modeler. Their visibility is unverified until the resulting images are reviewed.',
] };
await mkdir(output, { recursive: true });
const save = () => writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await save();
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
report.browserVersion = browser.version();
const re = (zh, en) => new RegExp(`${zh}|${en}`);
const controls = { lockCamera: true, pauseTweens: true, freezeScene: true, freezeFlame: true, freezeLampMotion: true, freezeFuel: true, freezeDaylight: true, freezeShadows: false, hideParticles: true, freezeGrade: true };
const release = page => page.evaluate(() => Object.assign(window.__flickerLab, { pauseTweens: false, freezeScene: false, freezeFlame: false, freezeLampMotion: false, freezeFuel: false, freezeDaylight: false, freezeShadows: false, hideParticles: false, freezeGrade: false }));
try {
  for (const candidate of preflight.entries) {
    for (const size of sizes) {
      const directory = join(output, candidate.name, size.name); await mkdir(join(directory, 'luminance'), { recursive: true });
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, locale: size.locale, hasTouch: size.phone, isMobile: size.phone });
      await context.addInitScript(() => { Date.prototype.getHours = () => 22; Date.prototype.getMinutes = () => 0; Date.prototype.getSeconds = () => 0; Date.prototype.getMilliseconds = () => 0; window.__visualFreezeCamera = true; });
      const page = await context.newPage(); page.setDefaultTimeout(120000);
      const act = locator => size.phone ? locator.tap() : locator.click(), button = name => page.getByRole('button', { name });
      let burning = false, diagnosticStyle = null;
      page.on('pageerror', error => report.errors.push({ candidate: candidate.name, viewport: size.name, pageError: error.stack }));
      page.on('console', message => { if (message.type() === 'error') report.errors.push({ candidate: candidate.name, viewport: size.name, console: message.text(), location: message.location() }); });
      page.on('response', response => { if (response.status() >= 400) report.resources.push({ candidate: candidate.name, viewport: size.name, status: response.status(), url: response.url() }); });
      const readyLighting = () => page.waitForFunction(() => {
        const state = window.__flickerLab.placeInfo()?.lightingState;
        return state && !state.pendingPasses.length && state.residentPasses.includes('night') && state.residentPasses.includes('lamp') && state.weights[0] > .9999;
      }, null, { polling: 100 });
      const shot = async (name, diagnosticCamera = null) => {
        await page.waitForFunction(() => window.__captureCameraState().pendingTweens === 0);
        await readyLighting();
        await page.evaluate(controls => {
          const lab = window.__flickerLab; Object.assign(lab, controls, { flameHold: 17, lampHold: 17 });
          window.__captureSetPhysicalState({ time: 17, fuel: 1 });
        }, controls);
        await page.waitForTimeout(350);
        await page.evaluate(name => window.__flickerLab.begin({ name, seconds: .4 }), name);
        await page.waitForFunction(() => window.__flickerLab.result !== null);
        const raw = await page.evaluate(() => window.__flickerLab.result);
        if (raw.packingError) throw new Error(raw.packingError);
        if (raw.cameraMaximumElementDelta !== 0 || raw.projectionMaximumElementDelta !== 0 || raw.samples.some(sample => sample.visibleParticles !== 0)) throw new Error('Controlled A/B camera or particle state was not held.');
        for (const roi of raw.rois) {
          const bytes = Buffer.from(roi.rawLuminance.gzipBase64, 'base64'), file = join(directory, 'luminance', `${name}-${roi.name}.u32le.gz`);
          await writeFile(file, bytes); delete roi.rawLuminance.gzipBase64;
          Object.assign(roi.rawLuminance, { file, sha256: createHash('sha256').update(bytes).digest('hex') });
        }
        await writeFile(join(directory, `${name}.raw.json`), JSON.stringify(raw));
        const metadata = await page.evaluate(() => ({ camera: window.__captureCameraState(), ignition: window.__visualIgnition ?? null, delivery: window.__captureDeliveryInfo(), lamp: window.__flickerLab.result.lamp }));
        const file = join(directory, `${name}.png`); await page.screenshot({ path: file });
        const maximumStaticRms = Math.max(0, ...raw.samples.flatMap(sample => Object.values(sample.rois).map(roi => roi.rmsDelta ?? 0)));
        report.frames.push({ candidate: candidate.name, viewport: size.name, name, file, diagnosticCamera, label: diagnosticCamera ? 'Diagnostic close camera, HTML hidden; not actual journey framing.' : 'Actual UI camera pose with controlled animation for material comparison.', controls, physicalClockSeconds: 17, fuel: 1, matrix: raw.cameraStart, projection: raw.projectionStart, maximumStaticRms, ...metadata });
        await save(); console.log('CANDIDATE', candidate.name, size.name, name, JSON.stringify({ maximumStaticRms, errors: report.errors.length, httpErrors: report.resources.length }));
        await release(page);
      };
      const putOut = async () => {
        await release(page); await act(button(re('^熄灭$', '^Put out$'))); await act(button(re('熄灭并结束', 'Put out and end'))); await page.getByTestId('result-title').waitFor();
        const records = await page.evaluate(async () => (await (await fetch('/api/me/candles')).json()).candles);
        if (!records.some(record => record.status === 'went_out' && record.endReason === 'put_out')) throw new Error('Actual A/B cleanup was not saved.');
        report.records.push({ candidate: candidate.name, viewport: size.name, records }); burning = false;
      };
      try {
        await page.goto(candidate.base); await page.bringToFront(); await page.getByLabel(re('你的愿望', 'Your wish')).waitFor(); await page.waitForFunction(() => window.__ready && window.__captureSetPhysicalState && window.__captureDeliveryInfo);
        await assertServedSnapshot(page, candidate.fingerprint); await page.evaluate(() => document.fonts.ready.then(() => true));
        const runtime = await page.evaluate(() => { const gl = window.__renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info'); return { devicePixelRatio, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), renderInfo: window.__flickerLab.renderInfo() }; });
        report.runtime.push({ candidate: candidate.name, viewport: size.name, ...runtime });
        if (/SwiftShader|llvmpipe|software/i.test(runtime.renderer)) throw new Error('The requested Metal renderer was not selected.');
        await page.getByLabel(re('你的愿望', 'Your wish')).fill(size.phone ? '愿这一盏灯，陪伴安静的夜晚。' : 'May this lamp keep someone company.'); await act(button(re('许好了', 'Set my wish')));
        await button(re('走进院里', 'Step inside')).waitFor(); await page.waitForFunction(() => Number(getComputedStyle(document.getElementById('fade')).opacity) < .01); await shot('outside');
        await act(button(re('走进院里', 'Step inside'))); await act(button(re('跳过', 'Skip'))); await page.getByRole('tab', { name: re('现成的', 'Ready-made') }).waitFor();
        await act(page.locator('.shapes [role=radio]').first()); await act(page.locator('.swatches [role=radio]').nth(1)); await act(page.locator('.sizes [role=radio]').first()); await shot('choose-10-minutes');
        await act(page.locator('.sizes [role=radio]').last()); await shot('choose-24-hours');
        await act(page.locator('.sizes [role=radio]').first()); await act(button(re('选这一盏', 'Take this one'))); await button(re('点亮这一盏', 'Light it')).waitFor(); await shot('confirm');
        await act(button(re('点亮这一盏', 'Light it'))); burning = true; await page.waitForFunction(() => window.__visualIgnition?.state === 'settled' && window.__visualIgnition.progress === 1); await shot('burning-settled');
        const previous = await page.evaluate(() => window.__captureCameraState());
        diagnosticStyle = await page.addStyleTag({ content: '.ui { visibility: hidden !important; }' });
        for (const detail of details) { await page.evaluate(pose => window.__captureSetCamera(pose), detail); await shot(detail.name, { ...detail, provenance: 'Source-derived pose supplied by the scene modeler; diagnostic only.' }); }
        await page.evaluate(pose => window.__captureSetCamera(pose), previous); await diagnosticStyle.evaluate(element => element.remove()); diagnosticStyle = null;
        await putOut();
      } catch (error) {
        report.errors.push({ candidate: candidate.name, viewport: size.name, fatal: error.stack });
        await page.screenshot({ path: join(directory, 'failure.png') }).catch(() => {});
      } finally {
        if (diagnosticStyle) await diagnosticStyle.evaluate(element => element.remove()).catch(() => {});
        if (burning) await putOut().catch(error => report.errors.push({ candidate: candidate.name, viewport: size.name, cleanupError: String(error) }));
        await context.close(); await save();
      }
    }
  }
} finally {
  await browser.close();
  for (const candidate of preflight.entries) {
    const end = await fingerprintCaptureSource(candidate.source); candidate.sourceEnd = end; candidate.sourceChanged = end.aggregateSha256 !== candidate.fingerprint.aggregateSha256;
    if (candidate.sourceChanged) report.errors.push({ candidate: candidate.name, error: 'Frozen source/assets changed during comparison.' });
  }
  const delta = (a, b) => a && b ? Math.max(...a.map((value, index) => Math.abs(value - b[index]))) : null;
  for (const a of report.frames.filter(frame => frame.candidate === 'quality')) {
    const b = report.frames.find(frame => frame.candidate === 'mobile' && frame.viewport === a.viewport && frame.name === a.name);
    const alignment = { viewport: a.viewport, name: a.name, cameraMaximumElementDelta: delta(a.matrix, b?.matrix), projectionMaximumElementDelta: delta(a.projection, b?.projection) };
    report.alignment.push(alignment);
    if (alignment.cameraMaximumElementDelta !== 0 || alignment.projectionMaximumElementDelta !== 0) report.errors.push({ ...alignment, error: 'The candidate image pair is missing or its camera is not exactly aligned.' });
  }
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const panels = report.frames.filter(frame => frame.candidate === 'quality').map(a => {
    const b = report.frames.find(frame => frame.candidate === 'mobile' && frame.viewport === a.viewport && frame.name === a.name);
    return `<section><h2>${escape(a.viewport)} · ${escape(a.name)}</h2><p>${escape(a.label)}</p><div class="pair">${[a, b].map(frame => frame ? `<figure><figcaption>${escape(frame.candidate)}</figcaption><a href="${escape(relative(output, frame.file))}"><img src="${escape(relative(output, frame.file))}"></a></figure>` : '<p>Missing candidate image.</p>').join('')}</div></section>`;
  }).join('');
  await writeFile(join(output, 'comparison.html'), `<!doctype html><meta charset="utf-8"><title>Snow Roof material profile A/B</title><style>body{margin:20px;background:#151817;color:#eee;font:15px/1.5 system-ui}h1{font-size:24px}h2{font-size:18px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}img{width:100%;height:auto;display:block}section{border-top:1px solid #68726d;padding:12px 0}a{color:#d7c6a3}</style><h1>Snow Roof: quality and mobile material profiles</h1><p>Same source, geometry and lightmaps; controlled animation at 22:00. Close cameras are diagnostics. Click an image to inspect its native pixels. This page does not claim pixel equivalence or select a winner.</p>${panels}`);
  report.finishedAt = new Date().toISOString(); await save();
  console.log('CANDIDATE_AB_DONE', JSON.stringify({ frames: report.frames.length, errors: report.errors.length, httpErrors: report.resources.length, output }));
  if (report.errors.length || report.resources.length) process.exitCode = 1;
}
