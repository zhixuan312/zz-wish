# Frozen night3 journey review

The combined accepted set contains **109 screenshots and 92 ten-second raw sequences**, 46 at each size. Every accepted static camera and projection matrix has zero movement. The source and delivered asset fingerprints match across all inputs and stay unchanged. There are no product page exceptions, console/HTTP errors or detected horizontal overflow in the accepted evidence.

[Browse the whole journey, videos and cause controls](night3-journey.html) · [Exact metrics, hashes, records and provenance](night3-summary.json) · [Native visibility proof](native-visibility-proof.md)

This is the actual partial night delivery at 22:00, with `partialPreview: true`. Only night/lamp maps are delivered. The later incense, step-snow and compositor MSAA revisions are not present. No six-time-look, full-payload, physical-phone, performance/endurance or audible-sound acceptance is claimed.

## Measured changes

Both fully static burning controls have exactly **0 RMS in every ROI**, including the lamp control. This supports removal of independent static-image noise; it does not mean that deliberate flame, lamp movement and particles stop in normal use.

| Valid normal-animation region | Desktop mean pixel RMS | Phone mean pixel RMS |
|---|---:|---:|
| Left non-lamp structure | 0.103292 | 0.018025 |
| Right non-lamp structure | 0.047776 | 0.018078 |
| Lower floor / exterior region | 0.255917 | 0.010660 |
| Lamp / flame-position control | 0.865557 | 0.587249 |

Units are Rec.709 display-luminance code levels on a 0–255 scale, measured before video encoding. ROIs outside the projected lamp-body bounds are explicitly flagged. The flame-position control includes the translucent shade and ribs, so it is not a pure flame mask.

With fuel held, the desktop lower-floor/exterior RMS is 0.325174. Hiding the particle group reduces it to 0.001693 and every sample records zero visible particle objects. The control groups weather, dust, mist and smoke; it does not independently identify one emitter. With particles, fuel and daylight held, fixing the flame clock/intensity reduces desktop wall RMS to 0.000636 / 0.000161. Holding shadow-map refresh alone does not remove that light variation. Holding lamp rotation reduces the desktop lamp-control RMS from around 0.85–0.91 to 0.042784; phone shows the same pattern, around 0.60–0.64 to 0.031047. Most remaining lamp-region pixel changes therefore track deliberate silhouette/rib movement, while wall changes track the gentle flame illumination. These are separate ten-second windows with independent flame phases, not identical replayed samples.

Lossless per-pixel luminance is preserved for every measured ROI/frame, with compressed-file hashes. Independent recomputation of all 92 sequences and 452 ROIs matches the Float64 telemetry; the maximum difference is 6.78e-15 code levels. [Full recomputation results](night3-luma-recomputation.json) are retained. Representative raw RGBA frames remain alongside it. Frame rates from these video/readback runs are not used as an uninstrumented performance benchmark.

## Flow health and evidence

1. **Home and language switch — clear.** The original Cloud Cliff cover is retained. Both Chinese and English guidance are visible.
2. **Written wish — clear.** The desktop accepts 60 characters; phone accepts 59 Chinese characters. The long wish wraps in confirmation, burning and records.
3. **Place — clear.** Snow Roof is the sole visible court. The real baked exterior and cold blue-gray sky load.
4. **Walk quarter — valid.** The actual progress signal is near 0.25; its unique camera position is held for ten seconds.
5. **Walk half — valid.** The next distinct path point is near 0.50, with no cut or missing background.
6. **Walk three quarters — valid.** The point near 0.75 reaches the hall approach; the same path resumes into the room.
7. **Initial lamp choice — clear.** Red is selected by default. The unlit cloth is subdued but identifiable above the controls.
8. **10-minute/24-hour sizes — distinct.** The same red Drum profile visibly grows, while the suspension adjusts to retain the light basis. The whole body remains above phone controls.
9. **Presets and colors — responsive.** All three preset outlines and all three colors update the actual preview.
10. **Draw, redraw and undo — responsive.** Actual pointer/touch input produces small and large physical shades and longer durations for the larger contour. Empty drawings disable confirmation. An asymmetric custom shade is later lit through the real UI.
11. **Confirm — clear.** Wish, court and chosen time fit; the lamp stays visible.
12. **Ignition motion — captured separately.** Taper approach, catch/spread, warm hold and continuous orbit are recorded. Static burning waits for `settled / progress: 1`.
13. **Burning — stable camera.** Warm red cloth and dark ribs remain distinct; the open blue courtyard is readable. Normal flame/particle motion remains enabled.
14. **Burning toolbar — responsive.** Time-left display, wish hiding, mute, power saver and put-out warning/cancel are captured. No audible sound quality is inferred.
15. **Explicit leave warning — clear.** The warning explains that opening records extinguishes this lamp.
16. **Navigated result — persisted.** The actual action saves `went_out / navigated` and displays the saved result.
17. **Native hidden result — persisted.** Correct owning-session browser control produces trusted same-window hidden events and `went_out / left` at both sizes. The primary phone recording's earlier focus-only departure is labelled separately.
18. **Natural completion — persisted.** Approved client/server clock acceleration produces the real gutter/result and `burned_down / complete`. It is a visual settlement check, not an endurance burn.
19. **My Lamps — clear.** Each primary visitor has three saved records: two went out and one burned down. Bottom scrolling exposes the final record.
20. **My wishes — clear.** The three records group under the same private wish.
21. **Public statistics — clear.** Only Snow Roof is listed. Sorting controls are intentionally absent for the single-court view; the obsolete selector failure was tooling, not a product defect.
22. **Return home — ready.** The empty wish field and original cover return. Phone return-home has its own ten-second raw supplement.

All accepted images were inspected in [contact sheets](night3-contact/) as well as selected full-size frames. No clipped controls or overlap were found in the captured states. This is not a keyboard, screen-reader, zoom or formal contrast audit.

## Provenance and known limits

Desktop has a complete successful recording on the unchanged frozen source. Phone evidence spans its broad primary recording through statistics, a separate corrected no-video native lifecycle proof, and the returned-home ten-second supplement. It must not be described as one uninterrupted phone recording. The original capture failures remain in the exact report with their automation cause preserved.

The old incense emitter/tip mismatch and six rectangular stair-snow pads remain visible or source-verifiable in this snapshot. Their later corrections are listed in [known issues](night3-known-issues.json), not credited to these images. Static geometry and lighting changes after this snapshot require their own final round.

Raw framebuffer data excludes HTML overlays. Rectangular ROIs are not semantic masks and can be crossed by particles. Mobile is viewport/touch emulation on an M1 desktop GPU. The future no-video/no-readback performance probe and CORE_FLOW capture mode are prepared, but have not run against the final MSAA/geometry/ambient-map source.
