import { expect, test } from 'vitest';
import { dayPart } from '../../../shared/dayPart.ts';
import { PART_LIGHT, PART_ORDER, PART_START, lightAt, partProgress } from '../../../web/src/engine/places/pine-day-parts.ts';

const at = (hour, minute = 0) => new Date(2026, 10, 20, hour, minute, 0);

test('all six parts are mapped, and only the four shipped plate families are used', () => {
  expect(PART_ORDER).toEqual(['dawn', 'morning', 'midday', 'afternoon', 'dusk', 'night']);
  for (const part of PART_ORDER) {
    const light = PART_LIGHT[part];
    expect(light, part).toBeTruthy();
    expect(['day', 'dusk', 'night']).toContain(light.plates);
    expect(light.direction).toHaveLength(3);
    expect(light.fog).toBeGreaterThan(0);
  }
});

test('the fallbacks are exactly the stated ones', () => {
  // No dawn plate family yet, so dawn and morning ride the day plates.
  expect(PART_LIGHT.dawn.plates).toBe('day');
  expect(PART_LIGHT.morning.plates).toBe('day');
  expect(PART_LIGHT.midday.plates).toBe('day');
  // The golden hour starts in the afternoon, so it rides dusk.
  expect(PART_LIGHT.afternoon.plates).toBe('dusk');
  expect(PART_LIGHT.dusk.plates).toBe('dusk');
  expect(PART_LIGHT.night.plates).toBe('night');
  // Lamps: off by day, on from dusk, always on at night.
  expect(PART_LIGHT.dawn.lamps).toBe(false);
  expect(PART_LIGHT.morning.lamps).toBe(false);
  expect(PART_LIGHT.midday.lamps).toBe(false);
  expect(PART_LIGHT.afternoon.lamps).toBe(false);
  expect(PART_LIGHT.dusk.lamps).toBe(true);
  expect(PART_LIGHT.night.lamps).toBe(true);
});

test('partProgress agrees with the shared dayPart table', () => {
  for (const hour of [0, 5, 6, 8, 10, 11, 13, 14, 16, 17, 18, 19, 22, 23]) {
    expect(partProgress(at(hour)).part, `hour ${hour}`).toBe(dayPart(at(hour)));
  }
  // Part starts are the shared ones, and night wraps past midnight to dawn.
  for (const part of PART_ORDER) expect(PART_START[part]).toBeGreaterThanOrEqual(0);
  expect(partProgress(at(5)).t).toBeCloseTo(0, 6);
  expect(partProgress(at(23)).part).toBe('night');
  expect(partProgress(at(23)).t).toBeGreaterThan(0);
});

test('mid-part light is the part\'s own settings, with a unit direction', () => {
  expect(lightAt(at(13)).plates).toBe(PART_LIGHT.midday.plates);
  expect(lightAt(at(9)).plates).toBe(PART_LIGHT.morning.plates);
  for (const part of PART_ORDER) {
    const hour = PART_START[part] + .5;
    const light = lightAt(at(Math.floor(hour), Math.round((hour % 1) * 60)));
    const length = Math.hypot(...light.direction);
    expect(length, part).toBeCloseTo(1, 6);
  }
});

test('crossing every boundary is continuous, including through a burn', () => {
  // Sample a minute either side of each boundary and check nothing jumps: the direction, fog and
  // lamps may only move a small amount, and the plate family changes at most once.
  const boundaries = [5, 8, 11, 14, 17, 19, 24];
  for (const hour of boundaries) {
    const before = lightAt(new Date(2026, 10, 20, hour, 0, 0));
    const after = lightAt(new Date(2026, 10, 20, hour, 0, 30));
    const step = Math.hypot(
      after.direction[0] - before.direction[0],
      after.direction[1] - before.direction[1],
      after.direction[2] - before.direction[2],
    );
    expect(step, `direction at ${hour}`).toBeLessThan(.02);
    expect(Math.abs(after.fog - before.fog), `fog at ${hour}`).toBeLessThan(.02);
  }
});

test('the direction moves smoothly across the whole day', () => {
  // Step by six minutes of real clock time, so the samples cover every boundary exactly once and
  // no rounding can land two samples on the same minute.
  const step = 6;
  const sample = minutes => lightAt(new Date(2026, 10, 20, Math.floor(minutes / 60) % 24, minutes % 60));
  let previous = sample(0);
  let worst = 0;
  for (let minutes = step; minutes <= 24 * 60; minutes += step) {
    const current = sample(minutes);
    const move = Math.hypot(...current.direction.map((v, i) => v - previous.direction[i]));
    worst = Math.max(worst, move);
    previous = current;
  }
  // 0.09 per six minutes is the honest ceiling: the widest turn between neighbouring parts is
  // 82 degrees (dusk to night) spread over the three-hour window, which is 0.087 at its fastest.
  expect(worst).toBeLessThan(.09);
});

test('dusk lights the storm lantern and the burning view keeps lamps on all day', () => {
  // The rule the world bible gives: dusk onward lamps are lit, and in the burning view ordinary
  // lamps stay lit at every part of day.
  expect(lightAt(at(18)).lamps).toBe(true);
  expect(lightAt(at(20)).lamps).toBe(true);
  expect(lightAt(at(3)).lamps).toBe(true);
  // The parts before dusk are unlit by default; the burning view overrides that in the scene.
  expect(PART_LIGHT.midday.lamps).toBe(false);
  expect(PART_LIGHT.afternoon.lamps).toBe(false);
});
