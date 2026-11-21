// Selection-generation diagnosis: which place actually gets built and consumed.
//
// The question: after the visitor switches away from Snow Roof and back, does the abandoned place's build
// keep running, and do its bytes reach the final court? This records, on one page clock:
//   - every selection the UI accepted (aria-checked transitions), i.e. the generation boundaries
//   - every prepare stage the loading pill reported, with the court name it belonged to
//   - every request with its initiator, so a byte total can be tied to the code path that asked
//   - the court that was finally visible, and the moment it reached ready
//
// Nothing here changes product code; it reads attributes the page already publishes and CDP events.
//
// Usage: node tests/tier2/selection-generation.mjs --run-dir TMP [--stay-ms 2000] [--no-switch] [--stay-away]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { stopServerAndRemoveDatabase } from './walk-camera-smoke-cleanup.mjs';
import { parseArgs } from './cli-args.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const ROOT = '/Users/xuan/OpenBot/Shared/one-light';
const args = parseArgs(process.argv.slice(2), new Set(['no-switch', 'stay-away']));
const runDir = args['run-dir'];
if (!runDir) throw new Error('Pass --run-dir (the worker tmp that safe-kill.sh authorises).');
const port = Number(args.port ?? 8920);
const stayMs = Number(args['stay-ms'] ?? 2000);
const skipSwitch = args['no-switch'] === true;
const stayAway = args['stay-away'] === true;

const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
const evidenceBase = args.out ?? join(runDir, 'selection-generation');
if (args.out && existsSync(evidenceBase) && readdirSync(evidenceBase).length) {
  throw new Error('Refusing to write into a non-empty --out: ' + evidenceBase);
}
const out = join(evidenceBase, stamp);
mkdirSync(out, { recursive: true });
const runScratch = join(runDir, 'selection-generation-runs', stamp);
mkdirSync(runScratch, { recursive: true });

const revision = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const manifestPath = join(REPO, 'web', 'dist', 'places', 'snow-roof', 'manifest.json');
if (!existsSync(manifestPath)) throw new Error('No build at ' + manifestPath);
const manifestSha = execFileSync('md5', ['-q', manifestPath], { encoding: 'utf8' }).trim();

