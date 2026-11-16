// Full Snow Roof visual journey and raw-framebuffer flicker evidence. No test suite.
// BASE_URL=http://127.0.0.1:5190 DB_FILE=/tmp/one-light-real.db EVIDENCE=before node tests/visual/snow-journey-capture.mjs
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { fingerprintCaptureSource } from './capture-source-fingerprint.mjs';
import { setFocusEmulation } from './native-focus-control.mjs';
import { readCaptureManifest, assertServedSnapshot } from './capture-preflight.mjs';
const base = process.env.BASE_URL || 'http://127.0.0.1:5190';
const root = `artifacts/snow-journey/${process.env.EVIDENCE || 'before'}`;
const state = process.env.STATE || 'before';
const core = process.env.CORE_FLOW === '1';
const expanded = process.env.EXPANDED_FLOW === '1' || (state === 'after' && process.env.EXPANDED_FLOW !== '0');
const sourceRoot = process.env.SOURCE_ROOT || (state === 'before' ? '/tmp/one-light-snow-single-baseline' : '/tmp/one-light-snow-single-after');
const manifest = await readCaptureManifest(sourceRoot, { requireFinalBanks: process.env.REQUIRE_FINAL_BANKS === '1' });
const ignitionSettleMs = process.env.IGNITION_SETTLE_MS ? Number(process.env.IGNITION_SETTLE_MS) : null;
const endingSettleMs = Number(process.env.ENDING_SETTLE_MS || (state === 'after' ? 6000 : 1800));
const seconds = Number(process.env.SECONDS || 10);
const dbFile = process.env.DB_FILE || '/tmp/one-light-real.db';
if (!dbFile.startsWith('/tmp/')) throw new Error('Use the explicitly isolated /tmp database for accelerated visual ending evidence.');
const sizes = [{ name: 'desktop-en', width: 1440, height: 900, locale: 'en-US', phone: false }, { name: 'phone-zh', width: 390, height: 844, locale: 'zh-CN', phone: true }].filter(size => !process.env.VIEWPORT || size.name.startsWith(process.env.VIEWPORT));
const defaultControls = { lockCamera: true, pauseTweens: true, freezeScene: false, freezeGrade: false, freezeDaylight: false, freezeFlame: false, freezeLampMotion: false, freezeShadows: false, freezeFuel: false, hideParticles: false, disableBloom: false };
const report = { base, state, createdAt: new Date().toISOString(), manifestAtStart: { partialPreview: !!manifest.partialPreview, materialProfile: manifest.compression?.materialProfile ?? null, lightmapCodec: manifest.compression?.lightmapCodec ?? null }, sourceFingerprints: { start: await fingerprintCaptureSource(sourceRoot) }, runtime: {}, views: [], sequences: [], errors: [], consoleErrors: [], records: [], visibilityEvents: [], interactions: [], videos: [], notes: [
  state === 'before' ? 'Before state: the frozen procedural HEAD, not the unbuilt Blender-baked delivery.' : 'After state: inspect each raw sequence place metadata to verify the baked descriptor is actually active.',
  'Only Snow Roof is selected. The original Cloud Cliff cover is captured as the actual home state.',
  'Ten-second sequences read raw RGBA framebuffer regions inside the render callback. Metrics precede video encoding; raw ROI samples are retained for independent recomputation.',
  'Camera drift is disabled for measurement. Walk tweens pause at three inspection points for still-camera sequences, then resume the same path; the product source is not changed.',
  'Normal sequences retain flame, weather, smoke, bloom and the original grade. Diagnostic sequence names explicitly identify any frozen/hidden component.',
  'Natural completion uses controlled client/server clock acceleration in an isolated visitor/database. It proves visual settlement and saved state, not a ten-minute endurance burn.',
  'Video covers the real UI flow. Raw framebuffer statistics exclude HTML overlays, so panel sequences describe their underlying canvas; representative screenshots show the actual composite UI.',
  'Phone is viewport/touch emulation on a desktop GPU. Sound is not audibly reviewed.',
  'The expanded after flow records all presets/colors, small/large touch drawings and burning toolbar states. Diagnostic controls are separate from product behavior.',
  'Background-tab extinction requires an observed native document.visibilityState=hidden transition; synthetic visibility events are not used.',
  'The native hidden branch clears Playwright focus emulation through its owning CDP session. Trusted event history and actual saved state determine coverage; no hidden-state override or synthetic event is used.',
  core?'Core flow: required static journey views retain ten-second sequences; unchanged preset/color/drawing variations use screenshots.':'Broad flow: individual preset/color/drawing/toolbar states retain ten-second sequences.',
] };
if (!report.sourceFingerprints.start.sourceFiles) throw new Error(`The served source checkout was not found at ${sourceRoot}. Set SOURCE_ROOT to the actual frozen source.`);
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADLESS ? process.env.HEADLESS !== '0' : state !== 'after', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
report.runtime.browserVersion = browser.version(); report.runtime.platform = process.platform; report.runtime.architecture = process.arch;
const re = (zh, en) => new RegExp(`${zh}|${en}`);
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const percentile = (values, q) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))] : null;
const summarize = result => ({
  samples: result.samples.length, durationMs: result.samples.at(-1)?.elapsedMs, cameraMaximumElementDelta: result.cameraMaximumElementDelta,
  projectionMaximumElementDelta: result.projectionMaximumElementDelta, controls: result.controls, place: result.place, walk: result.walk, temporalGradeUniformPresent: result.temporalGradeUniformPresent,
  rois: result.rois.map(roi => { const rows = result.samples.map(sample => sample.rois[roi.name]).filter(row => row.rmsDelta !== null); return {
    name: roi.name, type: roi.type, overlapsLampBodyBounds:roi.overlapsLampBodyBounds,pixels: roi.pixels,rawLuminance:roi.rawLuminance, meanLuminance: average(rows.map(row => row.mean)), meanPixelRmsDelta: average(rows.map(row => row.rmsDelta)), p95PixelRmsDelta: percentile(rows.map(row => row.rmsDelta), .95), maxPixelRmsDelta: Math.max(...rows.map(row => row.rmsDelta)), meanAbsoluteRoiMeanDelta: average(rows.map(row => Math.abs(row.signedMeanDelta))), meanChangedFraction: average(rows.map(row => row.changedPixelFraction)),meanOver3LsbFraction:average(rows.map(row=>row.over3LsbFraction)),
  }; }),
});
try {
 for (const size of sizes) {
  const out = `${root}/${size.name}`; await mkdir(`${out}/sequences/luminance`, { recursive: true });
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, locale: size.locale, hasTouch: size.phone, isMobile: size.phone, recordVideo: { dir: `${out}/video`, size: { width: size.width, height: size.height } } });
  await context.addInitScript(() => {
   Date.prototype.getHours = () => 22; Date.prototype.getMinutes = () => 0;
   const nativeNow = performance.now.bind(performance); let offset = 0;
   performance.now = () => nativeNow() + offset;
   window.__advanceVisualClock = ms => { offset += ms; };
   window.__visualFreezeCamera = true;
   window.__captureVisibilityEvents = [];
   for (const type of ['visibilitychange', 'blur', 'focus', 'pagehide', 'pageshow']) addEventListener(type, event => window.__captureVisibilityEvents.push({ event: type, trusted: event.isTrusted, visibilityState: document.visibilityState, hidden: document.hidden, focused: document.hasFocus(), at: nativeNow() }), true);
  });
  const page = await context.newPage(); page.setDefaultTimeout(120000);
  const mainVideo = page.video();
  const network = await context.newCDPSession(page); await network.send('Network.enable');
  network.on('Network.responseReceived', event => { if (event.response.status >= 400) report.consoleErrors.push({ viewport:size.name,source:'CDP',status:event.response.status,url:event.response.url }); });
  page.on('response', response => { if (response.status() >= 400) report.consoleErrors.push({ viewport: size.name, status: response.status(), url: response.url() }); });
  page.on('pageerror', error => report.errors.push({ viewport: size.name, error: error.message, stack: error.stack }));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({ viewport: size.name, error: message.text(),location:message.location() }); });
  const act = locator => size.phone ? locator.tap() : locator.click();
  const button = name => page.getByRole('button', { name });
  const shot = async name => {
   await page.screenshot({ path: `${out}/${name}.png` });
   const layout = await page.evaluate(() => [...document.querySelectorAll('.ui button,.ui textarea,.ui h1,.ui h2')].filter(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && (rect.left < -2 || rect.right > innerWidth + 2); }).map(element => element.textContent?.trim().slice(0, 80)));
   const visualMetadata = await page.evaluate(() => ({ ignition: window.__visualIgnition ?? null, walk: window.__walkProgress ?? null, visibilityState: document.visibilityState,renderInfo:window.__flickerLab.renderInfo?.()??null,delivery:window.__captureDeliveryInfo?.()??null }));
   report.views.push({ viewport: size.name, name, layoutOverflow: layout, ...visualMetadata }); console.log(size.name, name);
   await writeFile(`${root}/report.json`, JSON.stringify(report, null, 2));
  };
  const sequence = async (name, controls = {}) => {
   // Adaptive duration/profile framing must finish before the static hold.
   // Walk samples deliberately hold the current path point instead.
   if (!name.startsWith('walk-')) await page.waitForFunction(() => !window.__captureCameraState || window.__captureCameraState().pendingTweens === 0, null, { timeout:120000 });
   await page.evaluate(({ defaults, controls }) => { window.__visualFreezeCamera = true; return Object.assign(window.__flickerLab, defaults, controls); }, { defaults: defaultControls, controls });
   await page.waitForTimeout(300);
   const home = name.startsWith('home') || name.startsWith('wish');
   const rois = home ? [{ name: 'left_lattice', type: 'structure', x: .10, y: .50 }, { name: 'floor_planks', type: 'structure', x: .40, y: .87 }, { name: 'rock_surface', type: 'structure', x: .35, y: .08 }, { name: 'sky_control', type: 'sky', x: .80, y: .12 }] : undefined;
   await page.evaluate(({ name, seconds, rois }) => window.__flickerLab.begin({ name, seconds, rois }), { name, seconds, rois });
   await page.waitForFunction(() => window.__flickerLab.result !== null, null, { timeout: seconds * 1000 + 15000 });
   const result = await page.evaluate(() => window.__flickerLab.result);
   if (result.packingError) throw new Error(`Raw luminance packing failed: ${result.packingError}`);
   if (state === 'after' && result.place?.id === 'snow-roof' && !result.place.baked) throw new Error('Snow Roof is still procedural; baked delivery evidence would be mislabeled.');
   if (state === 'after' && !result.place) throw new Error('Capture instrumentation did not retain place metadata.');
   if (result.place?.id === 'snow-roof' && result.place.manifest && !report.delivery) {
    const manifest=result.place.manifest;report.delivery={partialPreview:!!manifest.partialPreview,localClock:'22:00',availableLightmapPasses:Object.fromEntries(Object.entries(manifest.lightmaps).map(([region,passes])=>[region,Object.keys(passes)]))};
    if(manifest.partialPreview)report.notes.push('This is a partial night delivery. Dusk/day atlases are intentionally absent and use loader fallback; this is not acceptance of six time looks or the final complete payload.');
   }
   if (controls.hideParticles && result.samples.some(sample => sample.visibleParticles !== 0)) throw new Error('Particle override was not effective on every rendered frame.');
   if (result.cameraMaximumElementDelta !== 0 || result.projectionMaximumElementDelta !== 0) report.errors.push({ viewport: size.name, state: name, error: 'The static sequence camera or projection moved.' });
   for (const roi of result.rois) if (roi.rawLuminance?.gzipBase64) {
    const bytes = Buffer.from(roi.rawLuminance.gzipBase64, 'base64');
    const file = `${out}/sequences/luminance/${name}-${roi.name}.u32le.gz`; await writeFile(file, bytes);
    delete roi.rawLuminance.gzipBase64; Object.assign(roi.rawLuminance, { file, compressedBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
   }
   const file = `${out}/sequences/${name}.json`; await writeFile(file, JSON.stringify(result));
   report.sequences.push({ viewport: size.name, name, rawFile: file, ...summarize(result) });
   await shot(name);
   await page.evaluate(defaults => Object.assign(window.__flickerLab, defaults, { pauseTweens: false }), defaultControls);
  };
  const variant = async name => {
   if(!core)return sequence(name);
   await page.waitForFunction(()=>!window.__captureCameraState||window.__captureCameraState().pendingTweens===0);await page.waitForTimeout(350);await shot(name);
  };
  const saveVisitor = async () => {
   const directory='/tmp/one-light-capture-visitors';await mkdir(directory,{recursive:true,mode:0o700});
   await writeFile(`${directory}/${(process.env.EVIDENCE||'capture').replace(/[^a-z0-9_-]/gi,'-')}-${size.name}.json`,JSON.stringify(await context.storageState()),{mode:0o600});
  };
  const readRecords = () => page.evaluate(async () => (await (await fetch('/api/me/candles')).json()).candles);
  const goToLamp = async (skip = false) => {
   await act(button(re('就放在这里|走进院里', 'Leave it here|Step inside')));
   if (skip) await act(button(re('跳过', 'Skip')));
   else for (const [index, fraction] of [[1, .25], [2, .5], [3, .75]]) {
    await page.waitForFunction(fraction => window.__walkProgress?.id === 'snow-roof' && window.__walkProgress.progress >= fraction, fraction);
    await sequence(`walk-${index}`);
   }
   await page.getByRole('tab', { name: re('现成的', 'Ready-made') }).waitFor();
  };
  const chooseTen = async () => { await act(page.getByRole('tab', { name: re('现成的', 'Ready-made') })); await act(page.locator('.sizes [role=radio]').first()); };
  const confirmAndLight = async () => { await act(button(re('带上这支|选这一盏', 'Take this one'))); await button(re('点亮这支|点亮这一盏', 'Light it')).waitFor(); };
  const settleIgnition = async (capturePhases = false) => {
   await page.getByTestId('with-you').waitFor();
   if (state !== 'after') { await page.waitForTimeout(1800); return; }
   const started = Date.now(), seen = new Set(); let markerSeen = false;
   while (Date.now() - started < 120000) {
    const marker = await page.evaluate(() => window.__visualIgnition ?? null);
    if (marker) {
     markerSeen = true;
     const phase = String(marker.phase || marker.state || 'in-progress');
     if (capturePhases && !seen.has(phase)) { seen.add(phase); await shot(`ignition-${phase.replace(/[^a-z0-9-]/gi, '-')}`); }
     if ((marker.state === 'settled' || marker.phase === 'settled') && marker.progress === 1) { await page.waitForTimeout(400); return; }
    } else if (!markerSeen && ignitionSettleMs !== null && Date.now() - started >= ignitionSettleMs) return;
    else if (!markerSeen && ignitionSettleMs === null && Date.now() - started > 1500) throw new Error('No DEV ignition completion marker exists. Supply the exact root-approved IGNITION_SETTLE_MS before running this choreography.');
    await page.waitForTimeout(100);
   }
   throw new Error('Ignition choreography did not report a settled camera within 120 seconds.');
  };
  const light = async () => { await saveVisitor();await act(button(re('点亮这支|点亮这一盏', 'Light it'))); await settleIgnition(); };
  const restart = async (custom = false) => {
   await act(button(re('^为这个愿，再点一支$|^为这个愿，再点一盏$', '^Light a new one for this wish$')));
   await button(re('就放在这里|走进院里', 'Leave it here|Step inside')).waitFor(); await goToLamp(true); await chooseTen();
   if (custom) {
    await act(page.getByRole('tab', { name: re('^自己画$', '^Draw$') }));
    const clear = button(re('^重画$', '^Redraw$')); if (await clear.isEnabled()) await act(clear);
    await drawContour([[.25,.16],[.22,.78],[.76,.78],[.64,.16],[.25,.16]]);
    await sequence('custom-shade-before-tab-hidden');
   }
   await confirmAndLight(); await light();
  };
  const drawContour = async contour => {
   const rect = await page.locator('.pad').boundingBox();
   const points = contour.map(([x, y]) => ({ x: rect.x + rect.width * x, y: rect.y + rect.height * y }));
   if (size.phone) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
    for (let i = 1; i < points.length; i++) for (let k = 1; k <= 16; k++) { const a = points[i - 1], b = points[i]; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * k / 16, y: a.y + (b.y - a.y) * k / 16 }] }); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
   } else {
    await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
    for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, { steps: 20 });
    await page.mouse.up();
   }
  };
  const backgroundTabEnding = async () => {
   await restart(true); await sequence('burning-before-tab-hidden');
   const active = (await readRecords()).find(candle => candle.status === 'burning');
   if (!active) throw new Error('No active record exists for the actual background-tab branch.');
   const eventIndex = await page.evaluate(() => window.__captureVisibilityEvents.length);
   // Playwright enables this override by default, suppressing actual tab hiding.
   // Disable it only for this real browser-lifecycle branch.
   await setFocusEmulation(page,false);
   const background = await context.newPage(), backgroundVideo = background.video(); await background.goto('about:blank'); await background.bringToFront();
   let hiddenObserved = false;
   try { await page.waitForFunction(() => document.visibilityState === 'hidden', null, { timeout: 5000, polling: 100 }); hiddenObserved = true; }
   catch { /* The report distinguishes native focus loss from actual tab hiding. */ }
   await background.waitForTimeout(500); await page.bringToFront(); await background.close();
   await setFocusEmulation(page,true);
   report.videos.push({ viewport: size.name, role: 'blank-background-tab-control', file: await backgroundVideo.path() });
   const events = await page.evaluate(index => window.__captureVisibilityEvents.slice(index), eventIndex);
   hiddenObserved ||= events.some(event => event.event === 'visibilitychange' && event.hidden && event.trusted);
   const nativeBlurObserved=events.some(event=>event.event==='blur'&&event.trusted&&event.focused===false);
   report.visibilityEvents.push({ viewport: size.name, branch: hiddenObserved?'actual-native-tab-hidden':'native-focus-departure-under-video', hiddenObserved,nativeBlurObserved,events });
   await page.getByTestId('result-title').waitFor({timeout:15000}); await page.waitForTimeout(endingSettleMs); await sequence('result-focus-departure');
   const records = await readRecords(); const ended = records.find(candle => candle.id === active.id);
   report.records.push({ viewport: size.name, stage: hiddenObserved?'actual-native-tab-hidden':'native-focus-departure', hiddenObserved,nativeBlurObserved,candles: records });
   if (ended?.status !== 'went_out' || ended.endReason !== 'left') throw new Error(`Tab/focus departure did not settle the real record as went_out / left: ${JSON.stringify(ended)}`);
   if(!nativeBlurObserved&&!hiddenObserved)throw new Error('The recorded departure produced neither a trusted native blur nor a hidden event.');
   if(!hiddenObserved)report.notes.push(`${size.name}: video departure proves native blur, not hidden visibility. Actual hidden-state proof is captured separately without video/readback.`);
  };
  try {
   await page.goto(base); await page.bringToFront(); await page.getByLabel(re('你的愿望', 'Your wish')).waitFor(); await page.waitForFunction(() => window.__ready === true && !!window.__flickerLab); await page.evaluate(() => document.fonts.ready.then(() => true));
   if (state === 'after') await assertServedSnapshot(page, report.sourceFingerprints.start);
   report.runtime[size.name] = await page.evaluate(() => { const renderer = window.__renderer, gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info'); return { userAgent: navigator.userAgent, devicePixelRatio, drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], webglVersion: gl.getParameter(gl.VERSION), renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), visibilityState: document.visibilityState }; });
   await sequence('home'); await act(page.locator('.topbar nav button').first()); await sequence('home-other-language'); await act(page.locator('.topbar nav button').first());
   const wish=state==='after'&&process.env.LONG_WISH!=='0'?(size.phone?'愿远行的人平安，愿归来的人有家，愿每一个孤独的夜晚都有人相伴，也愿我们在漫长的日子里仍然心怀温柔与希望。愿你我都安好。':'May this lamp keep someone company through the longest night'):(size.phone?'愿远行的人平安，也愿心里有光。':'May a little light keep someone company.');
   await page.getByLabel(re('你的愿望', 'Your wish')).fill(wish);report.interactions.push({viewport:size.name,state:'wish-written',characters:[...wish].length}); await sequence('wish-written');
   await act(button(re('许好了', 'Set my wish'))); if (await page.locator('.places [role=radio]').count()) await act(page.locator('.places [role=radio]').nth(5)); await page.waitForTimeout(2400); await page.waitForFunction(() => Number(getComputedStyle(document.getElementById('fade')).opacity) < .01);
   await sequence('place'); await goToLamp(); await sequence('lamp-preset');
   if (expanded) {
    await chooseTen(); await variant('lamp-10-minutes');
    for (let index = 1; index < await page.locator('.shapes [role=radio]').count(); index++) { await act(page.locator('.shapes [role=radio]').nth(index)); await variant(`lamp-preset-${index + 1}`); }
    await act(page.locator('.shapes [role=radio]').first());
    for (let index = 0; index < await page.locator('.swatches [role=radio]').count(); index++) { await act(page.locator('.swatches [role=radio]').nth(index)); await variant(`lamp-color-${index + 1}`); }
    await act(page.locator('.swatches [role=radio]').nth(1));
   }
   await act(page.locator('.sizes [role=radio]').last()); await variant('lamp-24-hours'); await chooseTen();
   await act(page.getByRole('tab', { name: re('^自己画$', '^Draw$') })); await variant('lamp-draw-empty');
   if (expanded) {
    await drawContour([[.4,.4],[.36,.65],[.62,.65],[.59,.4],[.4,.4]]); await variant('lamp-draw-small');
    report.interactions.push({ viewport: size.name, state: 'lamp-draw-small', durationLabel: await page.getByTestId('duration').innerText() });
    await act(button(re('^重画$', '^Redraw$'))); await variant('lamp-draw-redrawn-empty');
   }
   await drawContour([[.3,.18],[.25,.75],[.73,.75],[.67,.18],[.3,.18]]);
   await variant('lamp-drawn');
   report.interactions.push({ viewport: size.name, state: 'lamp-drawn', durationLabel: await page.getByTestId('duration').innerText() });
   if (expanded) { await act(button(re('^撤销$', '^Undo$'))); await variant('lamp-draw-undone'); await drawContour([[.3,.18],[.25,.75],[.73,.75],[.67,.18],[.3,.18]]); }
   await chooseTen(); await confirmAndLight(); await sequence('confirm');
   await saveVisitor();await act(button(re('点亮这支|点亮这一盏','Light it'))); await shot('ignition'); await settleIgnition(true); await sequence('burning');
   if(!core)await sequence('diagnostic-burning-fixed-grade',{freezeGrade:true});
   if (expanded&&!core) await sequence('diagnostic-burning-fixed-fuel',{freezeGrade:true,freezeFuel:true});
   if(!core)await sequence('diagnostic-burning-fixed-grade-no-particles',{freezeGrade:true,freezeFuel:true,hideParticles:true});
   if (expanded&&!core) {
    const withoutParticles = { freezeGrade:true,freezeFuel:true,hideParticles:true };
    await sequence('diagnostic-burning-fixed-daylight',{...withoutParticles,freezeDaylight:true});
    await sequence('diagnostic-burning-fixed-flame-clock',{...withoutParticles,freezeDaylight:true,freezeFlame:true});
    await sequence('diagnostic-burning-fixed-lamp-motion',{...withoutParticles,freezeDaylight:true,freezeLampMotion:true});
    await sequence('diagnostic-burning-fixed-shadow-map',{...withoutParticles,freezeDaylight:true,freezeShadows:true});
   }
   await sequence('diagnostic-burning-all-static',{freezeGrade:true,hideParticles:true,freezeScene:true,freezeDaylight:true,freezeFuel:true});
   await page.waitForTimeout(2000); // Let real fuel updates catch up after the diagnostic holds.
   if (expanded&&!core) {
    await act(button(re('^显示剩余时间$', '^Show time left$'))); await sequence('burning-time-left'); await act(button(re('^收起$', '^Hide$')));
    await act(button(re('^收起愿望$', '^Hide wish$'))); await sequence('burning-wish-hidden'); await act(button(re('^显示愿望$', '^Show wish$')));
    await act(button(re('^静音$', '^Mute$'))); await sequence('burning-muted'); await act(button(re('^开启声音$', '^Sound on$')));
    await act(button(re('^省电$', '^Save power$'))); await sequence('burning-save-power'); await act(button(re('^细腻画质$', '^Full detail$')));
    await act(button(re('^熄灭$', '^Put out$'))); await sequence('put-out-warning'); await act(button(re('^继续守着$|^继续陪着$', '^Keep burning$')));
   }
   if(core){await act(button(re('^省电$','^Save power$')));await variant('burning-save-power');await act(button(re('^细腻画质$','^Full detail$')));await variant('burning-restored-detail');}
   await act(button(re('^我的烛$|^我的灯$','^My Candles$|^My Lamps$'))); await sequence('leave-warning'); await act(button(re('熄灭并打开','Put it out and open'))); await button(re('^关闭$','^Close$')).waitFor(); await act(button(re('^关闭$','^Close$')));
   await page.getByTestId('result-title').waitFor(); await shot('went-out-smoke'); await page.waitForTimeout(endingSettleMs); await sequence('result-went-out');
   report.records.push({viewport:size.name,stage:'went-out',candles:await readRecords()});
   if (expanded) await backgroundTabEnding();
   await restart();
   const active = (await readRecords()).find(candle=>candle.status==='burning'); if(!active)throw new Error('No live record available for the accelerated natural-ending capture.');
   const firstAdvance = Math.max(0,active.durationMs-(Date.now()-active.startedAt)-7000);
   const db = new Database(dbFile); const changed = db.prepare('UPDATE candles SET started_at=started_at-? WHERE id=? AND status=\'burning\'').run(firstAdvance,active.id); if(changed.changes!==1){db.close();throw new Error('The approved isolated database did not contain the current live record.');}
   await page.evaluate(ms=>window.__advanceVisualClock(ms),firstAdvance);await page.waitForTimeout(1000);await shot('natural-late-burn-accelerated');
   db.prepare('UPDATE candles SET started_at=started_at-10000 WHERE id=?').run(active.id);db.close();await page.evaluate(()=>window.__advanceVisualClock(10000));
   await page.getByTestId('result-title').waitFor();await shot('natural-ember-accelerated');await page.waitForTimeout(endingSettleMs);await sequence('result-burned-down-accelerated');
   const natural = await readRecords(); report.records.push({viewport:size.name,stage:'natural-ending-accelerated',candles:natural});if(natural.find(c=>c.id===active.id)?.status!=='burned_down')throw new Error('Natural visual ending did not persist as burned_down.');
   await act(button(re('^我的烛$|^我的灯$','^My Candles$|^My Lamps$')));await page.getByTestId('record').first().waitFor();await sequence('my-lamps');
   if(expanded){await page.getByTestId('record').last().scrollIntoViewIfNeeded();await variant('my-lamps-bottom');}
   await act(page.getByRole('tab',{name:re('我的愿望','My wishes')}));await sequence('my-wishes');await act(button(re('^关闭$','^Close$')));
   await act(button(re('^十处灯火$|^灯火$','^Ten Lights$')));await sequence('ten-lights');
   if(await button(re('^时间最长$','^Most time$')).count()){await act(button(re('^时间最长$','^Most time$')));await shot('ten-lights-time');}
   if(await button(re('^此刻$','^Now$')).count()){await act(button(re('^此刻$','^Now$')));await shot('ten-lights-now');}
   await act(button(re('^关闭$','^Close$')));
   await act(button(re('^许一个新的愿$','^Make a new wish$')));await page.waitForTimeout(1600);await sequence('home-return');
  } catch(error) { await page.screenshot({path:`${out}/capture-failure.png`}).catch(()=>{});report.errors.push({viewport:size.name,fatal:error.stack||String(error)});console.error(size.name,error.stack); }
  finally { await context.close(); report.videos.push({ viewport:size.name,role:'whole-UI-journey',file:await mainVideo.path() }); await writeFile(`${root}/report.json`,JSON.stringify(report,null,2)); }
 }
} finally { await browser.close();report.finishedAt=new Date().toISOString();report.sourceFingerprints.end=await fingerprintCaptureSource(sourceRoot);report.sourceFingerprints.changedDuringCapture=report.sourceFingerprints.start.aggregateSha256!==report.sourceFingerprints.end.aggregateSha256;if(report.sourceFingerprints.changedDuringCapture)report.errors.push({error:'Served source or delivered Snow assets changed during the capture.'});await writeFile(`${root}/report.json`,JSON.stringify(report,null,2)); }
