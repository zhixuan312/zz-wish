# Snow Roof Court — Source18 source and reproduction

Source18 saves the accepted warm-pool picture. All47 source, prepared/raw and decoded-delivery contact groups pass the unchanged 2 mm gap /5 mm penetration limits. The single final batch completed all16 fixed64 maps on M1 Metal with Metal OIDN in340.377seconds. The installed complete package is14,970,553bytes, including the shared116,705-byte native view. Actual app journey/stranger acceptance remains separate; see [the final receipt](../round-1-snow-source18-package.json).

## Frozen source and selection records

All paths below are relative to `art/build/snow-roof-round1/` and remain ignored working artifacts.

| File | SHA-256 |
| --- | --- |
| `source-v18.blend` | `5d3d015e7b01517d2edc237d9740f80c128d1bc4ad32b373fe9eef8566edc904` |
| `source-v18.audit.json` | `5d189abe2f97fe74f0d0333f197013a836e3b0153a3f7e12e49d1743fd31b8fd` |
| `source-v18-hidden-faces-20mm.json` | `09646cbcb166bff8c12296251cc18d2f4d149bcb8dfba1b7514eb7b12c3d9810` |
| `source18-final-picture-choice/source-choice.json` | `bfc65da71e26e9d9ed60a2960e1964a06e7556978050b70c9748af697894327c` |
| `picture-final-warm-pool-native8/preview.json` | `1076ea61fd8ecb70766883b6844ad36d56546f3ac5d5c8a27f470158a9bfbdd3` |
| `picture-final-warm-pool-native8/RoomCandidate_backBay.png` | `74cce11eb8a93e075e4996eb355d09c03b7fb9b7a9792ccca3d17a841197e721` |
| `source18-gauze-offset-cup-proxy-v2.json` | `ff5fe6a3f9296765eea43bb4cc82ed47b47e414a808b62eda5330b5f7df8adb9` |

The selected preview opened immutable Source17 (`2990854d3c9a65bf18879511d865b6e36788f6e727339248d5746b67fb52dd64`) and applied unsaved overrides. The source-choice wrapper later reapplied the same overrides, compared the resulting choice record with that actual preview, audited all 47 groups, and saved Source18 without rendering. The preview metadata therefore correctly identifies Source17 as its input; it is not a render made by reopening Source18. `source-v18-superseded-first-picture.blend` and earlier picture-choice directories are historical alternatives.

## Selected source settings

The actual finite point is 2 W with scene-linear RGB `[1, .43, .13]`, radius 4 mm and engine position `[-1.5, 2.25, -1.3]`. These are authored radiant/source values, not an independently measured candle calibration. Its raised wick/oil cup, east-offset 9 mm cup, three real riser supports, open bottom and 4.5 mm ribs come from the actual runtime v2 proxy. The import has 57 parts / 26,152 triangles including the measured ceiling-cord extension; body suspension top is approximately `[-1.4993, 2.6797, -1.3]`, with the cord continuing to real ceiling construction.

Absorbing red cloth uses reflected diffuse weight **.35**, effective translucent weight **.065**, and normalized shadow-throughput scale **.022**. The actual source shader keeps its original MixShader factor .65 and scales only the translucent branch by .1; the diffuse branch stays unchanged. The red shadow throughput is `[.022, .00130084233384385, .000652419177550622]`. Runtime must read the separate reflection/transmission fields rather than calculate reflection as `1 - .065`. There is no independently powered cloth glow.

Room light is .9 W at engine `[0, 3.2, -3.3]`; doorway light is .6 W. Red/teal paint normal strength is .03. Only the four actual hall-floor material groups receive the 3× diffuse-albedo multiplier; shared paving materials are cloned for hall users, while textures and roughness remain unchanged. Exactly `Main hall lattice paper backing.001` is removed; its real lattice/opening remains. The static resting props and their support construction remain unchanged.

Native AgX / None / gamma1 uses exposure **5.671928 EV**, comprising the existing common `log2(40)` pre-exposure and the selected **+.35 EV** view offset. Preserve source/runtime pre-exposure40 once, and apply the residual .35 view exposure once. Do not multiply scene values by40 again. The reviewed native preview was fixed8 samples at1440×900, Cycles Metal on Apple M1 with OpenImageDenoise; it is picture evidence, not final bake quality.

