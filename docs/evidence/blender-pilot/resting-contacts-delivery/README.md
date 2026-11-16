# Snow Roof resting contacts and fresh transport

The corrected source uses evaluated support triangles for all 37 registered prop groups. Both actual prepared and raw-export replays meet literal gaps ≤2 mm and penetration ≤5 mm. Source, wick/light and incense/smoke correspondence is documented in `../../resting-props/`; the actual raw→FLOAT32→pruned geometry proofs are included here.

All twelve maps were freshly baked at 64 samples on Apple M1 Metal, with explicit per-chart OIDN RT HDR HIGH on Metal device type 5. The batch exited 0 after **2,508.312 seconds (41 minutes 48.312 seconds)**. `native-bake.json` records actual device/guard evidence, full noisy/denoised master hashes, lighting and per-map timings. No previous source GI was reused.

| Region | Look | Cycles seconds | OIDN seconds | Total map seconds |
|---|---|---:|---:|---:|
| hall | night | 127.129 | 78.013 | 208.741 |
| hall | dusk | 294.015 | 78.724 | 375.392 |
| hall | day | 116.573 | 83.673 | 202.752 |
| hall | lamp | 88.836 | 87.632 | 178.661 |
| court | night | 406.74 | 75.333 | 491.633 |
| court | dusk | 220.398 | 55.745 | 279.909 |
| court | day | 203.99 | 55.222 | 262.751 |
| court | lamp | 185.593 | 55.42 | 243.486 |
| gate | night | 54.812 | 26.439 | 82.356 |
| gate | dusk | 34.286 | 27.993 | 62.905 |
| gate | day | 30.819 | 27.429 | 58.867 |
| gate | lamp | 25.406 | 28.278 | 54.235 |

The rejected `2ee18ea0` attempt remains archived. Its prepared support diagonals exceeded the 5 mm cushion limit, so the batch was stopped. The accepted `b3136051` source raises only both cushions by 0.2 mm; its actual prepared/raw maximum penetration is 4.844189 mm and maximum gap 0.908315 mm. The new pre-bake guard requires a matching source and receiver/UV receipt; all 19 invalid-receipt challenges reject before Cycles. Pure proof-metadata saves do not invalidate unchanged receiver geometry.

`postbatch-correspondence.json` verifies the actual completed raw and prepared files are byte-identical to the measured geometry/proof inputs. That observation permits the provisional downstream caches to be reused without editing any pin. The native baker/source/receiver data stayed frozen. Two controlled downstream helper changes have separate revision records; the launch ledger is retained as historical evidence rather than described as every helper's final state.

The optimized GLB retains genuine authored FLOAT32 POSITION with Meshopt filter NONE. It removes only 183,750 exact FACE-proven snow-enclosed roof triangles and exact-welds retained records. All retained position/normal/UV0/UV1/COLOR0/COLOR1 bytes, winding, transforms, source scene extras, material definitions and embedded images match the independently decoded inputs. Original source geometry and bake occluders remain intact.

The new geometric contact domain certifies 9,798 hidden texel centres, with 35,917 explicit valid donors. Only 2,098 court and 682 hall recipients have a permitted donor within eight native base pixels in the same original chart and snow owner. Other recipients remain unchanged. No radiance threshold selects recipients or donors. Sparse certificates and source masters remain under the hash-linked local `art/build/` paths; full EXRs and coverage arrays are not copied into this evidence directory.

The complete staged package is `art/build/snow-roof-resting-contacts-delivery`. It declares **17 payload/proof files, 59,674,555 bytes**; the 108,583-byte manifest makes 18 physical files totaling 59,783,138 bytes. Manifest SHA256 is `9beed7157a74e41096bfb7bd94f62834a30d6df89cf4cf3979c1ffca62b9fb53`; optimized GLB SHA256 is `49cbe07a5a0f407b3df31b82ef0c75e6995e471593d51527a276a3d22723ef88`.

All eight hall/court maps were encoded from derived EXRs; gate's four payloads remain byte-identical. The independent proof changes exactly 2,098 court and 682 hall base texels per look, verifies the nearest permitted donor including tie order, and proves every other RGBA/alpha bit exact. Original raw/denoised masters are unchanged. **This bit-exact claim applies to linear base samples, not lossy KTX block neighborhoods.** Three mip levels are rebuilt in linear radiance before log encoding; original scales, gain 4096, eight-pixel gutters and anisotropy 1 are retained.

`delivery-image-audit.json` compares all twelve actual UASTC payloads, officially transcoded to RGBA8, with the correct derived/original linear masters at all three levels. It reports dark/middle/peak error and nonzero-to-black counts rather than asserting lossless compression. Device-specific ASTC/BC7 transcode and final screen interpolation still require runtime review.

`handoff.json` contains full source/prepared/raw/GLB/manifest/proof hashes, all per-map timings, package counts/bytes and scope. All owned native/encoder/numeric work is terminal. Public installation and subsequent browser acceptance are root-owned and are not claimed by this staged delivery.

`recipes.json` preserves actual executed commands and profile hashes. These paths are immutable outputs; a rebuild must choose new directories and measure its new source/proof identities. No full test suite was run; the relevant checks were syntax, actual source/prepared/raw/codec invariants, the non-rendering guard challenges and independent numeric proofs.
