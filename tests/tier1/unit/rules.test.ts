import { describe, expect, it } from 'vitest';
import { MAX_MINUTES, PAD, PRESET_MINUTES, isAllowedMinutes, presetRows, shapeMinutes } from '../../../shared/rules.ts';

const cylinder = (r: number, h: number) => ({ kind: 'candle' as const, color: 0, rows: [{ y: 0, cx: 0, r }, { y: h, cx: 0, r }] });

describe('duration rule', () => {
  it('gives every preset exactly its minutes', () => {
    for (const m of PRESET_MINUTES) expect(shapeMinutes({ kind: 'candle', color: 0, rows: presetRows(m) })).toBe(m);
  });
  it('gives 24 hours for a candle filling the whole pad', () => {
    expect(shapeMinutes(cylinder(PAD.w / 2, PAD.h))).toBe(MAX_MINUTES);
  });
  it('never gives less time for more wax', () => {
    let last = 0;
    for (let r = 0.004; r <= 0.05; r += 0.002) { const m = shapeMinutes(cylinder(r, 0.1)); expect(m).toBeGreaterThanOrEqual(last); last = m; }
  });
  it('rejects anything under 5 minutes', () => {
    expect(isAllowedMinutes(shapeMinutes(cylinder(0.004, 0.02)))).toBe(false);
    expect(isAllowedMinutes(5)).toBe(true);
  });
  it('maps lamp fill linearly, full lamp = 24 h', () => {
    expect(shapeMinutes({ kind: 'lamp', fill: 1 })).toBe(1440);
    expect(shapeMinutes({ kind: 'lamp', fill: 30 / 1440 })).toBe(30);
  });
});
