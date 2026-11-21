// One cold visit to Snow Roof at a pinned hour, with per-request bytes frozen at three declared cutoffs.
//
// The existing matrix reports one cumulative total per run, and its top-fifteen list is a post-run snapshot
// that mixes the revisit. Neither can answer "what had arrived by the time Step inside was usable", so this
// harness snapshots the live ledger at three marks instead:
//
//   usable   the Step inside control reports enabled
//   clicked  the click's dispatch, captured on the button itself
//   firstStep the first animation frame after the click in which the camera actually moved
//
// No revisit runs. The page's own hour is read from the app's daylight curve inputs, not assumed. Raw CDP
// events are written untouched so the snapshot can be replayed.
//
// Usage: node tests/tier2/snow-cold-attribution.mjs --run-dir TMP --out DIR --hour 13 [--port 8916]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { createByteLedger } from './switch-byte-accounting.mjs';
import { stopServerAndRemoveDatabase } from './walk-camera-smoke-cleanup.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const ROOT = '/Users/xuan/OpenBot/Shared/one-light';
const args = Object.fromEntries(process.argv.slice(2).reduce((rows, value, index, all) => {
  if (value.startsWith('--')) rows.push([value.slice(2), all[index + 1] ?? '']);
  return rows;
}, []));
const runDir = args['run-dir'];
if (!runDir) throw new Error('Pass --run-dir (the worker tmp that safe-kill.sh authorises).');
const hour = Number(args.hour ?? 13);
if (!Number.isFinite(hour)) throw new Error('Pass --hour as a number.');
const port = Number(args.port ?? 8916);
// One profile per viewport drives all three uses: the browser context, the CDP throttling, and the recorded
// condition name. A profile that only renamed the condition would claim desktop-fast while still emulating
// a phone, and the bytes and timings would describe neither.
const PROFILES = {
  desktop: { name: 'desktop-fast', width: 1440, height: 900, isMobile: false, hasTouch: false,
    deviceScaleFactor: 2, cpu: 1, net: null },
  phone: { name: 'phone-4x-4g', width: 390, height: 844, isMobile: true, hasTouch: true,
    deviceScaleFactor: 3, cpu: 4, net: { latency: 150, down: 9e6 / 8, up: 2e6 / 8 } },
};
const profileName = args.viewport ?? 'phone';
const profile = PROFILES[profileName];
if (!profile) throw new Error('Pass --viewport desktop or phone; got ' + profileName);

const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
const evidenceBase = args.out ?? join(runDir, 'snow-cold');
if (args.out && existsSync(evidenceBase) && readdirSync(evidenceBase).length) {
  throw new Error('Refusing to write into a non-empty --out: ' + evidenceBase);
}
const out = join(evidenceBase, stamp);
mkdirSync(out, { recursive: true });
const runScratch = join(runDir, 'snow-cold-runs', stamp);
mkdirSync(runScratch, { recursive: true });

const revision = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const builtIndex = join(REPO, 'web', 'dist', 'index.html');
if (!existsSync(builtIndex)) throw new Error('No build at ' + builtIndex);

