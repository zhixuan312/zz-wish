// Synthetic event tests for the switch byte ledger.
//
// The ledger is fed events by hand, in the order a browser would deliver them, so each rule can be pinned
// without a browser: a request that straddles the boundary, one cancelled mid-flight, a boundary whose clock
// is uncertain, a click that never took effect, and the requirement that the phases always add back to the
// bytes the requests actually delivered.
import { expect, test } from 'vitest';
import { createByteLedger } from './switch-byte-accounting.mjs';

const SNOW = uri => /\/places\/snow-roof\//.test(uri);

test('a request finished before the switch is Snow bytes received before it', () => {
  const ledger = createByteLedger({ uncertaintyMs: 5 });
  ledger.request({ id: 'a', url: '/places/snow-roof/snow-roof.glb.zstd', atMs: 100 });
  ledger.data({ id: 'a', bytes: 40 });
  ledger.data({ id: 'a', bytes: 60 });
  ledger.finished({ id: 'a', atMs: 200, encodedBytes: 100 });
  ledger.request({ id: 'p', url: '/places/pine-gate/pine-gate.glb', atMs: 300 });
  ledger.finished({ id: 'p', atMs: 400, encodedBytes: 900 });
  ledger.switchConfirmed({ atEventMs: 500, uncertaintyMs: 5 });

  const { totals, rows } = ledger.report({ isSnowUri: SNOW });
  expect(totals.preSwitchSnowDone).toBe(100);
  expect(totals.otherPlace).toBe(900);
  expect(totals.snowContinuedAfterSwitch).toBe(0);
  expect(totals.newSnowAfterSwitch).toBe(0);
  expect(rows.find(row => row.id === 'a').phase).toBe('preSwitchSnowDone');
});

test('an authoritative length replaces the accumulated bytes, never adds to them', () => {
  const ledger = createByteLedger();
  ledger.request({ id: 'a', url: '/places/snow-roof/hall-day.ktx2', atMs: 10 });
  ledger.data({ id: 'a', bytes: 30 });
  ledger.data({ id: 'a', bytes: 30 });
  ledger.finished({ id: 'a', atMs: 40, encodedBytes: 55 });   // smaller than the sum: the only truth is 55
  expect(ledger.bytesOf('a')).toBe(55);
});

test('bytes arriving after the switch on an old request are not counted as pre-switch', () => {
  const ledger = createByteLedger({ uncertaintyMs: 10 });
  ledger.request({ id: 'a', url: '/places/snow-roof/court-day.ktx2', atMs: 100 });
  ledger.data({ id: 'a', bytes: 200 });
  ledger.switchConfirmed({ atEventMs: 300, uncertaintyMs: 10 });
  ledger.data({ id: 'a', bytes: 300 });
  ledger.finished({ id: 'a', atMs: 500, encodedBytes: 500 });

  const { totals, rows } = ledger.report({ isSnowUri: SNOW });
  // It started before the boundary and finished after it, so it cannot be called "done before".
  expect(totals.preSwitchSnowDone).toBe(0);
  expect(totals.snowContinuedAfterSwitch).toBe(500);
  expect(rows[0].phase).toBe('snowContinuedAfterSwitch');
});

test('a Snow request begun after the switch is new switch traffic', () => {
  const ledger = createByteLedger({ uncertaintyMs: 5 });
  ledger.switchConfirmed({ atEventMs: 300, uncertaintyMs: 5 });
  ledger.request({ id: 'n', url: '/places/snow-roof/altar-day.ktx2', atMs: 400 });
  ledger.finished({ id: 'n', atMs: 450, encodedBytes: 120 });
  const { totals } = ledger.report({ isSnowUri: SNOW });
  expect(totals.newSnowAfterSwitch).toBe(120);
  expect(totals.preSwitchSnowDone).toBe(0);
});

test('a request finishing inside the uncertainty window is unattributed, not guessed', () => {
  const ledger = createByteLedger({ uncertaintyMs: 20 });
  ledger.request({ id: 'a', url: '/places/snow-roof/hall-dusk.ktx2', atMs: 100 });
  ledger.switchConfirmed({ atEventMs: 300, uncertaintyMs: 20 });
  ledger.data({ id: 'a', bytes: 80 });
  ledger.finished({ id: 'a', atMs: 310, encodedBytes: 80 });   // inside (280, 320)

  const { totals, rows } = ledger.report({ isSnowUri: SNOW });
  expect(totals.unattributed).toBe(80);
  expect(totals.snowContinuedAfterSwitch).toBe(0);
  expect(rows[0].note).toMatch(/inside the boundary window/);
});

