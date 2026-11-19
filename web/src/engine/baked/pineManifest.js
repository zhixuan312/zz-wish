import projection from '../../../../shared/pine-gate-backdrop.json' with { type: 'json' };

function pineFile(manifest, uri, extension) {
  if (typeof uri !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(uri) || !uri.endsWith(extension)) {
    throw new Error(`Invalid Pine Gate ${extension} asset name`);
  }
  const rows = manifest.files.filter(file => file.uri === uri);
  const [file] = rows;
  if (rows.length !== 1 || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) {
    throw new Error(`Missing or invalid Pine Gate asset ${uri}`);
  }
  return file;
}

function backdropTier(manifest, tier, extension = '.webp') {
  const { encoding, layers, width, height } = tier ?? {};
  const names = Object.keys(projection.distances);
  if (encoding !== 'log2-8-8' || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
    || width > projection.width || height > projection.height || width * projection.height !== height * projection.width
    || !layers || Object.keys(layers).length !== names.length || new Set(names.map(name => layers[name])).size !== names.length) {
    throw new Error('Invalid Pine Gate backdrop declaration');
  }
  return { encoding, width, height, files: Object.fromEntries(names.map(name => [name, pineFile(manifest, layers[name], extension)])) };
}

export function readPineBackdrop(manifest) {
  const backdrop = manifest.backdrop;
  if (backdrop === undefined) return null;
  const base = backdropTier(manifest, backdrop);
  if (backdrop.walk !== undefined) {
    const walk = backdropTier(manifest, backdrop.walk, '.ktx2');
    if (walk.width !== projection.width || walk.height !== projection.height || walk.width <= base.width) {
      throw new Error('Pine Gate walk plates must use the native backdrop resolution');
    }
    if (backdrop.high && Object.keys(backdrop.high).some(key => !['trees', 'treeReceiptSha256'].includes(key))) {
      throw new Error('Pine Gate walk plates replace the desktop backdrop upgrade');
    }
    const trees = pineTrees(manifest, backdrop.high);
    return { ...base, walk, high: trees ? { trees } : null };
  }
  if (backdrop.high === undefined) return { ...base, high: null };
  const high = backdropTier(manifest, backdrop.high);
  const baseFiles = new Set(Object.values(base.files));
  if (high.width <= base.width || Object.values(high.files).some(file => baseFiles.has(file))) {
    throw new Error('Invalid Pine Gate high backdrop tier');
  }
  return { ...base, high: { ...high, trees: pineTrees(manifest, backdrop.high) } };
}

function pineTrees(manifest, high) {
  const trees = high?.trees === undefined ? null : pineFile(manifest, high.trees, '.glb');
  if (trees?.uri === manifest.scene) throw new Error('Pine Gate high trees must be a separate asset');
  return trees;
}

export function readPineWaxNormal(manifest) {
  if (manifest.waxSculpt === undefined) return null;
  return pineFile(manifest, manifest.waxSculpt?.normal, '.png');
}
