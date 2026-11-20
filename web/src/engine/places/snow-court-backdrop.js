import * as THREE from 'three';
import projection from '../../../../shared/snow-court-backdrop.json' with { type: 'json' };
import { readSnowCourtBackdrop } from '../baked/snowCourtManifest.js';

const fadeMs = 800;
const retryMs = 30_000;

const vertexShader = `varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }`;

const fragmentShader = `uniform sampler2D uPlate, uUpgradePlate, uNightPlate;
  uniform vec2 uPlateSampleSize, uUpgradeSampleSize;
  uniform float uUpgradeMix, uNightWeight, uNightMix;
  varying vec2 vUv;

  vec4 linearPlate(sampler2D image, vec2 uv) {
    vec4 encoded = texture2D(image, uv);
    vec3 radiance = (exp2(encoded.rgb * log2(65.)) - 1.) / 8.;
    return vec4(radiance * encoded.a, encoded.a);
  }

  vec4 samplePlate(sampler2D image, vec2 size, vec2 dx, vec2 dy) {
    // The native single-level GPU textures do not have hardware mipmaps.
    float footprint = max(length(dx * size), length(dy * size));
    if (footprint <= 1.25) return linearPlate(image, vUv);
    vec2 a = (dx + dy) * .25;
    vec2 b = (dx - dy) * .25;
    return (linearPlate(image, vUv + a) + linearPlate(image, vUv - a)
      + linearPlate(image, vUv + b) + linearPlate(image, vUv - b)) * .25;
  }

  void main() {
    vec2 dx = dFdx(vUv), dy = dFdy(vUv);
    vec4 color = samplePlate(uPlate, uPlateSampleSize, dx, dy);
    if (uUpgradeMix > 0.) {
      vec4 detail = samplePlate(uUpgradePlate, uUpgradeSampleSize, dx, dy);
      color = mix(color, detail, uUpgradeMix);
    }
    if (uNightWeight > 0.) {
      // Hold the same silhouettes until the independently lit night set is ready.
      vec4 dark = vec4(color.rgb * vec3(.071, .089, .127), color.a);
      if (uNightMix > 0.) dark = mix(dark, linearPlate(uNightPlate, vUv), uNightMix);
      color = mix(color, dark, uNightWeight);
    }
    vec2 border = min(vUv, 1. - vUv);
    float edge = smoothstep(0., .015, min(border.x, border.y));
    // Blowing snow in the sheltered cutting conceals the distant valley
    // until the walker emerges from the gate onto the open court.
    float valleyTransmission = 1. - smoothstep(9.5, 13.4, cameraPosition.z);
    gl_FragColor = color * edge * valleyTransmission;
  }`;

