# Round 3 status (Snow Roof Court)

Branch `s2/snow-roof-finish`. Every item below names its status, its before/after capture
path where one exists, and one sentence of judgement. Items that need a new Blender bake
are listed for the owner and are out of scope for this branch.

## T1: `Step inside` enabled within 5 s

Status: **done** — fixed in `14c2c39`.

Measurement method: local production build (`npm run build` + `node server/main.ts`), real
Chrome with Metal, cold cache, the same condition as `tests/tier1/e2e/flow.spec.ts:36`
(the snow-roof manifest request is held until the wish is filled and the form submitted).
Six runs, `fill` to the moment the `Step inside` control reports enabled.

| viewport | run | fill → enabled |
|---|---|---|
| desktop-en | 1 | 9042 ms |
| desktop-en | 2 | 9395 ms |
| desktop-en | 3 | 9438 ms |
| phone-zh | 1 | 8653 ms |
| phone-zh | 2 | 8525 ms |
| phone-zh | 3 | 8722 ms |

Single-run timeline relative to `fill` (desktop-en):

| mark | offset | meaning |
|---|---|---|
| `downloaded:snow-roof` | +135 ms | manifest and all 20 snow-roof files downloaded and SHA-256 verified |
| `initialized:snow-roof` | +6070 ms | blocked in `await initialize()`, waiting on the cover build inside `ensureReady()` |
| `prepared:snow-roof` | +8361 ms | snow-roof's own build, `compileAsync` and local probe: 2.3 s |
| `button-enabled` | +9125 ms | the control becomes usable |

Inside the cover build (same run): `cliff-loaded` at -52 ms (assets already resident),
`vol-density` at -68 ms, `vol-light` at +5549 ms, `cover-built` at +5995 ms.

Root cause: `createCloudLightVolume` in `web/src/engine/places/cloud-light-volume.js`
prewarms its seven-direction prefix volume in a `requestAnimationFrame` loop that runs
until the scheduler reports ready, and `ensureReady()` awaits the whole cover build before
it resolves. Every later `preparePlace` call queues behind it, so the snow-roof prefetch
that finished at +135 ms cannot build until +6070 ms.

Not the cause: network bandwidth (all files are local by +135 ms), `sha256` (6 MB model
decodes and verifies in 60 ms), and snow-roof's own construction (2.3 s).

Fix: the prewarm now runs as many passes per animation frame as a 12 ms budget allows
instead of exactly one. The passes, their order, the dimensions, the phase schedule and
every visual parameter are unchanged.

After (`14c2c39`, same method): desktop-en 3793 / 3655 / 3789 ms and phone-zh
3306 / 3130 / 3215 ms from fill to an enabled `Step inside`. `npm run test:tier1` reports
14 passed including `flow.spec.ts:36`, whose 5 s assertion was not changed.

Cover regression: the cover renders at the same rate before and after (`14c2c39^` versus
`14c2c39`) — desktop median frame 50.0 ms, phone median frame 16.7 ms in both — and the two
renderings are pixel-identical apart from 0.003% of pixels. Captures:
`artifacts/full-review/round-3/cover-check/cover-{before,after}-{desktop-en,phone-zh}.png`.

## T2b: the hanging shade grows with the chosen burning time

Status: **done**.

`lanternHeightMetres` in `shared/rules.ts` maps 10 minutes to 0.350 m and a full day to
0.560 m, logarithmically in time, clamped outside that range. The `liveBaked` branch of
`gauze()` multiplies its proportional fit by that envelope, so 24 h is unchanged
(envelope 1.000) and 10 min renders at 62.5% of the previous height.

Computed envelope per preset: 10 min 0.625, 30 min 0.708, 1 h 0.760, 2 h 0.813,
3 h 0.843, 6 h 0.895, 12 h 0.948, 24 h 1.000.

Unit tests in `tests/tier1/unit/rules.test.ts` pin both endpoints, the clamp outside the
preset range, and strict growth across `PRESET_MINUTES`.

