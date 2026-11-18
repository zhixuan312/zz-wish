import { describe, expect, it } from 'vitest';
import { MAX_MINUTES, PAD, PRESET_MINUTES, PRESET_SHAPES, isAllowedMinutes, lanternHeightMetres, shapeMinutes, shapeSchema, sizedPreset } from '../../../shared/rules.ts';

const cylinder = (r: number, h: number) => ({ kind: 'candle' as const, color: 0, rows: [{ y: 0, cx: 0, r }, { y: h, cx: 0, r }] });

describe('duration rule', () => {
  it('sizes every ready-made shape to exactly its minutes, within the pad', () => {
    for (const kind of ['candle', 'oil', 'shade'] as const) for (const p of PRESET_SHAPES[kind]) for (const m of PRESET_MINUTES) {
      const rows = sizedPreset(p.rows, m);
      expect(Math.abs(shapeMinutes({ kind, color: 0, rows }) - m)).toBeLessThanOrEqual(1);
      expect(shapeSchema.safeParse({ kind, color: 0, rows }).success).toBe(true);
    }
  });
  it('gives the full day to a candle filling the pad', () => {
    expect(shapeMinutes(cylinder(PAD.w / 2, PAD.h))).toBe(MAX_MINUTES);
  });
  it('never gives less time for more', () => {
    let last = 0;
    for (let r = 0.004; r <= 0.05; r += 0.002) { const m = shapeMinutes(cylinder(r, 0.1)); expect(m).toBeGreaterThanOrEqual(last); last = m; }
  });
  it('rejects anything under 5 minutes', () => {
    expect(isAllowedMinutes(shapeMinutes(cylinder(0.004, 0.02)))).toBe(false);
    expect(isAllowedMinutes(5)).toBe(true);
  });
});

describe('hanging lantern envelope', () => {
  it('spans the delivered ceiling beam envelope, from the ten-minute preset to the full day', () => {
    expect(lanternHeightMetres(PRESET_MINUTES[0])).toBeCloseTo(0.35, 10);
    expect(lanternHeightMetres(MAX_MINUTES)).toBeCloseTo(0.56, 10);
  });
  it('holds the envelope outside the preset range', () => {
    for (const m of [-60, 0, 5, 9.9]) expect(lanternHeightMetres(m)).toBeCloseTo(0.35, 10);
    for (const m of [1441, 2880, 100000]) expect(lanternHeightMetres(m)).toBeCloseTo(0.56, 10);
  });
  it('grows strictly with every longer preset, so a longer wish shows a taller shade', () => {
    for (let i = 1; i < PRESET_MINUTES.length; i++) {
      expect(lanternHeightMetres(PRESET_MINUTES[i])).toBeGreaterThan(lanternHeightMetres(PRESET_MINUTES[i - 1]));
    }
  });
});
