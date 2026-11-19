import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KTX2Container, read as readKtx, write as writeKtx } from 'three/examples/jsm/libs/ktx-parse.module.js';
import { afterEach, expect, test } from 'vitest';
import { measurePineRealismBase, readPinePreview } from '../../visual/pine-preview-delivery.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const scratch = [];

afterEach(async () => {
  await Promise.all(scratch.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

async function fixture({ modelBytes = 4, farHighBytes = 8, changedMaster = false, farWalkBytes = 8, orientation = 'ru',
  nearMips = false } = {}) {
  const worktree = await mkdtemp(join(tmpdir(), 'pine-high-delivery-'));
  scratch.push(worktree);
  const build = join(worktree, 'art/build/pine-gate');
  const near = join(worktree, 'near'), plate = join(worktree, 'base'), high = join(worktree, 'high'), sculpt = join(worktree, 'sculpt');
  const walk = join(worktree, 'walk');
  await Promise.all([build, near, plate, high, sculpt, walk].map(path => mkdir(path, { recursive: true })));
  const json = (root, uri, value) => writeFile(join(root, uri), JSON.stringify(value));
  const add = async (root, uri, bytes) => {
    let body = Buffer.alloc(bytes, uri.length);
    if (root === walk) {
      const texture = new KTX2Container();
      Object.assign(texture, { pixelWidth: 8192, pixelHeight: 4096, supercompressionScheme: 2,
        keyValue: { KTXorientation: orientation }, levels: [{ levelData: body, uncompressedByteLength: 33_554_432 }] });
      Object.assign(texture.dataFormatDescriptor[0], { colorModel: 166, colorPrimaries: 1, transferFunction: 1 });
      body = writeKtx(texture);
    }
    if (nearMips && root === near && /^(gate|niche)-\w+\.ktx2$/.test(uri)) {
      const texture = new KTX2Container();
      const size = uri.startsWith('gate-') ? 1024 : 512;
      Object.assign(texture, { pixelWidth: size, pixelHeight: size, supercompressionScheme: 2,
        keyValue: { KTXorientation: 'rd' }, levels: [0, 1, 2].map(level => ({
          levelData: Buffer.alloc(160 >> level, uri.length + level),
          uncompressedByteLength: (size >> level) ** 2,
        })) });
      Object.assign(texture.dataFormatDescriptor[0], { colorModel: 166, colorPrimaries: 1, transferFunction: 1 });
      body = writeKtx(texture);
    }
    await writeFile(join(root, uri), body);
    return { uri, bytes: body.length, sha256: sha(body) };
  };
  const scene = 'pine.gltf.glb';
  const files = [await add(near, scene, modelBytes)];
  const lightmaps = {};
  for (const region of ['approach', 'gate', 'niche']) {
    lightmaps[region] = {};
    for (const pass of ['day', 'dusk', 'night', 'lamp']) {
      const file = await add(near, `${region}-${pass}.ktx2`, 5);
      files.push(file);
      lightmaps[region][pass] = { uri: file.uri, bytes: file.bytes, samples: 8 };
    }
  }
  await json(near, 'manifest.json', { place: 'pine-gate', scene, files, lightmaps, partialPreview: true, bake: { samples: 8 } });
  const normal = await add(sculpt, 'wax.png', 3);
  await json(sculpt, 'wax-sculpt.json', { normalMaps: { pillar: normal }, sourceSha256: sha('wax') });
  for (const [root, width] of [[plate, 2048], [high, 8192], [walk, 8192]]) {
    const layers = {};
    for (const name of ['far', 'mid', 'cloud']) {
      const webpBytes = root === high && name === 'far' ? farHighBytes : 6;
      const file = root === walk ? await add(root, `pine-vista-${name}.ktx2`, name === 'far' ? farWalkBytes : 6)
        : await add(root, `pine-vista-${name}.webp`, webpBytes);
      layers[name] = { ...file, masterSha256: sha(changedMaster && root === high && name === 'far' ? 'other' : name) };
    }
    await json(root, 'encode.json', { width, height: width / 2, encoding: 'log2-8-8', preExposure: 6,
      colorSpace: 'linear', alpha: 'straight', renderSha256: sha('shared render'), layers });
  }
  const stage = (label, useHigh = true, defer = false) => {
    const output = join(build, label);
    const args = [join(repo, 'scripts/stage-pine-backdrop.mjs'), '--near', near, '--plates', plate, '--sculpt', sculpt, '--out', output];
    if (useHigh === 'walk') args.push('--walk', walk);
    else if (useHigh) args.push('--high', high);
    if (defer) args.push('--defer-near-lightmaps');
    const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
    return { ...result, output };
  };
  return { worktree, near, high, stage };
}

test('the high payload is renamed and verified while only its bodies are outside the base budget', async () => {
  const { worktree, high, stage } = await fixture();
  const ordinary = JSON.parse(await readFile(join(repo, 'web/public/places/pine-gate/manifest.json')));
  for (const useHigh of [false, true]) {
    const staged = stage(useHigh ? 'upgrade' : 'base', useHigh);
    expect(staged.status, staged.stderr).toBe(0);
    const manifest = await readFile(join(staged.output, 'manifest.json'));
    const preview = await readPinePreview(worktree, staged.output, sha(manifest));
    const budget = await measurePineRealismBase(repo, preview, ordinary);
    if (!useHigh) {
      expect(budget).not.toHaveProperty('combinedBytes');
      expect(budget.backdrop).not.toHaveProperty('high');
      continue;
    }
    expect(budget.highBytes).toBe(20);
    expect(budget.combinedBytes).toBe(budget.totalBytes + budget.highBytes);
    expect(budget.totalBytes).toBe(manifest.length + budget.sharedAgXBytes + 85);
    expect(budget.backdrop.high.files.far.uri).toBe('pine-vista-high-far.webp');
    expect(await readFile(join(staged.output, 'pine-vista-high-far.webp'))).toEqual(await readFile(join(high, 'pine-vista-far.webp')));
    expect(JSON.parse(manifest).backdrop.high.encodedReceiptSha256).toBe(sha(await readFile(join(high, 'encode.json'))));
  }
});

test('the walk payload is shared by phone and desktop and stays outside the base budget', async () => {
  const { worktree, stage } = await fixture();
  const staged = stage('walk-upgrade', 'walk');
  expect(staged.status, staged.stderr).toBe(0);
  const manifest = await readFile(join(staged.output, 'manifest.json'));
  const preview = await readPinePreview(worktree, staged.output, sha(manifest));
  const ordinary = JSON.parse(await readFile(join(repo, 'web/public/places/pine-gate/manifest.json')));
  const budget = await measurePineRealismBase(repo, preview, ordinary);
  expect(budget.walkBytes).toBeGreaterThan(0);
  expect(budget.totalBytes).toBe(manifest.length + budget.sharedAgXBytes + 85);
  expect(budget.phoneBytes).toBe(budget.totalBytes + budget.walkBytes);
  expect(budget.combinedBytes).toBe(budget.phoneBytes);
  expect(preview.backdrop.walk.files.mid.uri).toBe('pine-vista-walk-mid.ktx2');
});

test('the soft near lightmaps use the original mip blocks, preserve full maps, and count toward base', async () => {
  const { near, stage } = await fixture({ nearMips: true });
  const result = stage('deferred-walk', 'walk', true);
  expect(result.status, result.stderr).toBe(0);
  const suffix = result.stdout.split('\n').find(line => line.startsWith('PINE_BACKDROP_BUDGET '));
  const budget = JSON.parse(suffix.slice('PINE_BACKDROP_BUDGET '.length));
  const manifest = JSON.parse(await readFile(join(result.output, 'manifest.json')));
  const fullFiles = [];
  const softFiles = [];
  for (const [region, lights] of Object.entries(manifest.walkLightmaps)) {
    for (const [pass, softUri] of Object.entries(lights)) {
      const fullUri = manifest.lightmaps[region][pass].uri;
      const original = await readFile(join(near, fullUri));
      const full = await readFile(join(result.output, fullUri));
      const soft = await readFile(join(result.output, softUri));
      expect(original).toEqual(full);
      const originalKtx = readKtx(original);
      const softKtx = readKtx(soft);
      expect(softKtx.pixelWidth).toEqual(originalKtx.pixelWidth >> 2);
      expect(softKtx.keyValue.KTXorientation).toBe(originalKtx.keyValue.KTXorientation);
      expect(softKtx.levels).toEqual([originalKtx.levels[2]]);
      expect(manifest.files.find(file => file.uri === softUri).sha256).toBe(sha(soft));
      fullFiles.push(full.length);
      softFiles.push(soft.length);
    }
  }
  expect(fullFiles).toHaveLength(8);
  expect(budget.walkLightmapBytes).toBe(fullFiles.reduce((a, b) => a + b, 0));
  expect(budget.softLightmapBytes).toBe(softFiles.reduce((a, b) => a + b, 0));
  expect(budget.phoneBytes).toBe(budget.baseBytes + budget.walkBytes);
  expect(budget.baseBytes).toBe(manifest.completePackageBytes + budget.nativeAgXBytes - budget.walkBytes);
});

test.each([
  [{ orientation: 'rd' }, /bottom-up, linear, single-level native Basis/],
  [{ farWalkBytes: 29_900_000 }, /exceeds the combined Pine Gate phone asset budget/],
])('walk staging rejects projection changes and phone overflow before writing %j', async (options, error) => {
  const { stage } = await fixture(options);
  const result = stage('rejected-walk', 'walk');
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(error);
  await expect(stat(result.output)).rejects.toMatchObject({ code: 'ENOENT' });
});

test.each([
  [{ changedMaster: true }, /tiers disagree on far masterSha256/],
  [{ modelBytes: 14_950_000 }, /exceeds the Pine Gate base asset budget/],
  [{ farHighBytes: 39_900_000 }, /exceeds the combined Pine Gate desktop asset budget/],
])('staging refuses mismatched provenance and either budget overflow before writing %j', async (options, error) => {
  const { stage } = await fixture(options);
  const result = stage('rejected');
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(error);
  await expect(stat(result.output)).rejects.toMatchObject({ code: 'ENOENT' });
});
