import { describe, expect, test } from 'vitest';
import { snowCourtLight } from '../../../web/src/engine/places/snow-court-light.js';
import { readSnowCourtRelight } from '../../../web/src/engine/baked/snowCourtManifest.js';
import directional from '../../../shared/snow-court-directional-light.json' with { type: 'json' };

const dateAt = (hour, minute = 0) => new Date(2026, 0, 15, hour, minute);

describe('Snow Court directional transport', () => {
  test('cold anchors select the same physical source as the rendered transport', () => {
    for (const [hour, name] of [[6, 'dawn'], [9, 'morning'], [18, 'evening'], [22, 'night']]) {
      const light = snowCourtLight(dateAt(hour), true);
      expect(light.direction).toEqual(directional.looks[name].directionEngine);
      expect(light.relight).toEqual([{ name, weight: 1 }]);
    }
    for (const hour of [13, 16]) {
      const original = snowCourtLight(dateAt(hour));
      expect(snowCourtLight(dateAt(hour), true)).toEqual({ ...original, relight: [] });
    }
  });

  test('adjacent physical looks crossfade without a fallback gap', () => {
    expect(snowCourtLight(dateAt(7, 30), true).relight).toEqual([
      { name: 'dawn', weight: .5 },
      { name: 'morning', weight: .5 },
    ]);
    expect(snowCourtLight(dateAt(11), true).relight).toEqual([{ name: 'morning', weight: .5 }]);
    expect(snowCourtLight(dateAt(7, 30))).not.toHaveProperty('relight');
  });

  test('declared maps must match the authored direction and hashed file table', () => {
    expect(readSnowCourtRelight({})).toBeNull();
    const files = [];
    const file = uri => {
      const row = { uri, bytes: 256, sha256: 'a'.repeat(64) };
      files.push(row);
      return row;
    };
    const looks = Object.fromEntries(Object.entries(directional.looks).map(([name, look]) => [name, {
      directionEngine: [...look.directionEngine],
      far: { uri: file(`snow-relight-${name}-far.webp`).uri, width: 2048, height: 1024 },
      court: { uri: file(`snow-relight-${name}-court.ktx2`).uri, scale: .8, logRange: 6, logGain: 96 },
    }]));
    const manifest = { files, snowCourtRelight: { version: 1, looks } };
    expect(readSnowCourtRelight(manifest).dawn.court.file).toBe(files[1]);
    looks.dawn.directionEngine[0] *= -1;
    expect(() => readSnowCourtRelight(manifest)).toThrow('Invalid Snow Roof directional lighting look: dawn');
  });
});
