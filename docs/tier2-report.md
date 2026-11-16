# One Light — Tier 2 evidence

Tier 1 baseline: `f1bdbdc`. The renderer remains pinned to three.js **0.160.0**. Final capture and isolated measurement runs completed on 2026-11-16.

## What changed

The visitor's candle is larger in frame, with a restrained hall, softer distant lights, less reflective lacquer and a warm local light that follows the procedural flame. Its blue base, hot core, turbulent tip and nearby-pointer response are computed in the shader. Wax keeps the original drawn outline, develops a melt pool and uneven trails, and falls with the existing burn clock. Jokhang has a textured butter surface and a liquid area around the wick.

Ignition grows from the wick. A natural ending shrinks toward an ember and a narrow wisp; an early ending extinguishes quickly and produces a curling wisp. Settlement still happens before any animation. An immediate-refresh race discovered during regression testing is now covered: the browser records a leave by run ID even before the lighting response supplies a candle ID.

Ten exterior environments retain their distinct geometry. Hall light temperatures and synthesized ambient sound differ by place. Audio is created only on the light tap and can be muted. Chinese and English share a restrained typographic treatment; records and statistics use open rows rather than cards.

The wish form renders before the engine initializes. Places load in separate chunks; builds yield between groups, materials are reused within a place, shader compilation is awaited behind the scene fade, and a two-place cache disposes owned resources on eviction. Drawing updates the pad and duration live, committing 3D geometry on pointer release. Setup targets 60 fps, burning 30 fps, and power saving 15 fps with DPR 1, no bloom and no shadows. Phone quality starts lower; sustained slow setup frames can reduce desktop quality. Reduced motion skips long camera travel and suppresses decorative particles/drift. Fonts are self-hosted WOFF2 subsets; production text assets are precompressed with Brotli and gzip.

## Visual evidence

Baseline screenshots: `artifacts/tier2/baseline/desktop-en/` and `artifacts/tier2/baseline/phone-zh/`.

Prototype reference: `artifacts/tier2/prototype/desktop-en/` and `artifacts/tier2/prototype/phone-zh/`. The untouched prototype lacks an encoding declaration; its served text showed encoding defects. It remains a visual reference, outside the production build.

The capture covers the wish, all ten places, travel, presets, empty and shaped drawing, confirmation, ignition, burning, navigation/put-out confirmations, both endings, record filters, wishes, statistic sorts, and butter-lamp fill/burning. Extra final evidence includes pointer response, power saving and halfway-burned wax. A full-screen view with UI hidden is saved as `burning-dark-room.png` at each viewport.

Intermediate comparisons are retained locally under `scene-pass-1`, `scene-pass-2`, `scene-pass-3`, `ui-and-smoothness`, and `tier2-final`. The evidence exposed and led to fixes for overpowering altar reflections, an oversized wick ember, sparse-blur streaks, hidden butter, overly uniform wax trails, dense smoke and low navigation contrast.

Final raw screenshots: `artifacts/tier2/tier2-release/{desktop-en,phone-zh}/`. Reviewed contact sheets: `artifacts/tier2/tier2-release/{desktop-en,phone-zh}-contact.jpg`. Both sweeps recorded zero page errors and zero detected horizontal overflows.

| View | Before | After |
|---|---|---|
| Desktop opening | [before](evidence/before-desktop-en-wish.png) | [after](evidence/after-desktop-en-wish.png) |
| Phone opening | [before](evidence/before-phone-zh-wish.png) | [after](evidence/after-phone-zh-wish.png) |
| Desktop dark room | [before](evidence/before-desktop-en-burning-dark-room.png) | [after](evidence/after-desktop-en-burning-dark-room.png) |
| Phone dark room | [before](evidence/before-phone-zh-burning-dark-room.png) | [after](evidence/after-phone-zh-burning-dark-room.png) |
| Desktop butter lamp | [before](evidence/before-desktop-en-butter-lamp-dark-room.png) | [after](evidence/after-desktop-en-butter-lamp-dark-room.png) |
| Phone butter lamp | [before](evidence/before-phone-zh-butter-lamp-dark-room.png) | [after](evidence/after-phone-zh-butter-lamp-dark-room.png) |
| Desktop records | [before](evidence/before-desktop-en-my-candles.png) | [after](evidence/after-desktop-en-my-candles.png) |
| Phone records | [before](evidence/before-phone-zh-my-candles.png) | [after](evidence/after-phone-zh-my-candles.png) |

