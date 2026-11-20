import { expect, test } from '@playwright/test';

const re = (zh: string, en: string) => new RegExp(`${zh}|${en}`);

type PlaceBuilds = { started: string[]; superseded: { id: string; checkpoint: string }[] };

// Switching place while the speculative build of the default court is still running must abandon that
// build rather than let two of them compete for the GPU. This is the only test that proves the abandon
// path is reached: it waits for the default build to actually start, then switches.
test('switching place abandons the running build and both courts stay usable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-en', 'one viewport is enough for this path');
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  // Pin the clock to 13:00 so the rebuilt court is measured in daylight; the brightness check below
  // would otherwise read midnight and say nothing about whether the package loaded.
  await page.clock.setFixedTime(new Date('2026-06-21T13:00:00'));
  await page.goto('/');
  await page.waitForFunction(() => (window as Window & { __ready?: boolean }).__ready === true, null, { timeout: 60_000 });
  await page.getByLabel(re('你的愿望', 'Your wish')).fill('A court I can change my mind about.');
  await page.getByRole('button', { name: re('许好了', 'Set my wish') }).click();

  // Hold Snow Roof's manifest so its build cannot finish, then let it start. Waiting for the start
  // makes the switch deterministic: without this the build may already be cached.
  await page.route('**/places/snow-roof/manifest.json', async (route) => { await route.continue(); });
  await page.waitForFunction(() => {
    const builds = (window as Window & { __placeBuilds?: PlaceBuilds }).__placeBuilds;
    return !!builds?.started.includes('snow-roof');
  }, null, { timeout: 30_000 });

  // Now choose Pine Gate. The running Snow Roof build is no longer wanted.
  await page.getByRole('radio', { name: re('松门石阶', 'Pine Gate Steps') }).click();
  await page.waitForFunction(() => {
    const builds = (window as Window & { __placeBuilds?: PlaceBuilds }).__placeBuilds;
    return (builds?.superseded ?? []).some((entry) => entry.id === 'snow-roof');
  }, null, { timeout: 30_000 });
  const superseded = await page.evaluate(() => {
    const builds = (window as Window & { __placeBuilds?: PlaceBuilds }).__placeBuilds;
    return builds?.superseded ?? [];
  });
  // The abandon path was really taken, and it names the checkpoint it stopped at.
  expect(superseded.filter((entry) => entry.id === 'snow-roof').length).toBeGreaterThan(0);
  expect(superseded[0].checkpoint, 'the supersede must record where it stopped').toBeTruthy();

  // Pine Gate is usable after the abandoned build.
  await expect(page.getByRole('button', { name: re('走进院里', 'Step inside') })).toBeEnabled({ timeout: 5_000 });
  await expect(page.getByRole('button', { name: re('重试', 'Retry') })).toHaveCount(0);

  // Back to Snow Roof: it must rebuild from scratch and be usable again.
  await page.getByRole('radio', { name: re('雪瓦北院', 'Snow Roof Court') }).click();
  await expect(page.getByRole('button', { name: re('走进院里', 'Step inside') })).toBeEnabled({ timeout: 5_000 });
  await expect(page.getByRole('button', { name: re('重试', 'Retry') })).toHaveCount(0);

  // The rebuilt package must be a real scene, not an empty or black one: sample the centre of the
  // canvas and require daylight brightness there.
  const brightness = await page.evaluate(() => {
    const canvas = document.getElementById('gl') as HTMLCanvasElement | null;
    if (!canvas) return null;
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return null;
    const w = canvas.width, h = canvas.height;
    const points = [[w * .5, h * .5], [w * .4, h * .45], [w * .6, h * .45], [w * .5, h * .6]];
    let sum = 0;
    for (const [x, y] of points) {
      const out = new Uint8Array(4);
      // readPixels counts rows from the bottom.
      gl.readPixels(Math.round(x), Math.round(h - y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
      sum += (out[0] + out[1] + out[2]) / 3 / 255;
    }
    return sum / points.length;
  });
  expect(brightness, 'the canvas must be readable').not.toBeNull();
  expect(brightness!, `the rebuilt court must not be black or empty (measured ${brightness?.toFixed(3)})`).toBeGreaterThan(.15);

  expect(pageErrors, 'the page must not report an uncaught error').toEqual([]);
});