Reviewed framing is engine eye `[-4.9, 2.35, -2.15]`, look `[1.09794395, 1.2, -1.99293831]`, vertical FOV55. The actual preview pose lives in `picture-final-warm-pool-native8/camera.json` (SHA256 `bf7fa8483bfc3054be738a72a2a5678a0959606d5a8ad05fe86969a54f988f9c`); final runtime camera adoption is a separate descriptor change.

## Reproduce the selected source/save

Run from the repository root with the preserved Source17 and v2 proxy. This invocation uses new ignored outputs because the wrapper refuses to overwrite a source or output directory. It recreates the selected source state; the saved .blend hash above identifies the retained artifact rather than promising byte-deterministic Blender serialization.

```sh
blender --background --python-exit-code 1 \
  --python art/blender/preview_snow_room_candidate.py -- \
  --scene art/build/snow-roof-round1/source-v17.blend \
  --output art/build/snow-roof-round1/source18-replay/source-choice \
  --geometry art/build/snow-roof-round1/source18-gauze-offset-cup-proxy-v2.json \
  --candle-watts 2 --candle-linear-rgb 1 .43 .13 \
  --cloth-transmission .065 --shadow-throughput .022 \
  --eye-z -2.15 --look-x 1.09794395 --look-y 1.2 --look-z -1.99293831 \
  --door-watts .6 --floor-gain 3 --remove-east-paper \
  --save-source art/build/snow-roof-round1/source18-replay/source-v18.blend \
  --approved-picture art/build/snow-roof-round1/picture-final-warm-pool-native8/preview.json
```

For an actual new native8 comparison, omit `--save-source` / `--approved-picture` and choose another fresh `--output`; this uses Cycles Metal/OIDN. Source saving and CPU audits do not run Cycles. Never select CPU Cycles or pass `-t 2`.

## Actual final preparation recipe

The current driver prepares the freshly authored Source18 directly; it does not restore Source15 canonical geometry. Its recorded recipe is `prepared-v18-final/preparation-recipe.json`, SHA256 `a764d2b45db0e3002c79e6ff2abd2c3669f4c4d2f0deb00ea25bb6498c3af5f3`.

```sh
python3 scripts/prepare-snow-priority-atlas.py \
  --source art/build/snow-roof-round1/source-v18.blend \
  --hidden-proof art/build/snow-roof-round1/source-v18-hidden-faces-20mm.json \
  --out art/build/snow-roof-round1/prepared-v18-final \
  --fresh-source --hall-size 1408 --court-size 1328 --refine-underside
```

This historical output path now exists; choose a new output for a replay. Region sizes are altar1024 / hall1408 / court1328 / gate1024. The driver freezes the actual preparation code and source hashes. Actual prepared mapping, standard NORMAL, contact and hidden-face gates have passed. The all16×64 Metal/OIDN command and immutable pins are recorded in `final18-native-input-ledger.json`. Final packaging must pass the explicit Source18 source-blend, source-audit and hidden-proof arguments; the package driver's historical Source15 defaults are not valid for this source.

## Keep the production/reproduction tools

Keep source lineage `snow_roof.py`, `freeze_source_modifiers.py`, `rebase_snow_radiometry.py`, `patch_snow_lantern_transport.py`, and the imported `snow_round1_details.py`, `snow_bronze_maps.py`, `snow_paint_maps.py`, `snow_lightmap_charts.py`. Keep the selected author/save wrapper `preview_snow_room_candidate.py`, actual proxy importer `snow_lantern_transport.py`, `preview.py`, and `bake_export.py`; the actual runtime export chain is `scripts/export-gauze-transport.mjs` plus `scripts/load-gauze-geometry.mjs`.

