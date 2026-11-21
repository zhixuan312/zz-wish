# Walk movement: what the judge can see, and what each build exposes

This note records why the walk's first movement cannot be measured from the current production build, what
a view-matrix judge adds, and the minimum live work that would settle it. It accompanies
`tests/tier2/walk-camera-judge.mjs`, whose synthetic tests run offline.

## What each build exposes

| build | `import.meta.env.DEV` | `VITE_E2E_HOOKS` | walk progress | main camera |
|---|---|---|---|---|
| `npm run dev` | true | unset | `window.__walkProgress` present | `window.__pineRenderCamera` present |
| `npm run build` (production) | false | unset | absent | absent |
| Tier 1 build (`VITE_E2E_HOOKS=1`) | false | `'1'` | **absent** | `window.__pineRenderCamera` present |

Two facts follow from `web/src/engine/scene.js`:

- `__walkProgress` is assigned at lines 2442, 2446, 2483 and 2487, each guarded by
  `if (import.meta.env.DEV)` alone. It is therefore **compiled out of the Tier 1 build as well**, not only
  out of production. Reading it requires the dev server.
- `__pineRenderCamera` is guarded by `if (import.meta.env.DEV || import.meta.env.VITE_E2E_HOOKS === '1')`
  (line 47), so the Tier 1 build does expose the one main render camera. Production exposes nothing.

The main camera is a single object, `new THREE.PerspectiveCamera(...)` at line 44. The other cameras in the
scene belong to lights (`light.shadow.camera`, e.g. lines 871 and 1861) and to previews (line 2268). A
movement reading must therefore come from `__pineRenderCamera`, never from a shadow or preview camera;
those track their own targets and would report motion that the visitor never sees.

## What the judge decides

`judgeCameraMotion(samples)` takes `{t, elements}` samples of a **main-camera** `matrixWorldInverse` and
returns one of `moving`, `rotating`, `still`, `unknown`.

- Position is recovered as `p = -(Rᵀ t)` from the inverse, **not** as `-t`. The inverse's translation
  column is `-Rᵀp`, so a rotated camera's translation differs from its position; reading `-t` made a
  rotating camera look like it was moving. Verified against three.js: a camera at `(0,5,10)` yields a
  position error of at most `2e-15` at three different orientations.
- Forward is the negated **third row** of the world-inverse (`elements[2], [6], [10]`), which is the
  camera's world forward basis. Taking `elements[8], [9], [10]` reads the third column and agrees only when
  there is no pitch and no roll; compared with `getWorldDirection()` on a yaw+pitch pose the column reading
  is wrong by 1.36.
- Rotation is the full relative 3x3 rotation, `acos((trace(RaᵀRb) − 1) / 2)`, not just the forward axis.
  A pure roll about the view axis leaves forward unchanged, so a forward-only test calls a camera that
  visibly turned "still".
- Thresholds default to 1 mm and 1 mrad; both are parameters.
- Displacement is cumulative from the **first sample, taken before the Step click**, not a per-frame step.
  A walk that gains 0.4 mm per frame never exceeds a 1 mm step, yet reaches 2 mm in five frames; per-frame
  comparison therefore reports `still` for real movement.
- The reported time is `firstExceedance`, the first sample at which cumulative displacement passes the
  threshold, with `bounds = { earliest: previousSampleT, latest: thatSampleT }`. Those bounds enclose where
  the **threshold was crossed**, which is not the moment motion began: a continuous slow walk began earlier,
  in the interval the samples cannot resolve.
- `unknown` is returned rather than a guess when fewer than two valid samples exist, and non-finite
  matrices are dropped with a stated reason.

