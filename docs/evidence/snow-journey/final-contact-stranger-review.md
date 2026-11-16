# Final-contact desktop and phone stranger review

Both night journeys have now been inspected: **88 saved PNGs, 44 desktop and 44 phone**, with one labelled static diagnostic in each set. No clear new geometry/UI regression or frame clipping was found in the saved views. The detailed desktop review below is retained, followed by independent phone findings. This is visual still-image evidence, separate from the functional, temporal and performance captures.

Reviewed all **44 saved desktop PNGs** in `artifacts/snow-journey/final-contact/desktop-en`, including the separately labelled static diagnostic. Compared walk2/3 directly with `final-delivery/desktop-en`. This is a screenshot-only review of the 1440×900 night journey, using installed manifest `4f51484b…` / F32 GLB `9e3d5aa3…`. No browser, render, bake, encoder, source or asset changes were made for this review.

**Verdict:** no clear new geometry or UI regression is visible in these frames. The old dark snow-base outline is substantially reduced. The result remains a detailed real-time scene with visible aesthetic limits; the seam is not completely removed.

## Snow edge comparison

In walk2, the conspicuous dark rings around the two bank feet are much less apparent. In walk3, the continuous near-black border is replaced by a faint grey, intermittently scalloped contact line, most visible at the outer feet near the lower left/right frame edges. The cleared central steps remain readable. I see no new broad bright halo, displaced silhouette or missing step detail.

Before, `final-delivery/walk-3`:

![Preserved prior walk3](../../../artifacts/snow-journey/final-delivery/desktop-en/walk-3.png)

Corrected, `final-contact/walk-3`:

![Corrected walk3](../../../artifacts/snow-journey/final-contact/desktop-en/walk-3.png)

This visual improvement is consistent with the independently checked hidden-only sampling extension. Stills alone cannot determine whether the remaining line comes from texture footprints, encoded filtering, compression or the untouched uncertain contact samples.

## Desktop journey coverage

All evidence below is under the corrected desktop folder. Grouped names account for all 44 files; one is a diagnostic control rather than a product state.

| Step | Saved evidence | Visual health |
|---|---|---|
| 1. Enter a wish / language | `home`, `home-other-language`, `wish-written` | Copy, focus outline and enabled/disabled primary action remain readable and contained. |
| 2. Enter the court | `place` | Gate opening, hall beyond and primary action are clear. Exterior trees remain sparse and artificial looking. |
| 3. Walk through gate to steps | `walk-1`, `walk-2`, `walk-3` | Coherent saved viewpoints, visible footprint route and no obvious penetration. Snow join improved, with residual seam described above. |
| 4. Choose ready-made shade | `lamp-preset`, `lamp-preset-2`, `lamp-preset-3` | Three distinct forms, selected state and controls fit. Unlit red/brown previews are quite dark. |
| 5. Change duration | `lamp-10-minutes`, `lamp-24-hours` | Duration labels agree with selections; both small and largest bodies fit their saved frames. |
| 6. Change colour | `lamp-color-1`, `lamp-color-2`, `lamp-color-3` | Preview/thumbnail colour changes and selected outline are visible. |
| 7. Draw / undo / redraw | `lamp-draw-empty`, `lamp-draw-small`, `lamp-draw-undone`, `lamp-draw-redrawn-empty`, `lamp-drawn` | Empty and drawn states are distinct; durations and primary-action states fit. Drawing grid/empty controls are visually faint. |
| 8. Confirm | `confirm` | Wish, duration, irreversible-lighting explanation and actions fit without overlap. |
| 9. Ignite and move | `ignition`, `ignition-igniting`, `ignition-spreading`, `ignition-walking`, `ignition-settled` | Rod, lit shade and warm altar/screen are visible; settled view restores the blue court through open doors. No obvious broken construction in the sampled poses. |
| 10. Burn / detail setting | `burning`, `burning-save-power`, `burning-restored-detail` | Scene and HUD remain coherent; the setting label changes visibly. `diagnostic-burning-all-static` was inspected separately and is not evidence of product motion. |
| 11. Leave warning / extinguish | `leave-warning`, `went-out-smoke`, `result-went-out` | Warning choices and settled result are legible. Smoke frame includes transient UI fading; settled result does not retain that low opacity. |
| 12. Natural ending | `natural-late-burn-accelerated`, `natural-ember-accelerated`, `result-burned-down-accelerated` | Late-burn and settled completion copy are distinct. Accelerated/transition frames do not prove real-time timing or smoke motion. |
| 13. Custom shade / departure | `custom-shade-before-tab-hidden`, `burning-before-tab-hidden`, `result-focus-departure` | Custom body and saved result fit. Large lit shade competes with the small top-centre status/title text, though it remains readable. |
| 14. Records / wishes / totals | `my-lamps`, `my-lamps-bottom`, `my-wishes`, `ten-lights` | Records, third entry, grouped wish and aggregate totals fit; no obvious truncation or overlapping rows. Public totals frame does not show the private wish text. |
| 15. Return | `home-return` | Entry form returns with coherent navigation and empty-wish state. |

