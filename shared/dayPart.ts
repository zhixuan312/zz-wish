// The hours of the day, as the world around the visitor changes them.
// Local time only: the visitor's own clock decides which part of day this is.

export type DayPart = 'dawn' | 'morning' | 'midday' | 'afternoon' | 'dusk' | 'night';
export type MusicBucket = 'day' | 'golden' | 'night';

// [start hour, part]: each part runs until the next start.
const PARTS: readonly (readonly [number, DayPart])[] = [
  [5, 'dawn'], [8, 'morning'], [11, 'midday'], [14, 'afternoon'], [17, 'dusk'], [19, 'night'],
] as const;

export function dayPart(date: Date): DayPart {
  const hour = date.getHours();
  // Walk backwards so an hour before the first start falls into the last part.
  for (let i = PARTS.length - 1; i >= 0; i--) if (hour >= PARTS[i][0]) return PARTS[i][1];
  return 'night';
}

// Three music beds cover the day: bright day, warm golden hour, and night.
export function musicBucket(part: DayPart): MusicBucket {
  if (part === 'night') return 'night';
  if (part === 'afternoon' || part === 'dusk') return 'golden';
  return 'day';
}