Keep Blender replay/gates `resting_contacts.py`, `contact_fingerprints.py`, `fixed_view_allocation.py`, `audit_resting_props.py`, `audit_prepared_resting_contacts.py`, `audit_prepared_mapping.py`, `audit_raw_normals.py`, `classify_hidden_tiles.py`, `classify_hidden_tile_faces.py`, `export_face_reference.py`, `priority_lightmap_allocation.py`, `join_tube_lightmap_charts.py`, `refine_underside_lightmap.py`, and `preserve_prepared_geometry.py`.

Keep `scripts/prepare-snow-priority-atlas.py`, `scripts/package-snow-compact-preview.py` and the following .mjs tools: `uv-density-search`, `pack-blender-assets`, `prune-float32-baked`, `audit-float32-prune`, `audit-hidden-export`, `strip-delivery-audit-metadata`, `probe-uv16-budget`, `probe-normal16-budget`, `probe-material-normal-budget`, `audit-snow-preview-precision`, `decode-baked-for-contact-audit`, `assemble-snow-preview`, `gzip-place-models`, `compact-place-manifest`, `attach-place-runtime-assets`, plus their imported library modules. The three probe-named encoders are required final-package dependencies. External glTF tooling is bootstrapped by the packer at `/tmp/one-light-gltf-tools` (`@gltf-transform/cli@4.5.1`); independent replay tools using that path require the same setup.

The 35 completed Snow/general research programs are preserved byte-for-byte under `artifacts/archive/round1-inactive-snow-general/`; their compact receipt is `docs/evidence/full-review/round-1-snow-research-archive.json`. They do not replace the active tools above. Native scenes, EXRs, complete audits and captures remain ignored; commit production code/assets, licenses and compact truthful text evidence. Actual final hashes and measured precision bounds are in the compact receipt linked above. Source/license identity remains in docs/assets.json and source-specific provenance. Actual full-journey status belongs to the final capture/checklist evidence.


## Final bake, package and installed bytes

The immutable native command and inputs are in `final18-native-input-ledger.json`; completion is `final18-native-completion.json`. Native output is `final18-native64/`, with no previous GI reuse. All16 maps use64 fixed samples, Metal bake +Metal OIDN, AUTO threads, adaptive/animated seed off. Ambient maps contain DIRECT+INDIRECT; lantern maps contain INDIRECT only.

```sh
python3 scripts/package-snow-compact-preview.py \
  --source art/build/snow-roof-round1/final18-native64 \
  --out art/build/snow-roof-round1/final18-packaged \
  --source-blend art/build/snow-roof-round1/source-v18.blend \
  --hidden-proof art/build/snow-roof-round1/source-v18-hidden-faces-20mm.json \
  --source-audit art/build/snow-roof-round1/source-v18.audit.json --final
```

Choose fresh output paths for reproduction. `final18-delivery/` copies the resulting runtime package and attaches `docs/licenses/native-agx.json` with `scripts/attach-place-runtime-assets.mjs --native-view`. Installation replaced the complete public Snow folder, retaining exactly21 declared files; the old directory is an ignored backup.

| Installed item | SHA-256 / measured bytes |
| --- | --- |
| Source18 | `5d3d015e7b01517d2edc237d9740f80c128d1bc4ad32b373fe9eef8566edc904` |
| Manifest | `1e90933194200dfd2d67ba2fbe207aba216b50a561e9b1da56060161eb6c5289` |
| Model Zstd | `704940667f50ae25d79488bac138cf83f5c4a14e3fba28163831eefe5c94baf3` /6,104,342B |
| Decoded model | `357cf7e509bad848c3d3c3e67a9adcee726ad445136fa16c95df4ca870e9ff05` /10,411,376B |
| Local payload /manifest /shared view |14,827,000 /26,848 /116,705B |
| Complete scene /budget |14,970,553 /15,000,000B |

Retained physical positions, winding, transforms and runtime anchors remain source-exact. Storage deliberately uses measured SHORT16 normals, bounded UV16 and U8 tint; six architecture normal images are256px, protected scan normals512px. Actual maximum original material-texel error is.2109375, lightmap-base error.0107421875texel, world-normal component error1.978623e−5, and U8 linear tint error.001960779, with no clamped source components. This is an explicit delivery precision policy, not a claim that all attributes/images remain source-exact. All47 decoded contacts pass. Masters and full proof receipts remain ignored and immutable.
