# After capture preparation

The final runner is prepared for the current single Snow Roof UI, streaming ambient banks and compositor MSAA. The earlier night3 partial preview was captured and is documented in [night3-review.md](night3-review.md). The newer complete banks, geometry fixes and MSAA have not been captured or timed yet. Metal Cycles currently owns the GPU; Chrome must stay closed until the explicit GPU handoff.

Use a frozen after checkout containing the actual delivered assets, served through Vite with the HTTP and WebSocket API target on `http://127.0.0.1:8792`. The isolated database remains `/tmp/one-light-real.db`. The capture uses new visitor cookies and leaves earlier visitors' records intact.

```sh
node tests/visual/instrument-flicker.mjs /tmp/one-light-final
```

`SOURCE_ROOT` must be the source actually served by `BASE_URL`. Instrumentation accepts only a `/tmp/` checkout, keeps `scene.js.uninstrumented`, and emits `visual-instrumentation.json` with exact original, instrumented and helper hashes plus applied hooks. The browser exposes the frozen source path, original scene hash and manifest hash; each final driver compares these with `SOURCE_ROOT` before accepting any evidence. The capture also fingerprints the frontend and every delivered Snow Roof file before and after the run. Changed source/assets invalidate the stability claim.

The latest source passes CPU-only hook matching at `/tmp/one-light-final-hook-check2`. The skipped legacy grade-time hook is expected because `grade.uTime` was removed. Syntax checks pass. No browser, GPU render or test suite was run for this preparation.

## Journey

1. Desktop English 1440×900 and phone Chinese 390×844 with actual touch input; home language switch also shows the other language.
2. Original home cover, written wish and the default Snow Roof place.
3. Three still-camera ten-second inspection holds after actual walk progress crosses 0.25, 0.50 and 0.75. Raw metadata includes actual progress, position and camera matrices; the same path resumes afterward.
4. Presets, all colors, 10-minute/24-hour choice, empty drawing, small/large contours, redraw and undo. The 10-minute and 24-hour shots use the same Drum preset and red color. Metadata retains actual mesh world bounds, physical frame, selected profile rows, suspension visibility/scale and flame position so silhouette growth, framing, cord continuity and Cycles lamp-basis alignment can be reviewed. The phone uses native CDP touch events. Duration labels are retained.
5. Confirm and actual ignition. The runner records each reported ignition phase and waits for `window.__visualIgnition.state === 'settled' && progress === 1` before the static burning sequence. The current choreography totals 21.8 seconds: 3.8-second taper/spread, 2-second hold and 16-second eye-height orbit. It is captured as motion, outside the static metrics.
6. Stable burning and separate cause controls; remaining-time display, wish hiding, mute, power saving, put-out warning and cancel.
7. Actual explicit navigation warning, extinction and saved `went_out / navigated` record.
8. A fresh custom shade burn, actual second-tab activation, native hidden/focus events, return and saved `went_out / left` record. The browser is headed to support a real tab transition. It never dispatches synthetic visibility events. If only focus loss is observed, the report marks actual tab-hidden coverage incomplete instead of claiming it passed.
9. A third real burn with approved client/server visual clock acceleration, actual natural gutter/result and saved `burned_down / complete` record. Ember/smoke imagery is separate; the settled result waits six seconds before its static measurement. This remains a visual settlement check, not an endurance burn.
10. My Lamps, My wishes, public statistics/order tabs and return home.

Every required static journey view gets a ten-second raw sequence. In final core mode, already reviewed swatch/preset/drawing variants use screenshots. The UI journey is also recorded to video. A blank second-tab video is labelled separately from the main journey.

## Cause controls

The normal burning sequence retains physical animation. Subsequent diagnostic sequences separately hold fuel, hide weather/dust/mist/smoke, hold daylight, hold flame clocks/intensity, hold lamp rotation, and stop shadow-map refresh. Flame halos remain with the flame; particle hiding runs after scene updaters and immediately before rendering. Every hidden-particle sample must report zero visible particle objects. The fully static diagnostic holds the physical clock, daylight and fuel.

These controls are capture instrumentation, not the product's normal appearance. Telemetry records camera/projection matrices, lamp world matrices, light positions/intensities, exposure, bloom, daylight values, fuel and shadow update state. Baked Snow metadata must be present and true; the capture stops if it is still procedural. Camera/projection movement during a static measurement is reported as an error.

For every ROI and rendered frame, the helper retains lossless luminance numerators `2126R + 7152G + 722B` as compressed little-endian uint32 arrays. Divide by 10000 to recover Rec.709 luminance code values. Per-frame means and per-pixel RMS are measured before encoding. First/second/middle/final raw RGBA samples remain alongside them. The original before run retained all per-frame aggregate telemetry and selected raw RGBA frames, but not the new full per-pixel luminance arrays.

```sh
EVIDENCE=after node tests/visual/summarize-snow-evidence.mjs
node tests/visual/recompute-flicker-luma.mjs artifacts/snow-journey/after/desktop-en/sequences/burning.json
```

The recomputation command reads the compressed pixels independently, checks their hashes/lengths, and compares reconstructed RMS/mean deltas with the Float64 telemetry. It opens no browser.

## Final core mode and performance

