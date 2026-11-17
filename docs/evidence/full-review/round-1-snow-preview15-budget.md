The actual Source15 LOW8 preview is ready for app review in
`art/build/snow-roof-round1/preview15-quality-control-gzip`. It is **19,925,634
complete bytes**, so it **fails** the 15,000,000-byte budget by 4,925,634 bytes.
This is an explicit diagnostic package. Full64 and public installation remain
unapproved; no source, master or GI pixel was changed to meet a byte target.

The fresh native batch completed all sixteen maps at 8 samples in 304.635 s on
Apple M1 Metal, GPU OpenImageDenoise and AUTO threads. Hall/court use 2048 atlases;
altar/gate use 1024. All four looks are real new bakes from Source15. The quality
reference retains all sixteen UASTC maps, totaling 12,875,015 bytes.

| Delivered component | Actual bytes |
| --- | ---: |
| Sixteen UASTC lightmaps | 12,875,015 |
| Lossless gzip wrapper around the audited model | 6,405,354 |
| Three photographed visitor-fabric maps | 391,242 |
| Manifest | 254,023 |
| Complete package | **19,925,634** |

The decoded model is 10,471,684 bytes. Physical positions remain genuine original
FLOAT32. Exactly 11,216 fully snow-enclosed, FACE-certified triangles are removed;
319,560 remain. Its declared delivery precision is SHORT16 normals, U8 colors and
affine UV16 where the actual original source-image error remains below one
quarter texel. Four broad primitives retain F32 UV0. Measured maxima are
0.21094 original material texel, 0.015625 lightmap base texel and 0.00001979 world
normal component. No source color component was clamped. Only six architectural
normal images become 256 px; table/screen normals remain 512 px and bronze normals
remain 256 px with their previous payloads.

Independent decoded comparison verifies every retained triangle record and cyclic
winding under those explicit precision policies. The final decoded physical
geometry passes all 47 source-owned resting/mounted groups with the literal
2 mm gap/5 mm penetration limits. Wick/incense anchors, actual fixture watts and
colors, visitor basis and its measured radius remain exact. The gzip wrapper
round-trips to the actual audited GLB. Only the three previously approved
audit-only scene keys are omitted, with full values/hashes preserved in ignored
receipts. The JSON companion binds actual source, post-batch, decoded and package
files by SHA256.

The separate CPU codec experiments have **not** changed that reference:

| Experiment | Measured byte saving | Numerical limitation |
| --- | ---: | --- |
| ETC1S log-RGB, eight dusk/day maps | 5,291,984 | Hall-dusk peak mean relative error 43.6%; altar dusk/day 42.5–42.8% |
| UASTC RDO4, eight dusk/day maps | 298,486 | Too little saving; dark errors increase |
| ETC1S chromaticity + log-alpha, hall-dusk/altar-day only | 689,425 | Peak error 37.1%/57.2%; hall dark error 104.7% |

These errors are from official RGBA8 transcodes against actual denoised EXRs,
using covered chart interiors and radiance-averaged mips. Relative dark error uses
source luminance above 0.0001. The hall-dusk peak band has only three base texels;
its absolute error and sample count are retained in the numerical receipt.
Device block transcodes, interpolation and visual perception are separate gates.
No experiment receives an optical PASS from these statistics. Night/lamp maps,
all original EXRs and the quality-control package remain unchanged.

RDO4 and chromaticity/log-alpha are not sufficient safe solutions to the budget.
Manifest minification alone saves only 51,200 bytes. Finer triangle-level proof of
buried roof surfaces is a proposed next investigation, with source and bake
occluders retained; it has not been run or adopted. Any further lossy position,
codec or atlas-allocation change needs genuine new correspondence/contact proofs
and actual app comparison. All owned jobs are terminal; no browser/GPU job or
public write was performed for these delivery studies.
