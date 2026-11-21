// Synthetic event tests for the switch byte ledger.
//
// CDP reports every chunk with its own timestamp and encoded length, so the ledger places bytes by when they
// actually arrived rather than inferring a split from one total. These tests feed events in the order a
// browser would deliver them and pin each rule without a browser.
import { expect, test } from 'vitest';
import { createByteLedger } from './switch-byte-accounting.mjs';

const SNOW = uri => /\/places\/snow-roof\//.test(uri);

test('the case from the review: 30 before, 10 inside, 50 after, total 100', () => {
  const ledger = createByteLedger({ uncertaintyMs: 10 });
  // Boundary at 1000 ms; the uncertainty window is (990, 1010).
  ledger.request({ id: 'r', url: '/places/snow-roof/snow-roof.glb.zstd', atMs: 100 });
  ledger.data({ id: 'r', atMs: 500, bytes: 30 });    // clearly before
  ledger.data({ id: 'r', atMs: 1000, bytes: 10 });   // inside the window
  ledger.data({ id: 'r', atMs: 1500, bytes: 50 });   // clearly after
  ledger.finished({ id: 'r', atMs: 1600, encodedBytes: 100 });
  ledger.switchConfirmed({ atEventMs: 1000, uncertaintyMs: 10 });

  const { totals, rows, reconciled } = ledger.report({ isSnowUri: SNOW });
  expect(totals.preSwitchSnowDone).toBe(30);
  expect(totals.snowContinuedAfterSwitch).toBe(50);
  expect(totals.unattributed).toBe(20);            // the 10 inside the window + the 10 residual
  expect(totals.all).toBe(100);
  expect(reconciled).toBe(true);
  // 30 + 10 + 50 = 90 chunks against an authoritative 100, so the residual is 10 and it is unattributed
  // because the request has chunks on both sides of the window.
  expect(rows[0].residual).toBe(10);
  expect(rows[0].insideWindowBytes).toBe(10);
  expect(rows[0].note).toMatch(/residual has no timestamp|cannot be placed/);
});

test('a start inside the window does not let its chunks plus residual exceed the authoritative total', () => {
  // Case from the review: start 100 (inside 95–105), one chunk at 150, authoritative 100. The request must
  // contribute exactly 100, not 100 + 10.
  const ledger = createByteLedger({ uncertaintyMs: 5 });
  ledger.request({ id: 'r', url: '/places/snow-roof/x.ktx2', atMs: 100 });
  ledger.data({ id: 'r', atMs: 150, bytes: 90 });
  ledger.finished({ id: 'r', atMs: 200, encodedBytes: 100 });
  ledger.switchConfirmed({ atEventMs: 100, uncertaintyMs: 5 });
  const { totals, delivered, reconciled } = ledger.report({ isSnowUri: SNOW });
  expect(totals.all).toBe(100);
  expect(totals.unattributed).toBe(100);
  expect(delivered).toBe(100);
  expect(reconciled).toBe(true);
});

test('a crossing request keeps its observed chunks on their side and leaves the residual unattributed', () => {
  // Case from the review: start 20 (before), one chunk at 80 (before) for 90, authoritative 100 at finish
  // 200 (after). The 90 observed bytes are pre-switch; the unobserved 10 could have arrived at any time, so
  // they are not credited to pre.
  const ledger = createByteLedger({ uncertaintyMs: 5 });
  ledger.request({ id: 'r', url: '/places/snow-roof/x.ktx2', atMs: 20 });
  ledger.data({ id: 'r', atMs: 80, bytes: 90 });
  ledger.finished({ id: 'r', atMs: 200, encodedBytes: 100 });
  ledger.switchConfirmed({ atEventMs: 100, uncertaintyMs: 5 });
  const { totals, reconciled } = ledger.report({ isSnowUri: SNOW });
  expect(totals.preSwitchSnowDone).toBe(90);
  expect(totals.unattributed).toBe(10);
  expect(totals.all).toBe(100);
  expect(reconciled).toBe(true);
});

