// Snow Roof visual review only. No test suite, no product test hooks and no other-place captures.
// BASE_URL=http://localhost:5173 API_URL=http://localhost:8792 PILOT_ROUND=pilot-1 node tests/visual/blender-pilot-capture.mjs
// Run only when the Blender pilot has been integrated. Default scene speed is real time so the burning sample is meaningful.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';

const base = process.env.BASE_URL || 'http://localhost:5173';
const api = process.env.API_URL;
const tag = process.env.PILOT_ROUND || 'pilot-1';
const root = `artifacts/blender-pilot/${tag}`;
const reference = JSON.parse(await readFile('docs/evidence/blender-pilot/reference-cameras.json', 'utf8'));
const sizes = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }].filter(size => !process.env.VIEWPORT || process.env.VIEWPORT === size.name);
const core = ['outside', 'walk-1', 'walk-2', 'walk-3', 'choose', 'lit'];
const report = { tag, base, referenceCommit: reference.referenceCommit, capturedAt: new Date().toISOString(), views: [], errors: [], consoleErrors: [], resources: [], burningSamples: [], notes: [
  'Snow Roof pilot only. The existing cover may load during app startup, but it is neither captured nor changed by this runner.',
  'The six desktop references are the exact user-selected round1 PNGs. Their old walk poses were reconstructed approximately from image landmarks; see reference-cameras.json.',
  'New walk captures wait on actual engine progress, then record rendered camera matrices and before/after progress around the clean screenshot. They never infer progress from wall time.',
  'Actual camera pose differences from the source/estimated reference poses are reported. A successful capture alone is not proof of matched framing or photographic realism.',
  'Real-time scene clock; burning WebGL-draw intervals are sampled for 8 seconds. Phone means viewport/touch emulation on the desktop GPU, not physical phone performance.',
  'The actual UI lights once and puts out once. Optional natural-ending images are explicitly labelled renderer artwork after settlement, not a natural-completion or endurance check.',
] };
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const alignment = (actual, expected) => {
  if (!actual || !expected) return null;
  const camera = new THREE.PerspectiveCamera(actual.fov, actual.aspect, .01, 900);
  camera.position.fromArray(expected.position); camera.lookAt(new THREE.Vector3(...expected.target)); camera.updateMatrixWorld(true);
  const quaternion = new THREE.Quaternion(...actual.quaternion);
  return { positionDeltaMetres: camera.position.distanceTo(new THREE.Vector3(...actual.position)), rotationDeltaDegrees: THREE.MathUtils.radToDeg(camera.quaternion.angleTo(quaternion)) };
};
try {
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, locale: 'en-US', hasTouch: size.name === 'phone', isMobile: size.name === 'phone', reducedMotion: 'no-preference' });
    if (api) await context.route('**/api/**', async route => {
      try { const url = new URL(route.request().url()); const response = await route.fetch({ url: new URL(url.pathname + url.search, api).href }); await route.fulfill({ response }); }
      catch (error) { if (/disposed|Target.*closed|Browser.*closed/i.test(error.message)) return; throw error; }
    });
    await context.addInitScript(() => {
      Date.prototype.getHours = () => 22; Date.prototype.getMinutes = () => 0; Date.prototype.getSeconds = () => 0;
      window.__pilotCapture = { phase: 'load', frames: [], camera: null };
      let rendererValue, draws = 0, previousDraws = 0, lastDrawTime = 0;
      Object.defineProperty(window, '__renderer', { configurable: true, get: () => rendererValue, set: renderer => {
        rendererValue = renderer; const original = renderer.render.bind(renderer);
        renderer.render = (scene, camera) => {
          const rendered = original(scene, camera);
          if (scene.isScene && camera.isPerspectiveCamera && camera.fov < 60) window.__pilotCapture.camera = {
            position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), matrixWorld: camera.matrixWorld.toArray(),
            projectionMatrix: camera.projectionMatrix.toArray(), fov: camera.fov, aspect: camera.aspect, at: performance.now(),
          };
          return rendered;
        };
      } });
      for (const key of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const original = WebGL2RenderingContext.prototype[key];
        WebGL2RenderingContext.prototype[key] = function (...args) { draws++; return original.apply(this, args); };
      }
      const sample = time => {
        if (draws !== previousDraws) {
          if (lastDrawTime) window.__pilotCapture.frames.push({ phase: window.__pilotCapture.phase, ms: time - lastDrawTime });
          previousDraws = draws; lastDrawTime = time;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    const page = await context.newPage(); page.setDefaultTimeout(120000);
    page.on('pageerror', error => report.errors.push({ viewport: size.name, error: error.message, stack: error.stack }));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({ viewport: size.name, error: message.text() }); });
    const out = `${root}/${size.name}`; await mkdir(out, { recursive: true });
    const act = locator => size.name === 'phone' ? locator.tap() : locator.click();
    const button = name => page.getByRole('button', { name });
    const phase = name => page.evaluate(value => { window.__pilotCapture.phase = value; }, name);
    const shot = async (name, cleanOnly = false) => {
      const before = await page.evaluate(() => ({ camera: window.__pilotCapture.camera, walk: window.__walkProgress ?? null }));
      await page.locator('.ui').evaluate(element => { element.style.visibility = 'hidden'; });
      try { await page.screenshot({ path: `${out}/${name}.png` }); }
      finally { await page.locator('.ui').evaluate(element => { element.style.visibility = ''; }); }
      const after = await page.evaluate(() => ({ camera: window.__pilotCapture.camera, walk: window.__walkProgress ?? null }));
      if (!cleanOnly) await page.screenshot({ path: `${out}/${name}-ui.png` });
      const expected = size.name === 'desktop' ? reference.desktop[name] : reference.phone[name];
      const overflow = await page.evaluate(() => [...document.querySelectorAll('.ui button,.ui textarea,.ui h1,.ui h2')].filter(element => {
        const rect = element.getBoundingClientRect(); return rect.width > 0 && (rect.left < -2 || rect.right > innerWidth + 2);
      }).map(element => element.textContent?.trim().slice(0, 80)));
      const gl = await page.locator('#gl').evaluate(canvas => { const gl = canvas.getContext('webgl2'); return { error: gl.getError(), lost: gl.isContextLost(), width: canvas.width, height: canvas.height }; });
      report.views.push({ viewport: size.name, name, before, after, expected: expected ?? null, alignmentBefore: alignment(before.camera, expected), alignmentAfter: alignment(after.camera, expected), overflow, gl });
      console.log(size.name, name); await writeFile(`${root}/report.json`, JSON.stringify(report, null, 2));
    };
    try {
      await page.goto(base); await page.getByLabel('Your wish').waitFor(); await page.waitForFunction(() => window.__ready === true);
      await page.getByLabel('Your wish').fill('A quiet light in the snow.'); await act(button('Set my wish'));
      const beforeResources = await page.evaluate(() => performance.getEntriesByType('resource').length);
      await act(page.locator('.places [role=radio]').nth(5)); await page.waitForTimeout(2400);
      await page.waitForFunction(() => Number(getComputedStyle(document.getElementById('fade')).opacity) < .01);
      await phase('outside'); await shot('outside');
      const hasProgress = await page.evaluate(() => window.__visualWalkAvailable === true);
      if (!hasProgress) throw new Error('Snow pilot capture requires actual development walk progress.');
      await act(button('Leave it here'));
      for (const name of ['walk-1', 'walk-2', 'walk-3']) {
        const progress = reference.desktop[name].progress;
        await page.waitForFunction(({ progress }) => {
          const walk = window.__walkProgress;
          return walk?.id === 'snow-roof' && (walk.progress >= progress || walk.state === 'done');
        }, { progress });
        await phase(name); await shot(name);
      }
      await page.getByRole('tab', { name: 'Ready-made', exact: true }).waitFor(); await page.waitForTimeout(450);
      await phase('choose'); await shot('choose');
      await act(button(/Take this one/)); await button(/Light it/).waitFor(); await act(button(/Light it/)); await page.getByTestId('with-you').waitFor(); await page.waitForTimeout(1800);
      await phase('burning'); await page.waitForTimeout(8000);
      const frames = await page.evaluate(() => window.__pilotCapture.frames.filter(frame => frame.phase === 'burning').map(frame => frame.ms));
      await phase('lit'); await shot('lit');
      const sorted = [...frames].sort((a, b) => a - b);
      report.burningSamples.push({ viewport: size.name, samples: sorted.length, p50ms: sorted[Math.floor(sorted.length * .5)] ?? null, p95ms: sorted[Math.floor(sorted.length * .95)] ?? null, maxMs: sorted.length ? Math.max(...sorted) : null });
      report.resources.push({ viewport: size.name, sincePlaceSelection: await page.evaluate(index => performance.getEntriesByType('resource').slice(index).map(resource => ({ url: resource.name, encodedBodySize: resource.encodedBodySize, transferSize: resource.transferSize, duration: resource.duration })), beforeResources) });
      await act(button('Put out')); await act(button('Put out and end')); await page.getByTestId('result-title').waitFor(); await page.waitForTimeout(160);
      await phase('went-out'); await shot('went-out-smoke'); await page.waitForTimeout(1700); await shot('went-out');
      if (process.env.ENDING_ARTWORK) {
        await page.evaluate(async () => { const engine = await import('/src/engine/index.ts'); engine.setLevel(.004); await engine.ignite(); });
        await phase('ending-artwork'); await shot('last-light-artwork', true);
        await page.evaluate(async () => { const engine = await import('/src/engine/index.ts'); engine.setLevel(0); void engine.snuff(true); });
        await page.waitForTimeout(160); await shot('burned-down-ember-artwork', true); await page.waitForTimeout(1700); await shot('burned-down-wisp-artwork', true);
      }
    } catch (error) {
      await page.screenshot({ path: `${out}/capture-failure.png` }).catch(() => {});
      report.errors.push({ viewport: size.name, fatal: error.stack || String(error) }); console.error(size.name, error.message);
    } finally { await context.close(); }
  }
  // Make standalone source comparisons without requiring image-processing packages.
  for (const size of sizes) {
    const rows = [];
    for (const name of core) {
      const oldPath = size.name === 'desktop' ? `docs/evidence/blender-pilot/reference-desktop/${name}.png` : `artifacts/realism/round1/phone/snow-roof/${name}.png`;
      const newPath = `${root}/${size.name}/${name}.png`;
      try {
        const [oldImage, newImage] = await Promise.all([readFile(oldPath), readFile(newPath)]);
        rows.push(`<section><h2>${name}</h2><div><figure><figcaption>Round 1 reference</figcaption><img src="data:image/png;base64,${oldImage.toString('base64')}"></figure><figure><figcaption>Blender pilot</figcaption><img src="data:image/png;base64,${newImage.toString('base64')}"></figure></div></section>`);
      } catch { /* Missing phases stay explicit in the report and do not produce a misleading comparison. */ }
    }
    const width = size.name === 'desktop' ? 1440 : 780;
    const html = `<!doctype html><meta charset="utf-8"><title>Snow Roof pilot comparison</title><style>*{box-sizing:border-box}body{margin:0;background:#101513;color:#eee5d3;font:16px/1.5 system-ui}h1,p{margin:16px}h2{font-size:17px;margin:0;padding:8px}section>div{display:grid;grid-template-columns:1fr 1fr}figure{margin:0}figcaption{padding:4px 8px;color:#c4bbab;font-size:13px}img{display:block;width:100%;height:auto}</style><h1>Snow Roof Court — ${size.name}</h1><p>Source and image-fit camera provenance is recorded in reference-cameras.json. Old walk metadata is approximate; read actual new camera deltas in report.json.</p>${rows.join('')}`;
    const htmlPath = `${root}/${size.name}-comparison.html`; await writeFile(htmlPath, html);
    const comparison = await browser.newPage({ viewport: { width, height: 900 } });
    try { await comparison.goto(pathToFileURL(resolve(htmlPath)).href); await comparison.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode()))); await comparison.screenshot({ path: `${root}/${size.name}-comparison.png`, fullPage: true }); }
    finally { await comparison.close(); }
  }
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(`${root}/report.json`, JSON.stringify(report, null, 2)); await browser.close();
}
