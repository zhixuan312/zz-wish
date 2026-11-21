// Small browser smoke for both the production harness's callback serialization and its page-clock timing.
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { observeFirstVisible } from './first-visible.mjs';

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage();
  const origin = 'http://ignition-fixture.test';
  await page.route(origin + '/', route => route.fulfill({
    contentType: 'text/html',
    body: '<button>Light it</button><div data-testid="with-you" style="visibility:hidden">Burning</div>',
  }));
  let returnReadback;
  const releaseReadback = new Promise(resolve => { returnReadback = resolve; });
  await page.route(origin + '/api/me/candles', async route => {
    await releaseReadback;
    await route.fulfill({ json: { candles: [{ placeId: 'snow-roof', status: 'burning' }] } });
  });
  await page.goto(origin + '/');
  const light = page.getByRole('button', { name: 'Light it' });
  const hud = page.getByTestId('with-you');
  await light.evaluate(observeFirstVisible, '[data-testid="with-you"]');
  await light.click();
  const readback = page.evaluate(async () => {
    const response = await fetch('/api/me/candles');
    return { candles: (await response.json()).candles, at: performance.now() };
  });
  // Observe hidden HUD for a rendered frame, then reveal it while the API is still held.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await page.evaluate(() => window.__ignitionProbe.at), null);
  const revealedAt = await hud.evaluate(element => {
    element.style.visibility = 'visible';
    return performance.now();
  });
  await page.waitForFunction(() => window.__ignitionProbe.at !== null);
  const hudMark = await page.evaluate(() => window.__ignitionProbe);
  try {
    assert.ok(Number.isFinite(hudMark.clickAt) && hudMark.clickAt <= revealedAt);
    assert.ok(hudMark.at >= revealedAt);
    await delay(400);
  } finally {
    returnReadback();
  }
  const result = await readback;
  assert.deepEqual(result.candles, [{ placeId: 'snow-roof', status: 'burning' }]);
  assert.ok(result.at - hudMark.at >= 350);
  assert.deepEqual(await page.evaluate(() => window.__ignitionProbe), hudMark);
  console.log(JSON.stringify({ ...hudMark, revealedAt, readbackAt: result.at }));
} finally {
  await browser.close();
}
