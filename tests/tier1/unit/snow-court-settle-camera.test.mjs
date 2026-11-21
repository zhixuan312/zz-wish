import { describe, expect, it } from 'vitest';
import { validateSnowCourtSettleCamera } from '../../visual/snow-court-lantern-framing.mjs';

function desktopSettle(poses) {
  const stages = ['chooser', 'spreading', 'settled'];
  const frames = poses.map(([yawDegrees, pitchDegrees], index) => ({
    yawDegrees, pitchDegrees, fovDegrees: 72, position: [0, 1, 0], modelPosition: [0, 1, 1], distance: 1,
    renderTimeMs: index * 1000, visible: true, stage: stages[index], screen: index ? 'burning' : 'candle',
  }));
  return validateSnowCourtSettleCamera({ frames }, false);
}

describe('Snow Court desktop settle gaze', () => {
  it('passes a fixed composition and a five-degree path across the wrap', () => {
    expect(desktopSettle([[180, 9], [-180, 9], [-180, 9]]).failures).toEqual([]);
    const wrapped = desktopSettle([[178, 0], [-179, 0], [-177, 0]]);
    expect(wrapped.directionTravelDegrees).toBeCloseTo(5, 10);
    expect(wrapped.failures).toEqual([]);
  });

  it('counts a reversible turn and a pitch change against the same limit', () => {
    for (const poses of [[[0, 0], [4, 0], [0, 0]], [[0, 0], [0, 3], [0, 6]]]) {
      expect(desktopSettle(poses).failures).toEqual([
        expect.objectContaining({ kind: 'desktopCameraDirectionTravel' }),
      ]);
    }
  });
});
