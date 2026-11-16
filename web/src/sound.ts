// Quiet, locally synthesized environments; no audio device is opened before a light tap.
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
  start(id: PlaceId) {
    this.stop();
    try {
      context ??= new AudioContext();
      void context.resume().catch(() => {});
      const c = context, room = rooms[id], now = c.currentTime, token = ++generation;
      master = c.createGain(); master.gain.setValueAtTime(0, now); master.gain.linearRampToValueAtTime(muted ? 0 : .65, now + 1.8); master.connect(c.destination);
      const buffer = c.createBuffer(2, c.sampleRate * 12, c.sampleRate);
      for (let channel = 0; channel < 2; channel++) { const data = buffer.getChannelData(channel); let brown = 0; for (let i = 0; i < data.length; i++) { brown = (brown + (Math.random() * 2 - 1) * .025) / 1.025; data[i] = brown * 3; } }
      const noise = c.createBufferSource(), filter = c.createBiquadFilter(), volume = c.createGain(), swell = c.createOscillator(), amount = c.createGain();
      noise.buffer = buffer; noise.loop = true; filter.type = 'bandpass'; filter.frequency.value = room.low; filter.Q.value = .35;
      volume.gain.value = room.gain; swell.frequency.value = room.swell; amount.gain.value = room.gain * .65;
      noise.connect(filter).connect(volume).connect(master); swell.connect(amount).connect(volume.gain);
      filter.frequency.setValueAtTime(room.low, now); filter.frequency.exponentialRampToValueAtTime(room.high, now + 18);
      noise.start(); swell.start(); nodes = [noise, swell];
      noise.onended = () => { noise.disconnect(); filter.disconnect(); volume.disconnect(); swell.disconnect(); amount.disconnect(); };
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
