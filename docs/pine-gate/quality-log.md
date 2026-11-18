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
