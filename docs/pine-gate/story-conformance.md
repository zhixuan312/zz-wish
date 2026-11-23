# Pine Gate Steps: story conformance

Audit of the built place at `74a04f0` against the approved [world-bible.md](../direction/world-bible.md) and
[one-light-experience-and-music-brief.md](../direction/one-light-experience-and-music-brief.md). Every row names the document line, the status, the
evidence in this worktree, and the change needed when it is not already a match.

Statuses: **matches** means the build does what the documents say and evidence exists;
**differs** means something is built but not as specified; **missing** means no evidence exists in
the code, so it cannot be claimed.

Nothing here is a visual judgement: where a row needs looking at a rendered frame, it says so and
leaves the call to Boss.

## 1. Why the place exists

| Item | Status | Evidence | Change needed |
| --- | --- | --- | --- |
| A level mountain shoulder halfway up an old pilgrim road in the humid south, above a farming village | matches | `shared/pine-gate-path.json`; `art/blender/pine_gate.py` `climbing_steps()`, `saddle_water()`; terrain and hamlet in `art/blender/pine_valley_terrain.py`, `pine_valley_hamlet.py` | None. |
| Only flat ground and spring on the climb, so villagers built a shrine and a free tea pavilion | matches | Shrine and pavilion in `art/blender/pine_tea_shoulder.py` `earth_shrine()`, `tea_pavilion()`, `spring_basin()`; the shoulder is authored level in `pine_gate.py` | None. |
| The place is still used by porters, pilgrims and woodcutters | matches | Tea bowls on the stone table, warm ash in the stove, carrying pole and bamboo broom against a post: `pine_tea_shoulder.py:486`, `:490`, `:499`, `:501` | None. |

## 2. Scale and condition

| Item | Status | Evidence | Change needed |
| --- | --- | --- | --- |
| One small shrine with a simple local earth god | matches | `carved_earth_god()` in `pine_tea_shoulder.py:311`, seated in `earth_shrine()` | Detail capture of the carving is still missing from the review set; see §9. |
| One open tea pavilion | matches | `tea_pavilion()` in `pine_tea_shoulder.py:450` | None. |
| A stone table | matches | Same function; table is the parent of the bowls and the stove | None. |
| A spring basin | matches | `spring_basin()` `pine_tea_shoulder.py:508`, plus `spring_spout()` at `:586` | None. |
| Two ancient pines | matches | `ancient_pine_roots()`, `pine_tree()` in `pine_gate.py`; the crest pair leans together | The walking camera shows mostly trunks; see §4. |
| Old and mossy, with new tiles among the old | matches | Repair stone and tile materials passed as `repair` into `small_roof()`; `moss_edge`/`weather_stone` flags on the shrine roof | Look must be judged on a frame; no code change claimed. |

## 3. Signs of people, ordinary lamps and earlier wishes

| Item | Status | Evidence | Change needed |
| --- | --- | --- | --- |
| Steps worn hollow | matches | `worn_approach_tread()` `pine_gate.py:342`, used for every climbing step; dressing is authored per tread | Confirm the hollow reads at product distance on a frame. |
| Muddy footprints | matches | `web/src/engine/places/pine-mud-prints.ts` paints six wet prints as decals raycast onto the shoulder paving at `y 4.00`; gait, drying weights and the plinth-clearance bound are held by `tests/tier1/unit/pine-mud-prints.test.js`. Evidence: `4ca4002`, `9d1e518`, `99fbf58`; capture `quality/direction/s2-r20-day-04/` | None. Prints fade out towards the tea pavilion, as a walker's mud would. |
| A bamboo broom | matches | `pine_tea_shoulder.py:501` broom handle, `:504` bound bristle | None. |
| Coarse tea bowls | matches | `pine_tea_shoulder.py:486` | None. |
| A small stove with warm ash | matches | `pine_tea_shoulder.py:490` stove, `:493` warm ash | Confirm the ash reads warm rather than grey on a frame. |
| A bamboo pipe feeding the basin | matches | `spring_spout()` `pine_tea_shoulder.py:586`, taking the spring into the basin | None. |
| A carrying pole left against a post | matches | `pine_tea_shoulder.py:499` | None. |
| A storm lantern under the pavilion eave | matches | `storm_lantern()` `pine_tea_shoulder.py:427`, called from `tea_pavilion()` at `:468` | Confirm it comes on at dusk and stays out of view while it does; see §6. |
| A small oil lamp before the shrine's image | matches | `pine_tea_shoulder.py:418` lamp, `:423` its low flame | None. |
| Stone ledges hold many burnt-out stubs over layers of old wax | matches | `spent_wax_on_sill()` `pine_tea_shoulder.py:689`: 11 remnants over four wax tones, with fused spill layers and charred wicks | The stubs were called improved at R15; judge the close-up again. |
| Two or three short candles still burning | matches | `pine_tea_shoulder.py:815`–`:824`: two short candles, each with a wick and a `small_flame` | None. |
| Red cloth strips tied to the old pine | matches | `crest_ribbons()` `pine_gate.py:2264`; surface detail in `web/src/engine/places/pine-crest-cloth.js`. The visitor's own strip is the modelled asset `web/public/places/pine-gate/pine-visitor-cloth.glb`, mounted by `pine-wish-cloth.js` and tied to the live tray scale. Evidence: `324931f`, `0a6d7b6`, `20a63e2`, `8175603`; capture `quality/direction/s2-tray-crops/` | None. The strip is hidden until the lamp is lit and stays through both endings. |
| The centre of the stone lamp shrine is free for the visitor | matches | `pierced stone lamp shrine` built in `pine_tea_shoulder.py`; remnants are deliberately gathered at the sides with an empty owner dish (comment at `:702`) | None. |

