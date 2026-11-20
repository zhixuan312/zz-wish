import { expect, test } from 'vitest';
import { INTERVALS, LEVELS, layersFor, nextDelay, recordedLayersFor, RECORDED } from '../../../web/src/engine/places/pine-ambience.ts';

const sorted = (set) => [...set].sort();

test('wind and spring run the whole day', () => {
  for (const part of ['dawn', 'morning', 'midday', 'afternoon', 'dusk', 'night']) {
    const layers = layersFor(part);
    expect(layers.has('wind'), part).toBe(true);
    expect(layers.has('spring'), part).toBe(true);
  }
});

test('each part enables exactly the sounds the world bible gives it', () => {
  expect(sorted(layersFor('dawn'))).toEqual(['spring', 'rooster', 'wind'].sort());
  expect(sorted(layersFor('morning')))
    .toEqual(['spring', 'wind', 'rooster', 'templeBell', 'oxBell'].sort());
  expect(sorted(layersFor('midday'))).toEqual(['spring', 'wind', 'oxBell'].sort());
  expect(sorted(layersFor('afternoon'))).toEqual(['spring', 'wind', 'oxBell', 'insects'].sort());
  expect(sorted(layersFor('dusk')))
    .toEqual(['spring', 'wind', 'templeBell', 'frogs', 'insects', 'villageVoices'].sort());
  expect(sorted(layersFor('night'))).toEqual(['spring', 'wind', 'frogs', 'insects'].sort());
});

test('recorded and synthesised layers are separated, and only enabled ones are fetched', () => {
  // The four recorded layers are exactly the ones that carry a recording.
  expect(sorted(RECORDED)).toEqual(['oxBell', 'rooster', 'templeBell', 'villageVoices'].sort());
  // Dawn fetches only the rooster; dusk fetches the bell and the voices, never the rooster.
  expect(recordedLayersFor('dawn')).toEqual(['rooster']);
  expect(sorted(recordedLayersFor('dusk'))).toEqual(['villageVoices', 'templeBell'].sort());
  expect(recordedLayersFor('night')).toEqual([]);
  // A synthesised layer is never in the recorded list.
  for (const part of ['dawn', 'morning', 'midday', 'afternoon', 'dusk', 'night']) {
    expect(recordedLayersFor(part)).not.toContain('insects');
    expect(recordedLayersFor(part)).not.toContain('frogs');
  }
});

test('occasional sounds arrive at wide, uneven intervals', () => {
  for (const layer of RECORDED) {
    const [min, max] = INTERVALS[layer];
    // Minutes apart, never seconds: nothing should feel like a loop.
    expect(min, layer).toBeGreaterThanOrEqual(50);
    expect(max, layer).toBeGreaterThan(min * 1.8);
  }
  // A fixed random source lands where expected, and the spread is wide.
  expect(nextDelay('rooster', () => 0)).toBe(INTERVALS.rooster[0]);
  expect(nextDelay('rooster', () => 1)).toBe(INTERVALS.rooster[1]);
  expect(nextDelay('rooster', () => .5)).toBe((INTERVALS.rooster[0] + INTERVALS.rooster[1]) / 2);
});

test('every layer sits under the music, and distant things are quieter', () => {
  for (const level of Object.values(LEVELS)) expect(level).toBeGreaterThan(0);
  for (const level of Object.values(LEVELS)) expect(level).toBeLessThan(.05);
  // The far temple bell is the most present recording; village voices stay quiet.
  expect(LEVELS.templeBell).toBeGreaterThan(LEVELS.rooster);
  expect(LEVELS.villageVoices).toBeLessThan(LEVELS.templeBell);
});
