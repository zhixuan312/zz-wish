// The six parts of day, each mapped to the plate set Pine Gate draws and the light it uses.
//
// Today the place ships four plate families — day, dusk, lamp and night — so the six parts share
// them: dawn and morning ride the day plates, midday the day plates, afternoon and dusk the dusk
// plates. When S1 bakes a plate family per part, only this table changes.
import type { DayPart } from '../../../../shared/dayPart.ts';

export type PlateSet = 'day' | 'dusk' | 'night';

export interface PartLight {
  /** The plate family this part belongs to; the dominant one inside a blend. */
  plates: PlateSet;
  /** During a transition between two different families, both and the eased weight between them. */
  plateMix?: { a: PlateSet; b: PlateSet; k: number } | null;
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
  // The window trails the boundary: the change happens during the last `window` hours of the part
  // that is ending, and reaches the next part exactly at its start. Centring it would put the
  // change inside the part that follows, which contradicts the table.
  // Pick the boundary nearest on the clock, then work from its signed distance. Centring the window
  // is what makes the curve continuous through the boundary: approaching from either side gives the
  // same k, so `part` flipping cannot restart the blend.
  const signedTo = (h: number, edge: number) => ((h - edge + 36) % 24) - 12;
  let active = boundaries[0], nearest = Infinity;
  for (const candidate of boundaries) {
    const distance = signedTo(hour, candidate.end % 24);
    if (Math.abs(distance) < Math.abs(nearest)) { active = candidate; nearest = distance; }
  }
  const { part, next } = active;
  void partProgress;
  const a = PART_LIGHT[part], b = PART_LIGHT[next];
  // 0 at window/2 before the boundary, 1 at window/2 after it, so both sides share one curve.
  const raw = (nearest + window / 2) / window;
  const clamped = Math.min(1, Math.max(0, raw));
  const k = clamped * clamped * (3 - 2 * clamped);
  const direction: [number, number, number] = [
    a.direction[0] + (b.direction[0] - a.direction[0]) * k,
    a.direction[1] + (b.direction[1] - a.direction[1]) * k,
    a.direction[2] + (b.direction[2] - a.direction[2]) * k,
  ];
  const length = Math.hypot(...direction) || 1;
  return {
    plates: a.plates,
    // Both plate families are handed back so the renderer can cross-fade them on this same weight.
    // Report a mix only while it is actually changing: at k=1 the later family has fully taken
    // over, and returning a mix there would make the next sample (a different boundary) look like
    // a jump from 1 to 0.
    plateMix: a.plates === b.plates || k >= 1 ? null : { a: a.plates, b: b.plates, k },
    direction: [direction[0] / length, direction[1] / length, direction[2] / length],
    fog: a.fog + (b.fog - a.fog) * k,
    // Lit whenever either side of the boundary is lit, so the storm lantern comes on as dusk
    // settles and stays on through the night; only a boundary with both sides unlit is dark.
    lamps: a.lamps || b.lamps,
  };
}

/**
 * The same six-part decision expressed in the shape `blendPlace` in scene.js consumes: n is how
 * far toward the night look, g the low-sun warmth, blue the blue-hour lift, lamp the lamplight,
 * haze the mist and elev the sun height. Placing it here keeps scene.js free of Pine Gate rules.
 */
export interface BlendInputs {
  n: number; g: number; blue: number; lamp: number; haze: number; elev: number; dawn: boolean;
}

// How each plate family reads through those inputs. A family is a look, not an hour.
const FAMILY: Readonly<Record<PlateSet, Omit<BlendInputs, 'dawn'>>> = Object.freeze({
  day: { n: 0, g: .12, blue: 0, lamp: 0, haze: 1.1, elev: .85 },
  dusk: { n: .55, g: 1, blue: .3, lamp: .9, haze: 1.15, elev: .12 },
  night: { n: 1, g: 0, blue: .32, lamp: 1, haze: 1.2, elev: 1 },
});

/** Blend inputs for the shared renderer, from the six-part table at this moment. */
export function blendInputsAt(date: Date, window = 3): BlendInputs {
  const light = lightAt(date, window);
  // Blend the two families' inputs with the same eased weight the light and fog use, so nothing
  // about the look changes in a step at the midpoint. Reading the family from `light.plates` alone
  // would jump n from .55 to 1 at the boundary; that was the visible hard cut.
  const hour = date.getHours() + date.getMinutes() / 60;
  // Pick the boundary by clock, not by the current part: `part` flips at the boundary, and choosing
  // the family from it would restart the blend from the new part's own look.
  const signedTo = (h: number, edge: number) => ((h - edge + 36) % 24) - 12;
  const edges = PART_ORDER.map((part, i) => {
    const next = PART_ORDER[(i + 1) % PART_ORDER.length];
    const edge = next === 'dawn' && part === 'night' ? 24 + PART_START.dawn : PART_START[next];
    return { part, next, edge };
  });
  let active = edges[0], nearest = Infinity;
  for (const candidate of edges) {
    const distance = signedTo(hour, candidate.edge % 24);
    if (Math.abs(distance) < Math.abs(nearest)) { active = candidate; nearest = distance; }
  }
  const a = FAMILY[PART_LIGHT[active.part].plates], b = FAMILY[PART_LIGHT[active.next].plates];
  // Two parts that share one plate family have nothing to cross-fade: reporting a weight between
  // them would be noise, because the renderer would mix a family with itself.
  const sameFamily = a === b;
  const raw = (nearest + window / 2) / window;
  const clamped = Math.min(1, Math.max(0, raw));
  const k = sameFamily ? 0 : clamped * clamped * (3 - 2 * clamped);
  const elev = Math.min(1, Math.max(.02, light.direction[1]));
  return {
    n: a.n + (b.n - a.n) * k,
    g: a.g + (b.g - a.g) * k,
    blue: a.blue + (b.blue - a.blue) * k,
    lamp: a.lamp + (b.lamp - a.lamp) * k,
    haze: a.haze + (b.haze - a.haze) * k,
    elev,
    dawn: hour < 12,
  };
}

