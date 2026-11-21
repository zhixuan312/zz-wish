// The three recorded one-shots at Pine Gate: a far temple bell, roosters and ox bells. Each is a
// real CC0, public-domain or attribution-licensed recording, fetched only after the visitor steps
// inside the place, decoded lazily and played through the existing sound module's master gain so
// mute and the background pause apply to them like everything else.
//
// A failed fetch or decode is silence, never an error: the place must still work offline.
import type { RecordedLayer } from './pine-ambience.ts';
import { LEVELS, nextDelay } from './pine-ambience.ts';

// Two or three takes per layer, chosen at random so a repetition is not recognisable.
export const RECORDINGS: Record<RecordedLayer, readonly string[]> = {
  templeBell: ['temple-bell-1.m4a', 'temple-bell-2.m4a'],
  rooster: ['rooster-1.m4a', 'rooster-2.m4a'],
  oxBell: ['ox-bell-1.m4a', 'ox-bell-2.m4a'],
};

const DIR = '/places/pine-gate/sound/';

export interface RecordedSounds {
  /** Fetch and decode what this part of day can use; never rejects. */
  prepare(layers: readonly RecordedLayer[]): void;
  /** Play one layer now, if its audio is ready. Returns whether anything started. */
  play(layer: RecordedLayer): boolean;
  /** Schedule the occasional layers for this part of day; replaces any previous schedule. */
  schedule(layers: readonly RecordedLayer[], random?: () => number): void;
  stop(): void;
  /** Test seam: how many buffers are decoded and which layers are pending. */
  state(): { decoded: number; pending: number; scheduled: number };
}

export function createRecordedSounds({ context, destination, fetchImpl = fetch, random = Math.random }: {
  context: () => AudioContext | null;
  destination: () => AudioNode | null;
  fetchImpl?: typeof fetch;
  random?: () => number;
}): RecordedSounds {
  const buffers = new Map<string, AudioBuffer>();
  const inflight = new Map<string, Promise<void>>();
  // One timer per layer: a single shared timer would cancel the layer armed before it.
  const timers = new Map<RecordedLayer, ReturnType<typeof setTimeout>>();
  let scheduledLayers: readonly RecordedLayer[] = [];
  let stopped = false;

  const load = (name: string) => {
    if (buffers.has(name) || inflight.has(name)) return inflight.get(name) ?? Promise.resolve();
    const job = (async () => {
      try {
        const response = await fetchImpl(DIR + name);
        if (!response.ok) return;
        const bytes = await response.arrayBuffer();
        const ctx = context();
        if (!ctx) return;
        const buffer = await ctx.decodeAudioData(bytes);
        buffers.set(name, buffer);
      } catch {
        // A missing or undecodable recording is silence; the place keeps working.
      } finally {
        inflight.delete(name);
      }
    })();
    inflight.set(name, job);
    return job;
  };

  const arm = (layer: RecordedLayer) => {
    const delay = nextDelay(layer, random) * 1000;
    timers.set(layer, globalThis.setTimeout(() => {
      timers.delete(layer);
      if (stopped) return;
      play(layer);
      if (!stopped) arm(layer);
    }, delay));
  };

  const play = (layer: RecordedLayer): boolean => {
    const ctx = context(), out = destination();
    if (!ctx || !out) return false;
    const names = RECORDINGS[layer];
    const ready = names.map(name => buffers.get(name)).filter(Boolean) as AudioBuffer[];
    if (!ready.length) return false;
    const source = ctx.createBufferSource();
    source.buffer = ready[Math.floor(random() * ready.length)];
    const gain = ctx.createGain();
    gain.gain.value = LEVELS[layer];
    source.connect(gain).connect(out);
    source.start();
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    return true;
  };

  return {
    prepare(layers) {
      stopped = false;
      for (const layer of layers) {
        for (const name of RECORDINGS[layer]) void load(name);
      }
    },
    play,
    schedule(layers) {
      stopped = false;
      scheduledLayers = layers;
      for (const timer of timers.values()) globalThis.clearTimeout(timer);
      timers.clear();
      // Each occasional layer keeps its own cadence by chaining its next wait from its own
      // interval; each starts at its own random offset, so they never line up.
      for (const layer of layers) arm(layer);
    },
    stop() {
      stopped = true;
      for (const timer of timers.values()) globalThis.clearTimeout(timer);
      timers.clear();
    },
    state: () => ({ decoded: buffers.size, pending: inflight.size, scheduled: stopped ? 0 : scheduledLayers.length }),
  };
}
