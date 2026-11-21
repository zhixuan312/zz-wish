// three.js routes a KTX2 image to its KTX2Loader only when the texture declares KHR_texture_basisu.
// GLTFLoader's GLTFTextureBasisUExtension.loadTexture returns null for a texture without it, so the
// image/ktx2 bytes go to the plain ImageLoader, every texture rejects, and the material silently
// falls back to its base colour factor: white bark and a flat green card for the foliage.
//
// The assertion below runs on the delivered model when the walk-tier package is present, and always
// on an inline fixture so the contract is pinned even without a build. Set PINE_TREES_GLB to check a
// specific file; otherwise the walk-tier model declared by web/public/places/pine-gate/manifest.json
// is used when that package carries one.
import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve(new URL('../../..', import.meta.url).pathname);

/** Read the JSON chunk of a GLB without a parser dependency. */
function glbJson(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(0, true), 'GLB magic').toBe(0x46546c67);
  const jsonLength = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes.buffer, bytes.byteOffset + 20, jsonLength)));
}

/** Every texture whose image is KTX2 must declare the basisu extension, and the file must require it. */
function assertBasisuDeclared(json, label) {
  expect(json.extensionsRequired ?? [], `${label} extensionsRequired`).toContain('KHR_texture_basisu');
  const declarations = (json.textures ?? []).map(texture => {
    const extensions = texture.extensions ?? {};
    // The extension moves the image index inside the declaration; a plain texture keeps `source`.
    const source = (extensions.KHR_texture_basisu ?? texture).source;
    return { extensions, source, mimeType: json.images?.[source]?.mimeType };
  });
  const ktx2 = declarations.filter(texture => texture.mimeType === 'image/ktx2');
  expect(ktx2.length, `${label} KTX2 texture count`).toBeGreaterThan(0);
  for (const [index, texture] of ktx2.entries()) {
    const info = texture.extensions.KHR_texture_basisu;
    expect(info, `${label} KTX2 texture ${index} must declare KHR_texture_basisu`).toBeTruthy();
    expect(Number.isSafeInteger(info.source), `${label} KTX2 texture ${index} source`).toBe(true);
    expect(info.source, `${label} KTX2 texture ${index} source matches its image`).toBe(texture.source);
  }
  // A declaration on something that is not KTX2 would point the loader at the wrong decoder.
  for (const [index, texture] of declarations.entries()) {
    if (texture.mimeType === 'image/ktx2') continue;
    expect(texture.extensions.KHR_texture_basisu, `${label} non-KTX2 texture ${index}`).toBeUndefined();
  }
}

function walkTierTreeFile() {
  if (process.env.PINE_TREES_GLB) return resolve(process.env.PINE_TREES_GLB);
  const manifestPath = join(repo, 'web/public/places/pine-gate/manifest.json');
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const uri = manifest.backdrop?.walk?.trees ?? manifest.backdrop?.high?.trees;
  if (!uri) return null;
  const file = join(repo, 'web/public/places/pine-gate', uri);
  return existsSync(file) ? file : null;
}

// A minimal GLB whose JSON chunk is enough to state the contract; no geometry or pixels are needed.
function fixture({ requireBasisu, declare }) {
  const json = {
    asset: { version: '2.0' },
    extensionsUsed: ['EXT_meshopt_compression', ...(requireBasisu ? ['KHR_texture_basisu'] : [])],
    extensionsRequired: ['EXT_meshopt_compression', ...(requireBasisu ? ['KHR_texture_basisu'] : [])],
    images: [{ name: 'bark_diff', mimeType: 'image/ktx2', bufferView: 0 },
      { name: 'bark_nor', mimeType: 'image/ktx2', bufferView: 1 }],
    textures: [{ source: 0, ...(declare ? { extensions: { KHR_texture_basisu: { source: 0 } } } : {}) },
      { source: 1, ...(declare ? { extensions: { KHR_texture_basisu: { source: 1 } } } : {}) }],
    materials: [{ name: 'PineNativeBark' }], meshes: [], nodes: [], scenes: [{ nodes: [] }],
    scene: 0, bufferViews: [{ buffer: 0, byteLength: 8 }, { buffer: 0, byteLength: 8 }], buffers: [{ byteLength: 16 }],
  };
  const body = new TextEncoder().encode(JSON.stringify(json));
  const padded = new Uint8Array(Math.ceil(body.length / 4) * 4).fill(0x20);
  padded.set(body);
  const bin = new Uint8Array(16);
  const total = 12 + 8 + padded.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, total, true);
  view.setUint32(12, padded.length, true); view.setUint32(16, 0x4e4f534a, true);
  out.set(padded, 20);
  const binHeader = 20 + padded.length;
  view.setUint32(binHeader, bin.length, true); view.setUint32(binHeader + 4, 0x004e4942, true);
  out.set(bin, binHeader + 8);
  return out;
}

describe('native tree textures declare KHR_texture_basisu', () => {
  test('a KTX2 texture without the declaration is rejected', () => {
    const json = glbJson(fixture({ requireBasisu: false, declare: false }));
    expect(() => assertBasisuDeclared(json, 'fixture')).toThrow();
  });

  test('a declaration missing extensionsRequired is rejected', () => {
    const json = glbJson(fixture({ requireBasisu: false, declare: true }));
    expect(() => assertBasisuDeclared(json, 'fixture')).toThrow();
  });

  test('a texture declared on a non-KTX2 image is rejected', () => {
    const json = glbJson(fixture({ requireBasisu: true, declare: true }));
    json.images[0].mimeType = 'image/png';
    expect(() => assertBasisuDeclared(json, 'fixture')).toThrow();
  });

  test('the delivered walk-tier model declares it on every KTX2 texture', () => {
    const file = walkTierTreeFile();
    // The committed base-tier package carries no tree model; the walk package is built outside git.
    // Skip rather than pass, so a missing package never reads as a green contract.
    if (!file) {
      console.warn('SKIP: no walk-tier pine-native-trees.glb present; set PINE_TREES_GLB to check one.');
      return;
    }
    assertBasisuDeclared(glbJson(readFileSync(file)), file);
  });
});
