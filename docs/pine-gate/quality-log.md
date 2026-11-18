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

The ready controls took 3.66 s and 2.46 s, and the uninterrupted walks took 30.12 s and 30.52 s. The far views frame the original wax body at 20.85% and 20.83%. Neither live audio sample clipped. The desktop and phone comparisons and their hashes are in `artifacts/pine-gate/quality/preview-02/pairs/` and `artifacts/pine-gate/quality/preview-02/comparison.json`.

The third preview adds a visible, practical warm guide among the gate timbers and more varied forest-floor contacts. It also reduces the direct candle radius on the stone and scales the holder to the candle footprint. The remaining judgments need actual app frames.
