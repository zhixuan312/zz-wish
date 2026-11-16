# Procedural before journey review

This review uses the saved full journey from the frozen procedural frontend at revision `9d1b680`. The Blender-baked Snow Roof was not active. The actual Cloud Cliff home cover is included; the journey selects only Snow Roof. [Browse all 58 full-size screenshots and both videos](before-journey.html).

The main journey completes on both desktop English and phone Chinese. Both deliberate extinction and accelerated natural completion persist as distinct records. There are no page exceptions or detected horizontal overflow. The largest measured issue is independent temporal grain across the entire canvas. The largest visible journey issue is the small, high lantern in the phone burning view.

## Findings tied to evidence

1. **High priority — remove the global structural shimmer.** The isolated ten-second probe keeps the camera and physical animation still. Changing only the grade time produces about 2.04–2.08 luminance code levels of per-pixel frame RMS, while the fixed-grade retained raw frames are byte-identical. Around 87.5% of pixels change per frame. ROI means almost hide the noise. See [exact measurements](grain-diagnosis.json) and [measured residuals and validity limits](flicker-findings.md). The main source has since removed the temporal term; the baked after delivery is not yet captured.

2. **High priority — give the phone lantern more of the burning frame.** In [phone burning](../../../artifacts/snow-journey/before/phone-zh/burning.png), its lit shade is approximately 50 pixels tall in an 844-pixel view, around 6% of the height. Its center is near y=290. The doorway, wall and empty cord occupy much more of the image than the light. The [desktop shade](../../../artifacts/snow-journey/before/desktop-en/burning.png) is approximately 145 pixels tall but begins near y=34, close to the upper edge. A closer phone composition should make the light's form, wick and changing fuel visible while keeping the wish and bottom controls readable.

3. **Medium priority — retain construction detail under the night lighting.** The [outside](../../../artifacts/snow-journey/before/desktop-en/place.png), [second approach](../../../artifacts/snow-journey/before/desktop-en/walk-2.png) and [interior approach](../../../artifacts/snow-journey/before/desktop-en/walk-3.png) show large flat walls, a flat snow roof, plain door leaves and a simple altar. The before images do not contain the later Blender joinery, scan props, roof courses or worn paving. Judge those additions in the delivered browser model rather than attributing CPU preview detail to this baseline.

4. **Medium priority — make small secondary text easier to read on phone.** The bottom burning controls and top navigation are visually quiet and small in [phone burning](../../../artifacts/snow-journey/before/phone-zh/burning.png). The empty draw instruction and subdued dividers are also faint in [phone draw](../../../artifacts/snow-journey/before/phone-zh/lamp-draw-empty.png). This is a readability risk visible in the screenshots; it is not a measured contrast failure or a finding that the tap rectangles are too small. The primary gold buttons remain clear.

5. **Scope migration — the before picker and public list still expose ten courts.** [Phone place selection](../../../artifacts/snow-journey/before/phone-zh/place.png) contains ten place names, and [Ten Lights](../../../artifacts/snow-journey/before/phone-zh/ten-lights.png) lists them. The new single-court brief requires the after UI to expose Snow Roof only while retaining hidden place code and server records. The main UI is being changed separately; no claim is made about its after state here.

6. **Preserve — endings have different copy, behavior and saved state.** The actual leave warning explains the consequence before extinction. [Went-out result](../../../artifacts/snow-journey/before/phone-zh/result-went-out.png) and [burned-down result](../../../artifacts/snow-journey/before/phone-zh/result-burned-down-accelerated.png) visibly differ. API records prove `went_out / navigated` and `burned_down / complete` for each visitor. Natural completion uses clearly labelled client/server clock acceleration; it proves visual settlement and persistence, not an endurance burn.

7. **Preserve — writing, touch drawing and the saved wish work across the flow.** The [Chinese wish](../../../artifacts/snow-journey/before/phone-zh/wish-written.png) stays visible in burning and saved records. The [drawn contour](../../../artifacts/snow-journey/before/phone-zh/lamp-drawn.png) was made with actual touch input and yields a computed 4-hour-2-minute duration; the desktop contour yields 4 hours 45 minutes. Before confirmation the runner intentionally selects the 10-minute duration, so the later 10-minute label is not a duration mismatch. Drawing multiple sizes and choosing every color/preset still need explicit after captures.

8. **Scope migration — verify the requested red gauze default.** The [before preset screen](../../../artifacts/snow-journey/before/phone-zh/lamp-preset.png) selects the cream swatch, and the eventual burning shade is cream. The after review must check its initial shade color against the requested red gauze. This is a before observation, not a claim that the current unrecorded UI is still wrong. The original home lantern remains different by the explicit cover-preservation requirement.

## Flow evidence

Every row links the accepted screenshot at both sizes. Intermediate smoke/ember shots deliberately show transitional opacity; final result screenshots show settled copy.

