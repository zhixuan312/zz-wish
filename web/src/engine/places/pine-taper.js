// The Pine Gate taper beat, as fractions of the 3.2 s ignition tween.
// The shrine oil lamp sits behind the frozen ignite camera, so the transfer from its flame
// happens out of frame: the taper enters already lit from the shrine side, touches the wick,
// withdraws, and its flame is snuffed before it leaves the frame.
export const TAPER_BEAT = Object.freeze({
  // Sliding in from just off the frame edge, still lit.
  entryEnd: .10,
  // Moving from the frame edge to the wick.
  contactStart: .10,
  contactEnd: .30,
  // Holding the flame at the wick while the catch spreads.
  contactHold: .55,
  // Withdrawing towards the entry point.
  retreatStart: .55,
  retreatEnd: .72,
  // The flame goes out with a thread of smoke on the way out.
  snuffAt: .72,
  // Gone by the end of the tween.
  exitEnd: .995,
});

/** Where the taper is at tween fraction k: 'entering', 'approaching', 'at-wick', 'retreating' or 'gone'. */
export function taperPhase(k) {
  if (k >= TAPER_BEAT.exitEnd) return 'gone';
  if (k >= TAPER_BEAT.retreatEnd) return 'retreating';
  if (k >= TAPER_BEAT.contactHold) return 'retreating';
  if (k >= TAPER_BEAT.contactEnd) return 'at-wick';
  if (k >= TAPER_BEAT.entryEnd) return 'approaching';
  return 'entering';
}

/** The catch only happens once the taper has actually reached the wick. */
export function taperHasReachedWick(k) {
  return k >= TAPER_BEAT.contactEnd;
}
