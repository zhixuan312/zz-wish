import { expect, test, type Page } from '@playwright/test';

const re = (zh: string, en: string) => new RegExp(`${zh}|${en}`);

async function lightTenMinutes(page: Page, wish: string) {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 60_000 });
  await page.getByLabel(re('你的愿望', 'Your wish')).fill(wish);
  await page.getByRole('button', { name: re('许好了', 'Set my wish') }).click();
  await page.getByRole('button', { name: re('就放在这里', 'Leave it here') }).click();
  await page.getByRole('button', { name: re('跳过', 'Skip') }).click();
  await page.getByRole('radio', { name: re('^10 分钟$', '^10 min$') }).click({ timeout: 30_000 });
  await expect(page.getByTestId('duration')).toHaveText(re('10 分钟', '10 min'));
  await page.getByRole('button', { name: re('带上这支', 'Take this one') }).click();
  await page.getByRole('button', { name: re('点亮这支', 'Light it') }).click({ timeout: 15_000 });
  await expect(page.getByTestId('with-you')).toBeVisible();
}

async function openMyCandles(page: Page) {
  await page.getByRole('button', { name: re('^我的烛$', '^My Candles$') }).click();
  return page.getByTestId('record').first();
}

test('a lit candle shows live presence, goes out when the page is hidden, and the record shows it went out', async ({ page }) => {
  await lightTenMinutes(page, 'e2e: hidden page');
  await expect(page.getByTestId('presence')).toHaveText(re('这里只有你的一盏光|你和另外', 'yours is the light here|You and'));
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('result-title')).toHaveText(re('到这里了', 'stops here'));
  await expect(page.getByText(re('记录已保存', 'Saved'))).toBeVisible();
  const record = await openMyCandles(page);
  await expect(record.getByTestId('record-status')).toHaveText(re('已熄灭', 'Went out'));
  await expect(record).toContainText(re('因离开这一页结束', 'page was left'));
});

test('losing window focus puts the candle out', async ({ page }) => {
  await lightTenMinutes(page, 'e2e: blur');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByTestId('result-title')).toHaveText(re('到这里了', 'stops here'));
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
  await page.route('**/api/candles', async (route) => {
    const response = await route.fetch();
    // Commit on the server, but keep the client from receiving the candle ID.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({ response }).catch(() => {});
  });
  await lightTenMinutes(page, 'e2e: pending lighting response');
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
  const record = await openMyCandles(page);
  await expect(record.getByTestId('record-status')).toHaveText(re('已熄灭', 'Went out'));
});
