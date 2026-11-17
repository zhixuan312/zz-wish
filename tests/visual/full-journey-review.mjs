// Real UI visual capture across Chrome and WebKit. This is not a test suite or benchmark.
import { chromium, webkit } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import Database from 'better-sqlite3';
import { fingerprintCaptureSource } from './capture-source-fingerprint.mjs';
import { assertServedSnapshot, installCaptureGpuGuard, assertCaptureGpuHealthy } from './capture-preflight.mjs';
import { setFocusEmulation } from './native-focus-control.mjs';
import { installLiveAudioAudit, sampleLiveAudio } from './live-audio-audit.mjs';
import { captureEndingPlume } from './ending-plume-capture.mjs';

if (process.argv.includes('--help')) {
  console.log('Real UI capture only; no test suite. Required frozen SOURCE_ROOT and BASE_URL/API proxy, isolated DB_FILE. BROWSERS=chromium,webkit; VIEWPORT=desktop|phone (omit for both); LANGUAGES=en,zh for every language/size, otherwise desktop-en + phone-zh. FLOW=motion records a clean, continuous home→place→walk→ignition→burn video without diagnostic waits; FLOW=full (default) captures the complete UI/endings/records plus static diagnostics and12s real natural/put-out plume windows. REQUIRE_ENDING_PLUME=1 rejects a missing source hook; legacy snapshots otherwise record that limitation. STATIC_SECONDS=10; DETAIL_SECONDS=10; CLOSEUP_CONFIG=.../closeups.json; VIDEO=0 omits the full diagnostic flow video when a separate motion video exists. VIDEO_START=ready uses the public page.screencast API after readiness and before every home/wish action. VIDEO_START=screenshots with explicit FFMPEG_PATH records actual timestamped JPEG captures after readiness at target8FPS and encodes after context close, without a product FPS claim. Set OUTPUT per run. Only launch while owning the exclusive GPU lease.');
  process.exit(0);
}

const base = process.env.BASE_URL || 'http://localhost:5200';
const source = process.env.SOURCE_ROOT || '/tmp/one-light-resting-props-after';
const output = process.env.OUTPUT || 'artifacts/full-review/round-1/before-journey';
const dbFile = process.env.DB_FILE || '/tmp/one-light-round1.db';
if (!source.startsWith('/tmp/') || !dbFile.startsWith('/tmp/')) throw new Error('Use the isolated frozen source and visual API database.');
const seconds = Number(process.env.STATIC_SECONDS || 10), detailSeconds = Number(process.env.DETAIL_SECONDS || seconds), smoke = process.env.FLOW === 'smoke', motion = process.env.FLOW === 'motion', shortFlow = smoke || motion;
const fullyStaticSeconds = Number(process.env.FULLY_STATIC_SECONDS || seconds);
const recordVideo = process.env.VIDEO !== '0', recordAfterReady = recordVideo && process.env.VIDEO_START === 'ready', screenshotVideo = recordVideo && process.env.VIDEO_START === 'screenshots', contextVideo = recordVideo && !recordAfterReady && !screenshotVideo;
if (screenshotVideo && !process.env.FFMPEG_PATH) throw new Error('VIDEO_START=screenshots requires an explicit FFMPEG_PATH.');
if (![seconds, detailSeconds, fullyStaticSeconds].every(value => Number.isFinite(value) && value > 0)) throw new Error('Static/detail capture durations must be positive.');
const names = (process.env.BROWSERS || 'webkit,chromium').split(',');
if (names.some(name => !['webkit', 'chromium'].includes(name))) throw new Error('Unknown browser.');
const fingerprint = await fingerprintCaptureSource(source);
const languages = process.env.LANGUAGES?.split(',');
if (languages?.some(language => !['en', 'zh'].includes(language))) throw new Error('LANGUAGES accepts en,zh.');
const sizes = [{ viewport: 'desktop', width: 1440, height: 900, phone: false }, { viewport: 'phone', width: 390, height: 844, phone: true }]
  .filter(size => !process.env.VIEWPORT || size.viewport === process.env.VIEWPORT)
  .flatMap(size => (languages || [size.phone ? 'zh' : 'en']).map(language => ({ ...size, language, name: `${size.viewport}-${language}`, locale: language === 'zh' ? 'zh-CN' : 'en-US' })));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const re = (zh, en) => new RegExp(`${zh}|${en}`);
