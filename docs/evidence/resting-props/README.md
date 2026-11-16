# Resting props: source and prepared contact evidence

The current frozen source is `art/build/snow-roof-resting-contacts-accepted.blend`, SHA256 **`b31360516a2713a6451ca920f3f94d9fefd9bc191bc07fca63c8c5ddce5a0c86`**. Its source audit passes all37 groups. The actual fresh prepared/raw contact gate now **passes all37 groups in both stages**. No new complete delivery or browser approval is claimed.

The preserved2ee source passed source/native checks, but actual prepared **and exported raw triangles** put its cushions at **5.014837/5.044162mm** penetration, beyond the literal5mm guard. The baker stopped the partial batch (exit143); its pixels will not be reused. The new source raises only both cushion groups by **0.2mm**. Old2ee,6e9f, masters, rejected replay and50µm helper recipe remain immutable. `source-history.json` records this failure honestly.

The legacy evaluated inner lamp-foot gaps are **44.497371mm** and **44.493556mm**. The original turned pedestal top was an open ring, so a centre ray could not legitimately use its highest rim as a solid support. The fix adds real top faces, places the console/pedestals themselves on actual uneven paving, and places both inner lamps on the actual scanned console surface. Complete lamp groups include their8 W point light and wick; the burner includes its ash/sticks, which also have their own explicit nested support checks. Nested bowl bases use the real lowest-vertex set so a cavity centre is not mistaken for the bearing annulus.

## Implementation and guards

`art/blender/snow_roof.py::resting_contact_height(x,z,support_meshes)` returns engine-Y height from a downward ray into owned evaluated support triangles. Every resting-group translation actually calls this helper at an evaluated lowest bearing vertex. `art/blender/resting_contacts.py` owns the common semantic group registry, support BVHs and placement. The audit independently casts its own rays instead of trusting the placement return value. Import normalization bounds are used only for source asset scale/alignment; bounds never supply contact height.

The final audit covers **37 semantic groups / exactly 176 objects**, with no unregistered loose/scanned prop candidates.36 groups use the literal limits **gap≤0.002m** and **all-vertex penetration≤0.005m**, without epsilon widening. The one mounted bearing-rail group has four actual mesh fasteners intersecting the declared rear masonry; it is explicitly mechanically mounted, not an unexplained floating-screen exception. The three scanned leaves and both edge moldings then receive normal downward resting checks against the physical rail.

The first zero-gap cushion placement failed on uneven paving at 5.1373mm and 5.6583mm penetration. Placement now uses only the small extra lift needed to satisfy the unchanged 5 mm limit while independently retaining the 2 mm gap limit. No soft-body deformation or threshold relaxation is hidden. Current source maximum gap is **0.908315mm**; maximum penetration is **4.750013mm**. Placement safety is250µm; the gap/penetration limits remain exactly2/5mm.

On an unsaved loaded copy, translating inner lamp `altar -0.95` upward 3 mm fails the gap guard (measured 3.000021mm); lowering it 6 mm fails penetration (6.000042mm). Every matrix is restored exactly, the full audit passes again, and saved-source hashes remain unchanged. `contact-audit.json` retains the actual challenges and source-backed measurements.

## Complete contact table

The net correction includes any later semantic-parent translation. Support Y, gap and penetration are actual evaluated ray results. A single bearing point/annulus may contact while other lowest vertices span a bowl cavity or paving joint; every evaluated member vertex is still checked for penetration.

