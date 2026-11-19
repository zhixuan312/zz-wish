import { describe, expect, it } from 'vitest';
import { dayPart, musicBucket } from '../../../shared/dayPart.ts';

const at = (hour: number, minute = 0) => new Date(2026, 10, 19, hour, minute, 0, 0);

describe('day part', () => {
  it('names each part at its first minute and its last', () => {
    const cases: [number, string][] = [
      [5, 'dawn'], [7, 'dawn'], [8, 'morning'], [10, 'morning'], [11, 'midday'],
      [13, 'midday'], [14, 'afternoon'], [16, 'afternoon'], [17, 'dusk'], [18, 'dusk'],
      [19, 'night'], [23, 'night'], [0, 'night'], [4, 'night'],
    ];
    for (const [hour, part] of cases) expect(dayPart(at(hour)), `${hour}:00`).toBe(part);
  });

  it('turns over on the hour, not before', () => {
    expect(dayPart(at(4, 59))).toBe('night');
    expect(dayPart(at(5, 0))).toBe('dawn');
    expect(dayPart(at(7, 59))).toBe('dawn');
    expect(dayPart(at(8, 0))).toBe('morning');
    expect(dayPart(at(18, 59))).toBe('dusk');
    expect(dayPart(at(19, 0))).toBe('night');
  });

  it('maps every part to exactly one music bucket', () => {
    expect(musicBucket('dawn')).toBe('day');
    expect(musicBucket('morning')).toBe('day');
    expect(musicBucket('midday')).toBe('day');
    expect(musicBucket('afternoon')).toBe('golden');
    expect(musicBucket('dusk')).toBe('golden');
    expect(musicBucket('night')).toBe('night');
  });
});
