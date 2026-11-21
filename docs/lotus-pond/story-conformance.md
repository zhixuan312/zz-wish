# Lotus Pond Court story conformance

Source baseline: `fbe82e3` on `s6/lotus-pond`. This is a source audit. The labels **Implemented**, **Differs**, and **Missing** describe what the current code provides. Every visual, timing, and audio claim in the verification column still needs a runtime check. No build, browser, or GPU job ran for this round.

## Approved direction

The owner approved Lotus Pond Court on November 21, 2026. The visitor brings the wish written at Home. They follow the pond wall onto the bridge, see the old lamp stands reflected in the pond, then round the rail and see those same stands directly. They set the lotus candle into the stone seat above open water. A ripple breaks the reflected flame, which gathers again. The court explains its local custom and leaves the reason for the wish private. Its catalog position, names and wax vessel carry forward.

The authority is `/Users/xuan/OpenBot/Shared/one-light/ten-place-storylines.md:2,9`, with the common rules and returning behavior in `world-bible.md:5,117` and the common journey and clock in `one-light-experience-and-music-brief.md:11,85` in that directory. The detailed scene recipes in those documents are for Snow Roof and Pine Gate. Lotus has no approved season, source of ignition, individual time of day treatments, or specific ending props. The candidate framing and times below are for review.

## Site and story

| Requirement | Source assessment | Change or runtime verification |
| --- | --- | --- |
| A believable place, with signs of care and a local custom | **Differs.** White plaster walls, gate, halls, the rim of the pond and a low crossing establish a plausible site. The stone seat implies repeated use. The source has no distinct repair or wear cues specific to that use and the catalog line describes the reflection alone. [Court geometry][scene] · [Catalog entry][catalog] | Keep the footprint where it serves the route. Give the stands and their setting traces of use. Confirm that the architecture and the stand placement explain the custom. |
| Quiet presence, everyday lamps and other wishes | **Differs.** The scene builds no people. The halls have warm glow parameters and the shared audio has occasional frogs. Two smaller lit lotus lamps sit on either side of the visitor seat. No group of old stands with spent lamps is authored. [Court geometry][scene] · [Stand and seat][seat] · [Ambience][sound] | Make the earlier stands read as a group, with mostly spent wax and a few subdued flames. Distinguish any practical lights visible there from wish lamps. Check that the visitor's lamp reads first. |
| Pond wall → bridge | **Differs.** The walls and bridge are in the scene, but the route uses a straight centerline through the gate and approach points near the alcove. [Current route][scene] | Verify the feet of the camera path stay over dry paving and bridge deck, with clearance at the turn and rail. |
| Old stands appear first in reflection, then directly | **Missing.** The water reflects the real scene, but the current walk supplies no timed reflection sightline, rail turn, or direct reveal of an old stand group. [Current route][scene] · [Planar reflector][water] | Record the same identifiable stands reflected before they clear the rail. Verify the direct reveal opens onto the pond and retains foreground, middle ground and distance. |
| Set the lotus candle in the stone seat over open water | **Implemented in geometry.** There is an empty raised seat in the west alcove and the visitor lamp attaches there. The wax holder has two rings of petals. The code places open water below the seat. [Stand and seat][seat] · [Lotus holder][holder] · [Lamp attachment][attach] | Verify contact with the seat, visibility of the placement and reflection ray, and no occlusion by the rail, deck, pads or chooser. The current lamp is placed by the engine. An authored placement action remains to be designed if needed. |
| A ripple breaks the flame reflection and it gathers again | **Missing as a story beat.** The reflector samples the actual scene, including the live flame, and its two animated sine offsets distort the image continuously. There is no local passing ripple with a held clear reflection before and after. [Planar reflector][water] | After the route and framing pass, add a local wave across the reflection using the existing reflector. Verify clean → broken → clean while the real flame stays readable. |

## Shared journey, camera and endings

