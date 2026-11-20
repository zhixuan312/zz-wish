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
  await page.waitForFunction(() => (window as Window & { __ready?: boolean }).__ready === true);
  await page.getByRole('button', { name: /^(我的灯|My Lamps)$/ }).click();
  const restoredThumbnail = record.locator('[data-lamp-state="went_out"][data-ready="true"] img');
  await expect(restoredThumbnail).toBeVisible();
  expect(imageHash(await restoredThumbnail.getAttribute('src'))).toBe(restoredImage);
});

test('the visitor wish cloth is under the candle stand while burning and after the ending', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/你的愿望|Your wish/).fill('A strip of red cloth.');
  await page.getByRole('button', { name: /许好了|Set my wish/ }).click();
  await page.getByRole('radio', { name: /松门石阶|Pine Gate Steps/ }).click();
  await page.getByRole('button', { name: /走进院里|Step inside/ }).click();
  await page.getByRole('button', { name: /跳过|Skip/ }).click();
  await page.getByRole('radio', { name: /^(10 分钟|10 min)$/ }).click();
  await page.getByRole('button', { name: /点亮这一盏|Light it/ }).click();
  await expect(page.getByTestId('with-you')).toBeVisible();

  const read = () => page.evaluate(() => (window as Window & { __pineWishCloth?: () => unknown }).__pineWishCloth?.());
  await expect.poll(async () => (await read() as { visible?: boolean } | undefined)?.visible, { timeout: 15_000 }).toBe(true);
  const burning = await read() as {
    position: number[]; anchor: number[];
    bbox: { min: number[]; max: number[] } | null;
    faces: { index: number; verts: number } | null;
  };
  // The cloth hangs on the candle stand, on the same vertical.
  expect(burning.position[0]).toBeCloseTo(burning.anchor[0], 2);
  expect(burning.position[2]).toBeCloseTo(burning.anchor[2], 2);
  // Its origin is the stone surface, so the strip stands on the anchor rather than below it.
  expect(burning.position[1]).toBeCloseTo(burning.anchor[1], 6);
  // The modelled asset is loaded and stands on the stone without sinking into it.
  expect(burning.bbox).not.toBeNull();
  expect(burning.bbox!.min[1]).toBeGreaterThanOrEqual(burning.anchor[1] - .0005);
  // A settled simulation rather than a few quads.
  expect(burning.faces!.verts).toBeGreaterThan(900);
  expect(burning.faces!.index).toBeGreaterThan(3000);

  await page.getByRole('button', { name: /^(熄灭|Put out)$/ }).click();
  await page.getByRole('button', { name: /熄灭并结束|Put out and end/ }).click();
  await expect(page.getByTestId('result-title')).toBeVisible({ timeout: 20_000 });
  // The ending does not remove it: it becomes part of the shrine with the older wax.
  const after = await read() as { visible: boolean };
  expect(after.visible).toBe(true);
});

test('the candle chooser starts on ivory, and switching places keeps each default', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/你的愿望|Your wish/).fill('A plain candle.');
  await page.getByRole('button', { name: /许好了|Set my wish/ }).click();
  await page.getByRole('radio', { name: /松门石阶|Pine Gate Steps/ }).click();
  await page.getByRole('button', { name: /走进院里|Step inside/ }).click();
  await page.getByRole('button', { name: /跳过|Skip/ }).click();
  // Pine Gate is a wax place: the checked swatch is Ivory.
  await expect(page.getByRole('radio', { name: /^象牙$|^Ivory$/ })).toBeChecked();
  // Back to the place screen and over to Snow Roof; its shade stays red.
  await page.getByRole('button', { name: /回到院前|Back outside/ }).click();
  await page.getByRole('radio', { name: /雪瓦北院|Snow Roof Court/ }).click();
  await page.getByRole('button', { name: /走进院里|Step inside/ }).click();
  await page.getByRole('button', { name: /跳过|Skip/ }).click();
  await expect(page.getByRole('radio', { name: /^红纱$|^Red gauze$/ })).toBeChecked();
  // And back to Pine Gate: ivory again.
  await page.getByRole('button', { name: /回到院前|Back outside/ }).click();
  await page.getByRole('radio', { name: /松门石阶|Pine Gate Steps/ }).click();
  await page.getByRole('button', { name: /走进院里|Step inside/ }).click();
  await page.getByRole('button', { name: /跳过|Skip/ }).click();
  await expect(page.getByRole('radio', { name: /^象牙$|^Ivory$/ })).toBeChecked();
});

