import { expect, test } from 'vitest';
import type { Candle } from '../../../web/src/api.ts';
import { readBellLanePlacementHistory } from '../../../web/src/bellLaneHistory.ts';
import { DEFAULT_COLOR, PRESET_SHAPES } from '../../../shared/rules.ts';

const record = (id: string, status: Candle['status'], placeId: Candle['placeId'] = 'bell-lane'): Candle => ({
  id, status, placeId, wishId: 'wish', wish: 'Private test wish',
  shape: { kind: 'shade', rows: PRESET_SHAPES.shade[0].rows, color: DEFAULT_COLOR.shade },
  durationMs: 600_000, startedAt: 0, burnedMs: status === 'burning' ? 0 : 150_000,
  endedAt: status === 'burning' ? null : 150_000, endReason: status === 'burning' ? null : 'put_out',
});

test('the active private receipt authorizes only the current court’s finished history in server order', () => {
  const latest = record('latest', 'went_out');
  const earlier = record('earlier', 'ended_unexpectedly');
  expect(readBellLanePlacementHistory([
    record('active', 'burning'), latest, record('another-court', 'went_out', 'pine-gate'), earlier,
  ], 'active')).toEqual([latest, earlier].map(({ id, shape, status }) => ({ id, shape, status, remaining: .75 })));
});

test('missing, stale and wrong-court active receipts cannot allocate a slot', () => {
  for (const history of [
    [],
    [record('active', 'went_out')],
    [record('another', 'burning')],
    [record('active', 'burning', 'pine-gate')],
    [record('active', 'burning'), record('another', 'burning')],
  ]) {
    expect(() => readBellLanePlacementHistory(history, 'active')).toThrow();
  }
});
