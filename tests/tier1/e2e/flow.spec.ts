import { expect, test, type Page } from '@playwright/test';

const re = (zh: string, en: string) => new RegExp(`${zh}|${en}`);

async function chooseTenMinutes(page: Page, wish: string) {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 60_000 });
  await page.getByLabel(re('你的愿望', 'Your wish')).fill(wish);
  await page.getByRole('button', { name: re('许好了', 'Set my wish') }).click();
  await page.getByRole('button', { name: re('走进院里', 'Step inside') }).click();
  await page.getByRole('button', { name: re('跳过', 'Skip') }).click();
  await page.getByRole('radio', { name: re('^10 分钟$', '^10 min$') }).click({ timeout: 30_000 });
  await expect(page.getByTestId('duration')).toHaveText(re('10 分钟', '10 min'));
}

async function lightTenMinutes(page: Page, wish: string, waitForCatch = true) {
  await chooseTenMinutes(page, wish);
  await page.getByRole('button', { name: re('点亮这一盏', 'Light it') }).click({ timeout: 15_000 });
  if (waitForCatch) await expect(page.getByTestId('with-you')).toBeVisible();
}

async function openMyCandles(page: Page) {
  await page.mouse.move(20, 20);
  await page.getByRole('button', { name: re('^我的灯$', '^My Lamps$') }).click();
  return page.getByTestId('record').first();
}

test('an empty wish gives an inline explanation and focuses the field', async ({ page }) => {
  await page.goto('/');
  const next = page.getByRole('button', { name: re('许好了', 'Set my wish') });
  await expect(next).toBeEnabled(); await next.click();
  await expect(page.getByRole('alert')).toHaveText(re('先写一句愿望', 'Write a few words'));
  await expect(page.getByLabel(re('你的愿望', 'Your wish'))).toBeFocused();
});

test('court preparation starts while the wish is being written and shows progress', async ({ page }) => {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/places/snow-roof/manifest.json', async (route) => { await ready; await route.continue(); });
  await page.goto('/');
  await page.getByLabel(re('你的愿望', 'Your wish')).fill('A court that is ready when I am.');
  await expect(page.getByRole('progressbar', { name: re('院子准备进度', 'Court loading progress') })).toBeVisible();
  await page.getByRole('button', { name: re('许好了', 'Set my wish') }).click();
  await expect(page.getByRole('button', { name: re('院子准备中', 'Preparing court') })).toBeDisabled();
  release();
  await expect(page.getByRole('button', { name: re('走进院里', 'Step inside') })).toBeEnabled();
});

test('a refused light stays in the chooser with its error beside the direct action', async ({ page }) => {
  await page.route('**/api/candles', (route) => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'already_burning' }) }));
  await chooseTenMinutes(page, 'A refused light stays here.');
  await page.getByRole('button', { name: re('点亮这一盏', 'Light it') }).click();
  await expect(page.getByRole('alert')).toHaveText(re('别的页面还有一盏', 'another page'));
  await expect(page.locator('.ui')).toHaveAttribute('data-screen', 'candle');
  await expect(page.getByRole('button', { name: re('点亮这一盏', 'Light it') })).toBeEnabled();
});

test('a lit candle shows live presence, goes out when the page is hidden, and the record shows it went out', async ({ page }) => {
  await lightTenMinutes(page, 'e2e: hidden page');
  await expect(page.getByTestId('presence')).toHaveText(re('这里只有你的一盏光|你和另外', 'yours is the light here|You and'));
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('result-title')).toHaveText(re('就到这里', 'went out'));
  await expect(page.getByText(re('记录已保存', 'Saved'))).toBeVisible();
  const record = await openMyCandles(page);
  await expect(record.getByTestId('record-status')).toHaveText(re('已熄灭', 'Went out'));
  await record.getByRole('button', { name: re('查看这盏灯', 'See this lamp') }).click();
  await expect(record).toContainText(re('离开时熄灭', 'You stepped away'));
});

test('losing window focus puts the candle out', async ({ page }) => {
  await lightTenMinutes(page, 'e2e: blur');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByTestId('result-title')).toHaveText(re('就到这里', 'went out'));
});

test('a refresh while burning records that the page was left, not a lit candle', async ({ page }) => {
  await lightTenMinutes(page, 'e2e: refresh');
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 60_000 });
  await expect(page.getByTestId('with-you')).toHaveCount(0);
  const record = await openMyCandles(page);
  await expect(record).toContainText('e2e: refresh');
  await expect(record.getByTestId('record-status')).toHaveText(re('已熄灭', 'Went out'));
});


test('refresh before the lighting response preserves the leave event', async ({ page }) => {
  let committed!: () => void;
  const serverCommitted = new Promise<void>((resolve) => { committed = resolve; });
  await page.route('**/api/candles', async (route) => {
    const response = await route.fetch();
    committed();
    // Commit on the server, but keep the client from receiving the candle ID.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({ response }).catch(() => {});
  });
  await lightTenMinutes(page, 'e2e: pending lighting response', false);
  await serverCommitted;
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
  const record = await openMyCandles(page);
  await expect(record.getByTestId('record-status')).toHaveText(re('已熄灭', 'Went out'));
});

test('a phone drawing lands on the first stroke and leaves its tools reachable', async ({ page, viewport }) => {
  test.skip(viewport?.width !== 390, 'The drawing pad only changes size on the phone layout.');
  await chooseTenMinutes(page, 'e2e: phone drawing');
  await page.getByRole('tab', { name: re('自己画', 'Draw') }).click();
  // The pad, both stroke tools and the light action must all be inside the viewport,
  // and the pad must keep the 2:3 drawing area the stroke mapping assumes.
  const pad = page.locator('.pad');
  const box = (await pad.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(200);
  expect(Math.abs(box.height - box.width * 1.5)).toBeLessThanOrEqual(2);
  for (const name of [re('撤销', 'Undo'), re('重画', 'Redraw'), re('点亮这一盏', 'Light it')]) {
    const control = await page.getByRole('button', { name }).boundingBox();
    expect(control, `${String(name)} is reachable`).not.toBeNull();
    expect(control!.x).toBeGreaterThanOrEqual(0);
    expect(control!.y + control!.height).toBeLessThanOrEqual(viewport!.height);
  }
  // One real touch stroke: Undo becomes usable and the stroke changes the duration.
  await page.evaluate(({ x, y }) => {
    const pad = document.querySelector('.pad') as HTMLCanvasElement;
    const point = (type: string, px: number, py: number) => pad.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: px, clientY: py, bubbles: true, buttons: 1 }));
    point('pointerdown', x, y);
    for (let i = 1; i <= 12; i++) point('pointermove', x, y + i * 12);
    point('pointerup', x, y + 144);
  }, { x: box.x + box.width * 0.5, y: box.y + box.height * 0.25 });
  await expect(page.getByRole('button', { name: re('撤销', 'Undo') })).toBeEnabled();
});
