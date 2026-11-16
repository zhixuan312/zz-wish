# Snow Roof source-bound hidden-tile proofs

The canonical proofs are the original frozen proof and the final visually accepted source proof. Rejected pancake and first connected-bank studies are historical artifacts under ignored `art/build/studies`; they are not current inputs.

| Proof | Source | SHA256 |
|---|---|---|
| Original `snow-roof-hidden-tiles.json` | `art/build/snow-roof-stable.blend` | `c64adb44283c4cd766921392da95b113767ddceab4dca44192e350caf5aeeae2` |
| Final `snow-roof-final-hidden-tiles.json` | `art/build/snow-roof-stair-banks-grain.blend` | `6649e9c080c3b152c743fcc88ad5ebf95690ff8f678742cc5dd84be79ce2e014` |

The final accepted blend SHA is `6e9f59c93565e08a690eaafbc756967ba39e0f4d8ad0094e4520265948360af8`. Its two connected stair-edge banks replace six former snow objects. All other 3,080 meshes, court/gate geometry, shared materials and lighting remain unchanged. The last adjustment changes only the banks' mesh texture-space Z size; all 3,082 final mesh geometry records remain byte-identical to the structurally accepted joined source.

`snow-roof-final-proof-validation.json` records the fresh classification, exact original/final selection equality, and source geometry/coordinate audit chain. Every selected object, connected component, polygon range, clearance, bound, area and representative camera check matches the original proof: 5,577 components / 91,875 source polygons / 183,750 expected triangulated faces, with all 44,616 camera rays blocked by snow. Minimum boundary clearance is 20.08 mm.

The classifier accepts only whole connected tile components enclosed by an opaque, explicitly closed roof-snow volume. Vertex, edge-midpoint and face-center samples must be at least 20 mm from its boundary, and a component BVH must have no snow-boundary overlap. Full source construction remains in all bake occluders. The baker enforces the proof's actual source blend SHA; no edited hash overrides are permitted.

Regenerate into an ignored candidate file for comparison, without rendering or baking:

```sh
blender -b --python-exit-code 1 --python art/blender/classify_hidden_tiles.py -- \
  --source-blend art/build/snow-roof-stair-banks-grain.blend \
  --output art/build/snow-roof-final-hidden-tiles.regenerated.json
```

The working final bake settings are Cycles Metal, OpenImageDenoise Metal, 64 samples, hall/court 4096 and gate 2048. The source, UV gate and visual approval precede full baking. Final export profiles below are based on actual corrected prepared/raw and packed assets, with genuine correspondence and retained triangle/image validation. They remain staging candidates subject to the post-batch hash guard and browser review. The original measured profile remains intact for its original frozen asset only.

## Actual final export profiles and staging candidates

`export_hidden_reference.py` and `scripts/audit-hidden-export.mjs` verified the actual prepared FACE flags against raw GLB float32 triangles. `snow-roof-final-face-export-validation.json` records the corrected pre-bake snapshot: prepared `6ed42644...`, raw `42def075...`, authored source `6e9f59c9...`, with all 183,750 proven triangles matched and 3,292 unrelated UV-marker triangles preserved. End-of-batch container changes require a fresh actual-hash check.

`snow-roof-final-packed-export-validation.json` additionally matches every selected packed triangle to its proven raw UV0/world-position triangle within the existing position quantization bound. Maximum observed error is 0.8452 mm versus 20.08 mm minimum snow clearance. Material deduplication merged roof names into the actual `Side hall roof tiles` alias; the profiles derive this alias from actual geometry correspondence rather than assuming raw material names.

The explicit `snow-roof-final-quality-export-profile.json` and `snow-roof-final-mobile-export-profile.json` were generated from those actual assets. `scripts/prune-validated-baked.mjs` accepts only these named profiles and checks their genuine validation receipt, all frozen input hashes, retained triangle attributes/winding, image bytes and node state. It performs no new quantization or normal filtering. `snow-roof-final-optimization-execution.json` records successful separate staging executions:

| Variant | Optimized GLB bytes | Vertices | Triangles |
|---|---:|---:|---:|
| Quality | 34,821,408 | 648,776 | 466,874 |
| Mobile materials | 13,449,088 | 648,776 | 466,874 |

```sh
node scripts/prune-validated-baked.mjs --profile quality \
  --input art/build/snow-roof-final-quality/snow-roof.glb \
  --output art/build/snow-roof-final-quality-optimized/snow-roof.glb
node scripts/prune-validated-baked.mjs --profile mobile \
  --input art/build/snow-roof-final-mobile/snow-roof.glb \
  --output art/build/snow-roof-final-mobile-optimized/snow-roof.glb
```

Each output has a sibling receipt. Existing outputs are refused. Current files are verified export-only candidates; complete-package manifest hashes/byte totals and runtime quality/mobile review remain separate. Full source geometry and bake occluders are unchanged. The original helper/profile and c64 proof remain byte-identical to their historical receipts.

Independent optimized cross-profile data and index/winding equality are recorded in `snow-roof-final-cross-profile-geometry.json`; complete evidence and executed receipts are under `docs/evidence/blender-pilot/final-export`. Final helper: `scripts/prune-validated-baked.mjs --profile quality|mobile`. A native batch-end raw/container change requires fresh actual input verification before optimized adoption.
