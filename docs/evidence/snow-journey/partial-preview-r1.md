# First actual partial-night runtime check

The frozen checkout `/tmp/one-light-snow-single-after` served the current working source and actual delivered Snow Roof files on Vite 5191, with the isolated API on 8792. All source and delivered-asset fingerprints remained unchanged throughout the run. Chrome exited successfully and released the GPU afterward.

This is a **partial night preview at 22:00**, with `manifest.partialPreview: true`. It contains the six real night/lamp region maps, not dusk/day maps. It is not a six-look check or final-payload acceptance. The loader intentionally uses night fallback for the absent ambient looks.

The quick round produced 14 real UI screenshots at desktop 1440×900 and phone 390×844 touch emulation. Both contexts used `ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)`. The baked descriptor was active in every Snow Roof frame. No page exception, shader compile error or failed delivery-asset response was recorded. Three console resource-404 messages remain unattributed because the initial run did not retain their console locations; the next runner also records CDP network responses and console locations.

| State | Desktop | Phone |
|---|---|---|
| Original home | [Image](../../../artifacts/snow-journey/after-partial-preview-check/desktop-en/home.png) | [Image](../../../artifacts/snow-journey/after-partial-preview-check/phone-zh/home.png) |
| Actual baked outside | [Image](../../../artifacts/snow-journey/after-partial-preview-check/desktop-en/outside.png) | [Image](../../../artifacts/snow-journey/after-partial-preview-check/phone-zh/outside.png) |
| Red Drum, 10 minutes | [Image](../../../artifacts/snow-journey/after-partial-preview-check/desktop-en/choose-10-minutes.png) | [Image](../../../artifacts/snow-journey/after-partial-preview-check/phone-zh/choose-10-minutes.png) |
| Red Drum, 24 hours | [Image](../../../artifacts/snow-journey/after-partial-preview-check/desktop-en/choose-24-hours.png) | [Image](../../../artifacts/snow-journey/after-partial-preview-check/phone-zh/choose-24-hours.png) |
| Confirm | [Image](../../../artifacts/snow-journey/after-partial-preview-check/desktop-en/confirm.png) | [Image](../../../artifacts/snow-journey/after-partial-preview-check/phone-zh/confirm.png) |
| After settled ignition and orbit | [Image](../../../artifacts/snow-journey/after-partial-preview-check/desktop-en/burning-settled.png) | [Image](../../../artifacts/snow-journey/after-partial-preview-check/phone-zh/burning-settled.png) |
| Actual explicit put-out result | [Image](../../../artifacts/snow-journey/after-partial-preview-check/desktop-en/result-put-out.png) | [Image](../../../artifacts/snow-journey/after-partial-preview-check/phone-zh/result-put-out.png) |

The first runtime check exposed a real foreground visibility defect: the unlit lantern is nearly black in choose/confirm, while the scanned painted screen is much clearer behind it. Root identified the source mismatch: preview fill remained on layer 1 after the main lamp moved to layer 0 and the separate offering pass was disabled. The full journey was paused for this targeted dynamic-fill correction and a cold-blue sky palette correction. This evidence remains unchanged as the first real delivered round.

The duration growth is physical: part world-bounds height grows from approximately 0.320 m at 10 minutes to 0.729 m at 24 hours. Frame height grows from 0.2964 m to 0.7053 m. The small lamp uses an added 0.1347 m suspension; the large one uses no extension. Both are above the phone controls. The phone 10-minute burning shade remains approximately 45 pixels tall; the open doors and snow courtyard are readable behind it.

The quick flow reached the actual `settled / progress: 1` ignition marker before its burning screenshot. Both real explicit put-out actions persisted private API records as `went_out / put_out` with a planned 600000 ms duration. The next full capture still needs the continuous walk, ten-second raw sequences, other presets/colors/drawings, native tab hiding and accelerated natural completion.

[Full quick-round metadata, source/asset fingerprints and saved records](../../../artifacts/snow-journey/after-partial-preview-check/report.json)
