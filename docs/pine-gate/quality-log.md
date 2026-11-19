# Pine Gate quality review

The reference captures are the desktop and phone Chrome journeys under `artifacts/full-review/round-1/after-journey/chromium/` and the delivered Snow Roof views under `artifacts/full-review/round-2/source20-final-c6-r2/`. All capture paths in this log are relative to the main checkout. The quality sheets retain both inputs and their hashes.

## Procedural baseline

**Gap.** Snow Roof's landing reads as assembled stone, timber and inset fixtures. Pine Gate's close views read as three flat textured planes and a smooth tray. Its candle profile and stump are visible, but the light over the wick hides detail in the melt pool. The phone ending initially obscured the tray. The first evidence run also captured stale time text between updates.

**Change.** Replaced hard circular point shadows from the wax and tray with feathered contact shadows at the two resting planes. Reframed the phone ending above the sheet. Framed and lit each preset portrait around the candle profile. The capture now waits for the HUD to match the advanced burn clock.

**Before and after.** The initial capture was superseded. The corrected stills are in `artifacts/pine-gate/m1/desktop-en/` and `artifacts/pine-gate/m1/phone-zh/`, with values and PNG hashes in `artifacts/pine-gate/m1/report.json`. Compare each `burn-50.png` with the corresponding `chromium-*-burning-live.png` in the delivered Snow Roof reference.

**Verdict.** The revised views distinguish all three preset profiles, show the wax at the settled height, and leave the phone tray visible. Both layouts lost the hard discs. The environment and pool still fall short of the Snow Roof close-up reference. This baseline is the input to the Blender preview.

## 8-sample preview 01

**Change.** Replaced the procedural stage with three Blender-authored regions. Added a 30-second continuous approach, taper ignition and settling, a carved niche, a reframed candle and a separate pine wind bed. The preview contains 12 eight-sample Metal Cycles maps with Metal OpenImageDenoise. Six resting groups passed the source, prepared and raw-export checks. The installed preview totaled 9,476,158 bytes.

**Before and after.** The procedural before images are in `artifacts/pine-gate/m1/`. The first baked after images are in `artifacts/pine-gate/quality/preview/pine/`. The paired Snow Roof stages and input hashes are in `artifacts/pine-gate/quality/preview/pairs/` and `artifacts/pine-gate/quality/preview/comparison.json`.

**Observed gaps.** The desktop `walk-50.png` and `walk-75.png` show a gate and steps that lose detail in deep shadow, flat angular pine crowns, moss-like curb blocks and small blue openings around the arch. In `burn-00.png`, a cached taper shadow crosses the tray, the ivory body reads darker than the tray, and the broad dish dwarfs the wax. `candle-closeup.png` shows regular line artifacts, visible texture boundaries and flat old wax marks. These defects also affect the phone. The Pine Gate place still shows Snow Roof's text.

**Verdict.** The two browser journeys completed with zero runtime or HTTP errors. Step inside enabled at 4.35 s and 2.48 s. The walks took 30.07 s and 30.46 s. The measured ambience was 0.94 dB and 2.12 dB below the Snow Roof reference, with no clipped samples. The initial framing metric included the flame. The next pass measures the body alone. This preview does not meet the visual bar for a final bake.

## 8-sample preview 02

The before set is `artifacts/pine-gate/quality/preview/pine/`. The after set is `artifacts/pine-gate/quality/preview-02/pine/`. Each comparison below applies to the matching desktop and phone subdirectory. The canceled capture attempt with the local API failure is preserved separately at `artifacts/pine-gate/quality/preview-02-api-502/`. The complete retry changed the local ports and recorded zero runtime and HTTP errors.

| Gap | Change | Before and after images | Verdict |
| --- | --- | --- | --- |
| Dark, opaque-looking wax | Increased scattering at the crown, preserved a darker base and moved the visible flame to the charred wick | `burn-00.png`, `candle-closeup.png` | The warmed upper body is visible, with a measurable falloff down the wax. |
| Hard taper stripe across the tray | Excluded the moving taper from the Pine lamp's static shadow map | `ignition.png`, `burn-00.png` | The stripe disappears without interrupting the ignition. |
| Oversized, flat tray and undersized wax | Added a deeper hewn edge, reduced the dish, and framed from the wax body alone | `burn-00.png`, then `burn-controls.png` in preview 02 | The body fills 21.33% and 21.56%, with the HUD clear. The phone still crops the dish edges, requiring a smaller holder for narrow profiles. |
| Niche rings and fine shadow stripes | Increased the niche-only depth bias and used a more continuous stone mapping | `burn-00.png`, `candle-closeup.png` | The regular rings and lines are no longer visible in the reviewed frames. |
| Flat old wax patches | Replaced the decorative patch meshes with aged variation in the stone finish | `burn-00.png`, `candle-closeup.png` | The artificial patch silhouettes are gone. The actual spent wax remains on the tray. |
| Overly warm, coarse near stone | Reduced normal-map strength, remapped the stone and closed the arch gaps | `burn-00.png`, `candle-closeup.png`, `walk-75.png` | The joins read better. The close shelf and back wall still read too brown and soft. |
| Dark stair and no warm landmark | Raised selective fill and added a local approach bounce | `place.png`, `walk-25.png`, `walk-50.png`, `walk-75.png` | Treads and roof detail return. The warm focal point is still too faint to lead the approach. |
| Flat pine silhouettes | Replaced broad horizontal crown shapes with layered needle sprays, under-branches and seed-driven variation | `place.png`, `walk-50.png`, `walk-75.png` | Pines no longer read as discs. The banks still need specific clusters and variation along the walking line. |
| Planar moss and repeated curb blocks | Used individual hewn curbs and localized patches | `walk-25.png`, `walk-50.png` | The green blocks are gone. The bare stretches will be broken up in the next pass. |
| Snow language in Pine Gate | Added Pine Gate's own place text in both locales | `place.png` | Both entries describe the pines and stone niche. |

The ready controls took 3.66 s and 2.46 s, and the uninterrupted walks took 30.12 s and 30.52 s. The far views frame the 24-hour wax preset at 20.85% and 20.83%. Neither live audio sample clipped. The desktop and phone comparisons and their hashes are in `artifacts/pine-gate/quality/preview-02/pairs/` and `artifacts/pine-gate/quality/preview-02/comparison.json`.

The third preview adds a visible, practical warm guide among the gate timbers and more varied forest-floor contacts. It also reduces the direct candle radius on the stone and scales the holder to the candle footprint. The remaining judgments need actual app frames.

### Preview 02 capture comparability

