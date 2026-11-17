Cloud source morphology review

The installed corrected v11 package is a technical transfer control. Its native and browser views did not meet the requested terrain/cloud appearance. It is not the visual acceptance reference for this source pass.

| Source | Actual result | Disposition |
| --- | --- | --- |
| v12 metric-UV, `b063d862…` | Procedural rock wall had repeated horizontal benches; twelve simple volume envelopes read as smooth floating ovals. | Rejected. Both Metal8 source views are preserved in `art/build/cloud-cliff-round1/source-v12-preview`. |
| v13, `604f79fa…` | Six actual CC0 `rock_face_01` formations improved rock detail; exposed cut tops and smooth cloud tops remained. Lower haze removed the isolated lower cloud edges. | Rejected for full baking. Both source views are preserved in `source-v13-preview`. |
| v14, `19aa0d99…` | Only the six scan caps are reshaped. Cloud density uses literal three-octave 3D value noise and a finite lower haze substrate. Actual native images still show large smooth cloud bodies. | Superseded by the bounded v15 contour-warp review. No atlas/full bake was started. |
| v15, `00180f4c…` | The same three unweighted octave values also deform bank sampling coordinates by horizontal ±6/±8 m and downward-only 0–12 m. Scan14 and every other physical object remain exact. | One actual 720×450 Metal8 desktop view is terminal. Broad smooth bodies remain visible; root must judge this image before any full-size pair, atlas or full bake. |
| v16, `e1fab71c…` | Broad opaque parents are removed. Twelve culling groups contain 48 unequal overlapping child lobes; vertical contour warp uses the existing mid/fine values. | Full-size desktop/phone Metal8 previews are terminal. Approved only for a fresh LOW8 runtime study; source morphology and full64 remain unapproved. |

V14 preserves all 1,121 pre-existing gallery/HERO/light/camera objects, their source normals/UV0/tints/winding/material bindings, the world, anchor strings, 18 resting-contact groups and six hanging measurements. Its six far formations contain 21,783 triangles. The added near rock drop is the same geometry as v12/v13.

The independent cap audit compares actual evaluated v13 and v14 meshes. All 12,345 protected interior vertices and their normals are exact. Only 1,593 vertices in the upper 15% of the formations move; maximum vertical changes are 3.45–9.00 m. Topology, material bindings, all photographic UV0 and authored SourceLightmap coordinates remain exact. Actual source contact and hanging guards are unchanged at 2/5 mm.

V14's field records contain fixed world-space bank/support bounds, a finite lower ellipsoidal substrate, three explicit frequencies/offsets/weights, floored `mod289` permutation and quintic interpolation. Internal noise advects; the supports remain fixed. No sine-only hash or breakup, height slab, flat horizon plane, or duplicated feather is used. The saved native node graph matches an independent CPU implementation at 3,955 points with maximum absolute density error `2.564e-8`. This is a node/CPU proof, not GPU or optical equivalence.

Local immutable evidence:

- Source: `art/build/cloud-cliff-round1/cloud-cliff-source-v14.blend`, SHA256 `19aa0d99842dab95f714b5ae795186a1e46b6e6ecf57f5766c50c7893af1819e`.
- Whole-source scope/math proof: `source-v14-scope/morphology-scope.json`, SHA256 `1334d19259778c55d6fb7d63b1677b61ddc07e54f89af48d3224cb468e3cf910`.
- Independent scan-cap proof: `source-v14-scope/scan-cap-scope.json`, SHA256 `7a0f55ec30bc601a5bacd0d28ee398e9e25a6952fa301d3afcab55af08232813`.
- Actual source glTF PBR-role proof: `source-v14-materials/material-role-proof.json`, SHA256 `3735058e2035d982e6cfe6676d7124602faa8c0cbe61a50950af528dcb02fc58`.
- Native launch ledger: `source-v14-preview/launch-plan.json`, SHA256 `0e3fdf8da0058bd3876a1d7c3c2c7c4c17b483441fefca9664a0b2f93676b8db`.
- Native completion: `source-v14-preview/completion.json`, SHA256 `30230cfe1c9a9d9429b1644673f54f5757de613ac746c67141fe7b251ceb75db`; exit 0, 384.705 seconds including the first specialization, every pinned input unchanged. The exact desktop/phone PNG and device/camera metadata hashes are in that receipt.
- Runtime density contract: `source-v14-preview/cloud-contract.json`; exact actual geometry bounds: `source-v14-preview/world-bounds.json`.

