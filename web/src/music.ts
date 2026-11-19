// The game's music: long cues streamed through media elements into one gain stage.
// Nothing is decoded into memory and nothing plays before the visitor's first
// gesture. A missing cue is silent and never produces a request that 404s: only the
// cues listed in /music/manifest.json are ever asked for.
import type { PlaceId } from '../../shared/places.ts';
import { dayPart, musicBucket, type MusicBucket } from '../../shared/dayPart.ts';

export type MusicStage =
  | 'home' | 'place' | 'walk' | 'choose' | 'ignite' | 'burn'
  | 'endingBurned' | 'endingPutOut' | 'result';

type CueName = string;
type Manifest = { cues: CueName[] };

const MANIFEST_URL = '/music/manifest.json';
const CROSSFADE = 1.5;
const BUCKET_FADE = 8;
const PHRASE_MIN_MINUTES = 3;
const PHRASE_MAX_MINUTES = 8;
const MUTE_KEY = 'one-light-muted';

const prefixOf = (placeId: PlaceId): 'snow' | 'pine' | null =>
  placeId === 'snow-roof' ? 'snow' : placeId === 'pine-gate' ? 'pine' : null;

// Each stage maps to one cue; the burning bed and the result loop depend on state.
export function cueFor(stage: MusicStage, placeId: PlaceId, bucket: MusicBucket = musicBucket(dayPart(new Date()))): CueName | null {
  const prefix = prefixOf(placeId);
  switch (stage) {
    case 'home': return 'home_loop';
    case 'place': return prefix ? `${prefix}_place_loop` : null;
    case 'walk': return prefix ? `${prefix}_walk` : null;
    case 'choose': return prefix ? `${prefix}_choose_loop` : null;
    case 'ignite': return prefix ? `${prefix}_ignite` : null;
    case 'burn': return prefix ? `${prefix}_burn_bed_${bucket}` : null;
    case 'endingBurned': return prefix ? `${prefix}_ending_burned` : null;
    case 'endingPutOut': return prefix ? `${prefix}_ending_putout` : null;
    case 'result': return 'result_loop';
    default: return null;
  }
}

export interface Music {
  unlock(): Promise<void>;
  play(stage: MusicStage, placeId: PlaceId): Promise<boolean>;
  stop(): void;
  setMuted(value: boolean): void;
  isMuted(): boolean;
  describe(): { stage: MusicStage | null; place: PlaceId | null; bucket: MusicBucket | null; channels: number; muted: boolean; cuesReady: boolean };
}

// One-shots hand over to the loop that follows them.
const NEXT_AFTER_ONE_SHOT: Partial<Record<MusicStage, MusicStage>> = {
  walk: 'choose',
  ignite: 'burn',
  endingBurned: 'result',
  endingPutOut: 'result',
};
const ONE_SHOT: Record<string, true> = { walk: true, ignite: true, endingBurned: true, endingPutOut: true };

// A phrase shuffle bag: all eight play once before any repeats.
export function phraseBag(count = 8): { next: () => number; remaining: () => number } {
  let pool: number[] = [];
  const refill = () => { pool = Array.from({ length: count }, (_, i) => i + 1); };
  refill();
  return {
    next() {
      if (!pool.length) refill();
      const index = Math.floor(Math.random() * pool.length);
      return pool.splice(index, 1)[0];
    },
    remaining: () => pool.length,
  };
}

type Channel = { el: HTMLAudioElement; source: MediaElementAudioSourceNode; gain: GainNode };

