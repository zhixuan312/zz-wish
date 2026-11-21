// Quiet, locally synthesized environments. Nothing is audible before the light tap; the audio
// device is opened from the light gesture; preparation before then never produces sound.
import type { PlaceId } from '../../shared/places.ts';
import { seamlessNoiseLoop } from './audio-loop.ts';
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
  // The street bed is filtered again at the court door.
  'bell-lane': { low: 360, high: 480, gain: .11, swell: .12, detail: 'bell' },
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
let street: {
  filter: BiquadFilterNode; volume: GainNode; pan: StereoPannerNode; updatedAt: number; inside: number;
} | null = null;
const STREET_SOURCE = { x: 2.4, z: 16.8 };
const BELL_DOOR_Z = 9.73;
function streetAt(x: number, z: number, dx: number, dz: number) {
  const t = Math.max(0, Math.min(1, (BELL_DOOR_Z + 1.3 - z) / 2.6));
  const inside = t * t * (3 - 2 * t);
  const sx = STREET_SOURCE.x - x, sz = STREET_SOURCE.z - z;
  const distance = Math.hypot(sx, sz), heading = Math.hypot(dx, dz);
  const distanceGain = .48 + .52 / (1 + distance / 14);
  return {
    inside, level: distanceGain * (1 - .78 * inside), cutoff: 2700 - 2330 * inside,
    pan: heading && distance ? .68 * (-dz * sx + dx * sz) / (heading * distance) : 0,
  };
}
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
      source.connect(filter).connect(volume);
      if (id === 'bell-lane') {
        const lowPass = c.createBiquadFilter(), doorGain = c.createGain(), pan = c.createStereoPanner();
        lowPass.type = 'lowpass'; lowPass.Q.value = .45;
        const initial = streetAt(.4, 46, 0, -1);
        lowPass.frequency.value = initial.cutoff; doorGain.gain.value = initial.level; pan.pan.value = initial.pan;
        volume.connect(lowPass).connect(doorGain).connect(pan).connect(master);
        street = { filter: lowPass, volume: doorGain, pan, updatedAt: -Infinity, inside: initial.inside };
      } else volume.connect(master);
      const installedStreet = street;
      swell.connect(amount).connect(volume.gain);
      filter.frequency.setValueAtTime(room.low, now); filter.frequency.exponentialRampToValueAtTime(room.high, now + 18);
      source.start(); swell.start(); nodes = [source, swell];
      source.onended = () => {
        source.disconnect(); filter.disconnect(); volume.disconnect(); swell.disconnect(); amount.disconnect();
        installedStreet?.filter.disconnect(); installedStreet?.volume.disconnect(); installedStreet?.pan.disconnect();
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
        if (room.detail === 'bell' && id !== 'bell-lane') {
          tone(196, 8, .0072, .999); tone(392.6, 5, .00288, .999); tone(588, 3, .00144, .999);
        }
        if (id === 'bell-lane' && street && street.inside > .98 && !hidden) {
          const hour = new Date().getHours();
          if (hour === 6 || hour === 18) {
            tone(184, 8, .009, .998); tone(414, 4.8, .003, .999); tone(609, 2.6, .0014, .999);
          }
        }
        detailTimer = window.setTimeout(detail, id === 'bell-lane' ? 90000 : id === 'snow-roof' ? 38000 + Math.random() * 42000 : 3500 + Math.random() * 11000);
      };
      detailTimer = window.setTimeout(detail, id === 'bell-lane' ? 55000 : id === 'snow-roof' ? 14000 + Math.random() * 10000 : 2500 + Math.random() * 5000);
    } catch { /* Unsupported or denied audio must never block lighting. */ }
  },
  bellLaneListener(x: number, z: number, dx: number, dz: number, immediate = false) {
    if (!street || !context) return;
    const now = context.currentTime;
    if (!immediate && now - street.updatedAt < .055) return;
    street.updatedAt = now;
    const next = streetAt(x, z, dx, dz);
    street.inside = next.inside;
    for (const [param, value] of [[street.filter.frequency, next.cutoff], [street.volume.gain, next.level], [street.pan.pan, next.pan]] as const) {
      if (immediate) {
        param.cancelScheduledValues(now);
        param.setValueAtTime(value, now);
      } else {
        param.cancelAndHoldAtTime(now);
        param.setTargetAtTime(value, now, .095);
      }
    }
  },
  /** A taper taking flame from the shrine lamp: a soft breath, then a small flicker. */
  ignition() {
    // Deliberately quiet: the sound says "it caught" beside the light, it does not announce it.
    tone(320, .26, .012, .62);
    window.setTimeout(() => tone(880, .12, .006, 1.35), 90);
  },
  mute(value: boolean) { muted = value; if (master && context) fadeGain(master.gain, value ? 0 : .65, context.currentTime, .16); },
  stop() {
    generation++; clearTimeout(detailTimer);
    recorded?.stop(); recorded = null; recordedFor = null;
    const oldMaster = master;
    if (oldMaster && context) fadeGain(oldMaster.gain, 0, context.currentTime, .3);
    for (const node of nodes) { try { node.stop((context?.currentTime ?? 0) + .32); } catch { /* Already stopped. */ } }
    if (oldMaster) window.setTimeout(() => oldMaster.disconnect(), 400);
    nodes = []; master = null; street = null;
  },
};
