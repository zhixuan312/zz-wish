# Snow Roof Cycles pilot

Blender 5.3 reconstructs the fictional temple from source. Material/model origins and licenses are consolidated in `docs/assets.json`; run `python3 scripts/update-assets-manifest.py` after changing delivery assets.

```sh
blender --background --python art/blender/snow_roof.py -- --output art/build/snow-roof.blend
blender --background art/build/snow-roof.blend --python art/blender/bake_export.py -- --out art/build/snow-roof --resolution 1024 --samples 32 --device METAL
node scripts/pack-blender-assets.mjs --source art/build/snow-roof --out web/public/places/snow-roof
```

For a CPU bake pass `--device CPU` explicitly. The first Metal kernel compilation may be slow. A 32-pixel CPU probe is recorded under `docs/evidence/blender/`; it verifies bake units, linear PNG encoding and both UV sets. This is build-pipeline evidence, not a product test suite.

The baker evaluates modifiers once, joins static construction by `hall`, `court` and `gate`, and packs `Lightmap` as the second UV set. The first `UVMap` remains the PBR material UV. Four Cycles diffuse passes exclude material color: night, dusk, day and the visitor lamp alone. Original source materials remain on the glTF. Full-range scene-linear EXR masters and normalized 16-bit linear PNG intermediates stay in `art/build/`, excluded from Git.

Each atlas/pass has its own power-of-two scale. Reconstruct `sample * scale` before blending. The quantity is **diffuse radiance per unit albedo**, proven against a raw Lambertian Cycles render. Three.js's light-map input is irradiance, so multiply the reconstructed result by π before its Lambertian BRDF divides by π. No AgX or sRGB transfer is baked into the normalized delivery maps. The save probe agrees with direct 16-bit PNG decoding within half an LSB.

`--skip-bake` prepares the UVs and raw glTF only. For a resumed bake use the exact prepared scene and `--resume`:

```sh
blender --background art/build/snow-roof/snow-roof-prepared.blend --python art/blender/bake_export.py -- --out art/build/snow-roof --resolution 1024 --samples 32 --device CPU --resume
```

`--passes night` or `--passes night,dusk` selects passes while retaining completed atlas metadata. Resume reuses existing completed PNG/EXR maps. Change source geometry only before atlas packing; changed topology requires rebuilding the UVs and every pass.

The compression script pins glTF Transform 4.5.1 and KTX-Software 4.4.2. On Apple Silicon it downloads/extracts the official KTX package into a temporary tools prefix without a system installation; other platforms can provide `TOKTX`. Texture compression runs first and Meshopt last, because a later glTF transform may decode an earlier geometry extension. The script rejects a missing second UV set, Meshopt extension or Basis/KTX2 material textures. Linear lightmaps use UASTC plus Zstandard; PBR textures use KHR_texture_basisu. A byte/hash manifest reports the complete place payload against the approximately 8 MiB reference.
