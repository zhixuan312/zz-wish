# Snow Roof Cycles pilot

The fictional architecture is authored in `snow_roof.py`. Scanned material/model sources, license URLs and file hashes are consolidated in `docs/assets.json`; `scripts/update-assets-manifest.py` refreshes that registry after delivery assets change. Full source scenes, raw/denoised EXRs, chart proofs and delivery intermediates stay under ignored `art/build/`.

## Device and review gates

Every current Cycles render and texture bake uses the Apple M1 Metal GPU. Do not select CPU Cycles or pass a fixed thread limit. Previews use eight samples and OpenImageDenoise; production atlases use 64 samples. Let genuine first-kernel compilation complete. The baker refuses a missing Metal device rather than silently falling back.

`scene.cycles.use_denoising` does not denoise texture bakes. The pipeline explicitly filters each represented UV chart with bundled OpenImageDenoise RT, HDR, HIGH quality on Metal device type 5. Filter buffers are OIDN-owned Metal buffers. Each chart is extended from its own samples before filtering, so neighbouring islands never enter its denoiser input. This is distinct from Cycles rendering denoising.

Geometry, lighting, material mapping and actual prepared/exported support contacts must pass review before full-quality bakes. The current resting-prop source is `art/build/snow-roof-resting-contacts-accepted.blend`, SHA256 `b31360516a2713a6451ca920f3f94d9fefd9bc191bc07fca63c8c5ddce5a0c86`. Its freshly executed roof proof is `proofs/snow-roof-resting-contacts-accepted-hidden-tiles.json`, SHA256 `cf525ebd5990e8487cc4e10f3a6110fc12d0deab152885889fe879991bbfba57`. The preceding delivered `6e9f59c9` source and its masters/profiles remain immutable. Do not edit old pins to accept a new source.

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

The current source preparation invocation is:

```sh
blender --background art/build/snow-roof-resting-contacts-accepted.blend --python art/blender/bake_export.py -- --out art/build/snow-roof-resting-contacts-accepted-bake --resolution 2048 --hall-resolution 4096 --court-resolution 4096 --samples 64 --device METAL --oidn-device METAL --skip-bake --hidden-faces art/blender/proofs/snow-roof-resting-contacts-accepted-hidden-tiles.json --chart-cache art/build/snow-roof-resting-contacts-bake
```

`--skip-bake` prepares receivers, audits coverage and exports raw glTF without invoking a texture bake. Hall/court use 4096² atlases; gate uses 2048². Existing xatlas outputs are reused only when their exact topology/resolution/padding signature matches. `--chart-cache DIR` also checks an external receiver report. Chart reuse never imports irradiance pixels.

Hidden-proof faces retain all physical geometry, material UVs and bake occlusion. Only proven completely snow-enclosed tile components omit unique lightmap allocation; their UV2 collapses to a protected empty point. Chart-isolation reports explicitly count subpixel islands rather than calling them safe. The current coverage gate represents 99.99955% of hall surface area and 100% of sampled visible hall area; court/gate represent approximately 100%. Hall has three subpixel charts; gate/court each have one zero-area chart. Zero atlas core overlaps and zero proven-hidden visible camera samples were observed. Per-triangle native-texel area is reported separately, because a represented chart can still contain very small triangles. The six reference-camera grid is a coarse visibility check, not proof of every view or shading quality.

Prepared previews restore authored color management; use `--view-transform AgX` only for older prepared files that lack the stored source settings. The accepted bank preview and the native Generated proof are bound to actual source/generated hashes in `prepared-mapping-proof.json`.

## Actual resting contacts before baking

Sources carrying `resting_contact_groups` cannot start a real Cycles bake without `--resting-contact-audit`. The independent receipt measures both the actual prepared triangles and an immutable actual raw GLB, using the evaluated source members and declared support owners. Every resting group must meet literal gap ≤2 mm and penetration ≤5 mm. Source SHA, all receiver/UV fingerprints, combined geometry fingerprint, group population, source associations and anchor metadata must match. Prepared `.blend` byte hashes are descriptive; unrelated proof-metadata saves do not invalidate unchanged geometry.