The differing ratios were caused by the capture sequence selecting two different sized candles. In both locales, the unlit, ignition, regular burn and natural ending used a 1-hour Ivory Pillar. Far burn and put-out used a new 24-hour Ivory Pillar. At the initial burn checkpoints the physical bodies were 52.2 mm and 150.0 mm tall. Both durations use the same sized flame, so switching the preset changed both the dish-to-body and flame-to-body ratios before any camera change.

The 24-hour record ended after 36,302,479 ms on desktop and 36,302,281 ms on phone. Those values are about 10 hours and 5 minutes and match the visible put-out text. This was a real elapsed value for the second preset. The report and images are in `artifacts/pine-gate/quality/preview-02/pine/`. Preview 03 uses the same original candle for the regular and far camera frames and matches the entire 1-hour profile and color across the two separate endings.

## 8-sample preview 03

The before views are in `artifacts/pine-gate/quality/preview-02/pine/`. The after views are in `artifacts/pine-gate/quality/preview-03/pine/`. Each path below is relative to the corresponding desktop or phone folder.

| Review item | Change | Before and after | Verdict |
| --- | --- | --- | --- |
| 1. Candle proportions across stages | The capture records candle IDs and uses the same 1-hour Ivory Pillar at the same burn progress from near and far. Both endings use the same profile and color in separate single-use sessions. | `burn-controls.png`, `burn-far.png`, `burned-down.png`, `went-out-cooled.png` | The earlier difference came from changing the duration preset. The desktop near and far bodies both measure about 52.19 mm. |
| 2. Elapsed text at put-out | The capture binds the 1-hour duration to the elapsed readout and verifies the stored cut time before taking the cooled frame. | `went-out.png`, `went-out-cooled.png` | The earlier 10 h 5 min was the elapsed time of the 24-hour candle. The third desktop pass confirms the 1-hour text at roughly 25 min. |
| 3. Stone color | Matched the shelf and recess to the jamb family and limited the reach of warm light. | `burn-00.png`, `burned-down.png`, `went-out-cooled.png` | The extinguished recess and shelf read grey. The burning frame has a localized warm center. |
| 4. Carved niche wear | Added a chipped lip, cool soot and aged wax variation to the baked surfaces, with a finer close-range stone texture. | `candle-closeup.png`, plus new `candle-contact.png` | The lip and grain read in the contact crop. The subtle old wax and soot need to remain legible beside the flame. |
| 5. Jamb joins and marks | Cut irregular corners and joints into the blocks and unified their stone material. | `ignition.png`, `spreading.png`, `burn-far.png` | A near-black oval persists on the upper left of the granite back wall in the ignition and spreading views. The authored and packed geometry agree. Its pixels are dark in the raw ambient map before compression, neighboring albedo is similar, and moon rays are blocked by the nearby reveal. The follow-up adds soft cool sky bounce to fill the recess. |
| 6. Wax crown, runnels, pool and wick | Shaded a warmer crown over a darker base, raised the runnels above the body, softened repeating grain and added a view-dependent pool reflection. | `burn-controls.png`, `candle-closeup.png` | The warmer crown and raised relief read in the close view. The pool glint and lit charred tip still need more definition. |
| 7. Clear close-up and contact | Waited for the HUD to fade and captured a separate view of the wax and tray contact. | `candle-closeup.png`, plus new `candle-contact.png` | The full wax and tray contact are visible in the desktop crops, clear of the interaction controls. |
| 8. Approach light and floor detail | Added a warm practical at the gate, staggered tread edges and broke up the banks with distinct fern clusters, stones, needles and moss. | `place.png`, `walk-25.png`, `walk-50.png`, `walk-75.png` | The gate lamp is visible at the first walking checkpoint. The third walking frame shows layered roof timber and the warmer gate as the route's focus. |
| 9. Smoke at the wick | Extended staggered emission from the wick through a coherent rising path. | `went-out.png` | The desktop capture measures the nearest emitted sprite center 3.32 mm from the wick. The smoke is visibly stronger higher in the plume. The faint base still needs a tighter fade. |
| 10. Taper contact | Calculated the approaching taper tip from the live candle's wick origin. | `ignition.png` | At the desktop ignition frame the measured taper-tip separation is 0 mm. |
| 11. Dish crop and spent wax | Scaled the holder with candle footprint and kept a margin around the spent trace. | `burn-controls.png`, `burned-down.png` | The desktop dish is in frame and the trace sits inside the rim. |

### Preview 03 lighting and candle follow-up

The first broad fill passed the contact audits, but raised the packed night red channel at the center of the oval from 15.2% to only 18.2% of the adjacent stone. That bake remains a draft. The next source places a smaller disk closer to the occluded stone, where the measured rays from the emitter to the stone remain unobstructed. Both sources are excluded from the lamp-only atlas.

Comparing Pine Gate's `walk-50.png` with Snow Roof's `walk-2.png` shows that the guide itself is visible, but the timber beneath the eaves still merges into silhouette. The revised pass adds a broad reflection off the paving below the guide to light the transom and brackets. It leaves the forest cool.

The revised wax moves the local reflection into the pool, darkens the charred tip and lets the put-out smoke become visible closer to the wick. A dry run measured the nearest visible smoke particle at 0.86–2.16 mm over four points between 0.35 s and 0.95 s. The revised source, wax and smoke still need a paired browser capture.

### Preview 03 revised capture

The revised R7 captures and 32 comparison sheets are in `artifacts/pine-gate/quality/preview-03-r2/`. The index at `comparison.json` preserves screenshots and candle IDs. The earlier desktop attempt is preserved at `artifacts/pine-gate/quality/preview-03/`.

Both captures use one 1-hour Ivory Pillar for ignition, settled and far burning, and matched full profiles for the two endings. The normal burning frames measure 21.33% and 21.49% wax body height. The far frames measure 20.18% and 20.32%. The put-out results read 25 min 13 s in both languages and preserve about 57.97% of the wax. The taper tip contacts the wick at 0 mm in both recorded ignition frames. Visible smoke starts 1.16 mm and 1.15 mm from the wick. Regular and far phone frames retain the whole dish. The older phone contact crop omits its outer sides, while showing the resting wax.

Step inside enabled in 3.82 s and 2.98 s. The walks lasted 30.13 s and 30.54 s. The phone delivered 300 real composer frames in 10.003 s, or 29.99 FPS, with a 36 ms 95th-percentile frame interval. Both journeys refreshed and ended without runtime or HTTP errors. The 12,006,780-byte bake passed all six source, prepared, raw and decoded resting contacts.

The sharpened wick, pool reflection and cleared HUD read in the close views. The stone and tray still lose visual separation at the settled exposure, the upper wax needs more transmitted color, and the gate silhouette reads too dark at the place and first walk checkpoints. The two revised audio windows started at different points in the wind swell. The preview 04 audio audit will use matched audio ages.

