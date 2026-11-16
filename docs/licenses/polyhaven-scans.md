# Photographic surface textures

These five surface assets were selected from the [Poly Haven public texture catalog](https://api.polyhaven.com/assets?t=textures), then downloaded through each asset's official file API. Only the primary diffuse, OpenGL normal and roughness JPEGs were downloaded. No website example images, temple models, statues or architectural reconstructions are included.

Poly Haven publishes its asset library under [CC0](https://polyhaven.com/license). The full [CC0 1.0 public-domain dedication](https://creativecommons.org/publicdomain/zero/1.0/) applies. Attribution is optional; the source creators are recorded below and in the manifest.

| Asset | Creators | Local directory |
|---|---|---|
| [Rock Pitted Mossy](https://polyhaven.com/a/rock_pitted_mossy) | Dimitrios Savva; Rico Cilliers | `web/public/materials/scans/rock_pitted_mossy/` |
| [Weathered Planks](https://polyhaven.com/a/weathered_planks) | Dimitrios Savva; Dario Barresi | `web/public/materials/scans/weathered_planks/` |
| [Stone Pavers](https://polyhaven.com/a/stone_pavers) | Amal Kumar | `web/public/materials/scans/stone_pavers/` |
| [Dark Brick Wall](https://polyhaven.com/a/dark_brick_wall) | Dimitrios Savva; Dario Barresi | `web/public/materials/scans/dark_brick_wall/` |
| [White Plaster Rough 01](https://polyhaven.com/a/white_plaster_rough_01) | Rob Tuytel | `web/public/materials/scans/white_plaster_rough_01/` |

Each directory contains `diffuse.jpg`, `normal.jpg` and `roughness.jpg`. The normal maps use OpenGL tangent-space conventions. Treat diffuse as sRGB and normal/roughness as linear data. The source dimensions were retained at the official 1k size.

The original fifteen JPEGs total 10,675,514 bytes. Web copies total 5,478,377 bytes after JPEG re-encoding, without resizing: quality 91 for diffuse/roughness and 93 with full chroma resolution for normal maps. Roughness copies are grayscale. No generative alteration or material replacement was applied. The diffuse rock is naturally warm sandstone; tint it deliberately rather than mistaking it for gray granite. The plaster carries visible weathering and moss.

[polyhaven-scans.json](polyhaven-scans.json) records exact primary URLs, creator metadata, source and output SHA-256 hashes, source MD5 checks, dimensions, encoding settings, and Pillow/libjpeg versions. [fetch-polyhaven-scans.py](fetch-polyhaven-scans.py) reproduces and verifies the downloads and web copies with Pillow. It refuses an output mismatch from a different JPEG encoder build.