| Stage or rule | Source assessment | Change or runtime verification |
| --- | --- | --- |
| Home → entrance | **Implemented in shared flow.** The wish must be entered before choosing a place. The engine still uses Cloud Cliff as the Home cover, which differs from the world bible's separate mountain panorama. The Lotus catalog entry exists, but **public entry is missing**. The picker includes Snow Roof and Pine Gate, and the shared prefetch treats Lotus as baked even though no Lotus manifest exists. [App flow][app] · [Home cover][views] · [Visible places][visibility] · [Prefetch][prefetch] | Use a private engine review for scene proof. To review the full app privately, coordinate isolated exposure and a procedural preparation path with Boss. Keep the production catalog unchanged during the scene slice. |
| Walk and skip | **Differs.** Shared skip is wired. Lotus receives the 14 s fallback walk, followed by a 2.4 s procedural move to the chooser. There is no authored 30 s approach and reveal. [Travel and skip][travel] | Clock the uninterrupted walk through arrival and prove skip during both approach and the turn reaches the same chooser pose promptly. |
| Choose and confirm | **Implemented in shared flow.** A wax place offers preset or drawn profiles, color and duration. The common range is 5 minutes to 24 hours. The shortest ready made preset is 10 minutes. [Choice flow][choices] · [Duration rules][rules] | Check the smallest and largest ready made profiles and a wide drawn profile. The compact phone chooser and confirm UI must leave the lamp readable. The approved phone draw tab exception permits that taller sheet to cover the preview. |
| Ignition and seating | **Differs.** The procedural path catches the flame within a 1.6 s animation and stays on the chooser pose for Lotus. It does not perform the brief's roughly 13–15 s ignition and settle. The declared `nook.burn` pose does not control normal Lotus ignition. [Ignition][ignite] · [Stand and seat][seat] | First prove a shared chooser and burning pose per viewport. Any later ignition or placement treatment must preserve the wish handoff and provide a continuous settle. |
| Stay with the lamp | **Differs.** Lotus has a reflected visitor flame, fixed earlier lamps, and shared session timing. The UI updates ongoing fuel for oil and shade. The engine reads the wax fuel callback only for Pine, so Lotus wax does not advance through that path during a normal burn. Presence copy refers to people. [Burn and settlement][appBurn] · [Render loop][render] · [Presence copy][presence] | Prove near flame, wax, seat and reflected flame are legible and dominant. Follow up on continuous wax consumption separately from the framing slice. |
| Burn down naturally | **Differs.** Common settlement marks completion, presents the result and sends the saved record. The generic scene sets the remaining level to zero and starts smoke and a short ember effect. It has no Lotus-specific natural ending treatment or matching roughly 30 s ending cue. [Burn timer][burn] · [Burn and settlement][appBurn] · [Extinguish visuals][snuff] · [Music routing][music] | Accelerate the clock in private review. Check the flame and its reflection go out together, the seat retains the spent candle or holder, and the shared result records completion. Bring the final visual timing to Boss. |
| Put out or leave early | **Differs.** Shared controls and page departure settle and save early endings. Generic visuals extinguish with smoke. `snuff` receives remaining wax from the UI but only applies that amount for Pine wax, so Lotus does not explicitly show the saved shortened wax. There is no Lotus ending cue for the roughly 12 s beat. [Burn timer][burn] · [Burn and settlement][appBurn] · [Extinguish visuals][snuff] · [Music routing][music] | Verify saved remaining wax after a partial burn, immediate loss of visible flame and its reflection, one thread of smoke and the result. Approve timing separately. |
| Result, another light and return | **Differs.** The result can start another light for the same wish or leave. Private finished records are filtered by place and passed to the engine, which stores them. Lotus renders no returning lamp slots, and the procedural seat defaults to the same position. [App flow][app] · [Past lamps][past] · [Lamp attachment][attach] | Verify the result and revisit first, then scope visible personal remnants and how the next candle takes its place without exposing anyone else's records. |
| Music and natural sound | **Differs.** Shared Home and result cues and mute exist. Stage music maps to Snow Roof or Pine only. Lotus uses a synthesized room bed and occasional frog tones. There is no Lotus place cue set or authored clock variation in that ambience. [Music routing][music] · [Ambience][sound] | Keep the common controls. Agree on Lotus cue treatment with Boss before new audio work. Test stage handoffs, mute and cleanup on place switch later. |

**Camera.** The current entrance and nook poses are shared across devices. In portrait, the generic nook transform pulls the camera back and the chooser applies an additional downward aim. Existing seams are `viewPhone`, `createWalk`, `walkSeconds`, `nook.widePhone`, and `nook.choosePhone`. Aim for one steady seated shot per viewport from the ready made chooser through ignition and burning. Check eye height, foot clearance, yaw and pitch rate, vertical FOV, the bridge rail's occlusion, and the real UI safe area from frame to frame. For route review, propose a peak turn of at most 25°/s through the easing, using the Bell Lane reference in `GOALS.md:59`. That entry is specific to Bell Lane. Confirm any Lotus camera limits with Boss. [View transforms][views] · [Travel and skip][travel]

## Six local times

