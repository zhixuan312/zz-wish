import { expect, test, type Page } from '@playwright/test';

// The music module is exercised through the real UI: every cue request is recorded
// from the network so the test asserts which file the game asked for, and when.
const re = (zh: string, en: string) => new RegExp(`${zh}|${en}`);

type CueLog = { cue: string; at: number }[];

function recordCues(page: Page): CueLog {
  const log: CueLog = [];
  page.on('request', (request) => {
    const match = /\/music\/([a-z0-9_]+)\.m4a$/.exec(new URL(request.url()).pathname);
    if (match) log.push({ cue: match[1], at: Date.now() });
  });
  return log;
}

// A real WAV of the given length: 8 kHz, mono, 8-bit silence. The element must report
// a real duration, because the hand-over under test happens when the cue ends.
function silentWav(seconds: number): Buffer {
  const rate = 8000, samples = Math.round(rate * seconds);
  const data = Buffer.alloc(samples, 128);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + samples, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write('data', 36);
  header.writeUInt32LE(samples, 40);
  return Buffer.concat([header, data]);
}

// Authored lengths, so the walk cue really outlives the arrival at the candle screen.
function secondsFor(cue: string): number {
  if (cue.endsWith('_walk')) return 36;
  if (cue.endsWith('_ignite')) return 20;
  if (cue.startsWith('ending_')) return 12;
  return 30;
}

async function serveMusic(page: Page, cues: string[], broken: string[] = []) {
  await page.route('**/music/manifest.json', (route) => route.fulfill({ json: { cues } }));
  // One route per cue name: a wildcard on audio requests leaves Playwright's handler
  // pending while the element aborts and retries, which stalls the whole page.
  for (const cue of cues) {
    if (broken.includes(cue)) {
      await page.route(`**/music/${cue}.m4a`, (route) => route.fulfill({ status: 404, body: '' }));
      continue;
    }
    await page.route(`**/music/${cue}.m4a`, (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav(secondsFor(cue)) }));
  }
}

async function reachPlace(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => (window as Window & { __ready?: boolean }).__ready === true, null, { timeout: 60_000 });
  await page.getByLabel(re('你的愿望', 'Your wish')).fill('A walk with music.');
  await page.getByRole('button', { name: re('许好了', 'Set my wish') }).click();
  await page.getByRole('button', { name: re('走进院里', 'Step inside') }).waitFor({ state: 'visible', timeout: 90_000 });
}

test('the walk cue is requested exactly once when the walk starts', async ({ page }) => {
  const cues = recordCues(page);
  await serveMusic(page, ['snow_walk', 'snow_choose_loop', 'snow_place_loop']);
  await reachPlace(page);
  for (let i = 0; i < 1200; i++) {
    if (await page.getByRole('button', { name: re('走进院里', 'Step inside') }).isEnabled().catch(() => false)) break;
    await page.waitForTimeout(50);
  }
  await page.getByRole('button', { name: re('走进院里', 'Step inside') }).click();
  await expect.poll(() => cues.some((c) => c.cue === 'snow_walk'), { timeout: 15_000 }).toBe(true);
  // One travel run creates one walk channel: the stage effect must not ask again.
  await page.waitForTimeout(2000);
  expect(cues.filter((c) => c.cue === 'snow_walk')).toHaveLength(1);
});

test('a natural walk keeps its cue until it ends, then hands over to choose', async ({ page }) => {
  const cues = recordCues(page);
  await serveMusic(page, ['snow_walk', 'snow_choose_loop', 'snow_place_loop']);
  await reachPlace(page);
  for (let i = 0; i < 1200; i++) {
    if (await page.getByRole('button', { name: re('走进院里', 'Step inside') }).isEnabled().catch(() => false)) break;
    await page.waitForTimeout(50);
  }
  await page.getByRole('button', { name: re('走进院里', 'Step inside') }).click();
  await expect.poll(() => cues.filter((c) => c.cue === 'snow_walk').length, { timeout: 15_000 }).toBe(1);
  // Wait until the game has reached the candle screen, which is the moment the old
  // bug cut the walk cue: the chooser panel is what proves arrival.
  await page.getByRole('tab', { name: re('现成的', 'Ready-made') }).waitFor({ timeout: 120_000 });
  // Still inside the 36-second cue, so choose must not have been asked for yet.
  expect(cues.filter((c) => c.cue === 'snow_choose_loop')).toHaveLength(0);
  // After the cue ends it hands over, exactly once.
  await expect.poll(() => cues.filter((c) => c.cue === 'snow_choose_loop').length, { timeout: 60_000 }).toBe(1);
  expect(cues.filter((c) => c.cue === 'snow_walk')).toHaveLength(1);
});

