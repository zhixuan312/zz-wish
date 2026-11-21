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

  // Record request types from the start: the Document request is the only sound anchor for mapping the page
  // clock onto CDP's monotonic clock, and it is emitted during navigation. A listener registered after
  // `page.goto` would miss it — which is exactly how a lookalike Fetch became the anchor once.
  const alignmentEvents = [];
  cdp.on('Network.requestWillBeSent', params => alignmentEvents.push({ ts: params.timestamp,
    url: params.request?.url ?? '', type: params.type ?? params.request?.type ?? null }));

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

  // Install a capture listener on the real Pine radio before touching it, so the transition is observed
  // rather than inferred from a later read. It records the page clock at the click and at the first moment a
  // single aria-checked radio is Pine Gate.
  await page.evaluate(() => {
    const pine = [...document.querySelectorAll('[role=radio].place')]
      .find(node => (node.getAttribute('aria-label') ?? node.textContent ?? '').includes('Pine Gate'));
    window.__switchProbe = { clickedAt: null, firstCheckedAt: null, checkedLabel: null,
      samples: 0, stopped: false, pineFound: Boolean(pine) };
    if (!pine) return;
    pine.addEventListener('click', () => {
      window.__switchProbe.clickedAt = performance.now();
    }, true);
    const watch = () => {
      const probe = window.__switchProbe;
      if (probe.stopped || probe.firstCheckedAt !== null) return;
      const checked = [...document.querySelectorAll('[role=radio].place')]
        .filter(node => node.getAttribute('aria-checked') === 'true');
      if (checked.length === 1
        && (checked[0].getAttribute('aria-label') ?? checked[0].textContent ?? '').includes('Pine Gate')) {
        probe.firstCheckedAt = performance.now();
        probe.checkedLabel = (checked[0].getAttribute('aria-label') ?? '').trim();
        return;
      }
      probe.samples++;
      if (probe.samples < 3600) requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  const probeFound = await page.evaluate(() => window.__switchProbe?.pineFound === true);
  if (!probeFound) throw new Error('no Pine Gate radio was present before the click');

  const pine = page.locator('[role=radio].place').filter({ hasText: /Pine Gate/ }).first();
  await pine.click();
  // Wait for the observed transition, not a fixed sleep: the probe stops only when the checked radio becomes
  // Pine Gate, and a timeout is a failed observation.
  let transitionObserved = true;
  try {
    await page.waitForFunction(() => window.__switchProbe?.firstCheckedAt !== null, null, { timeout: 30000 });
  } catch { transitionObserved = false; }
  const probe = await page.evaluate(() => { if (window.__switchProbe) window.__switchProbe.stopped = true;
    return window.__switchProbe ?? null; });
  record.switchProbe = probe;
  record.checkedAfterClick = probe?.checkedLabel ? [probe.checkedLabel] : [];
  const switched = transitionObserved && Boolean(probe?.checkedLabel?.startsWith('Pine Gate'));
  record.switched = switched;

  if (!switched) {
    record.boundary = null;
    ledger.switchUnconfirmed(transitionObserved
      ? 'the checked radio was ' + JSON.stringify(record.checkedAfterClick)
      : 'the checked radio never became Pine Gate within 30 s of the click');
  } else {
    // Map the observed transition onto the ledger's event clock. CDP's timestamp is a monotonic clock with an
    // arbitrary origin, so the mapping must come from the document request only — never from a lookalike
    // request, and never from Date.now().
    const documentRequest = alignmentEvents.find(event => event.type === 'Document');
    if (!documentRequest) {
      throw new Error('no Document request carried a type in the CDP stream; the boundary cannot be placed');
    }
    // CDP Performance.getMetrics gives NavigationStart and Timestamp on the same monotonic scale as
    // Network timestamps, which anchors performance.now() exactly. The page sample is bracketed by two CDP
    // round trips whose page clocks are read either side, so the offset carries a measured error.
    const metrics = (await cdp.send('Performance.getMetrics')).metrics ?? [];
    const metric = name => metrics.find(entry => entry.name === name)?.value ?? null;
    const navigationStart = metric('NavigationStart');
    const cdpTimestamp = metric('Timestamp');

    const sampleOffset = async () => {
      const beforeWall = Date.now();
      const pageMs = await page.evaluate(() => performance.now());
      const afterWall = Date.now();
      // Midpoint of the round trip, on the wall clock, paired with the page reading.
      return { pageMs, wallMs: (beforeWall + afterWall) / 2, bracketMs: afterWall - beforeWall };
    };
    const firstSample = await sampleOffset();
    await page.waitForTimeout(60);
    const secondSample = await sampleOffset();
    const offsetChange = Math.abs((secondSample.wallMs - secondSample.pageMs)
      - (firstSample.wallMs - firstSample.pageMs));
    const bracket = Math.max(firstSample.bracketMs, secondSample.bracketMs);

    // The document request's CDP time and NavigationStart both mark the document; their difference is the
    // anchor's own error.
    const documentAnchorError = navigationStart === null || cdpTimestamp === null ? null
      : Math.abs((documentRequest.ts - navigationStart) * 1000);
    const uncertaintyMs = Math.max(bracket, offsetChange, documentAnchorError ?? 0, 16);

    // The transition is bracketed by the click and the first checked read, both on the page clock. Use the
    // midpoint and let the uncertainty cover half the bracket.
    const clickedAt = probe.clickedAt;
    const firstCheckedAt = probe.firstCheckedAt;
    const bracketHalf = (firstCheckedAt - clickedAt) / 2;
    const boundaryPageMs = clickedAt + bracketHalf;
    const navTsMs = documentRequest.ts * 1000;
    const boundaryMs = navTsMs + boundaryPageMs;
    record.clockAlignment = { offsetMs: +((firstSample.wallMs + secondSample.wallMs) / 2
      - (firstSample.pageMs + secondSample.pageMs) / 2).toFixed(3),
      bracketMs: bracket, offsetChangeMs: +offsetChange.toFixed(3),
      navigationStart: navigationStart, cdpTimestamp: cdpTimestamp,
      documentAnchorErrorMs: documentAnchorError === null ? null : +documentAnchorError.toFixed(3),
      samples: [firstSample, secondSample],
      method: 'Performance.getMetrics NavigationStart/Timestamp anchors the document; page offset bracketed by two round trips' };
    record.boundary = { clickedPageMs: +clickedAt.toFixed(3), firstCheckedPageMs: +firstCheckedAt.toFixed(3),
      transitionBracketMs: +(firstCheckedAt - clickedAt).toFixed(3),
      documentRequestCdpMs: +navTsMs.toFixed(3), boundaryPageMs: +boundaryPageMs.toFixed(3),
      boundaryCdpMs: +boundaryMs.toFixed(3), uncertaintyMs: +uncertaintyMs.toFixed(3),
      method: 'document request anchor plus the midpoint of the observed click-to-checked bracket' };
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
