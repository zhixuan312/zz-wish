// Obsolete-fetch baseline for one place switch away from Snow Roof and back.
//
// Question this answers, and only this: if a visitor abandons Snow Roof while it is downloading and comes
// back, how many bytes are spent that the final court does not use? The run is one observation, not a
// distribution, and it never claims a saving.
//
// Attribution rule. Every request is recorded with the moment it was first sent. A request belongs to
// "already in flight" if it was sent before the switch boundary and to "newly sent after the switch" if it
// was sent after it; the two are reported separately and never summed. Requests shared by both courts are
// named by URL rather than guessed from timing alone.
//
// Usage: node tests/tier2/switch-roundtrip.mjs --run-dir TMP --out DIR [--port 8914] [--away "Pine Gate"]
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
const port = Number(args.port ?? 8914);
const awayLabel = args.away ?? 'Pine Gate';

const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
const evidenceBase = args.out ?? join(runDir, 'switch-roundtrip');
if (args.out && existsSync(evidenceBase) && readdirSync(evidenceBase).length) {
  throw new Error('Refusing to write into a non-empty --out: ' + evidenceBase);
}
const out = join(evidenceBase, stamp);
mkdirSync(out, { recursive: true });
const runScratch = join(runDir, 'switch-roundtrip-runs', stamp);
mkdirSync(runScratch, { recursive: true });

const revision = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const manifestPath = join(REPO, 'web', 'dist', 'places', 'snow-roof', 'manifest.json');
if (!existsSync(manifestPath)) throw new Error('No build at ' + manifestPath);
const manifestSha = execFileSync('md5', ['-q', manifestPath], { encoding: 'utf8' }).trim();

