# Snow Roof pilot — geometry review before baking

**The listed construction features now have visible evidence.** The review caught a real tile-course defect: the earlier lower lips were coplanar at their overlaps. The corrected model raises those lips by 18 mm; close construction images now show separate overlapping segments. This clears the construction-evidence check. It does **not** establish final photographic realism or runtime readiness.

Review scope: the rebuilt Snow Roof pilot only. No browser, product test suite, render or bake was launched by the reviewer. The builder supplied the CPU previews; the reviewer inspected the images and ran a separate read-only light/world comparison.

## Old and new framing

[Six-view side-by-side contact](geometry-v3/comparison-contact.jpg) · [Full standalone comparison](geometry-v3/comparison.html) · [Camera and preview evidence](geometry-v3/geometry-evidence.json)

| Requested view | New CPU preview | Finding |
|---|---|---|
| Outside | [outside](geometry-v3/outside.png) | Gate, compound walls, roof profile and snowy approach are visible. |
| Walk 1 | [walk 1](geometry-v3/walk-1.png) | Matches the intended near-outside reference pose. |
| Walk 2 | [walk 2](geometry-v3/walk-2.png) | Closer gate framing shows the roof courses, open passage and hall beyond. |
| Walk 3 | [walk 3](geometry-v3/walk-3.png) | Interior framing shows columns, painted beams, the scanned table/screen and irregular paving. |
| Choose camera | [choose](geometry-v3/choose.png) | Construction framing only; the live visitor lantern is not part of this static preview. |
| Lit camera | [lit](geometry-v3/lit.png) | Construction framing only; this is not the final runtime lit state. |

All six camera positions match the intended source/estimated reference poses within 0.000002 m, rotations within 0.00001°, and vertical FOV is 32°. These are comparisons with [the camera manifest](reference-cameras.json), not proof that the original PNG camera was recovered exactly. The original outside/close views contain unrecorded camera drift; the old walk 2/3 poses were fitted approximately from visible landmarks.

Previews are 720×450, Cycles CPU, 8 samples. The source SHA is `96e491e873c60ec973d0fbe94622eb22714e59da3e1336ea5d5e6ade37359356`; the blend SHA is `d12cfe548102cecfc518e574072dc55cf77e48b7b9630666aa46c89ac05cadfc`. The prior pre-fix comparison remains under `geometry-v2` for traceability.

## Criterion-by-criterion image review

| Criterion | Inspected image evidence | Verdict and observation |
|---|---|---|
| Curved roof and upturned eaves | [Eave detail](geometry-v3/EaveDetail.png), [ridge detail](geometry-v3/RoofRidgeDetail.png) | **Shown.** The roof has a concave profile, a lifted edge and raised corner silhouette, replacing the flat folded slabs. |
| Individual tile rows and overlaps | [Close tile diagnostic](geometry-v3/diagnostic-TileCourseDetail.png), [normal snowy ridge](geometry-v3/RoofRidgeDetail.png) | **Shown in the labelled construction diagnostic.** Pan and cover segments have distinct raised cross-course lips and exposed tile ends. Much of this construction is covered by snow in the finished appearance. |
| Ridge ends | [Ridge detail](geometry-v3/RoofRidgeDetail.png), [roof diagnostic](geometry-v3/diagnostic-RoofRidgeDetail.png) | **Shown.** Segmented ridge caps terminate in raised end pieces with readable thickness and a connection to the roof line. |
| Bracket sets | [Eave detail](geometry-v3/EaveDetail.png), [beam detail](geometry-v3/BeamJoineryDetail.png) | **Shown.** Offset, curved and stacked supports connect the round column heads to the eave/beam structure. Fine concealed joinery is not claimed. |
| Round columns and stone bases | [Door/floor detail](geometry-v3/DoorFloorDetail.png), [walk 3](geometry-v3/walk-3.png) | **Shown.** Round red shafts and full stone plinths are visible, seated on the terrace/floor. |
| Painted beam panels | [Beam detail](geometry-v3/BeamJoineryDetail.png), [walk 3](geometry-v3/walk-3.png) | **Shown.** Framed red fields, gold diamond motifs and vertical painted medallions are visible; this is more than a uniform painted bar. |
| Studded door leaves | [Door/floor detail](geometry-v3/DoorFloorDetail.png), [walk 3](geometry-v3/walk-3.png) | **Shown.** Separate open leaves show round studs, a ring pull, edge hardware and jamb attachment. |
| Worn step edges | [Step wear detail](geometry-v3/StepWearDetail.png), [door/floor detail](geometry-v3/DoorFloorDetail.png) | **Shown as sculpted wear.** The nosings are rounded and undulating, and stone joints break the tread surface. The wear remains fairly regular; fine localized chips are subtle at this preview resolution. |
| Irregular paving | [Walk 3](geometry-v3/walk-3.png), [door/floor detail](geometry-v3/DoorFloorDetail.png), [step detail](geometry-v3/StepWearDetail.png) | **Shown.** Individual joints, varied stone sizes and nonuniform edges replace a single plane or uninterrupted regular grid. Tiny height changes are less legible than the joints. |
| Actual Poly Haven altar/table asset | [Walk 3](geometry-v3/walk-3.png), [lit camera](geometry-v3/lit.png), [local source check](geometry-v3/asset-source-check.json) | **Shown with source provenance.** The console has shaped legs, apron and worn timber surfaces rather than the previous rectangular altar placeholder. The source model is `chinese_console_table`. |
| Actual Poly Haven screen asset | [Walk 3](geometry-v3/walk-3.png), [lit camera](geometry-v3/lit.png), [local source check](geometry-v3/asset-source-check.json) | **Shown with source provenance.** Framed bird panels and moulded lower fields are identifiable in the render. The source model is `chinese_screen_panels`; this replaces the previous blank panel. |

The roof diagnostics temporarily hide eight roof-snow caps to expose the construction. Their [metadata](geometry-v3/diagnostic-preview.json) records the hidden objects and the same frozen blend/source hashes. The source blend is not saved with that visibility change. These images are explicitly **not** the final Snow Roof appearance.

Ten local table/screen source files match the recorded hashes in [the source/license manifest](../../licenses/snow-props.json). That file identity check supplements the visible asset evidence; source keywords alone were not used as a visual acceptance check.

## Approved lighting preservation

[Read-only light/world fingerprint comparison](light-rig-preservation.json) compares `snow-roof-before-architecture.blend` with the final corrected architecture blend. All **9 source lights** have identical transforms, colors, energy, radii, shape, visibility and node graphs. World shader nodes/input values/links and color-management settings are also identical. There are zero differences, and both blend files are unchanged after reading.

Source-rig identity is separate from pixel identity. New geometry and materials alter occlusion, reflections and indirect bounce. The comparison does not equate emissive material/mesh changes with source light-object identity.

## Remaining limits

This review establishes visible construction, not a finished release. The live red gauze lantern, changing light/shadow, weather, UI, endings and continuous runtime walk still need the integrated browser captures. Final baked lighting, compression, the approximately 8 MB payload and phone frame rate are not established by these CPU previews. Exterior winter trees and snow wear remain simple, and the step wear could be less regular. No other place or cover work was performed for this review.
