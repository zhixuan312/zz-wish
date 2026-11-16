# Final native bake evidence

All twelve Snow Roof maps were actually baked at 64 samples with Cycles on the Apple M1 Metal GPU and explicitly filtered by OpenImageDenoise RT HDR HIGH on its Metal backend. The native batch exited successfully after 1,956.992 seconds (32 minutes 37 seconds). This directory records build evidence; runtime browser review is a separate gate.

`summary.json` records the actual source/prepared/raw identities, per-map sample counts, timings, EXR master hashes, compressed bytes, encoding and UV coverage. `native-bake.log` is the production process log. `native-device-observation.json` records the enabled Cycles device and loaded Metal OIDN library during the batch; a library observation alone is not a GPU-utilization measurement.

`generated-emission-proof.json` compares native Generated shading with both transfer methods on a beveled source snow piece. The evaluated `undeformed_co` method matches to maximum absolute error 1.79e-7; generic interpolated POINT coordinates differ by up to 0.184. `generated-coordinate-audit.json` binds each original texspace and the actual receiver attribute bytes. The accepted prepared bank image and this numerical proof are bound by `prepared-mapping-proof.json`.

`delivery-image-audit.json` compares all twelve actual UASTC maps after official RGBA8 transcode against their denoised linear EXRs, including dark/middle/peak errors and newly black nonzero texels. All three mips are checked; coarser checks require a complete same-chart footprint. Actual ASTC/BC7/ETC device transcode and screen interpolation still require runtime review.

The delivery uses log2 HDR encoding with gain 4096, three explicit mips averaged in linear radiance, eight-pixel chart padding/edge extension and anisotropy 1. Decode before pass blending, then multiply by π for Three's irradiance input. `lightmap-codec-comparison.json` records the rejected smaller ETC1S alternative: its dark error and black-texel regressions are materially worse. All final lightmaps remain UASTC.

The authored night world/lights are preserved, the visitor-only basis remains 45 W, and accepted fixture factors are night 1, dusk 0.8, day 1. Every region was rebaked after the final connected-bank geometry/mapping revision; old GI pixels were not reused. Final export pruning affects only a separate delivery copy of proven snow-enclosed faces and leaves these full-source bake identities unchanged.