For a later frozen final delivery, use `CORE_FLOW=1` with the journey command. Required core stages keep ten-second static sequences. Presets, swatches, 10-minute/24-hour sizes and drawn variants remain screenshots rather than repeating ten seconds each. Normal and fully static burning controls remain. Power-saver and restored-detail screenshots remain because their compositor MSAA behavior changed. Actual supported RGBA16F/depth24 sample arrays and both composer sample counts are retained in screenshot/sequence metadata.

```sh
REQUIRE_FINAL_BANKS=1 BASE_URL=http://127.0.0.1:5191 SOURCE_ROOT=/tmp/one-light-final EVIDENCE=final node tests/visual/snow-performance.mjs
STATE=after CORE_FLOW=1 REQUIRE_FINAL_BANKS=1 SOURCE_ROOT=/tmp/one-light-final BASE_URL=http://127.0.0.1:5191 DB_FILE=/tmp/one-light-real.db EVIDENCE=final HEADLESS=0 node tests/visual/snow-journey-capture.mjs
BASE_URL=http://127.0.0.1:5191 SOURCE_ROOT=/tmp/one-light-final EVIDENCE=final node tests/visual/snow-time-looks.mjs
```

After the [candidate A/B review](candidate-comparison-plan.md) selects a delivery, run these sequentially in the order shown: no-video performance first, full core journey second, and six looks third. This finds shader or frame-budget problems before the lengthy complete journey. Wait for the GPU handoff, with no Cycles job or other capture running. The bank guard rejects an incomplete/partial manifest before Chrome launches. Start the frozen server from `/tmp/one-light-final` after stopping the older owned port 5191 server:

```sh
ONE_LIGHT_API_TARGET=http://127.0.0.1:8792 ONE_LIGHT_VITE_CACHE=/tmp/one-light-final/.vite-cache node node_modules/vite/bin/vite.js --config web/vite.config.ts --host 127.0.0.1 --port 5191 --strictPort
```

The separate performance driver records no video and reads no pixels during timing. It measures actual composer-render intervals, CPU submit time and asynchronous GPU time when the extension is available and not disjoint. It covers home/outside/choose and settled normal, power-saver and restored burning at both sizes. Source caps are 60 FPS before burning, 30 FPS for normal/restored burning and 15 FPS for power saver. The driver records queried supported RGBA16F/depth24 sample arrays, both composer target sample properties, renderer counters, pixel ratio, buffer size and camera stability; it never calls `gl.finish`. It checks both target sample values against 2 when supported, 0 in power saver, and restored 2 afterward (or the supported 0 fallback).

The performance phone uses 390×844 CSS pixels with touch/mobile emulation and deviceScaleFactor 2. The balanced renderer cap should produce pixel ratio 1.25 and a 487×1055 drawing buffer (integer flooring); power saver should produce 390×844 at pixel ratio 1. The final core visual/luma journey and six-look checks retain deviceScaleFactor 1 for comparison with prior evidence. All are M1 desktop-GPU emulation, not physical-phone benchmarks.

Delivery metadata is collected before and after each timed window, never in its per-frame timing path. It includes manifest `bake.sampling`, compression profile/codec/images, each lightmap's gain/range/source fields, actual Three texture format/type after KTX2 transcoding, image/mipmap dimensions, and uploaded-handle/version evidence. An absent material profile is null; the driver does not infer mobile assets from viewport size. WebGL has no texture-level storage query, so the uploaded storage internal format is explicitly unqueried. Compiled uniform references distinguish actual atlas samplers from one-pixel placeholders; `lightingState.loadedPasses` separately identifies retained CPU images.

## Six time looks and streaming

The narrow six-look driver captures actual outside, 10-minute red Drum choose, confirm and settled burning at local hours 5.5, 7, 13, 17.5, 19.5 and 22, at both sizes. It waits for the requested local-hour daylight update, all required banks to finish loading, and effective weights to settle. Each view records source identity, requested/loaded/resident/pending banks, compiled samplers, device texture metadata and actual camera state. Actual UI put-out actions clean up each visitor's lamp.

At the final 22:00 case, the still camera also switches 22→13→22. Raw acquisition begins before the clock switch and continues until streaming and the crossfade settle, with at least ten seconds recorded; it can extend to 120 seconds to retain a late arrival. Per-frame effective weights and lossless structural ROI luminance show continuity, while representative PNGs retain the visual result. This deliberately changing illumination is not scored as static flicker. The report checks that ambient weights never sum to zero, inactive atlas uniforms reference placeholders, and restoring the retained night bank issues no new bank request. Network records include URLs, statuses and cache flags. Visual inspection and raw pixel traces are still required before declaring no black flash.

Native visibility requires clearing Playwright's override through its owning primary CDP session. The capture-only `native-focus-control.mjs` does this; a separately attached session was insufficient. The corrected approach produced trusted same-window hidden events in the actual product at both sizes, both with and without video. See the [lifecycle proof](native-visibility-proof.md). Single-court statistics ordering controls are optional. Private visitor recovery state is saved with mode0600 under `/tmp/one-light-capture-visitors/`, outside published evidence.

The future instrumentation and performance files have only been syntax/CPU-hook checked. Night3 was not mutated to install the performance hook, and no final MSAA/performance run has occurred.

ROIs remain rectangular image regions rather than semantic masks. They must be inspected against the final camera composition before calling them non-flame structural measurements. Raw canvas telemetry excludes HTML overlays; PNGs/video show the complete UI. Phone emulation is not real-device performance or a measured 30-fps endurance claim. No audible sound or assistive-technology pass is claimed.
