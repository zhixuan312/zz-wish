import { expect, test } from 'vitest';
import { COLORS, DEFAULT_COLOR } from '../../../shared/rules.ts';

test('a candle starts ivory, a red gauze lantern stays red', () => {
  expect(COLORS.candle[DEFAULT_COLOR.candle]).toBe(0xe9ddc3);
  expect(COLORS.shade[DEFAULT_COLOR.shade]).toBe(0xa82a1c);
  expect(COLORS.oil[DEFAULT_COLOR.oil]).toBe(0x8a5838);
});

test('Pine Gate and Snow Roof default correctly through their kinds', () => {
  // Pine Gate is a wax place, so its chooser is the candle.
  const pine = 'candle';
  const snow = 'shade';
  expect(COLORS[pine][DEFAULT_COLOR[pine]]).toBe(0xe9ddc3);
  expect(COLORS[snow][DEFAULT_COLOR[snow]]).toBe(0xa82a1c);
  // Switching back and forth reads the same mapping each time.
  for (let i = 0; i < 3; i++) {
    expect(COLORS[pine][DEFAULT_COLOR[pine]]).toBe(0xe9ddc3);
    expect(COLORS[snow][DEFAULT_COLOR[snow]]).toBe(0xa82a1c);
  }
});

test('the other colours stay available', () => {
  expect(COLORS.candle).toContain(0x8f1b12);
  expect(COLORS.candle).toContain(0xc8922e);
  expect(COLORS.candle).toHaveLength(3);
});