const link = join(runScratch, 'web');
try { execFileSync('rm', ['-f', link]); } catch { /* absent */ }
execFileSync('ln', ['-s', join(REPO, 'web'), link]);
const dbFile = join(runScratch, 'switch.db');
const server = spawn('node', [join(REPO, 'server', 'main.ts')], {
  cwd: runScratch, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DB_FILE: dbFile },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = [];
server.stdout.on('data', chunk => serverLog.push(String(chunk)));
server.stderr.on('data', chunk => serverLog.push(String(chunk)));

const record = { revision, manifestSha, out, port, serverPid: server.pid, awayLabel,
  switches: [], errors: [] };
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US',
    deviceScaleFactor: 2 });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  // Optional throttling. On localhost the 6 MB model lands in ~460 ms, which leaves no real window to
  // interrupt; a visitor on a slow link has one. Emulating that link is the only way to observe the
  // obsolete-fetch window without changing the product.
  const throttle = args['net-mbps'] ? { mbps: Number(args['net-mbps']), latency: Number(args.latency ?? 150) } : null;
  if (throttle) {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: throttle.latency,
      downloadThroughput: throttle.mbps * 1e6 / 8, uploadThroughput: 2e6 / 8 });
  }
  record.throttle = throttle;

  // Every request, with the send time on the CDP clock and enough to classify it afterwards.
  const requests = [];
  const alignmentEvents = [];
  const onRequest = params => {
    // `initiator` names what asked for the request: a script URL and line for a fetch, `parser` for markup.
    // Without it a byte total cannot say whether the final court wanted the request or a passing court did.
    const initiator = params.initiator ?? {};
    requests.push({ id: params.requestId, url: params.request.url, type: params.type,
      sentAt: params.timestamp, bytes: 0, finishedAt: null,
      initiatorType: initiator.type ?? null,
      initiatorUrl: initiator.url ?? initiator.stack?.callFrames?.[0]?.url ?? null,
      initiatorFunction: initiator.stack?.callFrames?.[0]?.functionName ?? null });
    alignmentEvents.push({ type: params.type, ts: params.timestamp });
  };
  const onFinished = params => {
    const row = requests.find(entry => entry.id === params.requestId);
    if (row) { row.bytes = params.encodedDataLength ?? 0; row.finishedAt = params.timestamp; }
  };
  cdp.on('Network.requestWillBeSent', onRequest);
  cdp.on('Network.loadingFinished', onFinished);

  page.on('pageerror', error => record.errors.push(String(error).slice(0, 200)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Your wish').waitFor();
  await page.getByLabel('Your wish').fill('Leaving and coming back.');
  await page.getByRole('button', { name: 'Set my wish', exact: true }).click();
  await page.locator('[role=radio].place').first().waitFor();

  // Wait until the Snow Roof model request has been sent but not yet finished, so the switch really lands
  // inside its transfer. Using the CDP rows is exact; the resource-timing API only shows completed entries.
  const modelInFlight = () => requests.some(row => row.url.includes('snow-roof.glb') && row.finishedAt === null);
  const waitStarted = Date.now();
  while (!modelInFlight()) {
    if (Date.now() - waitStarted > 60000) throw new Error('the Snow Roof model never entered flight');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  record.modelWasInFlightAtSwitch = true;

  // Install a recorder on the radios that stamps the page clock when a selection takes effect.
  await page.evaluate(() => {
    window.__switchProbe = { marks: [] };
    const record = () => {
      const checked = [...document.querySelectorAll('[role=radio].place')]
        .filter(node => node.getAttribute('aria-checked') === 'true')
        .map(node => (node.getAttribute('aria-label') ?? '').trim());
      if (checked.length === 1) window.__switchProbe.marks.push({ at: performance.now(), label: checked[0] });
    };
    new MutationObserver(record).observe(document.body, { subtree: true, attributes: true,
      attributeFilter: ['aria-checked'] });
    record();
  });

  // Click a place radio and wait for the checked state to actually land on a label containing `text`.
  // The expected text is passed explicitly: deriving it from a RegExp was fragile because the aria-label
  // carries a trailing description the pattern does not match.
  const pick = async (matcher, text) => {
    await page.locator('[role=radio].place').filter({ hasText: matcher }).first().click();
    await page.waitForFunction(pattern => window.__switchProbe.marks
      .some(mark => mark.label.includes(pattern)), text, { timeout: 30000 });
  };

  const boundaryIndex = () => requests.length;
  // The reference run keeps the journey uninterrupted: same page, same clock pin, same throttle, no switch.
  // It is the baseline the switch run is compared with, so a difference cannot come from the conditions.
  const skipSwitch = args['no-switch'] === true;
  const stayAway = args['stay-away'] === true;
  record.switched = !skipSwitch;
  record.stayAway = stayAway;
  if (!skipSwitch) {
    // 1. Away from Snow Roof, while its model is still transferring.
    const awayAt = await page.evaluate(() => performance.now());
    const sentBeforeAway = boundaryIndex();
    await pick(/Pine Gate Steps/, 'Pine Gate Steps');
    record.switches.push({ to: 'away', atPageMs: awayAt, requestsSentBefore: sentBeforeAway,
      requestsAtBoundary: boundaryIndex(),
      finishedAtBoundary: requests.filter(r => r.finishedAt !== null).length,
      finishedIds: requests.filter(r => r.finishedAt !== null).map(r => r.id) });

    // 2. Back to Snow Roof, unless this run measures what staying away costs.
    if (stayAway) {
      record.stayedAway = true;
    } else {
    const backAt = await page.evaluate(() => performance.now());
    const sentBeforeBack = boundaryIndex();
    await pick(/Snow Roof Court/, 'Snow Roof Court');
    record.switches.push({ to: 'snow-roof', atPageMs: backAt, requestsSentBefore: sentBeforeBack,
      requestsAtBoundary: boundaryIndex(),
      finishedAtBoundary: requests.filter(r => r.finishedAt !== null).length,
      finishedIds: requests.filter(r => r.finishedAt !== null).map(r => r.id) });
    }
  }

  // Persist the raw rows before waiting on anything slow: a later timeout must not erase what the switches
  // already proved about which requests were in flight.
  writeFileSync(join(out, 'requests-raw.json'), JSON.stringify(requests.map(row => ({
    id: row.id, url: row.url.split('?')[0], type: row.type, bytes: row.bytes,
    sentAt: row.sentAt, finishedAt: row.finishedAt,
  })), null, 2));
  writeFileSync(join(out, 'switches.json'), JSON.stringify(record.switches, null, 2));

  // Wait for the final court to be ready, then for its first movement and ignition.
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Step inside');
    return Boolean(button) && !button.disabled;
  }, null, { timeout: 300000 });
  record.readyAtPageMs = await page.evaluate(() => performance.now());

  await page.evaluate(() => {
    window.__moveProbe = { clickedAt: null, firstMoveAt: null, baseline: null, streak: 0 };
    const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Step inside');
    button?.addEventListener('click', () => { window.__moveProbe.clickedAt = performance.now(); }, true);
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const scratch = document.createElement('canvas');
    scratch.width = 48; scratch.height = 30;
    const g = scratch.getContext('2d', { willReadFrequently: true });
    const watch = () => {
      const probe = window.__moveProbe;
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
  const step = page.getByRole('button', { name: 'Step inside', exact: true });
  await step.click();
  let moved = true;
  try {
    await page.waitForFunction(() => window.__moveProbe?.firstMoveAt !== null, null, { timeout: 90000 });
  } catch { moved = false; }
  record.moved = moved;

  // Through the walk to ignition, as the normal flow does.
  const chooser = page.locator('[role=radio]').filter({ hasText: /10\s*min/i }).first();
  let arrived = true;
  try { await chooser.waitFor({ timeout: 300000 }); } catch { arrived = false; }
  record.arrived = arrived;
  if (arrived) {
    const light = page.getByRole('button', { name: /Light it/ }).first();
    let lit = false;
    try { await light.waitFor({ timeout: 60000 }); await light.click(); lit = true; } catch { /* recorded */ }
    record.ignited = lit;
  }

  const probe = await page.evaluate(() => ({ marks: window.__switchProbe?.marks ?? [],
    move: window.__moveProbe ?? null }));
  record.switchMarks = probe.marks;
  record.clickedAtPageMs = probe.move?.clickedAt ?? null;
  record.firstMoveAtPageMs = probe.move?.firstMoveAt ?? null;

  // Classify every request by whether it was sent before or after each switch.
  const firstSwitch = record.switches[0]?.requestsAtBoundary ?? 0;
  const secondSwitch = record.switches[1]?.requestsAtBoundary ?? 0;
  const classify = row => {
    const index = requests.indexOf(row);
    if (index < firstSwitch) return 'sent-before-first-switch';
    if (index < secondSwitch) return 'sent-between-switches';
    return 'sent-after-return';
  };
  record.requests = requests.map(row => ({
    url: row.url.split('?')[0], type: row.type, bytes: row.bytes, group: classify(row),
    sentAtMs: row.sentAt, finishedAtMs: row.finishedAt, finished: row.finishedAt !== null,
    initiatorType: row.initiatorType, initiatorUrl: row.initiatorUrl,
    initiatorFunction: row.initiatorFunction,
  }));

  const totals = {};
  for (const row of record.requests) {
    totals[row.group] = totals[row.group] ?? { requests: 0, bytes: 0 };
    totals[row.group].requests += 1;
    totals[row.group].bytes += row.bytes;
  }
  record.totals = totals;
  // Which requests were still transferring at each switch moment. This is what makes "in flight when the
  // visitor left" a fact rather than an assumption: a request counts only if it was sent before the boundary
  // and had not finished by it.
  // A request was in flight at a switch if it had been sent before the boundary and was not in the set of
  // requests already finished when the boundary was taken. The snapshot is exact, not reconstructed.
  const stillOpen = index => {
    const sw = record.switches[index];
    if (!sw) return [];
    const done = new Set(sw.finishedIds);
    return requests.slice(0, sw.requestsAtBoundary)
      .filter(row => !done.has(row.id))
      .map(row => ({ url: row.url.split('?')[0], bytes: row.bytes }));
  };
  record.openAtAway = stillOpen(0);
  record.openAtReturn = stillOpen(1);
  for (const sw of record.switches) delete sw.finishedIds;
  // Snow Roof bytes spent that the final court does not use: those Snow requests sent before the return that
  // the final court never asks for again after it.
  const snowBefore = record.requests.filter(row => row.group !== 'sent-after-return'
    && row.url.includes('/places/snow-roof/'));
  const snowUseful = record.requests.filter(row => row.group === 'sent-after-return'
    && row.url.includes('/places/snow-roof/'));
  record.snow = {
    beforeReturn: { requests: snowBefore.length, bytes: snowBefore.reduce((s, r) => s + r.bytes, 0) },
    afterReturn: { requests: snowUseful.length, bytes: snowUseful.reduce((s, r) => s + r.bytes, 0) },
    beforeNames: snowBefore.map(row => row.url.split('/').pop()),
    afterNames: snowUseful.map(row => row.url.split('/').pop()),
  };
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
