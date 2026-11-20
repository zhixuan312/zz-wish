// Which ambient layers Pine Gate should have at a given part of the day.
// Wind, spring water, insects and frogs are synthesised; the far temple bell, roosters,
// ox bells and evening village voices are real recordings. Both kinds obey this table.
import type { DayPart } from '../../../../shared/dayPart.ts';

export type AmbientLayer =
  | 'wind' | 'spring' | 'insects' | 'frogs'
  | 'rooster' | 'templeBell' | 'oxBell' | 'villageVoices';

// Layers that are always present: the pine wind high in the trees and the running spring.
const ALWAYS: readonly AmbientLayer[] = ['wind', 'spring'];

// Real recordings, each a one-shot heard now and then rather than a bed.
export const RECORDED: readonly AmbientLayer[] = ['templeBell', 'rooster', 'oxBell', 'villageVoices'];

// The world bible's schedule:
//   roosters   dawn and morning
//   temple bell morning and dusk, one to three strikes minutes apart
//   ox bell    morning to afternoon, occasional
//   frogs      dusk and night
//   insects    afternoon to night
//   voices     dusk only, far and quiet, no discernible words
const BY_PART: Record<DayPart, readonly AmbientLayer[]> = {
  dawn: ['rooster'],
  morning: ['rooster', 'templeBell', 'oxBell'],
  midday: ['oxBell'],
  afternoon: ['oxBell', 'insects'],
  dusk: ['templeBell', 'frogs', 'insects', 'villageVoices'],
  night: ['frogs', 'insects'],
};

/** Every layer that should be sounding at this part of the day, always-on ones included. */
export function layersFor(part: DayPart): Set<AmbientLayer> {
  return new Set<AmbientLayer>([...ALWAYS, ...(BY_PART[part] ?? [])]);
}

/** Only the one-shot recordings enabled now; a loader uses this to fetch nothing it cannot use. */
export function recordedLayersFor(part: DayPart): RecordedLayer[] {
  const enabled = layersFor(part);
  return RECORDED.filter(layer => enabled.has(layer)) as RecordedLayer[];
}

export type RecordedLayer = 'templeBell' | 'rooster' | 'oxBell' | 'villageVoices';

// How often an occasional sound may arrive, in seconds. Wide and random so nothing sounds
// like a loop; a scheduler picks uniformly between the bounds each time.
export const INTERVALS: Record<RecordedLayer, readonly [number, number]> = {
  templeBell: [150, 420],
  rooster: [70, 200],
  oxBell: [50, 190],
  villageVoices: [120, 300],
};

// Relative level per layer, all under the music. Distant things sit quieter.
export const LEVELS: Record<AmbientLayer, number> = {
  wind: .006, spring: .004, insects: .0035, frogs: .004,
  templeBell: .010, rooster: .006, oxBell: .005, villageVoices: .0045,
};

/** A uniform random wait inside the layer's interval, in seconds. */
export function nextDelay(layer: RecordedLayer, random: () => number = Math.random): number {
  const [min, max] = INTERVALS[layer];
  return min + (max - min) * random();
}
