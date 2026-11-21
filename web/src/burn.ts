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
  private active = true;
  private waitingForWick: boolean;
  private onEnd: (s: Settlement) => void;
  wakeOn = false;

  constructor(plannedMs: number, onEnd: (s: Settlement) => void, waitForWick = false) {
    this.waitingForWick = waitForWick;
    this.durationMs = plannedMs;
    this.onEnd = onEnd;
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onLeave);
    window.addEventListener('pagehide', this.onLeave);
    this.timer = window.setInterval(() => { if (this.elapsed() >= this.durationMs) this.settle('complete'); }, 250);
    if (document.hidden) queueMicrotask(() => this.settle('left'));
  }

  async keepScreenOn(): Promise<boolean> {
    try {
      const wake = await navigator.wakeLock.request('screen');
      if (!this.active) { await wake.release(); return false; }
      this.wake = wake; this.wakeOn = true; wake.addEventListener('release', () => { this.wakeOn = false; });
    }
    catch { this.wakeOn = false; }
    return this.wakeOn;
  }

  /** The server confirmed the lighting. A leave that happened while waiting is reported now. */
  confirm(candle: Candle) {
    this.candle = candle;
    this.durationMs = candle.durationMs;
    if (this.settled) return this.report();
  }

  /** The lighting was refused; nothing burned. */
  abort() { this.detach(); }

  elapsed() { return Math.min(performance.now() - this.start, this.durationMs); }
  get planned() { return this.durationMs; }
  get candleId() { return this.candle?.id ?? null; }
  get isSettled() { return this.settled !== null; }
  get isWaitingForWick() { return this.waitingForWick; }

  wickCaught() { this.waitingForWick = false; }
  retrySettlement() { return this.settled ? this.report() : Promise.resolve(null); }

  private onVisibility = () => { if (document.visibilityState === 'hidden') this.settle('left'); };
  private onLeave = () => this.settle('left');

  settle(reason: EndReason) {
    if (this.settled || !this.active) return;
    // The timer keeps its tap origin once the wick catches. Before contact
    // a cancelled Bell Lane run has no burnt oil to leave on the rack.
    const burnedMs = this.waitingForWick ? 0 : this.elapsed();
    const done = burnedMs >= this.durationMs;
    this.settled = { reason: done ? 'complete' : reason, burnedMs };
    this.detach();
    const saved = this.report();
    this.onEnd({ reason: this.settled.reason, burnedMs, done, saved });
  }

  private report(): Promise<Candle | null> {
    // A refresh may destroy this page before the lighting response arrives.
    // Persist the run ID now; it is enough to settle the authenticated visitor's candle.
    return reportEnd({ candleId: this.candle?.id ?? null, runId: this.runId, reason: this.settled!.reason, burnedMs: this.settled!.burnedMs });
  }

  private detach() {
    this.active = false; this.wakeOn = false;
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onLeave);
    window.removeEventListener('pagehide', this.onLeave);
    this.wake?.release().catch(() => {});
  }
}