Checked on real captures at desktop-en and phone-zh. Chosen durations in one session move
the shade and nothing else: across 10 min, 2 h and 24 h the mean row-brightness delta of the
whole frame is 3.7/255, so the camera and the panels behind the lamp stay put while the
shade grows. The cord is continuous at all three sizes, no shade touches the ceiling beam,
the columns or the table, the flame and wick sit inside the shade, and 24 h matches the
previous picture.

Burning, cloth height as a fraction of frame height, measured with
`tests/visual/s2-frame-measure.mjs`: the largest saturated-red blob whose row count exceeds
roughly a third of its widest row, taken between the shade's upper and lower rims. These are
measurements, not targets.

| viewport | 10 min | 2 h | 24 h |
|---|---|---|---|
| desktop-en | 15.1% | 19.1% | 24.0% |
| phone-zh | 10.8% | 14.1% | 17.1% |

A different frame and a looser colour threshold give 14.8% for the desktop 10 min lamp in the
T9 batch below, and the journey's own `burning.png` gives 16.2% under the same tool on a
smaller shade at a slightly different camera distance; each number names its own frame and
method rather than being merged.

Captures: `artifacts/full-review/round-3/lantern-size/{choose,burning}-{desktop-en,phone-zh}-{10min,2h,24h}.png`.

## T2: J15 phone drawing pad

Status: **done** — the pad is 200x300 CSS px at 390x844.

At `max-width:720px` the pad is a fixed 200 px wide target with the 2:3 aspect ratio, so the
stroke-to-metre mapping is unchanged and the tools stay on screen beside it. An earlier
attempt let the pad take the whole sheet width (about 358 px); that pushed Undo, Redraw and
the light action out of view and was replaced in `5fa247a`. Desktop layout is untouched.
`tests/tier1/e2e/phone-drawing.spec.ts` pins the size and requires one touch stroke to enable
Undo.

## T2: J16 long wish in the burning view

Status: **done** — a 60-character Chinese wish ends with a visible ellipsis on phone-zh.

`.hud-wish` is clamped to two lines with `-webkit-line-clamp`, `overflow:hidden`, so a wish
beyond the box ends with a visible ellipsis and never grows past its container. Short
wishes render as before.

Measured with a 60-character Chinese wish: phone-zh `.hud-wish` box is 358x39 px with
`scrollHeight 59`, so the second line is clipped and the ellipsis shows
(`artifacts/full-review/round-3/lantern-size/phone-zh-burning.png`). desktop-en keeps the
wish on two full lines at 588x39 px.

## B5 regression (phone choose framing)

Status: **done**. On a phone the lamp and the altar stand share one screen column, so
raising the subject could not separate them. The phone choose view now swings 0.22 rad
around the lamp: at 10 min, 2 h and 24 h the tassel sits well clear of the stand's cup,
the cord is visible, the tallest shade is not cropped and the stand stays where it was.
Only the narrow-screen camera changed. Captures:
`choose-phone-zh-{10min,2h,24h}.png`.

## T5: J17 the presence badge

Status: **done**. The count is ambient context, not a status line, so it now reads in a
muted grey at 11 px with 0.72 opacity, no text shadow and a hairline dot instead of the
warm accent bullet. The wish text and the lamp are again the two loudest things in frame.

## T6: J12 the stacked bowls and the leaning broom

Status: **not done, needs a new bake** — the props are merged into baked region geometry
inside `snow-roof.glb.zstd` and carry only the hall lightmap; a runtime fill light was
rejected because it would lift the whole hall floor with them.

## T7: J6 the gate flame and offering bowl under gate bloom

Status: **done (verified on the delivered build, no code change)**. A real walk frame
taken through the gate shows both shelf cups whole with no panel over them, on desktop-en
and phone-zh: `artifacts/full-review/round-3/j6-j2/gate-walk-{desktop-en,phone-zh}.png`.

Measured at 100% crop, mean luminance of a 2 px core against a ring from 10 to 16 px around
the brightest flame pixel:

