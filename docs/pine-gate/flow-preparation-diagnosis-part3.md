# Court preparation, third pass: the region between the nook build and the warm render

Measurement report for `flow.spec.ts:36`. Probes were temporary and reverted before this commit;
`grep -c DIAG` on the four touched files is 0.

Corrects the attribution in `0477d91`, which called the 914 ms "two traverse passes". The traverse
passes measure **0.1 ms**. This pass instruments every statement between the nook build and the
warm render, and also splits the ~1.5 s that precedes the build.

## Which place, and with which lamp

The test holds and releases `snow-roof/manifest.json`, so the place measured is **snow-roof**. From
its source, `web/src/engine/places/snow-roof-baked.js:72` sets `bakedLighting: true` and `:91` sets
`lamp: 'gauze'`; the probe's own `r_lamp` line never printed, so those two values are read from the
place definition rather than observed at runtime. Being the gauze branch, it takes
`staticLampShadow.capture` plus **two** `compileAsync` calls and a `LAMPS.gauze` construction, which
the numbers below confirm. On the same page load `cloud-cliff` builds first as the cover; its marks
are in the logs and are excluded from the tables below.

## A. From the nook build to the warm render, snow-roof, ms

| segment | desktop median / max | phone median / max |
|---|---|---|
| build entry → nook build done | 320 / 380 | 174 / 208 |
| the two `traverse` passes | 0 / 0 | 0 / 0 |
| `staticLampShadow.capture` | 463 / 521 | 225 / 324 |
| first `compileAsync` | 104 / 127 | 95 / 105 |
| `LAMPS.gauze` construction | 20 / 22 | 19 / 22 |
| second `compileAsync` | 339 / 349 | 201 / 240 |
| warm render + capture + rest of build | 882 / 914 | 728 / 789 |
| build entry → prepared | 2155 / 2243 | 1462 / 1558 |

Programs, snow-roof build (first value desktop / phone):
nook build done 70 / 70,
after the shadow capture 88 / 88,
after the first compile 114 / 114,
unchanged by the gauze build 114,
after the second compile 144 / 144.

## B. Before the build, from `release()`, ms

| segment | desktop median / max | phone median / max |
|---|---|---|
| release → all files downloaded | 142 / 264 | 159 / 259 |
| total `sha256` over every file | 12 / 13 | 12 / 14 |
| release → warm window elapsed | 1095 / 1416 | 1101 / 1383 |
| warm window, timer duration | 1502 / 1509 | 1501 / 1504 |

`sha256` covers 31 files in this package and sums to **12 ms**, so hashing is not the cost. The warm
window is armed at `release()` and elapses a full **1501 ms** by construction
(`DEFAULT_PLACE_WARM_DELAY_MS = 1500`); the downloads finish at 142-159 ms, so the window is not
waiting on them.

## The two largest blocks, measured

1. **Warm window, 1501 / 1501 ms.** A fixed 1.5 s timer that starts at `release()` and gates
   `initialize()` and the build. It is the single largest item in the release-to-enabled budget, and
   on this measurement it is pure waiting: the downloads are done 1.35 s before it elapses.
2. **Warm render + capture + tail of the build, 882 / 728 ms** (desktop / phone). Inside it, the
   capture itself is 235 ms (measured in `0477d91`), so the warm render and the remaining bookkeeping
   account for ~650 / ~490 ms. Note the second `compileAsync` is only 339 / 201 ms and
   `staticLampShadow.capture` 463 / 225 ms; neither is the largest.

## What the tables do not cover

Warm window + build entry → prepared + every build segment sum to 3222 ms desktop / 2544 ms phone,
against a release-to-enabled median of 4023 / 3386. The residual is **801 / 843 ms**, and it sits
after `i_prepared` and before the button's text changes: the `setPlaceLoad` state update, React's
re-render, and the poll granularity of the harness (30 ms). It is not build work and no segment above
accounts for it.

## What this rules out

- **the two `traverse` passes: 0.1 ms.** Setting flags on a few thousand objects is free here.
- **`sha256` over the whole package: 12 ms for 31 files.**
- **`LAMPS.gauze` construction: 19 ms.**
- **`staticLampShadow.capture`: 463 ms desktop**, second largest build item but not dominant.

## Recommendation

Not implemented. The measurement puts the fixed warm window first, and it is also the only item that
is not real work. Its purpose is to let a visitor change place on the wish screen before the engine
ties up WebGL, so shortening it is a product decision, not a bug fix: the data supports replacing the
fixed timer with "wait for the visitor's first interaction or the timer, whichever comes first",
which leaves the intent intact while removing up to 1.5 s when the visitor has already chosen.
Touches `web/src/App.tsx` only.

Second, the warm render plus the build tail (882 / 728 ms) is the next target; the capture and the
two compiles inside the build are already accounted for separately above.
