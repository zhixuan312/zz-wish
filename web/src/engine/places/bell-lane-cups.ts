// The two finishes use the same bowl and oil well. Burn time still follows the lantern offer.
export const BELL_LANE_CUPS = [
  { id: 'clay', color: 0x8a5838, roughness: .92 },
  { id: 'glazed', color: 0xd2b88c, roughness: .44 },
] as const;

export type BellLaneCupId = (typeof BELL_LANE_CUPS)[number]['id'];
