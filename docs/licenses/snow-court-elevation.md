# Snow Roof Court elevation source

The Snow Roof Court backdrop uses public-domain USGS Shuttle Radar Topography Mission (SRTM) 1 Arc-Second Global elevation data. NASA's Jet Propulsion Laboratory and the National Geospatial-Intelligence Agency conducted the mission. The USGS Earth Resources Observation and Science Center supplies the void-filled global product. The nominal source spacing is one arc second, approximately 30 m. The source tile has 3,601 × 3,601 signed big-endian elevation samples. [USGS product and DOI](https://doi.org/10.5066/F7PR7TFT) · [USGS Science Data Catalog](https://data.usgs.gov/datacatalog/data/USGS%3AEROS5e83a3ee1af480c5)

The local source is the public Skadi mirror's `N33E107.hgt.gz`. The compressed SHA-256 is `c878cd7ebf7b60e148e5441e22f314c034d3c410dff3b97194d0b9ce1fb4b477`. The authoring script verifies the compressed bytes, sample dimensions and peak sample before building geometry. [Pinned mirror tile](https://elevation-tiles-prod.s3.amazonaws.com/skadi/N33/N33E107.hgt.gz)

The backdrop takes relief from two strips of this tile. The higher strip contains the highest sampled point at source row 161, column 2749, with a source elevation of 3,753 m. The adjacent lower strip defines the middle-distance passage and its grounded winter pine stands. Snow cover, the orientation and scale of the pass, the trees, thin ice haze, and day and night light are authored. The fictional temple and route do not depict a real compound from the elevation source.

The source tile, EXR masters, isolated previews and local renders stay outside Git. Source file identity is also recorded in each render receipt. The runtime package delivers only the verified encoded plates.