test('a manifest that never answers does not hold up the walk', async ({ page }) => {
  const cues = recordCues(page);
  // The cue list hangs forever: the request is accepted and never answered.
  await page.route('**/music/manifest.json', () => new Promise(() => {}));
  await reachPlace(page);
  for (let i = 0; i < 1200; i++) {
    if (await page.getByRole('button', { name: re('走进院里', 'Step inside') }).isEnabled().catch(() => false)) break;
    await page.waitForTimeout(50);
  }
  await page.getByRole('button', { name: re('走进院里', 'Step inside') }).click();
  // The game reaches the chooser with no cue list at all, and stays silent because
  // it never learned which cues exist.
  await page.getByRole('tab', { name: re('现成的', 'Ready-made') }).waitFor({ timeout: 60_000 });
  expect(cues).toHaveLength(0);
});

test('Skip cuts the walk cue short and starts choose', async ({ page }) => {
  const cues = recordCues(page);
  await serveMusic(page, ['snow_walk', 'snow_choose_loop', 'snow_place_loop']);
  await reachPlace(page);
  for (let i = 0; i < 1200; i++) {
    if (await page.getByRole('button', { name: re('走进院里', 'Step inside') }).isEnabled().catch(() => false)) break;
    await page.waitForTimeout(50);
  }
  await page.getByRole('button', { name: re('走进院里', 'Step inside') }).click();
  await page.getByRole('button', { name: re('跳过', 'Skip') }).click({ timeout: 30_000 });
  const walkAt = cues.find((c) => c.cue === 'snow_walk')?.at ?? 0;
  await expect.poll(() => cues.some((c) => c.cue === 'snow_choose_loop'), { timeout: 15_000 }).toBe(true);
  const chooseAt = cues.find((c) => c.cue === 'snow_choose_loop')!.at;
  // Skipping means choose is asked for far sooner than the 36-second cue would allow.
  expect(chooseAt - walkAt).toBeLessThan(15_000);
});

// The natural path with no walk cue: the walk answers "missing" while the player is
// still travelling, so the candle screen itself must start choose, exactly once.
test('a missing walk still starts choose once when the walk ends naturally', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const cues = recordCues(page);
  await serveMusic(page, ['snow_choose_loop', 'snow_place_loop']);
  await reachPlace(page);
  for (let i = 0; i < 1200; i++) {
    if (await page.getByRole('button', { name: re('走进院里', 'Step inside') }).isEnabled().catch(() => false)) break;
    await page.waitForTimeout(50);
  }
  await page.getByRole('button', { name: re('走进院里', 'Step inside') }).click();
  // No Skip: the walk runs its authored length and the chooser arrives by itself.
  await page.getByRole('tab', { name: re('现成的', 'Ready-made') }).waitFor({ timeout: 90_000 });
  await expect.poll(() => cues.some((c) => c.cue === 'snow_choose_loop'), { timeout: 15_000 }).toBe(true);
  expect(cues.some((c) => c.cue === 'snow_walk')).toBe(false);
  await page.waitForTimeout(2000);
  expect(cues.filter((c) => c.cue === 'snow_choose_loop')).toHaveLength(1);
  expect(errors).toEqual([]);
});

// A listed cue whose file 404s is the case a manifest check cannot catch: the element
// fires error instead of ended, and that must still hand over.
test('a listed walk that fails to load still starts choose', async ({ page }) => {
  const cues = recordCues(page);
  await serveMusic(page, ['snow_walk', 'snow_choose_loop', 'snow_place_loop'], ['snow_walk']);
  await reachPlace(page);
  for (let i = 0; i < 1200; i++) {
    if (await page.getByRole('button', { name: re('走进院里', 'Step inside') }).isEnabled().catch(() => false)) break;
    await page.waitForTimeout(50);
  }
  await page.getByRole('button', { name: re('走进院里', 'Step inside') }).click();
  await expect.poll(() => cues.filter((c) => c.cue === 'snow_walk').length, { timeout: 15_000 }).toBe(1);
  await expect.poll(() => cues.some((c) => c.cue === 'snow_choose_loop'), { timeout: 15_000 }).toBe(true);
});

test('a walk cue that is not shipped stays silent and choose still starts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const cues = recordCues(page);
  await serveMusic(page, ['snow_choose_loop']);
  await reachPlace(page);
  for (let i = 0; i < 1200; i++) {
    if (await page.getByRole('button', { name: re('走进院里', 'Step inside') }).isEnabled().catch(() => false)) break;
    await page.waitForTimeout(50);
  }
  await page.getByRole('button', { name: re('走进院里', 'Step inside') }).click();
  await page.getByRole('button', { name: re('跳过', 'Skip') }).click({ timeout: 30_000 });
  await expect.poll(() => cues.some((c) => c.cue === 'snow_choose_loop'), { timeout: 15_000 }).toBe(true);
  // No request for a cue the manifest omits, so nothing can 404.
  expect(cues.some((c) => c.cue === 'snow_walk')).toBe(false);
  // Skip and the missing-cue fallback must not both start choose.
  await page.waitForTimeout(2000);
  expect(cues.filter((c) => c.cue === 'snow_choose_loop')).toHaveLength(1);
  expect(errors).toEqual([]);
});
