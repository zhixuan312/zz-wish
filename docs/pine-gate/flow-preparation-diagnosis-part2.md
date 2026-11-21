# Where the court preparation seconds actually go

Measurement report for the second half of the `flow.spec.ts:36` investigation. No product change;
the probes were reverted before this commit and `grep -c DIAG` on the touched files is 0.

Follows `b5cd60e`, which showed the cost sits between `compileAsync` returning and the place being
handed back. This note splits that span into its parts for **snow-roof** (the place the test
prepares) and, on the same page load afterwards, **Pine Gate**.

## Method

Temporary `performance.now()` probes in `web/src/engine/scene.js`, plus `gl.finish()` after the warm
render and after `probe.update` so GPU time is counted rather than queued. Driven by the same
`flow.spec.ts:36` setup (route hold on `snow-roof/manifest.json`, then release), 10 runs per
viewport, one lease per command. Probes were reverted; nothing in this note is inferred from a
production build.

## The five parts of the span, snow-roof, ms

| stage | desktop median / max | phone median / max |
|---|---|---|
| build entry → sky PMREM done (`pmrem.fromScene`) | 244 / 270 | 88 / 102 |
| `P.build` (place geometry) | 96 / 99 | 92 / 93 |
| `N.build` (nook/lamp) | 1 / 1 | 1 / 1 |
| nook build done → warm render start | 914 / 1046 | 505 / 538 |
| warm render (4×4 target, `gl.finish`) | 631 / 673 | 478 / 483 |
| `captureLocalEnvironment` total | 235 / 262 | 236 / 240 |

## Inside `captureLocalEnvironment`, ms

| part | desktop median / max | phone median / max |
|---|---|---|
| `root.clone(true)` + pair map | 1.0 / 1.2 | 1.0 / 1.1 |
| **`probe.update` (six faces) + `gl.finish`** | **230.3 / 256.7** | **230.8 / 234.8** |
| `pmrem.fromCubemap` | 3.5 / 4.1 | 3.5 / 3.7 |

`probe.update` compiles **23 new programs** (11 → 24 on the first sample, 167 → 190 on the
snow-roof one) and issues **64 draw calls** across the six faces. Neither number varies between
runs or viewports.

## What the table does not cover

The five stages above sum to 2121 ms (desktop) and 1398 ms (phone), against a release-to-enabled
median of 4050 and 3292 ms. The remaining **~1.9 s is before `build entry`**: the manifest fetch,
the streamed downloads with their per-file `sha256`, and `initialize()`/`ensureReady()`. That part
was measured in `b5cd60e` as the prefetch window plus the warm-window delay, and is not re-derived
here.

## What this rules out

- **clone**: 1 ms. Copying the place graph is not the cost.
- **`pmrem.fromCubemap`**: 3.5 ms. The PMREM convolution is not the cost.
- **`baked.update`**: 0.1 ms.
- **`finally` block** (dispose, restore render state): 0.1 ms.
- **shadow re-render across six faces**: the six faces together cost 230 ms with 64 calls; a single
  extra shadow pass would show as a much smaller delta and does not separate from the rest.
- **`far = 1500` GPU volume**: Pine Gate, which uses `far = stageCamera.far` (1500 m), does not appear
  slower than snow-roof at `far = 30`: both sit at ~230 ms for the same 64 calls. Distance is not the
  driver.

## Root cause

The dominant single item inside `captureLocalEnvironment` is `probe.update`: **230 ms median,
257 ms max**, spent compiling **23 shader programs** the main scene never needed for its own
render, then drawing 64 calls over six faces. The program count is the same 23 on every run, so this
is a fixed set of variants, not a cold-start accident: the six-face cube render pulls in material
variants (the probe's own scene graph, its environment/background clear, and the linear colour-space
pass) that the warm render of the main stage does not cover.

But `captureLocalEnvironment` totals only 235-252 ms of the ~1.9-2.7 s span. The largest single block
is **`nook build done → warm render start`**, 914 ms median / 1046 ms max on desktop and 505 / 538
on phone, which sits in `buildPlaceNow` between `N.build` returning and the warm render, i.e. the
`nookG.traverse` shadow/receive/shadow-cast pass and the `G.traverse` light-layer pass over the whole
place. Together with the 631 ms warm render, that is where the seconds are.

## Recommendation for this round

Not implemented; for Boss to decide from these numbers. The two candidates the data supports, in
order of size:

1. **`nook build done → warm start` (914 ms desktop)**: the two `traverse` passes mark every mesh
   `receiveShadow`/`castShadow` and every light `layers.enableAll()`. Walking the entire baked place
   twice is the largest block and the cheapest to remove: the baked package can carry the flags it
   already needs, or the passes can run once over the nook and skip meshes whose flags are already
   set. Touches `web/src/engine/scene.js` (shared).
2. **`probe.update`'s 23 new programs (230 ms)**: warm those variants in the existing
   `compileAsync(stage, stageCamera)` by adding the probe's scene to the warm compile, so the cost is
   paid while the loader is already waiting rather than inside the capture. Touches
   `web/src/engine/scene.js` (shared) and possibly the probe's scene construction.

Neither moves work into the walk, which was the objection to the earlier suggestion.
