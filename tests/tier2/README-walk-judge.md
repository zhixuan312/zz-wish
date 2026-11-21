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
- Orientation is the negative Z column, so a turn can be reported separately from a displacement.
- Thresholds default to 1 mm and 1 mrad; both are parameters.
- The onset is bracketed, never asserted at a point: the first moving pair gives
  `bounds = { earliest: previousT, latest: currentT }`, because the change happened somewhere in that
  interval.
- `unknown` is returned rather than a guess when fewer than two valid samples exist, and non-finite
  matrices are dropped with a stated reason.

Synthetic coverage (`npm --prefix . exec vitest run tests/tier2/walk-camera-judge.test.mjs`, offline, no GPU):
a camera that never moves while the picture animates reads `still`; one that only turns reads `rotating`
with `firstMovement: null`; a 2 cm translation reads `moving` at the later sample with a two-sample
bracket; a 0.5 mm drift reads `still`; an empty or NaN-only sequence reads `unknown`; a single sample reads
`unknown` instead of `still`. **7 tests pass.**

## What this does not establish

The judge cannot be applied to the baseline records at all. Those records carry only a canvas-proxy mark
(`basis: 'canvas-proxy'`, `armReason: 'no-fade'`, `maxOpacity: 0`), and the production bundle they were
taken from exposes neither the camera nor the walk progress. **No production first-step time is claimed
here, and none can be derived from the existing matrix.**

## Minimum live work to settle it

1. Build with `VITE_E2E_HOOKS=1` (the Tier 1 configuration) — this exposes `__pineRenderCamera`.
2. In the page, sample `window.__pineRenderCamera.matrixWorldInverse.elements` on every
   `requestAnimationFrame` once the Step button is clicked, tagging each sample with
   `performance.now()`.
3. Feed the samples to `judgeCameraMotion` and report its verdict, its first-movement bracket, and the
   thresholds used.
4. Reject any sample whose camera is not `__pineRenderCamera`; that is the only guard against a shadow or
   preview camera being sampled by mistake.

That measurement would still be an E2E-build number, not a production one. A production figure would need
a deliberate, reviewed decision to ship a camera-position signal in the production bundle; nothing in this
note proposes that.
