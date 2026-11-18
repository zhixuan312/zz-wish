import { expect, test, type Page } from '@playwright/test';

const re = (zh: string, en: string) => new RegExp(`${zh}|${en}`);

// Local copy of the flow spec's chooser steps: that helper is not exported, and
// flow.spec.ts must stay identical to master.
async function chooseTenMinutes(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => (window as Window & { __ready?: boolean }).__ready === true, null, { timeout: 60_000 });
  await page.getByLabel(re('你的愿望', 'Your wish')).fill('A drawing that lands on the first stroke.');
  await page.getByRole('button', { name: re('许好了', 'Set my wish') }).click();
  await page.getByRole('button', { name: re('走进院里', 'Step inside') }).click();
  await page.getByRole('button', { name: re('跳过', 'Skip') }).click();
  await page.getByRole('radio', { name: re('^10 分钟$', '^10 min$') }).click({ timeout: 30_000 });
  await expect(page.getByTestId('duration')).toHaveText(re('10 分钟', '10 min'));
}

// The phone pad is a fixed 200x300 CSS px target: a full-width pad pushed Undo,
// Redraw and the light action out of the sheet, so the first stroke never landed.
test('the phone drawing pad and its tools stay reachable, and one touch stroke lands', async ({ page, viewport }) => {
  test.skip(viewport?.width !== 390, 'The pad only takes its fixed size in the phone layout.');
  await chooseTenMinutes(page);
  await page.getByRole('tab', { name: re('自己画', 'Draw') }).click();

  const pad = page.locator('.pad');
  const box = (await pad.boundingBox())!;
  // Exactly the authored target, so a regression back to a full-width pad fails.
  expect(box.width).toBeGreaterThanOrEqual(199);
  expect(box.width).toBeLessThanOrEqual(201);
  expect(Math.abs(box.height - box.width * 1.5)).toBeLessThanOrEqual(2);
  // The pad itself and every control the stroke needs must be fully on screen.
  for (const [label, region] of [
    ['pad', box],
    ['undo', (await page.getByRole('button', { name: re('撤销', 'Undo') }).boundingBox())!],
    ['redraw', (await page.getByRole('button', { name: re('重画', 'Redraw') }).boundingBox())!],
    ['light', (await page.getByRole('button', { name: re('点亮这一盏', 'Light it') }).boundingBox())!],
  ] as const) {
    expect(region, `${label} exists`).not.toBeNull();
    expect(region.x, `${label} left edge`).toBeGreaterThanOrEqual(0);
    expect(region.y, `${label} top edge`).toBeGreaterThanOrEqual(0);
    expect(region.x + region.width, `${label} right edge`).toBeLessThanOrEqual(viewport!.width);
    expect(region.y + region.height, `${label} bottom edge`).toBeLessThanOrEqual(viewport!.height);
  }

  // A real native touch sequence through CDP, so hit-testing is exercised: if a
  // panel covers the pad the stroke is lost and Undo stays disabled.
  const before = await page.getByTestId('duration').innerText();
  const cdp = await page.context().newCDPSession(page);
  const start = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.22 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  for (let i = 1; i <= 16; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x, y: start.y + i * (box.height * 0.04) }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();

  await expect(page.getByRole('button', { name: re('撤销', 'Undo') })).toBeEnabled();
  // The stroke changes the drawing, so its length-derived duration must change too.
  await expect(page.getByTestId('duration')).not.toHaveText(before);
});