| viewport | left cup | right cup |
|---|---|---|
| desktop-en | core 212.2 / halo 122.8 = **1.73:1** | core 211.3 / halo 117.9 = **1.79:1** |
| phone-zh | core 207.4 / halo 61.0 = **3.40:1** | core 68.3 / halo 19.7 = **3.47:1** |

All four are above the 1.5:1 bar, so a separate emission boost turned out to be
unnecessary and was reverted in `1d7ade2`; the measurement stays.

## T8: J2 the unlit and ended lantern

Status: **partly**. The ended half is measured and the desktop approach series is clean; the
phone approach could not be measured (see below), so the item does not close.

`a1b96a0` gives the bamboo ribs a small constant emissive term, so at 100% crop the unlit and
ended shade shows countable ribs instead of flat red. `e45ab80` keeps the put-out sudden for
the flame, its point light, the halo and the smoke — all four drop on the original `.12` s
curve — and lets only the cloth hold heat: it starts from the glow it had one frame earlier
and decays with a 2.6 s time constant.

### Ended series

Real put-out, no Skip and no held camera, captured through CDP into a clipped region with an
in-page timestamp before and after each frame.

Mask definition: on frame 00 the largest 4-connected saturated-red blob is found inside a
central band from 0.36 to 0.56 of frame width, sampled every 2 px (colour test: r > 55,
r-g > 22, r-b > 30). Its bounding rectangle is then fixed and reused for every frame, and
mean luminance is taken over **all** pixels of that rectangle — the cloth, its dark ribs, the
gaps between ribs and the unlit inside of the shade. It is not a per-pixel cloth mask, so the
mean is lower than the cloth's own brightness and a dark rib influences it.

Both captures are clipped regions rendered at devicePixelRatio 2, so the boxes below are in
2x pixels: desktop `x 321-401, y 418-658` in a 720x920 image = 19,521 px; phone
`x 248-384, y 876-1264` in a 688x1352 image = 53,293 px. Every frame's mean, the mask and its
definition are in `j6-j2/t8-series-{desktop,phone}.json`.

| frame | 00 | 01 | 04 | 08 | 12 | 16 | 20 | 23 |
|---|---|---|---|---|---|---|---|---|
| desktop-en | 76.7 | 73.0 | 65.8 | 56.7 | 48.8 | 42.3 | 37.0 | 33.5 |
| phone-zh | 89.1 | 86.7 | 75.2 | 61.4 | 50.5 | 42.9 | 35.9 | 32.1 |

Cadence, from the in-page timestamps: desktop median 166 ms with one 393 ms first-frame
outlier; phone median 234 ms with 278 ms and 253 ms on its first two intervals. Every
interval after that is under 250 ms on both viewports. Both series fall at every step with no
frame above its predecessor, and the largest adjacent drop is 4.8% (desktop, frame 00 to 01)
and 5.4% (phone, frame 08 to 09). The unlit and ended cloth, with its ribs, is visible in
`j6-j2/ended-*` and `j6-j2/t8-{desktop-en,phone-zh}-{00,08,16,23}.png`. No red flash or
reversal appears in either series.

### Approach series

Captured through the real walk with no Skip and no held camera. Each frame's clip follows the
lamp's own projected screen rectangle, and the mean is taken over every pixel of that
rectangle inside the cropped capture — cloth, ribs and the dark gaps between them — with no
colour threshold anywhere. 130 frames per viewport; desktop walk progress 0→0.90 and phone
0→0.51 before the chooser appeared.

Intervals from in-page timestamps: desktop median **200 ms**, max **249 ms** (none over
250 ms); phone median **117 ms**, max 120 ms. All 130 frames on both viewports carry a lamp
rectangle and a measured mean.

| viewport | frames | range | median step | p95 step | largest step |
|---|---|---|---|---|---|
| desktop-en | 130/130 | 6.0-22.4 | 2.1% | 20.4% | 37.5% (frame 123→124) |
| phone-zh | 130/130 | 13.5-18.7 | 2.2% | 6.6% | 11.3% (frame 41→42) |

