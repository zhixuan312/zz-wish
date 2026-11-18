// Translate the elapsed-time model into fuel and the remaining wax profile.
import { frustumVolume, waxVolume, type Row } from './rules.ts';

export function remainingFuel(burnedMs: number, durationMs: number): number {
  return durationMs > 0 ? 1 - Math.max(0, Math.min(1, burnedMs / durationMs)) : 0;
}

/** The height of a horizontal cut retaining the requested fraction of wax volume. */
export function waxCutHeight(rows: Row[], remaining: number): number {
  if (remaining <= 0) return rows[0].y;
  if (remaining >= 1) return rows[rows.length - 1].y;

  const target = waxVolume(rows) * remaining;
  let volume = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    const span = b.y - a.y;
    const segment = frustumVolume(span, a.r, b.r);
    if (volume + segment < target) {
      volume += segment;
      continue;
    }
    if (a.r === b.r || segment === 0) {
      const fraction = segment === 0 ? 0 : (target - volume) / segment;
      return a.y + fraction * span;
    }

    // Volume within a tapered segment is monotonic but nonlinear in its height.
    let low = 0;
    let high = 1;
    for (let iteration = 0; iteration < 20; iteration++) {
      const fraction = (low + high) / 2;
      const radius = a.r + (b.r - a.r) * fraction;
      if (volume + frustumVolume(fraction * span, a.r, radius) < target) low = fraction;
      else high = fraction;
    }
    return a.y + ((low + high) / 2) * span;
  }
  return rows[rows.length - 1].y;
}
