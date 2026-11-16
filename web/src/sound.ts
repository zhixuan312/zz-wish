// Quiet, locally synthesized environments. Nothing is audible before the light tap; the audio
// device is opened silently on the confirm screen so its one-off startup cost (hundreds of ms on
// some systems) does not land on the ignition.
import type { PlaceId } from '../../shared/places.ts';
const rooms: Record<PlaceId, { low: number; high: number; gain: number; swell: number; detail: 'drip' | 'bird' | 'air' | 'paper' }> = {
  lingyin: { low: 520, high: 1800, gain: .035, swell: .11, detail: 'drip' },
  shaolin: { low: 180, high: 620, gain: .06, swell: .07, detail: 'air' },
  yonghe: { low: 95, high: 380, gain: .025, swell: .043, detail: 'air' },
  jokhang: { low: 70, high: 240, gain: .07, swell: .06, detail: 'air' },
  puji: { low: 260, high: 1300, gain: .07, swell: .12, detail: 'air' },
  zixiao: { low: 820, high: 2300, gain: .025, swell: .053, detail: 'air' },
  qufu: { low: 1600, high: 4200, gain: .018, swell: .031, detail: 'paper' },
  meizhou: { low: 130, high: 850, gain: .075, swell: .085, detail: 'air' },
  guandi: { low: 55, high: 160, gain: .065, swell: .025, detail: 'drip' },
  hongluo: { low: 700, high: 2500, gain: .022, swell: .09, detail: 'bird' },
};
// The 12 s brown-noise bed is generated in small idle slices while the visitor writes, so the
// light tap only copies it. No audio device is touched here.
const NOISE_RATE = 48000, NOISE_LENGTH = NOISE_RATE * 12;
const noise = [new Float32Array(NOISE_LENGTH), new Float32Array(NOISE_LENGTH)];
const brown = [0, 0];
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
}
setTimeout(prepareNoise, 1500);
let context: AudioContext | null = null;
let master: GainNode | null = null;
let nodes: AudioScheduledSourceNode[] = [];
let detailTimer = 0;
let muted = false;
let generation = 0;
function tone(frequency: number, duration: number, volume: number, chirp = false) {
  if (!context || !master) return;
  const c = context, oscillator = c.createOscillator(), envelope = c.createGain(), now = c.currentTime;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * (chirp ? 1.7 : .45), now + duration);
  envelope.gain.setValueAtTime(0, now); envelope.gain.linearRampToValueAtTime(volume, now + .012);
  envelope.gain.exponentialRampToValueAtTime(.00001, now + duration);
  oscillator.connect(envelope).connect(master); oscillator.start(); oscillator.stop(now + duration);
  oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
}
export const sound = {
  /** Open the audio device ahead of the light tap, suspended and with nothing connected. */
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
      const buffer = c.createBuffer(2, NOISE_LENGTH, NOISE_RATE);
      noise.forEach((data, channel) => buffer.copyToChannel(data, channel));
      const source = c.createBufferSource(), filter = c.createBiquadFilter(), volume = c.createGain(), swell = c.createOscillator(), amount = c.createGain();
      source.buffer = buffer; source.loop = true; filter.type = 'bandpass'; filter.frequency.value = room.low; filter.Q.value = .35;
      volume.gain.value = room.gain; swell.frequency.value = room.swell; amount.gain.value = room.gain * .65;
      source.connect(filter).connect(volume).connect(master); swell.connect(amount).connect(volume.gain);
      filter.frequency.setValueAtTime(room.low, now); filter.frequency.exponentialRampToValueAtTime(room.high, now + 18);
      source.start(); swell.start(); nodes = [source, swell];
      source.onended = () => { source.disconnect(); filter.disconnect(); volume.disconnect(); swell.disconnect(); amount.disconnect(); };
      const detail = () => {
        if (token !== generation) return;
        if (room.detail === 'drip') tone(1500 + Math.random() * 1000, .1, .018);
        if (room.detail === 'bird') { tone(2200 + Math.random() * 1100, .14, .012, true); }
        if (room.detail === 'paper') tone(4200 + Math.random() * 800, .035, .002);
        detailTimer = window.setTimeout(detail, 3500 + Math.random() * 11000);
      };
      detailTimer = window.setTimeout(detail, 2500 + Math.random() * 5000);
    } catch { /* Unsupported or denied audio must never block lighting. */ }
  },
  mute(value: boolean) { muted = value; if (master && context) master.gain.setTargetAtTime(value ? 0 : .65, context.currentTime, .15); },
  stop() {
    generation++; clearTimeout(detailTimer);
    const oldMaster = master;
    if (oldMaster && context) { oldMaster.gain.cancelScheduledValues(context.currentTime); oldMaster.gain.setTargetAtTime(0, context.currentTime, .08); }
    for (const node of nodes) { try { node.stop((context?.currentTime ?? 0) + .4); } catch { /* Already stopped. */ } }
    if (oldMaster) window.setTimeout(() => oldMaster.disconnect(), 500);
    nodes = []; master = null;
  },
};
