# Corrected delivery performance

All **12 ten-second no-video/no-readback windows** were valid on the corrected pruned FLOAT32/contact-padding package. Normal/restored burning averaged approximately 30 FPS, with GPU p95 at most 23.69 ms against a 33.33 ms frame budget. There were **0 intervals at or above 42 ms across 1202 normal/restored intervals**. Runtime/HTTP errors and source/asset changes were zero; both visitors completed actual UI put-out cleanup.

| Phase | Desktop FPS | Phone FPS | Interval p95 desktop / phone | GPU p95 desktop / phone |
| --- | ---: | ---: | ---: | ---: |
| home | 60.02 | 60.00 | 18.4 / 18.1 ms | 16.30 / 18.44 ms |
| outside | 60.09 | 60.10 | 17.9 / 18.2 ms | 14.30 / 15.64 ms |
| choose | 60.06 | 60.07 | 17.0 / 17.7 ms | 13.59 / 13.24 ms |
| burning-normal | 30.00 | 30.00 | 35.2 / 35.3 ms | 21.18 / 23.69 ms |
| burning-power-saver | 15.00 | 15.00 | 68.6 / 68.5 ms | 15.80 / 9.94 ms |
| burning-restored-detail | 30.05 | 30.02 | 35.3 / 35.2 ms | 20.87 / 23.48 ms |

Both RGBA16F and depth24 reported supported sample counts [4, 2]. Both actual composer targets switched **2→0→2** through full detail, power saver and restore. Desktop used 1440×900 at DPR 1. Phone used 390×844 CSS touch emulation at deviceScaleFactor 2: the actual buffer was **487×1055 at DPR 1.25**, then 390×844 at DPR 1 in saver. Camera/projection deltas were 0; GPU queries completed asynchronously. This is headed Chrome on the M1 ANGLE Metal GPU, not a physical-phone benchmark. Screenshots and delivery inspection occurred outside timing windows.

A bounded extra 10-second phone burning window at **5.5 local hour** exercised the largest live atlas set observed in the six looks: lamp plus night/dusk/day, no pending loads, weights [0.338739, 0.462003, 0.199258]. It measured **30.00 FPS**, interval p95 35.31 ms, GPU p95 23.45 ms and CPU-submit p95 4.30 ms. All intervals were in 25–42 ms; actual UI cleanup saved a put-out record.

Actual active night/lamp textures reported court: 4096×4096, 3 levels, RGBA_ASTC_4x4_Format; gate: 2048×2048, 3 levels, RGBA_ASTC_4x4_Format; hall: 4096×4096, 3 levels, RGBA_ASTC_4x4_Format. Upload versions matched and gl.isTexture returned true. These dimensions and ASTC selections are observed Three/transcoder metadata, not a queried GPU storage internal format. The mobile material profile and UASTC lightmap delivery are retained in full metadata.

Evidence: [12-window summary](../../../artifacts/snow-performance/final-contact/summary.json), [per-frame CSV](../../../artifacts/snow-performance/final-contact/frames.csv), [complete timing/device/delivery metadata](../../../artifacts/snow-performance/final-contact/report.json), and [mixed-hour summary](../../../artifacts/snow-performance/final-contact-mixed-phone/summary.json) / [raw frames](../../../artifacts/snow-performance/final-contact-mixed-phone/frames.csv). The earlier [three-dataset pacing comparison](final-performance-review.md) remains preserved; its geometry/assets are the preceding comparator, not these corrected-package measurements.
