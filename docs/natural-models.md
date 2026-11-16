# Natural scenery scans

These generic natural objects come from [Poly Haven](https://polyhaven.com/), whose [official asset license](https://polyhaven.com/license) applies CC0 1.0 to its models and textures. They depict rock and dead wood, with no temple, monument, statue or ritual geometry. They are intended as reusable natural pieces around the fictional architecture.

| Local model | Artist | Triangles | Browser payload | Intended use |
|---|---|---:|---:|---|
| `web/public/models/rock_face_01/rock_face_01.gltf` | Dario Barresi | 20,174 | 1.30 MB | Layered cliff faces, broad ledges and mountain sides |
| `web/public/models/rock_face_02/rock_face_02.gltf` | Dario Barresi; Rico Cilliers (processing) | 29,566 | 1.64 MB | Irregular cliff sections, outcrops, differing silhouettes |
| `web/public/models/rock_moss_set_01/rock_moss_set_01.gltf` | Kless Gyzen | 63,127 across six rocks | 1.93 MB | Mossy step edges, pond stones and rooted banks |
| `web/public/models/tree_stump_01/tree_stump_01.gltf` | Rob Tuytel | 41,046 | 1.98 MB | Forest-floor stump and exposed roots |

The total is 6.85 MB before HTTP compression. Each model includes a glTF JSON file, the unmodified source mesh buffer, and 1K material textures converted from the official JPEG downloads to WebP. Normal maps use quality 94; color and packed material maps use quality 87. The glTF files declare `EXT_texture_webp`, supported by the pinned three.js 0.160 loader. Geometry, UV coordinates and original units are unchanged. No runtime decoder dependency was introduced.

[The machine-readable manifest](../web/public/models/manifest.json) records the official source page and file API, author credit, source MD5, local SHA-256, file sizes, triangle counts, mesh bounds and node transforms. Downloads were checked against the official MD5 values before conversion. After conversion, all buffer lengths and referenced file paths were checked locally. Browser rendering remains part of the scene capture round.

Source pages: [Rock Face 01](https://polyhaven.com/a/rock_face_01), [Rock Face 02](https://polyhaven.com/a/rock_face_02), [Rock Moss Set 01](https://polyhaven.com/a/rock_moss_set_01), [Tree Stump 01](https://polyhaven.com/a/tree_stump_01).

Integration details:

- The two cliff meshes have irregular backs and edges. Sink their boundaries into neighboring rock/terrain; rotate and overlap multiple pieces to avoid a row of identical silhouettes.
- The moss file contains six separate mesh nodes arranged as a presentation grid. Select a child mesh and clear its presentation translation before placing it. Each rock has its own geometry but shares the material textures.
- Native glTF bounds are in metres and use Y up. The manifest includes exact accessor bounds; derive the bottom from each geometry rather than assuming that the model origin is the lowest point.
- The source models are the available lightweight exported meshes, not progressive LOD trees. Use shared geometry/materials or instancing for repeated pieces, and reduce the number of distant instances.
- Poly Haven's full coastal-cliff meshes were rejected because their geometry alone is 13–44 MB. The full pine model has roughly 949 MB of geometry and was also rejected. No suitable lightweight living tree was downloaded; the stump provides natural roots but does not replace a canopy.
