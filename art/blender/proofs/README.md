# Snow Roof hidden-tile allocation proof

`snow-roof-hidden-tiles.json` retains the exact proof used for the accepted atlas gate. It applies only to the source blend SHA recorded inside the proof. Object names and polygon ranges are from that unmodified source, before receiver triangulation. The baker must retain all geometry as occluders and remove only the flagged faces from unique atlas allocation; it must reject a source-hash mismatch.

Regenerate after rebuilding the source, without a render or bake:

```sh
blender -b --python art/blender/classify_hidden_tiles.py -- \
  --source-blend art/build/snow-roof-stable.blend \
  --output art/build/snow-roof-hidden-tiles.json
```

The rule accepts only whole connected tile components enclosed by an opaque, explicitly closed roof-snow volume. All vertex, edge-midpoint and face-center samples must have at least 20mm boundary clearance, and the component BVH must have no snow-boundary overlap. Exposed eaves, undersides, ridge ends and anything failing this conservative check remain receivers. Eight representative source cameras also verify snow occlusion of accepted component centers. See the JSON for exact counts, bounds and clearance values.

The current proof identifies 5,577 hidden tile components (hall 2,905, court 1,987, gate 685) and 513.15 m² of hidden source polygon area. These are allocation exclusions, never deletion of modeled construction. Lighting and all source geometry are unchanged.
