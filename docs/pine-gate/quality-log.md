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