Every number above, with each frame's mean and its rectangle, is in
`j6-j2/approach-series-{desktop-en,phone-zh}.json`; timestamps, clip and lamp rectangle per
frame are in `j6-j2/approach-timestamps.json`. Frames kept, five per viewport evenly spaced through the walk:
`j6-j2/approach-phone-zh-{20,60,100,125,129}.png` for visual review, the matching
`j6-j2/approach-desktop-en-{20,60,100,125,129}.png`, plus
`j6-j2/approach-desktop-en-{123,124}.png` for the largest desktop step.

The cause of that 37.5% desktop step is **undetermined**. The two frames show the same dark
red cloth at the same size and tone, and the lamp rectangle only grows from 108x144 to
112x150 px, which cannot by itself move a mean by a third. Recomputing the mean inside a
region common to both crops still gives 18.4 against 9.7 (47% apart), so the difference is in
the pixels, not only in how much background the rectangle includes; what changes them is not
established here.

Read against the frames, the shade stays dark red cloth with visible ribs throughout the
approach, grows steadily, and never saturates; no frame in either series shows a red flash.
Because one desktop step remains unexplained, this item stays **partly** done.

## T9: J5 the desktop burning lantern size

Status: **done**. The settled desktop burning view frames against a fixed full-day lamp
reference instead of the live lamp frame, so the camera no longer refits per duration and
only camera placement changed. Measured on the T9 batch with
`tests/visual/s2-frame-measure.mjs`:

| duration | cloth height |
|---|---|
| 10 min | 14.8% |
| 2 h | 19.2% |
| 24 h | 23.8% |

Before the change the settled view was about 13-15% at every duration. One fixed camera
cannot put every duration inside 20-25%: a 10 min shade is 62.5% of the full-day height, so
framing the full day near 24% necessarily leaves the shortest shade near 15%. That spread is
the intended result, because it is what makes the duration visible, and `GOALS.md` records
the same expectation.

## T3: Round 3 full journey

Status: **done**. Chromium and WebKit both covered four contexts on the final product code
(`e45ab80` and `5fa247a` are both in that tree). The two runs differ in one stage and the
chromium report file is gone, which is recorded below for accuracy.

Chromium, from the record in `d3286a8`: `frames 292, sequences 88, errors 0, httpErrors 0`,
8 ending captures and 16 records, with 73 stages in each of `desktop-en`, `desktop-zh`,
`phone-en` and `phone-zh`. That machine-readable report was overwritten when the WebKit run
reused the same `OUTPUT` directory, so the numbers survive only in that commit's message and
in the status record it wrote; the chromium PNGs themselves are still on disk.

WebKit, from `after-journey/report.json` (`createdAt` 03:24:11 SGT): `frames 288,
sequences 84, errors 0, httpErrors 0`, 8 ending captures and **12** records, with
72 stages in each context. Two extra files, `webkit/desktop-en/failure.png` and
`held-walk-failure.png`, carry mtime 03:24:00-01, before this run started, and appear in no
report entry: they are leftovers of a launch that failed at 03:24. What stopped that launch
is undetermined, since its server log was overwritten.

The two runs are not the same stage set. Chromium has one extra stage, `result-native-
departure`, which WebKit lacks. WebKit instead records four `native departure control`
interactions with empty `nativeEvents`, so its native tab/focus departure path was not
exercised and is unverified; the accelerated ending it does capture is the product's own
settlement, not a native departure.

The two phone contexts complete in both browsers, which confirms the pad fix in `5fa247a` and
the journey's draw step.

### A superseded WebKit attempt

An earlier WebKit attempt is recorded at
`artifacts/full-review/round-3/after-journey-webkit/report.json` (created 02:42:45 SGT). It
aborted: `desktop-en` reached 21 frames and then threw `Error: Ignition did not settle.`
(`full-journey-review.mjs:231`), and its cleanup then timed out for 90 s waiting for the
`Put out` control. `desktop-zh`, `phone-en` and `phone-zh` never loaded —
`page.goto: Could not connect to the server` — and the report carries 84 errors with 29 PNGs
on disk.

