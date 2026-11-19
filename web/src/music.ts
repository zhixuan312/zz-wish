// The game's music: long cues streamed through media elements into one gain stage.
// Nothing is decoded into memory and nothing plays before the visitor's first
// gesture. A missing cue is silent and never produces a request that 404s: only the
// cues listed in /music/manifest.json are ever asked for. Media elements come from a
// small reusable pool, because iOS caps how many an audio context may own.
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
// A quarter-second of real silence at 8 kHz: enough for iOS to mark an element as
// user-primed. A zero-length data chunk does not count as playback there.
function primerSrc(seconds = 0.25, rate = 8000): string {
  const samples = Math.round(rate * seconds);
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const tag = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  tag(0, 'RIFF'); view.setUint32(4, 36 + samples, true); tag(8, 'WAVE');
  tag(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate, true);
  view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  tag(36, 'data'); view.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) view.setUint8(44 + i, 128);
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${globalThis.btoa?.(binary) ?? ''}`;
}
const PRIMER = { src: primerSrc() };

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
  // The fade is a test seam; gameplay always uses the authored crossfade.
  play(stage: MusicStage, placeId: PlaceId, fadeSeconds?: number): Promise<boolean>;
  stop(): void;
  setMuted(value: boolean): void;
  isMuted(): boolean;
  isRunning(): boolean;
  // True while a one-shot is playing and its own end will start `stage`. The screen
  // effect asks this so arriving at the result screen cannot fade out the ending.
  holdingFor(stage: MusicStage): boolean;
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

// iOS keeps a hard cap on media elements per context (historically one on iPhone), so
// elements are reused instead of allocated per cue. A source node can only be made
// once per element, so the pair lives together in the pool.
// Four is enough for the incoming loop, the one-shot handing over and the phrase, plus
// one spare while a fade is still running.
const POOL_LIMIT = 4;
type Slot = { el: HTMLAudioElement; source: MediaElementAudioSourceNode; owner: Channel | null; primed: boolean };
type Channel = {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  slot: Slot;
  // Every listener dies with its channel, so a reused element never fires the previous
  // cue's handler.
  abort: AbortController;
};

// Equal-power curve: the two gains cross on a circle, so the sum of their power stays
// constant through the fade instead of dipping in the middle as linear ramps do.
// `from` is the gain the curve starts at, so a fade interrupted halfway continues from
// where the ear is rather than jumping to a full-scale curve.
export function equalPowerCurve(rising: boolean, steps = 32, from = 0): Float32Array {
  const curve = new Float32Array(steps + 1);
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * (Math.PI / 2);
    // Rising runs 0 to 1 on the sine; falling runs 1 to 0 on the cosine, scaled by the
    // gain it starts from, so a fade interrupted halfway continues where it was. With
    // from 0 and 1 the two are exact partners: their squares sum to one throughout.
    curve[i] = rising ? from + (1 - from) * Math.sin(angle) : from * Math.cos(angle);
  }
  return curve;
}

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
  const pool: Slot[] = [];
  // Every channel that still owns a slot, fading ones included: the pool needs them to
  // know which element it may take back when it is at its cap.
  let held: Channel[] = [];
  let stopping = false;
  // The one-shot currently allowed to hand over, and the stage that asked for it.
  let liveOneShot: Channel | null = null;
  let cueStage: MusicStage | null = null;
  // The cue the graph is currently playing. Two callers can ask for the same stage in the
  // same tick (a screen effect and the settle path), and neither should restart it.
  let currentCue: CueName | null = null;
  let currentChannel: Channel | null = null;
  // Bumped by every stage change. A hand-over captures it before asking for its successor,
  // so a stage change that happens while that ask is still awaiting wins.
  let stageEpoch = 0;

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

  // Pausing an element whose play() is still pending rejects that promise; it is a
  // pause, not a failed cue.
  function isAbort(reason: unknown) {
    return typeof reason === 'object' && reason !== null && (reason as { name?: string }).name === 'AbortError';
  }

  // Starts the silent primer inside the current gesture and records whether the browser
  // accepted it. A slot already playing a cue is left alone.
  function primePool() {
    for (const slot of pool) {
      if (slot.primed || slot.owner !== null) continue;
      slot.el.volume = 0;
      slot.el.src = PRIMER.src;
      void slot.el.play().then(
        () => { slot.primed = true; },
        () => { slot.primed = false; },
      );
    }
  }

  function newSlot(): Slot {
    const ctx = ensureContext();
    const el = new Audio();
    el.preload = 'auto';
    const slot: Slot = { el, source: ctx.createMediaElementSource(el), owner: null, primed: false };
    pool.push(slot);
    return slot;
  }

  // The cap is what iOS enforces, so at the cap the oldest cue gives up its element: a
  // new cue must never be dropped just because the previous one is still fading out.
  function takeSlot(): Slot | null {
    const free = pool.find((s) => s.owner === null);
    if (free) return free;
    if (pool.length < POOL_LIMIT) return newSlot();
    const oldest = held[0];
    if (!oldest) return null;
    retire(oldest);
    return oldest.slot;
  }

  // Stops a channel and detaches it from its element at once. Ownership is the guard:
  // every deferred release re-checks that the slot still belongs to this channel, so a
  // timer left over from a stolen element cannot clear the cue that took it.
  function retire(channel: Channel) {
    channel.abort.abort();
    channels = channels.filter((c) => c !== channel);
    held = held.filter((c) => c !== channel);
    if (liveOneShot === channel) { liveOneShot = null; cueStage = null; }
    if (currentChannel === channel) { currentCue = null; currentChannel = null; }
    if (channel.slot.owner === channel) channel.slot.owner = null;
    // Both ends of the edge go: disconnecting only the gain would leave the source
    // feeding a node nothing hears, and a 24-hour burn would pile up one per turnover.
    // The source node itself stays with its element, because createMediaElementSource
    // may run only once per element.
    try { channel.source.disconnect(); } catch { /* already gone */ }
    try { channel.gain.disconnect(); } catch { /* already gone */ }
  }

  function makeChannel(cue: CueName, loop: boolean): Channel | null {
    const slot = takeSlot();
    if (!slot) return null;
    const el = slot.el;
    // The primer mutes the element; a cue must bring it back, because element volume
    // still applies to the Web Audio graph and a muted element would be silent.
    el.volume = 1;
    el.loop = loop;
    el.src = urlFor(cue);
    const gain = ensureContext().createGain();
    gain.gain.value = 0;
    slot.source.connect(gain).connect(master!);
    const channel: Channel = { el, source: slot.source, gain, slot, abort: new AbortController() };
    slot.owner = channel;
    held.push(channel);
    return channel;
  }

  // Returning the element to the pool, not destroying it, is what keeps iOS under its
  // cap; the source node stays attached to the same element for the next cue.
  function releaseChannel(channel: Channel) {
    if (channel.slot.owner !== channel) return; // the element moved on to another cue
    retire(channel);
    try {
      channel.el.pause();
      channel.el.removeAttribute('src');
      channel.el.load();
    } catch { /* already gone */ }
  }

  // Equal-power fade between the outgoing and incoming channels.
  function powerFade(gain: GainNode, to: number, seconds: number) {
    if (!context) return;
    const now = context.currentTime;
    const from = gain.gain.value;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(from, now);
    gain.gain.setValueCurveAtTime(equalPowerCurve(to > from, 32, from), now, seconds);
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
      powerFade(channel.gain, 0, seconds);
      globalThis.setTimeout(() => releaseChannel(channel), seconds * 1000 + 80);
    }
  }

  function clearTimers() {
    globalThis.clearInterval(bucketTimer); globalThis.clearTimeout(phraseTimer);
    bucketTimer = 0; phraseTimer = 0;
  }

  // Burning checks the part of day each minute and crossfades the bed when it changes.
  function startBucketWatch() {
    globalThis.clearInterval(bucketTimer);
    // Nothing should fire into a tab nobody is listening to; the return from hidden arms it.
    if (pageHidden()) return;
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
    if (!place || stage !== 'burn' || pageHidden()) return;
    const delayMs = (PHRASE_MIN_MINUTES + Math.random() * (PHRASE_MAX_MINUTES - PHRASE_MIN_MINUTES)) * 60_000;
    phraseTimer = globalThis.setTimeout(() => {
      if (!context || stage !== 'burn' || !place || stopping) return;
      const prefix = prefixOf(place);
      const cue = prefix ? `${prefix}_burn_phrase_${String(bag.next()).padStart(2, '0')}` : null;
      if (cue && cues?.has(cue)) {
        const channel = makeChannel(cue, false);
        if (channel) {
          void channel.el.play().catch(() => { /* a hidden tab pauses it; it resumes */ });
          powerFade(channel.gain, 1, 1.2);
          channels.push(channel);
          const end = () => {
            powerFade(channel.gain, 0, 2.4);
            channels = channels.filter((c) => c !== channel);
            globalThis.setTimeout(() => releaseChannel(channel), 2600);
          };
          channel.el.addEventListener('ended', end, { once: true, signal: channel.abort.signal });
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
    const drop = (reason?: unknown) => {
      // A pause forced by a hidden tab rejects the pending play with AbortError; that is
      // not a broken cue, and it resumes when the tab returns.
      if (isAbort(reason)) return;
      channels = channels.filter((c) => c !== channel);
      releaseChannel(channel);
    };
    channel.el.addEventListener('error', () => drop(), { once: true, signal: channel.abort.signal });
    void channel.el.play().catch(drop);
    powerFade(channel.gain, 1, seconds);
    channels.push(channel);
    return true;
  }

  // A one-shot with a successor must still reach that successor when its own file never
  // plays: a 24-hour burn with no bed is worse than a slightly early one. play() awaits the
  // cue list, so the stage is checked again afterwards: by then the player may have put the
  // lamp out, and this must not pull the game back to the bed.
  function handOverIfLive(handsOver: MusicStage | null, liveNow: boolean) {
    if (!handsOver || !liveNow || stopping) return;
    void play(handsOver, place!, undefined, stageEpoch);
  }

  function playOneShot(cue: CueName, seconds: number, handsOver: MusicStage | null, fromStage: MusicStage): boolean {
    // A missing one-shot that has a successor hands over at once, because nothing will
    // ever end. A missing cue with no successor simply stays silent.
    if (!cues?.has(cue)) {
      handOverIfLive(handsOver, stage === fromStage);
      return false;
    }
    const channel = makeChannel(cue, false);
    if (!channel) return false;
    // One handler for every way the cue can end: its own end, a file that fails to load,
    // or a play() the browser refuses. All of them must hand over, or a cue that never
    // starts would leave the next screen silent forever.
    const finish = () => {
      powerFade(channel.gain, 0, 0.6);
      channels = channels.filter((c) => c !== channel);
      const stillLive = liveOneShot === channel && cueStage === fromStage && stage === fromStage;
      if (liveOneShot === channel) { liveOneShot = null; cueStage = null; }
      // A loop that replaced this one-shot owns the tracking now; clearing it here would
      // re-enable a duplicate start of a cue that is already playing.
      if (currentChannel === channel) { currentCue = null; currentChannel = null; }
      globalThis.setTimeout(() => releaseChannel(channel), 700);
      // A slow `walk` can end after the stage has moved on; only hand over while this
      // one-shot still owns the stage, or it would pull the game back to `choose`.
      handOverIfLive(handsOver, stillLive);
    };
    const { signal } = channel.abort;
    channel.el.addEventListener('ended', finish, { once: true, signal });
    channel.el.addEventListener('error', finish, { once: true, signal });
    void channel.el.play().catch((reason: unknown) => { if (!isAbort(reason)) finish(); });
    powerFade(channel.gain, 1, seconds);
    channels.push(channel);
    liveOneShot = channel;
    cueStage = fromStage;
    return true;
  }

  async function play(nextStage: MusicStage, placeId: PlaceId, fadeSeconds?: number, expectEpoch?: number): Promise<boolean> {
    if (!context) return false;
    // The manifest settles within a few seconds even when the network hangs, so this
    // wait is bounded; callers that drive gameplay still never await it.
    await loadManifest();
    // A guarded ask (a hand-over) gives way if the stage moved while it was waiting. Any
    // ask that reaches this point is a stage change, so every one of them bumps the epoch.
    if (expectEpoch !== undefined && expectEpoch !== stageEpoch) return false;
    stageEpoch += 1;
    const nextBucket = musicBucket(dayPart(new Date()));
    const cue = cueFor(nextStage, placeId, nextBucket);
    // Already playing exactly this cue: a second ask must not fade it out and start a new
    // element, whatever order the callers ran in.
    if (cue && cue === currentCue && stage === nextStage && place === placeId
      && currentChannel !== null && channels.includes(currentChannel)) return true;
    stage = nextStage;
    place = placeId;
    clearTimers();
    stopping = false;
    if (!cue) { currentCue = null; disposeChannels(CROSSFADE); return false; }
    const isOneShot = ONE_SHOT[nextStage] === true;
    // Everything that loops crossfades in as the previous cue leaves.
    const incoming = fadeSeconds ?? CROSSFADE;
    disposeChannels(isOneShot ? 0.6 : incoming);
    bucket = nextBucket;
    if (isOneShot) {
      const startedOneShot = playOneShot(cue, 0.8, NEXT_AFTER_ONE_SHOT[nextStage] ?? null, nextStage);
      // A one-shot that never started must not take the tracking: the loop that follows it
      // is asked for next, and the dedupe has to recognise it as already playing.
      currentCue = startedOneShot ? cue : null;
      currentChannel = startedOneShot ? liveOneShot : null;
      return startedOneShot;
    }
    const started = startLoop(cue, incoming);
    currentCue = started ? cue : null;
    currentChannel = started ? channels[channels.length - 1] : null;
    // The burning watchers run even while this bucket's bed is missing, so a bed
    // delivered later still starts when the part of day changes.
    if (nextStage === 'burn') { startBucketWatch(); schedulePhrase(); }
    return started;
  }

  // A hidden tab must go quiet. Suspending the context alone only mutes the output:
  // the media elements keep running, a one-shot can still end, and iOS reports the
  // context as `interrupted` rather than `running`. So every playing element is paused
  // and remembered, and only those are resumed on return.
  let hiddenResume: Channel[] = [];
  const pageHidden = () => typeof document !== 'undefined' && document.hidden === true;
  function pauseForHidden() {
    hiddenResume = [];
    for (const channel of held) {
      if (!channel.el.paused) { hiddenResume.push(channel); channel.el.pause(); }
    }
    // The phrase and part-of-day timers must not fire into a hidden tab: a phrase would
    // start a cue nobody hears, and a bed turnover would fade out a paused element.
    clearTimers();
    if (context && context.state !== 'closed') void context.suspend().catch(() => {});
  }
  function resumeFromHidden() {
    for (const channel of hiddenResume) {
      // A channel that was retired while hidden must not come back.
      if (channel.slot.owner === channel) void channel.el.play().catch(() => {});
    }
    hiddenResume = [];
    // The stage is untouched, so a one-shot that was paused resumes rather than restarts.
    // The burn watchers are armed again only if the burn is still the current stage: the
    // lamp may have gone out while the tab was hidden.
    if (!stopping && stage === 'burn') { startBucketWatch(); schedulePhrase(); }
    if (context && (context.state === 'suspended' || (context.state as string) === 'interrupted')) {
      void context.resume().catch(() => {});
    }
  }
  function installVisibilityPause() {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (!context) return;
      if (document.hidden) pauseForHidden();
      else resumeFromHidden();
    });
  }
  installVisibilityPause();

  return {
    async unlock() {
      const ctx = ensureContext();
      // iOS only lets an element play if it was created and started inside a real user
      // activation. A touch's first pointerdown carries none, so that attempt is
      // rejected; each later unlock retries only the slots that never succeeded, and
      // never touches one a cue is using.
      while (pool.length < POOL_LIMIT) newSlot();
      primePool();
      if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') {
        try { await ctx.resume(); } catch { /* gesture may be rejected */ }
      }
    },
    play,
    stop() {
      stopping = true;
      stageEpoch += 1;
      clearTimers();
      stage = null; place = null; bucket = null; currentCue = null; currentChannel = null;
      disposeChannels(0.4);
    },
    setMuted(value: boolean) {
      muted = value;
      storeMuted(value);
      if (master && context) fade(master, value ? 0 : 1, 0.16);
    },
    isMuted: () => muted,
    isRunning: () => context?.state === 'running',
    holdingFor: (next: MusicStage) => liveOneShot !== null && cueStage !== null && NEXT_AFTER_ONE_SHOT[cueStage] === next,
    // Test seams: cue table and the shuffle bag are exercised without audio hardware.
    describe: () => ({ stage, place, bucket, channels: channels.length, muted, cuesReady: cues !== null }),
  };
}

export const music = createMusic();
