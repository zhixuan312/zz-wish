# Corrected delivery raw-frame stability

All **42 ten-second sequences and 208 ROI arrays** were independently reconstructed from lossless uint32 Rec.709 luminance numerators. Gzip hashes, decompressed lengths, frame/pixel counts and reported Float64 metrics agree within 1e-8; the largest numerical difference is 5.218048215738236e-15. No video pixels were used.

All 42 sequences recorded camera and projection maximum element deltas of **0**. Normal-versus-frozen burning starting matrices also match exactly at both sizes. The temporal grade uniform is absent. Both fully frozen controls report zero visible particle objects throughout and **zero per-pixel frame-to-frame RMS in every ROI**.

| Viewport | ROI | Normal mean pixel RMS | Fully frozen mean pixel RMS | Normal mean absolute ROI-mean change |
| --- | --- | ---: | ---: | ---: |
| desktop-en | left_structure | 0.042126249 | 0.000000000 | 0.003301088 |
| desktop-en | right_structure | 0.050815505 | 0.000000000 | 0.003593203 |
| desktop-en | lower_floor | 0.220262552 | 0.000000000 | 0.000639338 |
| desktop-en | upper_control | 0.122839614 | 0.000000000 | 0.002449086 |
| desktop-en | flame_control | 0.869387747 | 0.000000000 | 0.013225981 |
| phone-zh | left_structure | 0.016255453 | 0.000000000 | 0.000584945 |
| phone-zh | right_structure | 0.015804278 | 0.000000000 | 0.000618031 |
| phone-zh | lower_floor | 0.008871862 | 0.000000000 | 0.000246417 |
| phone-zh | upper_control | 0.111055941 | 0.000000000 | 0.000819532 |
| phone-zh | flame_control | 0.727778340 | 0.000000000 | 0.009277034 |

Values are luminance code levels on a 0–255 scale, not linear scene radiance. The frozen result supports the absence of independent temporal grain in these held outputs. Normal burning retains flame, cloth/rib motion, dynamic lighting and particles; the final control holds several components together and does not assign separate causal shares. The flame-position ROI includes shade/body bounds, and structural rectangles are not semantic geometry masks. HTML is excluded from raw canvas measurements; PNGs and videos show the actual composite UI.

[Exact reconstruction](final-contact-luma-recomputation.json), [matched controls and ROI metrics](final-contact-flicker-summary.json), and [all static sequences](final-contact-journey.html) preserve the underlying evidence. These measurements use the corrected pruned FLOAT32/contact-padding package. The remaining faint spatial snow contact seam is a separate visual limitation, not a temporal-flicker claim.
