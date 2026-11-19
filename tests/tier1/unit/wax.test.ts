import { expect, test } from 'vitest';
import { remainingFuel, waxCutHeight } from '../../../shared/wax.ts';

const cylinder = [{ y: 0, cx: 0, r: .02 }, { y: .12, cx: 0, r: .02 }];

test('cuts a cylinder continuously at the fuel left by the burn clock', () => {
  const duration = 600_000;
  expect([0, 300_000, 570_000, duration].map(elapsed =>
    waxCutHeight(cylinder, remainingFuel(elapsed, duration)))).toEqual([
    .12, .06, expect.closeTo(.006, 8), 0,
  ]);
  const before = waxCutHeight(cylinder, remainingFuel(300_000, duration));
  const after = waxCutHeight(cylinder, remainingFuel(300_001, duration));
  expect(after).toBeLessThan(before);
  expect(remainingFuel(-1000, duration)).toBe(1);
  expect(remainingFuel(duration + 1000, duration)).toBe(0);
});

test('keeps half the wax rather than half the height of an off-center tapered drawing', () => {
  // The doubling radius makes the upper part hold more wax than the lower part.
  const rows = [{ y: 0, cx: 0, r: .01 }, { y: .12, cx: .018, r: .02 }];
  const halfVolumeHeight = .12 * (Math.cbrt(4.5) - 1);
  expect(waxCutHeight(rows, .5)).toBeCloseTo(halfVolumeHeight, 7);
  expect(waxCutHeight(rows, .5)).toBeGreaterThan(.06);
});

test('continues through each join in a drawn profile', () => {
  const rows = [{ y: 0, cx: 0, r: .02 }, { y: .04, cx: .007, r: .02 }, { y: .12, cx: .02, r: .02 }];
  expect(waxCutHeight(rows, 1 / 3)).toBeCloseTo(.04, 8);
  expect(waxCutHeight(rows, .32)).toBeLessThan(.04);
  expect(waxCutHeight(rows, .34)).toBeGreaterThan(.04);
});