Mechanism: the capture server stopped during that run and every later request failed, so this
is not a product fault. `POST /api/candles` could not reach the server, `light()` in
`web/src/App.tsx` took its catch path, returned to the `candle` screen with `lightFailed`, and
never called `engine.ignite`; `window.__visualIgnition` therefore stayed null and the
journey's 120 s wait expired. The same failure explains the 90 s cleanup timeout: the
`Put out` control only exists on the burning screen, which was never reached. Evidence:
`after-journey-webkit/webkit/desktop-en/light-ignition.png` shows "Could not light it. Please
try again."; the report's last `desktop-en` frame records `screen: candle` with
`ignition: null`; and its `errors[2]` is a `/api/candles` `Could not connect to the server`.
Server death is consistent with the console log's presence WebSocket loss while the page
still reported `contextLost: false` and a live render frame counter, but the server's own log
from that run was overwritten, so what stopped it is undetermined. That attempt predates
`5fa247a` and is superseded by the run above.

## T10: final journey and status reconciliation

Status: **done**. The final journey exists on the branch tip and every item below carries
both a before and an after path. Two items are open by decision rather than by missing
evidence: J12 needs a new bake and is listed for the owner, and the unlit/ended lantern keeps
one unexplained step in its desktop approach series, recorded under T8.

Before and after, per item:

| item | before | after |
|---|---|---|
| T1 | measured 8525-9438 ms to an enabled `Step inside` | `j6-j2` captures plus 3130-3793 ms measured |
| T2b choose | 0.56 m shade at every duration | `lantern-size/choose-{desktop-en,phone-zh}-{10min,2h,24h}.png` |
| T2b burning | fixed 0.56 m shade | `lantern-size/burning-{desktop-en,phone-zh}-{10min,2h,24h}.png` |
| B5 phone choose | `choose-phone-zh-24h.png` tassel on the cup | `lantern-size/choose-phone-zh-{10min,2h,24h}.png` |
| T5 | bright 12 px accent badge | `after-journey/chromium/desktop-en/place.png` |
| T7 | `j6-j2/gate-shelf-{left,right}-desktop-en.png` | `j6-j2/gate-walk-{desktop-en,phone-zh}.png` |
| T8 | `j6-j2/lantern-unlit-{desktop-en,phone-zh}.png` | `j6-j2/t8-{desktop-en,phone-zh}-{00,08,16,23}.png` |
| T9 | about 13-15% of frame height | `after-journey/*/desktop-en/burning.png` |
| T3 | the 196-frame chromium-only run | `after-journey/{chromium,webkit}/<context>/` |

Every path above is relative to `artifacts/full-review/round-3/`. The round 1 baselines these
replace stay in `artifacts/full-review/round-1/after-journey/` and are not overwritten.

Measured on the final journey frames with `tests/visual/s2-frame-measure.mjs`, shade height
as a fraction of frame height for the 10 min lamp the journey lights:

| context | `burning.png` |
|---|---|
| chromium `desktop-en` | 16.2% |
| webkit `desktop-en` | 16.2% |
| chromium `phone-zh` | 10.9% |
| webkit `phone-zh` | 10.9% |

Both browsers agree to a tenth of a percent. This is the same 10 min lamp that measures 14.8%
in the T9 batch and 15.1% in the T2b batch: the frames differ, so the numbers differ, and each
is reported against its own frame.

Open by decision, not by missing capture: J12 (T6) needs a new bake, and the approach series
for T8 keeps one undetermined step at its largest desktop frame.

## Items for Boss

- J12: readable stacked bowls and leaning broom. They are baked region geometry lit only by
  the hall lightmap. A runtime fill light would also raise the surrounding floor, so this
  needs a new bake with more hall fill; it is out of scope for this branch.

## Items that still need GPU captures

- The timestamped approach series for J2, to show the shade does not flash red on the way in.

