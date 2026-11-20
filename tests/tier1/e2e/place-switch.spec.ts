import { expect, test } from '@playwright/test';

const re = (zh: string, en: string) => new RegExp(`${zh}|${en}`);

// Choosing a place before the speculative build of the default one has finished must abandon that
// build rather than run two of them against the same GPU. This covers the switch in both directions
// and requires that neither side reports an error.
test('switching place while the court prepares abandons the old build and both stay usable', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto('/');
  await page.waitForFunction(() => (window as Window & { __ready?: boolean }).__ready === true, null, { timeout: 60_000 });
  await page.getByLabel(re('你的愿望', 'Your wish')).fill('A court I can change my mind about.');
  await page.getByRole('button', { name: re('许好了', 'Set my wish') }).click();

  // Switch within half a second, while the default court is still being prepared.
  await expect(page.getByRole('radio', { name: re('松门石阶', 'Pine Gate Steps') })).toBeVisible();
  await page.waitForTimeout(500);
  await page.getByRole('radio', { name: re('松门石阶', 'Pine Gate Steps') }).click();

  await expect(page.getByRole('button', { name: re('走进院里', 'Step inside') })).toBeEnabled({ timeout: 5_000 });
  // No error card from the abandoned build.
  await expect(page.getByRole('button', { name: re('重试', 'Retry') })).toHaveCount(0);

  // And back again: the default court must still be buildable after its speculative build was dropped.
  await page.getByRole('radio', { name: re('雪瓦北院', 'Snow Roof Court') }).click();
  await expect(page.getByRole('button', { name: re('走进院里', 'Step inside') })).toBeEnabled({ timeout: 5_000 });
  await expect(page.getByRole('button', { name: re('重试', 'Retry') })).toHaveCount(0);

  expect(pageErrors, 'the page must not report an uncaught error').toEqual([]);
});
