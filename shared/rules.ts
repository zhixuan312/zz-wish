// The one duration rule, shared by the client preview and the server's validation.
// Durations are real time: a candle of N minutes burns for N minutes.
import { z } from 'zod';

export const RULE_VERSION = 1;
export const MIN_MINUTES = 5;
export const MAX_MINUTES = 1440;
export const PRESET_MINUTES = [10, 30, 60, 120, 180, 360, 720, 1440] as const;
export const DEFAULT_PRESET = 30;

// The drawing pad is 10 x 15 cm; a candle filling all of it burns for 24 hours.
export const PAD = { w: 0.1, h: 0.15 };
export const MIN_RADIUS = 0.004; // m; a drawn line becomes at least an 8 mm candle
const FULL_VOLUME = Math.PI * (PAD.w / 2) ** 2 * PAD.h;

export const rowSchema = z.object({ y: z.number().min(0).max(PAD.h + 0.01), cx: z.number().min(-PAD.w).max(PAD.w), r: z.number().min(MIN_RADIUS * 0.99).max(PAD.w / 2 + 1e-9) });
export const shapeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('candle'), rows: z.array(rowSchema).min(2).max(200), color: z.number().int().min(0).max(0xffffff) }),
  z.object({ kind: z.literal('lamp'), fill: z.number().gt(0).max(1) }),
]);
export type Row = z.infer<typeof rowSchema>;
export type Shape = z.infer<typeof shapeSchema>;

// Wax volume of a stack of frustums, every bit of wax counts.
export function waxVolume(rows: Row[]): number {
  let v = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    v += (Math.PI * (b.y - a.y) * (a.r * a.r + a.r * b.r + b.r * b.r)) / 3;
  }
  return v;
}

export function shapeMinutes(shape: Shape): number {
  const fraction = shape.kind === 'lamp' ? shape.fill : waxVolume(shape.rows) / FULL_VOLUME;
  return Math.min(MAX_MINUTES, Math.round(MAX_MINUTES * fraction));
}

export const isAllowedMinutes = (m: number) => m >= MIN_MINUTES && m <= MAX_MINUTES;

// A preset is a straight candle whose volume gives exactly its minutes.
export function presetRows(minutes: number): Row[] {
  const volume = (FULL_VOLUME * minutes) / MAX_MINUTES;
  const h = Math.min(PAD.h, 0.04 + 0.11 * Math.sqrt(minutes / MAX_MINUTES));
  const r = Math.min(PAD.w / 2, Math.sqrt(volume / (Math.PI * h)));
  return [{ y: 0, cx: 0, r }, { y: h, cx: 0, r }];
}

export const WAX_COLORS = [0xe9ddc3, 0x8f1b12, 0xc8922e] as const;
