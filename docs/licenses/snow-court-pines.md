# Snow Court walk pine sources

The walk's pines use the surveyed roots and asymmetric exposure of the approved winter pass. Their 3D foliage uses the shared `needle_fascicle` and `needle_mesh` builders previously used at Pine Gate. The Snow Court additions model individual curved needle pairs and tapered shoots. Small deposits of snow follow sheltered portions of the needle-bearing twigs.

The trunk and bough material is [Pine Bark by Dimitrios Savva](https://polyhaven.com/a/pine_bark), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The 1K JPEGs from the [official asset file listing](https://api.polyhaven.com/files/pine_bark) were verified against these hashes before reducing them to 512 px. The authoring copies are under `art/assets/snow-court/pine-bark/`.

| Authored slot | Original JPEG | Published MD5 |
| --- | --- | --- |
| Diffuse | [pine_bark_diff_1k.jpg](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/pine_bark/pine_bark_diff_1k.jpg) | `7bb38cccfc647aeaf2f5b6488c815e75` |
| Tangent normal | [pine_bark_nor_gl_1k.jpg](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/pine_bark/pine_bark_nor_gl_1k.jpg) | `7b971070fc986e517b5d2795cec0f4e0` |
| Roughness | [pine_bark_rough_1k.jpg](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/pine_bark/pine_bark_rough_1k.jpg) | `f5ba950ee648056809153e0506f8a2e2` |

The native pipeline follows Pine Gate's `1cafd03` with the data/color transfer correction from `f271d01`. The place packer writes sRGB bark color and linear normal and roughness to Basis KTX2. Boughs and their snow strips receive the gate lightmap. Only the paired needles and fine rime are in the separate native Meshopt crown model. They cast shadows in Cycles and are excluded from atlas packing. The encoder replays every triangle, verifies the decoded crown against the bake mesh and records the maximum decoded position and normal errors.
