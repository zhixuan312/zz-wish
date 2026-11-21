// Run under the S7 GPU lease. Checks the same app while changing the selected scene.
/* global document, window */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { startPreview } from './preview.mjs';

const root = process.env.TIDE_EVIDENCE_DIR;
if (!root) throw new Error('Set TIDE_EVIDENCE_DIR to the external S7 artifacts directory.');
const output = resolve(root);
await mkdir(output, { recursive: true });
const app = await startPreview({ includeDriftControl: true });
const report = { checks: {}, problems: [] };
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'en-US', deviceScaleFactor: 1 });
  page.setDefaultTimeout(60_000);
  page.on('pageerror', error => report.problems.push(String(error)));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().startsWith(app.url)) {
      report.problems.push(response.status() + ' ' + response.url().slice(app.url.length));
    }
  });
  await page.goto(app.url);
  await page.getByLabel('Your wish', { exact: true }).fill('For a safe crossing home.');
  await page.getByRole('button', { name: 'Set my wish', exact: true }).click();
  async function sample(placeId) {
    await page.waitForFunction(id => {
      const reading = window.__tideDriftProbe?.();
      const step = document.querySelector('.ui[data-screen="place"] .place-actions .primary');
      return reading?.id === id && reading.amp >= 1 && step?.textContent?.trim() === 'Step inside' && !step.disabled;
    }, placeId);
    return page.evaluate(async () => {
      const values = [];
      for (let i = 0; i < 10; i++) {
        const reading = window.__tideDriftProbe();
        values.push({ ...reading, offset: reading.y - reading.rigY });
        await new Promise(resolve => window.setTimeout(resolve, 160));
      }
      return values;
    });
  }
  report.checks.tideFirst = await sample('sea-tide');
  await page.getByRole('radio', { name: /^Bamboo Rain Cloister/ }).click();
  report.checks.bamboo = await sample('bamboo-rain');
  await page.getByRole('radio', { name: /^Tide Temple/ }).click();
  report.checks.tideReturn = await sample('sea-tide');
  const isFlat = values => values.every(({ offset }) => Math.abs(offset) < 1e-6);
  assert.ok(isFlat(report.checks.tideFirst) && isFlat(report.checks.tideReturn), 'Tide vertical drift must be zero before and after switching.');
  const offsets = report.checks.bamboo.map(value => value.offset);
  assert.ok(Math.max(...offsets) - Math.min(...offsets) > .0001, 'Bamboo retains its varying default vertical drift.');
  assert.deepEqual(report.problems, []);
} catch (error) {
  report.problems.push(error.stack ?? String(error));
  process.exitCode = 1;
} finally {
  try {
    await browser?.close();
  } finally {
    await app.close();
    await writeFile(join(output, 'drift-switch.json'), JSON.stringify(report, null, 2) + '\n');
  }
}
