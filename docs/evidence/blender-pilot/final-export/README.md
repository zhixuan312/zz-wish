# Snow Roof final export optimization evidence

These are actual separately staged quality/mobile GLBs, verified by executed helpers. They are **not browser-approved packages**. Native 12-map baking and complete-manifest assembly are separate; byte counts below cover the GLB only.

| Actual variant | Input GLB bytes | Optimized GLB bytes | Input vertices → output | Input triangles → output |
|---|---:|---:|---:|---:|
| Quality textures | 38,017,908 | 34,821,408 | 956,291 → 648,776 | 650,624 → 466,874 |
| Mobile textures | 16,645,632 | 13,449,088 | 956,291 → 648,776 | 650,624 → 466,874 |

The reduction removes only 183,750 proven snow-enclosed triangles and their 198,050 unused vertices, then welds 109,465 bit-identical packed vertex records. No visible construction, source geometry or bake occluders were removed. All 3,292 unrelated UV-marker triangles remain. Roof materials were merged by normal packing deduplication; actual geometric correspondence establishes the shared alias instead of trusting names alone.

## Executed receipts and invariants

[Quality helper receipt](quality-helper-receipt.json) and [mobile helper receipt](mobile-helper-receipt.json) record actual inputs/output hashes, triangle counts, per-primitive hashes, node state and image invariants. The [execution record](helper-execution.json) confirms both production-helper runs passed. Their output GLB hashes are:

- Quality: `d37a76d691b5d1703ba0c9ff36558631b4613e05e532ac92cb74f88c0f5fc174`.
- Mobile: `9f34007cc49bb899c98dc59c862aa20dee91d533ba5b2ee574a5ace8f42db94d`.

Every retained POSITION, NORMAL, UV0/UV2 (glTF TEXCOORD_0/1), COLOR_0, COLOR_1 value and format, triangle winding, node transform/hierarchy/extra and embedded image payload is unchanged by optimization. Only cyclic corner rotation by the triangle codec is allowed. The second encoding adds no quantization, normal filtering or texture conversion.

The independent [cross-profile decoded proof](cross-profile-geometry.json) is stronger than order-invariant equivalence: optimized quality and mobile have literally identical vertex-attribute and index arrays across all 42 primitives, with identical node state. Image payloads differ intentionally between the two material profiles, while each optimizer preserves its own input images exactly. External lightmaps must be checked for equal hashes when complete manifests are assembled.

## Actual source/FACE/packed proof

The [FACE-to-raw audit](actual-face-export-validation.json) binds source `6e9f59c9...`, final hidden proof `6649e9c0...`, actual prepared `6ed42644...` and raw `42def075...`. All 183,750 prepared FACE-flagged triangles matched raw float32 positions exactly, with zero unmatched faces/candidates. The [packed audit](actual-packed-export-validation.json) then matches each selected packed triangle back to its proven raw UV0/world-position triangle within the existing position quantization bound.

Maximum observed position error is 0.8452 mm. The conservative single-surface bound is 1.5127 mm, versus 20.0827 mm minimum snow-boundary clearance; even subtracting both surface bounds leaves 17.0573 mm. Full source construction remains in every bake. [Machine-readable summary](summary.json) retains the exact values.

## Reproduction and adoption boundary

Use `scripts/prune-validated-baked.mjs --profile quality|mobile` with the [quality](quality-frozen-profile.json) or [mobile](mobile-frozen-profile.json) explicit frozen profile. The original helper/profile remains unchanged and applies only to the original measured asset. Current candidate paths are `art/build/snow-roof-final-{quality,mobile}-optimized/snow-roof.glb`, each with a sibling receipt.

After the native batch re-exports raw, recheck actual raw/prepared hashes before adoption. If metadata/container bytes changed, refresh actual correspondence/profile verification; do not edit pinned hashes blindly. Chosen complete-package manifests must replace the GLB SHA/byte entry, recompute totalBytes and include optimization provenance. No public asset was overwritten by these helpers. Final browser quality/mobile approval remains pending.
