// Additional visual evidence. Run alone after the full place sweep; this is not a test suite.
// BASE_URL=http://localhost:5173 API_URL=http://localhost:8792 EVIDENCE=round2-details node tests/tier2/realism-details.mjs
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.BASE_URL || 'http://localhost:5173';
const api = process.env.API_URL;
const root = `artifacts/realism/${process.env.EVIDENCE || 'round2-details'}`;
const enginePath = '/src/engine/index.ts';
const places = [{ id: 'pine-gate', index: 0, kind: 'candle' }, { id: 'bamboo-rain', index: 1, kind: 'oil' }, { id: 'snow-roof', index: 5, kind: 'shade' }];
const sizes = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }];
const report = { views: [], drawings: [], errors: [], consoleErrors: [], notes: [
  'Actual UI actions choose the 10-minute and 24-hour presets, draw small and large shapes, light once and put out once.',
  'Phone drawing uses CDP touchStart/touchMove/touchEnd; desktop uses mouse input.',
  'Natural-ending images are artwork checks after the actual UI run has settled as put out. Only renderer commands are driven; no second product lighting and no natural-completion record is claimed.',
  'Natural-ending artwork uses a last low level, renderer ignition and snuff(true). It does not demonstrate real burn duration or endurance.',
  'Local hour is fixed at 22. Scene rAF timestamps run at 2x; product burn time stays real.',
] };
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  for (const size of sizes) for (const place of places) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, locale: 'en-US', isMobile: size.name === 'phone', hasTouch: size.name === 'phone' });
    if (api) await context.route('**/api/**', async route => {
      try { const url = new URL(route.request().url()); const response = await route.fetch({ url: new URL(url.pathname + url.search, api).href }); await route.fulfill({ response }); }
      catch (error) { if (/disposed|Target.*closed|Browser.*closed/i.test(error.message)) return; throw error; }
    });
    await context.addInitScript(() => {
      Date.prototype.getHours = () => 22; Date.prototype.getMinutes = () => 0;
      const nativeFrame = requestAnimationFrame.bind(window); let origin = null;
      window.requestAnimationFrame = callback => nativeFrame(stamp => { if (origin === null) origin = stamp; callback(origin + (stamp - origin) * 2); });
    });
    const page = await context.newPage(); page.setDefaultTimeout(120000);
    const identity = { viewport: size.name, place: place.id, kind: place.kind };
    page.on('pageerror', error => report.errors.push({ ...identity, error: error.message, stack: error.stack }));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({ ...identity, error: message.text() }); });
    const act = async locator => size.name === 'phone' ? locator.tap() : locator.click();
    const button = name => page.getByRole('button', { name });
    const out = `${root}/${size.name}/${place.id}`; await mkdir(out, { recursive: true });
    const shot = async (name, cleanOnly = false) => {
      if (!cleanOnly) await page.screenshot({ path: `${out}/${name}-ui.png` });
      await page.locator('.ui').evaluate(element => { element.style.visibility = 'hidden'; });
      try { await page.screenshot({ path: `${out}/${name}.png` }); }
      finally { await page.locator('.ui').evaluate(element => { element.style.visibility = ''; }); }
      const gl = await page.locator('#gl').evaluate(canvas => { const gl = canvas.getContext('webgl2'); return { error: gl.getError(), lost: gl.isContextLost() }; });
      report.views.push({ ...identity, name, cleanOnly, gl }); console.log(size.name, place.id, name);
      await writeFile(`${root}/report.json`, JSON.stringify(report, null, 2));
    };
    const draw = async (points) => {
      const rect = await page.locator('.pad').boundingBox();
      const positions = [];
      for (let i = 1; i < points.length; i++) for (let step = 0; step <= 16; step++) {
        const t = step / 16, a = points[i - 1], b = points[i]; positions.push({ x: rect.x + rect.width * (a[0] + (b[0] - a[0]) * t), y: rect.y + rect.height * (a[1] + (b[1] - a[1]) * t) });
      }
      if (size.name === 'phone') {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [positions[0]] });
        for (const position of positions.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [position] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
      } else {
        await page.mouse.move(positions[0].x, positions[0].y); await page.mouse.down();
        for (const position of positions.slice(1)) await page.mouse.move(position.x, position.y); await page.mouse.up();
      }
      await page.waitForTimeout(450);
      return await page.getByTestId('duration').textContent();
    };
    try {
      await page.goto(base); await page.getByLabel('Your wish').waitFor(); await page.waitForFunction(() => window.__ready === true);
      await page.getByLabel('Your wish').fill('A small light, a little time.'); await act(button('Set my wish'));
      await act(page.locator('.places [role=radio]').nth(place.index)); await page.waitForTimeout(2400);
      await page.waitForFunction(() => Number(getComputedStyle(document.getElementById('fade')).opacity) < .01);
      await act(button('Leave it here')); await page.getByRole('tab', { name: 'Ready-made', exact: true }).waitFor();
      await act(page.locator('.sizes [role=radio]').first()); await page.waitForTimeout(800); await shot('preset-10-minutes');
      await act(page.locator('.sizes [role=radio]').last()); await page.waitForTimeout(800); await shot('preset-24-hours');
      await act(page.getByRole('tab', { name: 'Draw', exact: true }));
      const small = await draw([[.42, .49], [.4, .73], [.59, .73], [.57, .49], [.42, .49]]); await shot('drawing-small');
      await act(button('Redraw'));
      const large = await draw([[.23, .12], [.16, .87], [.84, .87], [.77, .12], [.23, .12]]); await shot('drawing-large');
      const minutes = text => { const hours = Number(text?.match(/(\d+)\s*h/)?.[1] || 0); const mins = Number(text?.match(/(\d+)\s*min/)?.[1] || 0); return hours * 60 + mins; };
      report.drawings.push({ ...identity, small, large, largerDuration: minutes(large) > minutes(small), input: size.name === 'phone' ? 'CDP touch' : 'mouse' });
      await act(page.getByRole('tab', { name: 'Ready-made', exact: true })); await act(page.locator('.sizes [role=radio]').first());
      await act(button(/Take this one/)); await button(/Light it/).waitFor(); await act(button(/Light it/)); await page.getByTestId('with-you').waitFor(); await page.waitForTimeout(1400);
      await shot('lit'); await act(button('Put out')); await act(button('Put out and end')); await page.getByTestId('result-title').waitFor(); await page.waitForTimeout(180); await shot('went-out-smoke');
      // The actual product run is already settled. Drive only renderer artwork, with the UI hidden for these images.
      await page.evaluate(async path => { const engine = await import(path); engine.setLevel(.004); await engine.ignite(); }, enginePath);
      await shot('last-flame-artwork', true);
      await page.evaluate(async path => { const engine = await import(path); engine.setLevel(0); void engine.snuff(true); }, enginePath);
      await page.waitForTimeout(120); await shot('burned-down-ember-artwork', true);
      await page.waitForTimeout(700); await shot('burned-down-wisp-artwork', true);
    } catch (error) {
      await page.screenshot({ path: `${out}/capture-failure.png` }).catch(() => {});
      report.errors.push({ ...identity, fatal: error.stack || String(error) }); console.error(size.name, place.id, error.message);
    } finally { await context.close(); }
  }
} finally { await writeFile(`${root}/report.json`, JSON.stringify(report, null, 2)); await browser.close(); }
