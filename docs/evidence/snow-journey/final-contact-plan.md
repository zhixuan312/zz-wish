# Corrected final-contact capture plan and completion

The corrected round completed on a frozen source on port 5198 with the distinct `final-contact` tag. The accepted 16-bit-position `final-delivery` dataset and its source on port 5194 remain preserved. The complete corrected package passed the producer proofs and root install/build checks before capture. Main scene source remained `90d634eee0c8fb553dce074cef0531aace6d0be878766a4526f8b5ab09aedd56`.

Required handoff: a complete corrected runtime package/manifest with file hashes and bytes, pruned-F32 retained-geometry proof, certified eight-map extension receipts/proofs, unchanged material images and visible/uncertain original base samples, successful root install/build, and both producers terminal. No new material A/B or source-code change is required by this asset correction.

These commands ran sequentially from a fresh standard-instrumented clone of the accepted source, with the corrected assets installed. No geometry diagnostic materials or sampler overrides were installed in this final snapshot.

```sh
REQUIRE_FINAL_BANKS=1 BASE_URL=http://127.0.0.1:5198 SOURCE_ROOT=/tmp/one-light-final-contact EVIDENCE=final-contact node tests/visual/snow-performance.mjs
STATE=after CORE_FLOW=1 REQUIRE_FINAL_BANKS=1 SOURCE_ROOT=/tmp/one-light-final-contact BASE_URL=http://127.0.0.1:5198 DB_FILE=/tmp/one-light-real.db EVIDENCE=final-contact HEADLESS=0 node tests/visual/snow-journey-capture.mjs
BASE_URL=http://127.0.0.1:5198 SOURCE_ROOT=/tmp/one-light-final-contact EVIDENCE=final-contact node tests/visual/snow-time-looks.mjs
```

Performance comes first: no video/readback, ten seconds per phase, desktop 1440×900 at deviceScaleFactor 1 and phone 390×844 at deviceScaleFactor 2. It records actual intervals, asynchronous GPU/CPU-submit timings, camera equality, both compositor targets' 2→0→2 samples, active map residency and device texture formats/dimensions. The whole core then uses deviceScaleFactor 1 at both sizes for comparable screenshots/luminance, full videos, three walk holds, 10-minute/24-hour and drawing variants, ignition, normal/frozen controls, actual native-hidden/navigation endings and approved accelerated natural settlement. Six time looks follow on the identical snapshot, including 22→13→22 bank streaming traces.

Use a separate Vite cache and API/WebSocket proxy on port 8792. Browser identity must match the frozen source/manifest hashes; all delivered files and source are fingerprinted before/after. Any capture tooling defect is recorded separately from product behavior.

Browser measurements are terminal. Derived summaries use `COMPACT_SUMMARY=1`, storing the manifest once and deduplicating repeated texture-layout descriptions while preserving exact raw report references/hashes, every per-frame numeric sequence and every lossless luminance array. Independent numeric recomputation ran only after all browser measurements finished.

The earlier core's 42 sequences/208 ROI arrays are already independently verified in [final-delivery-flicker-review.md](final-delivery-flicker-review.md). Those figures describe the preserved comparator and must not be presented as measurements of the corrected assets.

Completed evidence: [whole CORE](final-contact-core-review.md), [no-video performance including the mixed-hour phone probe](final-contact-performance-review.md), [six looks and four hot transitions](final-contact-streaming-review.md), and [independent corrected-package luminance reconstruction](final-contact-flicker-review.md). The final six-look gallery uses 36 bounded CSS-settled replacement UI stills plus the original 12 burning stills; the original 48 and all transition traces remain preserved. No full CORE repetition was needed for that tooling-only timing correction.
