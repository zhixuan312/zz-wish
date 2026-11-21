import { afterEach, expect, test, vi } from 'vitest';
import { Burn } from '../../../web/src/burn.ts';

afterEach(() => vi.unstubAllGlobals());

test('a wake lock that arrives after lighting is refused is released immediately', async () => {
  const page = new EventTarget();
  Object.assign(page, { hidden: false, visibilityState: 'visible' });
  vi.stubGlobal('document', page);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { setInterval, clearInterval }));
  let grant!: (value: WakeLockSentinel) => void;
  const pending = new Promise<WakeLockSentinel>((resolve) => { grant = resolve; });
  vi.stubGlobal('navigator', { wakeLock: { request: () => pending } });
  const release = vi.fn(async () => {});
  const sentinel = { release, addEventListener: vi.fn() } as unknown as WakeLockSentinel;
  const ended = vi.fn();
  const burn = new Burn(600_000, ended);
  const keepingScreenOn = burn.keepScreenOn();
  burn.abort(); grant(sentinel);
  expect(await keepingScreenOn).toBe(false);
  expect(release).toHaveBeenCalledOnce();
  expect(burn.wakeOn).toBe(false);
  burn.settle('left');
  expect(ended).not.toHaveBeenCalled();
});

test('an unlit run ends once with zero burned time and its confirmed lamp ID', async () => {
  const page = Object.assign(new EventTarget(), { hidden: false, visibilityState: 'visible' });
  vi.stubGlobal('document', page);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { setInterval, clearInterval }));
  const record = { id: 'closed-lamp', durationMs: 600_000, status: 'went_out', burnedMs: 0 } as const;
  const fetch = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(async () => Response.json(record));
  vi.stubGlobal('fetch', fetch);
  const ended = vi.fn();
  const burn = new Burn(600_000, ended);
  burn.confirm(record as Parameters<Burn['confirm']>[0]);
  burn.cancelUnlit();
  burn.settle('left');
  expect(ended).toHaveBeenCalledOnce();
  expect(ended.mock.calls[0][0]).toMatchObject({ reason: 'put_out', burnedMs: 0, done: false });
  expect(await ended.mock.calls[0][0].saved).toEqual(record);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][0]).toBe('/api/candles/closed-lamp/end');
  expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({
    runId: burn.runId, reason: 'put_out', burnedMs: 0,
  });
});
