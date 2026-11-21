// One live smoke run of the camera sampler on the Snow Roof desktop-fast immediate-entry path.
//
// This is an E2E-build reading, not a production one. It builds with VITE_E2E_HOOKS=1 so
// window.__pineRenderCamera exists, then performs one real Step inside click with four seconds of
// sampling. It reports the raw snapshot, the measured reference-to-click gap, how many frames were valid
// or missing, the median interval, the verdict and the threshold-crossing bracket.
//
// Usage: node tests/tier2/walk-camera-smoke.mjs --run-dir TMP --out DIR [--port 8910]
// The caller runs this under gpu-lease.sh; the script starts and stops its own server and prints its pid.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { pageSampler, pageArmClickCapture, pageCollect, samplesFromSnapshot, sampleInterval }
  from './walk-camera-sampler.mjs';
import { judgeCameraMotion } from './walk-camera-judge.mjs';
import { stopServerAndRemoveDatabase } from './walk-camera-smoke-cleanup.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((rows, value, index, all) => {
  if (value.startsWith('--')) rows.push([value.slice(2), all[index + 1] ?? '']);
  return rows;
}, []));
const runDir = args['run-dir'];
if (!runDir) throw new Error('Pass --run-dir (the worker tmp that safe-kill.sh authorises).');
const out = args.out ?? join(runDir, 'walk-smoke');
const port = Number(args.port ?? 8910);
mkdirSync(out, { recursive: true });
// Every run gets its own directory for the database and the web symlink. A previous run may have left its
// database behind after a refusal, and that evidence must survive this run untouched.
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
const runScratch = join(runDir, 'smoke-runs', runId);
mkdirSync(runScratch, { recursive: true });

// Revision and build provenance are recorded before anything runs.
const revision = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const builtIndex = join(REPO, 'web', 'dist', 'index.html');
if (!existsSync(builtIndex)) throw new Error('No build at ' + builtIndex + '; build with VITE_E2E_HOOKS=1 first.');
const buildMtime = execFileSync('stat', ['-f', '%Sm', builtIndex], { encoding: 'utf8' }).trim();
const distHasCameraHook = execFileSync('sh', ['-c',
  `grep -rl "__pineRenderCamera" ${JSON.stringify(join(REPO, 'web', 'dist', 'assets'))} | head -1 || true`],
  { encoding: 'utf8' }).trim();

