import { bambooEave, bambooNook } from './bamboo-rain-shelter.ts';

const { start, end, eaveZ, backZ } = bambooEave;
const sin = Math.sin(bambooNook.ry);
const cos = Math.cos(bambooNook.ry);
const unit = (value: number) => Math.max(0, Math.min(1, value));

export function bambooRainMix(x: number, z: number, dx: number, dz: number) {
  const fromNookX = x - bambooNook.x, fromNookZ = z - bambooNook.z;
  const along = cos * fromNookX - sin * fromNookZ;
  const across = sin * fromNookX + cos * fromNookZ;
  // Blend over 1.30 m centered on the actual roof edge.
  const roofDistance = Math.min(eaveZ - across, across - backZ, along - start, end - along);
  const t = unit(.5 + roofDistance / 1.3);
  const shelter = t * t * (3 - 2 * t);

  // Use a nearby tile along the lip as the runoff source. The roof bed gathers
  // above the listener, while the individual impacts keep their courtyard bearing.
  const tile = Math.max(start, Math.min(end, along + .9));
  const sx = cos * (tile - along) + sin * (eaveZ - across);
  const sz = -sin * (tile - along) + cos * (eaveZ - across);
  const distance = Math.hypot(sx, sz);
  const heading = Math.hypot(dx, dz);
  const pan = heading && distance ? (-dz * sx + dx * sz) / (heading * distance) : 0;
  return {
    shelter,
    outdoor: 1 - .82 * shelter,
    outdoorCutoff: 4400 - 3460 * shelter,
    overhead: .055 * shelter,
    roofPan: .27 * (1 - shelter) * pan,
    drips: .24 * shelter / (1 + distance * .17),
    dripPan: .66 * pan,
  };
}

export type BambooRainStage = 'travel' | 'candle' | 'burning';

// Use the existing rain buffer and master. The tile wash centers over the listener;
// runoff consists of short filtered noise impacts rather than pitched beeps.
export function createBambooRainSound(
  context: AudioContext, master: GainNode, source: AudioBufferSourceNode, weather: GainNode, buffer: AudioBuffer,
) {
  const outdoorFilter = context.createBiquadFilter();
  outdoorFilter.type = 'lowpass'; outdoorFilter.Q.value = .4;
  const outdoor = context.createGain();
  weather.connect(outdoorFilter).connect(outdoor).connect(master);

  const tiles = context.createBiquadFilter();
  tiles.type = 'bandpass'; tiles.frequency.value = 1750; tiles.Q.value = .75;
  const roof = context.createGain();
  roof.channelCount = 1; roof.channelCountMode = 'explicit';
  const roofPan = context.createStereoPanner();
  source.connect(tiles).connect(roof).connect(roofPan).connect(master);

  const dripPan = context.createStereoPanner();
  dripPan.connect(master);
  const initial = bambooRainMix(bambooNook.x, bambooNook.z + 26, 0, -1);
  outdoorFilter.frequency.value = initial.outdoorCutoff;
  outdoor.gain.value = initial.outdoor;
  roof.gain.value = initial.overhead;

  let updatedAt = -Infinity;
  let nextDrop = context.currentTime + .45;
  const drops = new Map<AudioBufferSourceNode, () => void>();

  function drop(now: number, level: number) {
    const impact = context.createBufferSource();
    impact.buffer = buffer;
    const splash = context.createBiquadFilter();
    splash.type = 'bandpass'; splash.frequency.value = 1350 + 1500 * Math.random(); splash.Q.value = 1.45;
    const envelope = context.createGain();
    envelope.channelCount = 1; envelope.channelCountMode = 'explicit';
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(level * (.64 + .36 * Math.random()), now + .007);
    envelope.gain.exponentialRampToValueAtTime(.00001, now + .105);
    impact.connect(splash).connect(envelope).connect(dripPan);
    impact.start(now, Math.random() * (buffer.duration - .11), .11);
    const disconnect = () => {
      if (!drops.delete(impact)) return;
      impact.disconnect(); splash.disconnect(); envelope.disconnect();
    };
    drops.set(impact, disconnect);
    impact.onended = disconnect;
  }

  return {
    listen(x: number, z: number, dx: number, dz: number, stage: BambooRainStage, immediate = false) {
      const now = context.currentTime;
      if (context.state !== 'running' || (!immediate && now - updatedAt < .05)) return;
      updatedAt = now;
      const mix = bambooRainMix(x, z, dx, dz);
      const smoothing = immediate ? .035 : stage === 'travel' ? .085 : .12;
      // AudioParam targets start from the current value, including after a Skip.
      outdoorFilter.frequency.setTargetAtTime(mix.outdoorCutoff, now, smoothing);
      outdoor.gain.setTargetAtTime(mix.outdoor, now, smoothing);
      roof.gain.setTargetAtTime(mix.overhead, now, smoothing);
      roofPan.pan.setTargetAtTime(mix.roofPan, now, smoothing);
      dripPan.pan.setTargetAtTime(mix.dripPan, now, smoothing);
      if (mix.shelter > .15 && now >= nextDrop) {
        drop(now, mix.drips);
        nextDrop = now + .56 + .46 * Math.random();
      }
    },
    disconnect() {
      for (const [impact, disconnect] of drops) { impact.stop(); disconnect(); }
      outdoorFilter.disconnect(); outdoor.disconnect();
      tiles.disconnect(); roof.disconnect(); roofPan.disconnect(); dripPan.disconnect();
    },
  };
}
