// Sample the main camera during the Step click, so walk movement can be judged rather than guessed.
//
// Install this before clicking Step. The sampler keeps the newest frame as its reference, and a one-shot
// capture listener on the Step button marks the click and freezes that reference **inside the dispatch of
// the real click**, before any other handler can run. Marking from Playwright after `await click()` would
// be too late: animation frames run between the dispatch and the promise resolving, so the reference would
// be overwritten by the first moving frame and that first movement would be lost. Each frame copies the 16
// matrix elements by value, because a live reference to the camera's array is rewritten by the very
// movement being measured.
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
    referenceFrozen: null,
    frozenAt: null,
    armed: false,
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

/**
 * Runs inside the page: arm a one-shot capture listener on the Step button.
 *
 * The listener runs in the capture phase, in the same task as the click's own dispatch, so it records the
 * click time and freezes the reference before the app's handler can move the camera. It then removes
 * itself, so a second click cannot re-freeze a reference the walk has already left behind.
 */
export function pageArmClickCapture(label) {
  const state = window.__walkSamplerState;
  if (!state) return { armed: false, reason: 'sampler is not installed' };
  const button = [...document.querySelectorAll('button')]
    .find(node => (node.textContent ?? '').trim() === label);
  if (!button) return { armed: false, reason: 'no Step button with that label' };
  if (state.armed) return { armed: false, reason: 'a capture listener is already armed' };

  const onCapture = () => {
    // Freeze before anything else in this dispatch runs.
    if (state.clickAt === null) {
      state.clickAt = performance.now();
      state.referenceFrozen = state.reference;
      state.frozenAt = state.referenceAt;
    }
    button.removeEventListener('click', onCapture, true);
    state.armed = false;
  };
  button.addEventListener('click', onCapture, true);
  state.armed = true;
  state.armedLabel = label;
  return { armed: true };
}

/** Runs inside the page: stop sampling and return a plain snapshot. */
export function pageCollect() {
  const state = window.__walkSamplerState;
  if (!state) return null;
  state.stopped = true;
  return {
    installedAt: state.installedAt,
    clickAt: state.clickAt,
    reference: state.referenceFrozen ?? state.reference,
    referenceAt: state.frozenAt ?? state.referenceAt,
    armed: state.armed,
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

  // A reference is valid only if it is exactly sixteen finite numbers. A later frame must never stand in
  // for a broken reference: substituting it would measure motion from a pose the visitor had already
  // moved away from, which is precisely the error this sampler exists to avoid.
  const usable = Array.isArray(snapshot.reference) && snapshot.reference.length === 16
    && snapshot.reference.every(Number.isFinite);
  if (!usable) {
    return { samples: [], clickAt: snapshot.clickAt ?? null,
      reasons: [...reasons, snapshot.reference
        ? 'the pre-click reference matrix is not sixteen finite elements'
        : 'no pre-click reference frame was captured'] };
  }
  if (snapshot.clickAt === null || snapshot.clickAt === undefined) {
    return { samples: [], clickAt: null, reasons: [...reasons, 'the click was never marked'] };
  }

  // Timestamps keep their fractional part: performance.now() is sub-millisecond, and rounding would blur
  // the interval the crossing is bracketed by.
  const base = snapshot.clickAt;
  const samples = [{ t: snapshot.referenceAt - base, elements: snapshot.reference }];
  let accepted = 0;
  for (const frame of snapshot.frames ?? []) {
    if (!frame || !Number.isFinite(frame.t)) { reasons.push('dropped a frame with no timestamp'); continue; }
    if (!Array.isArray(frame.elements) || frame.elements.length !== 16
      || !frame.elements.every(Number.isFinite)) {
      reasons.push('dropped a frame whose matrix is not sixteen finite elements');
      continue;
    }
    samples.push({ t: frame.t - base, elements: frame.elements });
    accepted++;
  }
  // A reference and a single valid frame are enough to decide: that frame either moved or it did not.
  if (!accepted) reasons.push('no valid frame was captured after the click');
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
