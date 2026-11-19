import * as THREE from 'three';
import projection from '../../../../shared/pine-gate-backdrop.json' with { type: 'json' };
import { readPineBackdrop } from '../baked/pineManifest.js';

const vertexShader = `varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }`;

const fragmentShader = `uniform sampler2D uPlate, uHighPlate, uNightPlate;
  uniform float uDayOpacity, uHighMix, uNightWeight, uNightMix;
  uniform vec2 uNativePlateSize;
  varying vec2 vUv;
  vec4 plate(sampler2D image) {
    vec4 encoded = texture2D(image, vUv);
    return vec4((exp2(encoded.rgb * log2(65.)) - 1.) / 8., encoded.a);
  }
  vec4 premultipliedPlate(vec2 uv) {
    vec4 encoded = texture2D(uHighPlate, uv);
    vec3 radiance = (exp2(encoded.rgb * log2(65.)) - 1.) / 8.;
    return vec4(radiance * encoded.a, encoded.a);
  }
  vec4 nativePlate(vec2 dx, vec2 dy) {
    float footprint = max(length(dx * uNativePlateSize), length(dy * uNativePlateSize));
    if (footprint <= 1.25) return plate(uHighPlate);
    vec2 a = (dx + dy) * .25;
    vec2 b = (dx - dy) * .25;
    vec4 box = (premultipliedPlate(vUv + a) + premultipliedPlate(vUv - a)
      + premultipliedPlate(vUv + b) + premultipliedPlate(vUv - b)) * .25;
    return vec4(box.rgb / max(box.a, .0001), box.a);
  }
  vec4 mixPlates(vec4 a, vec4 b, float weight) {
    float alpha = mix(a.a, b.a, weight);
    vec3 radiance = mix(a.rgb * a.a, b.rgb * b.a, weight);
    return vec4(radiance / max(alpha, .0001), alpha);
  }
  void main() {
    vec2 dx = dFdx(vUv), dy = dFdy(vUv);
    vec4 color = uHighMix >= 1. ? nativePlate(dx, dy) : plate(uPlate);
    if (uHighMix > 0. && uHighMix < 1.) {
      color = mixPlates(color, nativePlate(dx, dy), uHighMix);
    }
    if (uNightWeight > 0.) {
      // A soft silhouette covers the valley during a slow request. The
      // separately rendered lunar light takes over as the set arrives.
      vec4 dark = vec4(color.rgb * vec3(.071, .089, .127), color.a);
      if (uNightMix > 0.) dark = mixPlates(dark, plate(uNightPlate), uNightMix);
      color = mixPlates(color, dark, uNightWeight);
    }
    vec2 border = min(vUv, 1. - vUv);
    float edge = smoothstep(0., .015, min(border.x, border.y));
    gl_FragColor = vec4(color.rgb, color.a * uDayOpacity * edge);
  }`;

