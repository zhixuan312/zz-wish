// Headed, no-video performance observation of a frozen Snow Roof checkout.
// Requires capture-only beforeRender/afterRender hooks from performance-lab.mjs.
// BASE_URL=http://127.0.0.1:5191 SOURCE_ROOT=/tmp/FROZEN EVIDENCE=final node tests/visual/snow-performance.mjs
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fingerprintCaptureSource } from './capture-source-fingerprint.mjs';
import { readCaptureManifest, assertServedSnapshot } from './capture-preflight.mjs';

if (process.argv.includes('--help')) {
  console.log('Set BASE_URL and SOURCE_ROOT for the frozen instrumented Vite/API snapshot. Optional EVIDENCE, VIEWPORT=desktop|phone, GPU_TIMERS=0, WARMUP_MS, LOCAL_HOUR and MEASURE_PHASES=burning-normal. This driver always uses headed Chrome Metal, ten-second render windows, no video and no pixel readback. Do not run while another capture or native GPU job owns the device.');
  process.exit(0);
}
const base = process.env.BASE_URL || 'http://127.0.0.1:5191';
const source = process.env.SOURCE_ROOT;
if (!source || !resolve(source).startsWith('/tmp/')) throw new Error('SOURCE_ROOT must identify the served frozen /tmp checkout.');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname)) throw new Error('Use the local frozen Vite/API server.');
const out = resolve('artifacts/snow-performance', process.env.EVIDENCE || 'prepared-final');
const seconds = 10, warmupMs = Number(process.env.WARMUP_MS || 2000);
const hasLocalHour = process.env.LOCAL_HOUR !== undefined, localHour = Number(process.env.LOCAL_HOUR ?? 22);
if (!Number.isFinite(localHour) || localHour < 0 || localHour >= 24) throw new Error('LOCAL_HOUR must be in [0,24).');
const allowedPhases = ['home','outside','choose','burning-normal','burning-power-saver','burning-restored-detail'];
const selectedPhases = process.env.MEASURE_PHASES ? process.env.MEASURE_PHASES.split(',') : null;
if (selectedPhases?.some(phase => !allowedPhases.includes(phase))) throw new Error('Unknown MEASURE_PHASES selection.');
const wants = name => !selectedPhases || selectedPhases.includes(name);
const mixedAtlasProbe = hasLocalHour && localHour === 5.5 && process.env.VIEWPORT === 'phone' && selectedPhases?.length === 1 && selectedPhases[0] === 'burning-normal';
const sourceStart = await fingerprintCaptureSource(source);
if (!sourceStart.sourceFiles) throw new Error('Frozen source was not found; no browser was launched.');
const manifest = await readCaptureManifest(source, { requireFinalBanks: process.env.REQUIRE_FINAL_BANKS === '1' });
const report = { createdAt: new Date().toISOString(), base, sourceStart, partialPreview: !!manifest.partialPreview, seconds, warmupMs, localHour, selectedPhases, mixedAtlasProbe, runtime: {}, samples: [], errors: [], resources: [], cleanup: [], notes: [
  'Actual composer-render timestamps and asynchronous GPU queries; no RAF-only FPS estimate, video recording, gl.readPixels, screenshot or raw-frame recorder during measured windows.',
  'CPU submit is wall time around composer.render(), not CPU utilization. GPU timing is unavailable when unsupported, disjoint, incomplete or disabled.',
  'Each window lasts ten seconds of actual rendering. Screenshots and settling waits occur outside timed windows.',
  `Local lighting clock is held at ${localHour}; fuel, flame, weather and other animation remain running. Camera drift is held for phase-to-phase comparisons.`,
  'Phone is 390×844 CSS touch/viewport emulation on the M1 desktop GPU with deviceScaleFactor 2, exercising the balanced 1.25 renderer cap (about 488×1055 pixels; power saver 390×844). It is not physical-phone performance. Desktop uses deviceScaleFactor 1.',
  'Pre-burn views intentionally cap at 60 FPS. Burning power saver caps at 15 FPS; normal and restored burning detail cap at 30 FPS. Results must be judged against these source caps.',
] };
if (mixedAtlasProbe) report.notes.push('Bounded worst live-atlas set probe: dawn uses night+dusk+day+lamp simultaneously. Only one normal-burning phone window is measured; this is M1 emulation, not physical-phone performance.');
await mkdir(out, { recursive: true });
const save = () => writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
report.runtime.browserVersion = browser.version();
const re = (zh, en) => new RegExp(`${zh}|${en}`);
const sizes = [{ name: 'desktop-en', width: 1440, height: 900, locale: 'en-US', phone: false }, { name: 'phone-zh', width: 390, height: 844, locale: 'zh-CN', phone: true }].filter(size => !process.env.VIEWPORT || size.name.startsWith(process.env.VIEWPORT));
try {
  for (const size of sizes) {
    const dir = join(out, size.name); await mkdir(dir, { recursive: true });
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.phone?2:1, locale: size.locale, hasTouch: size.phone, isMobile: size.phone, reducedMotion: 'no-preference' });
    await context.addInitScript(({hour,fixedSeconds}) => { Date.prototype.getHours = () => Math.floor(hour); Date.prototype.getMinutes = () => Math.floor((hour%1)*60); if(fixedSeconds){Date.prototype.getSeconds=()=>0;Date.prototype.getMilliseconds=()=>0;} window.__visualFreezeCamera = true; }, {hour:localHour,fixedSeconds:hasLocalHour});
    const page = await context.newPage(); page.setDefaultTimeout(120000);
    const act = locator => size.phone ? locator.tap() : locator.click();
    const button = name => page.getByRole('button', { name });
    let hasLit = false, cleanupDone = false;
    page.on('pageerror', error => report.errors.push({ viewport: size.name, error: error.stack || String(error) }));
    page.on('console', message => { if (message.type() === 'error') report.errors.push({ viewport: size.name, console: message.text(), location: message.location() }); });
    page.on('response', response => { if (response.status() >= 400) report.resources.push({ viewport: size.name, url: response.url(), status: response.status() }); });
    const records = () => page.evaluate(async () => (await (await fetch('/api/me/candles')).json()).candles);
    const measure = async (name, intendedCapFPS) => {
      if (!wants(name)) return;
      await page.waitForFunction(() => !window.__captureCameraState || window.__captureCameraState().pendingTweens === 0, null, { timeout: 120000 });
      if (hasLocalHour && name !== 'home') await page.waitForFunction(() => {
        const lab=window.__flickerLab,state=lab?.placeInfo?.().lightingState,light=lab?.currentDaylight?.continuous;
        if(!state||!light||state.pendingPasses.length)return false;
        const n=Math.max(0,Math.min(1,light.n??1)),d=Math.max(0,Math.min(1,light.g??0))*(1-n*.35),wanted=[n*(1-d),d,(1-n)*(1-d)],sum=wanted.reduce((a,b)=>a+b,0);
        return wanted.every((v,i)=>Math.abs(v/sum-state.weights[i])<.00011&&state.residentPasses.includes(['night','dusk','day'][i])===(v/sum>.0001))&&state.residentPasses.includes('lamp');
      },null,{polling:100,timeout:120000});
      await page.screenshot({ path: join(dir, `${name}-before.png`) });
      await page.waitForTimeout(warmupMs);
      const state = await page.evaluate(() => ({ visibility: document.visibilityState, focused: document.hasFocus(), ignition: window.__visualIgnition ?? null, rawRecorderActive: !!window.__flickerLab?.recording, performanceHook: !!window.__performanceLab, lightingState:window.__flickerLab?.placeInfo?.().lightingState??null,daylight:window.__flickerLab?.currentDaylight?.continuous??null }));
      if (state.visibility !== 'visible' || state.rawRecorderActive || !state.performanceHook) throw new Error(`Invalid timing precondition: ${JSON.stringify(state)}`);
      if (mixedAtlasProbe && (state.lightingState.pendingPasses.length || state.lightingState.residentPasses.length!==4 || ['night','dusk','day','lamp'].some(pass=>!state.lightingState.residentPasses.includes(pass)))) throw new Error('Mixed-atlas probe requires all four settled/resident passes.');
      let timeout;
      const sample = await Promise.race([
        page.evaluate(options => window.__performanceLab.begin(options), { name, seconds, gpu: process.env.GPU_TIMERS !== '0' }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`No completed actual-render sample for ${name}.`)), 30000); }),
      ]).finally(() => clearTimeout(timeout));
      const supported = sample.configurationStart.supportedSamples;
      const supported2x = supported.rgba16f.supported.includes(2) && supported.depthComponent24.supported.includes(2);
      const expectedSamples = name === 'burning-power-saver' ? 0 : supported2x ? 2 : 0;
      const expectedPixelRatio = size.phone && name !== 'burning-power-saver' ? 1.25 : 1;
      const expectedBuffer = [Math.floor(size.width * expectedPixelRatio), Math.floor(size.height * expectedPixelRatio)];
      const targetSamples = [sample.configurationStart.renderTarget1?.samples, sample.configurationStart.renderTarget2?.samples];
      const issues = [];
      if (!sample.valid) issues.push('The timing window was invalid.');
      if (targetSamples.some(value => value !== expectedSamples)) issues.push(`Composer targets were ${targetSamples}; expected both ${expectedSamples}.`);
      if (sample.configurationStart.pixelRatio !== expectedPixelRatio || sample.configurationStart.drawingBuffer.some((value, index) => value !== expectedBuffer[index])) issues.push('The measured buffer did not exercise the expected viewport pixel budget.');
      if (sample.configurationChanges.length) issues.push('Render configuration changed during the measured window.');
      if (sample.cameraMaximumElementDelta !== 0 || sample.projectionMaximumElementDelta !== 0) issues.push('The inspection camera moved during timing.');
      if (sample.deliveryStart?.diagnosticError || sample.deliveryEnd?.diagnosticError) issues.push('Delivery diagnostics failed outside the timing window.');
      if (name !== 'home' && (!sample.deliveryStart?.available || !sample.deliveryEnd?.available)) issues.push('The measured Snow Roof did not expose an active baked delivery.');
      const validation = { expectedSamples, targetSamples, expectedPixelRatio, expectedBuffer, issues };
      report.samples.push({ viewport: size.name, name, intendedCapFPS, targetFrameBudgetMs: 1000 / intendedCapFPS, precondition: state, validation, ...sample });
      for (const issue of issues) report.errors.push({ viewport: size.name, name, diagnostic: issue });
      await writeFile(join(dir, `${name}.json`), JSON.stringify(sample, null, 2) + '\n');
      await page.screenshot({ path: join(dir, `${name}-after.png`) });
      await save();
      console.log('PERFORMANCE', size.name, name, JSON.stringify({ valid: sample.valid, frames: sample.renderedFrames, fps: sample.fps, intervalP95: sample.intervals.p95Ms, cpuP95: sample.cpuSubmit.p95Ms, gpuStatus: sample.gpu.status, gpuP95: sample.gpu.p95Ms, ...validation }));
    };
    const putOut = async () => {
      await act(button(re('^熄灭$', '^Put out$')));
      await act(button(re('熄灭并结束', 'Put out and end')));
      await page.getByTestId('result-title').waitFor();
      const saved = await records();
      const ended = saved.find(record => record.status === 'went_out' && record.endReason === 'put_out');
      report.cleanup.push({ viewport: size.name, actualUI: true, succeeded: !!ended, records: saved });
      if (!ended) throw new Error('Actual put-out action did not persist.');
      cleanupDone = true; hasLit = false;
      await page.screenshot({ path: join(dir, 'result-put-out.png') });
    };
    try {
      await page.goto(base); await page.bringToFront();
      await page.getByLabel(re('你的愿望', 'Your wish')).waitFor();
      await page.waitForFunction(() => window.__ready === true && !!window.__performanceLab);
      await assertServedSnapshot(page, sourceStart);
      await page.evaluate(() => document.fonts.ready.then(() => true));
      report.runtime[size.name] = await page.evaluate(() => {
        const renderer = window.__renderer, gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
        return { userAgent: navigator.userAgent, devicePixelRatio, version: gl.getParameter(gl.VERSION), renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), configuration: window.__performanceLab.configuration() };
      });
      if (/SwiftShader|llvmpipe|software/i.test(report.runtime[size.name].renderer)) throw new Error('A software renderer was selected; this is not the requested Metal observation.');
      await measure('home', 60);
      await page.getByLabel(re('你的愿望', 'Your wish')).fill(size.phone ? '愿这一盏灯，陪伴安静的夜晚。' : 'May this lamp keep someone company tonight.');
      await act(button(re('许好了', 'Set my wish')));
      await button(re('走进院里', 'Step inside')).waitFor();
      await page.waitForFunction(() => Number(getComputedStyle(document.getElementById('fade')).opacity) < .01);
      await measure('outside', 60);
      await act(button(re('走进院里', 'Step inside')));
      await act(button(re('跳过', 'Skip')));
      await page.getByRole('tab', { name: re('现成的', 'Ready-made') }).waitFor();
      await act(page.locator('.sizes [role=radio]').first());
      await measure('choose', 60);
      await act(button(re('选这一盏', 'Take this one')));
      await button(re('点亮这一盏', 'Light it')).waitFor();
      await page.waitForTimeout(warmupMs);
      await act(button(re('点亮这一盏', 'Light it'))); hasLit = true;
      await page.waitForFunction(() => window.__visualIgnition?.state === 'settled' && window.__visualIgnition.progress === 1, null, { timeout: 120000 });
      await measure('burning-normal', 30);
      if(wants('burning-power-saver')||wants('burning-restored-detail')){
        await act(button(re('^省电$', '^Save power$')));
        await button(re('^细腻画质$', '^Full detail$')).waitFor();
        await measure('burning-power-saver', 15);
        await act(button(re('^细腻画质$', '^Full detail$')));
        await button(re('^省电$', '^Save power$')).waitFor();
        await measure('burning-restored-detail', 30);
      }
      await putOut();
    } catch (error) {
      report.errors.push({ viewport: size.name, fatal: error.stack || String(error) });
      await page.evaluate(() => window.__performanceLab?.stop('driver-error')).catch(() => {});
      await page.screenshot({ path: join(dir, 'failure.png') }).catch(() => {});
    } finally {
      if (hasLit && !cleanupDone) {
        try { await putOut(); } catch (error) { report.cleanup.push({ viewport: size.name, actualUI: true, succeeded: false, error: String(error) }); }
      }
      await context.close(); await save();
    }
  }
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  report.sourceEnd = await fingerprintCaptureSource(source);
  report.sourceChanged = report.sourceStart.aggregateSha256 !== report.sourceEnd.aggregateSha256;
  await save();
  console.log('PERFORMANCE_DONE', JSON.stringify({ windows: report.samples.length, errors: report.errors.length, sourceChanged: report.sourceChanged }));
  if (report.errors.length || report.sourceChanged) process.exitCode = 1;
}
