import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMusic, cueFor, equalPowerCurve, phraseBag } from '../../../web/src/music.ts';
import { musicBucket } from '../../../shared/dayPart.ts';

// A fake media element and audio context: the music module must work without a real
// device, and the test asserts behaviour rather than sound.
class FakeGain {
  static instances: FakeGain[] = [];
  constructor() { FakeGain.instances.push(this); }
  gain = {
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setValueCurveAtTime: vi.fn(),
  };
  disconnected = false;
  connected = new Set<unknown>();
  connect(target: FakeGain | FakeContext) { this.connected.add(target); return target; }
  disconnect(target?: unknown) {
    if (target) this.connected.delete(target);
    else this.connected.clear();
    this.disconnected = true;
  }
}
class FakeSource {
  static instances: FakeSource[] = [];
  // A real source may be connected to several nodes; retiring a channel must drop exactly
  // the edge to that channel's gain and keep any other.
  connected = new Set<FakeGain>();
  constructor() { FakeSource.instances.push(this); }
  connect(target: FakeGain) { this.connected.add(target); return target; }
  disconnect(target?: FakeGain) {
    if (target) this.connected.delete(target);
    else this.connected.clear();
  }
}
class FakeContext {
  currentTime = 0;
  destination = new FakeGain();
  state = 'running';
  createGain() { return new FakeGain(); }
  createMediaElementSource() { return new FakeSource(); }
  // A real context flips to suspended and resolves; a fake that lacks suspend made the
  // visibility handler throw, which failed the whole run even when every test passed.
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
}
class FakeAudio {
  static instances: FakeAudio[] = [];
  src = '';
  loop = false;
  preload = '';
  volume = 1;
  currentTime = 0;
  duration = 30;
  paused = true;
  // A real element keeps every listener for a type, so the fake must too: otherwise a new
  // cue's handler would silently replace the old one and hide a missing abort signal.
  private handlers = new Map<string, { fn: () => void; once: boolean; signal?: AbortSignal }[]>();
  private fired = new Set<string>();
  constructor() { FakeAudio.instances.push(this); }
  // A pause during a pending play() rejects that promise with AbortError, as a real
  // element does; that is the case the module must not read as a failed cue.
  private pendingReject: ((reason: unknown) => void) | null = null;
  play() {
    this.paused = false;
    return new Promise<void>((_resolve, reject) => { this.pendingReject = reject; });
  }
  settlePlay() { this.pendingReject?.(null); this.pendingReject = null; }
  pause() {
    this.paused = true;
    if (this.pendingReject) {
      const reject = this.pendingReject;
      this.pendingReject = null;
      reject(Object.assign(new Error('interrupted by pause'), { name: 'AbortError' }));
    }
  }
  load() { /* pool reuse */ }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  // The module relies on `signal` to drop a previous cue's listener, so the fake must
  // honour it; otherwise a mutation that removes the signal would still pass.
  addEventListener(type: string, handler: () => void, options?: { once?: boolean; signal?: AbortSignal }) {
    if (options?.signal?.aborted) return;
    const list = this.handlers.get(type) ?? [];
    list.push({ fn: handler, once: options?.once ?? false, signal: options?.signal });
    this.handlers.set(type, list);
  }
  listenerCount(type: string) { return (this.handlers.get(type) ?? []).filter((e) => !e.signal?.aborted).length; }
  emit(type: string) {
    const list = this.handlers.get(type) ?? [];
    // Snapshot: a handler may add or remove listeners while it runs.
    for (const entry of [...list]) {
      if (entry.signal?.aborted) continue;
      if (entry.once) this.handlers.set(type, (this.handlers.get(type) ?? []).filter((e) => e !== entry));
      this.fired.add(type);
      entry.fn();
    }
  }
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

// Cue elements are the ones pointing at /music/; the unlocked pool holds a silent primer
// until a cue takes it.
const cueElements = () => FakeAudio.instances.filter((a) => a.src.startsWith('/music/'));


// A restart reuses the same element, so counting elements cannot see it. Counting the
// play() calls for one cue can.
function countPlays(cue: string) {
  const plays: string[] = [];
  const original = FakeAudio.prototype.play;
  FakeAudio.prototype.play = function play(this: FakeAudio) {
    plays.push(this.src);
    return original.call(this);
  };
  return {
    plays: () => plays.filter((src) => src === `/music/${cue}.m4a`).length,
    // The wrapper must not outlive the test that installed it.
    restore() { FakeAudio.prototype.play = original; },
  };
}

describe('music playback', () => {
  const originalAudio = globalThis.Audio;
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    FakeAudio.instances = [];
    FakeSource.instances = [];
    FakeGain.instances = [];
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
    expect(cueElements()).toHaveLength(0);
    expect(music.describe().stage).toBe('burn');
  });

