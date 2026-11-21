import { expect, test } from 'vitest';
import { bellLaneLocalHour, bellLaneShutterOffset, bellLaneShutterOpening, bellLaneSweepGain,
  bellLaneSweepOffset } from '../../../web/src/engine/places/bell-lane-dawn.ts';

const at = (hour: number, minute = 0) => new Date(2026, 10, 21, hour, minute);

test('the dawn sweep follows the opening east shutters and is absent in the other day parts', () => {
  const eastOpening = (date: Date) => bellLaneShutterOpening(bellLaneLocalHour(date) + bellLaneShutterOffset(2, 1));
  expect(eastOpening(at(5))).toBe(0);
  expect(bellLaneSweepGain(at(5))).toBe(0);
  expect(eastOpening(at(6, 10))).toBeGreaterThan(eastOpening(at(5, 40)));
  expect(bellLaneSweepGain(at(5, 40))).toBeGreaterThan(0);
  expect(bellLaneSweepGain(at(6, 10))).toBeGreaterThan(bellLaneSweepGain(at(5, 40)));
  expect(eastOpening(at(9))).toBe(1);
  for (const clock of [at(8), at(9), at(13), at(18), at(22)]) expect(bellLaneSweepGain(clock)).toBe(0);
});

test('the recording follows elapsed walk time and cannot start during a skip or at the court', () => {
  const duration = 7.31;
  expect(bellLaneSweepOffset(0, duration)).toBeNull();
  expect(bellLaneSweepOffset(2.25, duration)).toBe(0);
  expect(bellLaneSweepOffset(4, duration)).toBe(1.75);
  expect(bellLaneSweepOffset(9.6, duration)).toBeNull();
  expect(bellLaneSweepOffset(12, duration)).toBeNull();
  expect(bellLaneSweepOffset(30, duration)).toBeNull();
});
