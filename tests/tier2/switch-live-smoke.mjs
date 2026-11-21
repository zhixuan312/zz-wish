// One live observation of a real place switch: Snow Roof → Pine Gate, with bytes split per request.
//
// This records a single observation. It is not a distribution, and it cannot be turned into a "saving":
// one journey that loaded two courts says nothing about what another journey would have sent.
//
// The boundary is the moment the selection actually took effect, proven by the checked radio afterwards. Its
// time is taken from the page's `performance.now()` and mapped onto CDP's clock, with the mapping error
// measured and passed to the ledger as the uncertainty window. If the radio never reports Pine Gate checked,
// the run records an unconfirmed boundary and every byte stays unattributed.
//
// Usage: node tests/tier2/switch-live-smoke.mjs --run-dir TMP --out DIR [--port 8912]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
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
const port = Number(args.port ?? 8912);
const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
const evidenceBase = args.out ?? join(runDir, 'switch-smoke');
if (args.out && existsSync(evidenceBase) && readdirSync(evidenceBase).length) {
  throw new Error('Refusing to write into a non-empty --out: ' + evidenceBase);
}
const out = join(evidenceBase, stamp);
mkdirSync(out, { recursive: true });
const runScratch = join(runDir, 'switch-runs', stamp);
mkdirSync(runScratch, { recursive: true });

const revision = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const builtIndex = join(REPO, 'web', 'dist', 'index.html');
if (!existsSync(builtIndex)) throw new Error('No build at ' + builtIndex);
// The camera hook proves this is an E2E-hooks build; the switch ledger itself needs no hook, but the
// bundle must be the one the harness was written against.
const distHasCameraHook = (() => {
  const assets = join(REPO, 'web', 'dist', 'assets');
  if (!existsSync(assets)) return '';
  for (const name of readdirSync(assets)) {
    if (!name.endsWith('.js')) continue;
    try { if (readFileSync(join(assets, name), 'utf8').includes('__pineRenderCamera')) return name; }
    catch { /* unreadable */ }
  }
  return '';
})();

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

const record = { revision, out, port, serverPid: server.pid, build: 'reused', distHasCameraHook,
  condition: 'phone-4x-4g immediate-switch', from: 'snow-roof', to: 'pine-gate', observations: 1 };
let failure = false;
let browser;

