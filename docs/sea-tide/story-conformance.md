# Tide Temple story conformance

Source audit of the S7 worktree at `fbe82e3`. The owner approved Tide Temple's
storyline on 2026-11-21. The source is
`/Users/xuan/OpenBot/Shared/one-light/ten-place-storylines.md:10`. The shared
rules, journey and music come from `world-bible.md` and
`one-light-experience-and-music-brief.md` in the same directory.
`GOALS.md:41–59,179–188` sets scene ownership and records camera decisions.

> Hear surf in a lane facing away from the sea. Beyond the granite wall the
> harbour entrance opens; salt marks its exposed side. Place the hooded lamp
> in the sheltered stone recess. Watch the harbour mouth between waves; the
> story leaves the wait open.

**Implemented in source** means the behavior or asset is present. **Differs**
means the current path only partly meets the requirement or conflicts with it.
**Missing** means the audited source has no implementation. Rendered framing,
timing, lighting, legibility and sound remain unverified unless stated
otherwise. This round did not run the browser or use the GPU.

## Place and approved story

| Requirement | Source finding | Runtime verification or gap |
| --- | --- | --- |
| Keep the place, catalog order and vessel | **Implemented in source.** `shared/places.ts:14` registers Tide Temple fifth as `sea-tide`, with vessel `shade` and the pottery hood lamp. The scene module is registered in `web/src/engine/scene.js:1584`. | Tide is hidden in `web/src/visiblePlaces.ts:4`. The app prefetch also requests the absent baked manifest for Tide (`web/src/engine/index.ts:59–77`, `web/src/engine/baked/prefetchPlace.js:26–35`). Use an isolated fixture for this review. |
| A believable coastal temple, with people felt through traces and no identifiable real temple | **Implemented in source in part.** `web/src/engine/places/sea-tide.js:14–29,49–52` builds a gate, hall, stone court, rope coils and bollard. No characters or named real temple are authored there. | Check that the built terrain, mooring traces and shoreline give the temple a convincing reason to be there. The approved row leaves the season and the visitor's private reason open. |
| Hear surf before seeing water | **Differs.** A narrow pier-like approach looks through the gate from `view` and `walk` (`sea-tide.js:10–20`), with water on the exposed sides. There is no sea-screened lane or authored threshold reveal. `web/src/sound.ts:16,100–119` synthesizes a surf-like wash. `web/src/App.tsx:260,340–359` starts it on Light, after the walk. | Verify the sea stays outside the approach frame through the wall and that surf is audible from the lane once the travel sound hook exists. |
| Salt on the exposed granite and a harbour mouth beyond it | **Missing.** `sea-tide.js:14–29` has one broad water plane, granite paving and walls, scattered rocks, a generic peak and animated foam. It has no seaward salt line or two defined shoreline forms framing a navigable mouth. | Confirm the salt reads on the face that receives spray. From the reveal and recess, distinguish near stone, midground channel and far coast/horizon with no visible water plane edge. |
| Place the hood in the sheltered stone recess and watch waves from there | **Differs.** `sea-tide.js:33–53` defines the arched lamp house, visitor mount and one neighbouring hood. `web/src/engine/scene.js:705–713,2154–2156` selects the pottery hood. Its position is authored, and generic ignition lights it in place. There is no separate placement action or authored view of a harbour mouth. | Verify the hood actually rests on the stone sill, the recess protects it, the visitor's light reads as the closest and strongest, and the mouth and wave motion stay readable without a camera change at ignition. |
| Signs of normal use and earlier wishes | **Differs.** Rope and bollard are present. The neighbouring niche has one lit hood (`sea-tide.js:46–48`, `scene.js:1097–1121`). The scene has no group of spent hoods, two or three low burning wishes, or clearly separate utility lamps. | Check the ordinary and wish lamps are distinguishable when authored, with space for the visitor and a readable hero lamp. Earlier fictional wishes are local scene props. |
| Presence counts people and the wait stays open | **Implemented in source in part.** Shared live presence display uses `web/src/App.tsx:172–190,369–390` and `web/src/i18n.ts:66,210`. The place line describes the steady light and leaves the reason for the wait open (`shared/places.ts:14`). | Check that other players only affect the count and that the seated shot and shared result copy do not imply who or what the visitor is waiting for. |

