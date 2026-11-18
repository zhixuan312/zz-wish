import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, realpath, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, webkit } from '@playwright/test';
import Database from 'better-sqlite3';
import { remainingFuel, waxCutHeight } from '../../shared/wax.ts';
import { assertCaptureGpuHealthy, installCaptureGpuGuard } from './capture-preflight.mjs';
import { installLiveAudioAudit, sampleLiveAudio } from './live-audio-audit.mjs';

if (process.argv.includes('--help')) {
  console.log([
    'Run the Pine Gate visual journey against a local Vite dev server with the real API.',
    'Acquire the shared GPU lock with mkdir before running and release it afterward.',
    'Set DB_FILE to the dedicated pine-gate-capture-*.sqlite database under TMPDIR.',
    'BASE_URL defaults to http://127.0.0.1:8953 and GPU_LOCK_DIR to ../gpu.lock relative to the worktree.',
    'OUTPUT overrides the default output root, artifacts/pine-gate in the worktree.',
    'CAPTURE_MILESTONE=m1 runs desktop-en and phone-zh on Chrome.',
    'CAPTURE_MILESTONE=m3 runs both viewports and languages on Chrome and WebKit.',
    'CAPTURE_MILESTONE=quality captures a desktop and phone review set. Use QUALITY_PASS=preview or final.',
    'QUALITY_LABEL selects the quality output directory and defaults to QUALITY_PASS.',
    'CAPTURE_BROWSER and CAPTURE_ONLY can select a single context. PINE_HOUR defaults to 22.',
  ].join('\n'));
  process.exit(0);
}

const worktree = fileURLToPath(new URL('../../', import.meta.url));
const outputRoot = resolve(process.env.OUTPUT ?? join(worktree, 'artifacts/pine-gate'));
const lockPath = resolve(process.env.GPU_LOCK_DIR ?? join(worktree, '../gpu.lock'));
const mode = process.env.CAPTURE_MILESTONE ?? 'm1';
assert(['m1', 'm3', 'quality'].includes(mode), 'CAPTURE_MILESTONE must be m1, m3 or quality.');
const quality = mode === 'quality';
const fullJourney = mode !== 'm1';
const qualityPass = process.env.QUALITY_PASS ?? 'preview';
assert(['preview', 'final'].includes(qualityPass), 'QUALITY_PASS must be preview or final.');
const reviewLabel = process.env.QUALITY_LABEL ?? qualityPass;
assert(reviewLabel.length <= 48 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(reviewLabel), 'Use a lowercase hyphenated QUALITY_LABEL.');
const base = new URL(process.env.BASE_URL ?? 'http://127.0.0.1:8953/');
assert(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname)
  && Number(base.port) >= 8950 && Number(base.port) <= 8999, 'Use an isolated capture server on ports 8950–8999.');
const gpuLock = await stat(lockPath).catch(() => null);
assert(gpuLock?.isDirectory(), 'Acquire the exclusive GPU lock before launching.');
assert(process.env.DB_FILE, 'Set DB_FILE to the isolated capture database.');
const dbPath = await realpath(process.env.DB_FILE);
const dbRelative = relative(await realpath(tmpdir()), dbPath);
assert(!isAbsolute(dbRelative) && !dbRelative.startsWith('..') && /^pine-gate-capture-.*\.sqlite$/.test(basename(dbPath)),
  'Use an isolated pine-gate-capture-*.sqlite database under TMPDIR.');
const browserOnly = process.env.CAPTURE_BROWSER;
const contextOnly = process.env.CAPTURE_ONLY;
const hour = Number(process.env.PINE_HOUR ?? 22);
assert(Number.isFinite(hour) && hour >= 0 && hour < 24, 'PINE_HOUR must be in [0,24).');
const suite = (mode === 'm3' ? ['chromium', 'webkit'] : ['chromium'])
  .filter(name => !browserOnly || name === browserOnly);
