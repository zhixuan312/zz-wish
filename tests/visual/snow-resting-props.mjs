// Real-UI contact evidence, not a test suite. Run only while Chrome owns the GPU.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fingerprintCaptureSource } from './capture-source-fingerprint.mjs';
import { readCaptureManifest, assertServedSnapshot } from './capture-preflight.mjs';

const state = process.env.STATE || 'before';
if (!['before', 'after'].includes(state)) throw new Error('STATE must be before or after.');
const source = process.env.SOURCE_ROOT || '/tmp/one-light-resting-props-before';
const base = process.env.BASE_URL || 'http://127.0.0.1:5199';
if (!resolve(source).startsWith('/tmp/')) throw new Error('Use an isolated frozen /tmp source.');
const evidence = process.env.EVIDENCE || `resting-props-${state}`;
const out = resolve('artifacts/snow-resting-props', evidence);
const referencePath = process.env.REFERENCE_REPORT || 'artifacts/snow-resting-props/resting-props-before/paired-reference.json';
const reference = state === 'after' ? JSON.parse(await readFile(referencePath, 'utf8')) : null;
const sourceStart = await fingerprintCaptureSource(source);
const manifest = await readCaptureManifest(source, { requireFinalBanks: true });
const hash = value => createHash('sha256').update(value).digest('hex');
for (const item of manifest.files) {
  const path = join(source, 'web/public/places/snow-roof', item.uri), bytes = await readFile(path);
  if (hash(bytes) !== item.sha256 || (await stat(path)).size !== item.bytes) throw new Error(`Manifest integrity failure: ${item.uri}`);
}
if (!sourceStart.instrumentation?.geometryHelperSha256) throw new Error('Exact camera helper is required in this isolated comparison snapshot.');
const sizes = [{ name: 'desktop-en', width: 1440, height: 900, locale: 'en-US', phone: false }, { name: 'phone-zh', width: 390, height: 844, locale: 'zh-CN', phone: true }].filter(size => !process.env.VIEWPORT || size.name.startsWith(process.env.VIEWPORT));
const selectedPoses = process.env.CAPTURE_POSES?.split(',');
const wants = name => !selectedPoses || selectedPoses.includes(name);
const lowPoses = {
  'desktop-en': { position: [.35, 1.76, -2.1], look: [0, 1.68, -4.75], fov: 48 },
  'phone-zh': { position: [.65, 1.76, 1.2], look: [0, 1.68, -4.75], fov: 70 },
};
const details = [
  { name: 'altar-left-contact', position: [-.65, 1.72, -3.65], look: [-1.18, 1.64, -4.75], fov: 42 },
  { name: 'altar-burner-contact', position: [.45, 1.72, -3.98], look: [0, 1.65, -4.85], fov: 35 },
  { name: 'altar-right-contact', position: [1.75, 1.72, -3.65], look: [1.18, 1.64, -4.75], fov: 42 },
];
const report = { evidence, state, base, createdAt: new Date().toISOString(), sourceStart, partialPreview: !!manifest.partialPreview,
  reference: reference ? { file: referencePath, sha256: hash(await readFile(referencePath)) } : null,
  frames: [], runtime: {}, errors: [], resources: [], cleanup: [], notes: [
    'Actual UI 10-minute and 24-hour choices complete ignition before capture; burning and burnFar are actual product endpoints.',
    'Low altar and three contact close-ups are explicitly diagnostic camera views, not alternate product-flow cameras.',
    'Normal materials, normal linear/trilinear baked samplers, lighting, exposure and bloom are retained. No source geometry or lighting is edited by this runner.',
    'Paired images hold physical/flame time 17, fuel 1, camera matrices and local night 22:00, and hide weather/dust/smoke particles to expose contacts. Live endpoint frames are saved separately.',
    'Every primary held view records ten seconds of lossless raw structural luminance. Short contact close-ups record 0.6 seconds for exact camera/state metadata.',
    'Both sizes use deviceScaleFactor 1 on the Apple M1 Metal desktop GPU. Phone is viewport/touch emulation, not physical-phone performance.',
  ] };