| Semantic group | Actual selected support | Net ΔY(mm) | Contact support Y(m) | Gap / max penetration(mm) |
|---|---|---:|---:|---:|
| scanned console altar | Settled irregular paving stone.036 | +5.5870 | 0.605587006 | 0.0000 / 0.1979 |
| turned pedestal -1.45 | Settled irregular paving stone.035 | +5.9646 | 0.605964661 | 0.0000 / 0.0000 |
| turned pedestal 1.45 | Settled irregular paving stone.040 | -0.4097 | 0.599590302 | 0.0000 / 0.0000 |
| wall-mounted screen bearing rail | Hall rear wall (4 fasteners) | +0.0000 | wall-fixed | mount / mount |
| mounted screen leaf 0 | Wall-fastened screen bearing rail | +0.0031 | 1.300003052 | 0.0000 / 0.0000 |
| mounted screen leaf 1 | Wall-fastened screen bearing rail | +0.0031 | 1.300003052 | 0.0000 / 0.0000 |
| mounted screen leaf 2 | Wall-fastened screen bearing rail | +0.0000 | 1.299999237 | 0.0007 / 0.0000 |
| screen edge molding -2.34 | Wall-fastened screen bearing rail | +0.0031 | 1.300003052 | 0.0000 / 0.0000 |
| screen edge molding 2.34 | Wall-fastened screen bearing rail | +0.0000 | 1.299999237 | 0.0007 / 0.0000 |
| altar -1.45 | Turned altar side lamp pedestal | +5.9673 | 1.635967255 | 0.0000 / 0.0000 |
| altar -0.95 | Scanned console altar chinese_console_table | -38.9127 | 1.591087341 | 0.0000 / 0.0000 |
| altar 0.95 | Scanned console altar chinese_console_table | -38.9088 | 1.591091156 | 0.0000 / 0.0000 |
| altar 1.45 | Turned altar side lamp pedestal.001 | -0.4071 | 1.629592896 | 0.0000 / 0.0000 |
| burner ash | Brass incense burner with rolled lip | -30.0398 | 1.718959808 | 0.0004 / 0.0000 |
| charred incense 0 | Ash mound in brass burner | -29.4166 | 1.731880188 | -0.0035 / 0.0035 |
| charred incense 1 | Ash mound in brass burner | -35.2302 | 1.726066589 | -0.0035 / 0.0035 |
| charred incense 2 | Ash mound in brass burner | -32.2738 | 1.729019165 | 0.0004 / 0.0000 |
| charred incense 3 | Ash mound in brass burner | -31.6176 | 1.729675293 | 0.0004 / 0.0000 |
| charred incense 4 | Ash mound in brass burner | -30.5076 | 1.730781555 | 0.0042 / 0.2906 |
| charred incense 5 | Ash mound in brass burner | -34.1010 | 1.727191925 | 0.0004 / 0.0000 |
| charred incense 6 | Ash mound in brass burner | -33.8569 | 1.727432251 | 0.0042 / 0.0000 |
| charred incense 7 | Ash mound in brass burner | -32.8002 | 1.728492737 | 0.0004 / 0.0000 |
| charred incense 8 | Ash mound in brass burner | -30.3969 | 1.730892181 | 0.0042 / 0.0000 |
| smouldering incense 0 | Ash mound in brass burner | -19.6034 | 1.730396271 | 0.0004 / 0.0000 |
| smouldering incense 1 | Ash mound in brass burner | -17.1385 | 1.732826233 | 0.0004 / 0.0000 |
| smouldering incense 2 | Ash mound in brass burner | -17.0060 | 1.732948303 | 0.0042 / 0.2573 |
| smouldering incense 3 | Ash mound in brass burner | -19.3707 | 1.730564117 | 0.0004 / 0.1980 |
| altar burner assembly | Scanned console altar chinese_console_table | -30.8911 | 1.591087341 | 0.0000 / 0.0000 |
| kneeling cushion -1 | Settled irregular paving stone.066 | -5.2210 | 0.592891693 | 0.3873 / 4.7500 |
| kneeling cushion 1 | Settled irregular paving stone.068 | +2.1245 | 0.599716187 | 0.9083 / 4.7500 |
| leaning broom | Settled irregular paving stone.029 | -41.1218 | 0.597290039 | 0.0000 / 0.0249 |
| stacked bowl 0 | Settled irregular paving stone.044 | -1.9242 | 0.598075867 | 0.0000 / 0.0000 |
| stacked bowl 1 | Stacked plain bowls | -6.9211 | 0.648078918 | 0.0000 / 0.0000 |
| stacked bowl 2 | Stacked plain bowls.001 | -11.9180 | 0.698081970 | 0.0000 / 0.0000 |
| stacked bowl assembly | Settled irregular paving stone.044 | +0.0000 | 0.598075867 | 0.0000 / 0.0000 |
| gate -1 | Gate lamp shelf | +0.0023 | 1.600002289 | 0.0000 / 0.0000 |
| gate 1 | Gate lamp shelf.001 | +0.0023 | 1.600002289 | 0.0000 / 0.0000 |

