// Whether a settlement is the Pine Gate mountain gust: the visitor left the page while the
// candle was still burning. A put-out, a burned-down lamp and any other place never gust.
import type { EndReason } from '../../api.ts';
import type { PlaceId } from '../../../../shared/places.ts';

export function isLeavingGust(placeId: PlaceId, reason: EndReason): boolean {
  return placeId === 'pine-gate' && reason === 'left';
}
