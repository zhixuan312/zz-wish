# Snow Roof pilot — geometry review before baking

Status: **awaiting the rebuilt CPU previews**. No geometry acceptance is inferred from builder function names or object names. Lighting is outside this review's edit scope and must retain the approved setup.

The six framing references are [outside](reference-desktop/outside.png), [walk 1](reference-desktop/walk-1.png), [walk 2](reference-desktop/walk-2.png), [walk 3](reference-desktop/walk-3.png), [choose](reference-desktop/choose.png), and [lit](reference-desktop/lit.png). Their source/estimated camera poses and limitations are recorded in [reference-cameras.json](reference-cameras.json). The old walk positions are image-fit estimates, not quarter-path samples.

## Required view evidence

| View | New evidence | Current finding |
|---|---|---|
| Matched outside | Pending CPU preview | Unverified |
| Matched walk 1 | Pending CPU preview | Unverified |
| Matched walk 2 | Pending CPU preview | Unverified |
| Matched walk 3 | Pending CPU preview | Unverified |
| Matched choose | Pending CPU preview | Unverified |
| Matched lit | Pending CPU preview | Unverified |
| Eave detail | Pending CPU preview | Must expose roof courses, ridge end, and bracket construction |
| Door/floor detail | Pending CPU preview | Must expose door hardware, a full column/base, paving, and worn step edges |

## Geometry criteria

| Criterion | Visual evidence required | Current verdict |
|---|---|---|
| Curved roof and upturned eaves | A continuous concave roof profile and lifted corner silhouette, rather than a folded flat slab | Unverified |
| Individual tile rows | Separate overlapping pan/cover courses and tile-end thickness, with joints or relief visible | Unverified |
| Ridge ends | Discrete end construction with readable thickness and attachment to the ridge | Unverified |
| Bracket sets | Multiple interlocking supports carrying beams/eaves, with visible curvature, offsets, and load path | Unverified |
| Round columns and stone bases | Cylindrical column silhouette, a seated shaft, and a full stone plinth with contact | Unverified |
| Painted beam panels | Readable painted fields/motifs and framing on the beam faces, beyond a uniform paint color | Unverified |
| Studded door leaves | Separate door leaves with visible studs, hinges/straps, handles and credible jamb attachment | Unverified |
| Worn step edges | Chipped or rounded edge geometry and asymmetric wear at the walking line | Unverified |
| Irregular paving | Individual joints, varying stone sizes/edges and visible settling or relief | Unverified |
| Actual Poly Haven altar/table scan | Imported furniture identifiable in the image, with source/file provenance matching its delivered model | Unverified |
| Actual Poly Haven screen scan | Imported panel geometry identifiable in the image, with source/file provenance matching its delivered model | Unverified |

A feature hidden by distance, darkness, occlusion, or low preview resolution stays **unverified**. An extra angle can establish geometry without changing the approved lighting. Low-sample CPU previews establish construction only; they do not establish final bake quality, runtime compression, size, device performance, or photographic realism.