export function createMusic(options: { createContext?: () => AudioContext } = {}): Music {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = readMuted();
  let cues: Set<CueName> | null = null;
  let manifestRequest: Promise<void> | null = null;

  let stage: MusicStage | null = null;
  let place: PlaceId | null = null;
  let bucket: MusicBucket | null = null;
  let channels: Channel[] = [];
  let stopping = false;
  // The one-shot currently allowed to hand over, and the stage that asked for it.
  let liveOneShot: Channel | null = null;
  let cueStage: MusicStage | null = null;

  type Timer = ReturnType<typeof setTimeout> | 0;
  let bucketTimer: Timer = 0;
  let phraseTimer: Timer = 0;
  const bag = phraseBag(8);

  function readMuted(): boolean {
    try { return localStorage.getItem(MUTE_KEY) === 'true'; } catch { return false; }
  }
  function storeMuted(value: boolean) {
    try { localStorage.setItem(MUTE_KEY, String(value)); } catch { /* storage may be denied */ }
  }

  function ensureContext() {
    if (context) return context;
    const create = options.createContext ?? (() => new AudioContext());
    context = create();
    master = context.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(context.destination);
    return context;
  }

  // Only cues the manifest declares are ever requested, so a missing file is silent
  // rather than a 404.
  // A pending or broken manifest must never hold up the game: it settles to "no
  // cues" after a short bound, and any later cue simply stays silent.
  const MANIFEST_TIMEOUT_MS = 4000;
  function loadManifest(): Promise<void> {
    if (manifestRequest) return manifestRequest;
    manifestRequest = Promise.race([
      fetch(MANIFEST_URL)
        .then((r) => (r.ok ? r.json() as Promise<Manifest> : { cues: [] }))
        .then((m) => { cues = new Set(Array.isArray(m?.cues) ? m.cues : []); })
        .catch(() => { cues = new Set(); }),
      new Promise<void>((resolve) => {
        globalThis.setTimeout(() => { cues ??= new Set(); resolve(); }, MANIFEST_TIMEOUT_MS);
      }),
    ]).then(() => { cues ??= new Set(); });
    return manifestRequest;
  }

  function urlFor(cue: CueName) { return `/music/${cue}.m4a`; }

  function makeChannel(cue: CueName, loop: boolean): Channel | null {
    const ctx = ensureContext();
    const el = new Audio();
    el.preload = 'auto';
    el.loop = loop;
    el.src = urlFor(cue);
    const source = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(master!);
    return { el, source, gain };
  }

  function fade(gain: GainNode, to: number, seconds: number) {
    if (!context) return;
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(to, now + seconds);
  }

  function disposeChannels(seconds: number) {
    const leaving = channels;
    channels = [];
    for (const channel of leaving) {
      fade(channel.gain, 0, seconds);
      globalThis.setTimeout(() => { try { channel.el.pause(); channel.el.src = ''; channel.source.disconnect(); channel.gain.disconnect(); } catch { /* already gone */ } }, seconds * 1000 + 80);
    }
  }

  function clearTimers() {
    globalThis.clearInterval(bucketTimer); globalThis.clearTimeout(phraseTimer);
    bucketTimer = 0; phraseTimer = 0;
  }

  // Burning checks the part of day each minute and crossfades the bed when it changes.
  function startBucketWatch() {
    globalThis.clearInterval(bucketTimer);
    bucketTimer = globalThis.setInterval(() => {
      if (!stage || stage !== 'burn' || !place) return;
      const next = musicBucket(dayPart(new Date()));
      if (next === bucket) return;
      bucket = next;
      // The bed change is slower than a stage change: eight seconds, as authored.
      void play('burn', place, BUCKET_FADE);
    }, 60_000);
  }

  function schedulePhrase() {
    globalThis.clearTimeout(phraseTimer);
    if (!place || stage !== 'burn') return;
    const delayMs = (PHRASE_MIN_MINUTES + Math.random() * (PHRASE_MAX_MINUTES - PHRASE_MIN_MINUTES)) * 60_000;
    phraseTimer = globalThis.setTimeout(() => {
      if (!context || stage !== 'burn' || !place || stopping) return;
      const prefix = prefixOf(place);
      const cue = prefix ? `${prefix}_burn_phrase_${String(bag.next()).padStart(2, '0')}` : null;
      if (cue && cues?.has(cue)) {
        const channel = makeChannel(cue, false);
        if (channel) {
          void channel.el.play().catch(() => {});
          fade(channel.gain, 1, 1.2);
          channels.push(channel);
          const end = () => {
            fade(channel.gain, 0, 2.4);
            globalThis.setTimeout(() => { try { channel.el.pause(); channel.source.disconnect(); channel.gain.disconnect(); } catch { /* gone */ } }, 2600);
            channels = channels.filter((c) => c !== channel);
          };
          channel.el.addEventListener('ended', end, { once: true });
        }
      }
      schedulePhrase();
    }, delayMs);
  }

  // A loop is one media element with el.loop set: the cue is authored seamless, with
  // its reverb tail already wrapped to the start, so overlapping two elements would
  // shorten the music and repeat the join every pass.
  function startLoop(cue: CueName, seconds: number) {
    if (!cues?.has(cue)) return false;
    const channel = makeChannel(cue, true);
    if (!channel) return false;
    void channel.el.play().catch(() => {});
    fade(channel.gain, 1, seconds);
    channels.push(channel);
    return true;
  }

  function playOneShot(cue: CueName, seconds: number, handsOver: MusicStage | null, fromStage: MusicStage): boolean {
    // A missing one-shot stays silent rather than jumping straight to what would
    // follow it; the screen that comes next starts its own cue.
    if (!cues?.has(cue)) return false;
    const channel = makeChannel(cue, false);
    if (!channel) return false;
    void channel.el.play().catch(() => {});
    fade(channel.gain, 1, seconds);
    channels.push(channel);
    liveOneShot = channel;
    cueStage = fromStage;
    channel.el.addEventListener('ended', () => {
      fade(channel.gain, 0, 0.6);
      globalThis.setTimeout(() => { try { channel.el.pause(); channel.source.disconnect(); channel.gain.disconnect(); } catch { /* gone */ } }, 700);
      const stillLive = liveOneShot === channel && cueStage === fromStage && stage === fromStage;
      channels = channels.filter((c) => c !== channel);
      if (liveOneShot === channel) liveOneShot = null;
      // A slow `walk` can end after the stage has moved on; only hand over while this
      // one-shot still owns the stage, or it would pull the game back to `choose`.
      if (handsOver && stillLive && !stopping) void play(handsOver, place!);
    }, { once: true });
    return true;
  }

  async function play(nextStage: MusicStage, placeId: PlaceId, fadeSeconds?: number): Promise<boolean> {
    if (!context) return false;
    // The manifest settles within a few seconds even when the network hangs, so this
    // wait is bounded; callers that drive gameplay still never await it.
    await loadManifest();
    stage = nextStage;
    place = placeId;
    clearTimers();
    stopping = false;
    const nextBucket = musicBucket(dayPart(new Date()));
    const cue = cueFor(nextStage, placeId, nextBucket);
    if (!cue) { disposeChannels(CROSSFADE); return false; }
    const isOneShot = ONE_SHOT[nextStage] === true;
    // Everything that loops crossfades in as the previous cue leaves.
    const incoming = fadeSeconds ?? CROSSFADE;
    disposeChannels(isOneShot ? 0.6 : incoming);
    bucket = nextBucket;
    if (isOneShot) return playOneShot(cue, 0.8, NEXT_AFTER_ONE_SHOT[nextStage] ?? null, nextStage);
    const started = startLoop(cue, incoming);
    // The burning watchers run even while this bucket's bed is missing, so a bed
    // delivered later still starts when the part of day changes.
    if (nextStage === 'burn') { startBucketWatch(); schedulePhrase(); }
    return started;
  }

  return {
    async unlock() {
      ensureContext();
      if (context?.state === 'suspended') { try { await context.resume(); } catch { /* gesture may be rejected */ } }
    },
    play,
    stop() {
      stopping = true;
      clearTimers();
      stage = null; place = null; bucket = null;
      disposeChannels(0.4);
    },
    setMuted(value: boolean) {
      muted = value;
      storeMuted(value);
      if (master && context) fade(master, value ? 0 : 1, 0.16);
    },
    isMuted: () => muted,
    // Test seams: cue table and the shuffle bag are exercised without audio hardware.
    describe: () => ({ stage, place, bucket, channels: channels.length, muted, cuesReady: cues !== null }),
  };
}

export const music = createMusic();
