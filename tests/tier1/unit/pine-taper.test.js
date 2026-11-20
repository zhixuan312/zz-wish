import { expect, test } from 'vitest';
import { TAPER_BEAT, taperHasReachedWick, taperPhase } from '../../../web/src/engine/places/pine-taper.js';

test('the taper enters from the shrine side before it reaches the wick', () => {
  expect(taperPhase(0)).toBe('entering');
  expect(taperPhase(TAPER_BEAT.entryEnd - .001)).toBe('entering');
  expect(taperPhase(TAPER_BEAT.entryEnd)).toBe('approaching');
  expect(taperHasReachedWick(TAPER_BEAT.entryEnd)).toBe(false);
});

test('the flame touches the wick before the catch, and holds there', () => {
  expect(taperHasReachedWick(TAPER_BEAT.contactEnd - .001)).toBe(false);
  expect(taperHasReachedWick(TAPER_BEAT.contactEnd)).toBe(true);
  expect(taperPhase(TAPER_BEAT.contactEnd)).toBe('at-wick');
  expect(taperPhase(TAPER_BEAT.contactHold - .001)).toBe('at-wick');
});

test('it withdraws and is snuffed before it leaves the frame', () => {
  expect(taperPhase(TAPER_BEAT.contactHold)).toBe('retreating');
  // Snuff happens on the way out, not after it has gone.
  expect(TAPER_BEAT.snuffAt).toBeLessThan(TAPER_BEAT.exitEnd);
  expect(taperPhase(TAPER_BEAT.snuffAt)).toBe('retreating');
  expect(taperPhase(TAPER_BEAT.exitEnd)).toBe('gone');
});

test('the beat is ordered and monotonic', () => {
  const order = ['entryEnd', 'contactStart', 'contactEnd', 'contactHold', 'retreatStart', 'retreatEnd', 'snuffAt', 'exitEnd'];
  const values = order.map((name) => TAPER_BEAT[name]);
  for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
  expect(TAPER_BEAT.exitEnd).toBeLessThan(1);
});
