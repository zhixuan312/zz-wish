# Snow Roof Cycles pilot

The fictional architecture is authored in `snow_roof.py`. Scanned material/model sources, license URLs and file hashes are consolidated in `docs/assets.json`; `scripts/update-assets-manifest.py` refreshes that registry after delivery assets change. Full source scenes, raw/denoised EXRs, chart proofs and delivery intermediates stay under ignored `art/build/`.

## Device and review gates

Every current Cycles render and texture bake uses the Apple M1 Metal GPU. Do not select CPU Cycles or pass a fixed thread limit. Previews use eight samples and OpenImageDenoise; production atlases use 64 samples. Let genuine first-kernel compilation complete. The baker refuses a missing Metal device rather than silently falling back.

`scene.cycles.use_denoising` does not denoise texture bakes. The pipeline explicitly filters each represented UV chart with bundled OpenImageDenoise RT, HDR, HIGH quality on Metal device type 5. Filter buffers are OIDN-owned Metal buffers. Each chart is extended from its own samples before filtering, so neighbouring islands never enter its denoiser input. This is distinct from Cycles rendering denoising.

Geometry, lighting and material mapping must pass low-sample visual review before full-quality bakes. The accepted final source is `art/build/snow-roof-stair-banks-grain.blend`, SHA256 `6e9f59c93565e08a690eaafbc756967ba39e0f4d8ad0094e4520265948360af8`. Its source-bound hidden-tile proof is `proofs/snow-roof-final-hidden-tiles.json`, SHA256 `6649e9c080c3b152c743fcc88ad5ebf95690ff8f678742cc5dd84be79ce2e014`. Do not edit these hashes to accept a different source.

To rebuild a separate source and inspect the authored lighting:

```sh
blender --background --python art/blender/snow_roof.py -- --output art/build/snow-roof-rebuild.blend
blender --background --python art/blender/preview.py -- --scene art/build/snow-roof-rebuild.blend --cameras Reference_outside,Reference_walk-3 --look night --samples 8 --width 960 --height 600 --output art/build/snow-roof-rebuild-night-preview
blender --background --python art/blender/preview.py -- --scene art/build/snow-roof-rebuild.blend --cameras Reference_outside,Reference_walk-3 --look dusk --samples 8 --width 960 --height 600 --output art/build/snow-roof-rebuild-dusk-preview
blender --background --python art/blender/preview.py -- --scene art/build/snow-roof-rebuild.blend --cameras Reference_outside,Reference_walk-3 --look day --samples 8 --width 960 --height 600 --output art/build/snow-roof-rebuild-day-preview
```

A rebuilt `.blend` has its own identity. Generate a fresh hidden-face proof with `classify_hidden_tiles.py --source-blend ... --output ...`; retain the original proof. The classifier performs CPU geometry/BVH calculations only, with no render or geometry removal.

## Receiver preparation and mapping

The baker preserves original material `UVMap` and `SurfaceTint` COLOR_0, evaluates modifiers, joins receivers into `hall`, `court` and `gate`, and adds `Lightmap` as the second UV set. It sends triangulated positions/topology to xatlas/watlas 1.0.1; scanned prop UV0 is never an unwrap constraint or rewritten. Source-albedo texture maps remain in the exported material. COLOR_0 is retained because no albedo atlas bakes that tint into a second color source.

Implicit procedural Generated inputs need explicit preservation before joining changes object texture space. Only those procedural inputs are remapped; image-texture UV inputs remain untouched. The frozen POINT/FLOAT_VECTOR attribute is computed from evaluated `MeshVertex.undeformed_co` using the **original** object's texture-space location and size. Generic POINT-attribute interpolation across bevels is not equivalent. `proofs/generated-coordinate-probe.py` records an actual one-sample Metal emission-bake comparison: evaluated undeformed mapping matched native Generated within `1.79e-7` maximum absolute error; generic interpolated coordinates differed by up to `0.184`. `generated-coordinate-audit.json` records original texspace, modifier handling, example coordinates and resulting receiver attribute hashes.

The final preparation invocation was:

```sh
blender --background art/build/snow-roof-stair-banks-grain.blend --python art/blender/bake_export.py -- --out art/build/snow-roof-final --resolution 2048 --hall-resolution 4096 --court-resolution 4096 --samples 64 --device METAL --oidn-device METAL --skip-bake --hidden-faces art/blender/proofs/snow-roof-final-hidden-tiles.json
```