The accepted receipt is `art/build/resting-contacts-accepted-replay/contacts-unique-crowns.json`, SHA256 `c7339acd30137c33398c8df122516f31b0405a5093dbace21c072db931bc38dc`, bound to geometry `89d4085e7b4ed662ab952b1430e9217b3c9befad602e1c317ae3ea659d848821`. Both stages pass all 37 groups; maximum gap is 0.908315 mm and maximum penetration is 4.844189 mm. Wick and incense crown measurements deduplicate exported seam coordinates before computing centroids. Their maximum source correspondence error is 1.907 µm.

`proofs/resting-contact-guard.py` invokes the actual validation function without rendering or baking. Its executed proof is `art/build/resting-contacts-accepted-replay/guard/guard-proof.json`, SHA256 `34a4af3325a871aff69ae84f4700fed95fe6025f04be5cdc20e63204a362f9b6`: a genuine receipt passes, all 19 missing/failed/stale/over-limit challenges fail before Cycles, and unrelated metadata remains acceptable with the same receiver fingerprints. Durable source, replay and guard evidence is in `docs/evidence/resting-props`.

The prior `2ee18ea0` partial batch was stopped and rejected: prepared diagonals increased cushion penetration beyond 5 mm. It remains archived at `art/build/snow-roof-resting-contacts-bake/rejected-attempt.json`; its two completed maps are never reused. The corrected source raises only the two cushions by 0.2 mm. Its new scene identity requires all twelve fresh GI maps.

## Baking and cache identity

```sh
blender --background art/build/snow-roof-resting-contacts-accepted-bake/snow-roof-prepared.blend --python art/blender/bake_export.py -- --out art/build/snow-roof-resting-contacts-accepted-bake --resolution 2048 --hall-resolution 4096 --court-resolution 4096 --samples 64 --device METAL --oidn-device METAL --resume --hidden-faces art/blender/proofs/snow-roof-resting-contacts-accepted-hidden-tiles.json --prepared-preview-audit art/build/snow-roof-resting-contacts-accepted-bake/prepared-mapping-proof.json --resting-contact-audit art/build/resting-contacts-accepted-replay/contacts-unique-crowns.json
```

All twelve real maps are required: night, dusk, day and visitor-lamp-only for each region. Bakes use DIFFUSE DIRECT + INDIRECT, excluding COLOR. Night restores the accepted source world, fixture energy/color and emissive strengths exactly, with only the visitor lamp excluded. Dusk/day use the recorded presets; day fixtures remain at factor 1, the same authored 8 W as night. Lamp-only disables all other lights, world and fixture emission. Its basis is 45 W at engine `[0,2.99,-0.5]`, linear RGB `[1,189/255,120/255]`.

The current resting-contact batch completed all twelve maps with exit 0 in 2508.312 seconds (41 min 48 s including export). Every map records 64 samples, Cycles `METAL` and OIDN `METAL`; Cycles uses automatic thread selection. The actual post-batch identities match the independently checked staging inputs exactly:

| Native output | SHA256 |
| --- | --- |
| `snow-roof-prepared.blend` | `a49fe4fec7dcb52022c720b5a47a8d9c187f06433fda48adf1324d5d65c75d28` |
| `snow-roof.raw.glb` | `c3539702ab9c0a5eb244f4be25d57bd1c30f22bb31ecedd83674bd99642aef7b` |

The files are under `art/build/snow-roof-resting-contacts-accepted-bake/`. The raw hash authorizes the separately recorded F32/material/pruning stages; it does not authorize reuse of old GI pixels.

The complete package is installed in `web/public/places/snow-roof/` and registered in `docs/assets.json`:

| Delivery | Value |
| --- | --- |
| Manifest SHA256 | `9beed7157a74e41096bfb7bd94f62834a30d6df89cf4cf3979c1ffca62b9fb53` |
| Optimized GLB SHA256 | `49cbe07a5a0f407b3df31b82ef0c75e6995e471593d51527a276a3d22723ef88` |
| Optimized GLB | 16,265,084 bytes; 649,213 vertices; 467,186 triangles |
| Declared payload/proof files | 17; 59,674,555 bytes |

The runtime reads the exported wick tips, source point-light positions and incense smoke origin, converting world coordinates into the nook's frame. Source metadata is required. Executed recipes, all map/master hashes, per-map device timings and independent geometry/padding/codec receipts are in [the current delivery evidence](../../docs/evidence/blender-pilot/resting-contacts-delivery/README.md). Original masters remain under the local build directory.

The [desktop/phone before-and-after comparison](../../docs/evidence/resting-props/index.html) contains 24 committed PNGs and exact camera provenance. Both sizes show the lamp bases and burner feet seated on their supports. All 132 live source-anchor comparisons measure zero error. The [review](../../docs/evidence/resting-props/review.md) records the controlled capture conditions and the separate normal-phone pacing result.

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

The preceding delivery's post-batch export guard is recorded in `docs/evidence/blender-pilot/final-export`: actual raw `0deec9fd...`, prepared `6ed42644...`, newly generated explicit profiles and executed `-optimized-postbatch` staging outputs. Those inputs and receipts remain historical; the current source has its own measured identities above. No pinned input hash was bypassed.

## Genuine FLOAT32 contact-sampling candidate

The F32 export path preserves authored positions through lossless Meshopt rather than quantizing near-tangent snow contacts. `scripts/prune-float32-baked.mjs` validates the actual raw F32 triangle positions and prepared FACE binaries before removing only proven enclosed roof faces and exact-welding the export copy. The preceding source reproduces with `--profile art/blender/proofs/snow-roof-final-float32-export-profile.json`; supply explicit input and new art/build output paths. Current source profiles and executed receipts are recorded in `docs/evidence/blender-pilot/resting-contacts-delivery`. `scripts/audit-float32-prune.mjs` independently checks decoded retained attributes/winding, transforms, materials and images. The preceding delivered source used 15,904,988 B, 648,780 vertices and 466,874 triangles. These are historical measurements, not the new source’s delivery size.

`classify_snow_contact.py`, `certify_snow_contact_donors.py`, and `verify_contact_reproduction.py` retain the geometric recipient/donor recipes. `audit_contact_padding.py` checks only the derivative sampling domain and actual linear EXR invariants; it never renders, bakes, denoises or encodes. Input hashes, reproducible commands, compact permission masks, executed recipes and limitations are in `docs/evidence/blender-pilot/contact-sampling`. Original Cycles transport and source geometry stay unchanged. A faint contact seam remains in the first normal-sampler browser comparison.

New F32 profiles require `--profile-out NEW_PROFILE.json --inputs ACTUAL_BINDINGS.json`; reproduction uses `--profile EXISTING_PROFILE.json`. The explicit bindings contain actual source, prepared, raw, hidden proof, FACE reference and F32 input paths/hashes. The helper checks complete FACE/marker position multiplicities before pruning, so a material dedup name change cannot authorize unrelated removal. No decoded SHORT position is cast back to float.

Fresh contact classifiers require `--inputs` with actual source/prepared/raw/F32 correspondence and hall/court coverage-file hashes. `contact_padding.py` takes explicit `--source`, `--base`, `--classification`, `--donors` and `--donor-metadata`; its independent audit takes matching source/base/classification paths. Regenerate these certificates for every new source. Certified hidden recipients alone may copy the nearest permitted donor within eight base pixels in the same original chart and snow owner. Every other linear base RGBA bit remains unchanged; the original masters remain immutable. Derived delivery reuses each original scale/gain and builds three mips in linear radiance. Lossy KTX block neighborhoods are not claimed bit-exact.