let closeupConfig = null;
if (process.env.CLOSEUP_CONFIG) {
  const bytes = await readFile(process.env.CLOSEUP_CONFIG), parsed = JSON.parse(bytes);
  const cameras = Array.isArray(parsed) ? parsed : parsed.cameras;
  if (!Array.isArray(cameras) || !cameras.length) throw new Error('CLOSEUP_CONFIG has no camera registry.');
  for (const pose of cameras) if (!pose.name || ![pose.position,pose.look].every(vector => Array.isArray(vector) && vector.length === 3 && vector.every(Number.isFinite)) || !Number.isFinite(pose.fov)) throw new Error(`Invalid closeup pose ${pose.name}.`);
  closeupConfig = { path: process.env.CLOSEUP_CONFIG, sha256: hash(bytes), cameras, groupIds: [...new Set(cameras.flatMap(pose => pose.groupIds || []))], coordinateSpace: 'Authored browser WORLD Y-up; source hall offsets are already present. Apply literally, without another nook offset. Framing requires actual browser review.' };
}
const report = { createdAt: new Date().toISOString(), base, sourceStart: fingerprint, flow: motion ? 'continuous core motion; no inserted static measurement waits' : smoke ? 'smoke through settled light' : 'complete real UI journey with static diagnostics', staticSeconds: motion ? 0 : seconds, detailSeconds, closeupConfig, coverage: sizes.map(size => size.name),
  frames: [], sequences: [], endingCaptures: [], videos: [], runtime: [], errors: [], httpErrors: [], records: [], interactions: [], audio: [], resources: [], notes: [
    'No test runner. Chrome and WebKit run sequentially under one GPU lease. No performance claim is made from video/readback capture.',
    'The driver detects an old separate confirmation or the new direct-light choice; it does not substitute engine calls for product lighting/settlement.',
    'FLOW=motion supplies the clean pacing video. The full diagnostic flow deliberately inserts static measurement waits; its video, when requested, is labelled accordingly. Walk screenshots use actual progress; separate held replay supplies static walk sequences.',
    'Physical local look is 22:00. Accelerated natural ending moves only the isolated visitor clock/server start time and verifies actual product settlement; it is not an endurance burn.',
    'The full flow captures12seconds from each real natural/put-out plume start, including physical transit through the cap. These diagnostic holds never run in FLOW=motion or cleanup.',
    'Phone is desktop-GPU viewport/touch emulation. WebKit continuous drawing uses trusted mouse pointer input because Playwright exposes only native taps for WebKit; this is not physical-phone touch-stroke proof.',
    'Playwright screen videos contain no live audio track. Live AudioContext signal checks and the separate offline listening copies support sound review; loudspeaker/headphone listening remains required.',
  ] };