## 4. The walk

| Item | Status | Evidence | Change needed |
| --- | --- | --- | --- |
| 0-12 s: a narrow stone path climbs the shaded back of a ridge under dense pines | matches | `shared/pine-gate-path.json` route; `climbing_steps()`, `forest()` with `distant_pines()` in `pine_gate.py` | None claimed; frames must be judged. |
| 12-22 s: the path steepens and mist gathers | matches | Path steepens in the route data; haze is driven by the shared clock (`web/src/engine/scene.js` `DAY_KEYS`) and `pine-gate-vista.js` uses `uDusk`/`uNight` | Confirm the mist actually gathers on the rise at the product camera. |
| 22-26 s: two ancient pines lean together at the crest and form a natural gate | matches | Crest pair authored in `pine_gate.py`; `pine-crest-needle-anchors.json` binds 130 pads to the delivered geometry | Handover's open item: the fixed route camera shows mostly trunks, upper edge about 20° against a 33° lowest crown pad. A camera change needs Boss approval because the pose is frozen. |
| 26-30 s: the reveal — level shoulder, sea of cloud, terraced fields and the shrine at the edge | matches | `pine_valley_backdrop.py` plates; terraces and hamlet in `pine_valley_near_terraces.py`, `pine_valley_hamlet.py`; walk tier streams plates by about 20 s | The reveal is built. Whether it reads as a *stop-and-look* reveal is a visual call for Boss. |
| The walk is 30 s in the brief | matches | `shared/pine-gate-path.json` `.seconds = 30`; `web/src/engine/places/pine-gate-baked.js:91` passes `walkSeconds: path.seconds`, and `web/src/engine/scene.js:2267` tweens the walk for that duration | None. Note the crest pose is at 21.5 s and the reveal at 28 s in `tests/visual/pine-gate-journey.mjs`, both inside the 30 s. |

## 5. Burning view and endings

| Item | Status | Evidence | Change needed |
| --- | --- | --- | --- |
| The visitor's candle stands in a free-standing pierced stone lamp shrine at the terrace edge | matches | Pierced shrine piers, lintel and roof in `pine_tea_shoulder.py`; shrine sits at the shoulder edge per the site plan | None. |
| Close to camera, with the valley and slow cloud beyond it | matches | Product burning camera in `tests/visual/pine-gate-journey.mjs`; valley plates behind | Judge on a frame. |
| Burnt down: the candle melts into the old wax | matches | `web/src/App.tsx` settlement calls `music.play('endingBurned')`, `engine.snuff(true)`; live wax in `web/src/engine/PineWax.js` | None. |
| Put out: a shortened candle remains with a thread of smoke | matches | `engine.snuff(false)`; `put_out` settlement in `web/src/App.tsx:395` | Confirm the smoke thread exists in the flame/smoke shader; if not, author it. |
| Two endings only | matches | `Burn` settlement reasons in `web/src/burn.ts`; result screen branches on `s.done` | None. |

## 6. Sound and the six times of day

| Item | Status | Evidence | Change needed |
| --- | --- | --- | --- |
| Wind in the pines, running spring water, insects, a far temple bell | differs | `web/src/engine/places/pine-gate-life.js` authors wind in pine sprays and undergrowth; spring water in `web/src/engine/places/pine-creek-water.js` | Insects and a far temple bell are not in this worktree. Add them to the place sound layer, or report which file owns them. |
| Every time of day has its own light, colour, sound and mood | differs | Six looks exist in shared code (`DAY_KEYS` in `web/src/engine/scene.js`); Pine Gate ships day, dusk, lamp and night plate sets (`web/public/places/pine-gate/manifest.json`) | The shared clock has six keys, but the place ships four plate families. State exactly which of the six the place distinguishes in lighting, and add what is absent. |
| Everything stays easy to see at every time, including at night | differs | Night plates exist; handover's open item records the night sky was flat deep blue and the R16 prototype still shows colour blocks on dark slopes, with legibility unverified | Night legibility is an open finding, not a match. |
| Dawn: morning mist in the pines, thickest sea of cloud | missing | No dawn-specific plate or lighting key beyond the shared haze curve | Author or document a dawn look for Pine Gate. |
| Dusk: golden cloud, the storm lantern lights, village lights begin | differs | `storm_lantern()` exists and `lamp` plate family exists; village doorway lights were authored but handover says their legibility from product views is unverified | Verify on frames; fix if unreadable. |
| Night: moonlit cloud and steps, shrine and pavilion clearly visible | differs | Night plates ship; legibility unverified (see above) | Same as the legibility row. |