A full-scene ray from the recorded ignition camera found the black oval on the first left wall cap. The cap extends 12 mm in front of the granite at the failing pixels. The earlier probe considered the niche region alone and sampled the hidden granite. The R7 fill brightened the granite behind the cap. The visible pixel at (419, 166) stayed RGB (4, 3, 1), while the exposed stone at (443, 165) changed from (27, 26, 26) to (36, 39, 43). Trimming 80 mm from the cap exposes the original granite across all 17 obstruction samples in the offline camera replay. Commit `e4a6300` also removes the extra fill. The next full app pair will verify the geometry.

## 8-sample preview 04

The before sheets are in `artifacts/pine-gate/quality/preview-03-r2/pairs/`. The after sheets are in `artifacts/pine-gate/quality/preview-04/pairs/`. Each sheet below has a desktop and phone version. The capture index is `artifacts/pine-gate/quality/preview-04/comparison.json`.

| Review item | Commit and change | Before and after sheet | Verdict |
| --- | --- | --- | --- |
| 1. Local candle falloff | `176c640` limits direct spill on the stone and fades baked bounce by distance from the moving wick. The same exposure applies throughout the close stages. | `spreading.png`, `settled.png`, `burning-controls.png`, `far-burning.png` | The warm pool is visibly narrower and the four sampled stone patches in settled phone drop by 21–39 display-luma points relative to preview 03. |
| 2. Transmitted wax and melt pool | `fcd456a` strengthens the warm upper-body transmission, keeps detail on the dry rim and deepens the liquid cup. | `burning-controls.png`, `closeup.png` | The crown glows amber into the body. The rim retains its edge and the visible liquid wall casts a short gradient into the pool. |
| 3. Legible night approach | `5dc856c` places restrained, separate pools along the stair and lifts the gate face. | `place.png`, `walk-1.png`, `walk-2.png` | Early treads and the guide read more clearly. The uncovered center of the gate still occupies too little of the entrance frame. The new camera in `4bbacf4` moves the view between the foreground trunks and needs a paired capture. |
| 4. Base puddle | `a31ed6e` preserves the candle pigment and tapers the very thin wax perimeter. | `candle-contact.png`, `closeup.png` | The new shape sits flat against the dish. Direct illumination leaves a pale line along the plate's outer edge at 50% burn. |
| 5. Dish color | `8367541` gives the tray a cool, dark stone response and reduces the contribution of direct warm light. | `burning-controls.png`, `candle-contact.png`, `put-out.png` | The grey dish and amber candle can be distinguished at ignition, throughout the burn and after it ends. |
| 6. Flame root | `132ca27` shortens the flame, adds a darker inner base and reduces the halo. | `ignition.png`, `burning-controls.png`, `closeup.png` | The wick and cool base are individually legible. The lit wick and flame have a visible gap in the close phone view. Commit `7e9fe57` moves the luminous envelope to the tip for the follow-up. |
| 7. Cooled runnels | `11e0006` replaces the folded ridges with rounded streams and tapered beads. | `put-out-smoke.png`, `put-out.png` | Smooth runnels follow the remaining body in the cooled view. |
| 8. Jamb and back wall | `e4a6300` trims the projecting wall cap. `da8201b` lines up the inner jamb joints. | `ignition.png`, `spreading.png` | The hard oval and open inner splits are gone in the reviewed frames. The outer courses retain their dark mortar joints. |
| 9. Soot, old wax and worn lip | `da8201b` embeds weathering in the granite and chips the lip. | `closeup.png`, `candle-contact.png`, `far-burning.png` | Stone wear appears in the texture. Soot and old wax remain subtle from the candle camera. |
| 10. Neutral night stone | `da8201b` neutralizes the recess and jamb colors. | `walk-3.png`, `choose.png`, `put-out.png`, `burned-down.png` | The recess reads as grey stone in the wall, without the former blue cast. |
| 11. Forest understory | `7648c75` embeds exposed rock shelves, groups different fern silhouettes and deepens moss at damp contacts. | `place.png`, `walk-1.png`, `walk-2.png` | The revised early walk shows fewer isolated slabs and more variation near the base of the pines. |
| 12. Audio balance | `59e03af` samples both phone and desktop at audio age 30–45 seconds, with an unchanged sound graph. | `burning-controls.png`, `comparison.json` | Both windows recorded 120 readings. Phone is 0.23 dB above desktop, with peaks below 0.0016. The preceding phone sample ran roughly 10 seconds later in the wind swell and cannot establish a phone-specific deficit. The archived Snow comparisons used shorter windows. |

Both journeys completed refresh and both endings, with no runtime or HTTP errors. Walks ran 30.31 s and 30.48 s. The phone rendered at 29.99 FPS and 35.90 ms at the 95th percentile. Normal burning measures 21.34% and 21.57% body height. Phone Step inside enabled in 2.37 s. The desktop measured 12.35 s on this run and exceeds the 5-second target. The current report has no timing breakdown for that cold load. The next capture records timing by phase and preserves this result.

## 8-sample preview 05

The before sheets are in `artifacts/pine-gate/quality/preview-04/pairs/`. The after sheets are in `artifacts/pine-gate/quality/preview-05/pairs/` with the corresponding hashes under `comparison.json`. Each row applies to the desktop and phone folders.

