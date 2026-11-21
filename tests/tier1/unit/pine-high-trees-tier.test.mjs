// The call site in pine-gate-baked.js must find the tree model whichever tier declares it.
// pineManifest reports a model declared in the walk tier on `walk` and sets `high` to null, so reading
// only `high` found nothing in every shipped package: the 3.5 MB of native pines were fetched and
// never installed. These tests pin the tier expression the call site uses.
import { expect, test } from 'vitest';
import { readPineBackdrop } from '../../../web/src/engine/baked/pineManifest.js';
import projection from '../../../shared/pine-gate-backdrop.json' with { type: 'json' };

const sha = 'a'.repeat(64);
const names = Object.keys(projection.distances);

// Names follow the shipped scheme: the base tier may use .webp, and readPineBackdrop rejects
// anything that is not the declared extension.
function manifestWith({ walkTrees, highTrees }) {
  const files = [];
  const add = uri => files.push({ uri, bytes: 1024, sha256: sha });
  const baseLayers = Object.fromEntries(names.map(name => [name, `pine-vista-${name}.webp`]));
  const backdrop = { encoding: 'log2-8-8', width: 2048, height: 1024, layers: baseLayers };
  for (const uri of Object.values(baseLayers)) add(uri);
  if (walkTrees) {
    // The shipped shape: a shared walk tier at the native plate resolution, carrying the model.
    const walkLayers = Object.fromEntries(names.map(name => [name, `pine-vista-walk-${name}.ktx2`]));
    backdrop.walk = { encoding: 'log2-8-8', width: projection.width, height: projection.height,
      layers: walkLayers, trees: walkTrees.uri, treeReceiptSha256: sha };
    for (const uri of [...Object.values(walkLayers), walkTrees.uri]) add(uri);
  }
  if (highTrees) {
    // The older desktop-only shape: no walk tier, `high` is a plate tier of its own that carries the
    // model. It cannot repeat a base plate, so it gets its own names.
    const highLayers = Object.fromEntries(names.map(name => [name, `pine-high-${name}.webp`]));
    backdrop.high = { encoding: 'log2-8-8', width: projection.width, height: projection.height,
      layers: highLayers, trees: highTrees.uri, treeReceiptSha256: sha };
    for (const uri of [...Object.values(highLayers), highTrees.uri]) add(uri);
  }
  return { files, backdrop, scene: 'pine-gate.glb.zstd' };
}

function file(uri) {
  return { uri, bytes: 1024, sha256: sha };
}

// The exact expression the call site uses. If this changes, the test must change with it.
const treeFile = manifest => {
  const tiers = readPineBackdrop(manifest);
  return tiers?.walk?.trees ?? tiers?.high?.trees;
};

test('a walk-tier manifest yields the tree model on walk, and the call site finds it', () => {
  const manifest = manifestWith({ walkTrees: file('walk-trees.glb') });
  const tiers = readPineBackdrop(manifest);
  expect(tiers.treesInWalk).toBe(true);
  expect(tiers.high).toBeNull();
  // The regression: reading only `high` saw nothing for the tier every shipped package uses.
  expect(tiers?.high?.trees).toBeUndefined();
  expect(treeFile(manifest)).toMatchObject({ uri: 'walk-trees.glb' });
});

test('a high-tier manifest yields the tree model on high, and the call site still finds it', () => {
  const manifest = manifestWith({ highTrees: file('high-trees.glb') });
  const tiers = readPineBackdrop(manifest);
  // No walk tier exists in this shape, so the tier flag is absent and the model is on `high`.
  expect(tiers.walk).toBeUndefined();
  expect(tiers.treesInWalk).toBeFalsy();
  expect(treeFile(manifest)).toMatchObject({ uri: 'high-trees.glb' });
});

test('a manifest with no tree model yields nothing, so no installer is built', () => {
  const manifest = manifestWith({});
  const tiers = readPineBackdrop(manifest);
  expect(tiers.walk).toBeUndefined();
  expect(tiers.high).toBeNull();
  expect(treeFile(manifest)).toBeUndefined();
});