test('a residual follows its chunks only when the request lies wholly on one side', () => {
  const before = createByteLedger({ uncertaintyMs: 5 });
  before.request({ id: 'a', url: '/places/snow-roof/snow-roof.glb.zstd', atMs: 10 });
  before.data({ id: 'a', atMs: 20, bytes: 40 });
  before.finished({ id: 'a', atMs: 30, encodedBytes: 100 });   // 60 bytes never reported as chunks
  before.switchConfirmed({ atEventMs: 500, uncertaintyMs: 5 });
  const first = before.report({ isSnowUri: SNOW });
  expect(first.totals.preSwitchSnowDone).toBe(100);
  expect(first.totals.unattributed).toBe(0);
  expect(first.rows[0].residual).toBe(60);

  const after = createByteLedger({ uncertaintyMs: 5 });
  after.request({ id: 'b', url: '/places/snow-roof/hall-day.ktx2', atMs: 600 });
  after.data({ id: 'b', atMs: 700, bytes: 40 });
  after.finished({ id: 'b', atMs: 800, encodedBytes: 100 });
  after.switchConfirmed({ atEventMs: 500, uncertaintyMs: 5 });
  const second = after.report({ isSnowUri: SNOW });
  expect(second.totals.newSnowAfterSwitch).toBe(100);
});

test('chunks are placed by their own times, not by when the request started', () => {
  const ledger = createByteLedger({ uncertaintyMs: 5 });
  ledger.request({ id: 'a', url: '/places/snow-roof/court-day.ktx2', atMs: 100 });
  ledger.data({ id: 'a', atMs: 200, bytes: 200 });
  ledger.switchConfirmed({ atEventMs: 300, uncertaintyMs: 5 });
  ledger.data({ id: 'a', atMs: 400, bytes: 300 });
  ledger.finished({ id: 'a', atMs: 500, encodedBytes: 500 });
  const { totals } = ledger.report({ isSnowUri: SNOW });
  expect(totals.preSwitchSnowDone).toBe(200);
  expect(totals.snowContinuedAfterSwitch).toBe(300);
  expect(totals.all).toBe(500);
});

test('a start inside the window is never assumed to be an old request', () => {
  const ledger = createByteLedger({ uncertaintyMs: 20 });
  ledger.switchConfirmed({ atEventMs: 300, uncertaintyMs: 20 });
  ledger.request({ id: 'a', url: '/places/snow-roof/hall-dusk.ktx2', atMs: 310 });   // inside (280, 320)
  ledger.data({ id: 'a', atMs: 400, bytes: 80 });
  ledger.finished({ id: 'a', atMs: 450, encodedBytes: 80 });
  const { totals, rows } = ledger.report({ isSnowUri: SNOW });
  expect(totals.preSwitchSnowDone).toBe(0);
  expect(totals.snowContinuedAfterSwitch).toBe(0);
  expect(totals.unattributed).toBe(80);
  expect(rows[0].note).toMatch(/start lies inside the boundary window/);
});

test('a cancelled request keeps the bytes it delivered on each side', () => {
  const ledger = createByteLedger({ uncertaintyMs: 5 });
  ledger.request({ id: 'c', url: '/places/snow-roof/court-night.ktx2', atMs: 100 });
  ledger.data({ id: 'c', atMs: 150, bytes: 70 });
  ledger.switchConfirmed({ atEventMs: 200, uncertaintyMs: 5 });
  ledger.data({ id: 'c', atMs: 250, bytes: 30 });
  ledger.failed({ id: 'c', atMs: 260, reason: 'net::ERR_ABORTED' });
  const { totals, rows } = ledger.report({ isSnowUri: SNOW });
  expect(rows[0].failureText).toBe('net::ERR_ABORTED');
  expect(totals.preSwitchSnowDone).toBe(70);
  expect(totals.snowContinuedAfterSwitch).toBe(30);
  expect(totals.all).toBe(100);
});

test('an unconfirmed switch puts every byte in unattributed and still reconciles', () => {
  const ledger = createByteLedger();
  ledger.request({ id: 'a', url: '/places/snow-roof/snow-roof.glb.zstd', atMs: 100 });
  ledger.data({ id: 'a', atMs: 120, bytes: 500 });
  ledger.finished({ id: 'a', atMs: 200, encodedBytes: 500 });
  ledger.request({ id: 'p', url: '/places/pine-gate/pine-gate.glb', atMs: 300 });
  ledger.finished({ id: 'p', atMs: 400, encodedBytes: 800 });
  ledger.switchUnconfirmed('the radio click never reported a checked place');
  const { totals, confirmed, unconfirmedReason, reconciled } = ledger.report({ isSnowUri: SNOW });
  expect(confirmed).toBe(false);
  expect(unconfirmedReason).toMatch(/never reported a checked place/);
  expect(totals.unattributed).toBe(1300);
  expect(totals.all).toBe(1300);
  expect(reconciled).toBe(true);
});

