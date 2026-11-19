import projection from '../../../../shared/pine-gate-backdrop.json' with { type: 'json' };

function imageFile(manifest, uri, extension) {
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

export function readPineBackdrop(manifest) {
  const backdrop = manifest.backdrop;
  if (backdrop === undefined) return null;
  const { encoding, layers, width, height } = backdrop ?? {};
  const names = Object.keys(projection.distances);
  if (encoding !== 'log2-8-8' || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
    || width > projection.width || height > projection.height || width * projection.height !== height * projection.width
    || !layers || Object.keys(layers).length !== names.length || new Set(names.map(name => layers[name])).size !== names.length) {
    throw new Error('Invalid Pine Gate backdrop declaration');
  }
  return { encoding, width, height, files: Object.fromEntries(names.map(name => [name, imageFile(manifest, layers[name], '.webp')])) };
}

export function readPineWaxNormal(manifest) {
  if (manifest.waxSculpt === undefined) return null;
  return imageFile(manifest, manifest.waxSculpt?.normal, '.png');
}
