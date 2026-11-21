import * as THREE from 'three';
import { afterEach, expect, test, vi } from 'vitest';
import { readPineWalkLightmaps } from '../../../web/src/engine/baked/pineManifest.js';
import { loadBakedPlace } from '../../../web/src/engine/baked/loadPlace.js';

const state = vi.hoisted(() => ({ manifest: null, group: null, download: vi.fn(), decode: vi.fn() }));
vi.mock('../../../web/src/engine/baked/prefetchPlace.js', () => ({
  readBakedManifest: async () => state.manifest,
  readBakedAsset: async (_id, file) => {
    await state.download(file.uri);
    return new globalThis.TextEncoder().encode(file.uri).buffer;
  },
}));
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setKTX2Loader() { return this; }
    setMeshoptDecoder() { return this; }
    async loadAsync() { return { scene: state.group }; }
  },
}));
vi.mock('three/examples/jsm/loaders/KTX2Loader.js', () => ({
  KTX2Loader: class {
    setTranscoderPath() { return this; }
    detectSupport() { return this; }
    async loadAsync(url) {
      const uri = url.startsWith('blob:') ? await globalThis.fetch(url).then(response => response.text())
        : url.split('/').at(-1).split('?')[0];
      state.decode(uri);
      const texture = new THREE.Texture();
      texture.mipmaps = Array.from({ length: uri.endsWith('-soft.ktx2') ? 1 : 3 });
      return texture;
    }
  },
}));

const names = ['approach', 'gate', 'niche'];
const passes = ['night', 'dusk', 'day', 'lamp'];
const day = { n: 0, g: 0 };
const atlas = (region, pass, soft = false) => `${region}-${pass}${soft ? '-soft' : ''}.ktx2`;
const fullDeferred = new Set(names.slice(1).flatMap(region => passes.map(pass => atlas(region, pass))));

function fixture(regions = names) {
  const scene = 'pine.glb';
  const files = [{ uri: scene, bytes: 1, sha256: 'a'.repeat(64) }];
  const declare = uri => { files.push({ uri, bytes: 1, sha256: 'a'.repeat(64) }); return uri; };
  const tier = (width, prefix, extension) => ({ width, height: width / 2, encoding: 'log2-8-8',
    layers: Object.fromEntries(['far', 'mid', 'cloud'].map(name => [name, declare(`${prefix}-${name}.${extension}`)])),
  });
  const backdrop = tier(2048, 'early', 'webp');
  backdrop.walk = tier(8192, 'walk', 'ktx2');
  const lightmaps = Object.fromEntries(regions.map(region => [region,
    Object.fromEntries(passes.map(pass => [pass, { uri: declare(atlas(region, pass)), mipLevels: 3 }])),
  ]));
  const walkLightmaps = Object.fromEntries(names.slice(1).map(region => [region,
    Object.fromEntries(passes.map(pass => [pass, declare(atlas(region, pass, true))])),
  ]));
  state.manifest = { scene, files, backdrop, lightmaps, walkLightmaps };
  state.group = new THREE.Group();
  for (const region of regions) {
    const geometry = new THREE.BoxGeometry();
    geometry.setAttribute('uv1', geometry.getAttribute('uv'));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.userData.region = region;
    state.group.add(mesh);
  }
  return { renderer: { capabilities: { getMaxAnisotropy: () => 4 }, initTexture: vi.fn() } };
}

afterEach(() => { vi.restoreAllMocks(); state.download.mockReset(); state.decode.mockReset(); });

test('the Pine walk contract rejects an alias of a full native map', () => {
  fixture();
  expect(readPineWalkLightmaps(state.manifest).gate.day.full.uri).toBe('gate-day.ktx2');
  state.manifest.walkLightmaps.gate.day = 'niche-day.ktx2';
  expect(() => readPineWalkLightmaps(state.manifest)).toThrow('Invalid Pine Gate full and soft lightmaps');
});