| Review item | Commit and change | Before and after sheet | Verdict |
| --- | --- | --- | --- |
| 1. Step inside readiness | `dac71f6` gives the baked Pine scene its own construction context. `68def75` removes marks from app code, and `478383b` runs phase timing through the browser capture only. | `place.png`, plus `artifacts/pine-gate/quality/readiness-preview-05/pine/report.json` | The four diagnostic runs did not repeat the 12.35 s outlier. They measured 0.91–1.95 s waiting behind Snow Roof's queued build. With independent preparation, measured queue overhead is 12–19 ms. The three fresh desktop times from wish input are 2.831, 2.459 and 2.444 s. The phone times are 2.366, 2.370 and 2.435 s. |
| 2. Pigment in the lower shaft | `78622f3` adds low diffuse return using the selected wax color, with the transmitted amber remaining near the flame. | `burning.png`, `settled.png`, `closeup.png` | Lower-shaft display luma rises from 48 to 105 on desktop and 47 to 105 on phone. The lit shaft retains a beige lower body under the warmer crown. The tray interior still measures slightly brighter in the sampled burning frames. |
| 3. Base meniscus | `30e6542` shades and feathers the thin wax spill. `6efc91f` rounds its edge and gives the contact depth. | `closeup.png`, `candle-contact.png` | The pale outline is gone. The wax rolls into the contact shadow without the old flat plate shape. |
| 4. Dish response | `6c4a973` returns a soft reflection to the graphite tray exterior and preserves the aggregate inside. | `burning-controls.png`, `candle-contact.png` | The rim remains dark stone. Front-edge display luma rises from 8 to 33 on desktop and 6 to 31 on phone. The dish keeps a localized contact shadow on the shelf. |
| 5. Flame on the wick | `7e9fe57` lowers the luminous portion of the cool inner envelope to the tip. | `closeup.png`, `burning-controls.png` | The lower part of the flame overlaps the black wick in both close views. No bright gap remains in the regular burn. |
| 6. Soot, old wax and worn lip | `e875d5a` and `d6ef7ac` bring the darkened band and marks into the visible part of the back and shelf surfaces. | `burning.png`, `candle-contact.png` | The upper wall is darker in the normal burn and the shelf wears into the stone. Some old wax marks remain difficult to distinguish from natural granite variation. |
| 7. Stable local spill | `37ac4d9` shortens the physical falloff of the moving point and baked bounce on stone. It uses the same values throughout ignition and settling. | `spreading.png`, `settled.png`, `burning.png`, `far-burning.png` | The stone around the warm pool drops into cooler shade. In the settled controls view the sampled upper corner falls from display luma 75 to 60 on desktop and 98 to 72 on phone. |
| 8. Continuous stone jambs | `e875d5a` uses through-stones across the reveal and dresses the arch spring without an exposed course end. | `ignition.png`, `spreading.png` | The coarse horizontal band gives way to a narrow mortar joint. The left reveal meets the arch without the old projected cap or rectangular interruption. |
| 9. Approach and forest depth | `4bbacf4` reframes the stairs between trunks. `cb0bd34` adds two forest layers and ground folds. `d51a5d7` seats the ridge stones on the folded ground. | `place.png`, `walk-1.png`, `walk-2.png`, `walk-3.png` | The gate, guide and upper steps are legible together. More pines show behind the wall. A few smooth bank areas remain, and the close landing shot exposes dark triangular seams in the paving for follow-up. |
| 10. Cooled wax color and relief | `78622f3` uses the selected pigment in the cooled pool and lower surface, alongside the smooth runnel geometry in `11e0006`. | `put-out.png`, `burned-down.png` | Put-out retains a warm wax color in the cool recess. The small raised streaks follow the body, and the natural ending spreads the remnant over the dish. |
| 11. Matched Snow Roof audio | `478383b` lights both real places in matching Chrome desktop and phone contexts and measures the live master at audio age 30–45 s. | `comparison.json`, plus `artifacts/pine-gate/quality/audio-preview-05-matched/pine/report.json` | Pine RMS is 1.34 dB lower on desktop and 1.46 dB lower on phone. All four windows completed at 48 kHz. The highest measured peak was 0.00166, and the two viewport differences are comparable. |

The paired walks lasted 30.32 s and 30.53 s. Both completed refresh and both endings without runtime or HTTP errors. The regular body occupies 21.34% and 21.57% of the frame. Phone cadence was 29.99 FPS with a 36 ms 95th-percentile interval. The 11,390,985-byte preview passed all six contact groups through the final decoded geometry.

## 64-sample final

The before sheets are in `artifacts/pine-gate/quality/preview-05/pairs/`. The first final sheets and their measurements below are archived in `artifacts/pine-gate/quality/final-before-preview-drain/`. The merged app was recaptured separately.

| Gap | Change | Before and after sheet | Verdict |
| --- | --- | --- | --- |
| 1. The recess competes with the flame | `8252f86` lowers only the baked night and dusk ambience of the niche. The moving warm point and its indirect falloff retain their existing range. | `settled.png`, `burning-controls.png`, `far-burning.png` | The upper sample on desktop drops from RGB (63, 59, 58) to (51, 48, 45), and the corresponding phone sample drops from (80, 70, 62) to (73, 63, 53). The stone nearest the tray remains warmer and brighter. |
| 2. Abrupt shaft color transition | `0057fc1` changes the wax light response to a smooth absorption tail and returns warm light to the lower section. | `burning.png`, `closeup.png`, `put-out.png` | The amber crown grades into a warmer base. In both regular burning views the lower-shaft sample gains 14 red-channel levels. The dark wick and pool rim remain legible. |
| 3. Soot and old wax | `8bff228` shapes the sooty upper stone and five raised shelf deposits. `bdd3654` places four wax pieces on the actual graphite tray. `5ecff10` gives the irregular shelf grid constant metre-scale UV density. | `burning-controls.png`, `candle-contact.png`, `ignition.png` | Tiny amber marks now stand off the shelf behind the tray and an old deposit catches light on the right lip from the ordinary burning camera. The wall retains an irregular darker area above the flame. |
| 4. Landing overlap and hard reveal edges | `8bff228` drops the backing 13.077 mm below the lowest paving face and joins the arch spring to the dressed reveal. | `walk-3.png`, `ignition.png`, `spreading.png` | The old triangular slivers are gone. Flagstone joints remain visible and the niche opens into continuous chiseled stone. |

The final 11,506,505-byte package contains the 12 fixed 64-sample maps and shared native AgX LUT. All six contact groups pass on the final decoded geometry. Both night captures confirm that native AgX is active with the night and lamp maps resident.

From wish entry to Step inside, the paired captures take 3.48 s on desktop and 2.62 s on phone. The walks last 30.32 s and 30.49 s. The regular burning body takes 21.33% and 21.49% of the frame. Phone cadence is 29.99 FPS and 35.5 ms at the 95th percentile. Both contexts complete refresh and both endings with zero runtime or HTTP errors. The phone smoke starts at the wick and its upper end passes beyond the frame.

## Final review after the Snow Roof merge

The merged app at `468915b` reuses the final Pine Gate package SHA-256 `45c31e502dc4a645bdc4d9034a3b7fe106227a345c1e6bb81c79b916627b1c1f`. The review compared the first final sheets with the new 32 side-by-side sheets in `artifacts/pine-gate/quality/final/pairs/`. The new `comparison.json` indexes the sheets and 38 Pine originals.

The merge could affect the approach turn, the preview fill and the burning and ending cameras. The new walk frames keep the same progression from the stair through the warm gate guide to the carved niche. In the ignition, settled and far frames, the same candle and tray remain in view as the light spreads. The close views retain the charred wick, the pool edge and the wax contacts. The two endings still show distinct wax remnants. The sheets passed the initial review. The owner later rejected them because the close views lacked detail. They remain the comparison baseline for the detail pass.