await mkdir(out, { recursive: true });
const save = () => writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await save();
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
report.runtime.browserVersion = browser.version();
const re = (zh, en) => new RegExp(`${zh}|${en}`);
try {
  for (const size of sizes) for (const far of [false, true].filter(far => !selectedPoses || (far ? wants('burnFar') : selectedPoses.some(name => name !== 'burnFar')))) {
    const dir = join(out, size.name); await mkdir(join(dir, 'luminance'), { recursive: true });
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, locale: size.locale, hasTouch: size.phone, isMobile: size.phone });
    await context.addInitScript(() => { Date.prototype.getHours = () => 22; Date.prototype.getMinutes = () => 0; Date.prototype.getSeconds = () => 0; Date.prototype.getMilliseconds = () => 0; window.__visualFreezeCamera = true; });
    const page = await context.newPage(); page.setDefaultTimeout(120000);
    const act = locator => size.phone ? locator.tap() : locator.click(), button = name => page.getByRole('button', { name });
    const phase = far ? 'burnFar' : 'burning'; let lit = false;
    page.on('pageerror', error => { report.errors.push({ viewport: size.name, phase, error: error.stack }); console.log('CONTACT_RUNTIME_ERROR', size.name, phase, error.message); });
    page.on('console', message => { if (message.type() === 'error') { report.errors.push({ viewport: size.name, phase, console: message.text(), location: message.location() }); console.log('CONTACT_CONSOLE_ERROR', size.name, phase, message.text()); } });
    page.on('response', response => { if (response.status() >= 400) report.resources.push({ viewport: size.name, phase, status: response.status(), url: response.url() }); });
    const settle = () => page.waitForFunction(() => {
      const fade = document.getElementById('fade'); if (fade && Number(getComputedStyle(fade).opacity) >= .01) return false;
      return window.__captureCameraState().pendingTweens === 0 && [...document.querySelectorAll('.sheet .inner')].every(element => {
        const s = getComputedStyle(element), box = element.getBoundingClientRect(); if (!box.width || !box.height || s.display === 'none' || s.visibility === 'hidden') return true;
        const m = s.transform === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(s.transform);
        return Number(s.opacity) >= .999 && Math.abs(m.m41) < .0001 && Math.abs(m.m42) < .0001 && element.getAnimations().every(animation => !['running', 'pending'].includes(animation.playState));
      });
    }, null, { polling: 50 });
    const capture = async (name, pose, diagnostic, seconds = 10) => {
      const expected = reference?.frames.find(frame => frame.viewport === size.name && frame.name === name);
      if (reference && !expected) throw new Error(`Missing exact before reference for ${size.name}/${name}`);
      await page.evaluate(({ pose, expected }) => {
        const lab = window.__flickerLab; window.__geometryLab.setExactCamera(null);
        Object.assign(lab, { lockCamera: true, pauseTweens: true, freezeScene: true, freezeGrade: true, freezeDaylight: true, freezeFuel: true, freezeFlame: true, freezeLampMotion: true, hideParticles: true, flameHold: 17, lampHold: 17 });
        window.__captureSetPhysicalState({ time: 17, fuel: 1 });
        if (pose) window.__captureSetCamera(pose);
        if (expected) window.__geometryLab.setExactCamera({ world: expected.cameraWorld, projection: expected.cameraProjection });
      }, { pose, expected });
      await settle(); await page.waitForTimeout(200);
      await page.evaluate(({ name, seconds }) => window.__flickerLab.begin({ name, seconds }), { name, seconds });
      await page.waitForFunction(() => window.__flickerLab.result !== null);
      const raw = await page.evaluate(() => window.__flickerLab.result); if (raw.packingError) throw new Error(raw.packingError);
      for (const roi of raw.rois) if (roi.rawLuminance?.gzipBase64) {
        const bytes = Buffer.from(roi.rawLuminance.gzipBase64, 'base64'), file = join(dir, 'luminance', `${name}-${roi.name}.u32le.gz`);
        await writeFile(file, bytes); delete roi.rawLuminance.gzipBase64; Object.assign(roi.rawLuminance, { file: relative(process.cwd(), file), sha256: hash(bytes) });
      }
      const rawFile = join(dir, `${name}.json`); await writeFile(rawFile, JSON.stringify(raw) + '\n');
      const metadata = await page.evaluate(() => ({ rig: window.__captureCameraState(), ignition: window.__visualIgnition, delivery: window.__captureDeliveryInfo(), runtimeAnchors: window.__geometryLab.inspectSceneAnchors?.() ?? null, renderInfo: window.__flickerLab.renderInfo(), ui: { fadeOpacity: Number(getComputedStyle(document.getElementById('fade')).opacity), sheets: [...document.querySelectorAll('.sheet .inner')].map(element => ({ opacity: Number(getComputedStyle(element).opacity), transform: getComputedStyle(element).transform })) } }));
      const image = join(dir, `${name}.png`); await page.screenshot({ path: image });
      const delta = (a, b) => Math.max(...a.map((value, index) => Math.abs(value - b[index])));
      const frame = { viewport: size.name, name, state, role: diagnostic ? 'Diagnostic low/contact camera; not product flow' : 'Actual settled product endpoint, held for matched comparison', diagnostic, file: relative(process.cwd(), image), sha256: hash(await readFile(image)), rawFile: relative(process.cwd(), rawFile), rawSha256: hash(await readFile(rawFile)), selectedDuration: far ? '24 hours' : '10 minutes', physicalTime: 17, fuel: 1,
        requestedPose: pose, cameraWorld: raw.cameraStart, cameraProjection: raw.projectionStart, cameraMaximumElementDelta: raw.cameraMaximumElementDelta, projectionMaximumElementDelta: raw.projectionMaximumElementDelta,
        referenceCameraMaximumElementDelta: expected ? delta(raw.cameraStart, expected.cameraWorld) : null, referenceProjectionMaximumElementDelta: expected ? delta(raw.projectionStart, expected.cameraProjection) : null,
        samples: raw.samples.length, durationMs: raw.samples.at(-1).elapsedMs, visibleParticleObjectsRange: [Math.min(...raw.samples.map(sample => sample.visibleParticles)), Math.max(...raw.samples.map(sample => sample.visibleParticles))], exposureRange: [Math.min(...raw.samples.map(sample => sample.exposure)), Math.max(...raw.samples.map(sample => sample.exposure))], controls: raw.controls, lamp: raw.lamp,
        roiMetrics: raw.rois.map(roi => ({ name: roi.name, type: roi.type, meanPixelRmsDelta: raw.samples.slice(1).reduce((sum, sample) => sum + sample.rois[roi.name].rmsDelta, 0) / (raw.samples.length - 1) })), ...metadata };
      if (frame.cameraMaximumElementDelta !== 0 || frame.projectionMaximumElementDelta !== 0 || frame.visibleParticleObjectsRange.some(value => value !== 0) || (expected && (frame.referenceCameraMaximumElementDelta !== 0 || frame.referenceProjectionMaximumElementDelta !== 0))) throw new Error(`Matched hold failed: ${size.name}/${name}`);
      if (state === 'after' && !frame.runtimeAnchors?.alignment?.passed) report.errors.push({ viewport: size.name, name, anchorAlignmentError: 'The actual runtime flame/specular/smoke anchors do not satisfy the source-extra contract.', alignment: frame.runtimeAnchors?.alignment ?? null });
      report.frames.push(frame); await save(); console.log('CONTACT_FRAME', size.name, name, JSON.stringify({ file: frame.file, samples: frame.samples, exposure: frame.exposureRange, errors: report.errors.length }));
    };
    const cleanup = async () => {
      await page.evaluate(() => { window.__geometryLab.reset(); Object.assign(window.__flickerLab, { pauseTweens: false, freezeScene: false, freezeGrade: false, freezeDaylight: false, freezeFuel: false, freezeFlame: false, freezeLampMotion: false, hideParticles: false }); });
      await act(button(re('^熄灭$', '^Put out$'))); await act(button(re('熄灭并结束', 'Put out and end'))); await page.getByTestId('result-title').waitFor(); lit = false;
      const candles = await page.evaluate(async () => (await (await fetch('/api/me/candles')).json()).candles);
      report.cleanup.push({ viewport: size.name, phase, actualUI: true, candles });
      if (!candles.some(candle => candle.status === 'went_out' && candle.endReason === 'put_out')) throw new Error('Actual cleanup did not persist.');
    };
    try {
      await page.goto(base); await page.bringToFront(); await page.getByLabel(re('你的愿望', 'Your wish')).waitFor();
      await page.waitForFunction(() => window.__ready && window.__geometryLab); await assertServedSnapshot(page, sourceStart); await page.evaluate(() => document.fonts.ready.then(() => true));
      report.runtime[size.name] = await page.evaluate(() => { const gl = window.__renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info'); return { userAgent: navigator.userAgent, devicePixelRatio, drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) }; });
      if (/SwiftShader|llvmpipe|software/i.test(report.runtime[size.name].renderer)) throw new Error('Software renderer selected.');
      await page.getByLabel(re('你的愿望', 'Your wish')).fill(size.phone ? '愿这一盏灯，安稳地陪伴夜晚。' : 'May this lamp rest steadily through the quiet night.');
      await act(button(re('许好了', 'Set my wish'))); await act(button(re('走进院里', 'Step inside'))); await act(button(re('跳过', 'Skip')));
      await page.getByRole('tab', { name: re('现成的', 'Ready-made') }).waitFor(); await act(far ? page.locator('.sizes [role=radio]').last() : page.locator('.sizes [role=radio]').first());
      await act(button(re('选这一盏', 'Take this one'))); await act(button(re('点亮这一盏', 'Light it'))); lit = true;
      await page.waitForFunction(() => window.__visualIgnition?.state === 'settled' && window.__visualIgnition.progress === 1); await settle();
      const liveFile = join(dir, `${phase}-live.png`); await page.screenshot({ path: liveFile });
      report.frames.push({ viewport: size.name, name: `${phase}-live`, state, role: 'Actual real-time settled product endpoint before comparison controls', file: relative(process.cwd(), liveFile), sha256: hash(await readFile(liveFile)), selectedDuration: far ? '24 hours' : '10 minutes', ...(await page.evaluate(() => ({ rig: window.__captureCameraState(), ignition: window.__visualIgnition, lamp: window.__flickerLab.placeInfo() }))) });
      if (wants(phase)) await capture(phase, null, false);
      if (!far) {
        if (wants('low-altar-edge')) await capture('low-altar-edge', lowPoses[size.name], true);
        for (const pose of details.filter(pose => wants(pose.name))) await capture(pose.name, { ...pose, fov: size.phone ? (pose.name === 'altar-burner-contact' ? 56 : 80) : pose.fov }, true, .6);
      }
      await cleanup();
    } catch (error) { report.errors.push({ viewport: size.name, phase, fatal: error.stack }); await page.screenshot({ path: join(dir, `${phase}-failure.png`) }).catch(() => {}); }
    finally { if (lit) await cleanup().catch(error => report.errors.push({ viewport: size.name, phase, cleanupError: String(error) })); await context.close(); await save(); }
  }
} finally {
  await browser.close(); report.finishedAt = new Date().toISOString(); report.sourceEnd = await fingerprintCaptureSource(source); report.sourceChanged = report.sourceStart.aggregateSha256 !== report.sourceEnd.aggregateSha256;
  await save();
  const sections = report.frames.map(frame => `<section><h2>${frame.viewport} · ${frame.name}</h2><p>${frame.role}</p><a href="${relative(out, resolve(frame.file))}"><img src="${relative(out, resolve(frame.file))}"></a></section>`).join('');
  await writeFile(join(out, 'gallery.html'), `<!doctype html><meta charset="utf-8"><title>Resting props ${state}</title><style>body{background:#17202a;color:#eee;font:15px/1.5 system-ui;margin:24px}img{max-width:100%;height:auto}section{border-top:1px solid #777;margin-top:24px}h2{font-size:19px}</style><h1>Resting props ${state}</h1><p>Actual product burn / burnFar plus explicitly labelled low altar diagnostic views. Normal materials, samplers, light and exposure. Exact held cameras and physical controls are recorded in report.json.</p>${sections}`);
  console.log('CONTACT_DONE', JSON.stringify({ frames: report.frames.length, errors: report.errors.length, httpErrors: report.resources.length, sourceChanged: report.sourceChanged, report: relative(process.cwd(), join(out, 'report.json')) }));
  if (report.errors.length || report.resources.length || report.sourceChanged) process.exitCode = 1;
}