`inventory.json` lists all 176 actual object identifiers and semantic memberships. `corrections.json` includes every declared support mesh, incremental and net translations, chosen evaluated vertex and support polygon. `anchors.json` retains all six exact wick/light entries and four actual incense tips; runtime uses `wickTip`, not `flameAnchor`, for the flame origin. The generated smoke point is `[3.567896783351898e-06, 1.970379114151001, -4.849999904632568]` in engine-world coordinates, derived from the evaluated tips plus 6 mm. Metadata includes original wick/light/rod identifiers for independent export correspondence.

## Geometry and lighting scope

Static meshes are 3082→3087: the only added meshes are the bearing rail and four fasteners; two existing pedestal meshes gain closed top faces. Other intended changes are registered physical prop/support placements. Six associated8 W source fixture positions follow their groups; their energy/colour remain unchanged. Moon, sky, visitor-lamp basis and other source light settings remain unchanged. The bank builder invocation now follows its required ground creation; its isolated RNG/geometry are retained, with `step_snow_top_faces` recorded for the fresh proof pipeline.

Compared with2ee, the only physical changes are82 cushion component meshes translated+0.2mm. No meshes were added or removed, all other group placements and actual light snapshots are exact, and all wick/incense/smoke values are unchanged.12 unrelated modifier records differ in storage/UV roundoff; their authored geometry/UV0/transforms and evaluated position/normal/tint triangle multisets are exact. Maximum evaluated bevel-UV difference is **2.384185791015625e−7UV**, at most **0.000244140625 of a source texel**, recorded per-object in `architecture-comparison.json`.

The original contact fix versus6e9f added only the bearing rail/four fasteners, closed two existing pedestal tops, and moved declared physical groups. Historical nine-view Metal8/OIDN approval binds2ee, not the newly rebaked delivery: `native-preview-index.json` and its actual metadata hash preserve that distinction.

`art/blender/audit_prepared_resting_contacts.py` independently associates evaluated source vertices with **actual prepared and raw exported triangles**, then repeats all36 downward resting checks and the four fastener rays, plus wick/incense correspondence. It records current source SHA, receiver geometry/UV fingerprints and literal guards. `bake_export.py --resting-contact-audit` rejects absent/failed/wrong-source/wrong-receiver receipts before BAKE_START. A source-only PASS is insufficient.

## Actual prepared/raw gate

`prepared-raw-contact-audit.json` is the actual fresh replay, SHA **`c7339acd30137c33398c8df122516f31b0405a5093dbace21c072db931bc38dc`**, binding sourceb313 and receiver geometry **`89d4085e7b4ed662ab952b1430e9217b3c9befad602e1c317ae3ea659d848821`**. Its immutable raw snapshot is SHA `7639d7bffc629aba69a852155d8980a5735abc7e567362fd09f4cc6ff74f308a`. Every source vertex is associated; maximum association error is0.358µm. Both actual prepared and raw triangle stages pass37 groups, including independent four-fastener support rays. Cushion penetrations are **4.814863/4.844189mm**; maximum gap is **0.908315mm**. Wick and incense-tip coordinates agree within **1.907349µm**; complete scene anchor strings remain byte-exact.

Raw glTF repeats coordinates at UV/normal/material seams. Crown centroids therefore use unique actual spatial coordinates; duplicate storage must not change physical anchor position. The initial naive duplicate-weighted raw average was rejected and corrected in the audit only, with no authored data or metadata change.

