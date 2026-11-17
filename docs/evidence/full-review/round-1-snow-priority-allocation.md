The Source15 priority atlas candidate preserves the accepted physical scene and
material coordinates while reducing hall/court lightmaps from 2048 to 1536.
Altar/gate remain 1024. The complete 16-map LOW8 Metal bake finished successfully
in 225.414 seconds under ledger `4ec58ed0…`, using Metal and Metal OIDN with AUTO
threads. All 47 frozen inputs stayed unchanged; GPU ownership was released.
No full64, public install or budget acceptance is implied.
The JSON companion records actual paths and complete SHA256 bindings.

The useful improvement came from chart construction, not a smaller uniform
shadow field. Real cap polygons now attach to one matching boundary edge of their
body strip, with unique cap area outside the body and the remaining circumference
cut. The same construction works for qualifying tubes and extrusions. Unsupported
or numerically unstable nets retain their original separate charts. Actual
Float32 triangle area/winding, complete triangle transfer, chart overlap and
same-chart world-position guards stay intact. Earlier failed transfer/overlap
studies are preserved under ignored build paths and are not accepted inputs.

Hall chart count falls from the reviewed 3,897 to 2,392; court falls from 3,687 to
2,002. Eight-pixel gutters remain. The allocator gives critical hall surfaces
four times their original linear chart scale, reduces noncritical acreage and
uses a strictly monotonic X/Z warp for the continuous snowfield. The high-density
Z interval is `[-11,45]`, covering the footprint route and sidewall snow bands.
No source geometry, normal, UVMap, tint, material, light or anchor is authored again.

| Actual held view/surface | Median worst-axis pitch |
| --- | ---: |
| Desktop burning hall floor | 5.17 cm/texel |
| Desktop burning columns | 5.60 cm/texel |
| Desktop burning beams/brackets | 5.57 cm/texel |
| Current phone burning floor | 5.18 cm/texel |
| Current phone burning columns | 5.60 cm/texel |
| Current phone burning beams/brackets | 5.57 cm/texel |
| Desktop/phone footprint route | 7.20 cm/texel |
| Facade sidewall snow band | 11.96 cm/texel |
| Altar floor | about 2.5 cm/texel, unchanged |

These are actual local world/UV Jacobian measurements at coarse first-hit camera
samples. Both current phone poses supplied by root are included: burning
`[-3.8,2.3,2.0] → [-1.8,2.9,-2.1]`, 75°; far
`[-3.83,2.3,2.0] → [-1.83,2.9,-2.1]`, 76°. The postbatch z2.0 refresh
again has complete coarse chart coverage; median phone floor/column/beam pitch
is 5.18/5.60/5.57 cm per texel. All sampled current-camera hits have
represented charts and no certified-hidden visible hits. Background surfaces
deliberately have lower density; hall triangle area containing its own native
texel center is 65.5%, so this is **not** a blanket whole-scene density or visual
PASS. Actual LOW8 app comparison still decides whether that allocation is sound.

The finer closed-snow proof adds only 1,700 triangles to the previous 11,216.
It checks actual closed/outward/opaque snow surfaces, interior tests and complete
triangle/boundary clearance with a 20 mm certificate plus arithmetic allowance.
All source and bake occluders remain. The exact FACE/raw reference authorizes
12,916 hidden triangles in total; 156 unproven marker triangles remain. The
potential export after that proven removal has 317,860 triangles. This small
geometry saving alone cannot meet the package budget.

The canonical candidate uses the actual accepted prepared mesh data, avoiding
another construction-modifier evaluation. Independent actual raw comparison
verifies all 330,776 pre-prune triangle POSITION/NORMAL/UV0/tint/optional attribute
bytes and cyclic winding, material/image definitions, world transforms and live
anchors against the original 2K raw. Only Lightmap/chart IDs and the independently
certified hidden mask change. All 47 actual prepared/raw contact groups pass the
literal 2 mm gap/5 mm penetration guards. The 19 contact and 16 normal guard
challenges pass. Independent standard raw NORMAL comparison passes at the
unchanged 1e−6 limit, maximum 1.78814e−7; no custom normal stream is exported.

