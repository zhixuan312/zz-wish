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

export function readPineFernDetail(manifest) {
  if (manifest.fernDetail === undefined) return null;
  const model = pineFile(manifest, manifest.fernDetail?.model, '.glb');
  if (!manifest.approachForest || model.uri === manifest.scene || !/^[a-f0-9]{64}$/.test(manifest.fernDetail.receiptSha256)) {
    throw new Error('Invalid Pine Gate fern detail declaration');
  }
  return model;
}

export function readPineWalkLightmaps(manifest) {
  const declared = manifest.walkLightmaps;
  if (declared === undefined) return null;
  const regions = ['gate', 'niche'];
  const passes = ['night', 'dusk', 'day', 'lamp'];
  const backdrop = readPineBackdrop(manifest);
  if (!backdrop?.walk || !declared || Object.keys(declared).length !== regions.length) {
    throw new Error('Pine Gate walk lightmaps require the walk tier and two deferred regions');
  }
  const used = new Set(Object.values(backdrop.walk.files).map(file => file.uri));
  for (const pass of passes) used.add(manifest.lightmaps?.approach?.[pass]?.uri);
  return Object.fromEntries(regions.map(region => {
    if (!declared[region] || Object.keys(declared[region]).length !== passes.length) {
      throw new Error(`Missing Pine Gate soft lightmaps for ${region}`);
    }
    return [region, Object.fromEntries(passes.map(pass => {
      const authored = manifest.lightmaps?.[region]?.[pass];
      const full = pineFile(manifest, authored?.uri, '.ktx2');
      const soft = pineFile(manifest, declared[region][pass], '.ktx2');
      if (used.has(full.uri) || used.has(soft.uri) || full.uri === soft.uri
        || !Number.isInteger(authored.mipLevels) || authored.mipLevels < 3) {
        throw new Error(`Invalid Pine Gate full and soft lightmaps for ${region}/${pass}`);
      }
      used.add(full.uri);
      used.add(soft.uri);
      return [pass, { full, soft }];
    }))];
  }));
}
