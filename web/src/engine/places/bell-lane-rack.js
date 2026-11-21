// The four latest saved lamps stay on the rack. The fifth address is left
// free for the next lamp, so a return never needs to shuffle a saved one.
export const BELL_LANE_SHELF = { width: 2.11, front: -.40, back: .71, top: .46 };

const slots = [
  { id: 'visitor', x: 0, z: .32, approach: 0 },
  { id: 'window-side', x: .29, z: .32, approach: .045 },
  { id: 'front-end', x: -.29, z: -.255, approach: -.255 },
  { id: 'far-end', x: .58, z: .38, approach: .045 },
  { id: 'door-side', x: -.29, z: .025, approach: .025 },
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

export function bellLaneTransfer(slot, progress, target) {
  if (progress === 0) return target.set(0, BELL_LANE_SHELF.top, 0);
  const ease = (start, end) => {
    const k = Math.min(1, Math.max(0, (progress - start) / (end - start)));
    return k * k * (3 - 2 * k);
  };
  const lift = ease(0, .28) * (1 - ease(.72, 1));
  const x = slot.x * ease(.24, .64);
  // Cross the shelf in front of the display row before advancing into it.
  const z = slot.x === 0 ? slot.z * ease(.18, .84) :
    slot.approach * ease(.12, .33) + (slot.z - slot.approach) * ease(.63, .88);
  target.set(x, BELL_LANE_SHELF.top + .073 * lift, z);
}
