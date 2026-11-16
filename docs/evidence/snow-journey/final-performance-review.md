# Final pacing measurement

The 3 ms deadline-admission refinement restored the intended average cadence and removed almost all earlier short/long pairs. All 12 ten-second windows were valid, with zero product/HTTP errors, unchanged frozen source and successful actual UI put-out cleanup at both sizes.

| View | Desktop FPS | Phone FPS | Desktop interval p95 | Phone interval p95 |
| --- | ---: | ---: | ---: | ---: |
| Home | 60.00 | 60.00 | 18.5 ms | 17.9 ms |
| Outside | 60.11 | 60.10 | 18.2 ms | 18.4 ms |
| Choose | 60.08 | 60.05 | 17.2 ms | 17.8 ms |
| Normal burn | 30.00 | 30.00 | 35.3 ms | 35.2 ms |
| Power saver | 15.00 | 15.00 | 68.7 ms | 68.6 ms |
| Restored detail | 30.04 | 30.00 | 35.3 ms | 35.2 ms |

Normal/restored GPU p95 was 20.50/21.40 ms desktop and 22.17/23.31 ms phone, below the 33.33 ms frame budget. Desktop normal/restored had no intervals in the 42–59 ms bucket. Phone normal had three such intervals out of 300, with three compensating short intervals; restored had none. Both saver windows had all 150 intervals in the 59–75 ms bucket. This improves the prior refinement's restored desktop count of 59 long intervals and phone counts of 40/46. Exact distributions remain in the [comparison data](final-performance-comparison.json).

This was headed Chrome on the Apple M1 Metal GPU, without video or pixel readback during timing. GPU queries completed asynchronously. Both compositor targets switched 2→0→2 samples. Desktop used 1440×900 at DPR 1. Phone used 390×844 CSS touch/mobile emulation at deviceScaleFactor 2: its measured buffer switched 487×1055 at DPR 1.25 → 390×844 at DPR 1 → 487×1055. These are M1 emulation measurements, not a physical-phone benchmark.

Evidence: [summary](../../../artifacts/snow-performance/final-mobile-paced2/summary.json), [every frame as CSV](../../../artifacts/snow-performance/final-mobile-paced2/frames.csv), and [complete metadata](../../../artifacts/snow-performance/final-mobile-paced2/report.json). The preceding two measured datasets and both original snapshots remain preserved. Current frozen source is `/tmp/one-light-final-mobile-paced2` on port 5194; original scene SHA is `90d634eee0c8fb553dce074cef0531aace6d0be878766a4526f8b5ab09aedd56`.

The full core journey has now completed on this same optimized 16-bit-position snapshot. Six-look capture is held for a separate snow-bank edge investigation. These timing measurements do not describe the later unpruned 650,624-triangle FLOAT32 diagnostic.
