import { describe, expect, it } from 'vitest';
import { snowCourtJourneySummary } from '../../visual/snow-court-journey-audit.mjs';

const row = [-3, -2, -1, 1, 2, 3].map(slot => ({ slot, fullyFramed: true, visibleRays: 6 }));
const radians = Math.PI / 180;
function view(yaw, pitch = 0) {
  return [Math.sin(yaw * radians) * Math.cos(pitch * radians), Math.sin(pitch * radians),
    -Math.cos(yaw * radians) * Math.cos(pitch * radians)];
}

function trace({ turnDegrees = 180, turnDraws = 102, holdDraws = 12, yawAt, change } = {}) {
  const pose = (seconds, yaw) => ({
    timestamp: 100 + seconds, renderTimeMs: seconds * 1000,
    position: [0, 3.6, -7], direction: view(yaw), fovDegrees: 69,
    luminance: 75, blockedPoints: 0, phase: 'travel', screen: 'travel',
    walk: 'done', walkSeconds: 30, ignition: null, earlierLanterns: row,
  });
  const frames = Array.from({ length: 151 }, (_, i) => ({
    ...pose(i / 5, 170), walk: 'walking', walkSeconds: i / 5,
  }));
  const start = frames.length;
  for (let i = 1; i <= turnDraws + holdDraws; i++) {
    const progress = Math.min(turnDraws, i);
    const yaw = 170 + (yawAt?.(progress) ?? turnDegrees * progress / turnDraws);
    frames.push(pose(30 + i / 10, yaw));
  }
  const end = frames.length;
  const chooserSeconds = frames.at(-1).renderTimeMs / 1000 + .1;
  for (let i = 0; i < 3; i++) {
    frames.push({ ...pose(chooserSeconds + i / 10, 170 + turnDegrees), phase: 'candle', screen: 'candle' });
  }
  frames.push({ ...pose(chooserSeconds + 1, 170 + turnDegrees), phase: 'burning', screen: 'burning', ignition: 'settled' });
  const entryDraws = { start, end };
  change?.(frames, entryDraws);
  return { frames, entryDraws, entryStart: 130, entryEnd: 100 + chooserSeconds, settledAt: frames.at(-1).timestamp,
    earlierClothVertices: Object.fromEntries(row.map(({ slot }) => [slot, 20])) };
}

function summarize(geometry, phone = false) {
  const presented = geometry.frames.map(({ timestamp, luminance }) => ({ timestamp, luminance, stamped: true }));
  return snowCourtJourneySummary(geometry, presented, 30, { phone });
}