## Remaining aesthetic and readability limits

- **Exterior:** `place` / `walk-1` show straight, sparsely branched trees and broad mottled wall surfaces that still look generated. The gate/roof silhouette has useful construction detail, but the distant setting does not look photographic.
- **Snow:** the low-contrast contact seam remains in `walk-3`; the bank/field boundary is softer than before, not seamless.
- **Interior:** choice/confirm framing favours the hanging shade and patterned screen, leaving most altar/floor context below frame. `ignition-spreading` provides the stronger architecture/altar view. Dark preview colours lose some rib/material detail.
- **Burning:** the lit shade has a clean, simplified glow and rib outline; the pale panel at the far right remains flatter than surrounding plaster/timber. The larger custom shade shares space with the top status text. These are polish limits, not newly demonstrated pruning/padding regressions.
- **Entry backdrop:** `home` / `home-return` retain a visibly procedural cloud horizon and rock/railing treatment, outside the Snow Roof asset correction.
- **Visual accessibility risk:** small lower HUD text, faint drawing-grid lines and colour-only swatches merit separate contrast/semantic checks. Screenshots show useful focus/selection outlines, but do not establish keyboard operation, accessible names or screen-reader behaviour.

## Desktop evidence limits

The desktop section makes no phone, dusk/day, animation smoothness, temporal flicker, continuous collision safety or frame-rate claim. Those require their own evidence. All 44 desktop images were opened; functional success is limited to the visible states, not inferred from screenshots. No diagnostic close-up is substituted for an actual journey view. No visual blocker requiring another source/lighting change was found in the reviewed desktop stills.

## Independent phone review

Opened all **44 PNGs** in `artifacts/snow-journey/final-contact/phone-zh` at the captured 390×844 viewport. This set has the same 44 filenames accounted for in the desktop coverage table, including English-language entry, all preset/colour/draw variants, three settled endings, records, totals and return-home. `diagnostic-burning-all-static` remains a separate control, not a normal product state. No additional browser or image-generation work was performed.

**Phone verdict:** the full saved flow remains contained and legible, with no clear new clipping, missing scene element or geometry/UI regression. Long Chinese text wraps within the available area. These stills do not establish behaviour beyond the captured states.

| Step | Phone evidence | Independent finding |
|---|---|---|
| 1. Entry / court / walk | `home`, `home-other-language`, `wish-written`, `place`, `walk-1` to `walk-3` | Both languages, the long entered wish, gate view and entry action fit. The path and altar beyond the doorway remain coherent. Walk2 has only a faint bank-base edge; walk3 crops most outer bank feet, so it cannot certify a clean whole perimeter. |
| 2. Shade / colour / duration | All `lamp-preset*`, `lamp-color-*`, `lamp-10-minutes`, `lamp-24-hours` | Selected states and duration copy fit; the largest shade stays above the selection panel and within frame. The smallest unlit red/brown previews lose material/rib detail against the dark room. |
| 3. Draw / confirm | All `lamp-draw-*`, `lamp-drawn`, `confirm` | Empty/undo/redraw states are distinct. Both custom durations and the long confirmation wish fit. The irregular custom neck follows the drawn outline; no detached static architecture is visible. Grid and disabled controls remain faint. |
| 4. Ignite / burn / power setting | All `ignition*`, `burning`, `burning-save-power`, `burning-restored-detail` | Ignition spread reveals the scanned screen, console, fixtures, beams and paving. Settled burning shows the blue court through both open doorways. The lower wish/time/control rows remain contained. No obvious sampled camera penetration is visible. |
| 5. Warnings / all endings / custom departure | `leave-warning`, `went-out-smoke`, all `natural-*` and `result-*`, `custom-shade-before-tab-hidden`, `burning-before-tab-hidden` | Warning choices and all settled result actions fit. Transitional smoke/ember result copy is faded; settled results restore readable opacity. The large custom shade is contained, but its narrow upper neck approaches the small subtitle/status area. |
| 6. Records / wishes / totals / return | `my-lamps`, `my-lamps-bottom`, `my-wishes`, `ten-lights`, `home-return` | Counters reflow into two columns; long wish rows and the third scrolled record remain readable without overlapping. Grouped-wish and aggregate totals views fit. Return-home restores the empty entry state. |

Phone limitations remain aesthetic/readability issues rather than a newly demonstrated asset regression: the small shade has a clean, simplified red glow; dark previews and small lower HUD text are subdued; the snow boundary is improved, not proven seamless; the entry backdrop still has a visibly generated horizon. The narrow crop also hides much of the outer architecture and both bank perimeters. The pale far-right desktop panel is outside the normal phone burning crop and cannot be assessed there.

This phone review covers only the supplied night PNGs. It makes no additional claim about six-look lighting, real-time completion timing, native focus/visibility behaviour, flicker, continuous motion/collision safety, screen-reader access or frame rate. Those remain the responsibility of the separate captures/tests; their reported success is not inferred from these screenshots.
