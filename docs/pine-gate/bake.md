# Pine Gate Steps bake

The uphill path, forest, cypress gate and hewn stone niche are original architecture for a fictional mountain temple. The only external surface inputs are the CC0 `stone_pavers`, `rock_pitted_mossy`, `weathered_planks` and `grey_roof_tiles` maps listed in [the asset register](../assets.json).

The static dish support is at world metres `[-1.8, 5.0, .9]`. Its height is read back from the evaluated shelf triangles. The runtime dish adds an 8 mm seat; the wax, wick, pool, runnels, flame and smoke belong to the visitor lamp. The lamp atlas supplies indirect bounce from a reference source at `[-1.8, 5.076, .9]`. Live direct light and its local shadows follow the moving wick. Camera pre-exposure is 6 and is applied once; the source point is an authored radiant scale without photometric calibration.

## Reproduce the final delivery

Use Blender 5.3 and the pinned CLI dependencies described by the [bake pipeline](../../art/blender/README.md). Use a fresh ignored work directory and take the shared GPU lock before any Blender command. The following commands use `working` for a directory under `art/build/`. `ONE_LIGHT_GLTF_TOOLS` names the directory holding the pinned `watlas@1.0.1` and `@gltf-transform/cli@4.5.1` dependencies.

```sh
blender -b --python-exit-code 1 --python art/blender/pine_gate.py -- \
  --output "$working/pine-gate.blend"
blender -b "$working/pine-gate.blend" --python-exit-code 1 \
  --python art/blender/bake_export.py -- \
  --out "$working/preflight" --skip-bake --samples 8 --device METAL --oidn-device METAL
blender -b --python-exit-code 1 --python art/blender/audit_prepared_mapping.py -- \
  --source "$working/pine-gate.blend" --prepared "$working/preflight/pine-gate-prepared.blend" \
  --manifest "$working/preflight/manifest.json" --out "$working/mapping.json"
blender -b --python-exit-code 1 --python art/blender/audit_prepared_resting_contacts.py -- \
  --source-audit "$working/pine-gate.audit.json" --prepared "$working/preflight/pine-gate-prepared.blend" \
  --raw "$working/preflight/pine-gate.raw.glb" --out "$working/prepared-contact.json"
blender -b "$working/preflight/pine-gate-prepared.blend" --python-exit-code 1 \
  --python art/blender/bake_export.py -- \
  --out "$working/final64" --resume --samples 64 --device METAL --oidn-device METAL \
  --prepared-preview-audit "$working/mapping.json" --resting-contact-audit "$working/prepared-contact.json"
node scripts/pack-blender-assets.mjs \
  --source "$working/final64" --out "$working/delivery" --tools "$ONE_LIGHT_GLTF_TOOLS" \
  --material-profile mobile --position-format float32 --normal-format float32 --max-bytes 15000000
node scripts/attach-place-runtime-assets.mjs \
  --out "$working/delivery" --native-view docs/licenses/native-agx.json
node scripts/decode-baked-for-contact-audit.mjs \
  --input "$working/delivery/pine-gate.glb" --output "$working/decoded-pine-gate.glb" \
  --receipt "$working/decoded-streams.json" --tools "$ONE_LIGHT_GLTF_TOOLS"
blender -b --python-exit-code 1 --python art/blender/audit_prepared_resting_contacts.py -- \
  --source-audit "$working/pine-gate.audit.json" --prepared "$working/preflight/pine-gate-prepared.blend" \
  --raw "$working/decoded-pine-gate.glb" --out "$working/decoded-contact.json"
```

For the review candidate, use a distinct bake output and eight samples, then pack the four looks. The final runtime asset attacher requires all twelve maps to carry the fixed 64-sample Metal Cycles and Metal OpenImageDenoise receipts.

The source tests literal 2 mm gap and 5 mm penetration bounds, including translated 3 mm and 6 mm challenge cases. The downstream replay measures actual prepared, raw and decoded delivery triangles. The UV mapping proof checks world positions, material UVs, world corner normals and tint before the bake.