The source world/light settings and 45 W lamp basis are unchanged. Source `volume_bounces=0` and unbiased volume integration are retained; this pass does not introduce a multiple-scattering adjustment. All native previews use Cycles Metal on the M1, automatic threads, eight samples and GPU OpenImageDenoise. Source geometry/material acceptance, fresh preparation/export/contact/normal/UV gates, full Metal64 bakes, complete byte accounting and actual runtime review remain separate requirements.

V15 evidence and limits

Source `art/build/cloud-cliff-round1/cloud-cliff-source-v15.blend` has SHA256 `00180f4c86c3baf04e7fcaa4b761328b3e55b0c02d9b1d9a6e07a7ab3dfd9444`. Its scope/math proof is `source-v15-scope/morphology-scope.json`, SHA256 `e8f08b6c23fc8bd3ed9b5e40872dde8c9f4232a5f2e7ea1006d381b67d44a4b2`. All 1,128 v14 physical/light/camera object records, world/props/contact/anchor data remain exact. The saved node graph matches independent CPU density at 3,955 points with maximum absolute error `3.853e-8`; no GPU equality is claimed.

The literal v5 contract is `source-v15-small-preview/cloud-contract.json`: `pWarp=p+[12*N1-6,12*N0,16*N2-8]` uses the existing unweighted noise values, only for bank envelopes. The shared density threshold and substrate use original world coordinates. Three noise evaluations and 111 hash/floor nodes are retained. Expanded bank bounds fit the unchanged global volume. A sphere enclosing all 4,352 evaluated HERO vertices proves at least 0.796887 m cloud clearance under any pivot rotation plus 30 mm translation. The fixed interval bounds hold for all times, rather than relying on sampled hour-long visibility.

The authorized single-view launch ledger is `source-v15-small-preview/launch-plan.json`, SHA256 `953174b9f79d1b727d03d0e9094c64d47efc970b1e772a8503f76ed080901bfe`. Completion `0f7b0f2fc167e5600739277161f89566265d23dcff45f24e3e7a6aff371fc348` records exit 0 after 119.235 seconds, every pinned input unchanged, and the actual PNG/device/camera metadata hashes. Source FOV and aspect are preserved at half resolution. No full-size pair, atlas or full-quality batch has run for v15.

V16 child-only candidate

Source `cloud-cliff-source-v16.blend` has SHA256 `e1fab71cd2500b53a0c3d925b579352c428f023506567266f9b1c7f078cc85a5`. Independent proof `source-v16-scope/morphology-scope.json` has SHA256 `05eaaf5a44349c5dec7ed674d7d2b334befac4690a6b81391daab73b1d765baa`. All 1,128 physical14 records remain exact. The actual saved native graph contains exactly 48 child density envelopes and one substrate envelope, with zero opaque parent envelopes. Each group references four unique children and uses only its expanded AABB for culling. All children fit those culls.

Child horizontal radius ratios are 0.327–0.444 of their parent references; vertical ratios are 0.587–0.744. Tops drop 1–3 m below the parent top. The warp is `p+[12*N0-6,12*(.65*N1+.35*N2),16*N2-8]`, using the same three octave evaluations and 111 hash/floor nodes. Global bounds, all-time HERO clearance and substrate are unchanged. At 15,295 points, the saved graph versus independent CPU density has maximum error `8.089e-7` under the unchanged `1e-6` limit. This does not claim GPU equality.