`pre-bake-guard-proof.json`, SHA **`34a4af3325a871aff69ae84f4700fed95fe6025f04be5cdc20e63204a362f9b6`**, exercises the actual baker validator. The genuine measured receipt passes; all **19** missing/failed/wrong-source/geometry/UV/group/anchor/raw and just-over-literal-limit challenges fail beforeCycles. Pure unrelated metadata is accepted with unchanged receiver/UV fingerprints. Source, prepared snapshot, raw snapshot and receipt remain unchanged. All checks are CPU geometry/math only; no rendering, baking or encoding occurred in these audit commands.

## Provisional export identity

Post-guard raw `c3539702…` is a measured provisional export, not a final delivery identity. `provisional-raw-contact-chain.json` proves its complete binary payload and every non-scene JSON field are byte-exact to the actual contact-tested raw7639. Every previously certified scene extra is unchanged; only prepared-contact and prepared-preview proof bindings were added. `scripts/audit-resting-export.mjs` implements this reproducible comparison and the later decoder-only FLOAT32/source-anchor audit. Its full FLOAT32 mode is prepared but cannot claim results until actual new candidates exist.

`provisional-face-raw-correspondence.json` records actual fresh FACE-to-export correspondence: **650,936 source triangles**, **183,750 source-proven hidden triangles**. **3,292** other triangles with the reserved UV marker remain retained; the marker alone never authorizes pruning. All visible architecture, resting props and bake occluders remain intact. The sole fresh FACE reference is `art/build/resting-contacts-export-study/hidden-reference/reference.json`, SHA `473d5376b90a6f7b7add3e9032887dfa0346faac7653449ae609b7aa6573bc79`, bound to sourceb313, prepareda49fe4 and fresh hidden proofcf525. Actual post-batch raw/F32/prune hashes and retained-stream audits must be measured again before adoption; no provisional hash is substituted by hand.

## Reproduce the source audit

```sh
blender --background --python-exit-code 1 --python art/blender/snow_roof.py -- \
  --output art/build/NEW-resting-source.blend
blender --background --python-exit-code 1 --python art/blender/audit_resting_props.py -- \
  --blend art/build/NEW-resting-source.blend --challenge \
  --legacy art/build/snow-roof-stair-banks-grain.blend --out art/build/NEW-resting-audit.json
blender --background --python-exit-code 1 --python art/blender/compare_resting_architecture.py -- \
  --audit art/build/NEW-resting-audit.json --out art/build/NEW-resting-architecture.json
```

These commands perform CPU modeling/audits only, no Cycles render, bake, denoise or image encoding. Full new GI is a separate source/UV/Generated-gated Metal 64-sample/OIDN operation owned by the baker. `handoff.json` pins the actual files and source scripts used for this frozen source.

After fresh preparation, copy the actual prepared/raw files into a new proof directory and run:

```sh
blender --background --python-exit-code 1 --python art/blender/audit_prepared_resting_contacts.py -- \
  --source-audit art/build/snow-roof-resting-contacts-accepted.audit.json \
  --prepared art/build/NEW-proof/snow-roof-prepared.blend \
  --raw art/build/NEW-proof/snow-roof.raw.glb --out art/build/NEW-proof/contacts.json
```

No source, prepared file, master or live package is saved by this replay. A failure must stop baking; the preserved failed2ee replay confirms the prepared and exported measurements agree.

The provisional export/anchor identity check is reproducible without Blender:

```sh
node scripts/audit-resting-export.mjs \
  --source-audit art/build/snow-roof-resting-contacts-accepted.audit.json \
  --contact-audit art/build/resting-contacts-accepted-replay/contacts-unique-crowns.json \
  --raw art/build/resting-contacts-export-study/snow-roof.raw.glb \
  --out art/build/NEW-raw-contact-chain.json
```

Add `--float32 ACTUAL_F32.glb --baseline ACTUAL_MOBILE_POSITION16.glb` for the independent decoder-only final export check. That mode requires exact authored FLOAT32 world-position/winding identity, unchanged nonposition triangle streams, material graph and embedded image bytes, plus actual source-backed wick/incense scene extras. It does not encode or adopt anything.
