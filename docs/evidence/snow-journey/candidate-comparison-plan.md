# Snow Roof material profile comparison

Preparation only. Native Metal work currently owns the GPU, and the paired complete manifests are not delivered yet. Do not launch Chrome until the parent hands over the GPU. This plan does not adopt the mobile candidate.

The two frontend snapshots have now been copied from the current working tree and are served at ports 5191/5192. Their shared 104-file frontend fingerprint is `6bb412e03c30f2aff9990cc33d3f922acbfeab498306af13f3950d958c7110c4`. The source stayed byte-identical during copying. Snow Roof asset folders were excluded, and instrumentation was prepared with `ALLOW_PENDING_DELIVERY=1`; its manifest hash is intentionally null. See [ab-snapshot-preparation.json](ab-snapshot-preparation.json) for source hashes, server ownership and HTTP-only checks. After complete candidate assets arrive, rerun the two instrumentation commands below without the pending flag. The preflight rejects a pending or stale manifest stamp.

The preparatory optimized GLBs had the same 648,776 vertices, 466,874 triangles and 9,803,782 geometry bytes. Their then-current optimization receipts identified the same source blend and all 42 triangle-attribute hashes matched. The quality candidate was 34,821,408 bytes, including 24,909,483 material-image bytes. The mobile candidate was 13,449,088 bytes, including 3,537,347 material-image bytes. This was receipt comparison, not a new Blender render or an independent triangle decode audit.

The final raw GLB subsequently gained 3,304 bytes of legitimate scene proof metadata. Both candidate encodes and optimization receipts are being refreshed. The hashes below are historical preparation values and must not be used as the final delivery gate. The driver reads and verifies the refreshed receipts and actual candidate bytes at execution; it contains no hard-coded old GLB hash.

| Candidate | GLB | SHA-256 |
| --- | --- | --- |
| Quality | `art/build/snow-roof-final-quality-optimized/snow-roof.glb` | `d37a76d691b5d1703ba0c9ff36558631b4613e05e532ac92cb74f88c0f5fc174` |
| Mobile | `art/build/snow-roof-final-mobile-optimized/snow-roof.glb` | `9f34007cc49bb899c98dc59c862aa20dee91d533ba5b2ee574a5ace8f42db94d` |

Freeze the complete current frontend/shared/public source once, then clone it to `/tmp/one-light-final-quality` and `/tmp/one-light-final-mobile`. Install each complete candidate's files under its `web/public/places/snow-roof/`. Only those candidate assets and their declared manifests may differ. Both candidates must have identical actual UASTC night/dusk/day/lamp lightmaps and decode parameters. Each manifest must explicitly declare its material profile. Symlink the existing workspace `node_modules`; do not install dependencies or rebuild assets during capture.

Instrument each frozen copy after cloning, then serve it with a separate cache and strict port. Stop the older owned night3 server on port 5191 first. Run each Vite command in its respective frozen directory:

```sh
node tests/visual/instrument-flicker.mjs /tmp/one-light-final-quality
node tests/visual/instrument-flicker.mjs /tmp/one-light-final-mobile
```

```sh
ONE_LIGHT_API_TARGET=http://127.0.0.1:8792 ONE_LIGHT_VITE_CACHE=/tmp/one-light-final-quality/.vite-cache node node_modules/vite/bin/vite.js --config web/vite.config.ts --host 127.0.0.1 --port 5191 --strictPort
```

```sh
ONE_LIGHT_API_TARGET=http://127.0.0.1:8792 ONE_LIGHT_VITE_CACHE=/tmp/one-light-final-mobile/.vite-cache node node_modules/vite/bin/vite.js --config web/vite.config.ts --host 127.0.0.1 --port 5192 --strictPort
```

After the explicit GPU release, launch the comparison from the workspace:

```sh
QUALITY_SOURCE=/tmp/one-light-final-quality MOBILE_SOURCE=/tmp/one-light-final-mobile QUALITY_URL=http://127.0.0.1:5191 MOBILE_URL=http://127.0.0.1:5192 EVIDENCE=final node tests/visual/snow-candidate-ab.mjs
```

The CPU preflight rejects the pair before Chrome launches if frontend/shared sources, actual lightmap payloads/decode parameters, GLB scene graphs, retained-attribute proofs, source blend or lamp basis differ. It also verifies each actual delivered GLB against its optimization receipt. Each browser page must expose the matching source/manifest identity. Fingerprints before and after capture establish that both snapshots stayed unchanged.

The headed Metal driver uses one context at a time, without video. It captures both 1440×900 desktop English and 390×844 phone Chinese with real touch input. Both use deviceScaleFactor 1 for material comparison; the subsequent performance phone uses deviceScaleFactor 2. Actual UI poses are outside, red Drum 10-minute choice, red Drum 24-hour choice, 10-minute confirm and settled burning after the 21.8-second ignition journey. An actual UI put-out action cleans up each visitor, with its saved API record verified.

For each A/B frame, camera motion, daylight, physical clock, flame clock, fuel and lamp rotation are held at the same controlled values. Particles are hidden after scene updates. A short lossless sequence verifies the held camera and zero visible particle objects; its RMS is retained rather than asserting that compressed profiles have identical pixels. This control is solely for material comparison, not the normal animated product appearance. Source identity, actual texture formats/mip dimensions, compiled atlas sampler references, uploaded-handle evidence, physical lamp bounds and camera matrices are retained.

The following five supplemental views use source-derived world poses supplied by the modeler. They temporarily hide HTML controls and are explicitly labelled diagnostic cameras. They do not change or propose the actual journey camera, and a source coordinate does not establish feature visibility before image review.

| Diagnostic | World position | Look target | Vertical FOV |
| --- | --- | --- | --- |
| Scanned altar/table | `[1.1, 1.85, -1.75]` | `[0, 1.32, -4.85]` | 40° |
| Painted screen | `[0, 2.75, -1.6]` | `[0, 3.08, -6.25]` | 43° |
| Brass burner/ash | `[0.35, 2.08, -4.05]` | `[0, 1.76, -4.85]` | 32° |
| Painted beam/joinery | `[0.2, 3.6, -0.2]` | `[1.6, 4.85, -2.18]` | 32° |
| Polished floor | `[2.4, 1.45, 1.3]` | `[1.25, 0.60, -1.2]` | 40° |

The output `artifacts/snow-candidate-ab/final/comparison.html` pairs each normal and diagnostic frame with native-resolution image links. The report checks matching camera/projection matrices; it makes no strict pixel-equivalence claim. Review painted feathers/branches, altar carvings, brass roughness/highlights, beam paint edges, floor grain and distant shimmer at native pixels. Record any visible degradation and the uploaded texture/device budget before selecting a candidate.

After selection, run the selected frozen delivery's no-video performance probe first, then final `CORE_FLOW`, then six looks. See [after-capture-plan.md](after-capture-plan.md) for the exact commands. No final visual or performance pass is claimed by this preparation.