There is a deliberately explicit source-certification limitation. The original
source→2K mapping certificate `a431b30f…` passed the unchanged 1e−6 guard and binds
the immutable source `26ca35d8…` and full evaluated reference `f2d186fb…`. Fresh
Bevel evaluation now differs at 16 timber UV corners by one Float32 ULP,
1.90735e−6. The identical original 2K inputs also fail that fresh replay. Both
failures remain preserved; neither tolerance nor result was changed.

The accepted proof is therefore scoped and transitive: the original passing
certificate and complete evaluated reference arrays are rebound to the candidate
through exact non-lightmap field hashes and actual decoded raw equality. All
1,872 original source-owner UV0 streams are reconstructed through original loop
provenance. For 1,620 unmodified owners they additionally match raw UV0 hashes in
the immutable source blend directly. For the remaining 252 modified owners, no
separate independently stored original evaluated UV0 fingerprint exists. Their
trust link is the original accepted certificate plus its sealed whole-region
UVMap hashes; no missing hash is invented. All 1,872 original frozen world-normal
arrays, totaling 662,708 original loops, independently match their recorded hashes.
The material-probe GLB is not a complete applied-modifier geometry snapshot and
is not used to disguise that limitation.

The full transitive report is `mapping-transitive.json` (`438f4500…`). A compact
11,181-byte bake binding, `83ae1798…`, retains required exact source/receiver/UV/
normal identities, the fresh-failure disclosure and the full measured report's
path/hash. It avoids copying 1,872 audit rows into the delivered scene/manifest.
Both are immutable native inputs; the compact binding passes all 16 real normal
guard challenges. Original full evidence is unchanged.

The preparation recipe is reusable tracked code:

```sh
python3 scripts/prepare-snow-priority-atlas.py \
  --source art/build/snow-roof-round1/source-v15.blend \
  --canonical-reference art/build/snow-roof-round1/postbatch-preview15/snow-roof-prepared.blend \
  --hidden-proof art/build/snow-roof-round1/source-v15-hidden-faces-refined-20mm.json \
  --out art/build/snow-roof-round1/reproduce-priority-atlas
```

The driver snapshots and fingerprints its actual baker/packer/support code,
applies explicit UV-only patches privately, prepares the layout, restores the
canonical mesh data and exports without baking. It never edits shared code or
live assets. The actual study used the frozen `9bceb849…` baker basis; pass
`--baker art/build/snow-roof-round1/baker-1536-snapshot/art/blender/bake_export.py`
to select that preserved basis explicitly. `--snapshot-only` writes the exact
recipe without running Blender. Its tracked density-search module independently
reproduces every actual final hall packed coordinate/reference/chart/index value
(`c3656061…`). The source/reference datasets intentionally remain ignored build
artifacts with complete hashes; all reconstruction helpers are reviewable source.

The LOW8 batch produced all sixteen new night/dusk/day/lamp maps without reusing
previous GI pixels. Actual postbatch geometry/UV fingerprints match the prebatch
inputs; complete BIN and non-scene JSON data match, with only new proof extras.
The decoded 317,860-triangle delivery candidate passes all 47 contacts and anchor
checks under declared UV16/NORMAL16/U8 precision; positions remain genuine F32.

The actual all-UASTC maps, declared delivery precision, lossless model gzip,
compact manifest and 391,242-byte fabric total **16,921,440 bytes**, failing the
15,000,000-byte gate by1,921,440. The manifest is `e6381e00…`; source and masters
remain unchanged. Full64 remains unapproved. Separate raw-format measurements
are recorded in [the codec study](round-1-snow-priority-codecs.md).