One actual 720×450 desktop Metal8/OIDN view completed in 165.025 seconds. It is saved in `source-v16-small-preview/desktop`, with exact camera/device metadata. Launch ledger SHA256 is `bf4ff838cdc0b4b7e899f82dbba3e16fe20ae957a904e193bf23fdb27b16690c`; completion SHA256 is `77de758b6184d8abbd2b194686863c517c50c815b9249921c12933aaf0ef341e`. Every pinned input stayed unchanged.

The subsequent actual 1440×900 desktop and 390×844 phone pair is in `source-v16-full-preview`. Completion `dacb48e80af762bbd244160a496664aa2d422e1b3a2413c82653b6c09f063bd9` records 546.994 seconds, Metal/AUTO/eight samples/GPU OIDN, with the unchanged 45 W source basis on. Root selected this source only for an actual LOW8 app study. Broad foreground cloud heads and flat scan-top spans remain visible risks; no full64 or public replacement is approved.

Fresh actual preparation in `prepared-v16-scan-charts-fresh` uses cover1024/cliff512/far256. Every chart has a represented core, all region surface-area and coarse camera coverage are 1.0, and no distinct-world-position overlaps are found. The far region contains 72 source-owner-separated charts. Its native-triangle-texel surface-area fraction is only 0.2966686: chart representation is complete, while distant triangle detail remains an explicit optical limit. Photo UV0, material bindings, actual physical geometry, world corner normals and tints are protected by independent transfer checks. The scan packing branch uses the source photo-chart topology only as UV2 input, scaled uniformly by 100 for xatlas numeric stability; it does not rewrite material UVs or source positions.

Immutable actual proof inputs are in `contact-replay-v16`. Prepared SHA256 is `49f0f49104141d5858eb1d15fbdb75fc07ae603617d54faccb5e026ac7506ed7`, static raw is `52705b20824fe87d8b9e17a64c79b7bf5b52a975bdeabb3dea444ac8f4428286`, and HERO raw is `61b78a88622075c565400118fc03a8b2cdab067ddc1e64dbb5d31cd14df4cd3e`. Mapping, raw NORMAL, PBR factors/image/UV-transform, actual 18-group/six-hanging and 19+16 guard checks all pass. Static/HERO raw world normal maximum errors are respectively 1.78814e-7 and 1.19209e-7 under the unchanged 1e-6 limit. The actual contact receipt is `c366159fd20f9bf02cac0af347bc811152786082812957fd181d3df180efddd4`.

The isolated `cloud-field-v6.js` is not active against old source11 public assets. It requires the actual source16 SHA and child-only v6 metadata. CPU evaluation against 2,454 saved native-node samples has maximum density error 6.66134e-16 (`runtime-field-v6-proof/cpu-port-proof.json`, SHA256 `6fb17811d45794562148ec35b1460c8427a3b9f19294f48e37bd34c80b829d43`). The shader evaluates the three noises once per candidate point, uses conservative parent-group and child AABB culls, and has no parent density term. This CPU result does not establish GPU equality or runtime performance.

The geometric upper-silhouette audit in `source-v16-silhouette/silhouette.json` reports the longest remaining low-relief span on Far massif02: desktop 97 px with 4.213 px total vertical range; phone 80 px with 2.623 px range. Only actual first-opaque-hit far contour columns count. This quantifies a visual risk, not an automatic realism verdict. No source 17 correction has been authored.

The authorized fresh twelve-map LOW8 batch is staged separately in `runtime-eval-v16-native8`. Its launch ledger `a20c8bd98af1add9858fb7d66b9374bb461335df82d62b7fbddfcd15477dbe61` pins 22 inputs and 22 source asset files. No previous GI is imported. Native completion, complete packaging, decoded delivery contacts, literal runtime-field activation and actual app review remain required; this paragraph does not claim the running batch or delivery is complete.
