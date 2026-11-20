import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// The chooser and the burning shot are composed as one: the flame must sit in the upper middle of the
// frame from the moment the visitor can pick a candle, and lighting may only close in slowly. These
// numbers come from the live camera, sampled once per rendered frame and judged as a rate per 100 ms.
const FLAME_MIN = .30;
const FLAME_MAX = .60;
const FLAME_STEP = .02;
// Desktop keeps its own frame: the choice panel sits on the right, not across the picture. On the
// phone the panel occupies the bottom of the screen, so its real top edge is the safe bottom; that
// edge comes from the page rather than from a number here, which would drift from the stylesheet.
const SAFE = { desktop: { left: .12, right: .88, top: .10, bottom: .90 },
  phone: { left: .10, right: .90, top: .10, bottom: .62 } };

// Each project is one viewport, so run only the case that matches it.
for (const [label, viewport, safe, project] of [
  ['desktop', { width: 1440, height: 900 }, SAFE.desktop, 'desktop-en'],
  ['phone', { width: 390, height: 844 }, SAFE.phone, 'phone-zh'],
] as const) {
  test(`the ${label} burning shot holds the flame and the tray from the chooser to the settle`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== project, `runs in the ${project} project`);
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByLabel(/你的愿望|Your wish/).fill('Burn framing.');
    await page.getByRole('button', { name: /许好了|Set my wish/ }).click();
    await page.getByRole('radio', { name: /松门石阶|Pine Gate Steps/ }).click();
    // Walk and skip wait for the place to be ready; both are bounded, and with the sampling window
    // the whole test stays inside the suite's default budget.
    const step = page.getByRole('button', { name: /走进院里|Step inside/ });
    await expect(step).toBeEnabled({ timeout: 45_000 });
    await step.click();
    await page.getByRole('button', { name: /跳过|Skip/ }).click();
    const chooser = page.getByRole('radio', { name: /^(10 min|10 分钟)$/ });
    await expect(chooser).toBeVisible({ timeout: 30_000 });
    // On the phone the panel is a bottom sheet, so its own top edge is the safe bottom: the tray has to
    // sit above it. Read that edge from the page rather than a number here, which would go stale the
    // moment the stylesheet moves. On a wide screen the panel is a side column and never crosses the
    // tray, so the desktop frame is unchanged.
    const panel = await page.evaluate(() => {
      const sheet = document.querySelector('.candle-sheet');
      if (!sheet) return null;
      const rect = sheet.getBoundingClientRect();
      return { top: rect.top / innerHeight, left: rect.left / innerWidth, height: rect.height / innerHeight };
    });
    expect(panel, 'the candle panel must be on screen when a candle is chosen').toBeTruthy();
    if (project === 'phone-zh') {
      // The sheet scrolls and its action row is pinned to the foot. Scrolled to the end, every colour
      // swatch has to clear that row and be reachable, not hidden behind it.
      await page.evaluate(() => {
        const inner = document.querySelector('.candle-sheet .inner') as HTMLElement | null;
        if (inner) inner.scrollTop = inner.scrollHeight;
      });
      await page.waitForTimeout(120);
      const layout = await page.evaluate(() => {
        const bar = document.querySelector('.candle-sheet .candle-actions')!.getBoundingClientRect();
        const swatches = [...document.querySelectorAll('.candle-sheet .swatch')].map(node => {
          const r = node.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        });
        return { bar: { left: bar.left, right: bar.right, top: bar.top, bottom: bar.bottom }, swatches };
      });
      expect(layout.swatches.length).toBeGreaterThan(0);
      for (const [index, swatch] of layout.swatches.entries()) {
        const overlaps = swatch.left < layout.bar.right && swatch.right > layout.bar.left
          && swatch.top < layout.bar.bottom && swatch.bottom > layout.bar.top;
        expect(overlaps, `colour swatch ${index} sits behind the action row`).toBe(false);
        expect(swatch.bottom, `colour swatch ${index} must be above the action row`)
          .toBeLessThanOrEqual(layout.bar.top + 1);
        expect(swatch.bottom, `colour swatch ${index} must be inside the viewport`)
          .toBeLessThanOrEqual(viewport.height);
      }
      // Reachable means clickable: Playwright refuses a click whose point another element covers.
      const swatches = page.locator('.candle-sheet .swatch');
      for (let index = 0; index < await swatches.count(); index++) {
        const swatch = swatches.nth(index);
        await expect(swatch).toBeVisible();
        const box = await swatch.boundingBox();
        expect(box, `colour swatch ${index} must have a box`).toBeTruthy();
        // Scroll it home, then confirm nothing is painted over its centre.
        await swatch.scrollIntoViewIfNeeded();
        const covered = await page.evaluate(({ x, y }) => {
          const hit = document.elementFromPoint(x, y);
          return hit ? !hit.closest('.swatch') : true;
        }, { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 });
        expect(covered, `colour swatch ${index} must be the topmost element at its centre`).toBe(false);
      }
    }
    const frame = project === 'phone-zh' ? { ...safe, bottom: panel!.top } : safe;
    if (project === 'phone-zh') {
      // A compact bottom sheet leaves the upper half of the picture to the lamp.
      expect(panel!.top, 'the phone choice panel must start at or below 60% of the viewport')
        .toBeGreaterThanOrEqual(.60);
    }
    // Sample once per rendered frame inside the page. Round-tripping from the test would space the
    // samples by whatever the driver costs that moment, and two samples a third of a second apart
    // cannot tell a jump from a slow push.
    await page.evaluate((SAFE_ARG) => {
      const api = window as unknown as {
        __pineBurnFraming?: () => { t: number;
          pose: { x: number; y: number; z: number; lx: number; ly: number; lz: number; fov: number };
          screen: (safe: object) => { flame: { top: number }; tray: { inside: boolean } } } | null;
        __burnFrames?: unknown[];
      };
      const frames: unknown[] = [];
      api.__burnFrames = frames;
      const tick = () => {
        const frame = api.__pineBurnFraming?.();
        if (frame) {
          const screen = frame.screen(SAFE_ARG);
          frames.push({ t: frame.t, flameTop: screen.flame.top, trayInside: screen.tray.inside, pose: frame.pose });
        }
        if (frames.length < 4000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, frame);

    await page.getByRole('button', { name: /点亮这一盏|Light it/ }).click();
    await page.waitForTimeout(13000);
    const samples = await page.evaluate(() => {
      const api = window as unknown as { __burnFrames?: { t: number; flameTop: number; trayInside: boolean;
        pose: { x: number; y: number; z: number; lx: number; ly: number; lz: number; fov: number } }[] };
      return api.__burnFrames ?? [];
    });
    await writeFile(testInfo.outputPath('burn-framing.json'), JSON.stringify(samples, null, 2));
    expect(samples.length).toBeGreaterThan(300);
    // The flame stays in the upper middle throughout, and never jumps between samples.
    for (const s of samples) {
      expect(s.flameTop, `flame top at t=${s.t.toFixed(2)}`).toBeGreaterThanOrEqual(FLAME_MIN);
      expect(s.flameTop, `flame top at t=${s.t.toFixed(2)}`).toBeLessThanOrEqual(FLAME_MAX);
    }
    // The limit is a rate: no more than FLAME_STEP per 100 ms. A pair that is closer together is
    // allowed proportionally less, and a pair further apart is still judged as one 100 ms step, so a
    // stalled frame cannot hide a jump the visitor would see.
    for (let i = 1; i < samples.length; i++) {
      const gap = Math.min(samples[i].t - samples[i - 1].t, .1);
      const allowed = FLAME_STEP * gap / .1;
      const jump = Math.abs(samples[i].flameTop - samples[i - 1].flameTop);
      // Choosing a candle swaps the placeholder for the visitor's own wax column, so its wick rises in
      // one frame while the camera holds exactly still. That is the choice, not a shot that moves; a
      // frame where the pose changed is still judged.
      const a = samples[i - 1].pose, b = samples[i].pose;
      const cameraHeld = a.x === b.x && a.y === b.y && a.z === b.z
        && a.lx === b.lx && a.ly === b.ly && a.lz === b.lz && a.fov === b.fov;
      if (cameraHeld) continue;
      expect(jump, `flame moved ${jump.toFixed(3)} in ${(samples[i].t - samples[i - 1].t).toFixed(3)}s at t=${samples[i].t.toFixed(2)}`)
        .toBeLessThanOrEqual(allowed);
    }
    // The tray is whole and clear of the sheet for every frame after the chooser.
    expect(samples.every(s => s.trayInside),
      `the tray must stay inside the safe area; panel top ${panel?.top.toFixed(3)}`).toBe(true);
  });
}
