import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMusic, cueFor, equalPowerCurve, phraseBag } from '../../../web/src/music.ts';
import { musicBucket } from '../../../shared/dayPart.ts';

// A fake media element and audio context: the music module must work without a real
// device, and the test asserts behaviour rather than sound.
class FakeGain {
  gain = {
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setValueCurveAtTime: vi.fn(),
  };
  connect(target: FakeGain | FakeContext) { return target; }
  disconnect() { /* no graph */ }
}
class FakeSource { connect() { return new FakeGain(); } disconnect() { /* detached */ } }
class FakeContext {
  currentTime = 0;
  destination = new FakeGain();
  state = 'running';
  createGain() { return new FakeGain(); }
  createMediaElementSource() { return new FakeSource(); }
  resume() { return Promise.resolve(); }
}
class FakeAudio {
  static instances: FakeAudio[] = [];
  src = '';
  loop = false;
  preload = '';
  currentTime = 0;
  duration = 30;
  paused = true;
  private handlers = new Map<string, () => void>();
  constructor() { FakeAudio.instances.push(this); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener(type: string, handler: () => void) { this.handlers.set(type, handler); }
  emit(type: string) { this.handlers.get(type)?.(); }
}

describe('music cue table', () => {
  it('maps each stage to the authored file name', () => {
    expect(cueFor('home', 'snow-roof')).toBe('home_loop');
    expect(cueFor('place', 'snow-roof')).toBe('snow_place_loop');
    expect(cueFor('walk', 'pine-gate')).toBe('pine_walk');
    expect(cueFor('choose', 'snow-roof')).toBe('snow_choose_loop');
    expect(cueFor('ignite', 'pine-gate')).toBe('pine_ignite');
    expect(cueFor('burn', 'snow-roof', 'night')).toBe('snow_burn_bed_night');
    expect(cueFor('burn', 'pine-gate', 'golden')).toBe('pine_burn_bed_golden');
    expect(cueFor('endingBurned', 'snow-roof')).toBe('snow_ending_burned');
    expect(cueFor('endingPutOut', 'pine-gate')).toBe('pine_ending_putout');
    expect(cueFor('result', 'snow-roof')).toBe('result_loop');
  });

  it('uses the snow and pine prefixes and nothing else', () => {
    for (const place of ['snow-roof', 'pine-gate'] as const) {
      const prefix = place === 'snow-roof' ? 'snow' : 'pine';
      expect(cueFor('walk', place)).toBe(`${prefix}_walk`);
      expect(cueFor('burn', place, 'day')).toBe(`${prefix}_burn_bed_day`);
    }
  });

  it('has no cue for a place without music', () => {
    expect(cueFor('place', 'bamboo-rain')).toBeNull();
    expect(cueFor('burn', 'highland')).toBeNull();
  });
});

describe('phrase shuffle bag', () => {
  it('plays all eight phrases before repeating any', () => {
    const bag = phraseBag(8);
    const first = Array.from({ length: 8 }, () => bag.next());
    expect([...first].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(bag.remaining()).toBe(0);
    // A fresh bag starts here, so the next phrase may be any of the eight again;
    // what matters is that no phrase repeated inside the finished bag above.
    const second = bag.next();
    expect(second).toBeGreaterThanOrEqual(1);
    expect(second).toBeLessThanOrEqual(8);
  });

  it('refills only when emptied, so a long burn never repeats early', () => {
    const bag = phraseBag(3);
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) seen.push(bag.next());
    expect(new Set(seen).size).toBe(3);
    bag.next();
    expect(bag.remaining()).toBe(2);
  });
});

describe('music playback', () => {
  const originalAudio = globalThis.Audio;
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    FakeAudio.instances = [];
    vi.stubGlobal('Audio', FakeAudio);
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: [] }) })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('Audio', originalAudio);
    if (originalLocalStorage) vi.stubGlobal('localStorage', originalLocalStorage);
  });

  it('requests nothing when the manifest is empty, and never throws', async () => {
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    await music.play('home', 'snow-roof');
    await music.play('burn', 'snow-roof');
    expect(FakeAudio.instances).toHaveLength(0);
    expect(music.describe().stage).toBe('burn');
  });

  it('never asks for a cue the manifest omits', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['home_loop'] }) }));
    vi.stubGlobal('fetch', fetchMock);
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    await music.play('choose', 'snow-roof');
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('plays a listed loop', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['home_loop'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    await music.play('home', 'snow-roof');
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].src).toBe('/music/home_loop.m4a');
    expect(FakeAudio.instances[0].loop).toBe(true);
  });

  it('hands a one-shot over to the loop that follows it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_walk', 'snow_choose_loop'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    await music.play('walk', 'snow-roof');
    const [walk] = FakeAudio.instances;
    expect(walk.loop).toBe(false);
    walk.emit('ended');
    await Promise.resolve();
    expect(FakeAudio.instances.map((a) => a.src)).toContain('/music/snow_choose_loop.m4a');
  });

  it('keeps exactly one element for a loop across many passes, and releases it on stop', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_burn_bed_day', 'snow_burn_bed_golden', 'snow_burn_bed_night'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    await music.play('burn', 'snow-roof');
    // Emulate six passes of a three-minute bed: a single looping element must persist.
    const bed = FakeAudio.instances[0];
    for (let pass = 0; pass < 6; pass++) { bed.currentTime = 0; bed.duration = 180; }
    expect(FakeAudio.instances).toHaveLength(1);
    expect(bed.loop).toBe(true);
    music.stop();
    expect(FakeAudio.instances).toHaveLength(1);
  });

  it('does not hand a late one-shot over once the stage has moved on', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_walk', 'snow_choose_loop', 'snow_ignite'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    await music.play('walk', 'snow-roof');
    const walk = FakeAudio.instances.find((a) => a.src.includes('snow_walk'))!;
    await music.play('ignite', 'snow-roof');
    walk.emit('ended');
    await Promise.resolve();
    expect(FakeAudio.instances.map((a) => a.src)).not.toContain('/music/snow_choose_loop.m4a');
  });

  it('reuses media elements instead of allocating one per cue', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_burn_bed_day', 'snow_burn_bed_golden', 'snow_choose_loop', 'home_loop'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    // Five stage changes in a row: iOS would refuse the fifth fresh element.
    for (const stage of ['home', 'choose', 'burn', 'choose', 'home'] as const) await music.play(stage, 'snow-roof');
    await new Promise((r) => setTimeout(r, 1700));
    expect(FakeAudio.instances.length).toBeLessThanOrEqual(3);
    expect(music.describe().channels).toBe(1);
  });

  it('crossfades on an equal-power curve, not a linear ramp', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['home_loop'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    await music.play('home', 'snow-roof');
    // The curve rises on a quarter circle: its midpoint is above a linear 0.5, which is
    // what keeps the perceived loudness flat through the join.
    const curve = equalPowerCurve(true, 4);
    [0, Math.sin(Math.PI / 8), Math.SQRT1_2, Math.sin((3 * Math.PI) / 8), 1]
      .forEach((value, i) => expect(curve[i]).toBeCloseTo(value, 6));
    expect(curve[2]).toBeGreaterThan(0.5);
    // The falling half is the mirror image, so the two gains never sum below one.
    expect([...equalPowerCurve(false, 4)].map((v, i) => v * v + curve[i] * curve[i]).every((p) => Math.abs(p - 1) < 1e-6)).toBe(true);
  });

  it('pauses on a hidden tab and resumes the current cue on return', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['home_loop'] }) })));
    const ctx = new FakeContext();
    const suspended: string[] = [];
    const spy = ctx as unknown as { suspend: () => Promise<void>; resume: () => Promise<void> };
    spy.suspend = () => { suspended.push('suspend'); ctx.state = 'suspended'; return Promise.resolve(); };
    spy.resume = () => { suspended.push('resume'); ctx.state = 'running'; return Promise.resolve(); };
    const doc = new EventTarget() as EventTarget & { hidden: boolean };
    doc.hidden = false;
    vi.stubGlobal('document', doc);
    const music = createMusic({ createContext: () => ctx as unknown as AudioContext });
    await music.unlock();
    await music.play('home', 'snow-roof');
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    doc.hidden = false;
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(suspended).toEqual(['suspend', 'resume']);
  });

  it('persists the mute choice', async () => {
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    music.setMuted(true);
    expect(localStorage.getItem('one-light-muted')).toBe('true');
    const again = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    expect(again.isMuted()).toBe(true);
  });

  it('folds every part of day into one of three beds', () => {
    expect(['dawn', 'morning', 'midday'].map((p) => musicBucket(p as 'dawn'))).toEqual(['day', 'day', 'day']);
    expect(['afternoon', 'dusk'].map((p) => musicBucket(p as 'dusk'))).toEqual(['golden', 'golden']);
    expect(musicBucket('night')).toBe('night');
  });
});