test('a chunk without a timestamp is refused rather than placed', () => {
  const ledger = createByteLedger();
  ledger.request({ id: 'a', url: '/places/snow-roof/snow-roof.glb.zstd', atMs: 10 });
  expect(ledger.data({ id: 'a', bytes: 40 })).toBe(false);
  expect(ledger.data({ id: 'a', atMs: Number.NaN, bytes: 40 })).toBe(false);
  expect(ledger.data({ id: 'a', atMs: 20, bytes: 40 })).toBe(true);
  expect(ledger.bytesOf('a')).toBe(40);
});

test('a non-Snow residual is never dropped from the conservation sum', () => {
  // Found on a live run: /materials/*.jpg are not Snow Roof, and their residuals were counted in the row's
  // bytes but silently omitted from otherPlace, so the phases fell short of the delivered total.
  const ledger = createByteLedger({ uncertaintyMs: 5 });
  ledger.request({ id: 'img', url: '/materials/weathered-granite.jpg', atMs: 10 });
  ledger.data({ id: 'img', atMs: 20, bytes: 900 });
  ledger.finished({ id: 'img', atMs: 30, encodedBytes: 1200 });   // residual 300
  ledger.switchConfirmed({ atEventMs: 100, uncertaintyMs: 5 });
  const { totals, delivered, reconciled } = ledger.report({ isSnowUri: SNOW });
  expect(totals.otherPlace).toBe(900);
  expect(totals.unattributed).toBe(300);
  expect(totals.all).toBe(delivered);
  expect(reconciled).toBe(true);
});

test('chunks exceeding the authoritative total are quarantined, not partially placed', () => {
  const ledger = createByteLedger({ uncertaintyMs: 5 });
  ledger.request({ id: 'c', url: '/places/snow-roof/court-day.ktx2', atMs: 100 });
  ledger.data({ id: 'c', atMs: 150, bytes: 60 });
  ledger.data({ id: 'c', atMs: 160, bytes: 60 });     // 120 in chunks
  ledger.finished({ id: 'c', atMs: 200, encodedBytes: 100 });   // but CDP counted 100
  ledger.switchConfirmed({ atEventMs: 300, uncertaintyMs: 5 });
  const { totals, rows, contradictions, delivered, reconciled } = ledger.report({ isSnowUri: SNOW });
  expect(contradictions).toHaveLength(1);
  expect(rows[0].phase).toBe('contradiction');
  expect(rows[0].note).toMatch(/contradict/);
  // Only the authoritative total is conserved; no phase claims the excess.
  expect(totals.all).toBe(100);
  expect(totals.preSwitchSnowDone).toBe(0);
  expect(delivered).toBe(100);
  expect(reconciled).toBe(true);
});

test('the adapter never substitutes a decoded length for a missing encoded length', () => {
  const ledger = createByteLedger({ uncertaintyMs: 5 });
  ledger.fromCdp({ method: 'Network.requestWillBeSent',
    params: { requestId: 'r', timestamp: 0.1, request: { url: '/places/snow-roof/x.ktx2' } } });
  // encodedDataLength omitted; only the decoded dataLength is present.
  const accepted = ledger.fromCdp({ method: 'Network.dataReceived',
    params: { requestId: 'r', timestamp: 0.2, dataLength: 40 } });
  expect(accepted).toBe(false);
  expect(ledger.bytesOf('r')).toBe(0);
});

test('a duplicate finish never doubles a request, and no total is negative', () => {
  const ledger = createByteLedger({ uncertaintyMs: 5 });
  ledger.request({ id: 'a', url: '/places/snow-roof/snow-roof.glb.zstd', atMs: 10 });
  ledger.data({ id: 'a', atMs: 20, bytes: 20 });
  ledger.finished({ id: 'a', atMs: 30, encodedBytes: 100 });
  ledger.finished({ id: 'a', atMs: 35, encodedBytes: 100 });
  ledger.switchConfirmed({ atEventMs: 100, uncertaintyMs: 5 });
  const { totals } = ledger.report({ isSnowUri: SNOW });
  expect(totals.all).toBe(100);
  for (const value of Object.values(totals)) expect(value).toBeGreaterThanOrEqual(0);
  // A total smaller than the chunks seen is not a negative residual.
  const inverse = createByteLedger();
  inverse.request({ id: 'b', url: '/places/snow-roof/hall-day.ktx2', atMs: 10 });
  inverse.data({ id: 'b', atMs: 20, bytes: 60 });
  inverse.finished({ id: 'b', atMs: 30, encodedBytes: 40 });
  expect(inverse.report({ isSnowUri: SNOW }).rows[0].residual).toBe(0);
});

