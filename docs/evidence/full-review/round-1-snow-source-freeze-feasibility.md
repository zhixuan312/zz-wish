Freezing the evaluated Source15 construction is feasible. The isolated prototype
removes all 252 construction modifiers while preserving all 1,872 static meshes'
actual evaluated positions, topology, UVMap, SourceLightmap, SurfaceTint and
local/world corner normals **byte for byte**, both immediately and after
save/reopen. Maximum position, material-UV and world-normal changes are all zero.

The prototype is
`art/build/snow-roof-round1/source16-freeze-feasibility-v5/source-frozen.blend`,
SHA256 `402d192bcd62e49f8ce827ef85c1c10b65164332abbd7ac86dcc8f1e5f4def55`.
It preserves Source15's physical design and old visitor light; it does **not**
implement or approve the new C6/B4 lantern placement, filtered transport or power.
Original Source15, existing GI, runtime and public assets are unchanged.

The helper captures one actual evaluated snapshot before changing any object.
It proves persistent mesh geometry/indexing matches, explicitly copies that
first snapshot's UV/color streams, stores literal `FLOAT_VECTOR` / `CORNER`
`custom_normal` directions, then removes the modifiers. It does not reauthor
tint, UV charts or material graphs. This avoids a second Bevel evaluation's UV
rounding. It makes no claim that this new captured snapshot is the historical
2K certificate's exact UV stream, and uses no historical transitive certificate.

All used material graphs, actual image identities and packed bytes, lights,
world/exposure, object transforms/properties, registry and runtime anchor fields
remain exact. Saving at a deeper location rebases 27 relative image paths to
the same resolved files. One unused default `Material` orphan outside the scene
is not preserved; no scene material slot loses a material.

The fresh CPU preparation diagnostic executes the production free-normal
capture, join, triangulation, restoration and round-8 standard NORMAL exporter.
Its independent checks pass at the existing limits:

| Actual measurement | Result |
| --- | ---: |
| Fresh source → joined/triangulated UV0 error | 0 |
| Fresh source → joined/triangulated tint error | 0 |
| Fresh source → joined/triangulated position error | 0.533 µm, limit 5 µm |
| Fresh source → joined/triangulated world-normal error | 1.19209e−7, limit 1e−6 |
| Actual raw standard NORMAL error | 1.78814e−7, limit 1e−6 |
| One-to-one raw triangle matches | 330,776, including 16 coincident groups |
| Source / prepared / raw contact groups | 47 / 47 / 47 pass |
| Loose-prop inventory | 234 candidates, none unregistered |
| Source +3 mm / −6 mm challenge | Both rejected |
| Existing contact-guard challenges | All 19 rejected |

Contact limits remain literally 2 mm gap and 5 mm penetration. Prepared maximum
gap is 1.241446 mm and maximum penetration is 4.750013 mm. Actual wick, incense,
smoke and light anchors pass the existing correspondence checks.

This is intentionally **not a bake-ready preparation**. The diagnostic Lightmap
layer contains unallocated source-chart coordinates only to bind the actual
contact geometry. It does not prove unique UV coverage, overlap, chart cores or
current-camera allocation. The 16 atlas-bound normal-guard challenges remain
pending actual preparation of the redesigned source. No GPU, Cycles render or
bake, KTX/Meshopt encode, public replacement or full64 job occurred.

Reproduce the source freeze in a new ignored output directory:

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python art/blender/freeze_source_modifiers.py -- \
  --source art/build/snow-roof-round1/source-v15.blend \
  --output art/build/snow-roof-round1/NEW-freeze/source-frozen.blend \
  --report art/build/snow-roof-round1/NEW-freeze/freeze.json
```

`art/blender/probe_frozen_source_mapping.py` reproduces the separately labeled
join/triangulate diagnostic. The [compact JSON handoff](round-1-snow-source-freeze-feasibility.json)
binds all actual source/prepared/raw/receipt/script hashes, all 47 per-group
measurements, the original failed probe history and remaining gates. Large
Blender files and full per-object arrays remain under ignored `art/build`.