const link = join(runScratch, 'web');
try { execFileSync('rm', ['-f', link]); } catch { /* absent */ }
execFileSync('ln', ['-s', join(REPO, 'web'), link]);
const dbFile = join(runScratch, 'selection.db');
const server = spawn('node', [join(REPO, 'server', 'main.ts')], {
  cwd: runScratch, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DB_FILE: dbFile },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = [];
server.stdout.on('data', chunk => serverLog.push(String(chunk)));
server.stderr.on('data', chunk => serverLog.push(String(chunk)));

const record = { revision, manifestSha, out, port, serverPid: server.pid, stayMs, skipSwitch, stayAway,
  selections: [], stageEvents: [], errors: [] };
let failure = false;
let browser;

async function waitForServer(target, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { const response = await fetch(`http://127.0.0.1:${target}/api/places/stats`); if (response.ok) return; }
    catch { /* not listening yet */ }
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  throw new Error('server never answered on ' + target);
}

try {
  await waitForServer(port);
  browser = await chromium.launch({ channel: 'chrome',
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const viewport = (args.viewport ?? 'desktop') === 'phone'
    ? { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
    : { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 2 };
  record.viewport = `${viewport.width}x${viewport.height}`;
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height },
    locale: 'en-US', isMobile: viewport.isMobile, hasTouch: viewport.hasTouch,
    deviceScaleFactor: viewport.deviceScaleFactor });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  if (args['net-mbps']) {
    await cdp.send('Network.emulateNetworkConditions', { offline: false,
      latency: Number(args.latency ?? 150),
      downloadThroughput: Number(args['net-mbps']) * 1e6 / 8, uploadThroughput: 2e6 / 8 });
  }

  const requests = [];
  cdp.on('Network.requestWillBeSent', params => {
    const initiator = params.initiator ?? {};
    requests.push({ id: params.requestId, url: params.request.url, type: params.type,
      sentAt: params.timestamp, bytes: 0, finishedAt: null,
      initiatorType: initiator.type ?? null,
      initiatorUrl: initiator.url ?? initiator.stack?.callFrames?.[0]?.url ?? null,
      initiatorFunction: initiator.stack?.callFrames?.[0]?.functionName ?? null });
  });
  cdp.on('Network.loadingFinished', params => {
    const row = requests.find(entry => entry.id === params.requestId);
    if (row) { row.bytes = params.encodedDataLength ?? 0; row.finishedAt = params.timestamp; }
  });

  page.on('pageerror', error => record.errors.push(String(error).slice(0, 200)));
  // HTTP failures and console errors are separate from page errors and must also fail the run.
  page.on('response', response => {
    if (response.status() >= 400) record.httpErrors = [...(record.httpErrors ?? []),
      `${response.status()} ${response.url().split('?')[0]}`];
  });

  // Record selection generations and pill stages on the page clock, keyed to the court they belong to.
  await page.addInitScript(() => {
    const log = { selections: [], stages: [] };
    window.__genProbe = log;
    const checked = () => [...document.querySelectorAll('[role=radio].place')]
      .filter(node => node.getAttribute('aria-checked') === 'true')
      .map(node => (node.getAttribute('aria-label') ?? '').split('·')[0].trim());
    const readStage = node => {
      const pill = node?.classList?.contains('court-loading') ? node : null;
      if (!pill) return;
      const stage = pill.dataset.stage;
      if (!stage) return;
      log.stages.push({ at: performance.now(), stage, text: (pill.textContent ?? '').slice(0, 40) });
    };
    const observer = new MutationObserver(records => {
      for (const rec of records) {
        if (rec.type === 'attributes') {
          if (rec.target.getAttribute?.('aria-checked') !== null) {
            const now = checked();
            if (now.length === 1) log.selections.push({ at: performance.now(), label: now[0] });
          }
          if (rec.target.classList?.contains('court-loading')) readStage(rec.target);
          continue;
        }
        for (const added of rec.addedNodes) {
          if (!(added instanceof Element)) continue;
          if (added.classList?.contains('court-loading')) readStage(added);
          for (const inner of added.querySelectorAll?.('.court-loading[data-stage]') ?? []) readStage(inner);
        }
      }
    });
    // Observe the Document, not documentElement: an init script runs before parsing, and documentElement can
    // still be null. A Document's subtree covers every later insertion, including the root element.
    observer.observe(document, { subtree: true, childList: true, attributes: true });
    // Anything already painted before the observer attached still counts.
    for (const node of document.querySelectorAll?.('.court-loading[data-stage]') ?? []) readStage(node);
  });

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Your wish').waitFor();
  await page.getByLabel('Your wish').fill('Diagnosing the selection.');
  await page.getByRole('button', { name: 'Set my wish', exact: true }).click();
  await page.locator('[role=radio].place').first().waitFor();

  // Capture the request index at the moment a selection lands. Reading it here, from the CDP stream the
  // harness owns, is exact: no page clock and CDP clock are ever subtracted.
  // Click a place and wait for a transition that happens *after this click*. A historical `.some` check is
  // satisfied by the initial Snow Roof selection, so a click that never took effect would look successful.
  const pick = async (matcher, text) => {
    const before = await page.evaluate(() => window.__genProbe.selections.length);
    await page.locator('[role=radio].place').filter({ hasText: matcher }).first().click();
    await page.waitForFunction(([pattern, since]) => window.__genProbe.selections
      .slice(since).some(entry => entry.label.includes(pattern)), [text, before],
      { timeout: 30000 });
    const landed = await page.evaluate(() => window.__genProbe.selections.at(-1)?.label ?? null);
    if (!landed || !landed.includes(text.slice(0, 8))) {
      throw new Error(`selection did not land on ${text}; the newest selection is ${landed}`);
    }
    record.selectionBoundaries = record.selectionBoundaries ?? [];
    record.selectionBoundaries.push({ label: text, requestsSent: requests.length });
  };

  if (!skipSwitch) {
    // Let Snow Roof's build actually start, then leave while it is running.
    await page.waitForFunction(() => window.__genProbe.stages
      .some(entry => entry.stage === 'preparing'), null, { timeout: 60000 });
    record.leftAt = await page.evaluate(() => performance.now());
    await pick(/Pine Gate Steps/, 'Pine Gate');
    record.arrivedAwayAt = await page.evaluate(() => performance.now());
    // A real, operable stay: long enough for the abandoned build to make progress.
    await page.waitForTimeout(stayMs);
    if (!stayAway) {
      record.returnedAt = await page.evaluate(() => performance.now());
      await pick(/Snow Roof Court/, 'Snow Roof');
    }
  }

  // Wait for ready *after* the last selection. An earlier ready belongs to a court the visitor has already
  // left; accepting it would report the abandoned court's readiness as the final court's.
  const lastSelectionAt = await page.evaluate(() => window.__genProbe.selections.at(-1)?.at ?? 0);
  await page.waitForFunction(since => window.__genProbe.stages
    .some(entry => entry.stage === 'ready' && entry.at >= since), lastSelectionAt,
    { timeout: 300000 }).catch(() => { record.readyTimedOut = true; });
  record.readyAt = await page.evaluate(() => performance.now());
  record.readyAfterLastSelection = !record.readyTimedOut;
  record.visiblePlace = await page.evaluate(() => [...document.querySelectorAll('[role=radio].place')]
    .filter(node => node.getAttribute('aria-checked') === 'true')
    .map(node => (node.getAttribute('aria-label') ?? '').split('·')[0].trim()));

  const probe = await page.evaluate(() => window.__genProbe);
  record.selections = probe.selections;
  record.stageEvents = probe.stages;

  // Attribute each request to a selection generation by arrival order at the boundaries the harness
  // observed. The nth request belongs to the last selection that had happened before the stream reached it.
  const boundaries = record.selectionBoundaries ?? [];
  record.requests = requests.map((row, index) => {
    let generation = 0;
    for (let step = 0; step < boundaries.length; step++) {
      if (index < boundaries[step].requestsSent) break;
      generation = step + 1;
    }
    return {
      url: row.url.split('?')[0], type: row.type, bytes: row.bytes,
      initiatorType: row.initiatorType, initiatorUrl: row.initiatorUrl,
      initiatorFunction: row.initiatorFunction, finished: row.finishedAt !== null,
      sentAtCdpSeconds: row.sentAt, finishedAtCdpSeconds: row.finishedAt,
      generation,
      generationLabel: generation === 0 ? 'initial' : boundaries[generation - 1]?.label ?? `g${generation}`,
    };
  });

  const byPlace = {};
  for (const row of record.requests) {
    const match = row.url.match(/\/places\/([^/]+)\//);
    const key = match ? match[1] : 'page';
    byPlace[key] = byPlace[key] ?? { requests: 0, bytes: 0 };
    byPlace[key].requests += 1;
    byPlace[key].bytes += row.bytes;
  }
  record.bytesByPlace = byPlace;
  record.requestCount = record.requests.length;
  // The radio only says which place is selected; it does not prove the scene is that place. Record the canvas
  // signature and whether the app reports that it is on the place screen, and say plainly that selection is
  // not visibility.
  record.selectionIsNotVisibility = true;

  // Walk through to an actual ignition so the arm proves the court is operable, not merely selected.
  let moved = false; let ignited = false;
  try {
    const step = page.getByRole('button', { name: 'Step inside', exact: true });
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll('button')]
        .find(node => node.textContent.trim() === 'Step inside');
      return Boolean(button) && !button.disabled;
    }, null, { timeout: 300000 });
    record.readyProvenAt = await page.evaluate(() => performance.now());
    await page.evaluate(() => {
      window.__walkProbe2 = { clickedAt: null, firstMoveAt: null, baseline: null, streak: 0 };
      const button = [...document.querySelectorAll('button')]
        .find(node => node.textContent.trim() === 'Step inside');
      button?.addEventListener('click', () => { window.__walkProbe2.clickedAt = performance.now(); }, true);
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      const scratch = document.createElement('canvas');
      scratch.width = 48; scratch.height = 30;
      const g = scratch.getContext('2d', { willReadFrequently: true });
      const watch = () => {
        const probe = window.__walkProbe2;
        if (probe.firstMoveAt !== null) return;
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
    try { await page.waitForFunction(() => window.__walkProbe2?.firstMoveAt !== null, null,
      { timeout: 120000 }); moved = true; } catch { moved = false; }
    const chooser = page.locator('[role=radio]').filter({ hasText: /10\s*min/i }).first();
    try {
      await chooser.waitFor({ timeout: 300000 });
      const light = page.getByRole('button', { name: /Light it/ }).first();
      await light.waitFor({ timeout: 90000 });
      await light.click();
      await page.waitForTimeout(1500);
      const before = await page.evaluate(() => document.querySelectorAll('canvas').length);
      ignited = before > 0;
    } catch { ignited = false; }
    const walk = await page.evaluate(() => window.__walkProbe2 ?? null);
    record.clickedAt = walk?.clickedAt ?? null;
    record.firstMoveAt = walk?.firstMoveAt ?? null;
  } catch (error) {
    record.flowFailure = String(error?.message ?? error).slice(0, 200);
  }
  record.moved = moved;
  record.ignited = ignited;

  // A run only counts when it reached ready, moved, and ignited, with no page, HTTP or cleanup error.
  const problems = [];
  if (record.readyTimedOut) problems.push('ready was never reported after the last selection');
  if (!moved) problems.push('the walk never produced a first movement');
  if (!ignited) problems.push('ignition was never reached');
  if ((record.errors ?? []).length) problems.push(`${record.errors.length} page error(s)`);
  if ((record.httpErrors ?? []).length) problems.push(`${record.httpErrors.length} HTTP error(s)`);
  if (problems.length) {
    failure = true;
    record.failureReason = problems.join('; ');
  }

  writeFileSync(join(out, 'requests.json'), JSON.stringify(record.requests, null, 2));
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