await mkdir(output, { recursive: true });
const save = () => writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
const captureDetails = async (page, size, sequence) => {
  if (!closeupConfig) return;
  if (process.env.DETAIL_VIEWPORTS && !process.env.DETAIL_VIEWPORTS.split(',').includes(size.name)) return;
  for (let pose of closeupConfig.cameras) {
    if (pose.viewport && pose.viewport !== size.name) continue;
    if (size.phone && pose.phone) pose = { ...pose, ...pose.phone };
    if (pose.dynamic === 'visitor-lantern') {
      const lamp = await page.evaluate(() => window.__flickerLab.result?.lamp), bounds = lamp?.worldBounds;
      if (!bounds) throw new Error('Visitor lantern close-up needs actual world bounds.');
      const center = bounds.min.map((value, index) => (value + bounds.max[index]) / 2), distance = Math.max(1, (bounds.max[1] - bounds.min[1]) * 2.5);
      pose = { ...pose, position: [center[0] + distance * .28, center[1] + .08, center[2] + distance], look: center, fov: 42 };
    }
    const previous = await page.evaluate(pose => window.__captureSetCamera(pose), pose);
    await sequence(`detail-${pose.name}`, { freezeScene: true, freezeGrade: true, freezeDaylight: true, freezeFuel: true, hideParticles: true }, detailSeconds,
      { diagnostic: true, role: pose.role, groupIds: pose.groupIds, requestedPose: pose });
    await page.evaluate(previous => window.__captureSetCamera(previous), previous);
  }
};
const heldWalkReplay = async (browser, name, size) => {
  const directory = `${output}/${name}/${size.name}`, scope = { browser: name, viewport: size.name, role: 'Separate held-walk diagnostic replay; the main video remains continuous.' };
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, locale: size.locale, hasTouch: size.phone, isMobile: size.phone });
  await context.addInitScript(installLiveAudioAudit);
  await context.addInitScript(installCaptureGpuGuard);
  await context.addInitScript(() => { Date.prototype.getHours = () => 22; Date.prototype.getMinutes = () => 0; window.__visualFreezeCamera = true;
    window.__journeyEvents = []; for (const type of ['visibilitychange', 'blur', 'focus']) addEventListener(type, event => window.__journeyEvents.push({ type, trusted: event.isTrusted, hidden: document.hidden, focused: document.hasFocus() }), true);
  });
  const page = await context.newPage(); page.setDefaultTimeout(90000);
  page.on('pageerror', error => report.errors.push({ ...scope, error: error.stack }));
  const act = async locator => { if (await page.locator('.ui').getAttribute('data-controls-idle') === 'true') { if (size.phone) await page.touchscreen.tap(8, size.height / 2); else await page.mouse.move(8, size.height / 2); } return size.phone ? locator.tap() : locator.click(); };
  let activeLamp = false;
  const record = async (stage, controls = {}, duration = seconds, extra = {}) => {
    await page.evaluate(controls => Object.assign(window.__flickerLab, { lockCamera: true, pauseTweens: true, freezeScene: false, freezeGrade: false, freezeDaylight: false, freezeFuel: false, hideParticles: false }, controls), controls);
    await page.evaluate(({ stage, duration }) => window.__flickerLab.begin({ name: stage, seconds: duration }), { stage, duration });
    await page.waitForFunction(() => window.__flickerLab.result !== null);
    await assertCaptureGpuHealthy(page);
    const result = await page.evaluate(() => window.__flickerLab.result); if (result.packingError) throw new Error(result.packingError);
    for (const roi of result.rois) if (roi.rawLuminance?.gzipBase64) { const bytes = Buffer.from(roi.rawLuminance.gzipBase64, 'base64'), file = `${directory}/sequences/luminance/${stage}-${roi.name}.u32le.gz`; await writeFile(file, bytes); delete roi.rawLuminance.gzipBase64; Object.assign(roi.rawLuminance, { file, sha256: hash(bytes) }); }
    const rawFile = `${directory}/sequences/${stage}.json`, file = `${directory}/${stage}.png`; await writeFile(rawFile, JSON.stringify(result)); await page.screenshot({ path: file });
    report.sequences.push({ ...scope, stage, file: rawFile, samples: result.samples.length, durationMs: result.samples.at(-1).elapsedMs, cameraDelta: result.cameraMaximumElementDelta, projectionDelta: result.projectionMaximumElementDelta, controls: result.controls, ...extra });
    report.frames.push({ ...scope, stage, file, sha256: hash(await readFile(file)), walk: result.walk, cameraWorld: result.cameraStart, cameraProjection: result.projectionStart, ...extra });
    await page.evaluate(() => Object.assign(window.__flickerLab, { pauseTweens: false, freezeScene: false, freezeGrade: false, freezeDaylight: false, freezeFuel: false, hideParticles: false })); await save();
  };
  try {
    await page.goto(base); await page.waitForFunction(() => window.__ready && window.__flickerLab); await assertServedSnapshot(page, fingerprint);
    await page.getByLabel(re('你的愿望', 'Your wish')).fill(size.language === 'zh' ? '沿着雪里的脚印，慢慢走进院子。' : 'A quiet walk through the snowy court.');
    await act(page.getByRole('button', { name: re('许好了', 'Set my wish') }));
    await act(page.getByRole('button', { name: re('走进院里|就放在这里', 'Step inside|Leave it here') }));
    for (const [index, progress] of [[1, .25], [2, .5], [3, .75]]) {
      await page.waitForFunction(progress => window.__walkProgress?.progress >= progress, progress);
      await page.evaluate(() => Object.assign(window.__flickerLab, { lockCamera: true, pauseTweens: true }));
      await record(`walk-static-${index}`); console.log('JOURNEY_HELD_WALK', name, size.name, index);
    }
    const button = label => page.getByRole('button', { name: label });
    // The full contact registry can exceed ten minutes with raw-frame packing.
    // A real 24-hour selection keeps this separate diagnostic replay burning.
    await page.getByRole('tab', { name: re('现成的', 'Ready-made') }).waitFor(); await act(page.locator('.sizes [role=radio]').last());
    const old = button(re('选这一盏|带上这支', 'Take this one')); if (await old.count()) await act(old);
    await act(button(re('点亮这一盏|点亮这支', 'Light it'))); activeLamp = true;
    await page.waitForFunction(() => window.__visualIgnition?.state === 'settled' && window.__visualIgnition.progress === 1);
    await record('diagnostic-burning-normal'); await record('diagnostic-burning-fully-static', { freezeScene: true, freezeGrade: true, freezeDaylight: true, freezeFuel: true, hideParticles: true }, !process.env.DETAIL_VIEWPORTS || process.env.DETAIL_VIEWPORTS.split(',').includes(size.name) ? fullyStaticSeconds : seconds);
    await captureDetails(page, size, record);
    if (name === 'chromium') await setFocusEmulation(page, false);
    const eventIndex = await page.evaluate(() => window.__journeyEvents.length), background = await context.newPage(); await background.goto('about:blank'); await background.bringToFront(); await background.waitForTimeout(700); await page.bringToFront(); await background.close();
    const events = await page.evaluate(index => window.__journeyEvents.slice(index), eventIndex);
    const nativeDeparture = events.some(event => event.trusted && ((event.type === 'blur' && !event.focused) || (event.type === 'visibilitychange' && event.hidden)));
    if (nativeDeparture) {
      await page.getByTestId('result-title').waitFor(); activeLamp = false;
      report.records.push({ ...scope, ending: 'native tab/focus departure without video/readback', nativeEvents: events, candles: await page.evaluate(async () => (await (await fetch('/api/me/candles')).json()).candles) });
      await page.waitForTimeout(500); report.audio.push({ ...scope, stage: 'native-departure-ended', ...(await sampleLiveAudio(page)) });
      await record('result-native-departure');
    } else report.interactions.push({ ...scope, stage: 'native departure control', limitation: 'No trusted native blur/hidden event observed; this does not establish a product failure.', nativeEvents: events });
  } catch (error) { report.errors.push({ ...scope, fatal: error.stack }); await page.screenshot({ path: `${directory}/held-walk-failure.png` }).catch(() => {}); }
  finally { if (activeLamp) { try { await act(page.getByRole('button', { name: re('^熄灭$', '^Put out$') })); await act(page.getByRole('button', { name: re('熄灭并结束', 'Put out and end') })); } catch { /* Closing the real page still invokes product departure settlement. */ } } await context.close(); await save(); }
};
await save();
for (const name of names) {
  const browser = await (name === 'webkit' ? webkit : chromium).launch(name === 'webkit' ? { headless: false } : { channel: 'chrome', headless: false, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try { for (const size of sizes) {
    const directory = `${output}/${name}/${size.name}`; await mkdir(`${directory}/sequences/luminance`, { recursive: true });
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, locale: size.locale, hasTouch: size.phone, isMobile: size.phone,
      ...(contextVideo ? { recordVideo: { dir: `${directory}/video`, size: { width: size.width, height: size.height } } } : {}) });
    await context.addInitScript(installLiveAudioAudit);
    await context.addInitScript(installCaptureGpuGuard);
    await context.addInitScript(() => {
      Date.prototype.getHours = () => 22; Date.prototype.getMinutes = () => 0; Date.prototype.getSeconds = () => 0;
      const native = performance.now.bind(performance); let offset = 0; window.__captureNativeNow = native;
      performance.now = () => native() + offset; window.__advanceVisualClock = ms => { offset += ms; };
      window.__visualFreezeCamera = true; window.__journeyEvents = [];
      for (const type of ['visibilitychange', 'blur', 'focus', 'pagehide']) addEventListener(type, event => window.__journeyEvents.push({ type, trusted: event.isTrusted, hidden: document.hidden, focused: document.hasFocus(), at: native() }), true);
    });
    const page = await context.newPage(); page.setDefaultTimeout(90000); const video = page.video();
    let lit = false, screencastStarted = false, screenshotRecording = false, screenshotTask = null, screenshotStopTime = null;
    const screencastFile = `${directory}/video/motion.webm`;
    const screenshotFrames = [], screenshotDirectory = `${directory}/video/screenshot-frames`, screenshotTimestamps = `${directory}/video/frame-times.json`;
    const scope = { browser: name, viewport: size.name };
    page.on('pageerror', error => { report.errors.push({ ...scope, error: error.stack }); console.log('JOURNEY_ERROR', name, size.name, error.message); });
    page.on('console', message => { if (message.type() === 'error') { report.errors.push({ ...scope, console: message.text(), location: message.location() }); console.log('JOURNEY_CONSOLE', name, size.name, message.text()); } });
    page.on('response', response => { if (response.status() >= 400) report.httpErrors.push({ ...scope, url: response.url(), status: response.status() }); });
    const button = label => page.getByRole('button', { name: label });
    const wake = async () => { if (await page.locator('.ui').getAttribute('data-controls-idle') === 'true') { if (size.phone) await page.touchscreen.tap(8, size.height / 2); else await page.mouse.move(8, size.height / 2); } };
    const act = async locator => { await wake(); return size.phone ? locator.tap() : locator.click(); };
    const audio = async (stage, expected) => {
      const result = await sampleLiveAudio(page, { samples: motion ? 1 : 4 });
      const issues = [];
      if (expected === 'audible' && !result.running) issues.push('The product AudioContext did not reach running after a trusted light gesture.');
      if (expected === 'audible' && result.peak !== null && result.peak <= 1e-8) issues.push('No live master signal was observed while unmuted and burning.');
      if (expected === 'silent' && result.peak !== null && result.peak > 1e-8) issues.push('The live master retained signal after mute/ending settling.');
      report.audio.push({ ...scope, stage, expected, issues, ...result });
      for (const issue of issues) report.errors.push({ ...scope, audio: stage, diagnostic: issue });
      await save();
    };
    const settle = () => page.waitForFunction(() => {
      const fade = document.getElementById('fade'); if (fade && +getComputedStyle(fade).opacity >= .01) return false;
      if (window.__captureCameraState?.().pendingTweens) return false;
      if ([...document.querySelectorAll('.thumb[data-ready=false]')].some(element => { const r = element.getBoundingClientRect(); return r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; })) return false;
      if ([...document.querySelectorAll('.thumb img')].some(image => { const r = image.getBoundingClientRect(); return r.height > 0 && r.bottom > 0 && r.top < innerHeight && (!image.complete || !image.naturalWidth); })) return false;
      return [...document.querySelectorAll('.sheet .inner')].every(element => {
        const s = getComputedStyle(element), box = element.getBoundingClientRect(); if (!box.height || s.visibility === 'hidden' || s.display === 'none') return true;
        const m = s.transform === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(s.transform);
        return +s.opacity >= .999 && Math.abs(m.m42) < .0001;
      });
    }, null, { polling: 50 });
    const shot = async (stage, stable = true, extra = {}) => {
      if (stable) await settle();
      await assertCaptureGpuHealthy(page);
      const metadata = await page.evaluate(() => ({ nativeMs: window.__captureNativeNow(), screen: document.querySelector('.ui')?.dataset.screen, ignition: window.__visualIgnition ?? null,
        walk: window.__walkProgress ?? null, rig: window.__captureCameraState?.() ?? null, renderInfo: window.__flickerLab?.renderInfo?.() ?? null,
        loading: [...document.querySelectorAll('.court-loading')].map(element => ({ stage: element.dataset.stage, text: element.innerText, progress: element.querySelector('progress')?.value ?? null })),
        audio: window.__liveAudioAudit?.snapshot() ?? null, runtimeAnchors: window.__captureRuntimeAnchors?.() ?? null, colorView:window.__captureColorView?.()??null,
        overflow: [...document.querySelectorAll('.ui button,.ui textarea,.ui h1,.ui h2')].filter(element => { const r = element.getBoundingClientRect(); return r.width && (r.left < -2 || r.right > innerWidth + 2); }).map(element => element.textContent?.trim()),
        buttonWraps: [...document.querySelectorAll('.ui button')].filter(element => { const r = element.getBoundingClientRect(), style = getComputedStyle(element); if (!r.width || style.visibility === 'hidden' || element.matches('.shape,.record-summary')) return false;
          const range = document.createRange(); range.selectNodeContents(element); return new Set([...range.getClientRects()].filter(rect => rect.width > 0).map(rect => Math.round(rect.top))).size > 1;
        }).map(element => element.innerText) }));
      const file = `${directory}/${stage}.png`; await page.screenshot({ path: file });
      report.frames.push({ ...scope, stage, file, sha256: hash(await readFile(file)), ...metadata, ...extra }); await save(); console.log('JOURNEY_FRAME', name, size.name, stage);
    };
    const sequence = async (stage, controls = {}, duration = seconds) => {
      if (motion) { await shot(stage); return; }
      await settle();
      await page.evaluate(controls => Object.assign(window.__flickerLab, { lockCamera: true, pauseTweens: true, freezeScene: false, freezeGrade: false, freezeDaylight: false, freezeFuel: false, freezeFlame: false, freezeLampMotion: false, hideParticles: false }, controls), controls);
      await page.waitForTimeout(150); await page.evaluate(({ stage, duration }) => window.__flickerLab.begin({ name: stage, seconds: duration }), { stage, duration });
      await page.waitForFunction(() => window.__flickerLab.result !== null, null, { timeout: duration * 1000 + 20000 });
      const result = await page.evaluate(() => window.__flickerLab.result); if (result.packingError) throw new Error(result.packingError);
      for (const roi of result.rois) if (roi.rawLuminance?.gzipBase64) { const bytes = Buffer.from(roi.rawLuminance.gzipBase64, 'base64'), file = `${directory}/sequences/luminance/${stage}-${roi.name}.u32le.gz`; await writeFile(file, bytes); delete roi.rawLuminance.gzipBase64; Object.assign(roi.rawLuminance, { file, sha256: hash(bytes) }); }
      const file = `${directory}/sequences/${stage}.json`; await writeFile(file, JSON.stringify(result));
      report.sequences.push({ ...scope, stage, file, samples: result.samples.length, durationMs: result.samples.at(-1).elapsedMs, cameraDelta: result.cameraMaximumElementDelta, projectionDelta: result.projectionMaximumElementDelta, controls: result.controls });
      await shot(stage, false); await page.evaluate(() => Object.assign(window.__flickerLab, { pauseTweens: false, freezeScene: false, freezeGrade: false, freezeDaylight: false, freezeFuel: false, freezeFlame: false, freezeLampMotion: false, hideParticles: false }));
    };
    const records = () => page.evaluate(async () => (await (await fetch('/api/me/candles')).json()).candles);
    const choose = async (minutes = 10, skip = false) => {
      await page.waitForFunction(()=>['ready','error'].includes(document.querySelector('.court-loading')?.dataset.stage),null,{timeout:90000});
      if(await page.locator('.court-loading').getAttribute('data-stage')==='error')throw new Error('Court preparation reached its actual error state; capture is rejected before entering.');
      await act(button(re('走进院里|就放在这里', 'Step inside|Leave it here')));
      if (skip) await act(button(re('^跳过$', '^Skip$')));
      else for (const [index, progress] of [[1, .25], [2, .5], [3, .75]]) { await page.waitForFunction(progress => window.__walkProgress?.progress >= progress, progress); await shot(`walk-${index}`, false); }
      await page.getByRole('tab', { name: re('现成的', 'Ready-made') }).waitFor();
      await act(page.getByRole('tab', { name: re('现成的', 'Ready-made') })); await act(minutes === 1440 ? page.locator('.sizes [role=radio]').last() : page.locator('.sizes [role=radio]').first());
    };
    const prepareLight = async () => {
      const old = button(re('选这一盏|带上这支', 'Take this one'));
      if (await old.count()) { await act(old); await sequence('confirm-old-flow'); report.interactions.push({ ...scope, flow: 'old-confirm' }); }
      else report.interactions.push({ ...scope, flow: 'direct-light' });
    };
    const light = async prefix => {
      await audio(`${prefix}-before-tap`, 'silent');
      await act(button(re('点亮这一盏|点亮这支', 'Light it'))); lit = true; await shot(`${prefix}-ignition`, false);
      const seen = new Set();
      for (let start = Date.now(); Date.now() - start < 120000;) {
        const marker = await page.evaluate(() => window.__visualIgnition ?? null);
        if (marker && !seen.has(marker.state)) { seen.add(marker.state); await shot(`${prefix}-${marker.state}`, false); }
        if (marker?.state === 'settled' && marker.progress === 1) { await audio(`${prefix}-settled-autoplay`, 'audible'); return; }
        await page.waitForTimeout(60);
      }
      throw new Error('Ignition did not settle.');
    };
    const endingCapture = async (stage, trigger) => {
      const available = await page.evaluate(() => typeof window.__visualWickPlume === 'function');
      if (!available) {
        if (process.env.REQUIRE_ENDING_PLUME === '1') throw new Error('Required actual wick-plume source hook is missing.');
        report.endingCaptures.push({ ...scope, stage, captured: false, limitation: 'Legacy frozen source has no actual wick-plume hook; no plume visibility claim.' });
        await trigger(); return;
      }
      const directoryPlume = `${directory}/ending-plume`, frames = await captureEndingPlume({ page, directory: directoryPlume, stage, trigger, seconds: 12 });
      report.frames.push(...frames.map(frame => ({ ...scope, ...frame, stage: `${stage}-${frame.requestedSeconds}s`, role: 'Real ending plume with held product camera and live physical animation.' })));
      report.endingCaptures.push({ ...scope, stage, captured: true, seconds: 12, file: `${directoryPlume}/${stage}.json`, frames: frames.length });
      await save(); console.log('JOURNEY_ENDING_PLUME', name, size.name, stage, frames.length);
    };
    const putOut = async ({ capturePlume = false } = {}) => {
      await act(button(re('^熄灭$', '^Put out$')));
      const finish = async () => { await act(button(re('熄灭并结束', 'Put out and end'))); await page.getByTestId('result-title').waitFor(); lit = false; };
      if (capturePlume && !shortFlow) await endingCapture('ending-put-out', finish); else await finish();
      await page.waitForTimeout(500); await audio('put-out-ended', 'silent'); report.records.push({ ...scope, ending: 'put-out', candles: await records() });
    };
    const again = async minutes => { await act(button(re('为这个愿，再点一盏|再为此愿点一盏', 'Light a new one for this wish|Another lamp for this wish'))); await choose(minutes, true); await prepareLight(); };
    const draw = async contour => {
      const box = await page.locator('.pad').boundingBox(), points = contour.map(([x, y]) => ({ x: box.x + box.width * x, y: box.y + box.height * y }));
      if (size.phone && name === 'chromium') { const cdp = await context.newCDPSession(page); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
        for (let i = 1; i < points.length; i++) for (let j = 1; j <= 12; j++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: points[i - 1].x + (points[i].x - points[i - 1].x) * j / 12, y: points[i - 1].y + (points[i].y - points[i - 1].y) * j / 12 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
      } else { await page.mouse.move(points[0].x, points[0].y); await page.mouse.down(); for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, { steps: 15 }); await page.mouse.up(); }
      report.interactions.push({ ...scope, stage: 'drawing', pointer: size.phone && name === 'chromium' ? 'native touch protocol' : 'trusted mouse pointer', duration: await page.getByTestId('duration').innerText() });
    };
    try {
      const startupBegan = Date.now();
      await page.goto(base); await page.bringToFront();
      if (name === 'webkit' && contextVideo) {
        await page.mouse.click(8, 8);
        report.interactions.push({ ...scope, stage: 'recorded-startup-focus', pointer: 'trusted mouse click at empty page margin (8,8)', reason: 'Trusted focus control before recorded WebKit startup.' });
      }
      const startupBudget = name === 'webkit' && contextVideo ? 180000 : 90000;
      await page.waitForFunction(() => window.__ready && window.__flickerLab, null, { timeout: startupBudget }); await assertServedSnapshot(page, fingerprint); await page.evaluate(() => document.fonts.ready.then(() => true));
      report.interactions.push({ ...scope, stage: 'startup-ready', wallMs: Date.now() - startupBegan, timeoutMs: startupBudget, recordingDuringStartup: contextVideo });
      console.log('JOURNEY_READY', name, size.name, Date.now() - startupBegan);
      if (recordAfterReady) {
        await mkdir(`${directory}/video`, { recursive: true });
        await page.screencast.start({ path: screencastFile, size: { width: size.width, height: size.height } });
        screencastStarted = true;
        report.interactions.push({ ...scope, stage: 'recording-started', method: 'Public page.screencast API after readiness and before every home/wish action.' });
      }
      if (screenshotVideo) {
        await mkdir(screenshotDirectory, { recursive: true });
        screenshotRecording = true;
        screenshotTask = (async () => {
          const origin = performance.now(), wallOrigin = Date.now();
          try {
            while (screenshotRecording) {
              const begin = performance.now(), file = `${screenshotDirectory}/${String(screenshotFrames.length).padStart(6, '0')}.jpg`;
              await page.screenshot({ path: file, type: 'jpeg', quality: 80, animations: 'allow' });
              const end = performance.now();
              screenshotFrames.push({ file, relativeMs: (begin + end) / 2 - origin, wallTimestampMs: wallOrigin + (begin + end) / 2 - origin, captureMs: end - begin });
              await new Promise(done => setTimeout(done, Math.max(0, 125 - (performance.now() - begin))));
            }
            screenshotStopTime = performance.now() - origin;
          } catch (error) { report.errors.push({ ...scope, recordingError: String(error) }); }
        })();
        report.interactions.push({ ...scope, stage: 'recording-started', method: 'Actual page JPEG screenshots at a target8FPS, after readiness and before every home/wish action; native wall timestamps, no scene/clock freeze and no FPS claim.' });
      }
      report.runtime.push({ ...scope, version: browser.version(), ...(await page.evaluate(() => { const gl = window.__renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info'); return { userAgent: navigator.userAgent, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight] }; })) });
      await sequence('home');
      await audio('home-before-light', 'silent');
      if (!shortFlow) { await act(button(re('许好了', 'Set my wish'))); await shot('wish-empty-inline'); }
      const wish = size.language === 'zh' ? '愿远行的人平安，愿归来的人有家，也愿每个孤独的夜晚有人相伴。愿你我都能心怀温柔，稳稳走过眼前这一段。' : 'May this small light keep someone company through the night.';
      await page.getByLabel(re('你的愿望', 'Your wish')).fill(wish); await shot('wish-loading', false); await sequence('wish-written');
      await act(button(re('许好了', 'Set my wish'))); await sequence('place'); await choose(10, smoke); await sequence('choose');
      if (!shortFlow) {
        for (let index = 0; index < await page.locator('.shapes [role=radio]').count(); index++) { await act(page.locator('.shapes [role=radio]').nth(index)); await shot(`shape-${index + 1}`); }
        await act(page.locator('.shapes [role=radio]').first());
        for (let index = 0; index < await page.locator('.swatches [role=radio]').count(); index++) { await act(page.locator('.swatches [role=radio]').nth(index)); await shot(`colour-${index + 1}`); }
        await act(page.locator('.swatches [role=radio]').nth(1)); await act(page.locator('.sizes [role=radio]').last()); await shot('choose-24-hours');
        await act(page.getByRole('tab', { name: re('自己画', '^Draw$') })); await sequence('draw-empty');
        await draw([[.4,.4],[.36,.65],[.62,.65],[.59,.4],[.4,.4]]); await shot('draw-small'); await act(button(re('重画', 'Redraw')));
        await draw([[.3,.18],[.25,.75],[.73,.75],[.67,.18],[.3,.18]]); await sequence('draw-large');
        await act(button(re('撤销', 'Undo'))); await shot('draw-undo'); await act(page.getByRole('tab', { name: re('现成的', 'Ready-made') })); await act(page.locator('.sizes [role=radio]').first());
      }
      await prepareLight(); await light('light'); await sequence('burning'); if (smoke) await sequence('burning-fully-static', { freezeScene: true, freezeGrade: true, freezeDaylight: true, freezeFuel: true, hideParticles: true });
      if (!shortFlow) {
        await act(button(re('^静音$', '^Mute$'))); await page.waitForTimeout(250); await audio('actual-ui-muted', 'silent'); await shot('sound-muted');
        await act(button(re('^开启声音$', '^Sound on$'))); await page.waitForTimeout(250); await audio('actual-ui-unmuted', 'audible');
        await act(button(re('^我的灯$|^我的烛$', '^My Lamps$|^My Candles$'))); await shot('leave-warning'); await act(button(re('熄灭并打开', 'Put it out and open'))); await act(button(re('^关闭$', '^Close$'))); lit = false;
        await page.waitForTimeout(2000); await sequence('result-went-out'); await audio('navigated-ended', 'silent'); report.records.push({ ...scope, ending: 'navigated', candles: await records() });
        await again(1440); await light('long-light'); await sequence('burnFar');
        await putOut({ capturePlume: true }); await sequence('result-put-out'); await again(10); await light('natural-light');
        const active = (await records()).find(candle => candle.status === 'burning'); if (!active) throw new Error('No active record for the natural ending.');
        const advance = Math.max(0, active.durationMs - (Date.now() - active.startedAt) - 6000), database = new Database(dbFile);
        try { const changed = database.prepare("UPDATE candles SET started_at=started_at-? WHERE id=? AND status='burning'").run(advance, active.id); if (changed.changes !== 1) throw new Error('The isolated database does not own the current fixture.');
          await page.evaluate(ms => window.__advanceVisualClock(ms), advance); await page.waitForTimeout(1800); await shot('natural-late-burn', false, { accelerated: true });
          await endingCapture('ending-natural', async () => {
            database.prepare('UPDATE candles SET started_at=started_at-10000 WHERE id=?').run(active.id); await page.evaluate(() => window.__advanceVisualClock(10000));
            await page.getByTestId('result-title').waitFor(); lit = false; await shot('natural-last-ember', false, { accelerated: true });
          });
        } finally { database.close(); }
        await page.getByTestId('result-title').waitFor(); lit = false; await page.waitForTimeout(2500); await sequence('result-burned-down'); await audio('natural-ended', 'silent');
        const ended = await records(); report.records.push({ ...scope, ending: 'accelerated-natural', candles: ended }); if (ended.find(candle => candle.id === active.id)?.status !== 'burned_down') throw new Error('Natural completion did not persist.');
        await act(button(re('^我的灯$|^我的烛$', '^My Lamps$|^My Candles$'))); await page.getByTestId('record').first().waitFor(); await sequence('my-lamps');
        const expand = page.getByTestId('record').first().getByRole('button', { name: re('查看这盏灯', 'See this lamp') });
        if (await expand.count()) { await act(expand); await sequence('record-expanded'); }
        await act(page.getByRole('tab', { name: re('我的愿望', 'My wishes') })); await sequence('my-wishes'); await act(button(re('^关闭$', '^Close$')));
        await act(button(re('^灯火$|^十处灯火$', '^Ten Lights$'))); await sequence('ten-lights'); await act(button(re('^关闭$', '^Close$')));
        await act(button(re('许一个新的愿|许个新愿', 'Make a new wish|New wish'))); await sequence('home-return');
      }
    } catch (error) {
      const startupState = await page.evaluate(() => ({ ready:window.__ready??null, flickerLab:!!window.__flickerLab, renderer:!!window.__renderer,
        renderFrame:window.__renderer?.info?.render?.frame??null, contextLost:window.__renderer?.getContext().isContextLost()??null,
        gpuEvents:window.__captureGpuEvents??[], visibility:document.visibilityState, focused:document.hasFocus(),
        poster:document.getElementById('cover-poster')?.dataset.ready??null,
        sceneResources:performance.getEntriesByType('resource').filter(entry=>entry.name.includes('/engine/scene.js')).map(entry=>({name:entry.name,duration:entry.duration,responseEnd:entry.responseEnd})),
        delivery:window.__captureDeliveryInfo?.()??null })).catch(readError=>({readError:String(readError)}));
      report.errors.push({ ...scope, fatal: error.stack, startupState }); console.log('JOURNEY_FATAL', name, size.name, error.message, JSON.stringify(startupState));
      await writeFile(`${directory}/failure-state.json`,JSON.stringify(startupState,null,2)+'\n');
      await page.screenshot({ path: `${directory}/failure.png` }).catch(() => {});
    }
    finally {
      if (lit) await putOut().catch(error => report.errors.push({ ...scope, cleanupError: String(error) }));
      if (screencastStarted) {
        await page.screencast.stop().catch(error => report.errors.push({ ...scope, recordingError: String(error) }));
        report.videos.push({ ...scope, file: screencastFile, method: 'Public page.screencast; begins after engine readiness, before home/wish actions.', role: motion ? 'Clean continuous real UI motion; no inserted static holds.' : 'Real UI with explicit static diagnostic waits.' });
      }
      if (screenshotTask) { screenshotRecording = false; await screenshotTask; }
      await context.close();
      if (screenshotTask && screenshotFrames.length > 1) {
        await writeFile(screenshotTimestamps, JSON.stringify({ ...scope, targetFps: 8, stopRelativeMs: screenshotStopTime, timestampConvention: 'Midpoint of each actual screenshot request in native wall time; capture latency is reported. The video uses these real intervals and makes no product FPS claim.', frames: screenshotFrames }, null, 2) + '\n');
        const containerFps = 25, origin = screenshotFrames[0].relativeMs;
        const child = spawn(process.env.FFMPEG_PATH, ['-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(containerFps), '-c:v', 'mjpeg', '-i', 'pipe:0', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-cpu-used', '6', '-pix_fmt', 'yuv420p', '-an', '-y', screencastFile]);
        const completed = new Promise(done => {
          let errors = ''; child.stderr.on('data', chunk => { errors += chunk; });
          child.on('error', error => { report.errors.push({ ...scope, recordingError: String(error) }); done(); });
          child.on('close', code => { if (code) report.errors.push({ ...scope, recordingError: `Timestamped JPEG video encoder exited${code}: ${errors}` }); else report.videos.push({ ...scope, file: screencastFile, timestamps: screenshotTimestamps, capturedFrames: screenshotFrames.length, targetCaptureFps: 8, containerFps, timingQuantizationMs: 20, method: 'Actual JPEG captures encoded after context close; each source image is held to its measured native wall duration, rounded to the25FPS container grid. No frame interpolation.', role: 'Continuous real UI motion; capture-limited cadence, no inserted static holds, no product FPS claim.' }); done(); });
        });
        try {
          for (let index = 0; index < screenshotFrames.length; index++) {
            const frame = screenshotFrames[index], bytes = await readFile(frame.file);
            const first = Math.round((frame.relativeMs - origin) * containerFps / 1000), next = Math.round(((screenshotFrames[index + 1]?.relativeMs ?? screenshotStopTime) - origin) * containerFps / 1000);
            for (let repeat = first; repeat < next; repeat++) if (!child.stdin.write(bytes)) await new Promise(done => child.stdin.once('drain', done));
          }
          child.stdin.end();
        } catch (error) { report.errors.push({ ...scope, recordingError: String(error) }); child.kill(); }
        await completed;
      }
      if (video) report.videos.push({ ...scope, file: await video.path(), role: motion ? 'Clean continuous real UI motion; no inserted static holds.' : 'Real UI with explicit static diagnostic waits; use the separate FLOW=motion video for pacing.' }); await save();
    }
    if (!shortFlow) await heldWalkReplay(browser, name, size);
  } } finally { await browser.close(); }
}
report.finishedAt = new Date().toISOString(); report.sourceEnd = await fingerprintCaptureSource(source); report.sourceChanged = fingerprint.aggregateSha256 !== report.sourceEnd.aggregateSha256; await save();
console.log('JOURNEY_DONE', JSON.stringify({ frames: report.frames.length, sequences: report.sequences.length, errors: report.errors.length, httpErrors: report.httpErrors.length, sourceChanged: report.sourceChanged }));
if (report.errors.length || report.httpErrors.length || report.sourceChanged) process.exitCode = 1;