Synthetic coverage (`npx vitest run tests/tier2/walk-camera-judge.test.mjs`, offline, no GPU): position and
forward extraction against three.js at three orientations; forward against `getWorldDirection()` on a
yaw+pitch pose; a pure roll reported as `rotating` though forward never changes; a camera that never moves
while the picture animates reads `still`; rotate-only reads `rotating` with `firstExceedance: null`; a 2 cm
translation reads `moving` with a two-sample bracket; a 0.4 mm-per-frame walk reaching 1.2 mm reads
`moving` with `bounds {32, 48}`; a single 0.5 mm drift reads `still`; an empty or NaN-only sequence and a
single sample read `unknown` instead of `still`. **10 tests pass.**

`walk-camera-sampler.test.mjs` drives the sampling transform against simulated frames: a walk starting
after the click rebases to the click with the pre-click frame at −100 ms and reports the crossing at
(32, 48]; a reference copied by value survives the source array being overwritten; no reference, no click
mark, a missing camera and a sampler error each yield `unknown` with their own reason; a still camera stays
still; a null snapshot is `unknown`; and the median interval is reported or null with one sample.
**9 tests pass.** Reverting the no-reference guard was confirmed to fail exactly its own test.

Both regressions were re-introduced to confirm the tests catch them: reading forward from
`elements[8..10]` fails only the `getWorldDirection` case, and comparing consecutive samples instead of the
reference fails only the slow-walk case.

## What this does not establish

The judge cannot be applied to the baseline records at all. Those records carry only a canvas-proxy mark
(`basis: 'canvas-proxy'`, `armReason: 'no-fade'`, `maxOpacity: 0`), and the production bundle they were
taken from exposes neither the camera nor the walk progress. **No production first-step time is claimed
here, and none can be derived from the existing matrix.**

## Runnable E2E entry point

`tests/tier2/walk-camera-sampler.mjs` is the sampling half, ready to drive from a browser test. It reads
only `window.__pineRenderCamera`, keeps replacing its reference frame every animation frame until the
click is marked, then copies each frame's `matrixWorldInverse.elements` by value and timestamps it with the
same `performance.now()` clock as the click.

Invocation from a Playwright test (the page must be a `VITE_E2E_HOOKS=1` build):

```js
import { pageSampler, pageMarkClick, pageCollect, samplesFromSnapshot, sampleInterval }
  from './walk-camera-sampler.mjs';
import { judgeCameraMotion } from './walk-camera-judge.mjs';

await page.evaluate(pageSampler);            // install before the Step click
await page.waitForTimeout(300);              // let a few pre-click frames land
const step = page.getByRole('button', { name: 'Step inside', exact: true });
await step.click();
await page.evaluate(pageMarkClick);          // stamp the click on the sampler's clock
await page.waitForTimeout(4000);
const snapshot = await page.evaluate(pageCollect);
const { samples, reasons } = samplesFromSnapshot(snapshot);
const verdict = judgeCameraMotion(samples);
console.log(verdict.verdict, verdict.firstExceedance, verdict.bounds, sampleInterval(samples), reasons);
```

What it reports: the verdict, `firstExceedance` (the first sample past the threshold), the bracket around
that crossing, the median sample interval, and every reason a sample was dropped or a stage could not be
measured. `unknown` is returned when there is no pre-click reference, no click mark, or no main camera —
each with its own sentence, never a silent `still`.

## Minimum live work to settle it

1. Build with `VITE_E2E_HOOKS=1` (the Tier 1 configuration) — this exposes `__pineRenderCamera`.
2. Sample `window.__pineRenderCamera.matrixWorldInverse.elements` on every `requestAnimationFrame`
   **starting before the Step click**, tagging each sample with `performance.now()`. The first sample is the
   reference the judge measures cumulative displacement from; starting at the click would lose it.
3. Feed the samples to `judgeCameraMotion` and report its verdict, `firstExceedance`, the bracket around the
   threshold crossing, and the thresholds used. Do not report the bracket as the moment motion began.
4. Reject any sample whose camera is not `__pineRenderCamera`; that is the only guard against a shadow or
   preview camera being sampled by mistake.

That measurement would still be an E2E-build number, not a production one. A production figure would need
a deliberate, reviewed decision to ship a camera-position signal in the production bundle; nothing in this
note proposes that.
