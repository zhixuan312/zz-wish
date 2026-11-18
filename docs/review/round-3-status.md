# Round 3 status (Snow Roof Court)

Branch `s2/snow-roof-finish`. Every item below names its status, its before/after capture
path where one exists, and one sentence of judgement. Items that need a new Blender bake
are listed for the owner and are out of scope for this branch.

## T1: `Step inside` enabled within 5 s

Status: **partly** — not fixed; root cause measured.

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

This root cause sits inside the cover module, which this branch must not change, so the
fix needs an owner decision before it is applied.

## T2b: the hanging shade grows with the chosen burning time

Status: **done (implementation and unit test)**; visual capture pending.

`lanternHeightMetres` in `shared/rules.ts` maps 10 minutes to 0.350 m and a full day to
0.560 m, logarithmically in time, clamped outside that range. The `liveBaked` branch of
`gauze()` multiplies its proportional fit by that envelope, so 24 h is unchanged
(envelope 1.000) and 10 min renders at 62.5% of the previous height.

Computed envelope per preset: 10 min 0.625, 30 min 0.708, 1 h 0.760, 2 h 0.813,
3 h 0.843, 6 h 0.895, 12 h 0.948, 24 h 1.000.

Unit tests in `tests/tier1/unit/rules.test.ts` pin both endpoints, the clamp outside the
preset range, and strict growth across `PRESET_MINUTES`.

## T2: J15 phone drawing pad

Status: **partly** — CSS delivered, real-viewport measurement pending.

At `max-width:720px` the draw view is now one column and the pad takes the sheet width
(`width:100%; max-width:420px`) instead of the fixed 150 px. The pad keeps its 2:3 aspect
ratio, so the stroke-to-metre mapping is unchanged. Desktop layout is untouched.

## T2: J16 long wish in the burning view

Status: **partly** — CSS delivered, real-viewport measurement pending.

`.hud-wish` is clamped to two lines with `-webkit-line-clamp`, `overflow:hidden`, so a wish
beyond the box ends with a visible ellipsis and never grows past its container. Short
wishes render as before.

## Items for the owner: these need a new Blender bake

None recorded yet.
