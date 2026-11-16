# Six looks and live bank streaming

The complete corrected package was captured at local hours **5.5, 7, 13, 17.5, 19.5 and 22**, outside, choosing, confirming and settled burning at both sizes. The [final 48-frame gallery](final-contact-time-looks.html) combines 36 CSS-settled UI stills with the original 12 burning stills; its [provenance index](final-contact-time-looks.json) links both original reports and exact frame hashes. Independent visual findings are in the [lighting review](final-contact-lighting-review.md).

One original phone 5.5 confirm frame caught the sheet's 650 ms entrance animation. This is a capture timing defect. All 36 replacement UI stills record opacity 1, identity transform, finished entrance animations and fade opacity below .01. No source, lighting or assets changed, and the bounded repair lit no candles. The original 48 images and four hot traces remain preserved.

| Viewport | Local-hour transition | Raw frames | Observed span | Bank requests | Final resident passes |
| --- | --- | ---: | ---: | ---: | --- |
| desktop-en | 22→13 | 301 | 10.02 s | 3 | lamp, day |
| desktop-en | 13→22 | 301 | 10.02 s | 0 | lamp, night |
| phone-zh | 22→13 | 301 | 10.01 s | 3 | lamp, day |
| phone-zh | 13→22 | 302 | 10.02 s | 0 | lamp, night |

Every hot frame has an effective ambient-weight trace; the minimum weight sum across all four traces is 0.9999999999999999. All camera/projection deltas are 0. Structural ROI means remain nonzero (minimum 9.176 on the 0–255 code scale). This supports continuity in the measured regions while the new bank loads and crossfades; it is not a whole-frame or static-flicker score.

At each endpoint, inactive ambient passes reference one-pixel placeholders in all three compiled regional samplers, with zero uploaded atlas references. Returning to night performs **zero bank requests** at both sizes while restoring the night atlas; CPU compressed texture retention is separate from active GPU sampler residency. The complete [trace/residency summary](final-contact-streaming-summary.json) links all raw arrays and request records. Actual UI put-out saved all 12 look-run candles; the UI repair created none. Runtime/HTTP errors and source changes were zero.

At mixed hours, all three ambient banks plus lamp are genuinely active. The additional [5.5-hour phone performance window](final-contact-performance-review.md) measures that observed maximum live-atlas set. Texture formats/dimensions come from the actual transcoded Three textures and upload handles; a queried GPU storage internal format is not claimed.