describe('Snow Court entry from real draw indices and animation stamps', () => {
  it('accepts a wrapped 180 degree turn and one second of fully static pre-chooser pose', () => {
    const geometry = trace({ holdDraws: 10 });
    const summary = summarize(geometry);
    expect(summary.failures).toEqual([]);
    expect(summary.entryYaw).toBeCloseTo(180);
    expect(summary.entryYawTrace.maximumDegreesPerSecond).toBeCloseTo(180 / 10.2);
    expect(summary.entryYawTrace.maximumViewDegreesPerSecond).toBeCloseTo(180 / 10.2);
    expect(summary.entryYawTrace.totalViewDegrees).toBeCloseTo(180);
    expect(summary.entryYawTrace.activeTurn.seconds).toBeCloseTo(10.2);
    expect(summary.entryYawTrace.poseHold).toMatchObject({
      seconds: 1, lastHoldDraw: geometry.entryDraws.end - 1, firstChooserDraw: geometry.entryDraws.end,
      lastChooserDraw: geometry.entryDraws.end + 2,
    });
  });

  it('rejects a fast yaw step within an otherwise slow enough full turn', () => {
    const summary = summarize(trace({ yawAt: draw => 6 + 174 * (draw - 1) / 101 }));
    expect(summary.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'entryYawRate', actual: expect.closeTo(60), maximum: 20 }),
      expect.objectContaining({ kind: 'entryViewRate', actual: expect.closeTo(60), maximum: 20 }),
    ]));
    expect(summary.failures).not.toContainEqual(expect.objectContaining({ kind: 'entryTurnSpan' }));
  });

  it('rejects excessive cumulative yaw and a separate turn with too little active time', () => {
    expect(summarize(trace({ turnDegrees: 186 })).failures).toContainEqual(
      expect.objectContaining({ kind: 'entryYaw', maximum: 185 }),
    );
    const short = summarize(trace({ turnDegrees: 140, turnDraws: 80 }));
    expect(short.failures).toEqual([expect.objectContaining({ kind: 'entryTurnSpan', minimum: 9 })]);
  });

  it('ignores a slow recenter and a pause when tallying the time in the main turn', () => {
    const summary = summarize(trace({ turnDegrees: 161.5, turnDraws: 144, yawAt: draw => {
      if (draw <= 50) return .03 * draw;
      return 1.5 + 160 * Math.max(0, draw - 60) / 84;
    } }));
    expect(summary.entryYawTrace.activeTurn.seconds).toBeCloseTo(8.4);
    expect(summary.failures).toEqual([expect.objectContaining({ kind: 'entryTurnSpan', minimum: 9 })]);
  });

  it('caps the cumulative 3D view rotation even when the yaw and both rates pass', () => {
    const summary = summarize(trace({ turnDegrees: 170, turnDraws: 125, change: (frames, { start }) => {
      for (let i = 10; i < 116; i++) frames[start + i - 1].direction = view(170 + 170 * i / 125, i % 2 * .9);
    } }));
    expect(summary.entryYaw).toBeCloseTo(170);
    expect(summary.entryYawTrace.totalViewDegrees).toBeGreaterThan(185);
    expect(summary.failures).toEqual([expect.objectContaining({ kind: 'entryViewTravel', maximum: 185 })]);
  });

  it('does not use the first chooser draw to complete a short hold', () => {
    const summary = summarize(trace({ holdDraws: 9 }));
    expect(summary.entryYawTrace.poseHold.seconds).toBeCloseTo(.9);
    expect(summary.failures).toEqual([expect.objectContaining({ kind: 'entryPoseHold', minimum: 1 })]);
  });

  it('rejects a chooser draw ahead of the entry callback even if its pose is settled', () => {
    const summary = summarize(trace({ change: (_frames, boundary) => { boundary.end++; } }));
    expect(summary.failures).toEqual([expect.objectContaining({ kind: 'entryChooserBeforeEnd' })]);
  });

  it('rejects a fast pitch-only change independently from the yaw speed', () => {
    const summary = summarize(trace({ change: (frames, { start }) => {
      frames[start + 37].direction = view(170 + 180 * 38 / 102, 3);
    } }));
    expect(summary.failures).toEqual([expect.objectContaining({ kind: 'entryViewRate', maximum: 20 })]);
  });

  it('restarts the hold clock when only pitch moves shortly before the chooser', () => {
    const summary = summarize(trace({ change: (frames, { end }) => {
      for (const frame of frames.slice(end - 3)) frame.direction = view(350, .5);
    } }));
    expect(summary.entryYaw).toBeCloseTo(180);
    expect(summary.entryYawTrace.poseHold.seconds).toBeCloseTo(.2);
    expect(summary.failures).toEqual([expect.objectContaining({ kind: 'entryPoseHold' })]);
  });

  it.each([
    ['position', frame => { frame.position = [0, 3.65, -7]; }],
    ['FOV', frame => { frame.fovDegrees = 69.1; }],
  ])('checks the last chooser draw for a %s jump', (_label, move) => {
    const geometry = trace({ change: (frames, { end }) => move(frames[end + 2]) });
    expect(summarize(geometry).failures).toEqual([
      expect.objectContaining({ kind: 'entryPoseJump', draw: geometry.entryDraws.end + 2 }),
    ]);
  });

  it('accepts subpixel direction rounding at the chooser boundary', () => {
    const summary = summarize(trace({ change: (frames, { end }) => {
      frames[end].direction = view(350, 1.08e-6);
    } }));
    expect(summary.failures).toEqual([]);
  });

  it('keeps the 145 degree and 25 degree per second phone limits without the desktop hold', () => {
    const summary = summarize(trace({ turnDegrees: 142, turnDraws: 61, holdDraws: 2 }), true);
    expect(summary.failures).toEqual([]);
    expect(summary.limits).toMatchObject({ maximumEntryYaw: 145, maximumEntryYawRate: 25 });
    expect(summary.entryYawTrace.poseHold).toBeUndefined();
    expect(summarize(trace({ turnDegrees: 146 }), true).failures).toContainEqual(
      expect.objectContaining({ kind: 'entryYaw', maximum: 145 }),
    );
  });
});
