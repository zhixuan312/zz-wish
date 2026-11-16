# Snow Roof final export optimization evidence

These are actual **post-batch** quality/mobile GLBs, freshly verified after the completed native 12-map batch changed the raw container. Pre-bake evidence is preserved as [provisional history](../prebake-export-study/README.md) and is not adoption evidence. These candidates are **not browser-approved packages**; byte counts below cover the GLB only.

| Actual variant | Input GLB bytes | Optimized GLB bytes | Input vertices → output | Input triangles → output |
|---|---:|---:|---:|---:|
| Quality textures | 38,021,216 | 34,824,716 | 956,291 → 648,776 | 650,624 → 466,874 |
| Mobile textures | 16,648,936 | 13,452,396 | 956,291 → 648,776 | 650,624 → 466,874 |

The reduction removes only 183,750 proven snow-enclosed triangles and their 198,050 unused vertices, then welds 109,465 bit-identical packed vertex records. No visible construction, source geometry or bake occluders were removed. All 3,292 unrelated UV-marker triangles remain. Roof materials were merged by normal packing deduplication; actual geometric correspondence establishes the shared alias instead of trusting names alone.

## Executed receipts and invariants

[Quality helper receipt](quality-helper-receipt.json) and [mobile helper receipt](mobile-helper-receipt.json) record actual inputs/output hashes, triangle counts, per-primitive hashes, node state and image invariants. The [execution record](helper-execution.json) confirms both production-helper runs passed. Their output GLB hashes are:

- Quality: `23218d772ad960574be347e60bbccf8583a60e839f52858c635a1d2852804760`.
- Mobile: `2a110e13205d4426c812806c2396a4460dd4bc551fe118ebe8db605fdefea003`.

Every retained POSITION, NORMAL, UV0/UV2 (glTF TEXCOORD_0/1), COLOR_0, COLOR_1 value and format, triangle winding, node transform/hierarchy/extra and embedded image payload is unchanged by optimization. Only cyclic corner rotation by the triangle codec is allowed. The second encoding adds no quantization, normal filtering or texture conversion.

The independent [cross-profile decoded proof](cross-profile-geometry.json) is stronger than order-invariant equivalence: optimized quality and mobile have literally identical vertex-attribute and index arrays across all 42 primitives, with identical node state. Image payloads differ intentionally between the two material profiles, while each optimizer preserves its own input images exactly. External lightmaps must be checked for equal hashes when complete manifests are assembled.

## Actual source/FACE/packed proof

The [FACE-to-raw audit](actual-face-export-validation.json) binds source `6e9f59c9...`, final hidden proof `6649e9c0...`, actual prepared `6ed42644...` and raw `0deec9fd...`. All 183,750 prepared FACE-flagged triangles matched raw float32 positions exactly, with zero unmatched faces/candidates. The [packed audit](actual-packed-export-validation.json) then matches each selected packed triangle back to its proven raw UV0/world-position triangle within the existing position quantization bound.

Maximum observed position error is 0.8452 mm. The conservative single-surface bound is 1.5127 mm, versus 20.0827 mm minimum snow-boundary clearance; even subtracting both surface bounds leaves 17.0573 mm. Full source construction remains in every bake. [Machine-readable summary](summary.json) retains the exact values.

## Reproduction and adoption boundary

Use `scripts/prune-validated-baked.mjs --profile quality|mobile` with the [quality](quality-frozen-profile.json) or [mobile](mobile-frozen-profile.json) explicit frozen profile. The original helper/profile remains unchanged and applies only to the original measured asset. Current candidate paths are `art/build/snow-roof-final-{quality,mobile}-optimized-postbatch/snow-roof.glb`, each with a sibling receipt.

The post-batch hash gate passed on actual raw `0deec9fd71d4c49e666e5b091f15af3067efbcdb7e3c350bcb85a2bf7f980dea` and unchanged prepared `6ed42644cd3a6c1026b079740957280df0274e9e9a0eaf5f8d3da514725079c1`. Fresh source/FACE/raw/packed audits generated replacement profiles from actual packer receipts; no hash bypass was used. The newly attached source scene proof/ownership extras were also verified unchanged through both optimizers and equal across variants. Chosen complete-package manifests must replace the GLB SHA/byte entry, recompute totalBytes and include optimization provenance. No public asset was overwritten by these helpers. Final browser quality/mobile approval remains pending.