## Journey and camera

The shared brief §2 covers Home, Place, Walk, Choose, Ignition, Burning,
Ending and Result. Its 30-second walk is the target for Tide. The exact
harbour reveal time is open. Use 26–30 seconds as a review target, based on
the shared music cue shape and Bell Lane precedent. The 25°/s peak rotation
limit in `GOALS.md:59` applies to Bell Lane. It is a proposed review cap for
Tide, including easing, pending Boss's direction on a common numeric limit.
The Snow Roof turn and field of view exceptions are specific to Snow Roof.

| Journey stage | Source finding | Runtime verification or gap |
| --- | --- | --- |
| Home → Place | **Implemented in shared source.** Home captures the wish, Place previews the entrance, and Light sends the wish text or ID with the chosen shape and place (`web/src/App.tsx:262,296–329,393–432`). | Confirm the loopback fixture carries the Home wish through Tide's entrance and into the lit lamp. |
| Walk and Skip | **Differs.** Tide has four waypoints and a gate target (`sea-tide.js:10–11`). The shared procedural route uses 14 seconds by default and then a 2.4-second chooser move. It supports `viewPhone`, `createWalk`, `walkSeconds` and Skip (`scene.js:2376–2394,2430–2514`). | Record one continuous route on each viewport. Sample position, facing direction, field of view and peak rotation through the seated pose. Check eye height, wall clearance, continuity, total time to chooser, and Skip ending in the same stable composition. |
| Choose | **Implemented in shared source in part.** The app maps `shade` to the lamp chooser, supports presets and drawing, and supplies colour and duration (`App.tsx:145–170,450–507`). The scene selects a live hood, but generic shade thumbnails render gauze (`scene.js:2278–2286`). | Check the ready-made chooser clears the hood, wick and harbour gap on phone. Only the drawing sheet has an approved exception to lamp visibility (`GOALS.md:179–183`). Hood-specific thumbnails and copy are follow-up work. |
| Ignition → seated burn | **Differs.** The procedural branch lights the hood in the chooser composition in 1.6 seconds, without a staged placement or taper cue (`scene.js:2542–2561`). The brief targets about 13–15 seconds including settle. | In the first visual slice, keep the same viewpoint through lighting and verify the lit hood and mouth together. Treat the full ignition pacing as a later gap. |
| Burning and Result | **Implemented in shared source in part.** The shared chooser and timer handle 5 minutes to 24 hours and the result branches by completion (`shared/rules.ts`, `web/src/burn.ts`, `App.tsx:235–256,538–565`). Tide has no dedicated travel, burn or ending music. Home and Result use shared cues (`web/src/music.ts:42–59`). | Verify continuous flame and visible wave motion in the same composition, plus mute and the result handoff. Tide cue direction and production are a separate dependency. |

## Six local times

`shared/dayPart.ts:7–15` defines the local time buckets below. Tide supplies
one day and one night lighting state (`sea-tide.js:5–9`) and inherits
interpolation for sky, fog, exposure and light (`scene.js:1524–1580,2832–2846`).
The scene samples the clock roughly every 15 seconds with quantized blend
values. The live sun position update in that loop is Pine-specific. Tide's
synthesized surf has one profile and no day-part selection. Thus all six
times have shared clock support, with Tide-specific light, sound, smooth
transitions and legibility still to verify. The hours below are proposed review
samples.

| Local time | Baseline in source | Capture and compare |
| --- | --- | --- |
| Dawn, 05:00–07:59 | Shared night-to-day blend, warmth and haze. | 06:00. Read the lane, wall face and harbour entrance through the transition. |
| Morning, 08:00–10:59 | Shared daylight blend on the morning light side. | 09:00. Read the masonry and the recess without losing the mouth. |
| Midday, 11:00–13:59 | Tide day endpoint with strongest shared sun height around 13:00. | 13:00. Keep salt marks, stone, hood and opening readable in bright conditions. |
| Afternoon, 14:00–16:59 | Shared afternoon light direction at entry and warmer blend. | 16:00. Check separation of the wall, recess and the opposite shoreline. |
| Dusk, 17:00–18:59 | Shared warmer shift toward the night endpoint. | 18:00. Check the shape of the channel and a steady, readable visitor lamp. |
| Night, 19:00–04:59 | Tide dark sky, fog and cool fill through the shared blend. | 22:00. Path, wall, recess, hood, waves and harbour opening remain legible. |

