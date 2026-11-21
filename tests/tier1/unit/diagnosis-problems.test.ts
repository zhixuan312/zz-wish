import { expect, test } from 'vitest';
import { diagnosisProblems } from '../../tier2/diagnosis-problems.mjs';

// A run counts only when both ignition signals hold and they agree about the court. These cases pin the three
// ways the readback can be wrong, each of which used to leave the run looking successful.

const healthy = {
  lightClockPinned: true, lightClock: { hours: 13 }, readyTimedOut: false,
  moved: true, ignited: true,
  selectedPlaceId: 'snow-roof',
  activeCandle: { id: 'c1', placeId: 'snow-roof', status: 'burning', durationMs: 1800000 },
  errors: [], httpErrors: [],
};

test('a run with both signals agreeing on the court passes', () => {
  expect(diagnosisProblems(healthy, 13)).toEqual([]);
});

test('an empty readback fails even when the burning HUD appeared', () => {
  const record = { ...healthy, activeCandle: null, activeCandleReadbackFailed: true };
  // The HUD alone is not enough: the server record is a separate fact.
  expect(diagnosisProblems(record, 13)).toEqual([
    'no burning candle was ever read back from the API',
  ]);
});

test('a burning candle on another court fails', () => {
  const record = { ...healthy, activeCandle: { ...healthy.activeCandle, placeId: 'pine-gate' } };
  expect(diagnosisProblems(record, 13)).toEqual([
    'the burning candle is on pine-gate, not snow-roof',
  ]);
});

test('an absent readback with no failure flag still names the selected place', () => {
  const record = { ...healthy, activeCandle: null, selectedPlaceId: 'pine-gate' };
  expect(diagnosisProblems(record, 13)).toEqual([
    'no burning candle for the selected place pine-gate',
  ]);
});

test('the other conditions still fail the run', () => {
  const record = { ...healthy, lightClockPinned: false, lightClock: { hours: 3 },
    moved: false, ignited: false, errors: ['boom'], httpErrors: ['500 /api'] };
  const problems = diagnosisProblems(record, 13);
  expect(problems).toContain('light clock is 3h, expected 13h');
  expect(problems).toContain('the walk never produced a first movement');
  expect(problems).toContain('ignition was never reached');
  expect(problems).toContain('1 page error(s)');
  expect(problems).toContain('1 HTTP error(s)');
});
