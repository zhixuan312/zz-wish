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