export async function loadPineGateBackdrop(baked, renderer, initialLight) {
  const descriptor = readPineBackdrop(baked.manifest);
  if (!descriptor) return null;
  const { files, width, height, walk, high, night } = descriptor;
  if (baked.cameraPreExposure !== projection.preExposure) throw new Error('Pine Gate backdrop exposure does not match the place bake');
  const maximumSize = renderer.capabilities.maxTextureSize;
  if (Math.max(width, height) > maximumSize) throw new Error('Pine Gate backdrop exceeds the device texture limit');
  const load = async (file, tier) => {
    const texture = await baked.loadTexture(file.uri);
    if (texture.image.width !== tier.width || texture.image.height !== tier.height) {
      baked.disposeTexture(texture);
      throw new Error(`Wrong Pine Gate backdrop dimensions: ${file.uri}`);
    }
    return texture;
  };
  const plates = await Promise.all(Object.entries(files).map(async ([name, file]) =>
    ({ name, texture: await load(file, descriptor) })));

  const origin = new THREE.Vector3(...projection.position);
  const forward = new THREE.Vector3(...projection.direction).normalize();
  const slope = Math.tan(THREE.MathUtils.degToRad(projection.verticalFov / 2));
  const aspect = projection.width / projection.height;
  const group = new THREE.Group();
  const uDayOpacity = { value: 1 };
  const uHighMix = { value: 0 };
  const uNightWeight = { value: 0 };
  const uNightMix = { value: 0 };
  let disposed = false, upgradedAt = null, request;
  let walkStarted = false, nightAt = null, nightRequest, retryNightAt = 0;
  group.name = 'Pine Gate Cycles backdrop';
  // Render the transparent plates over the sky from far to near. The depth
  // test still lets any nearer solid terrain or shrine occlude them.
  for (const [index, { name, texture }] of plates.entries()) {
    renderer.initTexture(texture);
    const distance = projection.distances[name];
    const planeHeight = 2 * distance * slope;
    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, uniforms: {
        uPlate: { value: texture }, uHighPlate: { value: texture }, uNightPlate: { value: texture },
        uDayOpacity, uHighMix, uNightWeight, uNightMix,
        uNativePlateSize: { value: new THREE.Vector2() },
      },
      transparent: true, depthWrite: false, toneMapped: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(planeHeight * aspect, planeHeight), material);
    plane.name = name;
    plane.position.copy(origin).addScaledVector(forward, distance);
    plane.lookAt(origin);
    plane.renderOrder = -30 + index;
    group.add(plane);
  }

  async function loadSet(tier, install) {
    const upgrades = [];
    let complete = false;
    try {
      for (const plane of group.children) {
        if (disposed) return false;
        const texture = await load(tier.files[plane.name], tier);
        upgrades.push([plane, texture]);
        if (disposed) return false;
        renderer.initTexture(texture);
      }
      install(upgrades);
      complete = true;
      return true;
    } finally {
      if (!complete) {
        for (const [, texture] of upgrades) baked.disposeTexture(texture);
      }
    }
  }

  function loadUpgrade(tier) {
    // Upload sequentially after entry. Only fade after the whole set arrives.
    return loadSet(tier, upgrades => {
      for (const [plane, texture] of upgrades) {
        const { uHighPlate, uNativePlateSize } = plane.material.uniforms;
        uHighPlate.value = texture;
        // Averaging the native forest and cloud in premultiplied form
        // preserves their edges when a screen pixel covers many texels.
        if (texture.isCompressedTexture && (plane.name === 'mid' || plane.name === 'cloud')) {
          uNativePlateSize.value.set(tier.width, tier.height);
        }
      }
      upgradedAt = performance.now();
    });
  }

  function start(tier) {
    if (disposed || !tier?.files || Math.max(tier.width, tier.height) > maximumSize) return;
    if (!request) request = loadUpgrade(tier).catch(() => false).then(ready => {
      if (!ready) request = null;
      return ready;
    });
    return request;
  }

  function startNight(now) {
    if (disposed || nightRequest || now < retryNightAt || Math.max(night.width, night.height) > maximumSize) return;
    nightRequest = loadSet(night, plates => {
      for (const [plane, texture] of plates) plane.material.uniforms.uNightPlate.value = texture;
      nightAt = performance.now();
    }).catch(() => {
      retryNightAt = performance.now() + 30_000;
      nightRequest = null;
    });
  }

  function update(light) {
    const now = performance.now();
    if (night) {
      uNightWeight.value = THREE.MathUtils.smoothstep(light.n, .13, .97);
      if (walkStarted && uNightWeight.value > 0) startNight(now);
      if (nightAt !== null) uNightMix.value = THREE.MathUtils.smoothstep(now, nightAt, nightAt + 800);
    } else {
      const day = (1 - light.n) * (1 - light.g);
      uDayOpacity.value = THREE.MathUtils.smoothstep(day, .4, .95);
    }
    group.visible = uDayOpacity.value > 0;
    if (upgradedAt !== null && uHighMix.value < 1) {
      uHighMix.value = THREE.MathUtils.smoothstep(now, upgradedAt, upgradedAt + 800);
      if (walk && uHighMix.value === 1) {
        for (const plane of group.children) {
          const { uPlate, uHighPlate } = plane.material.uniforms;
          baked.disposeTexture(uPlate.value);
          uPlate.value = uHighPlate.value;
        }
      }
    }
  }
  update(initialLight);
  return {
    group, update,
    startWalk() {
      walkStarted = true;
      if (night && uNightWeight.value > 0) startNight(performance.now());
      return start(walk);
    },
    startDesktopHigh: () => start(high),
    dispose() {
      disposed = true;
      group.removeFromParent();
      for (const plane of group.children) {
        plane.geometry.dispose();
        plane.material.dispose();
      }
      group.clear();
    },
  };
}
