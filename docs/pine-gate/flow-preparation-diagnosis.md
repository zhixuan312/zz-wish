# Flow preparation diagnosis: why `flow.spec.ts:36` sometimes has no `Step inside` button

Status: measurement report, no product change. Written from one clean build of commit `711dab7`
(no package overlay), with a temporary `performance.now()` probe that was reverted before this
commit; the worktree is clean apart from this note.

## What the test does

`tests/tier1/e2e/flow.spec.ts:36` holds `/places/snow-roof/manifest.json` in `page.route`, waits for
the "Preparing court…" button, releases the route, and then expects a button named `Step inside`
within Playwright's default 5 s. The button is one DOM node whose text changes with `placeLoad.stage`
(`web/src/App.tsx:432`): while preparing it reads `Preparing court…`, and only at `stage: 'ready'`
does it read `Step inside`. A 5 s overshoot therefore surfaces as `element(s) not found`, not as a
disabled button.

## Runs

Command: `npx playwright test --config tests/tier1/playwright.config.ts tests/tier1/e2e/flow.spec.ts:36 --repeat-each 10 --workers 1`
(desktop-en and phone-zh, so 20 runs total).

Result: **18 passed, 2 failed (2.2 m)**. Both failures were phone-zh (runs 4 and 6), both with
`expect(locator).toBeEnabled() failed` → `element(s) not found` on
`getByRole('button', { name: /走进院里|Step inside/ })`.

The separate instrumented harness measured `release()` → enabled for the same 20 runs. Note that it
releases 1200 ms after the progress bar appears rather than immediately, so its absolute numbers are
not directly the test's; the phase breakdown below is what matters:

- desktop: median 5283 ms, max 5918 ms
- phone: median 3807 ms, max 4312 ms

## Phase breakdown, absolute marks from page load

### desktop — 10 runs

| run | warm window | build start | pmrem done | compile start | compile done | capture done | app ready | release→enabled |
|---|---|---|---|---|---|---|---|---|
| 0 | 1852 | 2726 | 2947 | 3625 | 3894 | 7122 | 7123 | 5918 |
| 1 | 1982 | 2268 | 2514 | 3273 | 3504 | 6024 | 6024 | 5233 |
| 2 | 1934 | 2519 | 2775 | 3531 | 3751 | 6385 | 6385 | 5684 |
| 3 | 1965 | 2429 | 2697 | 3407 | 3669 | 6094 | 6094 | 4870 |
| 4 | 1986 | 2295 | 2464 | 3235 | 3474 | 6167 | 6168 | 5325 |
| 5 | 1807 | 2116 | 2339 | 2979 | 3195 | 5921 | 5921 | 5168 |
| 6 | 1904 | 2236 | 2469 | 3112 | 3289 | 6189 | 6189 | 5241 |
| 7 | 1959 | 2269 | 2525 | 3329 | 3577 | 6191 | 6191 | 5486 |
| 8 | 1865 | 2383 | 2639 | 3459 | 3711 | 6226 | 6226 | 5200 |
| 9 | 1885 | 2373 | 2597 | 3287 | 3494 | 6390 | 6390 | 5450 |

| phase | median ms | max ms |
|---|---|---|
| warm window → build start | 398 | 874 |
| build start → pmrem done | 240 | 268 |
| pmrem → compile start | 733 | 820 |
| compileAsync | 235 | 269 |
| compile done → capture done | 2664 | 3228 |
| capture → app ready | 0 | 1 |
| release → enabled | 5283 | 5918 |

### phone — 10 runs

| run | warm window | build start | pmrem done | compile start | compile done | capture done | app ready | release→enabled |
|---|---|---|---|---|---|---|---|---|
| 0 | 2016 | 2354 | 2381 | 2885 | 3065 | 4676 | 4677 | 3542 |
| 1 | 1851 | 2446 | 2521 | 3089 | 3366 | 5465 | 5466 | 4312 |
| 2 | 1905 | 2459 | 2496 | 2953 | 3129 | 4855 | 4855 | 3693 |
| 3 | 1980 | 2600 | 2664 | 3186 | 3382 | 5389 | 5390 | 4136 |
| 4 | 1948 | 2572 | 2640 | 3109 | 3336 | 5290 | 5290 | 3939 |
| 5 | 1964 | 2672 | 2707 | 3202 | 3440 | 5213 | 5213 | 3648 |
| 6 | 1863 | 2517 | 2560 | 3014 | 3219 | 5273 | 5273 | 3877 |
| 7 | 1998 | 2336 | 2396 | 2862 | 3066 | 5047 | 5047 | 3809 |
| 8 | 2040 | 2533 | 2559 | 3080 | 3309 | 5124 | 5124 | 3805 |
| 9 | 1886 | 2423 | 2502 | 2859 | 2985 | 4790 | 4791 | 3703 |

| phase | median ms | max ms |
|---|---|---|
| warm window → build start | 574 | 708 |
| build start → pmrem done | 52 | 79 |
| pmrem → compile start | 482 | 568 |
| compileAsync | 204 | 277 |
| compile done → capture done | 1884 | 2099 |
| capture → app ready | 0 | 1 |
| release → enabled | 3807 | 4312 |


## Where the 5 s goes

The heavy span is **compile done → capture done**, i.e. the work between `renderer.compileAsync`
finishing and `captureLocalEnvironment` returning, in `buildPlaceNow` (`web/src/engine/scene.js`):

| phase | desktop median | desktop max | phone median | phone max |
|---|---|---|---|---|
| warm window → build start | 398 | 874 | 574 | 708 |
| build start → pmrem done | 240 | 268 | 52 | 79 |
| pmrem → compile start | 733 | 820 | 482 | 568 |
| compileAsync | 235 | 269 | 204 | 277 |
| **compile done → capture done** | **2664** | **3228** | **1884** | **2099** |
| capture → app ready | 0 | 1 | 0 | 1 |

Two things this rules out. `compileAsync` is cheap here (200-270 ms) and so is the environment
pre-pass (50-240 ms), so shader compilation is not the bottleneck; and `capture → app ready` is zero,
so the state machine updates the moment the build returns. The whole cost is inside the span between
`compileAsync` returning and `captureLocalEnvironment` finishing.

That span contains, in `buildPlaceNow`:

- the second `renderer.compileAsync` that only runs for a gauze lamp (`scene.js:1902`),
- `renderer.render(stage, stageCamera)` into a 4x4 target to warm the programs (`scene.js:1904`),
- the six-face `captureLocalEnvironment` for the visitor's own reflection (`scene.js:1917`).

## Recommendation

Move the visitor-environment capture out of the path that gates `stage: 'ready'`: start it after the
place is returned to the caller, store it on the candidate when it resolves, and let the lamp use its
own fallback until then. That removes the last and largest block from the readiness path without
changing any timing constant, any test, or the warm window's purpose.

Files it would touch: `web/src/engine/scene.js` only (shared engine, so Snow Roof and Pine Gate both
need a regression run). The warm window in `web/src/App.tsx` is left alone: the measurement shows it
costs 398-874 ms after the release
point, which is not what consumes the 5 s budget.