In the paired captures, Step inside enabled in 3.047 s on desktop and 2.324 s on phone. The wax body occupies 21.33% and 21.49% of the regular burning frame. All six fresh readiness trials also stayed below five seconds. Desktop recorded 2.381, 2.551 and 2.408 s. Phone recorded 2.171, 2.401 and 2.431 s.

The eight journeys at `artifacts/pine-gate/m3/report.json` share the merged app fingerprint `0f15134d9bcb634d349b9d27b6586c4c71b8ced8d1f70010d933a00bc9a2a3d4`. The journey records and the Vite logs show no source changes or reloads. Each context completed both endings and restored the stored candles after refresh. Desktop burned down a preset candle and put out a mouse-drawn candle. Phone burned down a drawn candle and put out a preset. The Chromium phone capture used touch events to draw the profile. The WebKit phone capture used mouse strokes.

| Browser | Context | Step inside | Walk | Phone burn FPS | Runtime errors | HTTP errors | Source changed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Chromium | Desktop EN | 3.032 s | 30.183 s | — | 0 | 0 | No |
| Chromium | Desktop ZH | 3.073 s | 30.162 s | — | 0 | 0 | No |
| Chromium | Phone EN | 2.067 s | 30.495 s | 29.998 | 0 | 0 | No |
| Chromium | Phone ZH | 2.330 s | 30.508 s | 29.992 | 0 | 0 | No |
| WebKit | Desktop EN | 2.009 s | 30.442 s | — | 0 | 0 | No |
| WebKit | Desktop ZH | 2.689 s | 30.438 s | — | 0 | 0 | No |
| WebKit | Phone EN | 1.982 s | 30.387 s | 29.997 | 0 | 0 | No |
| WebKit | Phone ZH | 1.994 s | 30.384 s | 29.991 | 0 | 0 | No |

The supplemental app captures in `artifacts/pine-gate/quality/final-day/` and `artifacts/pine-gate/quality/final-dusk/` confirm native AgX and a resident lamp map at both screen sizes. Day contributes all of the ambient blend at 13:00. Dusk contributes 82.5% at 18:00. The final night comparisons exercise the night bank. The quiet presence line is faint against the brighter sky in the day and dusk place views. The merged app retained the previously measured Pine and Snow ambience mix. Phone measurements use browser emulation on the M1.

## Candle optics while the site brief is under review

The before and after frames use the same 1-hour Ivory Pillar at approximately 50% fuel. They use the existing baked environment so the comparison isolates the candle and dish. The native-pixel desktop crops and a real candle photograph are in `artifacts/pine-gate/quality/optics-reflection/candle-comparison.png`.

| Gap | Change | Before and after evidence | Verdict |
| --- | --- | --- | --- |
| Wax and dish read as smooth plastic | `b6eb812`, `bdac17b` and `259ab97` add wax pores, raised runnels, a tool-marked dish, soot and grounded old wax. | `quality/final/pine/` and `quality/optics-reflection/pine/`, `candle-contact.png` | The detached pink mark is gone and small surface features read at native resolution. The photographed wax still has stronger contrasts and a more irregular spill. |
| The flame floats over the wick | `2707995` integrates a narrow emitting volume. `3f6004a` moves its blue base onto the wick and `58faa3c` fades the tip. | `quality/optics-wip/pine/` and `quality/optics-reflection/pine/`, `candle-contact.png` | The first pass exposes a dark gap. The later desktop and phone views show the blue base across the wick and preserve a clear silhouette over the pool. |
| The melt pool looks matte | `29b52ed` raises the inner meniscus. `bce3fe6` adds an initial grazing streak that `f274fa0` replaces with a flame reflection on the floor and meniscus. | `quality/optics-shaped-flame/pine/` and `quality/optics-reflection/pine/`, `candle-contact.png` | The pool basin has more visible depth. The narrow glint is still much subtler than the photograph in the captured pose. |

The focused Chromium retest produced ten complete frames across desktop English and phone Chinese with zero runtime or HTTP errors. The existing package remains the baseline for this isolated work. A separate Blender GLB export verified albedo, normal, packed roughness and occlusion bindings for all four new or completed scans. The new site package is pending the setting review.

