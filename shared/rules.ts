// What a lamp is, shared by the client and the server's validation.
// Every lamp has a shape: a candle, an oil dish or a shade, ready-made or drawn. The bigger it is, the longer it burns.
// Durations are real time: a lamp of N minutes burns for N minutes.
import { z } from 'zod';

export const RULE_VERSION = 2;
export const MIN_MINUTES = 5;
export const MAX_MINUTES = 1440;
export const PRESET_MINUTES = [10, 30, 60, 120, 180, 360, 720, 1440] as const;
export const DEFAULT_MINUTES = 30;

// The drawing pad is 10 x 15 cm; a drawn outline becomes the shape row by row.
export const PAD = { w: 0.1, h: 0.15 };
export const MIN_RADIUS = 0.004; // m; a drawn line becomes at least 8 mm across
// The volume that burns for 24 hours: a little over half the pad turned into a solid, so any reasonable
// outline can reach the full day within the pad.
const FULL_VOLUME = 0.55 * Math.PI * (PAD.w / 2) ** 2 * PAD.h;

export const KINDS = ['candle', 'oil', 'shade'] as const;
export type Kind = (typeof KINDS)[number];
export const rowSchema = z.object({ y: z.number().min(0).max(PAD.h + 0.01), cx: z.number().min(-PAD.w).max(PAD.w), r: z.number().min(MIN_RADIUS * 0.99).max(PAD.w / 2 + 1e-9) });
export const shapeSchema = z.object({
  kind: z.enum(KINDS),
  rows: z.array(rowSchema).min(2).max(200),
  color: z.number().int().min(0).max(0xffffff),
});
export type Row = z.infer<typeof rowSchema>;
export type Shape = z.infer<typeof shapeSchema>;

export function shapeMinutes(shape: Shape): number {
  return Math.min(MAX_MINUTES, Math.round((MAX_MINUTES * waxVolume(shape.rows)) / FULL_VOLUME));
}
export const isAllowedMinutes = (m: number) => m >= MIN_MINUTES && m <= MAX_MINUTES;

// The hanging gauze lantern grows with its burning time: the visitor sees a
// taller shade for a longer wish. Logarithmic in time between the ten-minute
// preset and the full day, inside the envelope that clears the ceiling beam.
export function lanternHeightMetres(minutes: number): number {
  const t = Math.log(Math.min(MAX_MINUTES, Math.max(10, minutes)) / 10) / Math.log(MAX_MINUTES / 10);
  return 0.35 + (0.56 - 0.35) * t;
}

// Volume of a stack of frustums: how much wax or oil a profile holds.
export function waxVolume(rows: Row[]): number {
  let v = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    v += frustumVolume(b.y - a.y, a.r, b.r);
  }
  return v;
}

export function frustumVolume(height: number, lowerRadius: number, upperRadius: number): number {
  return Math.PI * height * (lowerRadius ** 2 + lowerRadius * upperRadius + upperRadius ** 2) / 3;
}

// Ready-made shapes for each kind, as profiles from the bottom up (radius by height, metres).
const profile = (pts: [number, number][]): Row[] => pts.map(([r, y]) => ({ y, cx: 0, r }));
export const PRESET_SHAPES: Record<Kind, { id: string; rows: Row[] }[]> = {
  candle: [
    { id: 'slim', rows: profile([[0.011, 0], [0.011, 0.12]]) },
    { id: 'pillar', rows: profile([[0.022, 0], [0.022, 0.09]]) },
    { id: 'squat', rows: profile([[0.03, 0], [0.03, 0.05]]) },
  ],
  oil: [
    { id: 'saucer', rows: profile([[0.022, 0], [0.03, 0.006], [0.044, 0.018], [0.05, 0.024]]) },
    { id: 'cup', rows: profile([[0.02, 0], [0.026, 0.01], [0.04, 0.03], [0.046, 0.05]]) },
    { id: 'footed', rows: profile([[0.04, 0], [0.03, 0.01], [0.03, 0.025], [0.044, 0.04], [0.05, 0.058]]) },
  ],
  shade: [
    { id: 'drum', rows: profile([[0.03, 0], [0.042, 0.03], [0.048, 0.07], [0.042, 0.11], [0.03, 0.14]]) },
    { id: 'tall', rows: profile([[0.034, 0], [0.034, 0.14]]) },
    { id: 'bell', rows: profile([[0.048, 0], [0.046, 0.04], [0.036, 0.09], [0.018, 0.13], [0.008, 0.14]]) },
  ],
};
// A ready-made shape grown or shrunk until it holds exactly the given minutes: as wide as it can,
// then taller, never past the pad.
export function sizedPreset(rows: Row[], minutes: number): Row[] {
  const v0 = waxVolume(rows), target = (FULL_VOLUME * minutes) / MAX_MINUTES;
  const rMax = Math.max(...rows.map((q) => q.r)), h = rows[rows.length - 1].y;
  let sr = Math.cbrt(target / v0), sy = sr;
  if (rMax * sr > PAD.w / 2) { sr = PAD.w / 2 / rMax; sy = target / (v0 * sr * sr); }
  if (h * sy > PAD.h) { sy = PAD.h / h; sr = Math.min(PAD.w / 2 / rMax, Math.sqrt(target / (v0 * sy))); }
  return rows.map((q) => ({ y: q.y * sy, cx: q.cx * sr, r: Math.max(MIN_RADIUS, q.r * sr) }));
}
// Colours the person can choose: wax for a candle, glaze or clay for a dish, paper or gauze for a shade.
export const COLORS: Record<Kind, readonly number[]> = {
  candle: [0xe9ddc3, 0x8f1b12, 0xc8922e],
  oil: [0x6f9a8a, 0x8a5838, 0xe2dccf],
  shade: [0xf2e4c4, 0xa82a1c, 0x6a4030],
};

// The colour each kind starts on. A plain candle is ivory, as the older candles in the place
// are and as the world bible's basket of ordinary candles implies. A red gauze lantern stays
// red for Snow Roof. The visitor can still choose any colour in the row.
export const DEFAULT_COLOR: Record<Kind, number> = {
  candle: 0,
  oil: 1,
  shade: 1,
};
