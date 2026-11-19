import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import projection from '../../shared/pine-gate-backdrop.json' with { type: 'json' };
import { readPineBackdrop, readPineWaxNormal } from '../../web/src/engine/baked/pineManifest.js';

export const pinePackagePath = '/places/pine-gate/';
const sha256 = data => createHash('sha256').update(data).digest('hex');

export async function readPinePreview(worktree, candidateDir, expectedSha) {
  assert(candidateDir && isAbsolute(candidateDir) && /^[a-f0-9]{64}$/.test(expectedSha),
    'Set CAPTURE_PREVIEW_DIR and CAPTURE_PREVIEW_SHA256 for the isolated eight-sample delivery.');
  const build = await realpath(join(worktree, 'art/build/pine-gate'));
  const candidate = await realpath(candidateDir);
  const child = relative(build, candidate);
  assert(child && !isAbsolute(child) && !child.startsWith('..'), 'The preview must live under art/build/pine-gate.');
  const read = async name => {
    assert(/^[a-z0-9][a-z0-9._-]*$/.test(name), 'Expected a local Pine Gate asset filename.');
    const file = join(candidate, name);
    assert((await lstat(file)).isFile(), `Expected a regular preview file: ${name}.`);
    return readFile(file);
  };
  const manifestBytes = await read('manifest.json');
  assert.equal(sha256(manifestBytes), expectedSha, 'The preview manifest did not match the approved SHA-256.');
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.place, 'pine-gate');
  assert.equal(manifest.partialPreview, true);
  assert.equal(manifest.bake.samples, 8);
  const files = new Map(manifest.files.map(file => [file.uri, file]));
  assert.equal(files.size, manifest.files.length, 'Duplicate declared preview URI.');
  const backdrop = readPineBackdrop(manifest);
  const waxNormal = readPineWaxNormal(manifest);
  const regions = Object.keys(manifest.lightmaps).sort();
  assert.deepEqual(regions, ['approach', 'gate', 'niche']);
  const maps = regions.flatMap(region => ['day', 'dusk', 'night', 'lamp'].map(look => {
    const map = manifest.lightmaps[region][look];
    assert.equal(map?.samples, 8, `Expected an eight-sample ${region}/${look} preview map.`);
    assert.equal(files.get(map.uri)?.bytes, map.bytes, `Missing ${region}/${look} payload.`);
    return map.uri;
  }));
  assert.equal(new Set(maps).size, 12, 'Expected all twelve distinct preview maps.');
  assert(files.has(manifest.scene), 'Missing declared preview model.');

  const assets = new Map([['manifest.json', { body: manifestBytes, contentType: 'application/json' }]]);
  for (const [name, file] of files) {
    const body = await read(name);
    assert.equal(body.length, file.bytes, name);
    assert.equal(sha256(body), file.sha256, name);
    const contentType = name.endsWith('.webp') ? 'image/webp' : name.endsWith('.png') ? 'image/png' : 'application/octet-stream';
    assets.set(name, { body, version: file.sha256, contentType });
  }
  return { assets, scene: manifest.scene, samples: manifest.bake.samples, manifestSha256: expectedSha, backdrop, waxNormal };
}

export async function measurePineRealismBase(worktree, preview, ordinaryManifest) {
  const sharedUrl = '/color/native-agx-57-f16.bin.zst';
  const shared = ordinaryManifest.sharedVisualAssets?.find(asset => asset.url === sharedUrl);
  assert(shared, 'Missing native AgX declaration in the ordinary manifest.');
  const sharedBytes = await readFile(join(worktree, 'web/public', sharedUrl.slice(1)));
  assert.equal(sharedBytes.length, shared.bytes);
  assert.equal(sha256(sharedBytes), shared.sha256);

  const packageBytes = [...preview.assets.values()].reduce((bytes, asset) => bytes + asset.body.length, 0);
  // All declared private image payloads are already included in packageBytes.
  // Pine no longer imports the old DEM module or charges for its source bytes.
  const plates = Object.values(preview.backdrop?.files ?? {});
  const backdropBytes = plates.reduce((bytes, file) => bytes + preview.assets.get(file.uri).body.length, 0);
  const totalBytes = packageBytes + sharedBytes.length;
  const limitBytes = 15_000_000;
  assert(totalBytes <= limitBytes, `R1 base payload is ${totalBytes} bytes and exceeds ${limitBytes} bytes.`);
  return { totalBytes, limitBytes, packageBytes, sharedAgXBytes: sharedBytes.length,
    backdrop: preview.backdrop ? { ...preview.backdrop, bytes: backdropBytes } : null,
    waxNormal: preview.waxNormal };
}

