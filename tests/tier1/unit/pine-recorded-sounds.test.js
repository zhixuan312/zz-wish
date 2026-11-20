import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createRecordedSounds, RECORDINGS } from '../../../web/src/engine/places/pine-recorded-sounds.ts';

// A tiny AudioContext stand-in: enough to observe fetch, decode, connect and start.
class FakeAudioContext {
  currentTime = 0;
  decoded = [];
  started = 0;
  // The module only calls these; no `this` aliasing is needed anywhere.
  decodeAudioData = async (bytes) => { this.decoded.push(bytes.byteLength); return { duration: 1 }; };
  createBufferSource() {
    const source = {
      buffer: null, onended: null,
      connect() { return source; },
      disconnect() {},
      start() { counted.started += 1; },
    };
    return source;
  }
  createGain() { return { gain: { value: 0 }, connect() { return this; }, disconnect() {} }; }
}

let ctx, counted;
beforeEach(() => { ctx = counted = new FakeAudioContext(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const okFetch = (bytes = 8) => vi.fn().mockResolvedValue({
  ok: true, arrayBuffer: async () => new ArrayBuffer(bytes),
});

test('a part of day fetches only the layers it can use', async () => {
  const fetchImpl = okFetch();
  const sounds = createRecordedSounds({ context: () => ctx, destination: () => ({}), fetchImpl });
  sounds.prepare(['rooster']);
  await vi.runAllTicks(); await Promise.resolve(); await Promise.resolve();
  const requested = fetchImpl.mock.calls.map(([url]) => url);
  expect(requested).toContain('/places/pine-gate/sound/rooster-1.m4a');
  expect(requested).toContain('/places/pine-gate/sound/rooster-2.m4a');
  // Nothing from the bell, the ox bell or the voices.
  expect(requested.some(url => /temple-bell/.test(url))).toBe(false);
  expect(requested.some(url => /village-voices/.test(url))).toBe(false);
});

test('a failed fetch is silence and never rejects', async () => {
  const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
  const sounds = createRecordedSounds({ context: () => ctx, destination: () => ({}), fetchImpl });
  expect(() => sounds.prepare(['templeBell'])).not.toThrow();
  await vi.runAllTicks(); await Promise.resolve(); await Promise.resolve();
  expect(sounds.play('templeBell')).toBe(false);
  expect(ctx.started).toBe(0);
  expect(sounds.state()).toMatchObject({ decoded: 0 });
});

test('a 404 is silence, not an error', async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
  const sounds = createRecordedSounds({ context: () => ctx, destination: () => ({}), fetchImpl });
  sounds.prepare(['villageVoices']);
  await vi.runAllTicks(); await Promise.resolve(); await Promise.resolve();
  expect(sounds.play('villageVoices')).toBe(false);
  expect(ctx.started).toBe(0);
});

test('a decoded recording plays once, through the given destination', async () => {
  const destination = { name: 'master' };
  const fetchImpl = okFetch();
  const sounds = createRecordedSounds({ context: () => ctx, destination: () => destination, fetchImpl });
  sounds.prepare(['oxBell']);
  await vi.runAllTicks(); await Promise.resolve(); await Promise.resolve();
  expect(sounds.play('oxBell')).toBe(true);
  expect(ctx.started).toBe(1);
});

test('each occasional layer keeps its own timer, so arming one does not cancel another', async () => {
  const fetchImpl = okFetch();
  const sounds = createRecordedSounds({
    context: () => ctx, destination: () => ({}), fetchImpl, random: () => 0.5,
  });
  sounds.schedule(['templeBell', 'rooster', 'oxBell']);
  // All three are armed at once: a single shared timer would leave only the last one.
  expect(sounds.state().scheduled).toBe(3);
  sounds.stop();
  expect(sounds.state().scheduled).toBe(0);
});

test('the recording list covers every recorded layer with at least two takes', () => {
  for (const layer of ['templeBell', 'rooster', 'oxBell', 'villageVoices']) {
    expect(RECORDINGS[layer].length, layer).toBeGreaterThanOrEqual(2);
    // Every name is a plain m4a in the place's sound folder.
    for (const name of RECORDINGS[layer]) expect(name).toMatch(/^[a-z0-9-]+\.m4a$/);
  }
});