export async function loadSnowCourtBackdrop(baked, renderer, initialLight) {
  const descriptor = readSnowCourtBackdrop(baked.manifest);
  if (!descriptor) return null;
  if (baked.cameraPreExposure !== projection.preExposure) {
    throw new Error('Snow Roof backdrop exposure does not match the place bake');
  }
  const maximumSize = renderer.capabilities.maxTextureSize;
  const fits = tier => tier && Math.max(tier.width, tier.height) <= maximumSize;
  if (!fits(descriptor)) throw new Error('Snow Roof backdrop exceeds the device texture limit');
  const walk = fits(descriptor.walk) ? descriptor.walk : null;
  const night = fits(descriptor.night) ? descriptor.night : null;
  const high = fits(descriptor.high) ? descriptor.high : null;
  const names = Object.keys(descriptor.files);
  const owned = new Set();
  let disposed = false;

  function release(texture) {
    if (owned.delete(texture)) baked.disposeTexture(texture);
  }

  async function loadSet(tier, concurrent = false) {
    const loaded = new Map();
    let complete = false;
    async function prepare(name) {
      const file = tier.files[name];
      const texture = await baked.loadTexture(file.uri);
      owned.add(texture);
      loaded.set(name, texture);
      if (disposed) return;
      if (texture.image?.width !== tier.width || texture.image?.height !== tier.height) {
        throw new Error(`Wrong Snow Roof backdrop dimensions: ${file.uri}`);
      }
      renderer.initTexture(texture);
    }
    try {
      if (concurrent) {
        const results = await Promise.allSettled(names.map(prepare));
        const failure = results.find(result => result.status === 'rejected');
        if (failure) throw failure.reason;
      } else {
        // Stage one upload at a time, then publish the whole set in one frame.
        for (const name of names) {
          if (disposed) return null;
          await prepare(name);
        }
      }
      if (disposed) return null;
      complete = true;
      return loaded;
    } finally {
      if (!complete) for (const texture of loaded.values()) release(texture);
    }
  }

  const base = await loadSet(descriptor, true);
  const origin = new THREE.Vector3(...projection.position);
  const forward = new THREE.Vector3(...projection.direction).normalize();
  const slope = Math.tan(THREE.MathUtils.degToRad(projection.verticalFov / 2));
  const aspect = projection.width / projection.height;
  const group = new THREE.Group();
  group.name = 'Snow Roof Cycles backdrop';
  const uUpgradeMix = { value: 0 };
  const uNightWeight = { value: 0 };
  const uNightMix = { value: 0 };
  let entered = false;
  let wantsHigh = false;
  let dayTier = descriptor;
  let dayTransition = null;
  let dayRequest, nightRequest;
  let walkFailed = false;
  let nightAt = null;
  let retryDayAt = 0;
  let retryNightAt = 0;

  // Draw the transparent plates over the sky in authored order. Depth testing
  // still lets the courtyard and shrine occlude the landscape.
  for (const [index, name] of names.entries()) {
    const texture = base.get(name);
    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader,
      uniforms: {
        uPlate: { value: texture }, uUpgradePlate: { value: texture }, uNightPlate: { value: texture },
        uPlateSampleSize: { value: new THREE.Vector2() }, uUpgradeSampleSize: { value: new THREE.Vector2() },
        uUpgradeMix, uNightWeight, uNightMix,
      },
      transparent: true, premultipliedAlpha: true, depthWrite: false, toneMapped: false,
    });
    const distance = projection.distances[name];
    const height = 2 * distance * slope;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(height * aspect, height), material);
    plane.name = name;
    plane.position.copy(origin).addScaledVector(forward, distance);
    plane.lookAt(origin);
    plane.renderOrder = -30 + index;
    group.add(plane);
  }

  function startDay(now) {
    if (!entered || disposed || dayRequest || dayTransition || now < retryDayAt || dayTier === high) return dayRequest;
    const tier = walk && dayTier !== walk && !(walkFailed && wantsHigh && high) ? walk : wantsHigh ? high : null;
    if (!tier) return;
    dayRequest = loadSet(tier).then(textures => {
      if (!textures || disposed) return false;
      for (const plane of group.children) {
        const texture = textures.get(plane.name);
        const { uUpgradePlate, uUpgradeSampleSize } = plane.material.uniforms;
        uUpgradePlate.value = texture;
        const native = texture.isCompressedTexture && texture.mipmaps.length < 2;
        uUpgradeSampleSize.value.set(native ? tier.width : 0, native ? tier.height : 0);
      }
      dayTransition = { tier, start: performance.now() };
      return true;
    }).catch(() => {
      if (tier === walk) walkFailed = true;
      retryDayAt = performance.now() + retryMs;
      return false;
    }).finally(() => { dayRequest = null; });
    return dayRequest;
  }

  function startNight(now) {
    if (!night || !entered || disposed || nightRequest || nightAt !== null || now < retryNightAt || uNightWeight.value === 0) return;
    nightRequest = loadSet(night).then(textures => {
      if (!textures || disposed) return;
      for (const plane of group.children) plane.material.uniforms.uNightPlate.value = textures.get(plane.name);
      nightAt = performance.now();
    }).catch(() => {
      retryNightAt = performance.now() + retryMs;
    }).finally(() => { nightRequest = null; });
  }

  function update(light) {
    if (disposed) return;
    const now = performance.now();
    uNightWeight.value = THREE.MathUtils.smoothstep(light.n, .13, .97);
    startNight(now);
    if (nightAt !== null) uNightMix.value = THREE.MathUtils.smoothstep(now, nightAt, nightAt + fadeMs);
    if (dayTransition) {
      const { tier, start } = dayTransition;
      uUpgradeMix.value = THREE.MathUtils.smoothstep(now, start, start + fadeMs);
      if (uUpgradeMix.value === 1) {
        for (const plane of group.children) {
          const { uPlate, uUpgradePlate, uNightPlate, uPlateSampleSize, uUpgradeSampleSize } = plane.material.uniforms;
          const previous = uPlate.value;
          uPlate.value = uUpgradePlate.value;
          uPlateSampleSize.value.copy(uUpgradeSampleSize.value);
          if (nightAt === null) uNightPlate.value = uPlate.value;
          release(previous);
        }
        dayTier = tier;
        dayTransition = null;
        uUpgradeMix.value = 0;
      }
    }
    startDay(now);
  }

  update(initialLight);
  return {
    group, update,
    startWalk() {
      entered = true;
      const now = performance.now();
      startNight(now);
      return startDay(now);
    },
    startDesktopHigh() {
      wantsHigh = true;
      return startDay(performance.now());
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const plane of group.children) {
        plane.geometry.dispose();
        plane.material.dispose();
      }
      group.clear();
      for (const texture of owned) release(texture);
    },
  };
}