| Step | State and general health | Desktop | Phone |
|---:|---|---|---|
| 1 | Home: wish entry visible; original cover retained. | [Image](../../../artifacts/snow-journey/before/desktop-en/home.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/home.png) |
| 2 | Other language: labels and wish guidance change. | [Image](../../../artifacts/snow-journey/before/desktop-en/home-other-language.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/home-other-language.png) |
| 3 | Written wish: filled value and enabled action visible. | [Image](../../../artifacts/snow-journey/before/desktop-en/wish-written.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/wish-written.png) |
| 4 | Place: Snow Roof selected; old ten-place UI remains. | [Image](../../../artifacts/snow-journey/before/desktop-en/place.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/place.png) |
| 5 | Walk quarter: continuous path, inspection hold. | [Image](../../../artifacts/snow-journey/before/desktop-en/walk-1.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/walk-1.png) |
| 6 | Walk half: continuous path, inspection hold. | [Image](../../../artifacts/snow-journey/before/desktop-en/walk-2.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/walk-2.png) |
| 7 | Walk three quarters: altar reached; simple baseline geometry. | [Image](../../../artifacts/snow-journey/before/desktop-en/walk-3.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/walk-3.png) |
| 8 | Preset choice: controls available and within frame. | [Image](../../../artifacts/snow-journey/before/desktop-en/lamp-preset.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/lamp-preset.png) |
| 9 | 24 hours: selection and duration label update. Physical scale is not established by this shot alone. | [Image](../../../artifacts/snow-journey/before/desktop-en/lamp-24-hours.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/lamp-24-hours.png) |
| 10 | Empty draw: disabled confirm; subdued instruction. | [Image](../../../artifacts/snow-journey/before/desktop-en/lamp-draw-empty.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/lamp-draw-empty.png) |
| 11 | Drawn contour: actual pointer/touch input; computed duration. | [Image](../../../artifacts/snow-journey/before/desktop-en/lamp-drawn.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/lamp-drawn.png) |
| 12 | Confirmation: wish and planned time clear. | [Image](../../../artifacts/snow-journey/before/desktop-en/confirm.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/confirm.png) |
| 13 | Ignition: click captured; motion requires video review. | [Image](../../../artifacts/snow-journey/before/desktop-en/ignition.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/ignition.png) |
| 14 | Burning: actual live state; phone lantern small. | [Image](../../../artifacts/snow-journey/before/desktop-en/burning.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/burning.png) |
| 15 | Fixed-grade diagnostic: valid normal animation control. | [Image](../../../artifacts/snow-journey/before/desktop-en/diagnostic-burning-fixed-grade.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/diagnostic-burning-fixed-grade.png) |
| 16 | Intended no-particles diagnostic: invalid particle isolation; retained transparently. | [Image](../../../artifacts/snow-journey/before/desktop-en/diagnostic-burning-fixed-grade-no-particles.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/diagnostic-burning-fixed-grade-no-particles.png) |
| 17 | All-static diagnostic: raw pixel deltas are zero. | [Image](../../../artifacts/snow-journey/before/desktop-en/diagnostic-burning-all-static.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/diagnostic-burning-all-static.png) |
| 18 | Leave warning: consequence and stay/leave choices visible. | [Image](../../../artifacts/snow-journey/before/desktop-en/leave-warning.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/leave-warning.png) |
| 19 | Extinction transition: smoke/opacity transition captured. | [Image](../../../artifacts/snow-journey/before/desktop-en/went-out-smoke.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/went-out-smoke.png) |
| 20 | Went-out result: saved result and next actions. | [Image](../../../artifacts/snow-journey/before/desktop-en/result-went-out.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/result-went-out.png) |
| 21 | Accelerated late burn: real live flow near completion. | [Image](../../../artifacts/snow-journey/before/desktop-en/natural-late-burn-accelerated.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/natural-late-burn-accelerated.png) |
| 22 | Accelerated ember: transition to natural result. | [Image](../../../artifacts/snow-journey/before/desktop-en/natural-ember-accelerated.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/natural-ember-accelerated.png) |
| 23 | Burned-down result: distinct saved completion. | [Image](../../../artifacts/snow-journey/before/desktop-en/result-burned-down-accelerated.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/result-burned-down-accelerated.png) |
| 24 | My Lamps: both records present with different states. | [Image](../../../artifacts/snow-journey/before/desktop-en/my-lamps.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/my-lamps.png) |
| 25 | My wishes: records grouped under the same wish. | [Image](../../../artifacts/snow-journey/before/desktop-en/my-wishes.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/my-wishes.png) |
| 26 | Ten Lights: statistics load; old ten-court scope. | [Image](../../../artifacts/snow-journey/before/desktop-en/ten-lights.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/ten-lights.png) |
| 27 | Most time: ordering tab responds. | [Image](../../../artifacts/snow-journey/before/desktop-en/ten-lights-time.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/ten-lights-time.png) |
| 28 | Now: ordering tab responds. | [Image](../../../artifacts/snow-journey/before/desktop-en/ten-lights-now.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/ten-lights-now.png) |
| 29 | Return home: empty wish entry ready for another run. | [Image](../../../artifacts/snow-journey/before/desktop-en/home-return.png) | [Image](../../../artifacts/snow-journey/before/phone-zh/home-return.png) |

## Limits and remaining checks

The retained camera and projection matrices prove stillness during each measurement. Exact walk progress/position was not written by the original runner; it pauses after the actual progress signal crosses 0.25, 0.50 and 0.75 and resumes the same path. The after helper now retains that metadata.

There are three console 404 messages without retained HTTP response URLs, so they remain unresolved in this evidence. The initial diagnostic found a missing favicon, but that does not conclusively attribute all three messages. No page exception or horizontal overflow was recorded. Vertical scrolling, keyboard focus order, assistive-technology behavior, measured contrast, real phone performance, sound quality and a true endurance burn are not established by these screenshots. Raw framebuffer telemetry excludes HTML overlays and uses rectangular ROIs rather than semantic masks.

The after run must explicitly verify the baked descriptor and delivered assets, run corrected particle isolation, capture the 3.8-second taper ignition separately from settled burning, and exercise every preset/color plus small/large touch drawings. Keep browser measurements separate from Metal Cycles jobs.
