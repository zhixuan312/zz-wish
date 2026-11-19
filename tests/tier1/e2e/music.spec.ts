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

// A tiny silent WAV is enough for the element to load and report a duration; the
// browser never needs real music for these cues to be requested.
const SILENT = Buffer.from(
  'UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=',
  'base64',
);

async function serveMusic(page: Page, cues: string[]) {
  await page.route('**/music/manifest.json', (route) => route.fulfill({ json: { cues } }));
  // One route per cue name: a wildcard on audio requests leaves Playwright's handler
  // pending while the element aborts and retries, which stalls the whole page.
  for (const cue of cues) {
    await page.route(`**/music/${cue}.m4a`, (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: SILENT }));
  }
}

async function reachPlace(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => (window as Window & { __ready?: boolean }).__ready === true, null, { timeout: 60_000 });
  await page.getByLabel(re('你的愿望', 'Your wish')).fill('A walk with music.');
  await page.getByRole('button', { name: re('许好了', 'Set my wish') }).click();
  await page.getByRole('button', { name: re('走进院里', 'Step inside') }).waitFor({ state: 'visible', timeout: 90_000 });
}

test('the walk cue is requested when the walk starts', async ({ page }) => {
  const cues = recordCues(page);
  await serveMusic(page, ['snow_walk', 'snow_choose_loop', 'snow_place_loop']);
  await reachPlace(page);
  for (let i = 0; i < 1200; i++) {
    if (await page.getByRole('button', { name: re('走进院里', 'Step inside') }).isEnabled().catch(() => false)) break;
    await page.waitForTimeout(50);
  }
  await page.getByRole('button', { name: re('走进院里', 'Step inside') }).click();
  await expect.poll(() => cues.some((c) => c.cue === 'snow_walk'), { timeout: 15_000 }).toBe(true);
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
  // The authored walk is 36 s: choose must not be asked for while it is still playing.
  await page.waitForTimeout(20_000);
  expect(cues.some((c) => c.cue === 'snow_choose_loop')).toBe(false);
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
  expect(errors).toEqual([]);
});