Visual review: the larger candle and restrained reflections improve the night-room focus; the warm lip, liquid pool, uneven wax trails and distinct ending silhouettes read at both sizes. The exterior geometry remains visibly stylized. Wax scattering and smoke are shader/particle approximations, not physical simulation; photographic indistinguishability has not been established by independent viewer testing.

## Measurement method

GPU Chrome on an Apple M1, using the Metal ANGLE renderer. Viewports are 1440×900 and 390×844; the latter enables mobile/touch emulation. Isolated measurements run without other browser tests or captures. They record RAF intervals, actual WebGL drawing intervals and main-thread long tasks. Place switches also run at 4× CPU slowdown. The network scenario uses 150 ms latency, 200,000 bytes/s download and 100,000 bytes/s upload; this is emulation, not a measured cellular connection.

Reference budgets from section 11 are report-only: wish usable within 2.5 s on 4G; no place-switch long task above 200 ms; setup p95 frame interval at most 20 ms. Burning and power-saving frame intervals intentionally differ from setup.

## Isolated results

| Viewport | Measurement | Tier 1 | Tier 2 |
|---|---|---:|---:|
| desktop | Wish usable, emulated 4G (ms) | 6040.7 | 1204.6 |
| desktop | Wish usable, local (ms) | 199.1 | 34.9 |
| desktop | Setup-through-ignition rendered-frame p95 (ms) | 16.7 | 33.3 |
| desktop | Place-switch maximum long task, 4× CPU (ms) | 125.0 | 120.0 |
| desktop | Burning rendered-frame p95 (ms) | 16.8 | 33.4 |
| desktop | Power-saving rendered-frame p95 (ms) | — | 66.8 |
| phone | Wish usable, emulated 4G (ms) | 6055.9 | 1221.8 |
| phone | Wish usable, local (ms) | 190.2 | 39.8 |
| phone | Setup-through-ignition rendered-frame p95 (ms) | 16.7 | 33.3 |
| phone | Place-switch maximum long task, 4× CPU (ms) | 117.0 | 112.0 |
| phone | Burning rendered-frame p95 (ms) | 16.7 | 33.4 |
| phone | Power-saving rendered-frame p95 (ms) | — | 66.7 |

Source summaries: [baseline](evidence/baseline-performance.json), [release](evidence/release-performance.json). Full samples: `artifacts/tier2/baseline-isolated/isolated-performance.json` and `artifacts/tier2/tier2-release/isolated-performance.json`. Single runs, not statistical benchmarks.

The wish form is usable roughly 80% sooner under the network emulation. Both place-switch main-thread maxima are below the 200 ms reference. Cached revisits had no tasks above 50 ms (baseline maximum 58 ms). Place-switch maximum rendered gaps were 266.7 ms desktop and 233.3 ms phone, versus 200.1/200.0 ms baseline: asynchronous compilation still pauses scene rendering behind the fade.

The runner's `setup` window includes four seconds choosing a candle, the close-up transition and the first 2.2 seconds after ignition. Thus its 33.3 ms rendered p95 includes the intentional 30 fps burning cap and is above the 20 ms setup reference; it is not a clean steady-setup comparison. RAF p95 stayed 16.8/16.7 ms. A desktop setup task reached 230 ms; no phone setup long task was recorded. Power-saving entry produced 100/67 ms tasks. These remaining stalls are known gaps, not hidden by averages. Burning and power saving achieved their 30/15 fps targets in this run.

Both contexts reported zero page/console errors. Audio context count was 0 before light and 1 after, with state `running` after the tap. The [touch check](evidence/touch-report.json) passed touch drawing, live duration, early navigation, reduced motion, lighting, power saving and settlement. At emulated DPR 3 the normal canvas width was 487 pixels (DPR 1.25 cap), dropping to 390 with power saving.

## Validation and limits

Latest completed Tier 1 run: **11 unit tests and 8 GPU Chrome browser tests passed**, including hide, blur, refresh and refresh-before-light-response at both sizes.

Late burn, trails and natural completion captures accelerate the client clock and adjust the isolated test database's start time. These are visual/state checks, not long-session endurance evidence.

Not verified: real Android/iPhone hardware, Safari, Firefox, real 4G, battery drain, device temperature, or real 30-minute/24-hour phone burns. No field-recorded audio or architectural-reconstruction claim is made. Production deployment and zero-downtime handover were not exercised. Those limits must remain visible in any release assessment.

Full raw captures are local artifacts, excluded from Git. Representative before/after images and measurement summaries are retained alongside this report. The regression log is [tier1-tier2.log](evidence/tier1-tier2.log).
