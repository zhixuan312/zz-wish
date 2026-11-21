import { afterEach, expect, test, vi } from 'vitest';
import type { Shape } from '../../../shared/rules.ts';

afterEach(() => {
  vi.doUnmock('../../../web/src/engine/scene.js');
  vi.doUnmock('../../../web/src/engine/baked/prefetchPlace.js');
  vi.resetModules();
});
function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function mockPrefetch() {
  const prefetch = vi.fn(async (_id: string, progress: (value: object) => void) => {
    progress({ loadedBytes: 100, totalBytes: 100, ratio: 1, stage: 'ready' });
  });
  vi.doMock('../../../web/src/engine/baked/prefetchPlace.js', () => ({ prefetchBakedPlace: prefetch }));
  return prefetch;
}
function mockScene(ensureReady: () => Promise<void>) {
  const scene = { ensureReady: vi.fn(ensureReady), preparePlace: vi.fn(async () => {}), setPhase: vi.fn(), setPowerSaver: vi.fn(), setOffer: vi.fn(), setLevel: vi.fn() };
  vi.doMock('../../../web/src/engine/scene.js', () => scene);
  return scene;
}

test('a failed cover attempt can retry Snow preparation and resolve the original first-success barrier', async () => {
  const first = deferred(), scene = mockScene(vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined));
  mockPrefetch();
  const engine = await import('../../../web/src/engine/index.ts');
  let ready = false; void engine.ready.then(() => { ready = true; });
  engine.boot();
  const stages: string[] = [];
  const failed = engine.prefetchPlace('snow-roof', progress => stages.push(progress.stage));
  await vi.waitFor(() => expect(stages).toContain('preparing'));
  first.reject(new Error('Temporary Cloud download failure'));
  await expect(failed).rejects.toThrow('Temporary Cloud download failure');
  expect(stages.at(-1)).toBe('error'); expect(ready).toBe(false);
  expect(scene.preparePlace).not.toHaveBeenCalled();
  const retryStages: string[] = [];
  await engine.prefetchPlace('snow-roof', progress => retryStages.push(progress.stage));
  await engine.ready;
  expect(scene.ensureReady).toHaveBeenCalledTimes(2);
  expect(scene.preparePlace).toHaveBeenCalledExactlyOnceWith('snow-roof');
  expect(retryStages).toEqual(['preparing','ready']); expect(ready).toBe(true);
  await engine.prefetchPlace('snow-roof');
  expect(scene.ensureReady).toHaveBeenCalledTimes(2);
});

test('files can finish without warming a default place the visitor has left', async () => {
  const scene = mockScene(async () => {});
  const download = mockPrefetch(), wait = deferred();
  const engine = await import('../../../web/src/engine/index.ts');
  engine.boot();
  const stages: string[] = [];
  const stale = engine.prefetchPlace('snow-roof', progress => stages.push(progress.stage), async () => {
    await wait.promise;
    return false;
  });
  await vi.waitFor(() => expect(stages).toEqual(['preparing']));
  // Snow Roof no longer downloads before the warm decision, so a place the visitor has left costs no bytes.
  expect(download).not.toHaveBeenCalled();
  expect(scene.preparePlace).not.toHaveBeenCalled();
  await expect(engine.prefetchPlace('pine-gate')).resolves.toBe(true);
  wait.resolve();
  await expect(stale).resolves.toBe(false);
  expect(scene.preparePlace).toHaveBeenCalledExactlyOnceWith('pine-gate');
  expect(stages).toEqual(['preparing']);
});

test('fire-and-forget effects survive failure and replay only their latest requested state', async () => {
  const first = deferred(), scene = mockScene(vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined));
  mockPrefetch();
  const engine = await import('../../../web/src/engine/index.ts');
  engine.boot();
  const shape: Shape = { kind: 'shade', color: 0xa82a1c, rows: [{ y: 0, r: .03, cx: 0 }, { y: .12, r: .04, cx: .01 }] };
  engine.setPhase('place'); engine.setPhase('candle');
  engine.setPowerSaver(true); engine.setPowerSaver(false);
  engine.setOffer(shape); engine.setOffer(null);
  engine.setLevel(.2); engine.setLevel(.7);
  const failedStages: string[] = [];
  const failed = engine.prefetchPlace('snow-roof', progress => failedStages.push(progress.stage));
  // `preparing` is now emitted synchronously, before the scene module resolves, so wait on the startup call
  // itself rather than on the progress array.
  await vi.waitFor(() => expect(scene.ensureReady).toHaveBeenCalledOnce());
  expect(failedStages).toContain('preparing');
  first.reject(new Error('Temporary cover compile failure'));
  await expect(failed).rejects.toThrow('Temporary cover compile failure');
  expect(scene.setPhase).not.toHaveBeenCalled();
  await engine.prefetchPlace('snow-roof');
  expect(scene.setPhase).toHaveBeenCalledExactlyOnceWith('candle');
  expect(scene.setPowerSaver).toHaveBeenCalledExactlyOnceWith(false);
  expect(scene.setOffer).toHaveBeenCalledExactlyOnceWith(null);
  expect(scene.setLevel).toHaveBeenCalledExactlyOnceWith(.7);
  engine.setPhase('burning'); expect(scene.setPhase).toHaveBeenLastCalledWith('burning');
});

test('only Snow Roof prepares on demand; every other place still downloads its manifest up front', async () => {
  mockScene(async () => {});
  const download = mockPrefetch();
  const engine = await import('../../../web/src/engine/index.ts');
  engine.boot();
  const { PLACES } = await import('../../../shared/places.ts');
  const onDemand = new Set(['pine-gate', 'snow-roof']);
  const eager = PLACES.map(p => p.id).filter(id => !onDemand.has(id));
  expect(eager.length).toBeGreaterThan(0);
  for (const id of eager) {
    download.mockClear();
    const stages: string[] = [];
    await engine.prefetchPlace(id, progress => stages.push(progress.stage));
    expect(download).toHaveBeenCalledExactlyOnceWith(id, expect.any(Function));
    // The manifest download is the only progress source, so the bar keeps a measured value for these places.
    expect(stages).toEqual(['preparing', 'ready']);
  }
  download.mockClear();
  const snow: string[] = [];
  await engine.prefetchPlace('snow-roof', progress => snow.push(progress.stage));
  expect(download).not.toHaveBeenCalled();
  expect(snow).toEqual(['preparing', 'ready']);
});

test('a module-import failure is surfaced and is not described as an asset-startup retry', async () => {
  const moduleFactory = vi.fn(() => { throw new Error('Engine module unavailable'); });
  vi.doMock('../../../web/src/engine/scene.js', moduleFactory); mockPrefetch();
  const engine = await import('../../../web/src/engine/index.ts'); engine.boot();
  const failure = await engine.prefetchPlace('snow-roof').catch(error => error);
  expect(failure).toBeInstanceOf(Error);
  // Vitest wraps an import factory failure; the browser's exact error wrapping
  // is deliberately not claimed. The same failed module remains rejected.
  expect(failure.cause).toMatchObject({ message: 'Engine module unavailable' });
  const retried = await engine.prefetchPlace('snow-roof').catch(error => error);
  expect(retried).toBe(failure);
  expect(moduleFactory).toHaveBeenCalledOnce();
});
