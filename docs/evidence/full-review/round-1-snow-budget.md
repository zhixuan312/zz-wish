# Snow source12 budget probes

These are separate CPU-only delivery studies, not approved replacements. Source12,
its prepared geometry, EXR masters and the reviewed preview remain unchanged.
Only the eight genuine night/lamp maps exist; dusk/day and the full64 Snow batch
remain pending. Exact inputs, scripts, receipt hashes and per-map error bands are
recorded in [round-1-snow-budget.json](round-1-snow-budget.json).

The reviewed package is **15,956,719 bytes**, already 956,719 bytes over the final
15,000,000-byte limit before dusk/day. Its GLB is 10,478,320 bytes; the eight
lightmaps are 4,855,399 bytes; fabric is 391,242 bytes; manifest is 231,758 bytes.
Material images occupy 3,568,762 GLB bytes, including 2,368,885 bytes of normals.

| Separate candidate | GLB bytes | Saving against its own baseline | Current gate |
| --- | ---: | ---: | --- |
| Reviewed BYTE8 normals, bounded UV16 | 9,802,000 | 676,320 | Decoded arrays/materials/47 contacts/anchors pass; optical review pending |
| 61 µm position grid, all contact geometry protected | 10,030,160 | 448,160 | 47 contacts/anchors pass; optical review pending |
| 122 µm position grid, anchor meshes protected | 9,585,500 | 892,820 | No contact or optical PASS claimed |
| Genuine source F32 normals/tints, bounded UV16 | 13,587,076 | 1,467,796 against 15,054,872-byte same-format baseline | Budget-only quality alternative; not BYTE restoration |

The UV candidate preserves the reviewed actual INT8 normal arrays, F32 positions,
colors, index winding, image payloads, physical PBR values, image bindings,
samplers, transforms and runtime metadata. UV storage is explicitly lossy. It
uses a reversible per-primitive affine UV0 decode in `KHR_texture_transform`,
then normalized U16 storage; it does not rearrange charts or islands. Repeating
textures retain their original coordinates after decode. Error calculations
include Float32 vertex conversion and fused/nonfused affine arithmetic.

The maximum accepted material error is **0.062195 image pixel**. The scanned
console is at most **0.003907 pixel** and screen **0.007804 pixel**. Five broad
court primitives remain F32 because their proposed errors are 0.074–0.206 pixel.
All 358,104 candidate vertices associate to genuine original F32 UV data; the
error bound conservatively covers every matching original corner. UV2's measured
maximum error is 0.000007629395 UV units: **0.015625 base lightmap texel at 2K**,
0.007813 at mip1 and 0.003906 at mip2. UV2 was already U16 in the reviewed format,
so most new saving comes from UV0.

The UV candidate's independent actual decoded-contact replay passes all 47 groups
with the original **2 mm gap / 5 mm penetration** limits. Maximum measured gap is
1.241446 mm; maximum penetration is 4.750013 mm. Wick, point-light and incense
metadata remain exact. Actual output is
`art/build/snow-roof-round1/budget12-uv16-reviewed-v7/snow-roof.glb`, SHA256
`949139601db70acb98f0016ef6e498eaeecc4eaca521a2056c7916dfa46419af`.
Its sibling receipt, decoder receipt and contact audit retain the full evidence.

The all-contact position study keeps every resting/mounted prop and actual
support mesh, every wick and every incense mesh exact. It protects 95,105 exported
vertices and moves the others by at most 52.653 µm. The more aggressive anchor-only
study protects 3,964 vertices, restores 348 unsafe/error-bound vertices and moves
others by at most 99.997 µm. Its unchanged physical contact limits still require a
separate actual moved-geometry replay before any use.

ETC1S would save 3,340,330 bytes across all eight existing maps, but does not pass
as a blanket night/lamp quality replacement. Against actual denoised EXR chart
cores, hall-night peak mean relative luminance error rises from 3.3% to 38.4%,
altar-night from 9.3% to 37.4%; more nonzero dark samples become black. The original
night/lamp UASTC maps remain the quality reference. Dusk/day must be measured from
their own real maps; current night/lamp data does not prove their eventual costs
or quality. Official RGBA8 transcodes are numerical controls, not a substitute
for device block-transcode and runtime image review.

Actual `place.png` also leaves E2/E3/E4/E7 open: wall base/weathering has weak
visible contrast, foreground trees retain straight pointed branches and paired
placement, roof snow remains uniform with a dotted eave rhythm, and a white
mound intrudes into the lower-left opening. Source implementation alone does
not close these visual items. No source change was made during these probes.

Reproduction helpers are `export_precision_protection.py`,
`probe-position-grid.mjs`, `probe-uv16-budget.mjs` and
`probe_lightmap_codecs.py`; actual commands and inputs are represented by their
explicit-path receipts under ignored `art/build/snow-roof-round1/budget12-*`.
Nothing was written to live public assets; no Cycles, render or GPU job ran.
