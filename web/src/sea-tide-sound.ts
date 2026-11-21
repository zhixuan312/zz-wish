import type { TravelAudioListener } from './engine/index.ts';

function smooth(from: number, to: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

export function seaTideMix(x: number, z: number, dx: number, dz: number) {
  // The lane's east wall ends at z=14. The lower return angles seaward from that corner.
  const aroundCorner = smooth(-.2, 4.8, 14 - z);
  const alongReturn = smooth(.3, 6.3, x);
  const exposure = aroundCorner * (.36 + .64 * alongReturn);
  // The breaking water is off the east quay, which is to the right in the inland lane.
  const east = 26 - x, north = 9 - z;
  const distance = Math.hypot(east, north) * Math.hypot(dx, dz);
  const bearing = distance ? (-dz * east + dx * north) / distance : 0;
  return {
    body: .19 + .18 * exposure,
    bodyCutoff: 155 + 287 * exposure,
    wash: .008 + .26 * exposure,
    washCutoff: 420 + 2480 * exposure,
    pan: bearing * (.21 + .14 * exposure),
  };
}

function swellAt(seconds: number) {
  // Nearby breaks overlap a slower swell. Let the foam trail the first body of the wave.
  const slow = .5 + .5 * Math.sin(seconds * .72 + 1.1);
  const short = .5 + .5 * Math.sin(seconds * 1.13 + .7 * Math.sin(seconds * .26));
  return .63 * slow ** 2 + .37 * short ** 3;
}

export function createSeaTideSound(context: AudioContext, master: GainNode, buffer: AudioBuffer) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const bodyFilter = context.createBiquadFilter();
  bodyFilter.type = 'lowpass';
  const body = context.createGain();
  body.channelCount = 1;
  body.channelCountMode = 'explicit';
  const foamHighpass = context.createBiquadFilter();
  foamHighpass.type = 'highpass';
  foamHighpass.frequency.value = 360;
  const foamLowpass = context.createBiquadFilter();
  foamLowpass.type = 'lowpass';
  const wash = context.createGain();
  const pan = context.createStereoPanner();
  const output = context.createGain();

  source.connect(bodyFilter).connect(body).connect(pan);
  source.connect(foamHighpass).connect(foamLowpass).connect(wash).connect(pan);
  pan.connect(output);
  output.connect(master);
  const initial = seaTideMix(0, 31, 0, -1);
  bodyFilter.frequency.value = initial.bodyCutoff;
  body.gain.value = initial.body * .73;
  foamLowpass.frequency.value = initial.washCutoff;
  wash.gain.value = initial.wash * .45;
  pan.pan.value = initial.pan;
  const started = context.currentTime;
  let updatedAt = -Infinity;
  const listen: TravelAudioListener = (x, z, dx, dz, stage, immediate = false) => {
    const now = context.currentTime;
    if (!immediate && now - updatedAt < .045) return;
    updatedAt = now;
    const time = now - started;
    const mix = seaTideMix(x, z, dx, dz);
    const smoothing = immediate ? .035 : stage === 'travel' ? .085 : .12;
    bodyFilter.frequency.setTargetAtTime(mix.bodyCutoff, now, smoothing);
    foamLowpass.frequency.setTargetAtTime(mix.washCutoff, now, smoothing);
    body.gain.setTargetAtTime(mix.body * (.53 + .46 * swellAt(time)), now, smoothing);
    wash.gain.setTargetAtTime(mix.wash * (.22 + .78 * swellAt(time - .68)), now, smoothing);
    pan.pan.setTargetAtTime(mix.pan, now, smoothing);
  };
  source.onended = () => {
    for (const node of [source, bodyFilter, body, foamHighpass, foamLowpass, wash, pan, output]) node.disconnect();
  };
  source.start();
  return { source, listen };
}