`--skip-bake` prepares receivers, audits coverage and exports raw glTF without invoking a texture bake. Hall/court use 4096² atlases; gate uses 2048². Existing xatlas outputs are reused only when their exact topology/resolution/padding signature matches. `--chart-cache DIR` also checks an external receiver report. Chart reuse never imports irradiance pixels.

Hidden-proof faces retain all physical geometry, material UVs and bake occlusion. Only proven completely snow-enclosed tile components omit unique lightmap allocation; their UV2 collapses to a protected empty point. Chart-isolation reports explicitly count subpixel islands rather than calling them safe. The actual final coverage gate represents 99.99955% of hall surface area and 99.97741% of sampled visible hall area; court/gate represent 100%. Hall has three subpixel charts; gate/court each have one zero-area chart. Zero atlas core overlaps and zero proven-hidden visible camera samples were observed. Per-triangle native-texel area is reported separately, because a represented chart can still contain very small triangles. The six reference-camera grid is a coarse visibility check, not proof of every view or shading quality.

Prepared previews restore authored color management; use `--view-transform AgX` only for older prepared files that lack the stored source settings. The accepted bank preview and the native Generated proof are bound to actual source/generated hashes in `prepared-mapping-proof.json`.

## Baking and cache identity

```sh
blender --background art/build/snow-roof-final/snow-roof-prepared.blend --python art/blender/bake_export.py -- --out art/build/snow-roof-final --resolution 2048 --hall-resolution 4096 --court-resolution 4096 --samples 64 --device METAL --oidn-device METAL --resume --hidden-faces art/blender/proofs/snow-roof-final-hidden-tiles.json --prepared-preview-audit art/build/snow-roof-final/prepared-mapping-proof.json
```

All twelve real maps are required: night, dusk, day and visitor-lamp-only for each region. Bakes use DIFFUSE DIRECT + INDIRECT, excluding COLOR. Night restores the accepted source world, fixture energy/color and emissive strengths exactly, with only the visitor lamp excluded. Dusk/day use the recorded presets; day fixtures remain at factor 1, the same authored 8 W as night. Lamp-only disables all other lights, world and fixture emission. Its basis is 45 W at engine `[0,2.99,-0.5]`, linear RGB `[1,189/255,120/255]`.

The quantity is diffuse radiance per unit albedo, proven by a Lambertian bake/render probe. Three's lightMap receives irradiance, so multiply the decoded coefficient by π before its Lambert BRDF divides by π. The runtime's matching near PointLight basis is `45/(4π)` candela, using the same linear RGB.

Resume is strict: scene-wide source, receiver geometry/UVs/tint, actual preserved Generated bytes and policy, material graphs/images, lights, world, presets and prepared-mapping evidence enter the bake fingerprint. Any changed occluder invalidates every region's GI. An unchanged regional receiver only permits chart reuse. `--passes night,lamp` selects real passes; final packaging still rejects missing dusk/day. `--reencode-existing` regenerates delivery intermediates from denoised EXRs without changing master bytes or running Cycles/OIDN.

## HDR encoding, mip limits and verification

Raw and denoised masters are scene-linear 32-bit EXR. Delivery intermediates are 16-bit PNG with **logarithmic HDR encoding**, gain 4096, per-pass power-of-two scale and `logRange = log2(1 + scale * logGain)`:

```text
encoded = log2(1 + radiance * logGain) / logRange
decoded = (exp2(sample * logRange) - 1) / logGain
```

Decode each texture before blending ambient looks or lamp contributions, then apply the π unit conversion. Treat samples as linear data: no sRGB or AgX transfer. The old `sample * scale` encoding remains a compatibility fallback only when `logRange` is absent/zero; it is not the current delivery recommendation.

Each map has three explicit mips (base, half, quarter), built by averaging **linear radiance before log encoding**. Post-denoise edge extension uses eight base pixels; xatlas packs with eight-pixel padding. `mipLevels:3`, `maxLod:2`, `anisotropy:1` are declared and must be honored by the loader. Do not generate a full mip chain or apply generic material-map anisotropy. Chart isolation protects OIDN; atlas sampling and encoded-log interpolation still need runtime visual review. Filtering log samples can darken mixed bright/dark edges compared with filtering linear radiance.

The packer verifies KTX2 linear transfer, codec and all three levels. For numerical delivery checks, use official `ktx transcode --target rgba8 input.ktx2 region-pass-decoded.ktx2`, then:

```sh
blender --background --python art/blender/bake_export.py -- --out PATH_TO_ISOLATED_EXR_COVERAGE_AND_DECODED_FILES --verify-delivery PATH_TO_MATCHING_MANIFEST
```

This performs image I/O and CPU numeric comparisons only. It compares decoded maps with actual denoised EXRs over dark/middle/peak ranges and all three mips; coarser mip masks require the complete footprint to remain one chart. It reports nonzero values quantized to black. Official RGBA8 transcode is not a claim about the eventual device's ASTC/BC7/ETC storage or screen interpolation.

## Packing and separate material candidates

The packer pins glTF-Transform 4.5.1 and KTX-Software 4.4.2, downloading official tools into temporary prefixes if needed. The order is **dedup → material texture compression → Meshopt last**. It verifies original UV0/UV1/COLOR_0 bytes before Meshopt, region bindings, per-primitive roughness extras, required extensions and actual image-role/codec/byte metadata. Texture role unions come from GLB material bindings; shared screen images remain shared.

```sh
node scripts/pack-blender-assets.mjs --source art/build/snow-roof-final --out art/build/snow-roof-final-quality --material-profile quality
node scripts/pack-blender-assets.mjs --source art/build/snow-roof-final --out art/build/snow-roof-final-mobile --material-profile mobile --screen-base-size 1024
```

Normal final packing rejects any missing pass. `--preview` is explicitly partial: it still requires real night/lamp maps for all regions, marks `partialPreview:true`, lists missing ambient looks and never invents maps. `--geometry-only` stages materials/geometry separately without writing a complete-delivery manifest. The live public scene is not changed by the two candidate paths above.

Quality material textures use UASTC. The staged mobile profile retains 512 px UASTC normals and uses high-quality ETC1S for other 512 px maps, keeping the painted screen base at 1024 px. It uses original pixel inputs, separate cache keys/files and identical lightmaps. Adopt it only after a same-final-geometry browser comparison. All **lightmaps remain UASTC**: the actual gate-night ETC1S comparison saved bytes but raised dark relative error from 7.62% to 22.70% and newly black nonzero dark texels from 43 to 728. Evidence is `art/build/snow-roof-lightmap-codec-comparison.json`.

Receipts record actual role bytes, settings, source raw hash, image hashes and payload totals. The approximately 8 MiB initial target has not been met; report real final bytes and visual/device results rather than asserting a smaller budget. Final proven-hidden export pruning uses `scripts/prune-validated-baked.mjs --profile quality|mobile` on separate staging copies, with actual FACE/raw/packed provenance and exact retained triangle/image invariants. The original `scripts/prune-baked-hidden.mjs` and its measured profile are retained for the original asset only. Full source and bake occluders remain intact. Actual receipts and the post-batch hash guard are documented in `docs/evidence/blender-pilot/final-export/README.md`.

The post-batch export guard is recorded in `docs/evidence/blender-pilot/final-export`: actual raw `0deec9fd...`, prepared `6ed42644...`, newly generated explicit profiles and executed `-optimized-postbatch` staging outputs. Earlier pre-bake receipts are provisional history. No pinned input hash was bypassed.

## Genuine FLOAT32 contact-sampling candidate

The F32 export path preserves authored positions through lossless Meshopt rather than quantizing near-tangent snow contacts. `scripts/prune-float32-baked.mjs` validates the actual raw F32 triangle positions and prepared FACE binaries before removing only proven enclosed roof faces and exact-welding the export copy. Reproduce with `--profile art/blender/proofs/snow-roof-final-float32-export-profile.json`; supply explicit input and new art/build output paths. `scripts/audit-float32-prune.mjs` independently checks decoded retained attributes/winding, transforms, materials and images. This separate candidate is 15,904,988 B, 648,780 vertices and 466,874 triangles; it is subject to final browser/performance review.

`classify_snow_contact.py`, `certify_snow_contact_donors.py`, and `verify_contact_reproduction.py` retain the geometric recipient/donor recipes. `audit_contact_padding.py` checks only the derivative sampling domain and actual linear EXR invariants; it never renders, bakes, denoises or encodes. Input hashes, reproducible commands, compact permission masks, executed recipes and limitations are in `docs/evidence/blender-pilot/contact-sampling`. Original Cycles transport and source geometry stay unchanged. A faint contact seam remains in the first normal-sampler browser comparison.
