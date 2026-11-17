# Snow Source20 — Round2 source and delivery

Source20 is the accepted Round2 state. Its visible reasons are Source19's broad gate/court glare and flat-looking cushion. The earlier combined picture already accepted the softer lantern pool, cloth gradient, connected burner handles, varied ash/incense, compressed cushions, ceramic/bamboo readability, closed steps and exterior corrections. The floor rings were isolated to the runtime cached-shadow lookup and fixed there; no additional floor material change was made for them.

The frozen source is `art/build/snow-roof-round2/source-v20.blend`, SHA256 `b44a73486d43212881bea678bedb3cad82907e26d9ba6d2910ba052e5593d0fb`. It retains Source19 geometry and all47 semantic groups. Source/prepared/raw contacts pass the literal2mm gap/5mm penetration guards; UV0/tint/geometric-normal and actual raw NORMAL regressions pass. Full audits, scenes, native pictures and EXRs remain ignored under `art/build/snow-roof-round2/`.

The visitor remains at[-1.5,2.25,-1.3],.8W,3cm effective finite radius, warmRGB[1,.43,.13]. Cloth reflection .35/transmission .065/shadow throughput .022, pre-exposure40 and residual .35EV remain unchanged. Only the two gate points(.475→.07125W) and court point(.3→.045W) change power. Actual wick metadata follows those source values. Cushion geometry/albedo/UVs/roughness remain; its modest .15 normal is a128px derivative of the already-licensed rough_linen data. Both cushion derivatives are recorded in `docs/licenses/lantern-fabric.json`.

Accepted pictures are `fixture-material-native8/{GateFixture,CourtFixture,CushionDetail}.png`, with actual Metal8/OIDN device/camera/settings in sibling JSON. The complete source chain is frozenSource18 → `snow_round2_interior.apply` +`snow_round2_exterior.apply` +fresh actual runtime proxy → Source19 → `snow_round2_fixture_materials.apply` → Source20. The real support helper and updated smoke-tip metadata remain active.

## Reproduce

Use fresh outputs; the save wrappers refuse overwrites. Preserve the ignored frozen source/proxy inputs identified by their actual receipts. The actual Source20 save invocation was:

```sh
blender --background --python-exit-code 1 \
  --python art/blender/preview_snow_round2_fixtures.py -- \
  --output art/build/snow-roof-round2/source20-choice \
  --save-source art/build/snow-roof-round2/source-v20.blend \
  --approved-picture art/build/snow-roof-round2/fixture-material-native8/candidate.json
```

Preparation uses `scripts/prepare-snow-priority-atlas.py --fresh-source --hall-size 1408 --court-size 1328 --refine-underside`, with explicit Source20 source/hidden-proof/output arguments. The exact invocation and copied code are in `prepared-v20/preparation-recipe.json`.

The one final batch is recorded in `final20-native-ledger.json` and `final20-native-completion.json`: all16 maps64 fixed samples, M1 Metal bake +Metal OpenImageDenoise, AUTO threads, adaptive/animated seed off,343.665s native total(344.837s wrapper), no previous GI reuse. Ambient passes are DIRECT+INDIRECT; the lantern atlas is INDIRECT only. Masters retain source radiometry; normalization is applied exactly once.

```sh
python3 scripts/package-snow-compact-preview.py \
  --source art/build/snow-roof-round2/final20-native64 \
  --out art/build/snow-roof-round2/final20-packaged \
  --source-blend art/build/snow-roof-round2/source-v20.blend \
  --hidden-proof art/build/snow-roof-round2/source-v20-hidden-faces-20mm.json \
  --source-audit art/build/snow-roof-round2/source-v20.audit.json --final
```

The final package retains source-F32 physical positions/winding/transforms, proven hidden-roof-only removal, declared bounded UV/normal/U8 storage and the protected scan-image policy. It independently replays all47 decoded contacts. The model wrapper is lossless Zstd. Native AgX's shared116705B must also count against the15,000,000B complete budget.

Final packaging and complete public installation pass. Actual final-app/performance/stranger checks remain separate; [the compact final receipt](../round-2-snow20-final.json) records the actual proof chain. Earlier Source19 LOW8 is a preview, never a public/final64 substitute. Source18 and its committed Round1 evidence remain historical and immutable.


## Installed delivery

The public Snow directory was replaced wholly from `final20-delivery/`; exactly21declared files remain. Source18's old directory is preserved only in ignored history.

| Item | Actual hash / bytes |
| --- | --- |
| Manifest | `0ffd1c87dc92720346c47d62f99b1fcb02a2fa61872fd49cbd7f5f8682c4730d` |
| Zstd model | `ad89904f03d25d8d61a69d8767ddf826ecb7c67695a26bcc6525961acd8bc627` /6,085,016B |
| Decoded model | `6142b1d2db98de88e1dd0f5b4b8a226b6ecae04c5d780c897b4741a256fe53c0` /10,294,072B |
| Local payload /manifest /shared view |14,725,342 /26,896 /116,705B |
| Complete /budget |14,868,943 /15,000,000B |

Source-F32 retained physical positions/winding/transforms and runtime anchors remain exact. UV/normal/U8 storage follows the measured declared policy; this is not an all-attributes-source-exact claim. All47 decoded contacts pass.

The image helper originally assumed every unprotected normal must become256px, and correctly stopped when the official encoder retained the new128px source. It now treats256 as a maximum: six larger architecture maps downsample; the128px linen payload remains byte-exact. Completed earlier package stages were preserved, then precision/contact/assembly/Zstd steps resumed. `final20-packaged/resume-recipe.json` and `package-receipt.json` record that recovery; no native/source/master edits or rebake occurred. The normal helper and full packaging driver reproduce the corrected complete pipeline from fresh outputs.
