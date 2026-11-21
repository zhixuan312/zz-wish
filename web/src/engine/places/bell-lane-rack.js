// The four latest saved lamps stay on the rack. The fifth address is left
// free for the next lamp, so a return never needs to shuffle a saved one.
export const BELL_LANE_SHELF = { width: 2.11, front: -.46, back: .74, top: .46 };

const slots = [
  { id: 'visitor', path: [[0, 0], [0, .32]] },
  { id: 'window-side', path: [[0, 0], [.28, 0], [.28, .60]] },
  { id: 'front-end', path: [[0, 0], [.08, 0], [.08, -.28]] },
  { id: 'far-end', path: [[0, 0], [.37, 0], [.56, .30], [.56, .38]] },
  { id: 'door-side', path: [[0, 0], [-.20, 0], [-.25, -.32]] },
];

export function bellLaneRack(lamps) {
  // The private history arrives newest first and is complete for this court.
  const slotAt = index => slots[index % slots.length];
  return {
    previous: lamps.slice(0, slots.length - 1).map((lamp, i) => ({
      lamp, slot: slotAt(lamps.length - 1 - i),
    })),
    next: slotAt(lamps.length),
  };
}

export function bellLaneTransfer({ path }, progress, target) {
  const smooth = (start, end) => {
    const k = Math.min(1, Math.max(0, (progress - start) / (end - start)));
    return k * k * (3 - 2 * k);
  };
  const lift = smooth(0, .28) * (1 - smooth(.72, 1));
  // Sweep around the occupied stands while keeping the wick within the seated view.
  const segments = path.length - 1;
  const travel = smooth(.12, .88) * segments;
  const index = Math.min(Math.floor(travel), segments - 1);
  const mix = travel - index;
  const [x0, z0] = path[index], [x1, z1] = path[index + 1];
  target.set(x0 + (x1 - x0) * mix, BELL_LANE_SHELF.top + .073 * lift, z0 + (z1 - z0) * mix);
}
