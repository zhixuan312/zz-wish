import { afterEach, expect, test, vi } from 'vitest';

// prefetchPlace warms Snow Roof's scene model before the build asks for it. The properties that matter are:
// one network request no matter how many callers ask, an error surfacing through the place build rather than
// as an unhandled rejection, and a retry that is allowed to run and succeed.
//
// `await import()` is used throughout because each test installs fresh mocks and resets the module registry;
// a static import would be bound to the first mock set and could not exercise the reload.

afterEach(() => {
  vi.doUnmock('../../../web/src/engine/baked/prefetchPlace.js');
  vi.doUnmock('../../../web/src/engine/scene.js');
  vi.resetModules();
});

const manifest = {
  scene: 'snow.glb.zstd',
  files: [
    { uri: 'snow.glb.zstd', bytes: 4, sha256: 'a' },
    { uri: 'hall-day.ktx2', bytes: 2, sha256: 'b' },
  ],
};

function mockBaked(assetImpl: (id: string, file: { uri: string }) => Promise<ArrayBuffer>) {
  const reads: string[] = [];
  const assets = {
    readBakedManifest: vi.fn(async () => manifest),
    readBakedAsset: vi.fn(async (id, file) => { reads.push(file.uri); return assetImpl(id, file); }),
  };
  vi.doMock('../../../web/src/engine/baked/prefetchPlace.js', () => assets);
  return { assets, reads };
}

function mockScene(prepareImpl: () => Promise<void> = async () => {}) {
  const scene = { ensureReady: vi.fn(async () => {}), preparePlace: vi.fn(prepareImpl),
    setPhase: vi.fn(), setPowerSaver: vi.fn(), setOffer: vi.fn(), setLevel: vi.fn() };
  vi.doMock('../../../web/src/engine/scene.js', () => scene);
  return scene;
}

test('the warm path reads only the scene model, never a lightmap', async () => {
  const { assets, reads } = mockBaked(async () => new ArrayBuffer(4));
  mockScene(async () => {});
  const engine = await import('../../../web/src/engine/index.ts');
  engine.boot();
  await engine.prefetchPlace('snow-roof');
  await Promise.resolve();
  await Promise.resolve();
  // readBakedAsset may be called again by the build; what the warm path must not do is pull a lightmap or
  // read anything other than the declared scene file.
  expect(reads).toContain('snow.glb.zstd');
  expect(reads.some(uri => uri.endsWith('.ktx2'))).toBe(false);
  expect(assets.readBakedManifest).toHaveBeenCalled();
});

test('a failing warm does not reject or block the place build', async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  // The warm read is rejected; the build succeeds on its own.
  const { assets } = mockBaked(async () => { throw new Error('Changed snow.glb.zstd'); });
  mockScene(async () => {});
  const engine = await import('../../../web/src/engine/index.ts');
  engine.boot();
  await expect(engine.prefetchPlace('snow-roof')).resolves.toBe(true);
  // Drain the microtask queue so a rejection that was not handled would have fired by now. Awaiting the
  // already-settled place promise is the condition; no wall-clock delay is involved.
  await Promise.resolve();
  await Promise.resolve();
  process.off('unhandledRejection', onUnhandled);
  expect(unhandled).toEqual([]);
  expect(assets.readBakedAsset).toHaveBeenCalled();
});

test('a failed place build still reports through its own error and a retry succeeds', async () => {
  let attempt = 0;
  const { assets } = mockBaked(async () => new ArrayBuffer(4));
  const scene = mockScene(async () => { attempt += 1; if (attempt === 1) throw new Error('First build failed'); });
  const engine = await import('../../../web/src/engine/index.ts');
  engine.boot();
  const stages: string[] = [];
  await expect(engine.prefetchPlace('snow-roof', progress => stages.push(progress.stage)))
    .rejects.toThrow('First build failed');
  expect(stages.at(-1)).toBe('error');
  const retry: string[] = [];
  await expect(engine.prefetchPlace('snow-roof', progress => retry.push(progress.stage))).resolves.toBe(true);
  expect(retry).toEqual(['preparing', 'ready']);
  expect(scene.preparePlace).toHaveBeenCalledTimes(2);
  expect(assets.readBakedManifest).toHaveBeenCalled();
});

test('other places do not warm a Snow Roof model', async () => {
  const { assets } = mockBaked(async () => new ArrayBuffer(4));
  const prefetch = vi.fn(async () => {});
  vi.doMock('../../../web/src/engine/baked/prefetchPlace.js', () => ({ ...assets, prefetchBakedPlace: prefetch }));
  mockScene();
  const engine = await import('../../../web/src/engine/index.ts');
  engine.boot();
  await engine.prefetchPlace('bamboo-rain');
  expect(prefetch).toHaveBeenCalledWith('bamboo-rain', expect.any(Function));
  expect(assets.readBakedAsset).not.toHaveBeenCalled();
});
