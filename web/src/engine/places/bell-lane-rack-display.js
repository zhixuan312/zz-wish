import { bellLaneRack } from './bell-lane-rack.js';
import { addBellLaneWishTag } from './bell-lane-wish-tag.js';

export function bellLaneRackDisplay(lamps) {
  const { previous, next } = bellLaneRack(lamps);
  return {
    next,
    previous: previous.map(({ lamp, slot }) => {
      // The centre and door-side shades sit to the right of the visitor's
      // lamp in the seated view. Hang their tags from the outer corner.
      const side = ['visitor', 'door-side', 'far-end'].includes(slot.id) ? -1 : 1;
      return { slot, lamp: { ...lamp, rackDisplay: side } };
    }),
  };
}

export function makeBellLaneSavedTag(h, lamp, post, side) {
  return addBellLaneWishTag(h, lamp, post, { side, saved: true });
}
