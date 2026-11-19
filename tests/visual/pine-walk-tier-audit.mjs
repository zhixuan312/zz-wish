import assert from 'node:assert/strict';
import { inspectPineWalkBackdrop, pinePackagePath, walkLightmapFiles } from './pine-preview-delivery.mjs';

// Call at the ordinary Step inside action and continue using the real walk.
// The slow case holds only the native responses until the walk is complete.
export function watchPineWalkTier(page, base, preview, run, { slow, phone }) {
  const tier = preview?.backdrop?.walk;
  if (!tier) return null;
  const deferredLightmaps = walkLightmapFiles(preview);
  const uris = new Set([...Object.values(tier.files).map(file => file.uri), ...deferredLightmaps.map(({ full }) => full.uri)]);
  const { promise: delayed, resolve: release } = Promise.withResolvers();
  const receipt = { slow, requests: [], desktopOnlyRequests: [] };
  run.walkBackdrop = receipt;
  const desktopTree = preview.backdrop.high?.trees?.uri;
  let enteredAt = null;
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== base.origin || !url.pathname.startsWith(pinePackagePath)) return;
    const uri = url.pathname.slice(pinePackagePath.length);
    if (uris.has(uri)) receipt.requests.push({ uri, afterEntryMs: enteredAt === null ? null : performance.now() - enteredAt });
    if (uri === desktopTree) receipt.desktopOnlyRequests.push(uri);
  });

  async function observe() {
    const evidence = await page.evaluate(() => ({
      state: window.__pineCaptureBackdrop?.(), clock: window.__pineCaptureWalkClock ?? null,
      lightmaps: window.__pineCaptureLighting?.()?.walkLightmaps,
      webglContextLost: window.__renderer.getContext().isContextLost(),
      jsHeapBytes: performance.memory?.usedJSHeapSize ?? null,
    }));
    assert.equal(evidence.webglContextLost, false, 'The Pine Gate renderer lost its GPU context.');
    return { ...inspectPineWalkBackdrop(evidence.state, preview, run.previewFetchedFiles),
      clock: evidence.clock, webglContextLost: evidence.webglContextLost, jsHeapBytes: evidence.jsHeapBytes,
      ...(deferredLightmaps.length ? { lightmaps: evidence.lightmaps } : {}) };
  }

  function assertNativeLightmaps(state) {
    if (!deferredLightmaps.length) return;
    assert.deepEqual(state.lightmaps.available, ['night', 'dusk', 'day', 'lamp']);
    assert(state.lightmaps.native.includes('day') && state.lightmaps.native.includes('lamp'), 'Missing native day or lamp lightmap.');
    assert.deepEqual(state.lightmaps.mix.slice(2), [1, 1], 'The active lightmap fade is still in progress.');
  }

  return {
    waitForResponses: slow ? delayed : undefined,
    release,
    async enter() {
      receipt.beforeEntry = await observe();
      assert.equal(receipt.beforeEntry.status, 'base');
      assert.deepEqual(receipt.requests, [], 'Walk tier requested before Step inside.');
      assert.deepEqual(receipt.desktopOnlyRequests, [], 'Desktop high assets requested before Step inside.');
      if (deferredLightmaps.length) {
        assert.deepEqual(receipt.beforeEntry.lightmaps.native, []);
        const softened = Object.values(preview.walkLightmaps).flatMap(region => [region.day.soft, region.lamp.soft]);
        for (const soft of softened) assert(run.previewFetchedFiles.includes(soft.uri));
      }
      enteredAt = performance.now();
    },
    async crest() {
      await page.waitForFunction(() => window.__pineCaptureWalkClock?.seconds >= 20, null, { timeout: 35_000, polling: 30 });
      receipt.crest = await observe();
      assert(receipt.crest.clock.seconds <= 20.6, 'Missed the 20-second backdrop check.');
      if (slow) {
        assert.equal(receipt.crest.mix, 0);
        assert.equal(receipt.crest.requested.length, 0, 'A held native body completed before release.');
        assert(receipt.requests.length > 0, 'No native request was in flight at the crest.');
        if (deferredLightmaps.length) assert.deepEqual(receipt.crest.lightmaps.native, []);
      } else {
        assert.equal(receipt.crest.status, 'active', 'Walk backdrop did not finish its fade by the crest.');
        assertNativeLightmaps(receipt.crest);
      }
    },
    async settled() {
      if (slow) {
        receipt.softAtArrival = await observe();
        assert.equal(receipt.softAtArrival.mix, 0, 'The held native tiers changed the soft arrival frame.');
        if (deferredLightmaps.length) assert.deepEqual(receipt.softAtArrival.lightmaps.native, []);
        release();
        const samples = await page.evaluate(hasLightmaps => new Promise(resolve => {
          const start = performance.now();
          const traces = { backdrop: [], ...(hasLightmaps ? { day: [], lamp: [] } : {}) };
          const add = (key, value) => { if (traces[key].at(-1) !== value) traces[key].push(value); };
          function frame() {
            add('backdrop', window.__pineCaptureBackdrop().backdrop.planes[0].high.mix);
            if (hasLightmaps) {
              const banks = window.__pineCaptureLighting().walkLightmaps;
              add('day', banks.native.includes('day') ? banks.mix[2] : 0);
              add('lamp', banks.native.includes('lamp') ? banks.mix[3] : 0);
            }
            if (Object.values(traces).every(trace => trace.at(-1) === 1) || performance.now() - start > 30_000) resolve(traces);
            else requestAnimationFrame(frame);
          }
          frame();
        }), !!deferredLightmaps.length);
        receipt.fadeSamples = samples.backdrop;
        if (deferredLightmaps.length) receipt.lightmapFadeSamples = { day: samples.day, lamp: samples.lamp };
        for (const [key, trace] of Object.entries(samples)) {
          assert.equal(trace[0], 0);
          assert.equal(trace.at(-1), 1);
          assert(trace.some(mix => mix > 0 && mix < 1), `The ${key} tier popped to native in one frame.`);
          assert(trace.every((mix, i) => !i || mix > trace[i - 1]), `The ${key} fade moved backward.`);
        }
      }
      receipt.settled = await observe();
      assert.equal(receipt.settled.status, 'active');
      assertNativeLightmaps(receipt.settled);
      assert(receipt.requests.every(request => request.afterEntryMs !== null), 'Walk tier was requested before entry.');
      assert.deepEqual(new Set(receipt.requests.map(request => request.uri)), uris);
      if (phone) assert.deepEqual(receipt.desktopOnlyRequests, [], 'Phone downloaded the desktop tree upgrade.');
    },
  };
}
