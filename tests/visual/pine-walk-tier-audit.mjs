import assert from 'node:assert/strict';
import { inspectPineWalkBackdrop, pinePackagePath } from './pine-preview-delivery.mjs';

// Call at the ordinary Step inside action and continue using the real walk.
// The slow case holds only the native responses until the walk is complete.
export function watchPineWalkTier(page, base, preview, run, { slow, phone }) {
  const tier = preview?.backdrop?.walk;
  if (!tier) return null;
  const uris = new Set(Object.values(tier.files).map(file => file.uri));
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
      webglContextLost: window.__renderer.getContext().isContextLost(),
      jsHeapBytes: performance.memory?.usedJSHeapSize ?? null,
    }));
    assert.equal(evidence.webglContextLost, false, 'The Pine Gate renderer lost its GPU context.');
    return { ...inspectPineWalkBackdrop(evidence.state, preview, run.previewFetchedFiles),
      clock: evidence.clock, webglContextLost: evidence.webglContextLost, jsHeapBytes: evidence.jsHeapBytes };
  }

  return {
    waitForResponses: slow ? delayed : undefined,
    release,
    async enter() {
      receipt.beforeEntry = await observe();
      assert.equal(receipt.beforeEntry.status, 'base');
      assert.deepEqual(receipt.requests, [], 'Walk tier requested before Step inside.');
      assert.deepEqual(receipt.desktopOnlyRequests, [], 'Desktop high assets requested before Step inside.');
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
      } else {
        assert.equal(receipt.crest.status, 'active', 'Walk backdrop did not finish its fade by the crest.');
      }
    },
    async settled() {
      if (slow) {
        receipt.softAtArrival = await observe();
        assert.equal(receipt.softAtArrival.mix, 0, 'The held native tiers changed the soft arrival frame.');
        release();
        receipt.fadeSamples = await page.evaluate(() => new Promise(resolve => {
          const start = performance.now();
          const samples = [];
          function frame() {
            const mix = window.__pineCaptureBackdrop().backdrop.planes[0].high.mix;
            if (samples.at(-1) !== mix) samples.push(mix);
            if (mix === 1 || performance.now() - start > 30_000) resolve(samples);
            else requestAnimationFrame(frame);
          }
          frame();
        }));
        assert.equal(receipt.fadeSamples[0], 0);
        assert.equal(receipt.fadeSamples.at(-1), 1);
        assert(receipt.fadeSamples.some(mix => mix > 0 && mix < 1), 'The upgrade popped to native in one frame.');
        assert(receipt.fadeSamples.every((mix, i, samples) => !i || mix > samples[i - 1]), 'The backdrop fade moved backward.');
      }
      receipt.settled = await observe();
      assert.equal(receipt.settled.status, 'active');
      assert(receipt.requests.every(request => request.afterEntryMs !== null), 'Walk tier was requested before entry.');
      assert.deepEqual(new Set(receipt.requests.map(request => request.uri)), uris);
      if (phone) assert.deepEqual(receipt.desktopOnlyRequests, [], 'Phone downloaded the desktop tree upgrade.');
    },
  };
}
