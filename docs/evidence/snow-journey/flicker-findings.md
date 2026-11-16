# Snow Roof journey — measured flicker causes

The frozen procedural before state contains a temporal postprocessing grain pass. It changes pixels independently of the flame, weather or camera. The pass adds `n * .02` after output conversion, so dark structural surfaces visibly shimmer.

The initial causal probe recorded two 10-second raw WebGL framebuffer sequences at 1440×900. Camera matrices were identical throughout; physical scene animation, flame and particles were held still. The first sequence retained the grade's temporal noise. The second held only that noise's time uniform fixed. Both sequences contain 601 rendered frames.

| Structural region | Animated grade: mean per-pixel RMS change | Fixed grade | Animated grade: mean absolute ROI-mean change | Pixels changing per frame |
|---|---:|---:|---:|---:|
| Left lattice | 2.039877 | 0 to raw-byte precision | 0.031011 | 87.50% |
| Lower floor | 2.080059 | 0 to raw-byte precision | 0.021278 | 87.50% |

Units are Rec.709 weighted luminance code levels on a 0–255 scale. Mean-only region measurements would largely miss this spatial noise. In the fixed-grade control the retained raw RGBA frames are byte-identical. The first probe's calculated residual below 0.000005 comes from storing prior luminance in Float32, not changed image bytes; subsequent instrumentation uses Float64.

[Exact metrics and raw evidence hashes](grain-diagnosis.json) · [Animated-grade view](all_static_temporal_grade.png) · [Fixed-grade view](all_static_fixed_grade.png)

Full raw ROI samples and per-rendered-frame statistics remain in `artifacts/snow-journey/baseline-diagnosis/`. Raw framebuffer measurements precede codec encoding. This proves the grain cause; it does not establish that all other flicker causes are absent.

The complete procedural before journey is now captured at 1440×900 and 390×844 touch emulation: 58 screenshot states, 46 ten-second raw-frame sequences and two full UI videos. All 46 sequences have camera and projection matrix maximum deltas of exactly zero. The frozen frontend's 30 tracked source files match revision `9d1b680`; the original scene SHA-256 is `14051c99e4a893ef33155674a0b40af429b3a61958466d041801f4bbe348592f`. This before state does not use the Blender-baked delivery.

With grade time fixed and normal burning animation retained, residual changes remain. The following rows use the valid normal-animation control; they do not use the faulty particle-hidden control.

| Viewport and region | Mean per-pixel RMS | Maximum frame RMS | Mean absolute ROI-mean delta | Mean fraction changing by more than 3 code levels |
|---|---:|---:|---:|---:|
| Desktop left structure | 0.295831 | 25.837180 | 0.038343 | 0.027181% |
| Desktop right structure | 0.304298 | 13.056294 | 0.023154 | 0.017904% |
| Desktop lower floor / exterior wall | 6.180071 | 9.502285 | 0.028002 | 0.305990% |
| Phone left structure | 3.413539 | 6.407334 | 0.008971 | 0.230306% |
| Phone right structure | 0.228556 | 6.167528 | 0.016247 | 0.009115% |
| Phone lower floor / exterior wall | 0.255398 | 2.168360 | 0.006389 | 0.007324% |

Sparse bright changes can produce a high per-pixel RMS while the ROI mean remains nearly constant. The original rectangular structural ROIs can be crossed by weather or dust. These measurements establish residual temporal changes, but do not isolate their cause to particles, depth fighting or moving shadows.

The initial `diagnostic-burning-fixed-grade-no-particles` control is **invalid for particle isolation**. Capture instrumentation hid each particle object once, while the product weather update could make it visible again on following frames. The original numbers and hashes are preserved. The corrected helper now hides those objects after every update and records visible particle-object counts; it awaits a GPU handoff for a corrected control. The fully frozen scene control remains a valid static-image observation and has exactly zero per-pixel RMS in every ROI at both sizes. This does not prove that all particle objects were hidden.

In the valid desktop burning control, exposure is constant at `2.9986907870287505`, bloom strength is constant at `0.46051252923645736`, and every light's world position is stationary. Dynamic PointLight intensities vary as expected with the flames: IDs 1026 and 1052 span approximately 0.264–0.304; ID 115 spans 0.771–0.893. Global exposure pumping, bloom-strength pumping and light-position movement are absent in that ten-second control. The measured intensity variation can affect surrounding material brightness, but a separate control is needed to quantify that contribution.

[Complete metrics, source fingerprints and evidence hashes](before-summary.json) · [Diagnostic validity record](before-validity.json) · [Whole journey with images and videos](before-journey.html) · [Before journey critique](before-review.md)

Raw framebuffer measurements exclude HTML overlays, so sequences behind opaque UI panels measure the underlying canvas. Screenshots and video show the actual composite UI. The projected flame control can include its translucent shade. Frame rates include synchronous readback and video recording and are not an uninstrumented performance benchmark. No physical-phone, audible sound, screen-reader or endurance pass is claimed.

## Actual baked partial-night round

The frozen night3 delivery now has 92 accepted ten-second sequences across both sizes. Every static camera/projection delta is zero. Both fully static burning controls have exactly zero RMS in every ROI. Corrected particle hiding reports zero visible particle objects throughout its controls. Normal structural RMS is much smaller than the original temporal grain, and the separate controls trace remaining changes to flame illumination, deliberate lamp/rib motion and particles. Exact accepted values, provenance and limits are in the [night3 review](night3-review.md) and [machine-readable summary](night3-summary.json).

Actual same-window native tab hiding is proven at both sizes with trusted events and saved `went_out / left` records. Earlier attempts used a separately attached CDP session that did not clear Playwright's original session-owned visibility override; those failed capture branches are preserved. The [corrected lifecycle proof](native-visibility-proof.md) uses the owning session and no synthetic visibility events.

This is a partial night/lamp delivery, not a six-look or final-payload pass. Later incense, stair-snow and 2x compositor-MSAA revisions are not represented by this round. Performance instrumentation is prepared separately and has not been run against the final source.
