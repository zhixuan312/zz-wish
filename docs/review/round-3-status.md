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

Burning, cloth height as a fraction of frame height (measured between the shade's upper
and lower rims):

| viewport | 10 min | 2 h | 24 h |
|---|---|---|---|
| desktop-en | 15.1% | 19.1% | 24.0% |
| phone-zh | 10.8% | 14.1% | 17.1% |

Captures: `artifacts/full-review/round-3/lantern-size/{choose,burning}-{desktop-en,phone-zh}-{10min,2h,24h}.png`.

## T2: J15 phone drawing pad

Status: **done** — measured 358 px at 390x844.

At `max-width:720px` the draw view is now one column and the pad takes the sheet width
(`width:100%; max-width:420px`) instead of the fixed 150 px. The pad keeps its 2:3 aspect
ratio, so the stroke-to-metre mapping is unchanged. Desktop layout is untouched.

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

Status: **done (verified, no code change needed)**. Held captures of the gate passage and
of each shelf lamp from the court side show both bronze oil cups, their flames and the
bowl rims clearly against the gate bloom: the bloom haloes them but never swallows the
silhouette. Captures:
`artifacts/full-review/round-3/j6-j2/gate-{passage,shelf-left,shelf-right}-{desktop-en,phone-zh}.png`.

## T8: J2 the unlit and ended lantern

Status: **done (verified, no code change needed)**. The unlit shade shows its red cloth,
bamboo ribs, cord and tassel instead of reading as a black cutout, and the ended shade
keeps the same readable cloth and ribs with no red flash. Captures:
`artifacts/full-review/round-3/j6-j2/lantern-{unlit,burning,ended}-{desktop-en,phone-zh}.png`.

## T9: J5 the desktop burning lantern size

Status: **done**. The settled desktop burning view now frames against a fixed full-day
lamp reference, so the cloth covers 23.8% of frame height at 24 h, 19.2% at 2 h and 14.8% at
10 min, against about 13-15% before. Only camera placement changed.

## Items for Boss

- J12: readable stacked bowls and leaning broom. They are baked region geometry lit only by
  the hall lightmap. A runtime fill light would also raise the surrounding floor, so this
  needs a new bake with more hall fill; it is out of scope for this branch.

## Items that still need GPU captures

- T7 and T8 held gate/approach/ending frames.
- The round 3 eight-context journey (T3) and its report.

None recorded yet.
