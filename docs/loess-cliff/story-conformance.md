# Loess Cliff Court story conformance

Baseline: `fbe82e3`, reviewed from `s8/loess-cliff`. The approved Loess row is in
`../ten-place-storylines.md` relative to the worktree root (shared One Light directory,
line 12). `../world-bible.md` §§ Rules for every place, Home and Returning and
`../one-light-experience-and-music-brief.md` §§2, 5–7 govern the shared journey.
The Snow Roof, Pine Gate and Bell Lane examples specify those places' local details.

**Present** means the code contains the feature. **Partial** means the code contains
part of the required behavior. **Missing** means the required behavior is absent from
this source. Current runtime verification is pending wherever named below. The
historical desktop and touch emulation captures are visual evidence for their own
builds only.

## Approved place and shared journey

| Requirement | Source status and evidence | Runtime evidence still needed |
| --- | --- | --- |
| Keep the existing court name, catalog order and shallow clay oil lamp. | Present in `shared/places.ts:16` and `web/src/engine/places/loess-cliff.js:29`. The clay dish has a pinched spout and a fixed short wick (`web/src/engine/scene.js:681–685`). The catalog entry is seventh. The public selector currently lists Snow Roof and Pine Gate (`web/src/visiblePlaces.ts:4`). | Verify the correct title, lamp and default clay finish in a private review fixture. |
| Home opens on a mountain panorama at local time. The visitor writes a wish and takes it to the place. | Shared wish input, place selection and lighting request are present in `web/src/App.tsx`. The engine still uses Cloud Cliff as its cover (`web/src/engine/scene.js:2022,2399–2407`). No Loess copy explains the approved local actions today. | Open the normal flow in the fixture and verify the same private wish reaches lighting and the result. Home panorama and local custom copy need separate review. |
| Enter a sunken cave court from a cart lane, moving from enclosure into open space. | Partial. A low gate and worn strip lead to thick arched cave fronts with paper windows (`web/src/engine/places/loess-cliff.js:9–26,33–61`). The gate has a level walking strip, the court floor top is at ground level, and all main walking control points are at y=1.68 m. There is no authored descent or held court reveal. | Establish the level difference in a site section and capture the cart lane, threshold and reveal in motion. Verify that the foreground, court and cliff backdrop read at both aspect ratios. |
| Side light reveals a rounded window ledge and the stain left by years of setting down a lamp. | Partial. The shared lighting blend gives the scene directional light and the main window has a shallow box sill. The sill has no authored use stain or worn earthen profile (`loess-cliff.js:5–8,33–55`). Its nominal top is 1.0125 m, while `nook.y` places the dish base at 1.0000 m (`web/src/engine/scene.js:2141–2154`). That is 12.5 mm of overlap at the centre. | Check bearing contact in a close view and that the rounded edge and stain stay legible before ignition in both views. |
| People are felt through use of the court. The visitor's lamp is the nearest and brightest among earlier wishes. Ordinary lamps have a distinguishable practical use. | Partial. Firewood, jars and seating suggest daily use. The scene defines one neighboring clay lamp and emissive paper windows, with no authored group of spent cups or separate practical lamp model (`loess-cliff.js:43–66`). Shared presence copy counts people (`web/src/i18n.ts:66,210`). | Verify that furnishings communicate use without visible people, that earlier wishes are legible, and that the visitor's lamp remains the focus. |
| Choose or draw the oil dish and select how long it burns. | Present in shared code. `web/src/App.tsx:145–154` maps the oil vessel to the shared chooser. `shared/rules.ts` describes capacity, duration, ready-made choices and oil colours. | Check ready-made and drawn options in the review fixture. Check that the seating and camera composition handle the permitted cup sizes. |
| Fill the cup, tend the wick, light it and set it back. The flame reveals the layers in the earthen window. | Partial. The generic oil level, fixed wick and live flame exist (`web/src/engine/scene.js:682–685,977–984,1028–1050`). The cup appears at its seat with fuel and stays there. Procedural ignition ramps the flame over 1.6 s in the chooser frame (`scene.js:2542–2561`). There is no fill, wick tending or set-down sequence and no authored local reveal within the hero window's jamb. | Later, verify the ritual is readable from lighting through the shared 13–15 s ignition and settle. For the first slice, compare unlit and settled frames to isolate live light on the layered earth. |
| Stay for 5 minutes to 24 hours, then see the result, light another or leave. Music continues from the first interaction to the ending and can be muted. | Shared burn clock, result and navigation exist (`web/src/burn.ts`, `web/src/App.tsx:235–294,550–568`). The Loess dry-wind profile is present (`web/src/sound.ts:19–20`). `web/src/music.ts:42–56` supplies no Loess stage music. | Verify elapsed time, leaving and choosing again in the fixture. Check ambience playback and mute. A Loess cue decision belongs to a later shared audio round. |

## Camera

- The shared brief calls for a continuous, skippable 30 s walk. Loess currently
  uses the generic 14 s tween and a separate 2.4 s move to the chooser
  (`web/src/engine/scene.js:2430–2443,2512–2514`). Its route and final pose are
  `walk`, `doors`, `nook.approach` and `nook.wide` in `loess-cliff.js:9–10,28–31`.
- There is no authored Loess portrait pose. The procedural `viewOf` pulls the
  phone camera back by 1.45× and discards authored FOV. `chooseView` then lowers
  the phone aim by 10% of distance (`scene.js:2024–2029,2076–2079`). The shared
  clay ignition holds this pose. The compact phone chooser must leave the
  full cup visible. The draw-tab exception in `../GOALS.md` applies only while
  drawing. Snow Roof's specific rotation allowances do not apply to Loess.