test('walk lightmaps keep a visible coarse sampler until the verified native mip can fade in', async () => {
  const { renderer } = fixture();
  const clock = vi.spyOn(globalThis.performance, 'now').mockReturnValue(1000);
  const { promise: held, resolve: release } = Promise.withResolvers();
  state.download.mockImplementation(uri => fullDeferred.has(uri) ? held : undefined);
  const place = await loadBakedPlace('pine-gate', renderer, day);
  const shader = { uniforms: {}, vertexShader: '', fragmentShader: '#include <lights_fragment_maps>' };
  const gate = place.group.children[1].material;
  gate.onBeforeCompile(shader);
  expect(gate.customProgramCacheKey()).toContain('walk-mip');
  expect(shader.fragmentShader).toContain('decodeBaked(textureLod(map,uv,2.).rgb,scale,range,gain)');
  expect(shader.uniforms.uBakedDay.value.name).toBe(atlas('gate', 'day', true));
  expect(state.download.mock.calls.flat().filter(uri => fullDeferred.has(uri))).toEqual([]);

  const stream = place.startWalkLightmaps();
  expect(place.startWalkLightmaps()).toBe(stream);
  expect(new Set(state.download.mock.calls.flat().filter(uri => fullDeferred.has(uri)))).toEqual(fullDeferred);
  clock.mockReturnValue(31_000);
  place.update(day, 1);
  expect(shader.uniforms.uBakedDay.value.name).toBe(atlas('gate', 'day', true));
  expect(shader.uniforms.uBakedLamp.value.name).toBe(atlas('gate', 'lamp', true));
  expect(renderer.initTexture).not.toHaveBeenCalled();

  release();
  expect(await stream).toBe(true);
  expect(renderer.initTexture.mock.calls.flat().map(texture => texture.name).sort()).toEqual([
    'gate-day.ktx2', 'gate-lamp.ktx2', 'niche-day.ktx2', 'niche-lamp.ktx2',
  ]);
  expect(shader.uniforms.uBakedDay.value.name).toBe(atlas('gate', 'day'));
  expect(place.lightingState().walkLightmaps).toEqual({ available: passes, native: ['day', 'lamp'], mix: [1, 1, 0, 0] });
  clock.mockReturnValue(31_400);
  place.update(day, 1);
  expect(shader.uniforms.uBakedWalkMix.value.toArray()).toEqual([1, 1, .5, .5]);
  clock.mockReturnValue(31_800);
  place.update(day, 1);
  expect(shader.uniforms.uBakedWalkMix.value.toArray()).toEqual([1, 1, 1, 1]);
  place.dispose();
});

const indirectLamp = { lampPassQuantity: 'indirect-diffuse-radiance-per-unit-albedo' };

async function readPrograms(id, renderer) {
  const place = await loadBakedPlace(id, renderer, day);
  try {
    return place.group.children.map(({ material }) => {
      const { vertexShader, fragmentShader } = THREE.ShaderLib.physical;
      const shader = { vertexShader, fragmentShader, uniforms: {} };
      material.onBeforeCompile(shader);
      return { key: material.customProgramCacheKey(), source: [shader.vertexShader, shader.fragmentShader], uniforms: shader.uniforms };
    });
  } finally {
    place.dispose();
  }
}

function expectDistinctPrograms(programs) {
  expect(new Set(programs.map(program => program.key)).size).toBe(programs.length);
  expect(new Set(programs.map(program => JSON.stringify(program.source))).size).toBe(programs.length);
}

test('Snow regions share the wrapped shader and keep their own atlases', async () => {
  const regions = ['altar', 'court', 'gate', 'hall'];
  async function load({ indirect, gauze }) {
    const { renderer } = fixture(regions);
    if (indirect) state.manifest.bake = indirectLamp;
    state.manifest.lampBasis = {
      position: [0, 1, 0], pointRadiusMetres: .02, watts: 45, linearColor: [1, .7, .45],
      ...(gauze ? { transport: { type: 'actual-gauze', version: 1 } } : {}),
    };
    return readPrograms('snow-roof', renderer);
  }
  const snow = await load({ indirect: true, gauze: true });
  const [altar] = snow;
  expect(altar.source[1]).toContain('getVisitorOriginalPointShadow');
  expect(altar.source[1]).toContain('getGauzeOriginalPointLightInfo');
  expect(altar.source[1]).toContain('getStaticLampVisibility');
  for (const [index, program] of snow.entries()) {
    expect(program.key).toBe(altar.key);
    expect(program.source).toEqual(altar.source);
    expect(program.uniforms.uBakedDay.value.name).toBe(atlas(regions[index], 'day'));
  }
  expect(new Set(snow.map(program => program.uniforms.uBakedDay)).size).toBe(regions.length);
  const [withoutGauze] = await load({ indirect: true, gauze: false });
  const [withoutStaticShadow] = await load({ indirect: false, gauze: true });
  expectDistinctPrograms([altar, withoutGauze, withoutStaticShadow]);
});

test('Pine shares equivalent native regions and separates terrain and wax shader branches', async () => {
  const native = fixture();
  delete state.manifest.walkLightmaps;
  state.manifest.bake = indirectLamp;
  const [approach, gate, niche] = await readPrograms('pine-gate', native.renderer);
  expect(gate.key).toBe(approach.key);
  expect(gate.source).toEqual(approach.source);
  expect(gate.uniforms.uBakedDay.value.name).toBe(atlas('gate', 'day'));
  expect(approach.uniforms.uBakedDay.value.name).toBe(atlas('approach', 'day'));

  const walk = fixture();
  state.manifest.bake = indirectLamp;
  for (const name of ['Wax of the two remaining short candles', 'Weathered cold wax tone 1']) {
    const mesh = state.group.children[2].clone();
    mesh.material = mesh.material.clone();
    mesh.material.name = name;
    state.group.add(mesh);
  }
  const [, gateWalk, nicheWalk, cooledWax, spentWax] = await readPrograms('pine-gate', walk.renderer);
  const fullLamp = fixture();
  const [fullLampApproach] = await readPrograms('pine-gate', fullLamp.renderer);
  expectDistinctPrograms([approach, niche, gateWalk, nicheWalk, cooledWax, spentWax, fullLampApproach]);
});
