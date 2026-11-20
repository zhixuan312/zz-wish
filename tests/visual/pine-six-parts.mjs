// Six-part review frames for Pine Gate, plus a crossing series through the dusk boundary.
//
// This is a review probe, not a gate: it walks the real product path on the ordinary package and
// takes the burning view at fixed local hours. Run it with the lease held, then release.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.env.OUTPUT ?? '/Users/xuan/Documents/code/zz-wish/artifacts/pine-gate/quality/direction/s2-six-parts-01';
const API_PORT = 9002, VITE_PORT = 9003;
const HOURS = [[6, 0], [9, 0], [12, 0], [15, 0], [18, 30], [22, 0]];
// The shared demo package, so the review matches the public build.
const PKG = 'art/build/pine-gate/p2-runtime-28-night01';

const run = mkdtempSync(join(tmpdir(), 'six-parts-'));
const api = spawn('node', ['server/main.ts'], {
  env: { ...process.env, PORT: String(API_PORT), HOST: '127.0.0.1', DB_FILE: join(run, 'db.sqlite') },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'web/vite.config.ts',
  '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'], {
  env: { ...process.env, ONE_LIGHT_API_TARGET: `http://127.0.0.1:${API_PORT}` },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const packageFiles = readdirSync(PKG);
const packageSha = createHash('sha256').update(readFileSync(join(PKG, 'manifest.json'))).digest('hex');

// Serve the demo package for the Pine Gate place route, exactly as the journey does.
const servePackage = async page => {
  const manifest = JSON.parse(readFileSync(join(PKG, 'manifest.json'), 'utf8'));
  await page.route('**/places/pine-gate/manifest.json', route => route.fulfill({ json: manifest }));
  await page.route('**/places/pine-gate/*', async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    if (name === 'manifest.json') return route.fallback();
    if (!packageFiles.includes(name)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: readFileSync(join(PKG, name)), contentType: 'application/octet-stream' });
  });
};

const wait = async url => {
  for (let i = 0; i < 120; i++) {
    try { const response = await fetch(url); if (response.ok) return; } catch { /* not up yet */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
};

// Patch the wall clock inside the page, so the light curve reads the hour we want and the burn
// clock can be moved later for the crossing series.
const clockScript = ({ hour }) => {
  let shift = 0;
  const clockHour = () => hour + shift / 3600000;
  Date.prototype.getHours = () => Math.floor(clockHour()) % 24;
  Date.prototype.getMinutes = () => Math.floor((clockHour() % 1) * 60);
  Date.prototype.getSeconds = () => 0;
  Date.prototype.getMilliseconds = () => 0;
  window.__advanceWallClock = ms => { shift += ms; };
};

const browser = await chromium.launch({
  channel: 'chrome', headless: false,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const report = { packageSha, hours: [], crossing: [], errors: [] };
try {
  await wait(`http://127.0.0.1:${API_PORT}/api/places/stats`);
  await wait(`http://127.0.0.1:${VITE_PORT}/`);

  for (const [h, m] of HOURS) {
    const dir = join(OUT, `${String(h).padStart(2, '0')}-${String(m).padStart(2, '0')}`);
    mkdirSync(dir, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
    await context.addInitScript(clockScript, { hour: h + m / 60 });
    const page = await context.newPage();
    await servePackage(page);
    page.on('pageerror', error => report.errors.push(`${h}:${m} ${error.message}`));
    await page.goto(`http://127.0.0.1:${VITE_PORT}/`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
    await page.getByLabel(/Your wish/).fill('Six parts of the day.');
    await page.getByRole('button', { name: /Set my wish/ }).click();
    await page.getByRole('radio', { name: /Pine Gate Steps/ }).click();
    const step = page.getByRole('button', { name: /Step inside/ });
    for (let i = 0; i < 200; i++) { if (await step.isEnabled().catch(() => false)) break; await page.waitForTimeout(250); }
    await step.click();
    await page.getByRole('button', { name: /Skip/ }).click();
    await page.getByRole('radio', { name: /^10 min$/ }).click();
    await page.getByRole('button', { name: /Light it/ }).click();
    await page.getByTestId('with-you').waitFor({ timeout: 30_000 });
    // The camera only reaches the product burning view when ignition settles; shooting earlier
    // gives the wide ignition frame, which is what made the first batch inconsistent.
    await page.waitForFunction(() => window.__visualIgnition?.state === 'settled', null, { timeout: 60_000 });
    await page.waitForTimeout(1200);
    // The burning view: the product camera is settled, so hide the panels and shoot.
    await page.screenshot({ path: join(dir, h === 22 ? 'night-burning.png' : 'day-burning.png'),
      style: '.ui { visibility: hidden !important; }' });
    const light = await page.evaluate(() => window.__pineCaptureLighting?.() ?? null);
    report.hours.push({ hour: `${h}:${String(m).padStart(2, '0')}`,
      shot: join(dir, h === 22 ? 'night-burning.png' : 'day-burning.png'),
      passes: light?.loadedPasses ?? null, weights: light?.weights ?? null });
    await context.close();
  }

  // Crossing series: stay in one burning page and move the wall clock from 17:00 to 19:30 in
  // fifteen-minute steps, shooting each stop.
  const dir = join(OUT, 'crossing');
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  await context.addInitScript(clockScript, { hour: 17 });
  const page = await context.newPage();
  await servePackage(page);
  page.on('pageerror', error => report.errors.push(`crossing ${error.message}`));
  await page.goto(`http://127.0.0.1:${VITE_PORT}/`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
  await page.getByLabel(/Your wish/).fill('Crossing the dusk boundary.');
  await page.getByRole('button', { name: /Set my wish/ }).click();
  await page.getByRole('radio', { name: /Pine Gate Steps/ }).click();
  const step = page.getByRole('button', { name: /Step inside/ });
  for (let i = 0; i < 200; i++) { if (await step.isEnabled().catch(() => false)) break; await page.waitForTimeout(250); }
  await step.click();
  await page.getByRole('button', { name: /Skip/ }).click();
  await page.getByRole('radio', { name: /^10 min$/ }).click();
  await page.getByRole('button', { name: /Light it/ }).click();
  await page.getByTestId('with-you').waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => window.__visualIgnition?.state === 'settled', null, { timeout: 60_000 });
  await page.waitForTimeout(1200);
  // The live clock re-reads every 15 s; step in ten-minute moves and let it catch up.
  for (let mins = 0; mins <= 180; mins += 10) {
    if (mins > 0) {
      await page.evaluate(() => window.__advanceWallClock(10 * 60_000));
      await page.waitForTimeout(16_500);
    }
    const label = `${String(Math.floor((17 * 60 + mins) / 60)).padStart(2, '0')}-${String((17 * 60 + mins) % 60).padStart(2, '0')}`;
    await page.screenshot({ path: join(dir, `${label}.png`), style: '.ui { visibility: hidden !important; }' });
    const light = await page.evaluate(() => window.__pineCaptureLighting?.() ?? null);
    report.crossing.push({ clock: label, weights: light?.weights ?? null });
  }
  await context.close();
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('DONE=' + OUT);
} finally {
  await browser.close();
  for (const process of [api, vite]) { try { process.kill(); } catch { /* already gone */ } }
}