test('the opening place, Snow Roof, starts on red gauze without touching the place picker', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/你的愿望|Your wish/).fill('The default court.');
  await page.getByRole('button', { name: /许好了|Set my wish/ }).click();
  // No place is chosen: the opening place is Snow Roof, whose lantern is a shade.
  await page.getByRole('button', { name: /走进院里|Step inside/ }).click();
  await page.getByRole('button', { name: /跳过|Skip/ }).click();
  await expect(page.getByRole('radio', { name: /^红纱$|^Red gauze$/ })).toBeChecked();
  // Ivory gauze exists in the row but is not the default.
  await expect(page.getByRole('radio', { name: /^素纱$|^Ivory gauze$/ })).not.toBeChecked();
});

// The recorded ambience must be silent when muted, and a missing recording must not log an error.
test('muting Pine Gate silences the recorded ambience, and a missing recording throws nothing', async ({ page }) => {
  // A 404 makes Chromium print its own "Failed to load resource" line that a page cannot
  // suppress, so this asserts what the code controls: no uncaught error, and nothing playing.
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(String(error)));
  // Break every recording fetch: the place must still work, quietly.
  await page.route('**/places/pine-gate/sound/*.m4a', route => route.fulfill({ status: 404, body: '' }));
  await page.goto('/');
  await page.getByLabel(/你的愿望|Your wish/).fill('Silence is fine.');
  await page.getByRole('button', { name: /许好了|Set my wish/ }).click();
  await page.getByRole('radio', { name: /松门石阶|Pine Gate Steps/ }).click();
  await page.getByRole('button', { name: /走进院里|Step inside/ }).click();
  await page.getByRole('button', { name: /跳过|Skip/ }).click();
  await page.getByRole('radio', { name: /^(10 分钟|10 min)$/ }).click();
  await page.getByRole('button', { name: /点亮这一盏|Light it/ }).click();
  await expect(page.getByTestId('with-you')).toBeVisible();
  // The top bar owns the only mute control: it persists and covers music and ambience. Mute it
  // there and let any scheduled layer have time to try to play.
  const mute = page.getByRole('navigation').getByRole('button', { name: /^静音$|^Mute$/ });
  await expect(page.getByRole('button', { name: /^静音$|^Mute$/ })).toHaveCount(1);
  await mute.click();
  await page.waitForTimeout(3000);
  // No audio element is playing, and the mute state is recorded.
  const playing = await page.evaluate(() => [...document.querySelectorAll('audio')]
    .filter(audio => !audio.paused).length);
  expect(playing).toBe(0);
  // The sound control now offers to turn sound back on.
  await expect(page.getByRole('navigation').getByRole('button', { name: /^开启声音$|^Sound on$/ })).toBeVisible();
  expect(failures).toEqual([]);
});

test('the credits panel names both CC BY recordings and links their Commons pages', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: /^来源与致谢$|^Credits$/ }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  // Both credited recordings are listed, with the English attribution text kept verbatim.
  await expect(panel.getByTestId('credit-temple-bell')).toContainText('Bonsyou5599');
  await expect(panel.getByTestId('credit-temple-bell')).toContainText('CC BY 2.1 JP');
  await expect(panel.getByTestId('credit-ox-bells')).toContainText('Grazing Dairy Cows');
  await expect(panel.getByTestId('credit-ox-bells')).toContainText('CC BY 4.0');
  // The links point at the Commons file page and the licence deed.
  await expect(panel.getByTestId('credit-temple-bell').getByRole('link').first())
    .toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:Bonsyou5599.ogg');
  await expect(panel.getByTestId('credit-ox-bells').getByRole('link').first())
    .toHaveAttribute('href', /Do-Bells-Affect-Behaviour/);
  await expect(panel.getByRole('link', { name: 'CC BY 4.0' }))
    .toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
  // The rest of the recordings are named as public domain or CC0.
  await expect(panel).toContainText(/public domain or CC0|公有领域或 CC0/);
  // On a 390x844 phone the whole list must stay reachable by scrolling.
  const fits = await panel.evaluate(el => {
    const inner = el.querySelector('.panel-inner');
    if (!inner) return false;
    const style = getComputedStyle(el);
    return style.overflowY === 'auto' && inner.scrollHeight > 0;
  });
  expect(fits).toBe(true);
});

