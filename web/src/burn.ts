// The burn clock and the extinguish rules for one lighting.
// Time is anchored at the light tap; leaving settles exactly once, before any animation.
import { reportEnd, type Candle, type EndReason } from './api.ts';

export interface Settlement { reason: EndReason; burnedMs: number; done: boolean; saved: Promise<Candle | null> }

export class Burn {
  // getRandomValues works on plain http too (randomUUID needs a secure context, e.g. a phone on a LAN address).
  readonly runId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, '0')).join('');
  private start = performance.now();
  private candle: Candle | null = null;
  private durationMs: number;
  private settled: { reason: EndReason; burnedMs: number } | null = null;
  private timer = 0;
  private wake: WakeLockSentinel | null = null;
  private onEnd: (s: Settlement) => void;
  wakeOn = false;

  constructor(plannedMs: number, onEnd: (s: Settlement) => void) {
    this.durationMs = plannedMs;
    this.onEnd = onEnd;
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onLeave);
    window.addEventListener('pagehide', this.onLeave);
    this.timer = window.setInterval(() => { if (this.elapsed() >= this.durationMs) this.settle('complete'); }, 250);
    if (document.hidden) queueMicrotask(() => this.settle('left'));
  }

  async keepScreenOn(): Promise<boolean> {
    try { this.wake = await navigator.wakeLock.request('screen'); this.wakeOn = true; this.wake.addEventListener('release', () => { this.wakeOn = false; }); }
    catch { this.wakeOn = false; }
    return this.wakeOn;
  }

  /** The server confirmed the lighting. A leave that happened while waiting is reported now. */
  confirm(candle: Candle) {
    this.candle = candle;
    this.durationMs = candle.durationMs;
    if (this.settled) this.report();
  }

  /** The lighting was refused; nothing burned. */
  abort() { this.detach(); }

  elapsed() { return Math.min(performance.now() - this.start, this.durationMs); }
  get planned() { return this.durationMs; }
  get candleId() { return this.candle?.id ?? null; }
  get isSettled() { return this.settled !== null; }

  private onVisibility = () => { if (document.visibilityState === 'hidden') this.settle('left'); };
  private onLeave = () => this.settle('left');

  settle(reason: EndReason) {
    if (this.settled) return;
    const burnedMs = this.elapsed();
    const done = burnedMs >= this.durationMs;
    this.settled = { reason: done ? 'complete' : reason, burnedMs };
    this.detach();
    const saved = this.candle ? this.report() : new Promise<Candle | null>((res) => { this.pendingSaved = res; });
    this.onEnd({ reason: this.settled.reason, burnedMs, done, saved });
  }

  private pendingSaved: ((c: Candle | null) => void) | null = null;
  private report(): Promise<Candle | null> {
    const p = reportEnd({ candleId: this.candle!.id, runId: this.runId, reason: this.settled!.reason, burnedMs: this.settled!.burnedMs });
    if (this.pendingSaved) { const res = this.pendingSaved; this.pendingSaved = null; p.then(res); }
    return p;
  }

  private detach() {
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onLeave);
    window.removeEventListener('pagehide', this.onLeave);
    this.wake?.release().catch(() => {});
  }
}
