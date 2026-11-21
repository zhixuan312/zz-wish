// Quiet, locally synthesized environments. Audio starts on a visitor gesture;
// preparation before that never produces sound.
import type { PlaceId } from '../../shared/places.ts';
import { seamlessNoiseLoop } from './audio-loop.ts';
import { createBambooRainSound, type BambooRainStage } from './bamboo-rain-sound.ts';
import { ambienceFor, createRecordedSounds, type RecordedSounds } from './engine/index.ts';
const rooms: Record<PlaceId, { low: number; high: number; gain: number; swell: number; detail: 'drip' | 'bird' | 'air' | 'frog' | 'bell' }> = {
  // Pine wind high in the trees.
  'pine-gate': { low: 380, high: 1400, gain: .006, swell: .07, detail: 'air' },
  // Rain on tiles, drops from the eaves.
  'bamboo-rain': { low: 900, high: 3200, gain: .05, swell: .13, detail: 'drip' },
  // Wind along the cliff.
  'cloud-cliff': { low: 160, high: 700, gain: .07, swell: .09, detail: 'air' },
  // Still water, now and then a frog.
  'lotus-pond': { low: 260, high: 900, gain: .02, swell: .04, detail: 'frog' },
  // Surf on the rocks below.
  'sea-tide': { low: 140, high: 900, gain: .085, swell: .11, detail: 'air' },
  // Snow muffles everything.
  'snow-roof': { low: 90, high: 220, gain: .004, swell: .018, detail: 'bell' },
  // Dry wind over the loess.
  'loess-cliff': { low: 220, high: 1100, gain: .055, swell: .06, detail: 'air' },
  // High, thin wind.
  'highland': { low: 300, high: 1600, gain: .05, swell: .08, detail: 'air' },
  // The lane's hum beyond the wall; a bell now and then.
  'bell-lane': { low: 120, high: 500, gain: .03, swell: .035, detail: 'bell' },
  // The stream beyond the wall.
  'valley-pagoda': { low: 700, high: 2600, gain: .045, swell: .05, detail: 'drip' },
};
// The 12 s brown-noise bed is generated in small idle slices while the visitor writes, so the
// light tap only copies it. No audio device is touched here.
const NOISE_RATE = 48000, NOISE_LENGTH = NOISE_RATE * 12;
const noise = [new Float32Array(NOISE_LENGTH), new Float32Array(NOISE_LENGTH)];
const brown = [0, 0];
let loop: Float32Array<ArrayBuffer>[] | null = null;
let filled = 0;
const noiseReady = () => filled >= NOISE_LENGTH;
function fillNoise(budgetMs: number) {
  const until = performance.now() + budgetMs;
  while (!noiseReady() && performance.now() < until) {
    const end = Math.min(NOISE_LENGTH, filled + 4096);
    for (let channel = 0; channel < 2; channel++) {
      const data = noise[channel]; let b = brown[channel];
      for (let i = filled; i < end; i++) { b = (b + (Math.random() * 2 - 1) * .025) / 1.025; data[i] = b * 3; }
      brown[channel] = b;
    }
    filled = end;
  }
}
function prepareNoise() {
  fillNoise(6);
  if (!noiseReady()) setTimeout(prepareNoise, 30);
  else loop ??= seamlessNoiseLoop(noise, NOISE_RATE);
}
setTimeout(prepareNoise, 1500);
let context: AudioContext | null = null;
let master: GainNode | null = null;
let nodes: AudioScheduledSourceNode[] = [];
let detailTimer = 0;
let muted = false;
let generation = 0;
let bamboo: ReturnType<typeof createBambooRainSound> | null = null;
let retiringBambooMaster: GainNode | null = null;
// Pine Gate's four recorded layers ride on the same context, master gain and generation token,
// so mute, stop and the background pause cover them without a second audio path.
let recorded: RecordedSounds | null = null;
let recordedFor: PlaceId | null = null;
let hidden = false;
if (typeof document !== 'undefined') {
  // A hidden tab must be silent: stop the occasional recordings and re-arm them on return.
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden === true;
    if (!recorded) return;
    if (hidden) recorded.stop();
    else if (recordedFor === 'pine-gate') {
      const part = ambienceFor(new Date());
      recorded.prepare(part.recorded);
      recorded.schedule(part.recorded);
    }
  });
}
function tone(frequency: number, duration: number, volume: number, glide = .45) {
  if (!context || !master) return;
  const c = context, oscillator = c.createOscillator(), envelope = c.createGain(), now = c.currentTime;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * glide, now + duration);
  envelope.gain.setValueAtTime(0, now); envelope.gain.linearRampToValueAtTime(volume, now + .012);
  envelope.gain.exponentialRampToValueAtTime(.00001, now + duration);
  oscillator.connect(envelope).connect(master); oscillator.start(); oscillator.stop(now + duration);
  nodes.push(oscillator);
  oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); nodes = nodes.filter(node => node !== oscillator); };
}
function fadeGain(gain: AudioParam, target: number, now: number, duration: number) {
  // In particular, remove the future startup ramp before a mute or an ending.
  gain.cancelAndHoldAtTime(now);
  gain.linearRampToValueAtTime(target, now + duration);
}
export const sound = {
  /** Open suspended from the light gesture, with nothing connected yet. */
  prepare() {
    if (context) return;
    try { context = new AudioContext(); void context.suspend().catch(() => {}); } catch { /* Audio is optional. */ }
  },
  start(id: PlaceId) {
    this.stop();
    // A rapid return can happen during the exit fade. End the old Bamboo
    // output before connecting any new session so its bed can never double.
    retiringBambooMaster?.disconnect();
    retiringBambooMaster = null;
    try {
      context ??= new AudioContext();
      void context.resume().catch(() => {});
      const c = context, room = rooms[id], now = c.currentTime, token = ++generation;
      master = c.createGain(); master.gain.setValueAtTime(0, now); master.gain.linearRampToValueAtTime(muted ? 0 : .65, now + 1.8); master.connect(c.destination);
      while (!noiseReady()) fillNoise(Infinity);
      loop ??= seamlessNoiseLoop(noise, NOISE_RATE);
      const buffer = c.createBuffer(2, loop[0].length, NOISE_RATE);
      loop.forEach((data, channel) => buffer.copyToChannel(data, channel));
      const source = c.createBufferSource(), filter = c.createBiquadFilter(), volume = c.createGain(), swell = c.createOscillator(), amount = c.createGain();
      source.buffer = buffer; source.loop = true; filter.type = 'bandpass'; filter.frequency.value = room.low; filter.Q.value = .35;
      // Keep the higher, clearer pine wind close to the level of the quiet snow bed.
      const swellDepth = id === 'snow-roof' ? .15 : id === 'pine-gate' ? .28 : .65;
      volume.gain.value = room.gain; swell.frequency.value = room.swell; amount.gain.value = room.gain * swellDepth;
      source.connect(filter).connect(volume); swell.connect(amount).connect(volume.gain);
      const rain = id === 'bamboo-rain' ? createBambooRainSound(c, master, source, volume, buffer) : null;
      bamboo = rain;
      if (!rain) volume.connect(master);
      filter.frequency.setValueAtTime(room.low, now); filter.frequency.exponentialRampToValueAtTime(room.high, now + 18);
      source.start(); swell.start(); nodes = [source, swell];
      source.onended = () => {
        source.disconnect(); filter.disconnect(); volume.disconnect(); swell.disconnect(); amount.disconnect();
        rain?.disconnect();
      };
      if (id === 'snow-roof') {
        const flame = c.createBufferSource(), warmth = c.createBiquadFilter(), breath = c.createGain();
        flame.buffer = buffer; flame.loop = true; flame.playbackRate.value = 1.13;
        warmth.type = 'bandpass'; warmth.frequency.value = 1700; warmth.Q.value = .5;
        breath.gain.setValueAtTime(0, now); breath.gain.linearRampToValueAtTime(.006, now + 2.1);
        flame.connect(warmth).connect(breath).connect(master); flame.start(); nodes.push(flame);
        flame.onended = () => { flame.disconnect(); warmth.disconnect(); breath.disconnect(); };
      }
      if (id === 'pine-gate') {
        recorded?.stop();
        recorded = createRecordedSounds({
          context: () => context,
          destination: () => master,
        });
        recordedFor = 'pine-gate';
        const part = ambienceFor(new Date());
        recorded.prepare(part.recorded);
        recorded.schedule(part.recorded);
      } else {
        recorded?.stop();
        recorded = null;
        recordedFor = null;
      }
      const detail = () => {
        if (token !== generation) return;
        // The part of day may have turned over while the visitor stayed: re-arm the recordings.
        if (recorded && recordedFor === id && !hidden) {
          const part = ambienceFor(new Date());
          recorded.prepare(part.recorded);
          recorded.schedule(part.recorded);
        }
        if (room.detail === 'drip') tone(1500 + Math.random() * 1000, .1, .018);
        if (room.detail === 'bird') { tone(2200 + Math.random() * 1100, .14, .012, 1.7); }
        if (room.detail === 'frog') { tone(420 + Math.random() * 80, .08, .01, 1.3); tone(400 + Math.random() * 80, .07, .008, 1.3); }
        if (room.detail === 'bell') { const far = id === 'snow-roof' ? .36 : 1; tone(196, 8, .02 * far, .999); tone(392.6, 5, .008 * far, .999); tone(588, 3, .004 * far, .999); }
        detailTimer = window.setTimeout(detail, id === 'snow-roof' ? 38000 + Math.random() * 42000 : 3500 + Math.random() * 11000);
      };
      if (!rain) detailTimer = window.setTimeout(detail, id === 'snow-roof' ? 14000 + Math.random() * 10000 : 2500 + Math.random() * 5000);
    } catch { /* Unsupported or denied audio must never block lighting. */ }
  },
  bambooRainListener(x: number, z: number, dx: number, dz: number, stage: BambooRainStage, immediate = false) {
    bamboo?.listen(x, z, dx, dz, stage, immediate);
  },
  /** A taper taking flame from the shrine lamp: a soft breath, then a small flicker. */
  ignition() {
    // Deliberately quiet: the sound says "it caught" beside the light, it does not announce it.
    const token = generation;
    tone(320, .26, .012, .62);
    window.setTimeout(() => { if (token === generation) tone(880, .12, .006, 1.35); }, 90);
  },
  mute(value: boolean) { muted = value; if (master && context) fadeGain(master.gain, value ? 0 : .65, context.currentTime, .16); },
  stop() {
    generation++; clearTimeout(detailTimer);
    recorded?.stop(); recorded = null; recordedFor = null;
    const oldMaster = master;
    if (bamboo) retiringBambooMaster = oldMaster;
    bamboo = null;
    if (oldMaster && context) fadeGain(oldMaster.gain, 0, context.currentTime, .3);
    for (const node of nodes) { try { node.stop((context?.currentTime ?? 0) + .32); } catch { /* Already stopped. */ } }
    if (oldMaster) window.setTimeout(() => {
      oldMaster.disconnect();
      if (retiringBambooMaster === oldMaster) retiringBambooMaster = null;
    }, 400);
    nodes = []; master = null;
  },
};
