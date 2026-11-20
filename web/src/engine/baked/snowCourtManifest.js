import projection from '../../../../shared/snow-court-backdrop.json' with { type: 'json' };

const layerNames = ['far', 'mid', 'cloud'];
const digest = /^[a-f0-9]{64}$/;
const basename = /^[a-z0-9][a-z0-9._-]{0,155}\.(?:webp|ktx2)$/;

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
    const rows = manifest.files.filter(file => file?.uri === uri);
    const [file] = rows;
    if (rows.length !== 1 || !Number.isSafeInteger(file.bytes) || file.bytes <= 0
      || typeof file.sha256 !== 'string' || !digest.test(file.sha256)) {
      throw new Error(`Missing or invalid Snow Roof backdrop asset: ${uri}`);
    }
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