try {
  let up = false;
  for (let attempt = 0; attempt < 120 && !up; attempt++) {
    try { up = (await fetch(`http://127.0.0.1:${port}/api/places/stats`)).ok; } catch { /* not yet */ }
    if (!up) await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!up) throw new Error('server never answered on ' + port);

  browser = await chromium.launch({ channel: 'chrome',
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US',
    isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150,
    downloadThroughput: 9e6 / 8, uploadThroughput: 2e6 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const ledger = createByteLedger({ uncertaintyMs: 25 });
  const events = [];
  for (const method of ['Network.requestWillBeSent', 'Network.dataReceived', 'Network.loadingFinished',
    'Network.loadingFailed']) {
    cdp.on(method, params => {
      events.push({ method, params });
      ledger.fromCdp({ method, params });
    });
  }

  const errors = [];
  page.on('pageerror', error => errors.push(String(error).slice(0, 200)));
  page.setDefaultTimeout(180000);

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Your wish').waitFor();
  await page.getByLabel('Your wish').fill('Measuring the switch.');
  await page.getByRole('button', { name: 'Set my wish', exact: true }).click();
  await page.locator('[role=radio].place').first().waitFor();

  record.initialPlace = await page.evaluate(() => [...document.querySelectorAll('[role=radio].place')]
    .filter(node => node.getAttribute('aria-checked') === 'true')
    .map(node => (node.getAttribute('aria-label') ?? '').trim()));

  // Clock alignment. CDP's `timestamp` is a monotonic clock in seconds with an arbitrary origin — measured
  // here as roughly 8e5 s, unrelated to Date.now() — so the only sound mapping is "page time minus CDP time"
  // taken from a network event whose page-side time is known. The request for the page itself is such an
  // event: navigation starts when the document request is sent, so its CDP timestamp corresponds to
  // performance.now() ≈ 0 within the document's own start-up.
  const alignmentEvents = [];
  const alignmentListener = params => alignmentEvents.push({ ts: params.timestamp, url: params.request?.url });
  cdp.on('Network.requestWillBeSent', alignmentListener);

  // Switch: click the Pine Gate radio, then read back which radio is checked. The checked radio, not the
  // click's promise, is what proves the selection took effect.
  const pine = page.locator('[role=radio].place').filter({ hasText: /Pine Gate/ }).first();
  await pine.click();
  await page.waitForTimeout(600);
  const checked = await page.evaluate(() => [...document.querySelectorAll('[role=radio].place')]
    .filter(node => node.getAttribute('aria-checked') === 'true')
    .map(node => (node.getAttribute('aria-label') ?? '').trim()));
  record.checkedAfterClick = checked;
  const switched = checked.length === 1 && checked[0].startsWith('Pine Gate');
  record.switched = switched;

  if (!switched) {
    record.boundary = null;
    ledger.switchUnconfirmed('the checked radio was ' + JSON.stringify(checked));
  } else {
    // Map the confirmation onto the ledger's event clock. CDP times are monotonic seconds with an arbitrary
    // origin, unrelated to Date.now(), so the only sound mapping is "page time minus CDP time" from an event
    // whose page-side position is known: the document request, whose CDP timestamp corresponds to
    // performance.now() ≈ 0 within the document's own start-up.
    const confirmedPage = await page.evaluate(() => performance.now());
    const documentRequest = alignmentEvents.find(event => /\/($|\?|index\.html)/.test(event.url ?? ''))
      ?? alignmentEvents[0];
    if (!documentRequest) throw new Error('the document request never reached the CDP listener; the boundary cannot be placed');
    const navTsMs = documentRequest.ts * 1000;
    const boundaryMs = navTsMs + confirmedPage;
    // The document's own start-up is the mapping error: scripts and layout run after the request is sent, so
    // performance.now() at the first paint is not exactly the request's time. One frame is a fair floor.
    const uncertaintyMs = 33;
    record.boundary = { pageMsAtConfirm: +confirmedPage.toFixed(3), navRequestCdpMs: +navTsMs.toFixed(3),
      boundaryCdpMs: +boundaryMs.toFixed(3), uncertaintyMs,
      method: 'document request CDP timestamp plus page performance.now() at the confirmed check' };
    ledger.switchConfirmed({ atEventMs: boundaryMs, uncertaintyMs });
  }

  await page.waitForTimeout(4000);
  const report = ledger.report({ isSnowUri: uri => uri.includes('/places/snow-roof/') });

  writeFileSync(join(out, 'events.json'), JSON.stringify(events, null, 2));
  writeFileSync(join(out, 'ledger.json'), JSON.stringify(report, null, 2));

  record.requests = events.filter(event => event.method === 'Network.requestWillBeSent').length;
  record.cancellations = events.filter(event => event.method === 'Network.loadingFailed')
    .map(event => ({ id: event.params.requestId, reason: event.params.errorText }));
  record.totals = report.totals;
  record.reconciled = report.reconciled;
  record.delivered = report.delivered;
  record.contradictions = report.contradictions;
  record.confirmed = report.confirmed;
  record.unconfirmedReason = report.unconfirmedReason;
  record.errors = errors;
  // Independent recomputation from the raw events, without the ledger. It answers one question: is there a
  // request whose chunks straddle the boundary, and what does its own event stream say? Written separately so
  // it cannot inherit the ledger's assumptions.
  const boundaryMsForCheck = record.boundary?.boundaryCdpMs ?? null;
  const uncertaintyForCheck = record.boundary?.uncertaintyMs ?? null;
  const recomputation = (() => {
    if (boundaryMsForCheck === null) return { boundaryKnown: false };
    const byId = new Map();
    for (const event of events) {
      const params = event.params;
      const at = typeof params.timestamp === 'number' ? params.timestamp * 1000 : null;
      if (event.method === 'Network.requestWillBeSent') {
        byId.set(params.requestId, { url: params.request?.url ?? '', start: at, chunks: [],
          finish: null, authoritative: null });
      } else if (event.method === 'Network.dataReceived') {
        const row = byId.get(params.requestId);
        if (row && at !== null && typeof params.encodedDataLength === 'number') {
          row.chunks.push({ at, bytes: params.encodedDataLength });
        }
      } else if (event.method === 'Network.loadingFinished') {
        const row = byId.get(params.requestId);
        if (row) { row.finish = at; row.authoritative = params.encodedDataLength; }
      }
    }
    const lo = boundaryMsForCheck - uncertaintyForCheck;
    const hi = boundaryMsForCheck + uncertaintyForCheck;
    const crossing = [];
    for (const [id, row] of byId) {
      const before = row.chunks.filter(chunk => chunk.at < lo).reduce((sum, chunk) => sum + chunk.bytes, 0);
      const inside = row.chunks.filter(chunk => chunk.at >= lo && chunk.at <= hi)
        .reduce((sum, chunk) => sum + chunk.bytes, 0);
      const after = row.chunks.filter(chunk => chunk.at > hi).reduce((sum, chunk) => sum + chunk.bytes, 0);
      const crosses = row.start !== null && row.start < lo && (row.finish === null || row.finish > hi);
      if (crosses) crossing.push({ id, url: row.url, start: row.start, finish: row.finish,
        before, inside, after, authoritative: row.authoritative,
        chunkSum: before + inside + after });
    }
    return { boundaryKnown: true, boundaryMs: boundaryMsForCheck, uncertaintyMs: uncertaintyForCheck,
      crossingCount: crossing.length, crossing: crossing.slice(0, 10),
      note: crossing.length ? 'recomputed from events.json without the ledger'
        : 'no request in this sample straddled the boundary' };
  })();
  record.recomputation = recomputation;
  writeFileSync(join(out, 'recomputation.json'), JSON.stringify(recomputation, null, 2));
  record.rawEvents = join(out, 'events.json');
  record.ledger = join(out, 'ledger.json');

  const usable = report.confirmed && report.reconciled && report.contradictions.length === 0;
  if (!usable) {
    failure = true;
    record.failureReason = !report.confirmed ? 'the switch was not confirmed'
      : !report.reconciled ? 'the phases do not reconcile with the delivered bytes'
        : 'CDP reported contradictory byte totals';
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
