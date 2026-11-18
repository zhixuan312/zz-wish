import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

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
    assets.set(name, { body, version: file.sha256, contentType: 'application/octet-stream' });
  }
  return { assets, scene: manifest.scene, samples: manifest.bake.samples, manifestSha256: expectedSha };
}

export async function routePinePreview(page, base, preview, onError, onServed) {
  await page.route(url => url.origin === base.origin && url.pathname.startsWith(pinePackagePath), async route => {
    const url = new URL(route.request().url());
    const key = url.pathname.slice(pinePackagePath.length);
    const asset = preview.assets.get(key);
    const version = url.searchParams.get('v');
    if (!asset || route.request().method() !== 'GET' || (version !== null && version !== asset.version)) {
      onError(`Rejected undeclared or mismatched preview request ${url.pathname}.`);
      await route.abort('blockedbyclient');
      return;
    }
    await route.fulfill({ status: 200, body: asset.body, contentType: asset.contentType, headers: { 'cache-control': 'no-store' } });
    onServed(key);
  });
}
