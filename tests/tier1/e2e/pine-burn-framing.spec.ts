import { expect, test } from '@playwright/test';

// The chooser and the burning shot are composed as one: the flame must sit in the upper middle of the
// frame from the moment the visitor can pick a candle, and lighting may only close in slowly. These
// numbers come from the live camera, sampled at 100 ms, not from the authored keyframes.
const FLAME_MIN = .30;
const FLAME_MAX = .60;
const FLAME_STEP = .02;
const SAFE = { desktop: { left: .12, right: .88, top: .10, bottom: .90 },
  phone: { left: .10, right: .90, top: .10, bottom: .62 } };

for (const [label, viewport, safe] of [
  ['desktop', { width: 1440, height: 900 }, SAFE.desktop],
  ['phone', { width: 390, height: 844 }, SAFE.phone],
] as const) {
  test(`the ${label} burning shot holds the flame and the tray from the chooser to the settle`, async ({ page }, testInfo) => {
    testInfo.setTimeout(180_000);
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByLabel(/你的愿望|Your wish/).fill('Burn framing.');
    await page.getByRole('button', { name: /许好了|Set my wish/ }).click();
    await page.getByRole('radio', { name: /松门石阶|Pine Gate Steps/ }).click();
    const step = page.getByRole('button', { name: /走进院里|Step inside/ });
    for (let i = 0; i < 240; i++) { if (await step.isEnabled().catch(() => false)) break; await page.waitForTimeout(250); }
    await step.click();
    await page.getByRole('button', { name: /跳过|Skip/ }).click();
    const chooser = page.getByRole('radio', { name: /^(10 min|10 分钟)$/ });
    for (let i = 0; i < 80; i++) {
      if (await chooser.isVisible().catch(() => false)) break;
      await page.waitForTimeout(500);
    }
    await expect(chooser).toBeVisible();

    // Sample across the chooser, the ignition and ten seconds of burning, on wall time.
    const samples: { t: number; flameTop: number; trayInside: boolean }[] = [];
    const push = async () => {
      const f = await page.evaluate((safe) => {
        const api = window as unknown as {
          __pineBurnFraming?: () => { t: number; screen: (safe: object) => { flame: { top: number }; tray: { inside: boolean } } } | null;
        };
        const frame = api.__pineBurnFraming?.();
        if (!frame) return null;
        const screen = frame.screen(safe);
        return { t: frame.t, flameTop: screen.flame.top, trayInside: screen.tray.inside };
      }, safe as object);
      if (f) samples.push(f);
    };

    await push();
    await chooser.click();
    await page.getByRole('button', { name: /点亮这一盏|Light it/ }).click();
    const started = Date.now();
    while (Date.now() - started < 13000) {
      await page.waitForTimeout(100);
      await push();
    }
    await testInfo.attach('burn-framing.json',
      { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
    expect(samples.length).toBeGreaterThan(60);

    // The flame stays in the upper middle throughout, and never jumps between samples.
    for (const s of samples) {
      expect(s.flameTop, `flame top at t=${s.t.toFixed(2)}`).toBeGreaterThanOrEqual(FLAME_MIN);
      expect(s.flameTop, `flame top at t=${s.t.toFixed(2)}`).toBeLessThanOrEqual(FLAME_MAX);
    }
    for (let i = 1; i < samples.length; i++) {
      const jump = Math.abs(samples[i].flameTop - samples[i - 1].flameTop);
      expect(jump, `flame jump at t=${samples[i].t.toFixed(2)}`).toBeLessThanOrEqual(FLAME_STEP);
    }
    // The tray is whole and clear of the sheet for every frame after the chooser.
    expect(samples.every(s => s.trayInside), 'the tray must stay inside the safe area').toBe(true);
  });
}
