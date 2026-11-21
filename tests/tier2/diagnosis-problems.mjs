// What must be true for a selection-diagnosis run to count as measured.
//
// Kept apart from the harness so the conditions can be driven by a fixture. The two signals that matter most
// are independent: the burning HUD proves the screen reached the burning view, and the API readback proves the
// server accepted a candle. Neither substitutes for the other, and the readback must be for the place the
// visitor finally selected — a leftover candle from another court is not evidence about this run.
export function diagnosisProblems(record, pinnedHour) {
  const problems = [];
  if (!record.lightClockPinned) {
    problems.push(`light clock is ${record.lightClock?.hours}h, expected ${pinnedHour}h`);
  }
  if (record.readyTimedOut) problems.push('ready was never reported after the last selection');
  if (!record.moved) problems.push('the walk never produced a first movement');
  if (!record.ignited) problems.push('ignition was never reached');

  if (!record.activeCandle) {
    problems.push(record.activeCandleReadbackFailed
      ? 'no burning candle was ever read back from the API'
      : `no burning candle for the selected place ${record.selectedPlaceId ?? '(unknown)'}`);
  } else if (record.selectedPlaceId && record.activeCandle.placeId !== record.selectedPlaceId) {
    problems.push(`the burning candle is on ${record.activeCandle.placeId}, not ${record.selectedPlaceId}`);
  }

  if ((record.errors ?? []).length) problems.push(`${record.errors.length} page error(s)`);
  if ((record.httpErrors ?? []).length) problems.push(`${record.httpErrors.length} HTTP error(s)`);
  return problems;
}