// The server runs with its cwd inside the authorised tmp, with a web symlink into the real build.
const link = join(runScratch, 'web');
try { execFileSync('rm', ['-f', link]); } catch { /* absent */ }
execFileSync('ln', ['-s', join(REPO, 'web'), link]);
const dbFile = join(runScratch, 'smoke.db');
const server = spawn('node', [join(REPO, 'server', 'main.ts')], {
  // The server resolves web/dist from its cwd, so its cwd is the per-run scratch dir that holds the link.
  cwd: runScratch, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DB_FILE: dbFile },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = [];
server.stdout.on('data', chunk => serverLog.push(String(chunk)));
server.stderr.on('data', chunk => serverLog.push(String(chunk)));

const record = { revision, buildMtime, distHasCameraHook: Boolean(distHasCameraHook), port, serverPid: server.pid,
  place: 'snow-roof', condition: 'desktop-fast immediate-entry', build: 'VITE_E2E_HOOKS=1' };
// The shared root holds safe-kill.sh; the worker tmp below it is what safe-kill authorises.
const ROOT = '/Users/xuan/OpenBot/Shared/one-light';
let failure = false;

let browser;
try {
  // Wait for the API to answer before opening a page.
  let up = false;
  for (let attempt = 0; attempt < 120 && !up; attempt++) {
    try { up = (await fetch(`http://127.0.0.1:${port}/api/places/stats`)).ok; }
    catch { /* not yet */ }
    if (!up) await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!up) throw new Error('server never answered on ' + port + ': ' + serverLog.join('').slice(-400));

  browser = await chromium.launch({ channel: 'chrome',
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error).slice(0, 200)));
  page.setDefaultTimeout(180000);

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  // Immediate entry: type as soon as the field is there, then confirm the default place, which must be Snow
  // Roof; this run never chooses a place.
  await page.getByLabel('Your wish').waitFor();
  await page.getByLabel('Your wish').fill('Measuring when the walk starts.');
  await page.getByRole('button', { name: 'Set my wish', exact: true }).click();
  await page.locator('[role=radio].place').first().waitFor();
  record.checkedPlace = await page.evaluate(() => {
    const checked = [...document.querySelectorAll('[role=radio].place')]
      .filter(node => node.getAttribute('aria-checked') === 'true');
    return checked.map(node => (node.getAttribute('aria-label') ?? node.textContent ?? '').trim());
  });
  record.snowRoofChecked = record.checkedPlace.some(label => label.startsWith('Snow Roof'));

  const step = page.getByRole('button', { name: 'Step inside', exact: true });
  await step.waitFor();
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Step inside');
    return Boolean(button) && !button.disabled && button.getAttribute('aria-disabled') !== 'true';
  });

  // Preconditions: the main camera must exist, and the capture listener must be armed.
  record.cameraPresentAtArm = await page.evaluate(() => Boolean(window.__pineRenderCamera));
  await page.evaluate(pageSampler);
  await page.waitForTimeout(400);   // a few pre-click frames
  record.armed = await page.evaluate(pageArmClickCapture, 'Step inside');
  if (!record.armed.armed) throw new Error('capture listener did not arm: ' + record.armed.reason);

  // One real click, then four seconds of sampling.
  await step.click();
  await page.waitForTimeout(4000);
  const snapshot = await page.evaluate(pageCollect);
  record.errors = errors;

  writeFileSync(join(out, 'snapshot.json'), JSON.stringify(snapshot, null, 2));
  const { samples, reasons } = samplesFromSnapshot(snapshot);
  writeFileSync(join(out, 'samples.json'), JSON.stringify({ samples, reasons }, null, 2));

  const verdict = judgeCameraMotion(samples);
  record.measurement = {
    rawSnapshot: join(out, 'snapshot.json'),
    samplesPath: join(out, 'samples.json'),
    clickAt: snapshot.clickAt,
    referenceAt: snapshot.referenceAt,
    referenceToClickMs: snapshot.clickAt === null || snapshot.referenceAt === null
      ? null : Number((snapshot.clickAt - snapshot.referenceAt).toFixed(3)),
    referenceLength: Array.isArray(snapshot.reference) ? snapshot.reference.length : null,
    referenceFinite: Array.isArray(snapshot.reference) ? snapshot.reference.every(Number.isFinite) : false,
    framesCollected: (snapshot.frames ?? []).length,
    validFrames: samples.length - 1,
    missingFrames: snapshot.missing,
    medianIntervalMs: sampleInterval(samples),
    verdict,
    reasons,
  };
} catch (error) {
  record.failed = String(error?.message ?? error).slice(0, 400);
  failure = true;
} finally {
  // GOALS.md cleanup, through the one shared implementation the tests also drive: safe-kill with the PID
  // recorded at startup, a confirmed exit, then removal of this run's own files with verification.
  if (browser) await browser.close().catch(() => {});
  writeFileSync(join(out, 'server.log'), serverLog.join(''));

  const cleanup = await stopServerAndRemoveDatabase({
    pid: server.pid, dbFile, safeKill: join(ROOT, 'safe-kill.sh'), exec: execFileSync,
  });
  record.cleanup = cleanup.report;
  record.runScratch = runScratch;
  if (!cleanup.ok) {
    failure = true;
    record.failureReason = record.failureReason ?? cleanup.report.reason ?? 'cleanup did not finish';
  }

  // A run that measured nothing is a failure even when no exception was thrown.
  const measured = record.measurement?.verdict?.verdict;
  if (!record.measurement || (measured !== 'moving' && measured !== 'rotating' && measured !== 'still')) {
    failure = true;
    record.failureReason = record.failureReason ?? 'no usable measurement was produced';
  }
  record.exitCode = failure ? 1 : 0;
  console.log(JSON.stringify(record, null, 2));
  writeFileSync(join(out, 'result.json'), JSON.stringify(record, null, 2));
  if (failure) process.exitCode = 1;
}
