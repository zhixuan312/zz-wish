# Snow Roof source-bound hidden-tile proofs

The canonical proofs are the original frozen proof and the final visually accepted source proof. Rejected pancake and first connected-bank studies are historical artifacts under ignored `art/build/studies`; they are not current inputs.

| Proof | Source | SHA256 |
|---|---|---|
| Original `snow-roof-hidden-tiles.json` | `art/build/snow-roof-stable.blend` | `c64adb44283c4cd766921392da95b113767ddceab4dca44192e350caf5aeeae2` |
| Final `snow-roof-final-hidden-tiles.json` | `art/build/snow-roof-stair-banks-grain.blend` | `6649e9c080c3b152c743fcc88ad5ebf95690ff8f678742cc5dd84be79ce2e014` |

The final accepted blend SHA is `6e9f59c93565e08a690eaafbc756967ba39e0f4d8ad0094e4520265948360af8`. Its two connected stair-edge banks replace six former snow objects. All other 3,080 meshes, court/gate geometry, shared materials and lighting remain unchanged. The last adjustment changes only the banks' mesh texture-space Z size; all 3,082 final mesh geometry records remain byte-identical to the structurally accepted joined source.

`snow-roof-final-proof-validation.json` records the fresh classification, exact original/final selection equality, and source geometry/coordinate audit chain. Every selected object, connected component, polygon range, clearance, bound, area and representative camera check matches the original proof: 5,577 components / 91,875 source polygons / 183,750 expected triangulated faces, with all 44,616 camera rays blocked by snow. Minimum boundary clearance is 20.08 mm.

The classifier accepts only whole connected tile components enclosed by an opaque, explicitly closed roof-snow volume. Vertex, edge-midpoint and face-center samples must be at least 20 mm from its boundary, and a component BVH must have no snow-boundary overlap. Full source construction remains in all bake occluders. The baker enforces the proof's actual source blend SHA; no edited hash overrides are permitted.

Regenerate into an ignored candidate file for comparison, without rendering or baking:

```sh
blender -b --python-exit-code 1 --python art/blender/classify_hidden_tiles.py -- \
  --source-blend art/build/snow-roof-stair-banks-grain.blend \
  --output art/build/snow-roof-final-hidden-tiles.regenerated.json
```

The working final bake settings are Cycles Metal, OpenImageDenoise Metal, 64 samples, hall/court 4096 and gate 2048. The source, UV gate and visual approval precede full baking. An export-only optimized final profile must wait for the actual final prepared/raw/packed assets and genuine FACE-to-export correspondence plus retained triangle/image validation. The original measured optimization profile remains intact and applies only to its original frozen packed asset.
