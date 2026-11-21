import { describe, expect, it } from 'vitest';
import { snowCourtWalkDraws } from '../../visual/snow-court-journey-audit.mjs';

const entryStart = 130;
function walkDraw(walkSeconds) {
  return { phase: 'travel', walk: 'walking', walkSeconds, timestamp: 100 + walkSeconds };
}

describe('Snow Court walk trace boundary', () => {
  it('keeps the final rendered walk pose when its clock ties the entry mark', () => {
    const frames = Array.from({ length: 125 }, (_, index) => walkDraw(index / 5));
    frames.push(walkDraw(29.98), walkDraw(30));
    const entryDraws = { start: frames.length };
    frames.push({ ...walkDraw(30), walk: 'done' });

    const { walk, coverage } = snowCourtWalkDraws({ frames, entryStart, entryDraws }, 30);
    expect(walk.at(-1)).toEqual(walkDraw(30));
    expect(coverage).toMatchObject({
      drawCount: 127, lastWalkSeconds: 30, legacyDrawCount: 126, legacyLastWalkSeconds: 29.98,
    });
  });

  it('reports the measured boundary when the terminal draw is actually missing', () => {
    const frames = Array.from({ length: 125 }, (_, index) => walkDraw(index / 5));
    frames.push(walkDraw(29.98), { ...walkDraw(30), walk: 'done' });
    const entryDraws = { start: frames.length - 1 };

    expect(() => snowCourtWalkDraws({ frames, entryStart, entryDraws }, 30))
      .toThrow(/"lastWalkSeconds":29\.98/);
  });
});
