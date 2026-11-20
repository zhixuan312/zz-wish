import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import projection from '../../shared/pine-gate-backdrop.json' with { type: 'json' };
import { readPineBackdrop, readPineWalkLightmaps, readPineWaxNormal } from '../../web/src/engine/baked/pineManifest.js';
import { readPineForestBackdrop } from '../../web/src/engine/places/pine-forest-backdrop.js';

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
  // The shared demo package is a 32-sample night prototype; review captures use whichever
  // sample count its manifest declares, and must never claim the other.
  assert([8, 32].includes(manifest.bake.samples), 'Expected an 8- or 32-sample Pine Gate preview package.');
  const files = new Map(manifest.files.map(file => [file.uri, file]));
  assert.equal(files.size, manifest.files.length, 'Duplicate declared preview URI.');
  const backdrop = readPineBackdrop(manifest);
  const walkLightmaps = readPineWalkLightmaps(manifest);
  const waxNormal = readPineWaxNormal(manifest);
  const approachForest = readPineForestBackdrop(manifest);
  const regions = Object.keys(manifest.lightmaps).sort();
  assert.deepEqual(regions, ['approach', 'gate', 'niche']);
  const maps = regions.flatMap(region => ['day', 'dusk', 'night', 'lamp'].map(look => {
    const map = manifest.lightmaps[region][look];
    assert.equal(map?.samples, manifest.bake.samples,
      `Expected the ${region}/${look} preview map to match the package's ${manifest.bake.samples} samples.`);
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
  return { assets, scene: manifest.scene, samples: manifest.bake.samples, manifestSha256: expectedSha,
    backdrop, walkLightmaps, waxNormal, approachForest };
}

export function walkLightmapFiles(preview) {
  return Object.values(preview.walkLightmaps ?? {}).flatMap(region => Object.values(region));
}

export async function measurePineRealismBase(worktree, preview, ordinaryManifest) {
  const sharedUrl = '/color/native-agx-57-f16.bin.zst';
  const shared = ordinaryManifest.sharedVisualAssets?.find(asset => asset.url === sharedUrl);
  assert(shared, 'Missing native AgX declaration in the ordinary manifest.');
  const sharedBytes = await readFile(join(worktree, 'web/public', sharedUrl.slice(1)));
  assert.equal(sharedBytes.length, shared.bytes);
  assert.equal(sha256(sharedBytes), shared.sha256);

  const combinedPackageBytes = [...preview.assets.values()].reduce((bytes, asset) => bytes + asset.body.length, 0);
  const { walk, high, night, ...base } = preview.backdrop ?? {};
  const imageBytes = tier => Object.values(tier?.files ?? {}).reduce((bytes, file) => bytes + preview.assets.get(file.uri).body.length, 0);
  // The entire manifest, all ambient banks and the shared LUT belong to base.
  // The two streaming tiers are separately declared and verified.
  const highTreeBytes = high?.trees ? preview.assets.get(high.trees.uri).body.length : 0;
  const highBytes = imageBytes(high) + highTreeBytes;
  // A tree model declared in the walk tier is delivered to every device, so it belongs to the walk
  // payload; counting it as high would understate what a phone must download.
  const walkTreeBytes = walk?.trees ? preview.assets.get(walk.trees.uri).body.length : 0;
  const walkLightmapBytes = walkLightmapFiles(preview).reduce((bytes, { full }) => bytes + preview.assets.get(full.uri).body.length, 0);
  const nightBytes = imageBytes(night);
  const walkBytes = imageBytes(walk) + walkLightmapBytes + nightBytes + walkTreeBytes;
  const packageBytes = combinedPackageBytes - highBytes - walkBytes;
  const totalBytes = packageBytes + sharedBytes.length;
  const limitBytes = 15_000_000;
  assert(totalBytes <= limitBytes, `R1 base payload is ${totalBytes} bytes and exceeds ${limitBytes} bytes.`);
  const combinedBytes = combinedPackageBytes + sharedBytes.length;
  const combinedLimitBytes = 40_000_000;
  const phoneBytes = totalBytes + walkBytes;
  const phoneLimitBytes = 30_000_000;
  if (walk) assert(phoneBytes <= phoneLimitBytes, `Pine Gate phone payload is ${phoneBytes} bytes and exceeds ${phoneLimitBytes} bytes.`);
  assert(combinedBytes <= combinedLimitBytes, `Pine Gate combined payload is ${combinedBytes} bytes and exceeds ${combinedLimitBytes} bytes.`);
  return { totalBytes, limitBytes, packageBytes, sharedAgXBytes: sharedBytes.length,
    backdrop: preview.backdrop ? { ...base, bytes: imageBytes(base), ...(walk ? { walk: { ...walk, bytes: imageBytes(walk) } } : {}),
      ...(high ? { high: { ...high, bytes: imageBytes(high), ...(highTreeBytes ? { treeBytes: highTreeBytes } : {}) } } : {}) } : null,
    ...(walkTreeBytes ? { walkTreeBytes } : {}),
    ...(walk ? { walkBytes, walkLightmapBytes, phoneBytes, phoneLimitBytes, ...(night ? { nightBytes } : {}) } : {}),
    ...(walk || high ? { combinedBytes, combinedLimitBytes, combinedPackageBytes, highBytes } : {}),
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
    const plate = backdrop.walk && plane.high?.mix === 1 ? backdrop.walk : backdrop;
    assert.equal(plane.uri, plate.files[plane.name].uri);
    assert.deepEqual(plane.pixels, [plate.width, plate.height]);
    assert(plane.opacity === 1 && plane.depthTest && !plane.depthWrite, `${plane.name} daytime compositing changed.`);
    if (checkView) assert(plane.viewportCenterUv?.every(value => value > .015 && value < .985), `${plane.name} is outside the product camera aperture.`);
    if (index > 0) assert(plane.renderOrder > state.backdrop.planes[index - 1].renderOrder, 'Backdrops must composite far to near.');
  }
}

export function assertPineApproachForest(state, preview, fetched) {
  const forest = preview.approachForest;
  assert(forest && state?.visible, 'The prepared Pine Gate should show the daytime approach forest.');
  assert.equal(state.planes.length, forest.plates.length);
  for (const [i, plate] of forest.plates.entries()) {
    const actual = state.planes[i];
    assert(fetched.includes(plate.file.uri), `The browser did not fetch approach forest plate ${plate.file.uri}.`);
    assert.equal(actual.uri, plate.file.uri);
    assert.deepEqual(actual.pixels, [plate.pixelWidth, plate.pixelHeight]);
    assert.deepEqual(actual.position, [plate.centerX, plate.planeY, plate.z]);
    assert.deepEqual(actual.size, [plate.planeWidth, plate.planeHeight]);
    assert(actual.depthTest && !actual.depthWrite, 'The forest must respect opaque path and terrain depth.');
  }
}

export function inspectPineHighBackdrop(state, preview, fetched) {
  return inspectBackdropUpgrade(state, preview.backdrop?.high, fetched);
}

export function inspectPineWalkBackdrop(state, preview, fetched) {
  return inspectBackdropUpgrade(state, preview.backdrop?.walk, fetched, true);
}

function inspectBackdropUpgrade(state, tier, fetched, expectCompressed = false) {
  if (!tier?.files) return null;
  const planes = state.backdrop.planes;
  const mix = planes[0].high?.mix;
  assert(Number.isFinite(mix) && mix >= 0 && mix <= 1, 'Missing bounded high backdrop mix.');
  let loaded = 0, gpuBytes = 0;
  for (const plane of planes) {
    const { high } = plane;
    assert.equal(high?.mix, mix, 'High backdrop layers must transition together.');
    if (high.uri === tier.files[plane.name].uri) {
      assert.deepEqual(high.pixels, [tier.width, tier.height]);
      if (expectCompressed) {
        assert(high.compressed && Number.isSafeInteger(high.gpuBytes) && high.gpuBytes > 0,
          'Walk plates must remain compressed on the GPU.');
        gpuBytes += high.gpuBytes;
      }
      loaded++;
    } else {
      assert.equal(high.uri, plane.uri, 'A high backdrop slot sampled an unverified image.');
      assert.deepEqual(high.pixels, plane.pixels);
    }
  }
  assert(loaded === 0 || loaded === planes.length, 'High backdrop samplers were swapped partially.');
  assert(mix === 0 || loaded === planes.length, 'High backdrop mixed before the full tier was ready.');
  const requested = Object.values(tier.files).map(file => file.uri).filter(uri => fetched.includes(uri));
  if (loaded) assert.equal(requested.length, planes.length, 'A high backdrop plate was used before its verified request.');
  if (expectCompressed) assert(gpuBytes <= tier.width * tier.height * planes.length,
    'Walk plates exceed one compressed byte per native texel.');
  return { status: mix === 1 ? 'active' : loaded ? 'transitioning' : requested.length ? 'base-fallback' : 'base', mix, requested,
    ...(expectCompressed ? { gpuBytes } : {}) };
}

export async function routePinePreview(page, base, preview, onError, onServed, waitForWalk) {
  const walkMaps = walkLightmapFiles(preview);
  const walkUris = new Set([...Object.values(preview.backdrop?.walk?.files ?? {}).map(file => file.uri), ...walkMaps.map(({ full }) => full.uri)]);
  const imageUris = new Set([...walkUris, ...[...Object.values(preview.backdrop?.files ?? {}), ...Object.values(preview.backdrop?.high?.files ?? {})].map(file => file.uri)]);
  for (const { soft } of walkMaps) imageUris.add(soft.uri);
  if (preview.waxNormal) imageUris.add(preview.waxNormal.uri);
  if (preview.backdrop?.high?.trees) imageUris.add(preview.backdrop.high.trees.uri);
  await page.route(url => url.origin === base.origin && url.pathname.startsWith(pinePackagePath), async route => {
    const url = new URL(route.request().url());
    const key = url.pathname.slice(pinePackagePath.length);
    // The recorded ambience ships as ordinary static files beside the package, not inside it, so the
    // preview route must let those through to the server instead of treating them as undeclared.
    if (key.startsWith('sound/')) { await route.fallback(); return; }
    // The visitor cloth is a shipped static asset beside the package rather than a package payload,
    // so it too passes through to the server instead of being read as an undeclared preview file.
    if (key === 'pine-visitor-cloth.glb') { await route.fallback(); return; }
    const asset = preview.assets.get(key);
    const version = url.searchParams.get('v');
    if (!asset || route.request().method() !== 'GET'
      || ((version !== null || imageUris.has(key)) && version !== asset.version)) {
      onError(`Rejected undeclared or mismatched preview request ${url.pathname}.`);
      await route.abort('blockedbyclient');
      return;
    }
    if (walkUris.has(key)) await waitForWalk;
    await route.fulfill({ status: 200, body: asset.body, contentType: asset.contentType, headers: { 'cache-control': 'no-store' } });
    onServed(key);
  });
}