test('a cancelled request keeps the bytes it delivered and is reported, not dropped', () => {
  const ledger = createByteLedger({ uncertaintyMs: 5 });
  ledger.request({ id: 'c', url: '/places/snow-roof/court-night.ktx2', atMs: 100 });
  ledger.data({ id: 'c', bytes: 70 });
  ledger.switchConfirmed({ atEventMs: 200, uncertaintyMs: 5 });
  ledger.failed({ id: 'c', atMs: 260, reason: 'net::ERR_ABORTED' });

  const { totals, rows } = ledger.report({ isSnowUri: SNOW });
  const row = rows.find(entry => entry.id === 'c');
  expect(row.failureText).toBe('net::ERR_ABORTED');
  // Started before, failed after: its 70 bytes arrived on a request that outlived the boundary.
  expect(row.phase).toBe('snowContinuedAfterSwitch');
  expect(totals.snowContinuedAfterSwitch).toBe(70);
  expect(totals.unattributed).toBe(0);
});

test('an unconfirmed switch puts every byte in unattributed, with the reason', () => {
  const ledger = createByteLedger();
  ledger.request({ id: 'a', url: '/places/snow-roof/snow-roof.glb.zstd', atMs: 100 });
  ledger.finished({ id: 'a', atMs: 200, encodedBytes: 500 });
  ledger.request({ id: 'p', url: '/places/pine-gate/pine-gate.glb', atMs: 300 });
  ledger.finished({ id: 'p', atMs: 400, encodedBytes: 800 });
  ledger.switchUnconfirmed('the radio click never reported a checked place');

  const { totals, confirmed, unconfirmedReason } = ledger.report({ isSnowUri: SNOW });
  expect(confirmed).toBe(false);
  expect(unconfirmedReason).toMatch(/never reported a checked place/);
  expect(totals.unattributed).toBe(1300);
  expect(totals.preSwitchSnowDone).toBe(0);
  expect(totals.otherPlace).toBe(0);
  expect(totals.all).toBe(1300);
});

test('the phases always add back to what the requests delivered', () => {
  const ledger = createByteLedger({ uncertaintyMs: 10 });
  ledger.request({ id: 'a', url: '/places/snow-roof/snow-roof.glb.zstd', atMs: 50 });
  ledger.data({ id: 'a', bytes: 300 });
  ledger.finished({ id: 'a', atMs: 120, encodedBytes: 300 });
  ledger.request({ id: 'b', url: '/places/snow-roof/hall-day.ktx2', atMs: 130 });
  ledger.data({ id: 'b', bytes: 40 });
  ledger.switchConfirmed({ atEventMs: 300, uncertaintyMs: 10 });
  ledger.data({ id: 'b', bytes: 60 });
  ledger.finished({ id: 'b', atMs: 420, encodedBytes: 100 });
  ledger.request({ id: 'p', url: '/places/pine-gate/pine-gate.glb', atMs: 350 });
  ledger.finished({ id: 'p', atMs: 500, encodedBytes: 700 });
  ledger.request({ id: 'n', url: '/places/snow-roof/altar-day.ktx2', atMs: 450 });
  ledger.finished({ id: 'n', atMs: 460, encodedBytes: 20 });

  const { totals } = ledger.report({ isSnowUri: SNOW });
  const delivered = 300 + 100 + 700 + 20;
  expect(totals.all).toBe(delivered);
  expect(totals.preSwitchSnowDone).toBe(300);
  expect(totals.snowContinuedAfterSwitch).toBe(100);
  expect(totals.otherPlace).toBe(700);
  expect(totals.newSnowAfterSwitch).toBe(20);
  expect(totals.unattributed).toBe(0);
});

test('bytes are never counted from both event streams', () => {
  const ledger = createByteLedger();
  ledger.request({ id: 'a', url: '/places/snow-roof/snow-roof.glb.zstd', atMs: 10 });
  // Five dataReceived events, then the authoritative total.
  for (let index = 0; index < 5; index++) ledger.data({ id: 'a', bytes: 20 });
  ledger.finished({ id: 'a', atMs: 90, encodedBytes: 100 });
  // A duplicate finish must not double the row either.
  ledger.finished({ id: 'a', atMs: 95, encodedBytes: 100 });
  expect(ledger.bytesOf('a')).toBe(100);
  const { totals } = ledger.report({ isSnowUri: SNOW });
  expect(totals.all).toBe(100);
});

test('a request that never finishes is reported as still in flight', () => {
  const ledger = createByteLedger({ uncertaintyMs: 5 });
  ledger.request({ id: 'a', url: '/places/snow-roof/court-dusk.ktx2', atMs: 100 });
  ledger.data({ id: 'a', bytes: 55 });
  ledger.switchConfirmed({ atEventMs: 300, uncertaintyMs: 5 });
  const { rows, totals } = ledger.report({ isSnowUri: SNOW });
  expect(rows[0].note).toMatch(/still in flight/);
  expect(totals.snowContinuedAfterSwitch).toBe(55);
});