test('an unfinished request keeps its chunks on each side', () => {
  const ledger = createByteLedger({ uncertaintyMs: 5 });
  ledger.request({ id: 'a', url: '/places/snow-roof/court-dusk.ktx2', atMs: 100 });
  ledger.data({ id: 'a', atMs: 150, bytes: 25 });
  ledger.switchConfirmed({ atEventMs: 300, uncertaintyMs: 5 });
  ledger.data({ id: 'a', atMs: 350, bytes: 30 });
  const { totals } = ledger.report({ isSnowUri: SNOW });
  expect(totals.preSwitchSnowDone).toBe(25);
  expect(totals.snowContinuedAfterSwitch).toBe(30);
  expect(totals.all).toBe(55);
});

test('the phases always add back to the delivered bytes', () => {
  const ledger = createByteLedger({ uncertaintyMs: 10 });
  ledger.request({ id: 'a', url: '/places/snow-roof/snow-roof.glb.zstd', atMs: 50 });
  ledger.data({ id: 'a', atMs: 60, bytes: 300 });
  ledger.finished({ id: 'a', atMs: 120, encodedBytes: 300 });
  ledger.request({ id: 'b', url: '/places/snow-roof/hall-day.ktx2', atMs: 130 });
  ledger.data({ id: 'b', atMs: 200, bytes: 40 });
  ledger.switchConfirmed({ atEventMs: 300, uncertaintyMs: 10 });
  ledger.data({ id: 'b', atMs: 400, bytes: 60 });
  ledger.finished({ id: 'b', atMs: 420, encodedBytes: 100 });
  ledger.request({ id: 'p', url: '/places/pine-gate/pine-gate.glb', atMs: 350 });
  ledger.data({ id: 'p', atMs: 380, bytes: 700 });
  ledger.finished({ id: 'p', atMs: 500, encodedBytes: 700 });
  ledger.request({ id: 'n', url: '/places/snow-roof/altar-day.ktx2', atMs: 450 });
  ledger.data({ id: 'n', atMs: 455, bytes: 20 });
  ledger.finished({ id: 'n', atMs: 460, encodedBytes: 20 });

  const { totals, reconciled, delivered } = ledger.report({ isSnowUri: SNOW });
  expect(delivered).toBe(1120);
  expect(totals.all).toBe(1120);
  expect(reconciled).toBe(true);
  expect(totals.preSwitchSnowDone).toBe(340);          // 300 model + 40 of the hall map
  expect(totals.snowContinuedAfterSwitch).toBe(60);
  expect(totals.otherPlace).toBe(700);
  expect(totals.newSnowAfterSwitch).toBe(20);
  expect(totals.unattributed).toBe(0);
});

test('a real CDP-shaped event stream feeds the ledger through the adapter', () => {
  const ledger = createByteLedger({ uncertaintyMs: 5 });
  // The shapes below are the CDP payloads the browser emits, with seconds turned into milliseconds.
  ledger.fromCdp({
    method: 'Network.requestWillBeSent',
    params: { requestId: 'r1', timestamp: 0.1, request: { url: '/places/snow-roof/snow-roof.glb.zstd' } },
  });
  ledger.fromCdp({ method: 'Network.dataReceived',
    params: { requestId: 'r1', timestamp: 0.2, dataLength: 30, encodedDataLength: 30 } });
  // Finish at 0.4 s is after the boundary at 0.3 s, so this request crosses it: its 30 observed bytes are
  // pre-switch and the 70 bytes CDP counted but never reported as chunks cannot be placed.
  ledger.fromCdp({ method: 'Network.loadingFinished',
    params: { requestId: 'r1', timestamp: 0.4, encodedDataLength: 100 } });
  ledger.switchConfirmed({ atEventMs: 300, uncertaintyMs: 5 });
  const { totals, reconciled, delivered } = ledger.report({ isSnowUri: SNOW });
  expect(totals.preSwitchSnowDone).toBe(30);
  expect(totals.unattributed).toBe(70);
  expect(totals.all).toBe(100);
  expect(delivered).toBe(100);
  expect(reconciled).toBe(true);
});