const sizes = [
  { name: 'desktop', width: 1440, height: 900, phone: false },
  { name: 'phone', width: 390, height: 844, phone: true },
].flatMap(size => {
  const languages = mode === 'm3' ? ['en', 'zh'] : [size.phone ? 'zh' : 'en'];
  return languages.map(language => ({ ...size, language, label: size.name + '-' + language }));
}).filter(size => !contextOnly || size.label === contextOnly);
assert(suite.length && sizes.length, 'No matching capture context.');
const output = quality
  ? join(outputRoot, 'quality', reviewLabel, 'pine')
  : join(outputRoot, mode === 'm3' && (contextOnly || browserOnly || hour !== 22)
    ? ['m3-smoke', browserOnly, contextOnly, 'hour-' + hour].filter(Boolean).join('-') : mode);
let delivery = null;
if (fullJourney) {
  const manifestUrl = new URL('/places/pine-gate/manifest.json', base);
  const response = await fetch(manifestUrl);
  assert(response.ok, 'Pine Gate bake manifest is missing.');
  const bytes = Buffer.from(await response.arrayBuffer());
  const manifest = JSON.parse(bytes.toString('utf8'));
  const preview = quality && qualityPass === 'preview';
  const samples = manifest.bake?.samples;
  assert.equal(Boolean(manifest.partialPreview), preview, 'Capture mode does not match the active bake delivery.');
  assert.equal(samples, preview ? 8 : 64, 'Unexpected Pine Gate bake sample count.');
  delivery = { preview, samples, manifestSha256: createHash('sha256').update(bytes).digest('hex') };
}
await mkdir(output, { recursive: true });
const report = {
  mode,
  ...(quality ? { reviewLabel } : {}),
  delivery,
  clock: 'Local visual hour ' + hour + ' held constant. Controlled client and matching isolated server start times accelerate progress; render animation uses real frame timestamps.',
  viewport: 'Phone is viewport and touch emulation. WebKit freehand uses a trusted mouse stroke.',
  runs: [],
};
const save = () => writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const db = new Database(dbPath, { fileMustExist: true, timeout: 5000 });
const adjustStart = db.prepare("UPDATE candles SET started_at = started_at - ? WHERE id = ? AND place_id = 'pine-gate' AND status = 'burning'");
const scenarios = {
  en: { wish: 'Let the next small step be steady.', label: 'Your wish', place: 'Pine Gate Steps' },
  zh: { wish: '愿下一步走得稳一点。', label: '你的愿望', place: '松门石阶' },
};
const bi = (en, zh) => new RegExp(en + '|' + zh);
const matchStage = (page, screen) => expect(page.locator('.ui')).toHaveAttribute('data-screen', screen, { timeout: 60_000 });
const history = page => page.evaluate(async () => {
  const response = await fetch('/api/me/candles');
  if (!response.ok) throw new Error('Record read failed: ' + response.status);
  return (await response.json()).candles;
});
const activeCandle = async page => {
  const active = (await history(page)).find(candle => candle.status === 'burning' && candle.placeId === 'pine-gate');
  assert(active, 'No active Pine Gate candle reached the server.');
  return active;
};

async function drawProfile(context, page, touch, browserName) {
  const pad = page.locator('.pad');
  await pad.scrollIntoViewIfNeeded();
  const box = await pad.boundingBox();
  assert(box, 'The drawing pad must be visible.');
  const points = [[.33, .19], [.25, .42], [.28, .78], [.68, .78], [.73, .55], [.62, .24], [.33, .19]]
    .map(([x, y]) => ({ x: Math.round(box.x + box.width * x), y: Math.round(box.y + box.height * y) }));
  if (touch && browserName === 'chromium') {
    const cdp = await context.newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
      for (const [index, point] of points.slice(1).entries()) {
        const start = points[index];
        for (let step = 1; step <= 12; step++) {
          const x = start.x + (point.x - start.x) * step / 12;
          const y = start.y + (point.y - start.y) * step / 12;
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
        }
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await cdp.detach();
    }
  } else {
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, { steps: 12 });
    await page.mouse.up();
  }
}

