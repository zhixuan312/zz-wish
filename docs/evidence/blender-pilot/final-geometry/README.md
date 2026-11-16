# Snow Roof final stair geometry evidence

The accepted source is `snow-roof-stair-banks-grain.blend`, SHA `6e9f59c93565e08a690eaafbc756967ba39e0f4d8ad0094e4520265948360af8`. These are actual Cycles source previews on Apple M1 Metal, **8 samples**, OpenImageDenoise, 960×600, maximum 4 bounces. No runtime lightmap-delivery claim is made here.

## Accepted views

[Original preview metadata](accepted-preview.json) and [byte-preservation manifest](evidence-manifest.json) retain the actual device, samples, camera and source-hash fields.

![Accepted wide stair view](accepted-StepBanksWide.png)

![Accepted detail view](accepted-StepBankDetail.png)

The two banks remain continuous across the treads and risers, wrap beyond the outer stair edges, and meet the ground snow while leaving the center steps clear. The terrace junction no longer contains the dark triangular cutouts seen in the rejected connected-bank study. The final detail removes the parallel Generated-coordinate grain bands without changing the accepted geometry.

## Qualitative before/after

| Rejected study | Visible issue | Accepted change |
|---|---|---|
| [Six patches](study-pads-StepSnowDetail.png) | Separate white pads had a bare-stone perimeter on every tread. | Two connected banks follow the outer stairs into the ground snow. This is a qualitative comparison using different wide camera positions. |
| [First connected bank](study-cutouts-StepBankDetail.png) | Bank triangles dropped through the terrace front, producing black cutouts and a hard lower shell seam. | A continuous envelope clears measured stone extrema, carries the cap behind the terrace edge and crosses below ground with a tangent taper. The detail camera matches. |
| [Joined geometry with compressed grain](study-stripes-StepBankDetail.png) | Copying the ground's tiny vertical Generated texture extent produced severe horizontal grain bands. | Only the two bank mesh texture-space Z sizes changed, from 0.211474642 to 29.5. XY size/location, materials, lights and all geometry stayed unchanged. The detail camera matches. |

## Source and proof chain

[Original-to-joined audit](audit-original-to-joined.json) records six former snow objects removed and two closed connected banks added, with all other 3,080 static meshes, court/gate geometry, shared materials and lighting unchanged. [Joined-to-final audit](audit-joined-to-final-grain.json) verifies all 3,082 final mesh geometry records remain byte-identical during the coordinate-only grain correction.

The [final proof summary](final-proof-summary.json) and [exact-equality receipt](final-proof-validation.json) bind the accepted source to its fresh hidden-tile proof. All selected objects, components, face ranges, clearances and 44,616 camera occlusion checks exactly match the original frozen proof. Full source/bake occluder geometry remains intact.

The final raw/packed export, optimization profile and browser journey still need their own actual-asset verification. These source previews do not substitute for that evidence.