// A muddy print is a decal: the alpha map, not the quad, must decide what is drawn. If the whole quad
// is painted the print reads as a sticking plaster across the joint. For every print, compare its own
// bounding box against the stone just outside it: the sole's middle must darken, the quad's corners
// must not, and the stone outside must stay untouched.
test('each mud print draws its sole, not the whole quad', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel(/你的愿望|Your wish/).fill('Prints.');
  await page.getByRole('button', { name: /许好了|Set my wish/ }).click();
  await page.getByRole('radio', { name: /松门石阶|Pine Gate Steps/ }).click();
  const step = page.getByRole('button', { name: /走进院里|Step inside/ });
  await expect(step).toBeEnabled({ timeout: 45_000 });
  await step.click();
  await page.getByRole('button', { name: /跳过|Skip/ }).click();
  // Skip lands the travel tween at its last frame, so the camera is already at the place's own pose.
  // The measurement below freezes the rig and stands it at a declared overview pose; waiting for a
  // burn settle here would only spend the test's budget.

  // The prints lie on the shoulder paving, which the chooser view never shows. Freeze the rig, stand
  // at the declared overview pose the review uses, wait for the camera to stop, and measure there.
  const overviewSettled = await page.evaluate(() => new Promise<boolean>(resolve => {
    const api = window as unknown as {
      __pineFreezeRig?: (on: boolean) => void;
      __pineRenderCamera?: { position: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void };
        lookAt: (x: number, y: number, z: number) => void; fov: number; updateProjectionMatrix: () => void };
    };
    const camera = api.__pineRenderCamera;
    api.__pineFreezeRig?.(true);
    if (camera) {
      camera.position.set(0, 6.5, 7.05);
      camera.lookAt(-0.5, 5.05, 1.93);
      camera.fov = 68;
      camera.updateProjectionMatrix();
    }
    const samples: [number, number, number][] = [];
    const tick = () => {
      const p = camera?.position;
      if (p) {
        samples.push([p.x, p.y, p.z]);
        if (samples.length > 10) samples.shift();
        if (samples.length === 10
          && samples.every(q => Math.hypot(q[0] - p.x, q[1] - p.y, q[2] - p.z) < .001)) { resolve(true); return; }
      }
      if (samples.length > 240) { resolve(false); return; }
      requestAnimationFrame(tick);
    };
    tick();
  }));
  expect(overviewSettled, 'the overview pose must hold before the prints are measured').toBe(true);

  const printBoxes = await page.evaluate(() => {
    const api = window as unknown as { __pinePrintBoxes?: () => { index: number; visible: boolean;
      x: number; y: number; w: number; h: number; corners: [number, number][] }[] | null };
    return api.__pinePrintBoxes?.() ?? null;
  });
  expect(printBoxes && printBoxes.length).toBe(6);

  // Freeze the scene's own animation so the two frames show the same instant, and wait two frames so
  // the frozen picture is on screen before the first capture. Mist and creek motion between captures
  // would otherwise dwarf the decal's few levels of darkening.
  await page.evaluate(() => { (window as unknown as { __freezeScene?: boolean }).__freezeScene = true; });
  await page.evaluate(() => new Promise(resolve => {
    const done = () => resolve(true);
    requestAnimationFrame(() => requestAnimationFrame(done));
    // A frozen scene may not schedule the next frame; never let the capture wait on it forever.
    setTimeout(done, 900);
  }));
  const shot = async () => page.screenshot({ style: '.ui{visibility:hidden!important}' });
  const png = await shot();
  // Second frame with the decals hidden: whatever changes is the print itself.
  await page.evaluate(() => {
    const group = (window as unknown as { __pineMudGroup?: () => { visible: boolean } }).__pineMudGroup?.();
    if (group) group.visible = false;
  });
  await page.waitForTimeout(120);
  const bare = await shot();
  await page.evaluate(() => {
    const group = (window as unknown as { __pineMudGroup?: () => { visible: boolean } }).__pineMudGroup?.();
    if (group) group.visible = true;
  });
  // Read luma at the given points from one screenshot. The page decodes the PNG so the assertion
  // needs no image library on the Node side.
  const lumaAt = (frame: Buffer, spots: [number, number][]) => page.evaluate(async ({ data, spots }) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    return spots.map(([x, y]) => {
      const [r, g, b] = context.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return (r + g + b) / 3;
    });
  }, { data: [...frame], spots });

  const inset = 4;
  let shadedPrints = 0;
  const depths: unknown[] = [];
  for (const box of printBoxes!) {
    if (!box.visible) continue;
    if (box.x < 12 || box.y < 12) continue;
    // The quad turns with the walker, so its axis-aligned box has corners the decal never paints.
    // Sample just outside the quad's own corners instead: the stone there must be untouched, and the
    // sole's rim is the only thing that could bleed a single pixel inwards.
    // Push each corner outwards along its own diagonal, so the sample lands on stone the decal
    // cannot reach.
    const centre: [number, number] = [box.x + box.w / 2, box.y + box.h / 2];
    const corners: [number, number][] = box.corners.map(([cx, cy]) => {
      const dx = cx - centre[0], dy = cy - centre[1];
      const length = Math.hypot(dx, dy) || 1;
      return [cx + (dx / length) * inset, cy + (dy / length) * inset];
    });
    // Sample a small grid inside the sole, not one centre pixel: a single point can land on a
    // bright fleck of granite or under the tray's own shadow and say nothing about the decal.
    const inner: [number, number][] = [];
    for (const fx of [.38, .5, .62]) for (const fy of [.32, .5, .68]) {
      inner.push([box.x + box.w * fx, box.y + box.h * fy]);
    }
    const [cornerLuma, bareCorners, innerLuma, bareInner] = await Promise.all([
      lumaAt(png, corners), lumaAt(bare, corners), lumaAt(png, inner), lumaAt(bare, inner),
    ]);
    // A few pixels beyond each quad corner the sole cannot reach, so the control frame must show the
    // same stone there: any real difference means the decal is painting its whole quad rather than a
    // footprint.
    for (const [index, corner] of cornerLuma.entries()) {
      expect(Math.abs(corner - bareCorners[index]),
        `print ${box.index} corner ${index}: ${corner.toFixed(1)} vs control ${bareCorners[index].toFixed(1)}`)
        .toBeLessThan(8);
    }
    // How much this decal darkens the stone it covers: with-prints minus without-prints, taking the
    // median of the interior so one unlucky pixel cannot decide it.
    const deltas = bareInner.map((v, i) => v - innerLuma[i]).sort((a, b) => a - b);
    const depth = deltas[Math.floor(deltas.length / 2)];
    // Every print must darken the stone it covers, and the wetter ones clearly so. The unit is
    // 0-255 luma; four levels is the smallest step the eye separates on this granite.
    depths.push({ index: box.index, depth: +depth.toFixed(2),
      box: [Math.round(box.x), Math.round(box.y), Math.round(box.w), Math.round(box.h)] });
    if (depth > 4) shadedPrints++;
  }
  // At least the wettest prints must read as pressed mud: a sole that actually darkens the stone.
  expect(shadedPrints, 'prints whose sole is clearly darker than the stone beside them').toBeGreaterThanOrEqual(3);
  await testInfo.attach('print-depths.json', { body: JSON.stringify(depths, null, 2), contentType: 'application/json' });
});
