import { createHash } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import * as THREE from 'three';
import projection from '../../../shared/pine-gate-backdrop.json' with { type: 'json' };
import { readPineBackdrop, readPineWaxNormal } from '../../../web/src/engine/baked/pineManifest.js';
import { loadPineGateBackdrop } from '../../../web/src/engine/places/pine-gate-backdrop.js';

const bytesOf = uri => new TextEncoder().encode(uri);
const checkSum = bytes => createHash('sha256').update(bytes).digest('hex');
const file = uri => ({ uri, bytes: bytesOf(uri).length, sha256: checkSum(bytesOf(uri)) });
const layers = { far: 'far.webp', mid: 'mid.webp', cloud: 'cloud.webp' };
const model = 'pine-gate.glb';
const normal = 'wax.png';
const manifest = () => ({
  scene: model, files: [model, ...Object.values(layers), normal].map(file),
  backdrop: { encoding: 'log2-8-8', width: 2048, height: 1024, layers: { ...layers } },
  waxSculpt: { normal },
});

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

test('a delivered Pine Gate backdrop and wax normal must be fully declared', () => {
  const valid = manifest();
  expect(readPineBackdrop(valid).files.far).toEqual(file(layers.far));
  expect(readPineWaxNormal(valid)).toEqual(file(normal));
  expect(readPineBackdrop({ files: [] })).toBeNull();
  expect(readPineWaxNormal({ files: [] })).toBeNull();
  expect(() => readPineBackdrop({ ...valid, backdrop: { ...valid.backdrop, width: 2049 } })).toThrow('backdrop declaration');
  expect(() => readPineBackdrop({ ...valid, files: [file(layers.far), ...valid.files] })).toThrow('Missing or invalid');
  expect(() => readPineBackdrop({ ...valid, files: valid.files.filter(file => file.uri !== layers.mid) })).toThrow('Missing or invalid');
  expect(() => readPineWaxNormal({ ...valid, waxSculpt: { normal: '../wax.png' } })).toThrow('asset name');
});

test('Pine Gate prefetch verifies and counts its declared backdrop and wax image bytes', async () => {
  const delivery = manifest();
  const request = vi.fn(async url => {
    const [uri, version] = url.split('/').at(-1).split('?v=');
    if (uri === 'manifest.json') return Response.json(delivery);
    expect(version).toBe(file(uri).sha256);
    return new Response(bytesOf(uri));
  });
  vi.stubGlobal('fetch', request);
  const { prefetchBakedPlace, readBakedAsset } = await import('../../../web/src/engine/baked/prefetchPlace.js');
  const events = [];
  await prefetchBakedPlace('pine-gate', progress => events.push(progress));
  const size = delivery.files.reduce((sum, file) => sum + file.bytes, 0);
  expect(events.at(-1)).toEqual({ loadedBytes: size, totalBytes: size, ratio: 1, stage: 'ready' });
  expect(new Uint8Array(await readBakedAsset('pine-gate', file(layers.mid)))).toEqual(bytesOf(layers.mid));
  expect(request).toHaveBeenCalledTimes(1 + delivery.files.length);
});

test('fixed far, mid and cloud planes share the authored aperture and retain world parallax', async () => {
  const delivery = manifest();
  const baked = { manifest: delivery, cameraPreExposure: projection.preExposure, loadTexture: vi.fn(async uri => {
    const texture = new THREE.Texture({ width: delivery.backdrop.width, height: delivery.backdrop.height });
    texture.name = uri;
    return texture;
  }) };
  const renderer = { capabilities: { maxTextureSize: 8192 }, initTexture: vi.fn() };
  const backdrop = await loadPineGateBackdrop(baked, renderer, { n: 0, g: 0 });
  expect(renderer.initTexture).toHaveBeenCalledTimes(3);
  const camera = new THREE.PerspectiveCamera(projection.verticalFov, projection.width / projection.height, .1, 1500);
  const origin = new THREE.Vector3(...projection.position);
  camera.position.copy(origin);
  camera.lookAt(origin.clone().add(new THREE.Vector3(...projection.direction)));
  camera.updateMatrixWorld();
  backdrop.group.updateMatrixWorld();
  const planes = backdrop.group.children;
  expect(planes.map(plane => plane.name)).toEqual(['far', 'mid', 'cloud']);
  for (const plane of planes) {
    const corner = new THREE.Vector3(plane.geometry.parameters.width / 2, plane.geometry.parameters.height / 2, 0);
    plane.localToWorld(corner).project(camera);
    expect(corner.x).toBeCloseTo(1, 10);
    expect(corner.y).toBeCloseTo(1, 10);
    expect(plane.material).toMatchObject({ transparent: true, depthTest: true, depthWrite: false, toneMapped: false });
  }
  camera.position.x += 1;
  camera.updateMatrixWorld();
  const parallax = planes.map(plane => Math.abs(plane.getWorldPosition(new THREE.Vector3()).project(camera).x));
  expect(parallax[0]).toBeLessThan(parallax[1]);
  expect(parallax[1]).toBeLessThan(parallax[2]);
  backdrop.update({ n: .5, g: 1 });
  expect(backdrop.group.visible).toBe(false);
  backdrop.update({ n: 1, g: 0 });
  expect(backdrop.group.visible).toBe(false);
  backdrop.update({ n: 0, g: 0 });
  expect(backdrop.group.visible).toBe(true);
  backdrop.dispose();
});