const link = join(runScratch, 'web');
try { execFileSync('rm', ['-f', link]); } catch { /* absent */ }
execFileSync('ln', ['-s', join(REPO, 'web'), link]);
const dbFile = join(runScratch, 'snow.db');
const server = spawn('node', [join(REPO, 'server', 'main.ts')], {
  cwd: runScratch, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DB_FILE: dbFile },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = [];
server.stdout.on('data', chunk => serverLog.push(String(chunk)));
server.stderr.on('data', chunk => serverLog.push(String(chunk)));

const record = { revision, out, port, serverPid: server.pid, hour, place: 'snow-roof',
  condition: profile.name, viewport: `${profile.width}x${profile.height}`,
  throttling: { cpu: profile.cpu, net: profile.net }, screenshots: Boolean(args.screenshots),
  observations: 1, revisit: false };
let failure = false;
let browser;

// Freeze every request's bytes as they stand right now. The snapshot is a plain copy, so later traffic
// cannot change it.
const snapshotOf = ledger => {
  const rows = ledger.rows();
  const totals = { snowRoof: 0, cover: 0, shared: 0, unknown: 0 };
  for (const row of rows) {
    const url = row.url;
    if (/\/places\/snow-roof\//.test(url)) totals.snowRoof += row.bytes;
    else if (/\/places\/cloud-cliff\//.test(url)) totals.cover += row.bytes;
    else if (/\/materials\/|\/codecs\/|\/assets\/|\/color\/|\/fonts\/|favicon/.test(url)) totals.shared += row.bytes;
    else totals.unknown += row.bytes;
  }
  totals.all = rows.reduce((sum, row) => sum + row.bytes, 0);
  return { rows, totals };
};

try {
  let up = false;
  for (let attempt = 0; attempt < 120 && !up; attempt++) {
    try { up = (await fetch(`http://127.0.0.1:${port}/api/places/stats`)).ok; } catch { /* not yet */ }
    if (!up) await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!up) throw new Error('server never answered on ' + port);

  browser = await chromium.launch({ channel: 'chrome',
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height },
    locale: 'en-US', isMobile: profile.isMobile, hasTouch: profile.hasTouch,
    deviceScaleFactor: profile.deviceScaleFactor });
  await context.addInitScript(h => {
    const RealDate = Date;
    const fixed = new RealDate(2026, 10, 21, h, 0, 0).getTime();
    const offset = fixed - RealDate.now();
    window.Date = class extends RealDate {
      constructor(...a) { return a.length ? new RealDate(...a) : new RealDate(RealDate.now() + offset); }
      static now() { return RealDate.now() + offset; }
    };
  }, hour);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  if (profile.net) {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.net.latency,
      downloadThroughput: profile.net.down, uploadThroughput: profile.net.up });
  }
  if (profile.cpu !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });

  const ledger = createByteLedger({ uncertaintyMs: 0 });
  const events = [];
  for (const method of ['Network.requestWillBeSent', 'Network.dataReceived', 'Network.loadingFinished',
    'Network.loadingFailed']) {
    cdp.on(method, params => { events.push({ method, params }); ledger.fromCdp({ method, params }); });
  }

  const errors = [];
  page.on('pageerror', error => errors.push(String(error).slice(0, 200)));
  page.setDefaultTimeout(180000);

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Your wish').waitFor();
  await page.getByLabel('Your wish').fill('Measuring one cold visit.');
  await page.getByRole('button', { name: 'Set my wish', exact: true }).click();
  await page.locator('[role=radio].place').first().waitFor();

  // The hour the page is actually using: the shared daylight curve reads Date, and the place records its own
  // light key. Read both, so an init-script failure cannot pass unnoticed.
  record.pageClock = await page.evaluate(() => ({ now: new Date().toString(), hours: new Date().getHours() }));
  record.checkedPlace = await page.evaluate(() => [...document.querySelectorAll('[role=radio].place')]
    .filter(node => node.getAttribute('aria-checked') === 'true')
    .map(node => (node.getAttribute('aria-label') ?? '').trim()));

  const step = page.getByRole('button', { name: 'Step inside', exact: true });
  await step.waitFor();
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Step inside');
    return Boolean(button) && !button.disabled && button.getAttribute('aria-disabled') !== 'true';
  });
  record.cutoffs = { usable: snapshotOf(ledger) };
  // Screenshots are opt-in: a capture before the click holds the page for real time and would hand a
  // background download extra seconds the timing run must not get.
  if (args.screenshots) {
    record.usableShot = 'usable.png';
    await page.screenshot({ path: join(out, record.usableShot) });
  }

  // Capture the click on the button itself, then watch for the first frame in which the picture moves.
  await page.evaluate(() => {
    window.__coldProbe = { clickedAt: null, firstMoveAt: null, baseline: null, streak: 0, samples: 0 };
    const button = [...document.querySelectorAll('button')]
      .find(node => node.textContent.trim() === 'Step inside');
    if (button) button.addEventListener('click', () => {
      window.__coldProbe.clickedAt = performance.now();
    }, true);
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const scratch = document.createElement('canvas');
    scratch.width = 48; scratch.height = 30;
    const g = scratch.getContext('2d', { willReadFrequently: true });
    const watch = () => {
      const probe = window.__coldProbe;
      if (probe.firstMoveAt !== null || probe.samples > 3600) return;
      probe.samples++;
      if (probe.clickedAt === null) { requestAnimationFrame(watch); return; }
      try {
        g.drawImage(canvas, 0, 0, scratch.width, scratch.height);
        const now = g.getImageData(0, 0, scratch.width, scratch.height).data;
        if (probe.baseline === null) probe.baseline = now.slice();
        else {
          let changed = 0;
          for (let i = 0; i < now.length; i += 4) {
            if (Math.abs(now[i] - probe.baseline[i]) + Math.abs(now[i + 1] - probe.baseline[i + 1])
              + Math.abs(now[i + 2] - probe.baseline[i + 2]) > 24) changed++;
          }
          probe.streak = changed / (now.length / 4) > .10 ? probe.streak + 1 : 0;
          if (probe.streak >= 4) { probe.firstMoveAt = performance.now(); return; }
          probe.baseline = now.slice();
        }
      } catch { /* resized canvas */ }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });

  await step.click();
  // The click cutoff is taken as soon as the click is stamped.
  await page.waitForFunction(() => window.__coldProbe?.clickedAt !== null, null, { timeout: 15000 });
  record.cutoffs.clicked = snapshotOf(ledger);

  let moved = true;
  try {
    await page.waitForFunction(() => window.__coldProbe?.firstMoveAt !== null, null, { timeout: 60000 });
  } catch { moved = false; }
  record.cutoffs.firstStep = snapshotOf(ledger);
  if (args.screenshots) {
    record.firstStepShot = 'firstStep.png';
    await page.screenshot({ path: join(out, record.firstStepShot) });
  }
  record.probe = await page.evaluate(() => window.__coldProbe);
  record.movedObserved = moved;

  writeFileSync(join(out, 'events.json'), JSON.stringify(events, null, 2));
  writeFileSync(join(out, 'cutoffs.json'), JSON.stringify(record.cutoffs, null, 2));
  if (!moved) { failure = true; record.failureReason = 'the first camera movement was never observed'; }
  record.errors = errors;
  // Conservation per cutoff: the four buckets must equal the sum of the rows.
  for (const [name, snap] of Object.entries(record.cutoffs)) {
    const rowSum = snap.rows.reduce((sum, row) => sum + row.bytes, 0);
    if (rowSum !== snap.totals.all) {
      failure = true;
      record.failureReason = record.failureReason ?? `cutoff ${name} does not reconcile`;
    }
  }
} catch (error) {
  failure = true;
  record.failed = String(error?.message ?? error).slice(0, 400);
} finally {
  if (browser) await browser.close().catch(() => {});
  writeFileSync(join(out, 'server.log'), serverLog.join(''));
  const cleanup = await stopServerAndRemoveDatabase({
    pid: server.pid, child: server, dbFile, safeKill: join(ROOT, 'safe-kill.sh'), exec: execFileSync,
  });
  record.cleanup = cleanup.report;
  record.runScratch = runScratch;
  if (!cleanup.ok) {
    failure = true;
    record.failureReason = record.failureReason ?? cleanup.report.reason ?? 'cleanup did not finish';
  }
  record.exitCode = failure ? 1 : 0;
  console.log(JSON.stringify(record, null, 2));
  writeFileSync(join(out, 'result.json'), JSON.stringify(record, null, 2));
  if (failure) process.exitCode = 1;
}
