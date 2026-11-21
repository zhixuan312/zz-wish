// Sample the main camera during the Step click, so walk movement can be judged rather than guessed.
//
// Install this before clicking Step. `install` records a reference on every frame while the camera is
// still, so the last frame before the click is the reference the judge measures from; `markClick` stamps
// the click on the same `performance.now()` clock as the samples. Each frame copies the 16 matrix elements
// by value: a live reference to the camera's array would be rewritten by the very movement being measured.
//
// Only `window.__pineRenderCamera` is read. That object is absent from production and from the Tier 1
// build's absence of walk progress, so this sampler reports `unknown` when it is missing rather than
// falling back to any other camera; shadow and preview cameras would report motion the visitor never sees.
//
// This module has no browser imports. The E2E harness evaluates `pageSampler` in the page; the offline
// tests in walk-camera-sampler.test.mjs drive the same logic against simulated frames.

/** Runs inside the page. Returns nothing; state lives on `window.__walkSamplerState`. */
export function pageSampler() {
  const state = {
    installedAt: performance.now(),
    clickAt: null,
    reference: null,
    referenceAt: null,
    frames: [],
    stopped: false,
    missing: 0,
    errors: [],
  };
  window.__walkSamplerState = state;

  const readCamera = () => {
    const camera = window.__pineRenderCamera;
    if (!camera || !camera.matrixWorldInverse) { state.missing++; return null; }
    const elements = Array.from(camera.matrixWorldInverse.elements);
    return elements.every(Number.isFinite) ? elements : null;
  };

  const tick = () => {
    if (state.stopped) return;
    try {
      const t = performance.now();
      const elements = readCamera();
      if (elements) {
        // Before the click the camera is expected to be still; keep replacing the reference so the last
        // pre-click frame is the one used. After the click every frame is a sample.
        if (state.clickAt === null) {
          state.reference = elements;
          state.referenceAt = t;
        } else {
          state.frames.push({ t, elements });
        }
      }
    } catch (error) {
      state.errors.push(String(error?.message ?? error).slice(0, 160));
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Runs inside the page: stamp the click on the sampler's clock. */
export function pageMarkClick() {
  const state = window.__walkSamplerState;
  if (!state) return null;
  state.clickAt = performance.now();
  return state.clickAt;
}

/** Runs inside the page: stop sampling and return a plain snapshot. */
export function pageCollect() {
  const state = window.__walkSamplerState;
  if (!state) return null;
  state.stopped = true;
  return {
    installedAt: state.installedAt,
    clickAt: state.clickAt,
    reference: state.reference,
    referenceAt: state.referenceAt,
    frames: state.frames.map(frame => ({ t: frame.t, elements: frame.elements })),
    missing: state.missing,
    errors: state.errors,
  };
}

/**
 * Turn a sampler snapshot into judge input, or an explicit unknown.
 *
 * Times are rebased to the click, because the question is how long after the click the camera moved; the
 * reference is rebased to 0. A snapshot with no reference, no click, or no frames cannot answer and says so.
 */
export function samplesFromSnapshot(snapshot) {
  const reasons = [];
  if (!snapshot) return { samples: [], clickAt: null, reasons: ['no sampler snapshot was collected'] };
  if (snapshot.missing) reasons.push(`the main camera was absent on ${snapshot.missing} frame(s)`);
  if (snapshot.errors?.length) reasons.push(`sampler errors: ${snapshot.errors.join('; ')}`);
  if (snapshot.referenceAt === null || snapshot.referenceAt === undefined) {
    return { samples: [], clickAt: snapshot.clickAt ?? null,
      reasons: [...reasons, 'no pre-click reference frame was captured'] };
  }
  if (snapshot.clickAt === null || snapshot.clickAt === undefined) {
    return { samples: [], clickAt: null, reasons: [...reasons, 'the click was never marked'] };
  }
  const base = snapshot.clickAt;
  const samples = [{ t: Math.round(snapshot.referenceAt - base), elements: snapshot.reference }];
  for (const frame of snapshot.frames ?? []) {
    if (!Array.isArray(frame.elements) || frame.elements.length !== 16) continue;
    samples.push({ t: Math.round(frame.t - base), elements: frame.elements });
  }
  if (samples.length < 3) reasons.push(`only ${samples.length} sample(s) after rebasing; the judge needs a reference and at least one frame`);
  return { samples, clickAt: base, reasons };
}

/** Median gap between consecutive samples, in milliseconds, or null with fewer than two. */
export function sampleInterval(samples) {
  const sorted = (samples ?? []).slice().sort((a, b) => a.t - b.t);
  if (sorted.length < 2) return null;
  const gaps = [];
  for (let index = 1; index < sorted.length; index++) gaps.push(sorted[index].t - sorted[index - 1].t);
  gaps.sort((a, b) => a - b);
  const middle = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[middle] : (gaps[middle - 1] + gaps[middle]) / 2;
}
