import projection from '../../../../shared/snow-court-backdrop.json' with { type: 'json' };

const layerNames = ['far', 'mid', 'cloud'];
const digest = /^[a-f0-9]{64}$/;
const basename = /^[a-z0-9][a-z0-9._-]{0,155}\.(?:webp|ktx2)$/;

function readAsset(manifest, uri, kind) {
  const rows = manifest.files.filter(file => file?.uri === uri);
  const [file] = rows;
  if (rows.length !== 1 || !Number.isSafeInteger(file.bytes) || file.bytes <= 0
    || typeof file.sha256 !== 'string' || !digest.test(file.sha256)) {
    throw new Error(`Missing or invalid Snow Roof ${kind} asset: ${uri}`);
  }
  return file;
}

function readTier(manifest, tier, extensions, used) {
  const { encoding, encodedReceiptSha256, width, height, layers } = tier ?? {};
  if (encoding !== 'log2-8-8' || typeof encodedReceiptSha256 !== 'string' || !digest.test(encodedReceiptSha256)
    || !Number.isSafeInteger(width) || width <= 0 || width > projection.width
    || !Number.isSafeInteger(height) || height <= 0 || height > projection.height
    || width * projection.height !== height * projection.width
    || !layers || Object.keys(layers).length !== layerNames.length) {
    throw new Error('Invalid Snow Roof backdrop declaration');
  }
  const files = Object.fromEntries(layerNames.map(name => {
    const uri = layers[name];
    if (typeof uri !== 'string' || !basename.test(uri) || used.has(uri)
      || !extensions.some(extension => uri.endsWith(extension))) {
      throw new Error(`Invalid Snow Roof backdrop layer: ${name}`);
    }
    const file = readAsset(manifest, uri, 'backdrop');
    used.add(uri);
    return [name, file];
  }));
  return { encoding, width, height, files };
}

export function readSnowCourtBackdrop(manifest) {
  const backdrop = manifest?.backdrop;
  if (backdrop === undefined) return null;
  if (!Array.isArray(manifest.files)) throw new Error('Missing Snow Roof backdrop asset table');
  const used = new Set();
  const base = readTier(manifest, backdrop, ['.webp'], used);
  const night = backdrop.night === undefined ? null : readTier(manifest, backdrop.night, ['.webp'], used);
  const walk = backdrop.walk === undefined ? null : readTier(manifest, backdrop.walk, ['.ktx2'], used);
  const high = backdrop.high === undefined ? null : readTier(manifest, backdrop.high, ['.webp', '.ktx2'], used);
  for (const tier of [walk, high]) {
    if (tier && (tier.width !== projection.width || tier.height !== projection.height || tier.width <= base.width)) {
      throw new Error('Snow Roof backdrop upgrades must use the native projection resolution');
    }
  }
  return { ...base, walk, night, high };
}

export function readSnowCourtWalkLightmaps(manifest) {
  const declared = manifest?.walkLightmaps;
  if (declared === undefined) return null;
  const regions = Object.hasOwn(declared ?? {}, 'court') ? ['hall', 'altar', 'court'] : ['hall', 'altar'];
  const passes = ['night', 'dusk', 'day', 'lamp'];
  const backdrop = readSnowCourtBackdrop(manifest);
  if (!backdrop?.walk || !declared || Object.keys(declared).length !== regions.length) {
    throw new Error('Snow Roof walk lightmaps require the walk backdrop and both interior regions');
  }
  const used = new Set([manifest.scene]);
  for (const tier of [backdrop, backdrop.walk, backdrop.night, backdrop.high]) {
    for (const { uri } of Object.values(tier?.files ?? {})) used.add(uri);
  }
  for (const [region, maps] of Object.entries(manifest.lightmaps ?? {})) {
    if (regions.includes(region)) continue;
    for (const map of Object.values(maps ?? {})) used.add(map?.uri);
  }
  const validUri = uri => typeof uri === 'string' && basename.test(uri) && uri.endsWith('.ktx2') && !used.has(uri);
  return Object.fromEntries(regions.map(region => {
    const softMaps = declared[region];
    if (!softMaps || Object.keys(softMaps).length !== passes.length) {
      throw new Error(`Missing Snow Roof soft lightmaps for ${region}`);
    }
    return [region, Object.fromEntries(passes.map(pass => {
      const authored = manifest.lightmaps?.[region]?.[pass];
      const fullUri = authored?.uri, softUri = softMaps[pass];
      if (!validUri(fullUri) || !validUri(softUri) || fullUri === softUri) {
        throw new Error(`Invalid Snow Roof full and soft lightmap names for ${region}/${pass}`);
      }
      const full = readAsset(manifest, fullUri, 'lightmap');
      const soft = readAsset(manifest, softUri, 'lightmap');
      if (authored.mipLevels !== 3 || authored.bytes !== full.bytes
        || full.mipLevels !== 3 || soft.mipLevels !== 1 || soft.sourceUri !== full.uri || soft.sourceMip !== 2
        || full.codec !== 'uastc' || soft.codec !== full.codec || full.transfer !== 'linear' || soft.transfer !== full.transfer) {
        throw new Error(`Invalid Snow Roof full and soft lightmap metadata for ${region}/${pass}`);
      }
      used.add(full.uri);
      used.add(soft.uri);
      return [pass, { full, soft }];
    }))];
  }));
}
