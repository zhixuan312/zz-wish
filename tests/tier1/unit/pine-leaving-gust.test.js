import { expect, test, vi } from 'vitest';
import { isLeavingGust } from '../../../web/src/engine/index.ts';

test('only a leaving Pine Gate lamp takes the mountain gust', () => {
  expect(isLeavingGust('pine-gate', 'left')).toBe(true);
  expect(isLeavingGust('pine-gate', 'put_out')).toBe(false);
  expect(isLeavingGust('pine-gate', 'complete')).toBe(false);
  expect(isLeavingGust('pine-gate', 'navigated')).toBe(false);
  expect(isLeavingGust('snow-roof', 'left')).toBe(false);
});

test('the leaving gust still ends as the put-out ending', async () => {
  // Burn settles left before any visual runs, and the result is not done: that is the
  // put-out outcome, so the shortened candle remains with a thread of smoke.
  // Burn listens to page events; a minimal stub is enough to observe its settlement.
  vi.stubGlobal('document', { hidden: false, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {}, setInterval: () => 0, clearInterval() {} });
  const { Burn } = await import('../../../web/src/burn.ts');
  const settled = [];
  vi.useFakeTimers();
  try {
    const burn = new Burn(600_000, (s) => settled.push(s));
    burn.settle('left');
    expect(settled).toHaveLength(1);
    expect(settled[0].reason).toBe('left');
    expect(settled[0].done).toBe(false);
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
