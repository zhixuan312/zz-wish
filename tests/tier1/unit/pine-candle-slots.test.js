import { expect, test } from 'vitest';
import { candleSlots, createCandleSlots, SHELF_DEPTH, SHELF_WIDTH } from '../../../web/src/engine/places/pine-candle-slots.js';

test('successive candles take different places, in a fixed order', () => {
  const slots = createCandleSlots();
  const taken = [slots.take(), slots.take(), slots.take()];
  expect(taken[0]).toEqual([0, 0, 0]);
  expect(taken[1]).not.toEqual(taken[0]);
  expect(taken[2]).not.toEqual(taken[1]);
  expect(taken[2]).not.toEqual(taken[0]);
  // Fixed order: a fresh cursor gives the same sequence.
  const again = createCandleSlots();
  expect([again.take(), again.take(), again.take()]).toEqual(taken);
});

test('every place is distinct and fits the wick shelf', () => {
  const keys = new Set(candleSlots.map(([x, , z]) => `${x.toFixed(3)},${z.toFixed(3)}`));
  expect(keys.size).toBe(candleSlots.length);
  for (const [x, , z] of candleSlots) {
    expect(Math.abs(x)).toBeLessThan(SHELF_WIDTH / 2 - .02);
    expect(Math.abs(z)).toBeLessThan(SHELF_DEPTH / 2 - .02);
  }
});

test('the candle keeps its place while the next lighting moves on', () => {
  const slots = createCandleSlots();
  slots.take();
  // The lit candle still stands where it was placed.
  expect(candleSlots[0]).toEqual([0, 0, 0]);
  expect(slots.current()).toEqual(candleSlots[1]);
});

test('never runs past the last place', () => {
  const slots = createCandleSlots();
  for (let i = 0; i < candleSlots.length; i++) slots.take();
  expect(slots.current()).toEqual(candleSlots.at(-1));
  expect(slots.take()).toEqual(candleSlots.at(-1));
});