- The close photograph shows a nearly spent candle. It anchors the blue base, softened upper flame and surface reflection comparison. [USER-62114, Burning-candle, CC0](https://commons.wikimedia.org/wiki/File:Burning-candle.jpg)
- A blackened earthenware dish and the surface of unlit wax clarify the material separation. [SarKaLay, Wax Candle, CC0](https://commons.wikimedia.org/wiki/File:Wax_Candle.jpg)
- The left panel shows a candle flame in normal gravity, with a dark inner root and a blue base at the wick. [NASA Glenn Research Center, GRC-1998-C-00485](https://science.nasa.gov/image-detail/amf-grc-1998-c-00485/)

## P1 site review

The revised setting uses an old stair on the sheltered side of a southern ridge. Two pines lean over the crest. The spring and the level ground explain the earth shrine and tea pavilion. A separate stone lamp shrine sits at the edge with an opening toward the valley. The owner will review the site before detail work begins.

The first real app review is in `artifacts/pine-gate/quality/direction/p1-site-review/`. It uses Chromium at 1440 × 900 with a private eight-sample Metal bake, Metal OpenImageDenoise and native AgX. The three walk shots and both burning views use the app cameras. The overview uses a declared wider view through the pines. The two lighting runs hold local hour 13 and hour 22 and use the same candle design. The real walk lasted 30.07 s, and Step inside enabled in 2.94/3.11 s. Both runs had zero runtime and HTTP errors. The first review found an early glimpse of the valley, a missing trunk at the crest, disconnected terraces, largely hidden old wax, similar day and night skies, and an unlit-looking earth figure. The following pass addresses those issues before the site goes to the owner.

The follow-up narrows the stair to 1.75–2.28 m and follows its bent footprint with the shoulder and stone retaining courses. The adjusted authoring checks both tread edges, both curb centres and the drain centre at all 50 stations. All 250 probes clear the evaluated terrain, with a minimum 15 mm clearance. The first spring cut followed the same water coordinates and elevations. Cutting the channel exposed an overhang beneath the first loose stone, which moved farther back on the hillside. Review of the first cut found near-vertical terrain and gaps beneath three bank stones. The lowest stone bridge decks also intersected the water.

The graded channel keeps the exact water coordinates and elevations. The evaluated Blender mesh caps all 6,592 bank faces at 48.870°. All 250 stair probes clear the terrain by at least 52.812 mm. The full set of 540 wet probes and 360 dry bank probes clears by 16.991 mm and 29.990 mm respectively. Every tested underside vertex on all ten bank stones sits 2.000 mm into the ground. The stones' underside contours follow the terrain triangle edges. All five slabs keep their walking surface with at least 20.677 mm of clearance between the underside and water.

The two curbs immediately beyond the bridge retained their original upper edges and fitted their undersides to the new bank. On the evaluated Blender mesh, 63 underside vertices and 63 edge midpoints have a maximum absolute ground offset of 2.010 mm. The stair, watercourse, bank-slope and deck audits retain the preceding measurements.

### Second in-app pass

The review frames at `artifacts/pine-gate/quality/direction/p1-site-review-r2/` use source `73ddf9b` and the private eight-sample package `9ae4c5398b6edfddc41d6f23329763c4db253ab0945a99a2db974ea2574d698e`. The 13,758,170-byte package includes twelve lightmaps, the model and the manifest. All seven decoded contact groups pass. The daytime and nighttime runs load the same model and use native AgX. Both have zero runtime and HTTP errors. Readiness is 2.569 s at 13:00 and 2.787 s at 22:00. The walk lasts 30.080 s. The public package keeps its original manifest hash.

| Review gap | Before in `quality/direction/p1-site-review/desktop-en/` | After in `quality/direction/p1-site-review-r2/desktop-en/` | Visual verdict |
| --- | --- | --- | --- |
| The crest lost one trunk | `ancient-pine-crest-24s.png` | `ancient-pine-crest.png` at 21.516 s | Both ancient trunks frame the threshold. |
| The forest opened too early | `forest-06s.png` | `forest-06s.png` at 6.033 s | The narrower, shaded stair and spring crossing dominate. The distant views recede. Near pine crowns are mostly seen at the edge of the frame. |
| The terraces floated over the cloud layer | `terrace-reveal-28s.png` | `terrace-reveal-28s.png` at 28.032 s | The farther field attaches to the east slope, but the flooded treads still look like pale lines between tall banks. The next pass targets their proportions and the cloud texture. |
| Previous candles were hard to see | `day-burning.png` and `night-burning.png` | `day-burning.png` and `night-burning.png` | The spent wax now sits visibly around the open centre, with two older flames on the outside. |
| Both hours looked similarly bright | `day-burning.png` and `night-burning.png` | `day-burning.png` and `night-burning.png` | The night sky reads deeper and cooler. The candle, dish and stone stay legible. |
| The earth figure fell into shadow | `shrine-pavilion.png` | `shrine-pavilion.png` | Threshold fill reveals the seated figure and the oil lamp. The pavilion still reads as an open shelter with bowls and a separate storm lantern. |

The current plan is `artifacts/pine-gate/quality/p1-plan/site-plan.png`. Its callouts show the crossing, the two pines, the earth shrine, the tea pavilion, the spring basin and the separate wish candle. The inset enlarges cross-slope spacing to leave room for the labels.

### P1 review delivery

The six review frames and `report.json` are in `artifacts/pine-gate/quality/direction/p1-site-review-r3/`. This pass captures source `c05db38b5d233d6006fe7e6f54a17cbefcb5b810` with the same eight-sample Metal/OIDN package. The fields use longer flooded treads separated by lower earthen banks. Compared with the second pass, `terrace-reveal-28s.png` shows broader water surfaces and distinct channels between the plots. Layered clouds soften the foot of the slope. `day-burning.png` and `night-burning.png` preserve the foreground candle and the distant waterfall while showing the lighter cloud bank to the left. The distant ridge silhouettes and the spent wax remain simple at this phase. The early forest shot favours the bridge and the climb, with pine needles at the edges of the frame.

Both Chromium 1440 × 900 runs have zero runtime and HTTP errors and no source reloads. Native AgX holds at both times. Step inside enables in 2.920 s at 13:00 and 2.921 s at 22:00, and the full daytime walk lasts 30.121 s. Lint, type checking, the evidence gate and all 35 Tier 1 unit tests pass. The capture API and Vite processes exited, ports 8964 and 8965 have zero listeners, and the private browser processes are gone. S1 released its GPU lease. The remaining times, phone compositions, final lighting and full journey checks belong to later phases.

## R1 realism proof

R1 revisits the frozen P1 site at the original 28-second reveal and default daytime burning views. The first changes address the flat ridge shading, sparse pine silhouettes, dark wooden-looking piers and angular old-wax remnants in `quality/direction/p1-site-review-r3/desktop-en/`. The terrain and candles use their original positional landmarks and walk clock.

The near-scene preview uses eight samples and Metal OpenImageDenoise. Its midday lightmaps use Blender's multiple-scattering sky with a 0.545° solar disc at 56° elevation and 231° authored rotation. Cycles reverses the authored rotation before the sky sample. The runtime sky, live directional light and vista use the resulting glTF direction `(-0.4346, 0.8290, 0.3519)` at midday. The daylight map supplies static cast shadows, and the live direction lights dynamic surfaces. [Blender Sky Texture](https://docs.blender.org/manual/en/latest/render/shader_nodes/textures/sky.html) · [Cycles rotation preprocessing](https://github.com/blender/blender/blob/02f0899d78e3/intern/cycles/scene/shader_nodes.cpp#L879-L905)

An independent 64-sample Cycles Metal render of a one-metre obstruction under the authored world matched 98.8% of the signed ground-shadow mask. The earlier positive-X prediction overlapped 8.0%. A second camera placed the solar disc centroid at the expected pixel `(63.5, 63.5)`. The diagnostic images and `cycles.json` are in `artifacts/pine-gate/quality/r1/solar/`.

The packed near scene is 14,728,052 bytes including the manifest and twelve lightmaps. The source correspondence and all seven decoded contact groups pass. The physical shelf and lamp anchors are unchanged. The piers use the existing stone scan on a chisel-cut profile, with changes in section at the stone's feet and crowns. The old wax gets a rounded rim, thinner spill and curved wick. The visitor's wax preserves the selected shape and burn clock and adds small shoulder runnels and variation in optical depth.

The vista uses a reproducible 100,601-byte USGS/NASA SRTM elevation extract with its drainage retained. The new terrain, flooded treads, two waterfall branches and three cloud layers use five draw calls. Site assets, native AgX and the vista's elevation total 14,945,358 bytes, leaving 54,642 bytes in the base budget. [Elevation provenance](../licenses/pine-gate-elevation.md)

The seven beds have continuous earth berms around all fourteen water spans. In actual mesh slices, the lowest downhill or uphill crest stands 137.0 mm above the unchanged water surface. The lowest end or cross-bund crest stands 140.6 mm above it. The per-span probe values are recorded in commit `f41345e`.

### First runtime comparison

`artifacts/pine-gate/quality/r1/review-01/` captures source `b7308f6` at 13:00. The photo comparisons and seven native-pixel crops are in `comparison/`. The 28-second camera differs from the P1 position by 0.17 mm. The burning camera matches the P1 pose. The measured ridges now recede behind the near pines, and the shrine piers read as stone. The photograph still shows a much denser, less uniform canopy texture. In the game, the flat needle cards and exposed straight branches dominate the edges and overlap the view of the flooded fields. The cold wax rims are rounder, but the similar upright silhouettes make the stubs look repeated. The new preview remains below the realism bar.

`comparison/solar-runtime.json` measures the app disc at `(875.6695, 333.8887)`, 0.0022 pixels from the projected position. It records the sky and live light directions and the baked-shadow flag. Step inside enabled 3.135 s after entering the wish on desktop and 2.570 s on phone. The settled phone view ran at 29.99 FPS over 10 seconds. Both contexts had zero runtime errors and passed the delivery and camera rules. The private listeners and browser profiles closed and S1 released the lease.

### Second runtime comparison

Shorter, staggered needle sprays open the valley behind the candle while keeping the same tree roots. Shorter wax remnants give the old spills a distinct silhouette. The daylight foreground now reads with firm stone shadows, and the exposed terraced slope shows separate flooded treads and bands of waterfall foam. Against the photograph in `artifacts/pine-gate/quality/r1/review-02/comparison/`, the near pines still look sparser and flatter than real needle clusters. The repeated pattern on the far valley slope and large golden particles in the daytime burning frame also make the render visibly artificial.

The second eight-sample package passed source mapping and all seven decoded contact groups. Projecting the manifest onto its runtime fields removed 199,006 bytes while preserving every model and lightmap hash. `art/build/pine-gate/r1-art-02/preview8-compact-receipt.json` records both manifest hashes and the removed audit fields. The compact package plus AgX and elevation weighs 14,911,200 bytes. Including the complete production Pine JavaScript chunk in place of the development elevation module brings it to 14,938,640 bytes. Source `3eec6e4` used the projected package in both captures. Entry took 3.396 s on desktop and 2.575 s on phone, with 29.99 FPS in the phone burning view and zero runtime or HTTP errors across the two contexts.

### Third runtime comparison

`artifacts/pine-gate/quality/r1/review-03/` captures source `9afb11b` at 13:00 and uses the same compact package with manifest SHA-256 `d597e47743beb1ac071e8855ded5e16883de94f7cba9cdc4c5ddef5474b2956e`. Blending two canopy scales removes the strongest repeating pattern from the distant slopes. The small, faint daylight dust no longer distracts from the flame. Both improvements are visible at native pixels in `comparison/`. The photo pairs still show a gap in the density and depth of the foreground pines. Real flooded terraces occupy more of the open hillside and have less uniform retaining banks. The visitor wax retains a visibly smoother finish than the reference candle. These frames are submitted as an R1 review candidate.

Entry enabled in 2.503 s on desktop and 2.895 s on phone. The ten-second phone burning sample ran at 29.99 FPS. The two Chromium contexts reported zero runtime or HTTP errors and no source reloads. The runtime solar disc projection error remains 0.0022 pixels. The production Pine chunk is 128,240 bytes, bringing the base with all maps and native AgX to 14,938,839 bytes.

Lint, type checking and the evidence gate passed. Tier 1 passed all 36 unit tests and 17 browser tests. The touch-only drawing test was skipped in the desktop project. Both Pine Gate persistence cases and both Snow Roof loading cases passed. Capture and test servers shut down, their private browser profiles closed, and S1 released its GPU lease after each batch.

### Offline valley and wax study

The third comparison fell below the realism bar. The next pass replaced the runtime valley mesh with three transparent Cycles plates drawn over the game sky at different world depths. The offline view uses the same signed sun direction and measured SRTM terrain. Geometry Nodes instance solid canopy prototypes across the ridges. The midground includes contoured flooded beds, a cut stream channel and a waterfall. A separate volume pass supplies valley cloud. The stage still uses the site, candle seat and cameras approved in P1.

The first 1600 × 800 plate set contained wide, evenly spaced conifers and a noisy far atmosphere. Its 8192 × 4096 far plate alone encoded to 22,767,984 bytes with WebP quality 88. The corrected 1600 × 800 plates used finer canopies and introduced haze only on distant opaque surfaces. They encoded to 178,600 bytes together. The production WebGL pilot uses that second plate set, Cycles-baked colour-and-depth crown impostors, scanned bark, and a 512 × 512 tangent normal atlas baked from a 93,696-face pillar sculpt. The new near-field package passed seven prepared and decoded resting-contact groups.

Compare `artifacts/pine-gate/quality/r1/review-04-r2/comparison/` with `artifacts/pine-gate/quality/r1/offline-runtime-probe-02/comparison/`. The latter contains the real 13:00 app frames and native-pixel crops against a May flooded-terrace photograph and a pillar candle with a visible melt pool. The atmospheric greens and ridge depth improve. The near pines remain too bare and the depth-impostor silhouettes read as flat blobs. The fields still look beige from the reveal camera. The visitor wax loses the woven pattern but retains a nearly straight lip that hides most of the liquid surface. The cold stubs still look repeated and carry too much colour variation. This pilot remains below the realism bar.

The pilot capture used app revision `4237b54` with private manifest SHA-256 `efbb80997961796bd632ccef445114bf86e9a1f2d3da7f22b997c2ee5ba98b25`. The 14,086,700-byte base includes all lightmaps, the three plates, the wax normal and native AgX. Step inside enabled after 3.855 s on desktop and 2.511 s on phone. The phone burned at 30.00 FPS for ten seconds. Both Chromium contexts had zero runtime and HTTP errors. The signed solar disc matched the projected pixel within 0.0022 pixels. Both local servers and capture browser profiles closed, and the GPU lease was released. The published Snow Roof and Pine Gate asset packages retained their original hashes.

### Native-resolution valley and softened wax

The next two app runs are in `artifacts/pine-gate/quality/r1/offline-runtime-probe-03/` and `artifacts/pine-gate/quality/r1/offline-runtime-native-8k-check/`. Each `comparison/` folder preserves the native images and identical-size crops. The first holds the connected needle geometry, revised cold wax and the lowered lip. The second isolates the full resolution valley and the thin-lip lighting using the earlier near scene, which leaves room in the base for an exact 2048 × 1024 downsample. These are compatibility and appearance studies.

Fine needle geometry leaves gaps in the valley-side crowns. Their broad painted proxy branches remain more obvious in the images than in the photograph. The next near-scene iteration uses verified CC0 Poly Haven LOD0 crowns for those trees. The broader cloud is visible below the flooded treads. The 8K midground separates individual canopy forms from the slope, though the fields still read as pale bands more often than reflective water. A wider softened rim exposes the melt pool in the default burning view. The newer cold wax has more varied rims and smaller spill footprints. Fine reflected highlights and the contact between old wax and stone still need close inspection.

The 8K check used manifest `fcc606284e87adba4822136ad13674688d7616bce1bd9ceb8a786e1efbac9fba`. The base is 14,517,199 bytes and the three desktop textures add 9,799,916 bytes, for 24,317,115 bytes combined. All three samplers reached 8192 × 4096 with a completed blend after entering on desktop. The phone made zero desktop texture requests, settled at 30.08 FPS and used only the 2048 × 1024 plates. Step inside enabled after 3.745 s on desktop and 2.775 s on phone. Both runs recorded zero runtime and HTTP errors and no source updates. Both servers, the browser profiles and the GPU lease were cleared. The same plates with the denser newer near scene failed the 15 MB gate by 111,819 bytes. Future packing keeps the full aperture and source dimensions and removes redundant near assets.

### Crown replacement and paddy visibility

Compare `offline-runtime-native-crowns/` with `offline-runtime-native-evergreen/` under `artifacts/pine-gate/quality/r1/`. The Poly Haven B/C LOD0 models supply genuinely branching silhouettes with solid needle geometry in the authoring render. The app reconstructs the valleyside crowns from its measured alpha and depth, while the two ancient path pines retain attached needle geometry. The original four crown captures measured 49,094–63,755 covered pixels and 54–66 occupied depth sites each. The first app captures showed pale crowns under the Pine Gate daylight. A measured linear evergreen multiplier preserves the original diffuse variation and brought the foliage into the same family as the distant forest. The recent mobile pack preserves the original 384-pixel crown width, with the KTX payload rounded to 596 pixels tall by ETC1S block alignment. All 53 actual decoded geometry primitives and their scene nodes and indices match the seven-group contact-verified model. The twelve lightmap hashes also match.

The evergreen check weighs 14,610,359 bytes at base and 24,410,275 bytes with desktop layers. Desktop requested the first high layer 49 ms after entering. The phone requested none and held 30.09 FPS. Entry was available at 3.565 s on desktop and 2.504 s on phone, with zero runtime and HTTP errors. Both required screenshots and their photo comparisons are saved in the evergreen folder.

The crops still showed broad dry-looking strips in the terraces. A same-camera 16-sample Cycles AOV showed that earth hid most of the visible water. Lowering the two sets of earth crests and adding wet soil near the water exposes more of the original pools. Measured sampling coverage increased from 3,750.125 to 6,451.75 equivalent water pixels, and the same bright cool-pixel threshold counted 572 before and 1,140 after. The 14 spans retain at least 38 mm of earth above the water on either side and 48 mm at their ends. Water depth remains 56 mm. The before and after transport receipts are in the S1 scratch directories `paddy-transport-02/` and `paddy-transport-03/`.

### Offline daylight comparison

`artifacts/pine-gate/quality/r1/review-04-offline/` pairs the new flooded terraces and layered sill wax with the same late-spring and candle photographs. The 8-sample Cycles render uses three native 8192 × 4096 masters. The shared 2048 × 1024 encodes total 608,228 bytes. The desktop encodes total 9,799,574 bytes. In the app, the full base is 14,729,211 bytes and desktop totals 24,528,785 bytes. Both Chromium runs recorded zero runtime and HTTP errors. The phone made no desktop requests and sustained 29.99 FPS. The desktop wax body covered 22.20% of frame height. The actual run and same-scale comparison crops are in `report.json` and `comparison/` in that folder.

The reveal reads as a connected green valley, with flooded treads and layered clouds. At native scale, the near valley crowns still look like painted relief. Narrow reflectors in the fields are less prominent than the flooded terraces in the photograph. The wax pool is visible, but the daylight color on some cold wax remnants breaks into solid blocks. The photograph shows a taller, worn pillar with a longer burn history than the app's newly lit candle. Both comparisons still read as app imagery.

The front left wax remnant's main chart occupies 11 × 3 atlas texels. Across its visible charts, 41 decoded texel centres feed 7,902 capture pixels. Uncompressed irradiance and capture luminance correlate at 0.939 on that remnant, 0.744 on the right short candle and 0.868 on its neighbouring stub. The short candle has no sculpt normal map. This identifies the narrow baked charts as the first fix. The source scales the old wax and short-candle lightmap charts 2.5× while retaining the original sculpt coordinates and contact geometry.

### Rooted desktop pines, mixed forest stands, and wax optics

Compare `review-04-offline/` and `review-04-native-geometry/` in `artifacts/pine-gate/quality/r1/`. The two closest valleyside pines now use the scanned Poly Haven LOD2 meshes on desktop. At 28 s, the app reports 104,705 and 84,036 rendered asset triangles for the two mounted prototypes. The existing positions, heights and root cover remain fixed. The scan's deadwood below the bark plane is clipped before export. Its shared live PBR GLB weighs 7,405,720 bytes, and the package totals 14,776,549 bytes at base and 31,981,843 bytes on desktop. The model request starts 50.5 ms after Step inside. It is absent from both the phone's requests and its scene. The thin branch hierarchy is clearer than the prior cards. Some adjacent crowns still show their relief edges. The actual decoded near model passes all seven resting-contact groups.

The front left remnant's main chart grows to 23 × 7 texels and the decoded chart total grows from 41 to 197 core texels. The right short candle receives 481 instead of 141. The focused refit retains complete sampled niche coverage and zero chart overlap. Extra resolution alone accentuates the smaller dark patches. They exist before OpenImageDenoise. Raw and denoised luminance correlate at 0.998 and 0.999 on the two sampled objects. Compare `review-04-native-geometry/` with `review-04-wax-scattering/` for the first softening study.

`review-04-grove-study/` combines a narrower wax lightmap filter with the transmitted-light flame and new hillside stands. The filter preserves the stone shadow and the contact film and samples the original lamp pass directly. The flame retains more amber against the daylight valley and has a blue base anchored to the wick. The wider remnant forms are still mottled. The forest moves from evenly dotted grass toward contiguous groves separated by terrain-dependent thin cover. The same projected right-slope plan-view probe estimates 49.4% crown cover before and 82.7% after, with 2.6% fewer tree instances. The terrain, drainage, paddy geometry and frozen site stay unchanged. This study uses 1600 × 800 plates, which visibly limit detail on the burning crop. It is a direction check for the next native 8K capture.

The grove study records 4.655 s entry readiness on desktop, 2.489 s on phone, 30.00 FPS while burning on phone, and zero HTTP errors, runtime errors or source reloads in both Chromium contexts. The paired full images, native crops and signed-sun audit are in each run's `comparison/` directory. The sun disc remains within 0.0022 pixels of its calculated projection. These are private 8-sample R1 studies.
