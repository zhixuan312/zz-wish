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

Cover regression: phone-emulation cover renders at 59.9 FPS (median frame 16.7 ms) and
`/tmp/one-light-s2-cover/{desktop,phone}-cover.png` show the same cloud field and lamp
light as before the change.

## T2b: the hanging shade grows with the chosen burning time

Status: **done**. Captures in `artifacts/full-review/round-3/lantern-size/`.

`lanternHeightMetres` in `shared/rules.ts` maps 10 minutes to 0.350 m and a full day to
0.560 m, logarithmically in time, clamped outside that range. The `liveBaked` branch of
`gauze()` multiplies its proportional fit by that envelope, so 24 h is unchanged
(envelope 1.000) and 10 min renders at 62.5% of the previous height.

Computed envelope per preset: 10 min 0.625, 30 min 0.708, 1 h 0.760, 2 h 0.813,
3 h 0.843, 6 h 0.895, 12 h 0.948, 24 h 1.000.

Unit tests in `tests/tier1/unit/rules.test.ts` pin both endpoints, the clamp outside the
preset range, and strict growth across `PRESET_MINUTES`.

Checked on real captures at desktop-en and phone-zh (`choose-10min`, `choose-2h`,
`choose-24h`, `burning`): the shade changes size immediately when another duration is
chosen, the cord stays continuous at all three sizes, no shade touches the ceiling beam,
the columns or the table below, the flame and wick sit inside the shade, and 24 h matches
the previous picture. No ground pool or shade-glow anomaly was visible at the small sizes.

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

Status: **fixed in code**, capture pending the next GPU batch. On a phone the sheet covers
the lower two thirds, so the lamp now sits at 13% of the visible band above the altar
stand instead of 20%. Only the narrow-screen subject height changed; the stand, the shade
and every asset are untouched. The 10 min, 2 h and 24 h choose captures will confirm the
gap under the tassel in the next batch.

## T5: J17 the presence badge

Status: **done**. The count is ambient context, not a status line, so it now reads in a
muted grey at 11 px with 0.72 opacity, no text shadow and a hairline dot instead of the
warm accent bullet. The wish text and the lamp are again the two loudest things in frame.

## T6: J12 the stacked bowls and the leaning broom

Status: **partly** — the props are inside `snow-roof.glb.zstd` and carry only baked
lightmap irradiance; the runtime cannot brighten them without changing the bake or adding
a fill light that would also raise their neighbours. Recorded as an owner item.

## T7: J6 the gate flame and offering bowl under gate bloom

Status: **partly** — the gate flame is already a live runtime flame (`liveFlame` with
`fixtureSpecular`), while the bowl silhouette is baked geometry. Judging the silhouette
needs a gate-held capture that this run has not produced yet.

## T8: J2 the unlit and ended lantern

Status: **partly** — approach and ending continuity need the same held captures.

## T9: J5 the desktop burning lantern size

Status: **partial** — see the measured fraction below.

## Items for the owner: these need a new Blender bake

- J12: readable stacked bowls and leaning broom. They are baked geometry lit only by the
  hall lightmap; raising them needs either a new bake with more hall fill, or a runtime
  fill light that also brightens the surrounding floor.

## Items that still need GPU captures

- T7 and T8 held gate/approach/ending frames.
- The round 3 eight-context journey (T3) and its report.

None recorded yet.
