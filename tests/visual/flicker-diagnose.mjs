// Capture-only causal probe. Run alone; no test suite.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const root = `artifacts/snow-journey/${process.env.EVIDENCE || 'baseline-diagnosis'}`; await mkdir(root, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
await context.route('**/api/**', async route => { try { const u = new URL(route.request().url()); const response = await route.fetch({ url: 'http://localhost:8792' + u.pathname + u.search }); await route.fulfill({ response }); } catch (error) { if (!/disposed|closed/i.test(error.message)) throw error; } });
await context.addInitScript(() => { Date.prototype.getHours = () => 22; Date.prototype.getMinutes = () => 0; });
const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.stack));
try {
 await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5190'); await page.waitForFunction(() => window.__ready === true, { timeout: 120000 });
 await page.evaluate(() => Object.assign(window.__flickerLab, { lockCamera: true, freezeScene: true, hideParticles: true, pauseTweens: true })); await page.waitForTimeout(500);
 for (const [name, freezeGrade] of [['all_static_temporal_grade', false], ['all_static_fixed_grade', true]]) {
  await page.evaluate(value => { window.__flickerLab.freezeGrade = value; }, freezeGrade); await page.waitForTimeout(300);
  await page.evaluate(name => window.__flickerLab.begin({ name, seconds: 10 }), name);
  await page.waitForFunction(() => window.__flickerLab.result !== null, { timeout: 20000 });
  const result = await page.evaluate(() => window.__flickerLab.result); await writeFile(`${root}/${name}.json`, JSON.stringify(result));
  await page.screenshot({ path: `${root}/${name}.png` });
  const summary = result.rois.map(roi => { const values = result.samples.map(sample => sample.rois[roi.name]).filter(row => row.rmsDelta !== null); return { name: roi.name, type: roi.type, rmsMean: values.reduce((s, x) => s + x.rmsDelta, 0) / values.length, meanAbsoluteRoiMeanDelta: values.reduce((s, x) => s + Math.abs(x.signedMeanDelta), 0) / values.length, rmsMax: Math.max(...values.map(x => x.rmsDelta)), changedFraction: values.reduce((s, x) => s + x.changedPixelFraction, 0) / values.length }; });
  console.log(JSON.stringify({ name, samples: result.samples.length, cameraMaximumElementDelta: result.cameraMaximumElementDelta, summary }));
 }
 await writeFile(`${root}/errors.json`, JSON.stringify(errors));
} finally { await browser.close(); }