export function assertPineRuntimeImages(state, preview, fetched, checkView = false) {
  const { backdrop, waxNormal } = preview;
  const expectedImages = [...Object.values(backdrop?.files ?? {}), ...(waxNormal ? [waxNormal] : [])];
  for (const file of expectedImages) assert(fetched.includes(file.uri), `The browser did not fetch ${file.uri}.`);
  assert.deepEqual(state?.waxNormal ?? null, waxNormal ? { uri: waxNormal.uri, pixels: [512, 512] } : null);
  if (!backdrop) {
    assert.equal(state?.backdrop ?? null, null, 'Legacy Pine Gate should use the sky without valley plates.');
    return;
  }
  assert(state?.backdrop?.visible, 'The authored daylight backdrop is not visible at 13:00.');
  const names = Object.keys(backdrop.files);
  assert.deepEqual(state.backdrop.planes.map(plane => plane.name), names);
  const directionLength = Math.hypot(...projection.direction);
  const forward = projection.direction.map(value => value / directionLength);
  for (const [index, plane] of state.backdrop.planes.entries()) {
    const distance = projection.distances[plane.name];
    const center = projection.position.map((value, axis) => value + forward[axis] * distance);
    const height = 2 * distance * Math.tan(projection.verticalFov * Math.PI / 360);
    assert(plane.position.every((value, axis) => Math.abs(value - center[axis]) < 1e-8), `${plane.name} depth or world origin drifted.`);
    assert(plane.front.every((value, axis) => Math.abs(value + forward[axis]) < 1e-8), `${plane.name} projection rotated.`);
    assert(Math.abs(plane.size[1] - height) < 1e-8 && Math.abs(plane.size[0] - height * projection.width / projection.height) < 1e-8,
      `${plane.name} projection aperture changed.`);
    assert.equal(plane.uri, backdrop.files[plane.name].uri);
    assert.deepEqual(plane.pixels, [backdrop.width, backdrop.height]);
    assert(plane.opacity === 1 && plane.depthTest && !plane.depthWrite, `${plane.name} daytime compositing changed.`);
    if (checkView) assert(plane.viewportCenterUv?.every(value => value > .015 && value < .985), `${plane.name} is outside the product camera aperture.`);
    if (index > 0) assert(plane.renderOrder > state.backdrop.planes[index - 1].renderOrder, 'Backdrops must composite far to near.');
  }
}

export async function routePinePreview(page, base, preview, onError, onServed) {
  const imageUris = new Set(Object.values(preview.backdrop?.files ?? {}).map(file => file.uri));
  if (preview.waxNormal) imageUris.add(preview.waxNormal.uri);
  await page.route(url => url.origin === base.origin && url.pathname.startsWith(pinePackagePath), async route => {
    const url = new URL(route.request().url());
    const key = url.pathname.slice(pinePackagePath.length);
    const asset = preview.assets.get(key);
    const version = url.searchParams.get('v');
    if (!asset || route.request().method() !== 'GET'
      || ((version !== null || imageUris.has(key)) && version !== asset.version)) {
      onError(`Rejected undeclared or mismatched preview request ${url.pathname}.`);
      await route.abort('blockedbyclient');
      return;
    }
    await route.fulfill({ status: 200, body: asset.body, contentType: asset.contentType, headers: { 'cache-control': 'no-store' } });
    onServed(key);
  });
}
