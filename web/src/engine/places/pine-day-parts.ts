// The six parts of day, each mapped to the plate set Pine Gate draws and the light it uses.
//
// Today the place ships four plate families — day, dusk, lamp and night — so the six parts share
// them: dawn and morning ride the day plates, midday the day plates, afternoon and dusk the dusk
// plates. When S1 bakes a plate family per part, only this table changes.
import type { DayPart } from '../../../../shared/dayPart.ts';

export type PlateSet = 'day' | 'dusk' | 'night';

export interface PartLight {
  /** Which plate family and ambient lightmap set to draw. */
  plates: PlateSet;
  /** Sun or moon direction as a unit vector (x right, y up, z toward the viewer). */
  direction: readonly [number, number, number];
  /** Fog density multiplier against the place's authored base. */
  fog: number;
  /** Whether the ordinary lamps and the storm lantern are lit. */
  lamps: boolean;
}

// Fallbacks, stated per part so the table can be read without the shipped plate names:
//   dawn      -> day (there is no dawn family yet)
//   morning   -> day
//   midday    -> day
//   afternoon -> dusk (the golden hour begins here)
//   dusk      -> dusk
//   night     -> night
export const PART_LIGHT: Readonly<Record<DayPart, PartLight>> = Object.freeze({
  dawn: { plates: 'day', direction: [-.72, .28, -.63], fog: 1.45, lamps: false },
  morning: { plates: 'day', direction: [-.42, .66, -.62], fog: 1.15, lamps: false },
  midday: { plates: 'day', direction: [.06, .99, -.10], fog: 1, lamps: false },
  afternoon: { plates: 'dusk', direction: [.55, .48, -.68], fog: 1.05, lamps: false },
  dusk: { plates: 'dusk', direction: [.86, .10, -.50], fog: 1.15, lamps: true },
  night: { plates: 'night', direction: [-.36, .52, -.78], fog: 1.2, lamps: true },
});

// The hours each part starts, matching shared/dayPart.ts. Used only to interpolate between two
// parts across a boundary.
export const PART_START: Readonly<Record<DayPart, number>> = Object.freeze({
  dawn: 5, morning: 8, midday: 11, afternoon: 14, dusk: 17, night: 19,
});

export const PART_ORDER: readonly DayPart[] = Object.freeze([
  'dawn', 'morning', 'midday', 'afternoon', 'dusk', 'night',
]);

/**
 * How far into its own part the clock is, 0 at the start and 1 at the next part's start.
 * Night wraps past midnight, so its span runs from 19:00 to 05:00.
 */
export function partProgress(date: Date): { part: DayPart; t: number } {
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  let part: DayPart = 'night';
  for (const candidate of PART_ORDER) if (hour >= PART_START[candidate]) part = candidate;
  const start = PART_START[part];
  const next = PART_ORDER[(PART_ORDER.indexOf(part) + 1) % PART_ORDER.length];
  // Night's next boundary is dawn at 05:00 the following day.
  const end = next === 'dawn' && part === 'night' ? 24 + PART_START.dawn : PART_START[next];
  const span = end - start;
  return { part, t: Math.min(1, Math.max(0, (hour - start) / span)) };
}

/**
 * The light to draw at this moment. Inside a part this is the part's own settings; in the last
 * window of three hours centred on the boundary it eases into the next part, so crossing never
 * jumps, including during a burn. Three hours because the largest turn between two neighbouring
 * parts is 82 degrees (dusk to night); a shorter window swings the sun fast enough to read as a
 * jump rather than a change.
 */
export function lightAt(date: Date, window = 3): PartLight {
  // Work in absolute hours on a circular clock: the window straddles the boundary, so the eased
  // curve is the same function approached from either side and cannot jump when `part` flips.
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const boundaries = PART_ORDER.map((_, i) => {
    const part = PART_ORDER[i];
    const next = PART_ORDER[(i + 1) % PART_ORDER.length];
    const start = PART_START[part];
    const end = next === 'dawn' && part === 'night' ? 24 + PART_START.dawn : PART_START[next];
    return { part, next, start, end };
  });
  // Signed distance from this hour to a boundary: negative before it, positive after, on a clock
  // that wraps at 24 so the night-to-dawn edge behaves like any other.
  const signedTo = (h: number, edge: number) => ((h - edge + 36) % 24) - 12;
  let active = boundaries[0], activeDistance = Infinity;
  for (const b of boundaries) {
    const distance = signedTo(hour, b.end % 24);
    if (Math.abs(distance) < Math.abs(activeDistance)) { active = b; activeDistance = distance; }
  }
  const { part, next } = active;
  const a = PART_LIGHT[part], b = PART_LIGHT[next];
  // 0 at window/2 before the boundary, 1 at window/2 after it.
  const raw = (activeDistance + window / 2) / window;
  const clamped = Math.min(1, Math.max(0, raw));
  const k = clamped * clamped * (3 - 2 * clamped);
  const direction: [number, number, number] = [
    a.direction[0] + (b.direction[0] - a.direction[0]) * k,
    a.direction[1] + (b.direction[1] - a.direction[1]) * k,
    a.direction[2] + (b.direction[2] - a.direction[2]) * k,
  ];
  const length = Math.hypot(...direction) || 1;
  return {
    plates: k < .5 ? a.plates : b.plates,
    direction: [direction[0] / length, direction[1] / length, direction[2] / length],
    fog: a.fog + (b.fog - a.fog) * k,
    lamps: k < .5 ? a.lamps : b.lamps,
  };
}