Lotus defines day and night endpoints and uses the common local-clock curve. The descriptor has no Lotus-specific `lightAt` function. The engine rechecks the curve every 15 s and updates sky, light colors, intensity and fog. In that live clock path only Pine updates the sun's position, so a meaningful change in Lotus shadow direction during a stay still needs a separate hook. The ambience has no local time schedule. Confirm blending across boundaries and night readability with the camera held still. These are candidate capture hours, in local time. [Day and night endpoints][scene] · [Clock curve][clock] · [Live clock update][render] · [Ambience][sound]

| Time | Source coverage | What to verify |
| --- | --- | --- |
| Dawn, 06:00 | **Implemented in common blend.** Mixed day and night, warm low light and dawn haze. | Read the wall edge, bridge entry and a reflected stand in the early light. |
| Morning, 09:00 | **Implemented in common blend.** Day endpoint with reduced warm tint and brighter ambient light. | Read the rail, lotus leaves and reflected stands as separate forms. |
| Midday, 13:00 | **Implemented in common blend.** Full day endpoint with the highest shared sun elevation factor. | Keep pale stone legible and bright water below the stand and flame in contrast. |
| Afternoon, 16:00 | **Implemented in common blend.** Softer sun and more warm tint than midday. | Check that shadow and color read differently from morning as well as midday. |
| Dusk, 18:00 | **Implemented in common blend.** Warm low light mixes with the night endpoint. | Check practical and wish lamp separation. Keep practical lights visible from the seat steady across dusk per the world bible. |
| Night, 22:00 | **Implemented in common blend.** Night sky, fill and warm porch parameters. | Follow the paving, bridge and rail without relying on the visitor flame. Read the stone seat and distinguish the old stand reflections. |

## First proposed scene change

**Scope.** Change only `web/src/engine/places/lotus-pond.js` for this first implementation. Keep the existing gate, pond footprint, bridge envelope, west alcove and procedural materials where useful. Author the pond wall approach, bridge reflection sightline, and turn past the rail. Add the minimum old stand geometry and spent wax needed to make the reflection and direct view recognizable as the same group. Use matching walk arrival and chooser poses and hold the composition through the current ignition. A private fixture can use the engine directly and the existing camera trace; keep fixture work separate from product exposure. Defer the local ripple, the full ignition treatment, six time of day refinements, music, and ending visuals.

**Acceptance frames.** At 1440 × 900 desktop and 390 × 844 phone with touch emulation, capture noon and night at the entrance or pond wall, the bridge with the old stands visible only in water, immediately beyond the rail with the same stands visible directly, the unlit candle in the chooser, and the candle burning on its seat with both its flame and open-water reflection visible. Include the uninterrupted walk with a camera trace and a skip-to-chooser check on both viewports. Check clearance through the entire approach and seated framing with controls shown. Record phone emulation as such.

**Shared dependencies.** The first pass can use the existing descriptor hooks, real-scene reflector, lotus lamp and flame, and scanned stone pavers and plaster through the shared material resolver. Reuse the existing reflector lifecycle. If the portrait transforms prevent the shot, ask Boss about an opt-in exact pose for the affected descriptor. Full UI review needs a private place entry and a procedural prefetch path to avoid fetching a baked manifest. The subsequent authored ripple may need a scene opt-in to the reflector shader. Coordinate those shared changes before touching `scene.js`, `engine/index.ts` or `visiblePlaces.ts`. Future browser capture batches use the shared GPU lease with key `s6`.

[scene]: ../../web/src/engine/places/lotus-pond.js#L5
[seat]: ../../web/src/engine/places/lotus-pond.js#L39
[catalog]: ../../shared/places.ts#L13
[holder]: ../../web/src/engine/scene.js#L665
[water]: ../../web/src/engine/scene.js#L1262
[clock]: ../../web/src/engine/scene.js#L1521
[views]: ../../web/src/engine/scene.js#L2025
[attach]: ../../web/src/engine/scene.js#L2141
[past]: ../../web/src/engine/scene.js#L2223
[travel]: ../../web/src/engine/scene.js#L2411
[ignite]: ../../web/src/engine/scene.js#L2528
[snuff]: ../../web/src/engine/scene.js#L2716
[render]: ../../web/src/engine/scene.js#L2833
[prefetch]: ../../web/src/engine/index.ts#L59
[app]: ../../web/src/App.tsx#L300
[choices]: ../../web/src/App.tsx#L145
[appBurn]: ../../web/src/App.tsx#L230
[visibility]: ../../web/src/visiblePlaces.ts#L4
[rules]: ../../shared/rules.ts#L5
[burn]: ../../web/src/burn.ts#L55
[presence]: ../../web/src/i18n.ts#L210
[music]: ../../web/src/music.ts#L42
[sound]: ../../web/src/sound.ts#L13