async function capture(browser, browserName, size) {
  const { language, label, phone, width, height } = size;
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: phone && mode === 'm3' ? 2 : 1,
    locale: language === 'zh' ? 'zh-CN' : 'en-US', hasTouch: phone, isMobile: phone,
  });
  const path = mode === 'm3' ? join(output, browserName, label) : join(output, label);
  const run = { browser: browserName, version: browser.version(), label, shots: [], records: [], errors: [] };
  report.runs.push(run);
  await mkdir(path, { recursive: true });
  try {
    await context.addInitScript(installCaptureGpuGuard);
    if (quality) await context.addInitScript(installLiveAudioAudit);
    await context.addInitScript(hour => {
      Date.prototype.getHours = () => Math.floor(hour);
      Date.prototype.getMinutes = () => Math.floor((hour % 1) * 60);
      Date.prototype.getSeconds = () => 0;
      Date.prototype.getMilliseconds = () => 0;
      const nativeNow = performance.now.bind(performance);
      let offset = 0;
      performance.now = () => nativeNow() + offset;
      window.__advanceVisualClock = delta => { offset += delta; };
      window.__visualFreezeCamera = true;
    }, hour);
    const page = await context.newPage();
    page.setDefaultTimeout(65_000);
    page.on('pageerror', error => run.errors.push({ kind: 'runtime', text: error.stack ?? error.message }));
    page.on('console', message => {
      if (message.type() === 'error') run.errors.push({ kind: 'console', text: message.text() });
    });
    page.on('response', response => {
      if (response.status() >= 400) run.errors.push({ kind: 'http', status: response.status(), url: response.url() });
    });
    page.on('crash', () => run.errors.push({ kind: 'crash' }));
    if (mode === 'm3' && phone) {
      await page.route(url => url.pathname === '/src/engine/scene.js', async route => {
        const response = await route.fetch();
        const source = await response.text();
        const target = '  composer.render();';
        if (!response.ok() || source.split(target).length !== 2) {
          run.errors.push({ kind: 'instrumentation', text: 'Could not identify one real composer render.' });
          await route.fulfill({ response });
          return;
        }
        await route.fulfill({
          response,
          body: source.replace(target, target + ' window.__pineMeasureFrame?.();'),
        });
      });
    }

    const button = name => page.getByRole('button', { name });
    const radio = name => page.getByRole('radio', { name });
    const wakeControls = async () => {
      if (await page.locator('.ui').getAttribute('data-controls-idle') !== 'true') return;
      if (phone) await page.touchscreen.tap(8, height / 2);
      else {
        await page.mouse.move(8, height / 2);
        await page.mouse.move(12, height / 2);
      }
    };
    const act = async locator => {
      await wakeControls();
      return phone ? locator.tap() : locator.click();
    };
    const lightButton = button(bi('^Light it', '^点亮这一盏'));
    const { wish, label: wishLabel, place } = scenarios[language];
    const captureShot = async (name, extra = {}) => {
      await assertCaptureGpuHealthy(page);
      const snapshot = await page.evaluate(() => {
        const hud = document.querySelector('.hud-bottom');
        const hudOpacity = hud ? Number(getComputedStyle(hud).opacity) : null;
        return {
          screen: document.querySelector('.ui')?.dataset.screen,
          hudOpacity,
          controlsVisible: !!hud?.querySelector('.ctl') && hudOpacity > .99,
          result: document.querySelector('[data-testid="result-title"]')?.textContent?.trim(),
          elapsedLabel: document.querySelector('[data-testid="with-you"]')?.textContent?.trim(),
          wax: window.__visualPineWax?.() ?? null,
          smoke: window.__visualWickPlume?.() ?? null,
          walk: window.__walkProgress ?? null,
          ignition: window.__visualIgnition ?? null,
          canvas: [window.__renderer.domElement.width, window.__renderer.domElement.height],
          viewportOverflow: [...document.querySelectorAll('.ui button, .ui textarea, .ui h1, .ui h2')]
            .filter(item => {
              const rect = item.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && (rect.left < -2 || rect.right > innerWidth + 2);
            }).map(item => item.textContent.trim()),
        };
      });
      const file = join(path, name + '.png');
      if (fullJourney && snapshot.wax) assert.equal(snapshot.wax.baked, true, 'Active Pine Gate scene must be baked.');
      const bytes = await page.screenshot({ path: file, scale: 'css' });
      run.shots.push({ file: relative(output, file), sha256: createHash('sha256').update(bytes).digest('hex'), ...snapshot, ...extra });
      console.log(browserName, label, name, JSON.stringify(snapshot.wax));
      await save();
      return snapshot;
    };
    const waitWax = (fn, arg) => page.waitForFunction(fn, arg, { polling: 50, timeout: 15_000 });
    const travel = async (skip, journey = false) => {
      const started = performance.now();
      await act(button(bi('^Step inside$', '^走进院里$')));
      if (skip) await act(button(bi('^Skip$', '^跳过$')));
      if (journey) {
        for (const [name, target] of [['walk-25', .25], ['walk-50', .5], ['walk-75', .75]]) {
          await page.waitForFunction(target => {
            const state = window.__walkProgress;
            return state?.id === 'pine-gate' && state.progress >= target;
          }, target, { timeout: 35_000, polling: 50 });
          await captureShot(name);
        }
      }
      await matchStage(page, 'candle');
      if (journey) run.walkDurationMs = performance.now() - started;
    };
    const choose = async (custom = false, long = false) => {
      if (custom) {
        await act(page.getByRole('tab', { name: bi('^Draw$', '^自己画$') }));
        await drawProfile(context, page, phone, browserName);
      } else {
        await act(radio(bi('^Pillar$', '^方墩$')));
        await act(radio(long ? bi('^24 h$', '^24 小时$') : bi('^1 h$', '^1 小时$')));
      }
      await act(radio(custom ? bi('^Beeswax$', '^蜂蜡$') : bi('^Ivory$', '^象牙$')));
      await expect(lightButton).toBeEnabled();
      await waitWax(() => window.__visualPineWax?.()?.remaining === 1);
      if (phone || fullJourney) await page.waitForTimeout(1300);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    const light = async (captureChoreography = false) => {
      await act(lightButton);
      if (captureChoreography) {
        await waitWax(() => window.__visualIgnition?.state === 'igniting' && window.__visualIgnition.progress >= .085);
        await captureShot('ignition');
        await waitWax(() => window.__visualIgnition?.state === 'spreading');
        await captureShot('spreading');
      }
      await expect(page.getByTestId('with-you')).toBeVisible();
      await page.waitForFunction(() => window.__visualIgnition?.state === 'settled', null, { timeout: 30_000, polling: 50 });
      if (captureChoreography) await captureShot('settled');
      const active = await activeCandle(page);
      assert.equal(active.shape.kind, 'candle');
      return active;
    };
    const advance = async (active, delta) => {
      assert.equal(adjustStart.run(delta, active.id).changes, 1, 'The isolated active candle was not updated.');
      await page.evaluate(delta => window.__advanceVisualClock(delta), delta);
    };
    const measureBurnCadence = async () => {
      if (mode !== 'm3' || !phone) return;
      await page.waitForTimeout(1000);
      await assertCaptureGpuHealthy(page);
      run.performance = await page.evaluate(() => new Promise(resolve => {
        const clock = () => performance.timeOrigin + performance.now();
        const frames = [];
        const started = clock();
        window.__pineMeasureFrame = () => frames.push(clock());
        setTimeout(() => {
          delete window.__pineMeasureFrame;
          const durationMs = clock() - started;
          const intervals = frames.slice(1).map((stamp, index) => stamp - frames[index]).sort((a, b) => a - b);
          resolve({
            frames: frames.length, durationMs, fps: frames.length / durationMs * 1000,
            p95FrameMs: intervals[Math.floor(intervals.length * .95)] ?? null,
            drawingBuffer: [window.__renderer.domElement.width, window.__renderer.domElement.height],
            visible: document.visibilityState === 'visible',
          });
        }, 10_000);
      }));
      console.log(browserName, label, 'burn cadence', JSON.stringify(run.performance));
      assert(run.performance.visible && run.performance.frames > 0, 'No visible composer frame timing was captured.');
    };
    const waitProgress = target => waitWax(target => {
      const wax = window.__visualPineWax?.();
      return wax && Math.abs((1 - wax.remaining) - target) < .006;
    }, target);
    const advanceVisibleBurn = async (active, delta, target) => {
      const hud = page.getByTestId('with-you');
      const previous = await hud.textContent();
      await advance(active, delta);
      await waitProgress(target);
      await expect(hud).not.toHaveText(previous);
    };
    const settleRecord = async (active, status, endReason) => {
      await expect(page.getByText(bi('^Saved$', '^记录已保存$'), { exact: true })).toBeVisible();
      const settled = (await history(page)).find(candle => candle.id === active.id);
      assert.equal(settled?.status, status);
      assert.equal(settled.endReason, endReason);
      assert.deepEqual(settled.shape, active.shape);
      run.records.push({
        status, endReason, durationMs: active.durationMs, burnedMs: settled.burnedMs,
        color: active.shape.color, rows: active.shape.rows.length,
      });
      return settled;
    };

    await page.goto(base.href);
    await page.waitForFunction(() => window.__ready === true);
    await assertCaptureGpuHealthy(page);
    run.gpu = await page.evaluate(() => {
      const gl = window.__renderer.getContext();
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    });
    await page.evaluate(() => document.fonts.ready);
    if (fullJourney) await captureShot('home');
    await page.getByLabel(wishLabel).fill(wish);
    await act(button(bi('^Set my wish$', '^许好了$')));
    const pineRadio = radio(new RegExp('^' + place));
    const selectStarted = performance.now();
    await act(pineRadio);
    await expect(pineRadio).toHaveAttribute('aria-checked', 'true');
    if (fullJourney) {
      await expect(button(bi('^Step inside$', '^走进院里$'))).toBeEnabled({ timeout: 60_000 });
      run.placeReadyMs = performance.now() - selectStarted;
      await captureShot('place');
    }
    await travel(!fullJourney, fullJourney);
    const freehand = phone && !quality;
    await choose(freehand);
    const unlit = await captureShot('unlit', { choice: freehand ? 'freehand' : 'preset' });
    assert.equal(unlit.wax.state, 'unlit');

    const complete = await light(fullJourney);
    assert.equal(complete.shape.rows.length > 2, freehand);
    await waitProgress(0);
    const early = await captureShot('burn-00', { targetProgress: 0 });
    await measureBurnCadence();
    if (fullJourney) {
      await wakeControls();
      await expect(page.locator('.ui')).toHaveAttribute('data-controls-idle', 'false');
      await expect.poll(() => page.locator('.hud-bottom').evaluate(hud => Number(getComputedStyle(hud).opacity))).toBeGreaterThan(.99);
      const burning = await captureShot('burn-controls', { targetProgress: 0 });
      assert(burning.controlsVisible, 'The burning screenshot must show the actual controls.');
    }
    if (quality) {
      const signal = await sampleLiveAudio(page, { samples: 12, intervalMs: 150 });
      const meters = signal.readings.flatMap(reading => reading.contexts.flatMap(
        context => context.masters.map(master => master.meter).filter(Boolean)));
      const rms = Math.sqrt(meters.reduce((sum, meter) => sum + meter.rms ** 2, 0) / (meters.length || 1));
      run.audio = { ...signal, rms };
      assert(signal.running && signal.connectedMasters && signal.peak > 0, 'No live Pine Gate ambience was observed.');
      assert(signal.peak < .99, 'Pine Gate audio peaked near clipping.');
    }
    const half = Math.round(complete.durationMs * .5);
    const late = Math.round(complete.durationMs * .95);
    await advanceVisibleBurn(complete, half, .5);
    const middle = await captureShot('burn-50', { targetProgress: .5 });
    if (quality) {
      await waitWax(() => {
        const hud = document.querySelector('.hud-bottom');
        return document.querySelector('.ui')?.dataset.controlsIdle === 'true'
          && hud && Number(getComputedStyle(hud).opacity) < .01;
      });
      await page.evaluate(() => window.__visualPineCloseup());
      try {
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const closeup = await captureShot('candle-closeup');
        assert(closeup.hudOpacity !== null && closeup.hudOpacity < .01, 'The candle close-up must be clear of the burning HUD.');
      } finally {
        await page.evaluate(() => window.__visualPineCloseupRestore());
      }
    }
    await advanceVisibleBurn(complete, late - half, .95);
    const final = await captureShot('burn-95', { targetProgress: .95 });
    assert(early.wax.bodyHeight > middle.wax.bodyHeight && middle.wax.bodyHeight > final.wax.bodyHeight && final.wax.bodyHeight > 0);
    await advance(complete, complete.durationMs - late + 1000);
    await expect(page.getByTestId('result-title')).toHaveText(bi('burned down', '燃尽了'));
    const burned = await settleRecord(complete, 'burned_down', 'complete');
    assert.equal(burned.burnedMs, complete.durationMs);
    await waitWax(() => window.__visualPineWax?.()?.remaining === 0 && !window.__visualWickPlume?.());
    const done = await captureShot('burned-down');
    assert.equal(done.wax.state, 'burned_down');
    assert.equal(done.wax.bodyHeight, 0);
    assert(done.wax.trace);

    await act(button(bi('^Another lamp for this wish$', '^再为此愿点一盏$')));
    await travel(true);
    await choose(!phone && !quality, quality);
    const extinguished = await light();
    if (quality) await captureShot('burn-far');
    const partial = Math.round(extinguished.durationMs * .42);
    await advance(extinguished, partial);
    await waitProgress(.42);
    await act(button(bi('^Put out$', '^熄灭$')));
    if (mode === 'm3') await captureShot('put-out-confirm');
    await act(button(bi('^Put out and end$', '^熄灭并结束$')));
    await waitWax(() => {
      const plume = window.__visualWickPlume?.();
      return plume?.mode === 'sudden' && plume.visibleSprites > 0 && plume.currentTime - plume.startedAt >= .65;
    });
    const out = await captureShot('went-out', { targetProgress: .42 });
    await expect(page.getByTestId('result-title')).toHaveText(bi('went out', '就到这里'));
    const stopped = await settleRecord(extinguished, 'went_out', 'put_out');
    assert(Math.abs(stopped.burnedMs / stopped.durationMs - .42) < .012, 'Went-out result diverged from remaining wax amount.');
    const savedCut = waxCutHeight(stopped.shape.rows, remainingFuel(stopped.burnedMs, stopped.durationMs));
    assert.equal(out.wax.state, 'went_out');
    assert(Math.abs(out.wax.cutHeight - savedCut) < .00001, 'The settled cut and record cut must agree.');
    if (fullJourney) {
      await waitWax(() => !window.__visualWickPlume?.());
      await captureShot('went-out-cooled');
    }

    await page.reload();
    await page.waitForFunction(() => window.__ready === true);
    await expect(page.getByTestId('with-you')).toHaveCount(0);
    await act(button(bi('^My Lamps$', '^我的灯$')));
    const records = page.getByTestId('record');
    await expect(records).toHaveCount(2);
    await expect(records.filter({ hasText: bi('Went out', '已熄灭') })).toHaveCount(1);
    await expect(records.filter({ hasText: bi('Burned down', '已燃尽') })).toHaveCount(1);
    const restored = (await history(page)).find(candle => candle.id === extinguished.id);
    assert.deepEqual(restored, stopped);
    for (const status of ['went_out', 'burned_down']) {
      const thumbnail = records.locator('[data-lamp-state="' + status + '"][data-ready="true"] img');
      await thumbnail.scrollIntoViewIfNeeded();
      await expect(thumbnail).toBeVisible({ timeout: 15_000 });
    }
    run.refreshVerified = true;
    if (mode === 'm3') {
      await page.locator('.panel').evaluate(panel => panel.scrollTo({ top: 0 }));
      await captureShot('my-lamps-after-refresh');
    }
    assert.deepEqual(run.errors, []);
  } catch (error) {
    run.errors.push({ kind: 'capture', text: error.stack ?? String(error) });
    throw error;
  } finally {
    await context.close();
    await save();
  }
}

try {
  let failures = 0;
  for (const name of suite) {
    const options = name === 'chromium'
      ? { channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }
      : {};
    const browser = await (name === 'chromium' ? chromium : webkit).launch(options);
    try {
      for (const size of sizes) {
        try {
          await capture(browser, name, size);
        } catch (error) {
          failures++;
          console.error(name, size.label, error.stack ?? error.message);
        }
      }
    } finally {
      await browser.close();
    }
  }
  console.log('Ran ' + report.runs.length + ' contexts, captured ' + report.runs.reduce((n, run) => n + run.shots.length, 0) + ' screenshots, ' + failures + ' failed contexts.');
  if (failures) process.exitCode = 1;
} finally {
  db.close();
  await save();
}
