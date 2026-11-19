import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';
import { measurePineRealismBase, readPinePreview } from '../../visual/pine-preview-delivery.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const scratch = [];

afterEach(async () => {
  await Promise.all(scratch.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

async function fixture({ modelBytes = 4, farHighBytes = 8, changedMaster = false } = {}) {
  const worktree = await mkdtemp(join(tmpdir(), 'pine-high-delivery-'));
  scratch.push(worktree);
  const build = join(worktree, 'art/build/pine-gate');
  const near = join(worktree, 'near'), plate = join(worktree, 'base'), high = join(worktree, 'high'), sculpt = join(worktree, 'sculpt');
  await Promise.all([build, near, plate, high, sculpt].map(path => mkdir(path, { recursive: true })));
  const json = (root, uri, value) => writeFile(join(root, uri), JSON.stringify(value));
  const add = async (root, uri, bytes) => {
    const body = Buffer.alloc(bytes, uri.length);
    await writeFile(join(root, uri), body);
    return { uri, bytes, sha256: sha(body) };
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
  for (const [root, width] of [[plate, 2048], [high, 8192]]) {
    const layers = {};
    for (const name of ['far', 'mid', 'cloud']) {
      const file = await add(root, `pine-vista-${name}.webp`, root === high && name === 'far' ? farHighBytes : 6);
      layers[name] = { ...file, masterSha256: sha(changedMaster && root === high && name === 'far' ? 'other' : name) };
    }
    await json(root, 'encode.json', { width, height: width / 2, encoding: 'log2-8-8', preExposure: 6,
      colorSpace: 'linear', alpha: 'straight', renderSha256: sha('shared render'), layers });
  }
  const stage = (label, useHigh = true) => {
    const output = join(build, label);
    const args = [join(repo, 'scripts/stage-pine-backdrop.mjs'), '--near', near, '--plates', plate, '--sculpt', sculpt, '--out', output];
    if (useHigh) args.push('--high', high);
    const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
    return { ...result, output };
  };
  return { worktree, high, stage };
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
