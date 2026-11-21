import * as THREE from 'three';
import { readSnowCourtRelight } from '../baked/snowCourtManifest.js';

const fadeMs = 800;
const retryMs = 30_000;
const slots = ['A', 'B'];

export function createSnowCourtRelight(baked, renderer) {
  const looks = readSnowCourtRelight(baked.manifest);
  if (!looks) return null;
  const placeholder = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  placeholder.needsUpdate = true;
  const weights = { value: new THREE.Vector2() };
  const far = { uSnowRelightWeights: weights };
  const court = { uSnowRelightWeights: weights };
  for (const slot of slots) {
    far['uSnowFar' + slot] = { value: placeholder };
    court['uSnowCourt' + slot] = { value: placeholder };
    court['uSnowDecode' + slot] = { value: new THREE.Vector3() };
  }
  const active = new Map();
  let selection = [];
  let entered = false;
  let disposed = false;

  function release(entry) {
    if (entry.textures) for (const texture of entry.textures) baked.disposeTexture(texture);
  }

  async function prepare(name, entry) {
    const { far, court } = looks[name];
    const results = await Promise.allSettled([baked.loadTexture(far.uri), baked.loadTexture(court.uri)]);
    const textures = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    if (active.get(name) !== entry || disposed) {
      for (const texture of textures) baked.disposeTexture(texture);
      return;
    }
    try {
      const [plate, map] = textures;
      if (textures.length !== 2 || plate.image?.width !== far.width || plate.image?.height !== far.height ||
          !map.isCompressedTexture || map.mipmaps.length !== 3) {
        throw results.find(result => result.status === 'rejected')?.reason
          ?? new Error(`Unexpected Snow Roof directional payload: ${name}`);
      }
      for (const texture of textures) renderer.initTexture(texture);
      entry.textures = textures;
      entry.readyAt = performance.now();
    } catch (error) {
      for (const texture of textures) baked.disposeTexture(texture);
      entry.retryAt = performance.now() + retryMs;
      console.warn('Keeping the base Snow Roof lighting while a directional look loads.', error);
    }
  }

  function update(next) {
    selection = next;
    if (!entered || disposed) return;
    const now = performance.now();
    for (const [name, entry] of active) {
      if (selection.some(item => item.name === name)) continue;
      active.delete(name);
      release(entry);
    }
    weights.value.set(0, 0);
    for (const [index, slot] of slots.entries()) {
      const item = selection[index];
      const name = item?.name;
      let entry = active.get(name);
      if (name && (!entry || entry.retryAt <= now)) {
        entry = {};
        active.set(name, entry);
        void prepare(name, entry);
      }
      const textures = entry?.textures;
      far['uSnowFar' + slot].value = textures?.[0] ?? placeholder;
      court['uSnowCourt' + slot].value = textures?.[1] ?? placeholder;
      if (textures) {
        const meta = looks[name].court;
        court['uSnowDecode' + slot].value.set(meta.scale, meta.logRange, meta.logGain);
        weights.value.setComponent(index, item.weight * THREE.MathUtils.smoothstep(now, entry.readyAt, entry.readyAt + fadeMs));
      }
    }
  }

  return {
    far,
    update,
    start() {
      entered = true;
      update(selection);
    },
    state() {
      return selection.map(({ name, weight }, index) => ({
        name, requested: weight, ready: !!active.get(name)?.textures, actual: weights.value.getComponent(index),
        directionEngine: looks[name].directionEngine,
        farUri: far['uSnowFar' + slots[index]].value.name || null,
        courtUri: court['uSnowCourt' + slots[index]].value.name || null,
      }));
    },
    install(material) {
      const compile = material.onBeforeCompile;
      const cacheKey = material.customProgramCacheKey.bind(material);
      material.onBeforeCompile = (shader, webgl) => {
        compile.call(material, shader, webgl);
        Object.assign(shader.uniforms, court);
        shader.fragmentShader = `
          uniform sampler2D uSnowCourtA, uSnowCourtB;
          uniform vec3 uSnowDecodeA, uSnowDecodeB;
          uniform vec2 uSnowRelightWeights;
        ` + shader.fragmentShader.replace('float away=', `
          baked *= 1. - uSnowRelightWeights.x - uSnowRelightWeights.y;
          if (uSnowRelightWeights.x > 0.) {
            baked += uSnowRelightWeights.x * decodeBaked(texture2D(uSnowCourtA, vLightMapUv).rgb,
              uSnowDecodeA.x, uSnowDecodeA.y, uSnowDecodeA.z);
          }
          if (uSnowRelightWeights.y > 0.) {
            baked += uSnowRelightWeights.y * decodeBaked(texture2D(uSnowCourtB, vLightMapUv).rgb,
              uSnowDecodeB.x, uSnowDecodeB.y, uSnowDecodeB.z);
          }
          float away=`);
      };
      material.customProgramCacheKey = () => cacheKey() + ':snow-court-relight-v1';
    },
    dispose() {
      disposed = true;
      for (const entry of active.values()) release(entry);
      active.clear();
      placeholder.dispose();
    },
  };
}