- For the later route round, measure the actual duration through chooser arrival,
  skip behavior, eye clearance relative to the graded path, motion and peak turn
  speed including easing, and projection of the sill and cup. Use the Bell Lane
  common peak turn check of 25 degrees/s as a proposed review target for Loess.
  The approved Loess row supplies story beats without fixed seconds for each beat.
  The existing `walkSeconds`, `createWalk`, `viewPhone` and `choosePhone` hooks
  can cover much of the route. A scoped hook to bypass the extra chooser move
  may be needed to keep the walk and seating within the agreed timing.

## Six local times

Loess supplies two endpoint looks (`loess-cliff.js:5–8`). Shared `DAY_KEYS`,
`daylight` and `blendPlace` (`web/src/engine/scene.js:1521–1580`) blend sky,
exposure, light colour and fog from local time. The live clock refresh
(`scene.js:2833–2847`) updates light colour and base intensity, while only Pine
Gate moves the live sun direction during this refresh. The Loess paper's initial
emissive intensity uses the light at scene construction (`loess-cliff.js:50`).
`shared/dayPart.ts:4–16` provides the six labels. There is no Loess `lightAt`
curve or authored time-specific ambience. The following are capture targets, not
approved additions to the story.

| Local time | Present in shared blend | Verify in a later six-look pass |
| --- | --- | --- |
| Dawn, 06:00 | Partial day/night mix, blue lift and rising light. | Gate and descent remain legible through ground mist. |
| Morning, 09:00 | Lower daylight angle and warmth. | The ledge profile and use stain read in side light. |
| Midday, 12:00 | Higher daylight with low golden tint. | Path, cliff layers and cave depth retain contrast. |
| Afternoon, 16:00 | Lower, warmer daylight. | Raking light separates wear on the sill from the clay cup. |
| Dusk, 18:00 | Shared warm and blue-hour blend. | Threshold and window stay readable as ambient light changes. |
| Night, 22:00 | Loess night endpoint and shared ambient lift. | A dark sky and a readable route coexist. The live wick adds local light to the earthen reveal. |

Check a live change of hour as well as fixed-time loads, including sunlight
bearing, the paper window and sound. Initial scene looks do not establish that
these update during a long burn.

## Endings and returning

| Requirement | Source status and evidence | Runtime evidence still needed |
| --- | --- | --- |
| Natural exhaustion leaves an empty cup in place. The shared ending is about 30 s. | Partial. `web/src/burn.ts` settles at the duration and `server/app.ts:144–152` records `burned_down`. `web/src/engine/scene.js:2747–2761` retains the mesh, sets oil level to zero and gives the flame a 2.6 s final fade with smoke. The generic oil surface is still drawn at the vessel floor with a nonzero radius (`scene.js:977–984`). `web/src/App.tsx:240–254` sets the result during settlement. | Confirm the cup reads as dry and remains on its seat. Record the transition from low fuel through the result and compare its timing with the brief. |
| Early extinction leaves the partly full cup. The shared ending is about 12 s. | Partial. The path ends the flame quickly with a smoke plume and records `went_out`. App gives the exact remaining level to `snuff` only for wax. Oil retains its most recent level sample from the once-a-second update (`web/src/App.tsx:229–254`, `web/src/engine/scene.js:2747–2761`). | Verify immediate visible extinction, residual oil and the overall ending beat after both manual put-out and leaving. |
| On returning, the visitor finds their own old lamp among earlier lamps. | Missing in the court. App retrieves private finished records and the scene stores them. Loess has no placement for them (`web/src/App.tsx:296–309`, `web/src/engine/scene.js:2222–2234`). | Compare a revisit and a second lighting within one visit. Verify retained shape, finish and fuel state, and keep the visitor's earlier lamps private. |

## First proposed change and acceptance

Change `web/src/engine/places/loess-cliff.js` only. Shape a rounded, worn earthen
sill with a flat bearing surface at the actual lamp base, a visible trace of
repeated use and a layered jamb close to the wick. Reuse the arch, clay dish and
wick, procedural loess and wood materials, and paper lattice. Author local
`choose` and `choosePhone` poses for one oblique frame that can hold through the
current clay ignition. Calibrate around the existing phone transform first.

Capture matched baseline and candidate frames at local 16:00 and 22:00 on
1440×900 desktop and 390×844 touch emulation. Capture the real ready-made chooser
with compact UI visible and the settled lit view for each pair. Include matched
clean unlit/lit frames to show the change in the jamb under the flame. The cup
must visibly bear on the sill and remain readable from rim to wick above the
chooser sheet. The worn profile and stain must read before ignition, and warm
local flame light must pick out the layered earth at night. Record viewport,
local hour and pose. Include one short ignition clip to check continuity.

Shared review prerequisites: an isolated fixture exposing Loess to the normal
place UI and a procedural preparation path in `web/src/engine/index.ts:59–77`
that calls `scene.preparePlace` without requesting a missing baked manifest.
`tests/tier2/realism.mjs:105–151` is a capture precedent, but it selects radios by
catalog index. The review fixture should select by the accessible court name.
Ask Boss about a procedural phone pose and FOV opt-in only if the current
transform prevents the composition. Leave the descent, the oil ritual, dry cup
state and old-lamp placement for independently reviewed follow-up scopes.

Historical comparison: `docs/realism-rounds.md:40–59` and
`docs/realism-evidence/visibility1-report.json`. The original
`artifacts/realism/visibility1/{desktop,phone}/loess-cliff/lit.png` frames in the
main checkout show the wick and flame while the cup body is scarcely visible.
No new runtime or GPU captures were made for this audit.