  it('never asks for a cue the manifest omits', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['home_loop'] }) }));
    vi.stubGlobal('fetch', fetchMock);
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    await music.play('choose', 'snow-roof');
    expect(cueElements()).toHaveLength(0);
  });

  it('plays a listed loop', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['home_loop'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    await music.play('home', 'snow-roof');
    const cues = cueElements();
    expect(cues).toHaveLength(1);
    expect(cues[0].src).toBe('/music/home_loop.m4a');
    expect(cues[0].loop).toBe(true);
  });

  it('hands a one-shot over to the loop that follows it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_walk', 'snow_choose_loop'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    await music.play('walk', 'snow-roof');
    const [walk] = cueElements();
    expect(walk.loop).toBe(false);
    walk.emit('ended');
    await Promise.resolve();
    expect(cueElements().map((a) => a.src)).toContain('/music/snow_choose_loop.m4a');
  });

  it('keeps exactly one element for a loop across many passes, and releases it on stop', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_burn_bed_day', 'snow_burn_bed_golden', 'snow_burn_bed_night'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    await music.play('burn', 'snow-roof');
    // Emulate six passes of a three-minute bed: a single looping element must persist.
    const bed = cueElements()[0];
    for (let pass = 0; pass < 6; pass++) { bed.currentTime = 0; bed.duration = 180; }
    expect(cueElements()).toHaveLength(1);
    expect(bed.loop).toBe(true);
    music.stop();
    expect(cueElements()).toHaveLength(1);
  });

  it('does not hand a late one-shot over once the stage has moved on', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_walk', 'snow_choose_loop', 'snow_ignite'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    await music.play('walk', 'snow-roof');
    const walk = cueElements().find((a) => a.src.includes('snow_walk'))!;
    await music.play('ignite', 'snow-roof');
    walk.emit('ended');
    await Promise.resolve();
    expect(cueElements().map((a) => a.src)).not.toContain('/music/snow_choose_loop.m4a');
  });

  it('reuses media elements instead of allocating one per cue', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_burn_bed_day', 'snow_burn_bed_golden', 'snow_choose_loop', 'home_loop'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    // Six stage changes in a row: iOS would refuse fresh elements beyond the pool.
    for (const stage of ['home', 'choose', 'burn', 'choose', 'home', 'choose'] as const) await music.play(stage, 'snow-roof');
    await new Promise((r) => setTimeout(r, 1700));
    expect(FakeAudio.instances.length).toBeLessThanOrEqual(4);
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
    // A crossfade is one gain rising from 0 and the other falling from 1; their power
    // sums to one throughout, which is what keeps the join from dipping.
    const rising = equalPowerCurve(true, 4, 0);
    const falling = equalPowerCurve(false, 4, 1);
    [...rising].forEach((value, i) => expect(value * value + falling[i] * falling[i]).toBeCloseTo(1, 6));
    // An interrupted fade starts at the gain the ear already hears, not at full scale.
    expect(equalPowerCurve(true, 4, 0.4)[0]).toBeCloseTo(0.4, 6);
    expect(equalPowerCurve(false, 4, 0.4)[0]).toBeCloseTo(0.4, 6);
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

  it('keeps the newest cue alive when the pool steals its oldest element', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['home_loop', 'snow_place_loop', 'snow_choose_loop', 'result_loop'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    for (const stage of ['home', 'place', 'choose', 'result'] as const) await music.play(stage, 'snow-roof');
    // The stale release timers from the stolen cues must not clear the cue that took them.
    await new Promise((r) => setTimeout(r, 1800));
    const live = cueElements().filter((a) => a.src !== '');
    expect(live.map((a) => a.src)).toContain('/music/result_loop.m4a');
    expect(music.describe().stage).toBe('result');
  });

  it('creates and primes the whole pool inside unlock', async () => {
    let primed = 0;
    vi.stubGlobal('Audio', class extends FakeAudio { play() { primed++; return super.play(); } });
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    // iOS only allows playback for elements made inside the gesture, so all of them
    // must exist and have been started before unlock resolves.
    expect(FakeAudio.instances).toHaveLength(4);
    expect(primed).toBe(4);
    expect(cueElements()).toHaveLength(0);
  });

  it('does not fire a previous cue handler on a reused element', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_walk', 'snow_choose_loop', 'home_loop', 'snow_place_loop', 'result_loop'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    await music.play('walk', 'snow-roof');
    const walkEl = cueElements().find((a) => a.src.includes('snow_walk'))!;
    // Fill the other two slots, then let choose take the oldest element, which is the
    // walk's. A fresh element would trivially carry no old handler, so this reuse is the
    // point of the test.
    await music.play('home', 'snow-roof');
    await music.play('place', 'snow-roof');
    await music.play('result', 'snow-roof');
    await music.play('choose', 'snow-roof');
    const chooseEl = cueElements().find((a) => a.src.includes('snow_choose_loop'))!;
    expect(chooseEl).toBe(walkEl);
    // The walk's ended handler died with its channel: the shared element carries only the
    // current cue's listener, so a stale timer cannot fire when this cue ends.
    // choose is the current cue on this element, so it owns exactly one error listener;
    // the walk's ended and error listeners both died with the walk's channel.
    expect(walkEl.listenerCount('error')).toBe(1);
    expect(walkEl.listenerCount('ended')).toBe(0);
    // Emitting must not hand the game over to choose a second time.
    const before = cueElements().filter((a) => a.src.includes('snow_choose_loop')).length;
    walkEl.emit('ended');
    await Promise.resolve();
    expect(cueElements().filter((a) => a.src.includes('snow_choose_loop')).length).toBe(before);
  });

  it('hands over when a listed cue fails to load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_walk', 'snow_choose_loop'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    await music.play('walk', 'snow-roof');
    const walk = cueElements().find((a) => a.src.includes('snow_walk'))!;
    // The manifest lists the cue but the file 404s: nothing will ever end, so the error
    // path must hand over instead of leaving the next screen silent.
    walk.emit('error');
    await Promise.resolve();
    await Promise.resolve();
    expect(cueElements().map((a) => a.src)).toContain('/music/snow_choose_loop.m4a');
  });

  it('pauses the playing elements while hidden and resumes only those', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['home_loop'] }) })));
    const doc = new EventTarget() as EventTarget & { hidden: boolean };
    doc.hidden = false;
    vi.stubGlobal('document', doc);
    const ctx = new FakeContext();
    const spy = ctx as unknown as { suspend: () => Promise<void>; resume: () => Promise<void> };
    spy.suspend = () => { ctx.state = 'suspended'; return Promise.resolve(); };
    spy.resume = () => { ctx.state = 'running'; return Promise.resolve(); };
    const music = createMusic({ createContext: () => ctx as unknown as AudioContext });
    await music.unlock();
    await music.play('home', 'snow-roof');
    const cue = cueElements()[0];
    expect(cue.paused).toBe(false);
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    // Suspending the context only mutes output; the element itself must stop.
    expect(cue.paused).toBe(true);
    doc.hidden = false;
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(cue.paused).toBe(false);
  });

  it('restores full volume when a cue takes a primed element', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['home_loop'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    // The primer mutes its element; a cue must bring the volume back or the graph is silent.
    expect(FakeAudio.instances.every((a) => a.volume === 0)).toBe(true);
    await music.play('home', 'snow-roof');
    expect(cueElements()[0].volume).toBe(1);
  });

  it('treats a hidden-tab pause as a pause, not a failed cue', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_walk', 'snow_choose_loop', 'home_loop'] }) })));
    const doc = new EventTarget() as EventTarget & { hidden: boolean };
    doc.hidden = false;
    vi.stubGlobal('document', doc);
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    // A play() that is still pending rejects with AbortError when the element is paused.
    const original = FakeAudio.prototype.play;
    FakeAudio.prototype.play = function play() {
      this.paused = false;
      return Promise.reject(Object.assign(new Error('interrupted by pause'), { name: 'AbortError' }));
    };
    await music.play('walk', 'snow-roof');
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    doc.hidden = false;
    doc.dispatchEvent(new Event('visibilitychange'));
    // Long enough for a wrongful hand-over to have created its channel.
    await new Promise((r) => setTimeout(r, 50));
    // No hand-over to choose: the walk did not fail, it was paused.
    expect(cueElements().map((a) => a.src)).not.toContain('/music/snow_choose_loop.m4a');
    FakeAudio.prototype.play = original;
  });

  it('keeps a loop alive across a hidden-tab pause', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['home_loop'] }) })));
    const doc = new EventTarget() as EventTarget & { hidden: boolean };
    doc.hidden = false;
    vi.stubGlobal('document', doc);
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    await music.play('home', 'snow-roof');
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    doc.hidden = false;
    doc.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    // The loop is back on the same element and no channel was dropped.
    expect(cueElements()[0].paused).toBe(false);
    expect(music.describe().channels).toBe(1);
    expect(music.describe().stage).toBe('home');
  });

  it('retries priming on a later gesture and leaves cues alone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['home_loop'] }) })));
    // The first attempt is refused, as a touch's pointerdown is; the second must retry.
    let allow = false;
    const started = new Map<FakeAudio, number>();
    FakeAudio.prototype.play = function play(this: FakeAudio) {
      this.paused = false;
      if (!allow) return Promise.reject(Object.assign(new Error('no activation'), { name: 'NotAllowedError' }));
      started.set(this, (started.get(this) ?? 0) + 1);
      return Promise.resolve();
    };
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    await Promise.resolve();
    await Promise.resolve();
    allow = true;
    await music.unlock();
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeAudio.instances).toHaveLength(4);
    // Every pool element actually started on the second gesture; a slot that recorded the
    // refused attempt as done would never retry and would show no success here.
    expect(FakeAudio.instances.every((a) => (started.get(a) ?? 0) === 1)).toBe(true);
  });

  it('does not re-prime a slot a cue is using', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['home_loop'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    await music.play('home', 'snow-roof');
    const cueEl = cueElements()[0];
    await music.unlock();
    // The playing cue must not be reset to the primer.
    expect(cueEl.src).toBe('/music/home_loop.m4a');
    expect(cueElements()).toHaveLength(1);
  });

  it('disconnects both ends of a retired cue so the graph does not grow', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['home_loop', 'snow_choose_loop'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    await music.play('home', 'snow-roof');
    await music.play('choose', 'snow-roof');
    await new Promise((r) => setTimeout(r, 1700));
    // The replaced cue's gain is fully detached, and its source no longer feeds it. Only
    // the edge to its own gain may be cut: the source keeps any other connection.
    const live = FakeGain.instances.filter((g) => g.connected.size > 0 || !g.disconnected);
    const retiredGains = FakeGain.instances.filter((g) => g.disconnected);
    expect(retiredGains).toHaveLength(1);
    // Every source holds edges only to gains that are still live: one per playing cue.
    const edgesToRetired = FakeSource.instances
      .flatMap((src) => [...src.connected])
      .filter((g) => retiredGains.includes(g));
    expect(edgesToRetired).toEqual([]);
    expect(music.describe().channels).toBe(1);
    void live;
  });

  it('lets an ending play out before the result loop starts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_ending_putout', 'result_loop'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    await music.play('endingPutOut', 'snow-roof');
    const ending = cueElements().find((a) => a.src.includes('snow_ending_putout'))!;
    expect(ending.loop).toBe(false);
    // The result screen is reached at once, while the ending is still playing.
    expect(music.holdingFor('result')).toBe(true);
    // Nothing has started the loop while the ending owns the stage.
    expect(cueElements().map((a) => a.src)).not.toContain('/music/result_loop.m4a');
    ending.emit('ended');
    await Promise.resolve();
    await Promise.resolve();
    expect(cueElements().map((a) => a.src)).toContain('/music/result_loop.m4a');
    expect(music.holdingFor('result')).toBe(false);
  });

  it('starts the result loop once when the ending cue is missing, in either order', async () => {
    // The App has two callers for the result stage: the settle path starts the loop when
    // its ending never began, and the screen effect starts it as the result screen
    // appears. Their order is not fixed, and only one element may be created.
    for (const effectFirst of [true, false]) {
      FakeAudio.instances = [];
      FakeGain.instances = [];
      FakeSource.instances = [];
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['result_loop'] }) })));
      const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
      await music.unlock();
      const counter = countPlays('result_loop');
      const started = await music.play('endingPutOut', 'snow-roof');
      expect(started).toBe(false);
      expect(music.holdingFor('result')).toBe(false);
      if (effectFirst) {
        // The screen effect and the settle fallback ask in the same tick, before either
        // has finished starting.
        const fallback = music.play('result', 'snow-roof', 0.1);
        await music.play('result', 'snow-roof', 0.1);
        await fallback;
      } else {
        // The settle fallback starts the loop first; the screen effect then asks again.
        await music.play('result', 'snow-roof', 0.1);
        await music.play('result', 'snow-roof', 0.1);
      }
      // A second start reuses the same element, so the play count is the proof. A short
      // fade is passed so this settles quickly rather than sitting near the test timeout.
      await new Promise((r) => setTimeout(r, 300));
      expect(counter.plays()).toBe(1);
      expect(music.describe().channels).toBe(1);
      counter.restore();
    }
  });

  it('keeps tracking the loop when the replaced one-shot is disposed, not ended', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_walk', 'snow_choose_loop'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    const counter = countPlays('snow_choose_loop');
    await music.play('walk', 'snow-roof');
    // No `ended`: the walk is faded out by disposeChannels and reaches retire() instead,
    // which is the path that used to clear the new loop's tracking.
    await music.play('choose', 'snow-roof', 0.1);
    await new Promise((r) => setTimeout(r, 300));
    await music.play('choose', 'snow-roof');
    await new Promise((r) => setTimeout(r, 100));
    expect(counter.plays()).toBe(1);
    expect(music.describe().channels).toBe(1);
    counter.restore();
  });

  it('keeps tracking a loop after the one-shot it replaced retires', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_walk', 'snow_choose_loop'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    const counter = countPlays('snow_choose_loop');
    await music.play('walk', 'snow-roof');
    const walk = cueElements().find((a) => a.src.includes('snow_walk'))!;
    await music.play('choose', 'snow-roof', 0.1);
    // The replaced one-shot retires while the new loop is playing. If its release cleared
    // the loop's tracking, the next ask would start the cue a second time.
    walk.emit('ended');
    await new Promise((r) => setTimeout(r, 300));
    await music.play('choose', 'snow-roof');
    await new Promise((r) => setTimeout(r, 100));
    expect(counter.plays()).toBe(1);
    expect(music.describe().channels).toBe(1);
    counter.restore();
  });

  it('stops the burn timers while hidden and restarts them on return', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_burn_bed_day'] }) })));
      const doc = new EventTarget() as EventTarget & { hidden: boolean };
      doc.hidden = false;
      vi.stubGlobal('document', doc);
      const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
      await music.unlock();
      await music.play('burn', 'snow-roof');
      // A phrase falls due every 3-8 minutes; while hidden it must not be scheduled.
      const burning = vi.getTimerCount();
      expect(burning).toBeGreaterThan(0);
      doc.hidden = true;
      doc.dispatchEvent(new Event('visibilitychange'));
      // The burn watchers are gone; only timers already queued by the fade may remain.
      expect(vi.getTimerCount()).toBeLessThan(burning);
      doc.hidden = false;
      doc.dispatchEvent(new Event('visibilitychange'));
      // On return the part-of-day watch is back, and the stage was not reset.
      expect(vi.getTimerCount()).toBeGreaterThanOrEqual(burning);
      expect(music.describe().stage).toBe('burn');
    } finally {
      vi.useRealTimers();
    }
  });

  it('hands a missing ignite over to the bed at once', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_burn_bed_day'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    const started = await music.play('ignite', 'snow-roof');
    expect(started).toBe(false);
    // Nothing will ever end, so the bed must start now rather than never.
    await new Promise((r) => setTimeout(r, 50));
    expect(cueElements().map((a) => a.src)).toContain('/music/snow_burn_bed_day.m4a');
  });

  it('does not hand over from a missing ignite once the stage moved on', async () => {
    // The bed named here is the one this bucket would ask for, in day and in night; a test
    // that only listed the other bucket would pass without proving anything.
    for (const hour of [10, 23]) {
      FakeAudio.instances = [];
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 10, 19, hour, 0, 0));
      try {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_burn_bed_day', 'snow_burn_bed_night', 'result_loop'] }) })));
        const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
        await music.unlock();
        // The player put the lamp out before the bed could start; the stage is result.
        const starting = music.play('ignite', 'snow-roof');
        await music.play('result', 'snow-roof');
        expect(await starting).toBe(false);
        await new Promise((r) => setTimeout(r, 50));
        expect(music.describe().stage).toBe('result');
        const beds = cueElements().map((a) => a.src).filter((src) => src.includes('snow_burn_bed_'));
        expect(beds).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    }
  });

  it('starts choose once when a missing walk hands over and the App fallback also asks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_choose_loop'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    const counter = countPlays('snow_choose_loop');
    // Music hands a missing walk over to choose by itself now, and the App does the same
    // when its own ask reports false. Both must land on one element.
    const walk = music.play('walk', 'snow-roof');
    expect(await walk).toBe(false);
    await music.play('choose', 'snow-roof');
    await new Promise((r) => setTimeout(r, 300));
    expect(counter.plays()).toBe(1);
    expect(music.describe().channels).toBe(1);
    counter.restore();
  });

  it('does not arm the burn timers while the page is hidden', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_burn_bed_day'] }) })));
      const doc = new EventTarget() as EventTarget & { hidden: boolean };
      doc.hidden = false;
      vi.stubGlobal('document', doc);
      const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
      await music.unlock();
      doc.hidden = true;
      doc.dispatchEvent(new Event('visibilitychange'));
      // A burn started while hidden must not arm the phrase clock or the bed watch. The
      // fade's own release timer may still be queued, so the burn timers are identified by
      // running an hour of fake time: nothing may turn the bed over.
      const before = cueElements().length;
      // The bed watch is the only interval this module creates, so a spy sees it exactly.
      const spy = vi.spyOn(globalThis, 'setInterval');
      await music.play('burn', 'snow-roof');
      expect(cueElements().length).toBe(before + 1);
      // A burn started while hidden must not arm the bed watch.
      expect(spy).not.toHaveBeenCalled();
      doc.hidden = false;
      doc.dispatchEvent(new Event('visibilitychange'));
      // Back on the watch: returning arms it.
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not re-arm the burn timers when the lamp went out while hidden', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_burn_bed_day', 'result_loop'] }) })));
      const doc = new EventTarget() as EventTarget & { hidden: boolean };
      doc.hidden = false;
      vi.stubGlobal('document', doc);
      const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
      await music.unlock();
      await music.play('burn', 'snow-roof');
      doc.hidden = true;
      doc.dispatchEvent(new Event('visibilitychange'));
      // The lamp goes out while the tab is hidden.
      await music.play('result', 'snow-roof');
      // Nothing from the burn may come back: returning must not arm the bed watch, which
      // is the only interval this module creates.
      const spy = vi.spyOn(globalThis, 'setInterval');
      doc.hidden = false;
      doc.dispatchEvent(new Event('visibilitychange'));
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
      expect(music.describe().stage).toBe('result');
    } finally {
      vi.useRealTimers();
    }
  });

  it('hands a broken ignite over to the bed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['snow_ignite', 'snow_burn_bed_day', 'snow_burn_bed_golden', 'snow_burn_bed_night'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    await music.play('ignite', 'snow-roof');
    const ignite = cueElements().find((a) => a.src.includes('snow_ignite'))!;
    // The manifest lists it but the file 404s: without this hand-over the burn is silent.
    ignite.emit('error');
    await new Promise((r) => setTimeout(r, 50));
    const srcs = cueElements().map((a) => a.src);
    expect(srcs.some((src) => src.includes('snow_burn_bed_'))).toBe(true);
    expect(music.describe().stage).toBe('burn');
  });

  it('leaves each reused element connected only to the gain of the cue playing on it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cues: ['home_loop', 'snow_place_loop', 'snow_choose_loop', 'result_loop'] }) })));
    const music = createMusic({ createContext: () => new FakeContext() as unknown as AudioContext });
    await music.unlock();
    // Six stage changes reuse the same four elements several times over.
    for (const stage of ['home', 'place', 'choose', 'result', 'choose', 'home'] as const) {
      await music.play(stage, 'snow-roof', 0.1);
    }
    await new Promise((r) => setTimeout(r, 400));
    // A source that kept every edge would grow by one per reuse; with the edge cut, each
    // source holds at most the one gain of the cue it is playing.
    for (const src of FakeSource.instances) {
      expect(src.connected.size).toBeLessThanOrEqual(1);
    }
    expect(music.describe().channels).toBe(1);
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
