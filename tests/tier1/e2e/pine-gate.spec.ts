import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Candle } from '../../../web/src/api.ts';
import { remainingFuel, waxCutHeight } from '../../../shared/wax.ts';

const imageHash = (source: string | null) => source && createHash('sha256').update(source).digest('hex');

test('refresh ends the Pine Gate candle and restores the same wax in My Lamps', async ({ page }) => {
  const wish = 'Pine Gate wax survives a refresh.';
  await page.goto('/');
  await page.getByLabel(/你的愿望|Your wish/).fill(wish);
  await page.getByRole('button', { name: /许好了|Set my wish/ }).click();
  const pineGate = page.getByRole('radio', { name: /松门石阶|Pine Gate Steps/ });
  await pineGate.click();
  await expect(pineGate).toBeChecked();
  await page.getByRole('button', { name: /走进院里|Step inside/ }).click();
  await page.getByRole('button', { name: /跳过|Skip/ }).click();
  await page.getByRole('radio', { name: /^(10 分钟|10 min)$/ }).click();
  const lighting = page.waitForResponse(response =>
    response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/candles');
  await page.getByRole('button', { name: /点亮这一盏|Light it/ }).click();
  const candle: Candle = await (await lighting).json();
  expect(candle).toMatchObject({ placeId: 'pine-gate', shape: { kind: 'candle' }, status: 'burning' });
  await expect(page.getByTestId('with-you')).toBeVisible();

  await page.reload();
  await page.waitForFunction(() => (window as Window & { __ready?: boolean }).__ready === true);
  await expect(page.getByTestId('with-you')).toHaveCount(0);
  const records = await page.request.get('/api/me/candles');
  const restored: Candle = (await records.json()).candles[0];
  expect(restored).toMatchObject({ id: candle.id, shape: candle.shape, status: 'went_out', endReason: 'left' });
  expect(restored.burnedMs).toBeGreaterThan(0);
  const kept = waxCutHeight(restored.shape.rows, remainingFuel(restored.burnedMs, restored.durationMs));
  expect(kept).toBeGreaterThan(0);
  expect(kept).toBeLessThan(waxCutHeight(candle.shape.rows, 1));

  await page.getByRole('button', { name: /^(我的灯|My Lamps)$/ }).click();
  const record = page.getByTestId('record').filter({ hasText: wish });
  await expect(record.getByTestId('record-status')).toHaveText(/已熄灭|Went out/);
  await expect(record.locator('[data-lamp-state="went_out"][data-ready="true"] img')).toBeVisible();

  const restoredImage = imageHash(await record.locator('img').getAttribute('src'));
  expect(restoredImage).toBeTruthy();
  await page.reload();
  await page.getByRole('button', { name: /^(我的灯|My Lamps)$/ }).click();
  const restoredThumbnail = record.locator('[data-lamp-state="went_out"][data-ready="true"] img');
  await expect(restoredThumbnail).toBeVisible();
  expect(imageHash(await restoredThumbnail.getAttribute('src'))).toBe(restoredImage);
});
