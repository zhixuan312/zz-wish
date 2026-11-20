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
  await expect(page.getByTestId('presence')).toHaveText(re('正在这里许愿|你和另外', 'making a wish here now|You and'));
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
