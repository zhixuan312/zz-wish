import { afterEach, expect, test, vi } from 'vitest';

// The currency guard must drop only work that has not started. These cases pin the four situations Boss named:
// a stale preview build, a current build, a place picked back before its build was handed off, and a retry.
//
// `await import()` is used because each test installs fresh mocks and resets the registry.

afterEach(() => {
  vi.doUnmock('../../../web/src/engine/baked/prefetchPlace.js');
  vi.doUnmock('../../../web/src/engine/scene.js');
  vi.resetModules();
});

function mockBaked() {
  vi.doMock('../../../web/src/engine/baked/prefetchPlace.js', () => ({
    readBakedManifest: vi.fn(async () => ({ scene: 'snow.glb.zstd', files: [
      { uri: 'snow.glb.zstd', bytes: 4, sha256: 'a' }] })),
    readBakedAsset: vi.fn(async () => new ArrayBuffer(4)),
    prefetchBakedPlace: vi.fn(async () => {}),
  }));
}

function mockScene(prepareImpl: () => Promise<void> = async () => {}) {
  const scene = { ensureReady: vi.fn(async () => {}), preparePlace: vi.fn(prepareImpl),
    setPhase: vi.fn(), setPowerSaver: vi.fn(), setOffer: vi.fn(), setLevel: vi.fn() };
  vi.doMock('../../../web/src/engine/scene.js', () => scene);
  return scene;
}

test('a stale selection skips the build before it starts', async () => {
  mockBaked();
  const scene = mockScene();
  const engine = await import('../../../web/src/engine/index.ts');
  engine.boot();
  const current = false;
  const prepared = await engine.prefetchPlace('pine-gate', undefined, undefined, () => current);
  expect(prepared).toBe(false);
  // The build was never handed off, so nothing was fetched for it.
  expect(scene.preparePlace).not.toHaveBeenCalled();
});

test('the current selection runs its build', async () => {
  mockBaked();
  const scene = mockScene();
  const engine = await import('../../../web/src/engine/index.ts');
  engine.boot();
  const prepared = await engine.prefetchPlace('pine-gate', undefined, undefined, () => true);
  expect(prepared).toBe(true);
  expect(scene.preparePlace).toHaveBeenCalledExactlyOnceWith('pine-gate');
});

test('picking the place back before the build is handed off keeps it', async () => {
  mockBaked();
  const scene = mockScene();
  const engine = await import('../../../web/src/engine/index.ts');
  engine.boot();
  // The visitor leaves and returns while initialize() is still resolving; by the time the check runs the
  // selection is current again, so the build must proceed.
  let current = false;
  queueMicrotask(() => { current = true; });
  const prepared = await engine.prefetchPlace('pine-gate', undefined, undefined, () => current);
  expect(prepared).toBe(true);
  expect(scene.preparePlace).toHaveBeenCalledOnce();
});

test('a retry is never skipped by the guard', async () => {
  mockBaked();
  const scene = mockScene();
  const engine = await import('../../../web/src/engine/index.ts');
  engine.boot();
  // App passes no guard for a retry, so this call mirrors that: the guard argument is absent.
  const prepared = await engine.prefetchPlace('pine-gate');
  expect(prepared).toBe(true);
  expect(scene.preparePlace).toHaveBeenCalledOnce();
});

test('a build already in progress is not cancelled by a later selection change', async () => {
  mockBaked();
  let releaseBuild!: () => void, signalStarted!: () => void;
  const release = new Promise<void>(resolve => { releaseBuild = resolve; });
  const started = new Promise<void>(resolve => { signalStarted = resolve; });
  // preparePlace signals that the build has begun, then blocks; only after that does the selection change.
  const scene = mockScene(async () => { signalStarted(); await release; });
  const engine = await import('../../../web/src/engine/index.ts');
  engine.boot();
  let current = true;
  const running = engine.prefetchPlace('pine-gate', undefined, undefined, () => current);
  await started;
  current = false;
  releaseBuild();
  await expect(running).resolves.toBe(true);
  // Started work runs to completion; the guard only decides whether to start.
  expect(scene.preparePlace).toHaveBeenCalledOnce();
});
