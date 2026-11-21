import { expect, test } from 'vitest';
import { bellLaneChimes } from '../../../web/src/engine/places/bell-lane-chime.ts';

const at = (hour: number, minute = 0, day = 21) => new Date(2026, 10, day, hour, minute);

test('the same calling hour does not repeat after another timer or a new entry', () => {
  const claim = bellLaneChimes();
  expect(claim(at(6, 1), false, true)).toBe(false);
  expect(claim(at(6, 2), true, true)).toBe(true);
  expect(claim(at(6, 4), true, true)).toBe(false);
  expect(claim(at(6, 8), false, true)).toBe(false);
  expect(claim(at(6, 12), true, true)).toBe(false);
  expect(claim(at(7, 1), true, true)).toBe(false);
  expect(claim(at(18, 1), true, true)).toBe(true);
  expect(claim(at(6, 1, 22), true, true)).toBe(true);
});

test('a call that occurred while muted is skipped when sound returns', () => {
  const claim = bellLaneChimes();
  expect(claim(at(17, 59), true, true)).toBe(false);
  expect(claim(at(18, 1), true, false)).toBe(false);
  expect(claim(at(18, 3), true, true)).toBe(false);
  expect(claim(at(6, 1, 22), true, true)).toBe(true);
});
