# Round 1 capture commands

Prepared on CPU only. Focused Source17 preview checks have passed, but no final full-journey verification has run. The proposed frozen checkout and port below remain placeholders until both final deliveries are frozen. Preserve the old before checkout on 5200. GPU ownership is explicitly handed off for each run; this document does not grant a lease.

The final checkout must include the complete current working source, actual Cloud/Snow packages, the isolated API proxy to 8858, and its own Vite cache. It must stay unchanged throughout all captures. Run the capture-only instrumenter inside that frozen checkout:

```sh
node tests/visual/instrument-flicker.mjs /tmp/one-light-full-review-round1-after
```

Start Vite from the frozen checkout, with an unused strict port:

```sh
cd /tmp/one-light-full-review-round1-after
ONE_LIGHT_API_TARGET=http://127.0.0.1:8858 ONE_LIGHT_VITE_CACHE=/tmp/one-light-full-review-round1-vite-cache node node_modules/vite/bin/vite.js --config web/vite.config.ts --host 127.0.0.1 --port 5260 --strictPort
```

After the explicit exclusive GPU handoff, run these sequentially from the main repository. The first command measures actual render intervals without video, raw pixels, screenshots inside the timed window, or the live-audio analyser. It measures six ten-second phases per browser on the required phone viewport: home, outside, choose, burning, power saver, restored detail.

```sh
BASE_URL=http://127.0.0.1:5260 SOURCE_ROOT=/tmp/one-light-full-review-round1-after BROWSERS=chromium,webkit VIEWPORT=phone REQUIRE_FINAL_BANKS=1 EVIDENCE=round-1-final node tests/visual/snow-performance.mjs
```

Phone timing uses 390×844 CSS, touch and deviceScaleFactor 2 to exercise the renderer’s 1.25 balanced cap; desktop uses 1440×900 and DSF 1. This is native desktop-GPU emulation, not physical-iPhone performance. The report retains actual RGBA16F/depth24 sample support, both compositor sample counts, buffer dimensions, 2→0→2 or supported-fallback transitions, raw frame intervals, CPU submit and available asynchronous GPU queries. Unsupported WebKit GPU timing remains explicitly unavailable. Inspect the actual result before starting the longer image runs. Optional bounded timing selectors are `VIEWPORT=phone`, `BROWSERS=webkit`, `MEASURE_PHASES=burning-normal`, `LOCAL_HOUR=5.5`; omitted phases still drive the real UI and perform real put-out cleanup.

Record a clean home→place→walk→ignition→burning video without inserted ten-second diagnostic holds:

```sh
BASE_URL=http://127.0.0.1:5260 SOURCE_ROOT=/tmp/one-light-full-review-round1-after DB_FILE=/tmp/one-light-round1-final.db BROWSERS=chromium,webkit LANGUAGES=en,zh FLOW=motion OUTPUT=artifacts/full-review/round-1/after-motion node tests/visual/full-journey-review.mjs
```

Then capture the complete real UI, static sequences and all fixed contacts. This run omits an extra full-flow video because its static measurement waits would distort pacing; the separate motion run above supplies the pacing videos.

```sh
BASE_URL=http://127.0.0.1:5260 SOURCE_ROOT=/tmp/one-light-full-review-round1-after DB_FILE=/tmp/one-light-round1-final.db BROWSERS=chromium,webkit LANGUAGES=en,zh FLOW=full VIDEO=0 REQUIRE_ENDING_PLUME=1 STATIC_SECONDS=2 DETAIL_SECONDS=.5 DETAIL_VIEWPORTS=desktop-en,phone-zh CLOSEUP_CONFIG=art/build/snow-roof-round1/source-v17-handoff-v2/closeups.json OUTPUT=artifacts/full-review/round-1/after-journey node tests/visual/full-journey-review.mjs
```

`LANGUAGES=en,zh` explicitly covers both languages at both sizes in both browsers: eight contexts per run. Omitting it preserves the older four-context desktop-EN/phone-ZH pairing. `VIEWPORT=desktop|phone` and `BROWSERS=chromium|webkit` restrict a bounded repair; each repair needs its own output directory and cannot stand in for missing full coverage. `FLOW=smoke` is only an initial load/light/put-out check. No test runner is involved.

The complete flow covers empty-wish feedback, actual download/preparation progress, three continuous-walk screenshots, all shapes/colours, 10-minute/24-hour size difference, drawing/undo, direct lighting or detected old-confirm baseline, ignition/spread/settled burning, mute/unmute, leave warning and real navigated ending, burnFar and real put-out, accelerated natural completion with API record verification, My Lamps/expanded record/My wishes/Ten Lights and home return. A separate no-video replay holds the three real walk poses, normal versus fully static burning, then the source-authored closeups and trusted native tab/focus ending. It selects a real 24-hour lamp so the 52-view diagnostic registry cannot naturally expire partway through. Acceleration applies only to the isolated natural-ending visitor/server clock and is labelled; it is not an endurance burn.

The current Source17 registry has 52 unique camera views and all 47 contact groups, with 52 explicit phone optics. The registry is `art/build/snow-roof-round1/source-v17-handoff-v2/closeups.json`, SHA256 `c0aab1ad003b66fcd3fff57bbd572e47dc1c98fe6ec6a7271ce2db493aa525a1`. It fixes the older repeated filenames and two screen-foot phone poses. Apply its browser WORLD Y-up coordinates literally, without adding the nook offset. These are diagnostic cameras, not product poses. The final pass uses two-second UI/static sequences and half-second fixed detail sequences with PNGs. Contact details run in desktop English and phone Chinese in each browser; the full UI still covers both languages at both sizes. These bounded checks protect visible flicker and contacts without repeating identical geometry for a second locale. Independent centre/near-camera ray checks pass, but full silhouettes, material/contact shadows and actual browser framing remain pending until capture.

The frozen source fingerprint includes `/color/` and the actual native-view helper. The runtime view metadata records both main and thumbnail residual EV and lookup identity. Final scene budgets include the shared116705-byte native AgX lookup in each place's `completePackageBytes`, as well as its local files, manifest, fabric and any poster set. The final asset register must be regenerated after the actual payloads are installed.

Capture-only live audio hooks observe the product-created context, trusted gesture activation, real resume/state changes, gain automation, and a parallel non-audible analyser. They check silence before lighting, signal after settled ignition, actual UI mute/unmute and silence after endings. Videos have no audio track; live-device autoplay and electrical signal checks complement the [offline listening review](./round-1-audio.md), rather than replace owner listening.

The CPU hook dry run at `artifacts/full-review/round-1/hook-check.json` matched all 14 required hooks against scene `d7173d52…` and descriptor `adfc8e80…`. It supports both the old warming guard and current direct compositor render, options-based fixture tags, source-strand particle controls and suspension-pivot freezing. The obsolete temporal-grade hook is intentionally absent. Every final frozen snapshot must be instrumented and checked again after source freeze; this dry run is not a final source fingerprint or browser pass.
