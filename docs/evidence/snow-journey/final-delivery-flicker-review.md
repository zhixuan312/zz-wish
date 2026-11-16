# Recomputed final-core luminance evidence

All 42 ten-second sequences and 208 ROI arrays were independently reconstructed from lossless uint32 luminance numerators. Gzip hashes, decompressed lengths, frame counts and telemetry agree within 1e-8; the largest numerical difference is 5.773159728050814e-15. No video pixels were used. Original capture files were read only.

All 42 sequences recorded maximum camera and projection element deltas of 0. Normal-versus-frozen starting camera/projection matrices also match exactly at both sizes. The temporal grade uniform is absent.

| Viewport | ROI | Normal mean pixel RMS | Fully frozen mean pixel RMS | Normal mean absolute ROI-mean change |
| --- | --- | ---: | ---: | ---: |
| desktop-en | left_structure | 0.030396497 | 0.000000000 | 0.001861318 |
| desktop-en | right_structure | 0.040494255 | 0.000000000 | 0.001983281 |
| desktop-en | lower_floor | 0.186941863 | 0.000000000 | 0.000458200 |
| desktop-en | upper_control | 0.112740851 | 0.000000000 | 0.001425784 |
| desktop-en | flame_control | 0.886998681 | 0.000000000 | 0.012489691 |
| phone-zh | left_structure | 0.029647868 | 0.000000000 | 0.001685979 |
| phone-zh | right_structure | 0.029167845 | 0.000000000 | 0.001836665 |
| phone-zh | lower_floor | 0.013766300 | 0.000000000 | 0.000453651 |
| phone-zh | upper_control | 0.120273425 | 0.000000000 | 0.002332579 |
| phone-zh | flame_control | 0.711579115 | 0.000000000 | 0.009316158 |

Values are Rec.709 luminance code levels on a 0–255 scale. Both frozen controls report 0 visible particle objects throughout and exactly 0 per-pixel RMS in every ROI. This supports the absence of independent temporal grain in the held output. Normal burning retains intended flame, cloth/rib motion and particles; these final controls change several components together, so they do not assign separate causal percentages. The projected flame-position ROI includes the shade/body bounds and is not a pure flame mask. Structural rectangles are not semantic masks.

[Exact recomputation](final-delivery-luma-recomputation.json) and [control/ROI summary](final-delivery-flicker-summary.json) retain the source paths, controls and numeric values. This is the preserved 16-bit-position core snapshot; the later contact-padding correction has not yet received a full journey or luminance pass. Its known spatial snow-edge fringe is separate from this temporal stability result.
