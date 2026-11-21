import type { Candle } from './api.ts';
import { remainingFuel } from '../../shared/wax.ts';

export function readBellLanePlacementHistory(candles: readonly Candle[], activeId: string) {
  const active = candles.filter(candle => candle.status === 'burning');
  if (active.length !== 1 || active[0].id !== activeId || active[0].placeId !== 'bell-lane') {
    throw new Error('Bell Lane placement needs the current private lamp history');
  }
  return bellLanePlacedHistory(candles);
}

export function bellLanePlacedHistory(candles: readonly Candle[]) {
  // A confirmed run can be closed with zero burned fuel before the wick ever catches.
  return candles.flatMap(candle => candle.placeId === 'bell-lane' && candle.status !== 'burning' &&
    !(candle.status === 'went_out' && candle.burnedMs === 0) ? [{
    id: candle.id, shape: candle.shape, status: candle.status,
    remaining: remainingFuel(candle.burnedMs, candle.durationMs),
  }] : []);
}
