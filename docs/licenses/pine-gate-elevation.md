# Pine Gate elevation source

SRTM terrain data courtesy of the U.S. Geological Survey. The Shuttle Radar Topography Mission elevation data were collected by NASA and NGA and published by the USGS Earth Resources Observation and Science Center. The USGS release records public access and the U.S. public-domain license. [USGS release and license](https://doi.org/10.5066/F7PR7TFT)

Pine Gate uses the one-arc-second land elevation tile `N23E102.hgt.gz` distributed as Skadi by Mapzen Terrain Tiles. Accessed 2026-11-19 from the AWS Registry of Open Data. [Registry entry](https://registry.opendata.aws/terrain-tiles/) · [Exact source tile](https://elevation-tiles-prod.s3.amazonaws.com/skadi/N23/N23E102.hgt.gz) · [Skadi format](https://github.com/tilezen/joerd/blob/master/docs/formats.md#skadi) · [Mapzen attribution terms](https://github.com/tilezen/joerd/blob/master/docs/attribution.md#srtm)

The source archive SHA-256 is `659825761ce8e66d5e2359296f71de3dbfa3917a836bfbd0d79f9fb60751ea8d`. The packed module SHA-256 is `08775a297288efb8bf5d10cda9e83f5933fad67a893cc9a593d9e634b3e1c70b`.

## Game adaptation

The sample origin is column 1129, row 1561 of the 3601 × 3601 WGS84/EGM96 tile, at approximately 102.313611° E, 23.566389° N. The virtual valley faces north. The recipe scales the terrain horizontally and vertically by 0.044, sets the elevation datum to 942 m, and offsets the crop horizontally by 10 game metres to frame the fictional valley. It samples the terrain on a 204 × 175 grid with closer samples near the camera and quantises elevations to 2 cm in game space. No source voids were used.

The recipe traces the east slope at a common elevation and two drainage reaches using D8 flow accumulation. The runtime grades that slope for the original field layout and aligns the stream mesh to the rendered terrain triangles. The field layout, sky, cloud, drainage appearance and all architecture are authored for Pine Gate. The game includes no source settlement map, point of interest, street network, or satellite imagery.

Regenerate the runtime module with Python 3 from the repository root. The recipe checks the source hash before writing. The whole HGT archive is kept out of the game delivery.

```sh
python3 scripts/build-pine-gate-elevation.py
```

Use `--source /path/to/N23E102.hgt.gz` to regenerate from a local copy without downloading again.
