# Pine Gate Steps bake

The uphill path, forest, cypress gate and hewn stone niche are original architecture for a fictional mountain temple. The only external surface inputs are the CC0 `stone_pavers`, `rock_pitted_mossy`, `weathered_planks` and `grey_roof_tiles` maps listed in [the asset register](../assets.json).

The static dish support is at world metres `[-1.8, 5.0, .9]`. Its height is read back from the evaluated shelf triangles. The visitor lamp owns the 8 mm dish seat, wax, wick, pool, runnels, flame and smoke. The lamp atlas supplies indirect bounce from a reference source at `[-1.8, 5.076, .9]` with an authored power of 0.20 W. Live direct light and its local shadows follow the moving wick. The bake applies a camera pre-exposure of 6 once. The source point uses an authored radiant scale without photometric calibration.

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
  --material-profile mobile --screen-base-pattern pine-niche-granite-gray --screen-base-size 1024 \
  --position-format float32 --normal-format float32 --max-bytes 15000000
node scripts/attach-place-runtime-assets.mjs \
  --out "$working/delivery" --native-view docs/licenses/native-agx.json
node scripts/decode-baked-for-contact-audit.mjs \
  --input "$working/delivery/pine-gate.glb" --output "$working/decoded-pine-gate.glb" \
  --receipt "$working/decoded-streams.json" --tools "$ONE_LIGHT_GLTF_TOOLS"
blender -b --python-exit-code 1 --python art/blender/audit_prepared_resting_contacts.py -- \
  --source-audit "$working/pine-gate.audit.json" --prepared "$working/preflight/pine-gate-prepared.blend" \
  --raw "$working/decoded-pine-gate.glb" --out "$working/decoded-contact.json"
```

For the review candidate, use a distinct bake output and eight samples, then pack the four looks with `--preview`. The final runtime asset attacher requires all twelve maps to carry the fixed 64-sample Metal Cycles and Metal OpenImageDenoise receipts.

The source tests literal 2 mm gap and 5 mm penetration bounds, including translated 3 mm and 6 mm challenge cases. The downstream replay measures actual prepared, raw and decoded delivery triangles. The UV mapping proof checks world positions, material UVs, world corner normals and tint before the bake.

## Eight-sample candidate

The first complete candidate uses a 1536² approach atlas, a 1024² gate atlas and a 512² niche atlas. All regions retain eight-pixel chart gutters and show complete sampled coverage across nine authored desktop and phone reference cameras. The larger approach atlas fits 2,842 charts in one texture. Authored terrain triangles preserve the same supporting planes after preparation and export.

Source `02077883d2bce1c45fc38b4a638c213042fe727090ea3ea2103321486d113a60` produced twelve fixed eight-sample maps in 90.649 seconds on the Apple M1 GPU with Metal OpenImageDenoise. The source, prepared and raw export contact audits passed all six groups. Prepared and raw measurements reached a maximum 0.003815 mm gap and 0.639677 mm penetration. The prepared UV0, tint and world-corner-normal mapping proof passed.

The candidate uses 9,476,158 on-disk bytes across the manifest, GLB and twelve KTX2 maps. Manifest SHA-256 is `702521039ab303ed6814fef6d9d9cc96aaac107bb936dd30d19bac9190edb34d`. It is a preview pending app review. Final delivery also counts the already-shared native view lookup.

The revised candidate lifts cool sky fill and directs soft moonlight toward the stairs. Warm timber light remains near the gate. Crossed, alpha-masked needle sprays use an original packed RGBA atlas, and the broken stone curb carries local moss shading. The close stone uses a continuous material UV, reduced normal strength, deeper mortar and an irregular worn shelf with wax discoloration in its surface tint.

Revised source `5308e00c7311f5de65f56811fb830be01460164668bdb149caaf44c6fd8c99ef` produced twelve eight-sample Metal and Metal OIDN maps in 118.643 seconds. The prepared, raw and decoded geometry independently passed all six contact groups with a maximum 0.003815 mm gap and 0.639677 mm penetration. The packed GLB retains the needle material's two-sided alpha mask. The candidate occupies 9,496,433 bytes, with manifest SHA-256 `a21c603fa89c5335bc628e77c5790703a9519aaba1a6ab89b41746fe516150f1`.

## Third eight-sample candidate

The small amber gate guide combines a fixed bronze support, emissive paper and local spill across the right gate. Exposed pine roots, uneven slate and clustered understory break up the banks. The niche's rear cheeks extend behind its soot-darkened, hand-dressed back wall so the joints stay closed. The shelf's old wax discoloration is part of its vertex tint.

The review uses a 2048² approach atlas to fit 4,849 charts with eight-pixel padding, plus the earlier 1024² gate and 512² niche atlases. The delivered 1024² niche albedo retains the photographic relief from the CC0 `rock_pitted_mossy` diffuse map. The authoring script converts its channels to neutral gray luminance with a small cool bias. The compressed albedo is 253,938 bytes and the remaining mobile maps retain their 512-pixel limit.

Source `af5a5f58c0a063270dc921f8ab842a06e1ce95d67c3d3add2aeb22edc3f8c6dc` produced the twelve fixed eight-sample maps in 106.354 seconds. The 12,000,867-byte package has manifest SHA-256 `59f98939c452c4da8447b9894d3960f53431be0033d69872145335579506a7e1`. All six source, prepared, raw and decoded contacts passed. Prepared and decoded maximum gap remained 0.003815 mm and penetration 0.639677 mm. The candidate remains a preview for app review.

## Niche bounce calibration

The dark left-corner sample in the third preview lies on the same back-wall chart as the adjacent stone. Its measured camera ray reaches neutral granite without a geometry blocker. The raw night master already had four zero radiance texels in the affected strip, before denoising or packing. The adjacent reveal intercepts the directional moonlight.

A broad 0.004 W ambient disk lifted the affected packed linear-red night sample from 0.000742 to 0.001370. The neighboring stone also lifted from 0.004880 to 0.007537, leaving a visible-risk ratio of 18%. This candidate passed the prepared and decoded contact audits and weighed 12,006,306 bytes. It stayed in the archive with manifest SHA-256 `ec74b75e7600bb3f88ddd45e815ea7e8cf1c163fdbeb119d9e933c28eebdf6da`. The approach and gate lamp-only KTX2 files were byte-identical to the third candidate. The niche lamp-only values sampled for the comparison matched at all three mip levels.
