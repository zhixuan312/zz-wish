# Pine Gate Steps

## M1 — Procedural vertical slice

Pine Gate Steps is a fictional temple approached by a stone stair. The candle sits in a recess in the gate pier. The chooser supports both duration presets and drawn profiles. Each profile supplies the actual outline, offset and color rendered in the niche and in My Lamps.

The existing monotonic burn clock supplies the remaining fuel fraction. Cutting the profile from the top, using the same frustum volumes as duration, keeps narrow sections burning down faster than wide sections. The cut determines the wick and flame position. The runtime wax surface combines a rounded lip, a glossy recessed melt pool, wax tears and warm scattering from the flame. The point light follows the wick and lights nearby stone. The geometry and color also feed the record thumbnail.

Natural completion consumes the candle body into a wax trace on the holder. Going out stops at the settled cut and briefly emits smoke from the wick. Reloading a burning page settles the original candle. My Lamps reconstructs the ending from the saved elapsed time and original shape, and another lighting creates a new record. The selected duration is a product rule tied to the profile volume.

M1 evidence uses the real UI and an isolated SQLite database. The client monotonic clock and matching server start time advance together while normal render time drives ignition and smoke. Desktop English uses a preset and phone Chinese uses a touch-drawn outline for the burn sequence. The report records the observed wax state, both saved endings and the refresh check. Phone is viewport and touch emulation.

## M2 — Proposed baked environment

- Preserve the approach, stone recess, holder contact and candle framing as the scene moves into Blender. Block out desktop and phone choose and burn cameras early. Approve the unlit sill and the stone silhouette at both daylight and night before baking.
- Model the original temple with local or original materials. Audit the evaluated and exported resting contacts for the sill, stair treads and loose foreground props. Use Apple Metal Cycles with OpenImageDenoise for lightmap chart filtering. Reuse source validation, packed UVs, mesh compression and lightmap delivery from the existing Blender pipeline.
- Bake ambient day, dusk and night light for the static receivers. Keep the wax body, wick, flame, smoke and the light following the wick at runtime. A fixed flame-light bake risks leaving a bright imprint after extinction or shifting the apparent source above a short wick. If the delivery requires a lamp pass, validate its response against all wax heights and both extinguished states before keeping it.
- Cap the complete Pine Gate delivery at 15,000,000 bytes. Start with 5 MB for compressed geometry, 7 MB for lightmaps, 2 MB for materials and 1 MB for the manifest and other runtime assets. Place lightmap density on the recess and nearest stair risers. Measure the complete package, texture residency and the phone-emulation burning cadence.
- Check low-light wax readability, shadow and bloom around the stone lip, thin smoke against both stone and sky, phone overlay clearance, seams at the tread edges and mobile decode cost. Register any external CC0 input in the asset registry.
