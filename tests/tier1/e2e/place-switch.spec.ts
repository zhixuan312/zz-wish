import { expect, test } from '@playwright/test';

const re = (zh: string, en: string) => new RegExp(`${zh}|${en}`);

// A visitor may change their mind while the court is still being prepared, and walk into either court
// afterwards. This states that requirement without depending on any engine internal: whichever build
// the engine started first, both courts must become usable and the court that is finally chosen must
// render a real scene.
test('both courts stay usable when the visitor changes mind', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));

    // Pin the clock to 13:00 so the brightness check below reads daylight, not midnight.
    await page.clock.setFixedTime(new Date('2026-06-21T13:00:00'));
    await page.goto('/');
    await page.waitForFunction(() => (window as Window & { __ready?: boolean }).__ready === true, null, { timeout: 60_000 });
    await page.getByLabel(re('你的愿望', 'Your wish')).fill('A court I can change my mind about.');
    await page.getByRole('button', { name: re('许好了', 'Set my wish') }).click();

    const pine = page.getByRole('radio', { name: re('松门石阶', 'Pine Gate Steps') });
    const snow = page.getByRole('radio', { name: re('雪瓦北院', 'Snow Roof Court') });
    const step = page.getByRole('button', { name: re('走进院里', 'Step inside') });

    // Switch immediately after the wish, while the default court is still being prepared. This is the
    // sequence the warm window existed for, and the one a quick visitor produces.
    await pine.click();
    await expect(step).toBeEnabled({ timeout: 5_000 });
    await snow.click();
    await expect(step).toBeEnabled({ timeout: 5_000 });

    // Neither court may report a failed load, and the page must not throw.
    await expect(page.getByRole('button', { name: re('重试', 'Retry') })).toHaveCount(0);
    expect(pageErrors, 'the page must not report an uncaught error').toEqual([]);

    // The court on screen must be a real scene, not an empty or black one.
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
    expect(brightness!, `the court must not be black or empty (measured ${brightness?.toFixed(3)})`)
      .toBeGreaterThan(.15);
  });
