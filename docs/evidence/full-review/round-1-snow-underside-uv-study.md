The bounded UV-only packing study finds a plausible next layout at hall 1408,
court 1328, altar/gate 1024. It preserves the original court snow allocation.
This is a proposal for fresh strict preparation and LOW8 review; it has no new
GI, final package size, public installation or full64 approval.

| Copied packing input | Floor | Columns | Beams | Footprint route |
| --- | ---: | ---: | ---: | ---: |
| Hall 1408, underside reduction only | 6.64 cm | 7.18 cm | 7.15 cm | — |
| Hall 1376, underside reduction only | 7.32 cm | 7.92 cm | 7.88 cm | — |
| Hall 1408, rebalanced | **6.85 cm** | **6.90 cm** | **6.86 cm** | — |
| Court 1312, original allocation | — | — | — | 11.17 cm |
| Court 1328, original allocation | — | — | — | **10.82 cm** |
| Court 1344, original allocation | — | — | — | 10.25 cm |

These are projections of the existing measured first-hit surface Jacobians
through the actual reproduced packed density, not an actual new prepared-camera
audit. Every listed atlas fits one real atlas with the same eight-pixel gutters.
Full per-corner overlap, coverage, current-camera, contact and normal checks
remain required after copying the UV1 results into a new prepared candidate.

The hall change affects only the UV2 allocation of 181 downward-facing paver
caps, 2,164 triangles and 69.10 square metres of actual underside surface. Each
cap retains its original, real body-edge connection, unique chart area and
winding. Its perpendicular UV depth becomes 5% of the old depth. Positions,
indices, source references and ownership arrays are exact. The relative linear
allocation of columns and beams then rises by 7.5%, using spare density on the
already denser floor to bring all three critical groups under 7 cm per texel.
Physical floor and support geometry, material UV0, normals, tint and contacts
are not authored again. Hall chart count remains 2,392.

A separate monotonic outer-snow study retained the inner ±13 m allocation and
all Z allocation, but reduced density on remote blank snow. Its court 1280 and
1296 results still miss the 11 cm route target, at 12.14 and 11.52 cm. That study
is rejected; the proposed court 1328 uses the original allocation and 2,002 charts.

Scaling the existing actual UASTC bytes by atlas pixel count, plus the measured
lossless Zstd model container, estimates **15,124,692 complete bytes**. This is
still about 125 KB over budget. It is not an encoded result: new GI entropy and
the changed UV1 model-container size can differ. A separately approved remaining
budget lever and the actual fresh all-16 LOW8 package are still needed.

The [JSON evidence](round-1-snow-underside-uv-study.json) binds all inputs,
outputs, density reports and exact script hashes. The reusable copied-input
helper is `art/blender/refine_underside_lightmap.py`. No source blend, accepted
prepared file, reviewed package or EXR master was changed.
