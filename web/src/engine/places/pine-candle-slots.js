// The free places on the Pine Gate shrine shelf, in a fixed authored order.
// Metres in the place group, offset from the lamp anchor. The first candle takes the
// centre; each later one in the same visit moves to the next place while the earlier
// remnant stays visible where it stood.
export const candleSlots = Object.freeze([
  Object.freeze([0, 0, 0]),
  Object.freeze([-.085, 0, .012]),
  Object.freeze([.082, 0, .015]),
  Object.freeze([-.042, 0, -.070]),
  Object.freeze([.047, 0, -.066]),
]);

export const SHELF_WIDTH = .552;
export const SHELF_DEPTH = .469;

// A cursor over the places. It never runs past the last one, so a visitor who lights more
// candles than there are places keeps adding to the outermost place instead of failing.
export function createCandleSlots(slots = candleSlots) {
  let index = 0;
  const current = () => slots[Math.min(index, slots.length - 1)];
  return {
    current,
    take() {
      const offset = current();
      index += 1;
      return offset;
    },
    get index() { return index; },
    reset() { index = 0; },
  };
}