## Endings and returning

| Requirement | Source finding | Runtime verification or gap |
| --- | --- | --- |
| Natural exhaustion, about 30 seconds in the shared brief | **Differs.** Completion persists through the shared burn flow and zeroes the lamp level. The generic snuff effect adds ember, smoke and cooling, with a 2.6-second power fade (`App.tsx:235–256`, `scene.js:2716–2761`). The result opens and no Tide ending cue is selected. | Verify fade, smoke and a spent lamp seen in the recess. The hood has no visible oil-level model, so the spent state beyond darkness is unverified. |
| Early extinction, about 12 seconds in the shared brief | **Differs.** Put out settles separately and starts a roughly 0.12-second flame fade with smoke (`scene.js:2716–2761`). The generic hood has a fixed wick and no visible remaining oil (`scene.js:705–713`). Shared leave handling also settles the burn (`web/src/burn.ts:23–26,55–65`). | Verify distinct early and natural endings, including near-expiry classification under the server's 1.5-second tolerance (`server/app.ts:14,137–161`). The approved Tide row supplies no place-specific extinction action. |
| Return to one's own finished lamp | **Missing in 3D.** The server saves visitor-scoped place, shape, status and duration, and the app loads past lamps with remaining fuel (`server/app.ts:46–55,105–161`, `App.tsx:296–309`). The engine stores the list, and Tide defines no past-lamp slots (`scene.js:2222–2234`, `sea-tide.js:33–55`). | Confirm the owner's earlier hood shows its saved shape, colour and state once slots exist, stays private, and leaves a free place for another wish. |

## First proposed scene change for Boss review

Build one visual sequence: an enclosed lane facing inland, a turn past the
granite wall with salt on its exposed face, then the harbour mouth between
two shoreline forms. Set a continuous stone sill under the hood and compose
the settled view so the mouth remains visible beside it. Retain the granite
texture and water, rock, foam and hood helpers already in use
(`web/public/materials/weathered-granite.jpg`,
`web/src/engine/scene.js:147–163,705–713,1262–1303`).

- **File scope:** `web/src/engine/places/sea-tide.js` and, if route data
  warrants a separate module, `web/src/engine/places/sea-tide-camera.js`.
  Keep review harness and capture instructions under `docs/sea-tide/`.
- **Desktop and phone acceptance:** 1440×900 desktop and 390×844 phone,
  conforming to `tests/visual/full-journey-review.mjs:33–35`. At 13:00 and
  22:00 capture the entrance, the last enclosed frame, the first open view
  across the salt-marked wall, the ready-made chooser and the lit recess.
  Show lamp contact and keep the hood and visible flame or glow, wave motion
  and harbour gap clear of the UI. Include one continuous unskipped route
  and a Skip take on each viewport, with camera trace through the chooser
  and lighting.
- **Shared dependencies:** use `createWalk`, `walkSeconds`, the entrance
  phone pose and the chooser poses already in `scene.js`. For full UI review,
  isolate the catalog and bypass baked prefetch in the loopback fixture,
  following `s0-bell-lane/docs/bell-lane/preview.mjs` in the sibling
  worktree. The dev camera trace and walk progress are available in
  `scene.js:1938–1947,2442–2487`. Measure the generic 1.45× phone pullback,
  downward chooser aim and 2.4-second settle before requesting a Tide-only
  camera opt-in. The procedural walk ends at the wide pose and the walk
  progress marker completes before the move to the chooser. Measure the
  full interval through chooser entry. Surf on approach is a separate shared dependency: start
  the existing sound on the travel gesture, vary filtering and gain with
  exposure past the wall, and verify mute, Skip, lighting, revisit and
  place-switch cleanup.
