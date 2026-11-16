# Snow contact sampling candidate

This records the source-bound geometry and sampling repair candidate. It does not claim final browser/performance approval or complete seam removal. The authoring, lights and original Cycles transport masters remain unchanged.

The exact native Metal8 held NIGHT crop has a smooth bank/ground join. In the matching web view, genuine FLOAT32 positions reduce some jaggedness but retain a dark fringe. Nearest/base-level sampling retains hard dark segments; surface IDs show continuous coverage. White baked diffuse retains the line; unlit original albedo does not. At four of five selected dark pixels, the exact visible hit samples a native texel centre geometrically hidden under the other opaque snow surface. Actual support heights at all ten dark/lit sample rays agree between source BVH and prepared ground within 0.12 micrometres; changed ground diagonals do not explain this particular fringe.

The first normal-sampler desktop/phone comparison substantially reduces the dark ring after hidden-centre extension. A lower-contrast grey/scalloped seam remains. Phone walk3 crops most outer bases, so that frame cannot verify complete perimeter removal. Remaining finite-footprint/log-filter/codec and uncertified near-contact effects are not claimed solved.

## Immutable input chain

| Input | SHA256 |
|---|---|
| Authored source | `6e9f59c93565e08a690eaafbc756967ba39e0f4d8ad0094e4520265948360af8` |
| Prepared bake geometry | `6ed42644cd3a6c1026b079740957280df0274e9e9a0eaf5f8d3da514725079c1` |
| Actual final raw GLB | `0deec9fd71d4c49e666e5b091f15af3067efbcdb7e3c350bcb85a2bf7f980dea` |
| Final hidden-roof proof | `6649e9c080c3b152c743fcc88ad5ebf95690ff8f678742cc5dd84be79ce2e014` |
| Genuine F32 unpruned diagnostic | `e41a50e8cd5935d69f254514c7cac3c15fa1b1f640f9c4f0e8f351f220906217` |
| Export-only pruned F32 candidate | `9e3d5aa37878af0e2eca8d409b2f511916e488aa7b523dbd26c8ec8114022fdc` |

The F32 GLB is derived from original raw/pre-Meshopt FLOAT32 positions, never decoded SHORT positions cast to float. The new explicit profile is `art/blender/proofs/snow-roof-final-float32-export-profile.json`; the original position16 profiles stay intact.

| Geometry | Bytes | Vertices | Triangles |
|---|---:|---:|---:|
| Unpruned F32 | 20,229,632 | 956,291 | 650,624 |
| F32 export-only candidate | 15,904,988 | 648,780 | 466,874 |

Exact actual prepared FACE triangle multisets authorize removal of 183,750 fully snow-enclosed roof triangles. The export copy loses 198,050 unused vertices and 109,461 additional exact duplicate vertices. All retained POSITION/NORMAL/UV0/UV1/COLOR0/COLOR1 bytes and cyclic winding are verified after codec decoding; authored node transforms, complete material definitions and all embedded image payloads remain exact. No new quantization, normal filter or image conversion runs. Blender source/bake occluders remain intact. Independent geometry proof: `float32-independent-geometry-proof.json`.

Reproduce into new staging files, with all pinned sources present:

```sh
node scripts/prune-float32-baked.mjs \
  --input art/build/snow-roof-float32-position-diagnostic/snow-roof.glb \
  --output art/build/NEW-float32-copy/snow-roof.glb \
  --profile art/blender/proofs/snow-roof-final-float32-export-profile.json
node scripts/audit-float32-prune.mjs \
  --input art/build/snow-roof-float32-position-diagnostic/snow-roof.glb \
  --output art/build/NEW-float32-copy/snow-roof.glb \
  --profile art/blender/proofs/snow-roof-final-float32-export-profile.json \
  --report art/build/NEW-float32-copy/independent-proof.json
```

The executed profile reproduction yielded the identical `9e3d5aa3...` GLB hash. The helper refuses existing outputs and input drift. `--profile-out` is the initial measurement mode; it still runs fresh actual FACE/F32/decoded proofs before writing a new profile.

## Contact permissions

The copied original metadata/masks here preserve the actual hashes consumed by padding. `hidden=false` means **not certified hidden**, and is not a donor permission. The 74,950 bounded centre classifications produce 9,798 certified recipients: 8,098 ground points strictly inside watertight bank volumes and 1,700 bank top points below the continuous opaque ground. Tests require 20 micrometres of positive geometric clearance and nearest-surface margin. Bank volume classification requires three agreeing parity rays. Near-contact, UV ambiguity and parity disagreement never authorize a recipient or donor; radiance is never consulted.

The donor proof separately certifies 35,917 points. It requires positive ground clearance for bank donors, proven outside-bank status for ground donors, and excludes stair/terrace-covered or near-surface points. Every affected chart is checked against all its prepared polygons for a unique original snow owner. Same-chart, same-owner nearest donors within eight Euclidean base pixels reach 2,098 court and 682 hall recipients. The remaining 7,018 recipients stay unchanged. These are centre certificates for the exact authored F32 geometry, not claims that an entire filtered texel footprint is hidden.

Portable recipes are `art/blender/classify_snow_contact.py` and `art/blender/certify_snow_contact_donors.py`. Their fresh outputs reproduce the full original 26 MB certificate JSON byte-for-byte and every decoded recipient/donor NPZ array byte-for-byte. NPZ ZIP timestamps and recipe metadata legitimately differ. `portable-reproduction-proof.json` records that comparison. The full certificate JSON is reproducible under ignored art/build rather than duplicated here; the compact source-bound masks and exact executed recipe snapshots are retained.

```sh
blender --background --python-exit-code 1 --python art/blender/classify_snow_contact.py -- \
  --out art/build/NEW-contact-recipients
blender --background --python-exit-code 1 --python art/blender/certify_snow_contact_donors.py -- \
  --classification-dir art/build/NEW-contact-recipients --out art/build/NEW-contact-donors
```

The derivative maps use nearest valid donor RGB in scene-linear radiance, with no re-OIDN/new transport. Original masters remain immutable. Unassigned, uncertified and visible base RGBA samples remain bit-exact. Linear mips are regenerated, then re-encoded; lossy KTX neighborhoods are explicitly not claimed bit-exact. `art/blender/audit_contact_padding.py` independently reconstructs assignments and compares actual source/derived EXRs, ownership, original master hashes and untouched maps. The actual production eight-map proof also passed and is retained as `eight-map-independent-padding-proof.json`: each court look changes exactly 2,098 certified recipients and each hall look 682; every other linear RGBA/alpha bit, every original raw/denoised master and all four gate map bytes stay exact. This does not claim lossy KTX neighborhoods are bit-exact. Final package/browser/performance approval remains separate.
