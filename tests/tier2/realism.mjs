// Visual review only: run sequentially, with no test suites or other GPU captures.
// EVIDENCE=round-0 BASE_URL=http://localhost:5173 API_URL=http://localhost:8792 node tests/tier2/realism.mjs
// Optional: PLACES=cloud-cliff,pine-gate VIEWPORT=desktop|phone HOUR=22 CAMERA_SPEED=2 RESUME=1 COVER_ONLY=1 REQUIRE_WALK_PROGRESS=1 FAST_SWEEP=1.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const places = ['pine-gate', 'bamboo-rain', 'cloud-cliff', 'lotus-pond', 'sea-tide', 'snow-roof', 'loess-cliff', 'highland', 'bell-lane', 'valley-pagoda'];
const selected = process.env.COVER_ONLY ? ['cloud-cliff'] : process.env.PLACES ? process.env.PLACES.split(',') : places;
const base = process.env.BASE_URL || 'http://localhost:5173';
const api = process.env.API_URL;
const tag = process.env.EVIDENCE || 'round-0';
const root = `artifacts/realism/${tag}`;
const hour = Number(process.env.HOUR || 22);
const fastSweep = !!process.env.FAST_SWEEP;
const cameraSpeed = Number(process.env.CAMERA_SPEED || 1);
if (!(cameraSpeed > 0 && cameraSpeed <= 3)) throw new Error('CAMERA_SPEED must be greater than zero and at most three.');
const sizes = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, phone: false },
  { name: 'phone', viewport: { width: 390, height: 844 }, phone: true },
].filter(s => !process.env.VIEWPORT || process.env.VIEWPORT === s.name);
let stopRequested = false;
process.on('SIGINT', () => { stopRequested = true; console.log('Stopping after the current place.'); });
const browser = await chromium.launch({ channel: 'chrome', headless: true, handleSIGINT: false, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const report = { tag, base, localHour: hour, cameraSpeed, fastSweep, startedAt: new Date().toISOString(), views: [], errors: [], consoleErrors: [], notes: [
  'Visual captures from real UI actions; no test suite and no accelerated burn clock.',
  'When the development-only __walkProgress signal is present, walk samples wait for actual spatial fractions 0.25/0.50/0.75 and record before/after progress and camera position. Snapshot builds without the signal fall back to nominal wall-time samples; those do not prove exact positions. CAMERA_SPEED scales rAF timestamps from a stable initial origin, speeding scene animation only; product burn time stays real.',
  'Phone viewport and touch emulation on desktop GPU, not a physical phone.',
  'Clean captures hide only .ui visibility for the screenshot, without moving camera, hiding scene geometry or changing lights.',
] };
if (fastSweep) report.notes.push('Brightness review only: FAST_SWEEP uses the visible Skip control and captures outside/lit, not walk or ending evidence.');
await mkdir(root, { recursive: true });
if (process.env.RESUME) {
  try { const previous = JSON.parse(await readFile(`${root}/report.json`, 'utf8')); report.views = previous.views || []; report.errors = previous.errors || []; report.consoleErrors = previous.consoleErrors || [];
    for (const viewport of ['desktop', 'phone']) if (previous[viewport]) report[viewport] = previous[viewport]; } catch { /* First run has no report. */ }
}

try {
  for (const size of sizes) {
   if (stopRequested) break;
   for (const currentId of selected) {
    if (stopRequested) break;
    if (process.env.RESUME && report.views.some(v => v.viewport === size.name && v.place === currentId && v.phase === (fastSweep ? 'lit' : 'went-out'))) continue;
    const context = await browser.newContext({ viewport: size.viewport, locale: 'en-US', hasTouch: size.phone, isMobile: size.phone, reducedMotion: 'no-preference' });
    if (api) await context.route('**/api/**', async route => {
      try {
        const original = new URL(route.request().url());
        const upstream = await route.fetch({ url: new URL(original.pathname + original.search, api).href });
        await route.fulfill({ response: upstream });
      } catch (error) {
        if (/disposed|Target.*closed|Browser.*closed/i.test(error.message)) return;
        throw error;
      }
    });
    await context.addInitScript(({ hour, cameraSpeed }) => {
      Date.prototype.getHours = () => hour;
      Date.prototype.getMinutes = () => 0;
      Date.prototype.getSeconds = () => 0;
      if (cameraSpeed !== 1) {
        const nativeFrame = requestAnimationFrame.bind(window); let origin = null;
        window.requestAnimationFrame = callback => nativeFrame(stamp => {
          if (origin === null) origin = stamp;
          callback(origin + (stamp - origin) * cameraSpeed);
        });
      }
    }, { hour, cameraSpeed });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    let currentPlace = 'cover';
    page.on('pageerror', e => report.errors.push({ viewport: size.name, place: currentPlace, error: e.message, stack: e.stack }));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({ viewport: size.name, place: currentPlace, error: message.text() }); });
    const button = name => page.getByRole('button', { name });
    const act = async locator => size.phone ? locator.tap() : locator.click();
    const out = `${root}/${size.name}`;
    await mkdir(out, { recursive: true });
    const shot = async (place, phase, elapsed = null) => {
      const directory = `${out}/${place}`;
      await mkdir(directory, { recursive: true });
      const overflow = await page.evaluate(() => [...document.querySelectorAll('.ui button,.ui textarea,.ui h1,.ui h2')].filter(e => {
        const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < -2 || r.right > innerWidth + 2);
      }).map(e => e.textContent?.trim().slice(0, 80)));
      const walking = phase.startsWith('walk-');
      const walkBefore = walking ? await page.evaluate(() => window.__walkProgress ?? null) : null;
      if (!walking) await page.screenshot({ path: `${directory}/${phase}-ui.png` });
      await page.locator('.ui').evaluate(el => { el.style.visibility = 'hidden'; });
      try { await page.screenshot({ path: `${directory}/${phase}.png` }); }
      finally { await page.locator('.ui').evaluate(el => { el.style.visibility = ''; }); }
      const walkAfter = walking ? await page.evaluate(() => window.__walkProgress ?? null) : null;
      if (walking) await page.screenshot({ path: `${directory}/${phase}-ui.png` });
      const gl = await page.locator('#gl').evaluate(canvas => { const gl = canvas.getContext('webgl2'); return { error: gl.getError(), lost: gl.isContextLost() }; });
      report.views.push({ viewport: size.name, place, phase, elapsedWalkMs: elapsed, cameraSpeed, overflow, gl, walkBefore, walkAfter });
      console.log(`${size.name} ${place} ${phase}`);
      await writeFile(`${root}/report.json`, JSON.stringify(report, null, 2));
    };
    try {
    await page.goto(base);
    await page.getByLabel('Your wish').waitFor();
    await page.waitForFunction(() => window.__ready === true);
    await page.waitForTimeout(1600);
    const gpu = await page.locator('#gl').evaluate(canvas => {
      const gl = canvas.getContext('webgl2'); const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable', width: canvas.width, height: canvas.height };
    });
    report[size.name] = { gpu, viewport: size.viewport, touch: size.phone, cameraSpeed, localHour: hour };
    if (!report.views.some(v => v.viewport === size.name && v.place === 'cover')) await shot('cover', 'cover');
    if (process.env.COVER_ONLY) continue;
    await page.getByLabel('Your wish').fill('May this little light keep someone company.');
    await act(button('Set my wish'));
    const id = currentId;
    {
      if (!places.includes(id)) throw new Error(`Unknown place: ${id}`);
      currentPlace = id;
      const radio = page.locator('.places [role=radio]').nth(places.indexOf(id));
      await act(radio);
      await page.waitForTimeout(2400);
      await page.waitForFunction(() => Number(getComputedStyle(document.getElementById('fade')).opacity) < .01);
      await shot(id, 'outside');
      const start = Date.now();
      await act(button('Leave it here'));
      if (fastSweep) await act(button('Skip'));
      if (!fastSweep) {
      // Wait on actual engine progress when available. The frozen baseline predates this development signal.
      await page.waitForTimeout(100);
      const hasProgress = await page.evaluate(() => window.__visualWalkAvailable === true);
      if (process.env.REQUIRE_WALK_PROGRESS && !hasProgress) throw new Error('Development walk-progress capability is required for this capture.');
      for (const [index, fraction, seconds] of [[1, .25, 14 * Math.cbrt(.25 / 4)], [2, .5, 7], [3, .75, 14 * (1 - Math.cbrt(.25 / 4))]]) {
        if (hasProgress) {
          await page.waitForFunction(({ id, fraction }) => {
            const walk = window.__walkProgress;
            return walk?.id === id && (walk.progress >= fraction || walk.state === 'done');
          }, { id, fraction }, { timeout: 120000 });
        } else await page.waitForTimeout(Math.max(0, start + seconds * 1000 / cameraSpeed - Date.now()));
        await shot(id, `walk-${index}`, Date.now() - start);
      }
      }
      await page.getByRole('tab', { name: 'Ready-made', exact: true }).waitFor();
      await page.waitForTimeout(800);
      if (!fastSweep) await shot(id, 'choose');
      await act(button(/Take this one/));
      await button(/Light it/).waitFor();
      await act(button(/Light it/));
      await page.getByTestId('with-you').waitFor();
      await page.waitForTimeout(2400);
      await shot(id, 'lit');
      await act(button('Put out'));
      await act(button('Put out and end'));
      await page.getByTestId('result-title').waitFor();
      if (!fastSweep) {
        await page.waitForTimeout(400);
        await shot(id, 'went-out-smoke');
        await page.waitForTimeout(1700);
        await shot(id, 'went-out');
      }
    }
    } catch (error) {
      const path = `${out}/${currentId}/capture-failure.png`;
      await mkdir(`${out}/${currentId}`, { recursive: true });
      await page.screenshot({ path }).catch(() => {});
      report.errors.push({ viewport: size.name, place: currentId, fatal: error.stack || String(error), url: page.url(), screenshot: path });
      console.error(`${size.name} ${currentId} failed: ${error.message}`);
    } finally { await context.close(); }
   }
  }
} catch (error) {
  report.errors.push({ fatal: error.stack || String(error) });
  throw error;
} finally {
  const required = fastSweep ? ['outside', 'lit'] : ['outside', 'walk-1', 'walk-2', 'walk-3', 'choose', 'lit', 'went-out-smoke', 'went-out'];
  report.coverage = sizes.flatMap(size => selected.map(place => {
    const captured = new Set(report.views.filter(view => view.viewport === size.name && view.place === place).map(view => view.phase));
    return { viewport: size.name, place, missing: process.env.COVER_ONLY ? [] : required.filter(phase => !captured.has(phase)) };
  }));
  report.finishedAt = new Date().toISOString();
  await writeFile(`${root}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
