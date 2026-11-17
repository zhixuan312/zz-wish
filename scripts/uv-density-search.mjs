/** UV packing only. Preserve charts, eight-pixel gutters and all physical data. */
export function maximizeUvDensity(atlas, resolution, packOptions, attempts) {
  const search = [];
  const fits = () => atlas.atlasCount === 1 && atlas.width <= resolution && atlas.height <= resolution;
  if (!fits()) throw new Error('A genuine fitting lower-density atlas is required.');
  let best = atlas.texelsPerUnit;
  const failed = attempts.filter(a => a.atlasCount !== 1 || a.width > resolution || a.height > resolution)
    .map(a => a.texelsPerUnit).filter(value => value > best);
  if (failed.length) {
    let high = Math.min(...failed);
    for (let trial = 0; trial < 9 && high / best > 1.005; trial++) {
      const proposed = (best + high) / 2;
      atlas.packCharts({ ...packOptions, texelsPerUnit: proposed });
      const accepted = fits();
      search.push({ proposed, actual: atlas.texelsPerUnit, accepted, width: atlas.width, height: atlas.height, atlasCount: atlas.atlasCount });
      if (accepted) best = atlas.texelsPerUnit;
      else high = proposed;
    }
    atlas.packCharts({ ...packOptions, texelsPerUnit: best });
    if (!fits()) throw new Error('Best actual density could not be reproduced.');
  }
  return search;
}
