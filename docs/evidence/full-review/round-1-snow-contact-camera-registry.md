# Source17 contact-camera registry

All 47 real contact-group IDs have diagnostic views and phone overrides. The previous registry of 52 views registry contained duplicate screenshot names because its slug generator discarded minus signs. Negative and positive altar, pedestal, cushion, gate and molding views could overwrite each other. The new registry preserves negative signs as `minus-` and has 52 unique filenames. Old actual files remain immutable.

Only two diagnostic phone poses moved: the left/right screen-bearing cameras retreat from Z −5.1 to −4.1, preserving X/Y/look/FOV 82. This brings both edge-molding bearing targets inside the portrait frame. No product camera or scene geometry changed. The source-derived registry is `art/build/snow-roof-round1/source-v17-handoff-v2/closeups.json`; exact hashes and the complete audit are in [round-1-snow-contact-camera-registry.json](round-1-snow-contact-camera-registry.json).

All 47 groups have an in-frustum bearing target in both viewports, with no actual new gauze-proxy intersection on these rays. An independent runtime-geometry check of the original registry found zero proxy/cord obstructions across 104 poses and 936 central/near-central rays, with eye clearance above 30 mm. A separate actual-runtime addendum checks both changed phone poses: 18 rays, zero body/cord hits and at least 0.2 m capped eye clearance.

These are bearing closeups: upper shafts/screens are intentionally outside some frames. Mathematical coverage does not establish whole-scene visibility, material detail, shadows or HUD clearance; actual final contact captures remain required.