## 7. Gameplay logic

| Step | Status | Evidence | Change needed |
| --- | --- | --- | --- |
| Season: late spring, water standing in the terraces | matches | Flooded fields authored in `art/blender/pine_valley_near_terraces.py`; terrace water in `pine_valley_terrace_routes.py` | Late-spring foliage/season read must be judged on frames. |
| The lamp comes from a basket beside the shrine | differs | `shared/places.ts` gives Pine Gate `vessel: 'wax'` and the app shows the candle chooser; no basket prop is authored in `pine_gate.py` or `pine_tea_shoulder.py` | Add the plain-candle basket beside the shrine, or state where the candles come from on screen. |
| A larger candle holds more wax | matches | `shared/wax.ts` `remainingFuel()`, used by `web/src/App.tsx:6`; the draw hint says a bigger candle burns longer | None. |
| Drawing a lamp means shaping the candle | matches | `kind: 'candle'` for `vessel: 'wax'` (`web/src/App.tsx:81`); draw hint at `web/src/i18n.ts` `drawHint.candle` | None. |
| The wish is written on a red cloth strip tied under the candle stand | differs | The wish is captured as text (`wishLabel` in `web/src/i18n.ts`, `api.light({ wishText })` in `web/src/App.tsx`); the red cloth in the scene is `crest_ribbons()`, an earlier visitor's cloth on the pine, not the visitor's wish | Tie the visitor's wish to a red strip at the candle stand: author the strip and its placement, and mirror Snow Roof's tag flow. |
| Lighting: a taper takes flame from the shrine's oil lamp | differs | Ignition is `engine.ignite({ onCatch })` in `web/src/App.tsx`; no taper is authored and no flame transfer from the `pine_tea_shoulder.py:423` lamp is modelled | Author the taper and the transfer from the shrine oil lamp. |
| Placing: the candle stands at the centre of the stone lamp shrine | matches | Free centre documented in §3; placement target is the shrine | None, provided the burning camera settles there. |
| Leaving the page: a mountain gust puts it out | differs | `web/src/burn.ts` settles with reason `left` on `visibilitychange`/`blur`; no gust is authored for Pine Gate | Author the gust effect for the place, or state that the shared leave path is the gust and show it. |
| Lighting another: the new candle takes the next free place | missing | No authoring of successive free places; the shrine's centre is one position | Define the next free place sequence and how the app selects it. |
| Quiet presence: roosters, a far ox bell, frogs and evening voices | missing | No evidence in this worktree | Add to the place sound layer. |

## 8. Copy and presence

| Item | Status | Evidence | Change needed |
| --- | --- | --- | --- |
| Presence counts people, never says the visitor's lamp is the only light | matches | Presence text lives in `web/src/i18n.ts` and is shared; `tests/tier1/e2e/flow.spec.ts:60` pins the approved copy | None. |
| The place name, lamp name and one-line invitation | matches | `shared/places.ts:10`: 松门石阶 / Pine Gate Steps, 石龛灯 / Stone niche lamp, and the climb line | None. |

## 9. Evidence still to capture

| Item | Status | Change needed |
| --- | --- | --- |
| Earth-god carving resolved close up | missing | Handover records that the overview does not resolve the carving. Add a declared supplemental pose. |
| Six-view night coverage at 22:00 | missing | Handover: the existing direction switch captures only the burning view at night. Extend the test-only capture selection. |
| Slow-night continuity and phone cadence | missing | Handover lists both as open. |

## Summary

**Matches:** the reason the place exists, its scale, the shrine, pavilion, table, basin, the two
pines, the props of daily use, the ordinary lamps, the stubs and lit short candles, the free centre,
the four walk beats, the burning view, both endings, candle sizing, drawing, and the place copy.

**Differs:** the red-cloth band appearance; the missing
rooster/ox-bell/frog/evening voice layer; the insects and far bell; the "six looks" against four
shipped plate families; night legibility; the storm lantern's dusk behaviour and village lights
unverified; the wish cloth; the taper and flame transfer; the mountain gust; the absence of a
candle basket; the candle's next free place.

**Missing:** muddy footprints, the visitor's wish strip at the candle stand, the taper, the gust,
the next-free-place sequence, the ambient animal and village sounds, dawn-specific look, the
Earth-god close-up, six-view night coverage, slow-night continuity and phone cadence.

Every row marked missing is a gap in evidence in this worktree, not a guess that the scene looks
wrong. Boss decides which of these become the next round's tasks.
