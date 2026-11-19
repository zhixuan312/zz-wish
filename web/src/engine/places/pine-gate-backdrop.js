import * as THREE from 'three';
import projection from '../../../../shared/pine-gate-backdrop.json' with { type: 'json' };
import { readPineBackdrop } from '../baked/pineManifest.js';

const vertexShader = `varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }`;

const fragmentShader = `uniform sampler2D uPlate, uHighPlate;
  uniform float uDayOpacity, uHighMix;
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
  void main() {
    vec2 dx = dFdx(vUv), dy = dFdy(vUv);
    vec4 color = uHighMix >= 1. ? nativePlate(dx, dy) : plate(uPlate);
    if (uHighMix > 0. && uHighMix < 1.) {
      vec4 high = nativePlate(dx, dy);
      float alpha = mix(color.a, high.a, uHighMix);
      vec3 radiance = mix(color.rgb * color.a, high.rgb * high.a, uHighMix);
      color = vec4(radiance / max(alpha, .0001), alpha);
    }
    vec2 border = min(vUv, 1. - vUv);
    float edge = smoothstep(0., .015, min(border.x, border.y));
    gl_FragColor = vec4(color.rgb, color.a * uDayOpacity * edge);
  }`;

export async function loadPineGateBackdrop(baked, renderer, initialLight) {
  const descriptor = readPineBackdrop(baked.manifest);
  if (!descriptor) return null;
  const { files, width, height, walk, high } = descriptor;
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
  let disposed = false, upgradedAt = null, request;
  group.name = 'Pine Gate Cycles backdrop';
  // Render the transparent plates over the sky from far to near. The depth
  // test still lets any nearer solid terrain or shrine occlude them.
  for (const [index, { name, texture }] of plates.entries()) {
    renderer.initTexture(texture);
    const distance = projection.distances[name];
    const planeHeight = 2 * distance * slope;
    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, uniforms: {
        uPlate: { value: texture }, uHighPlate: { value: texture }, uDayOpacity, uHighMix,
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

  async function loadUpgrade(tier) {
    // Upload sequentially after entry. The transition starts only when every
    // layer is ready, so colour, parallax and silhouette agree during the fade.
    const upgrades = [];
    try {
      for (const plane of group.children) {
        if (disposed) return false;
        const texture = await load(tier.files[plane.name], tier);
        upgrades.push([plane, texture]);
        if (disposed) return false;
        renderer.initTexture(texture);
      }
      for (const [plane, texture] of upgrades) {
        const { uHighPlate, uNativePlateSize } = plane.material.uniforms;
        uHighPlate.value = texture;
        // Sample the screen footprint of the single-level forest and cloud
        // textures. Averaging in premultiplied form preserves their soft edges.
        if (texture.isCompressedTexture && (plane.name === 'mid' || plane.name === 'cloud')) {
          uNativePlateSize.value.set(tier.width, tier.height);
        }
      }
      upgradedAt = performance.now();
      return true;
    } finally {
      if (upgradedAt === null) {
        for (const [, texture] of upgrades) baked.disposeTexture(texture);
      }
    }
  }

  function start(tier) {
    if (disposed || !tier?.files || Math.max(tier.width, tier.height) > maximumSize) return;
    if (!request) request = loadUpgrade(tier).catch(() => false).then(ready => {
      if (!ready) request = null;
      return ready;
    });
    return request;
  }

  function update(light) {
    const day = (1 - light.n) * (1 - light.g);
    uDayOpacity.value = THREE.MathUtils.smoothstep(day, .4, .95);
    group.visible = uDayOpacity.value > 0;
    if (upgradedAt !== null && uHighMix.value < 1) {
      uHighMix.value = THREE.MathUtils.smoothstep(performance.now(), upgradedAt, upgradedAt + 800);
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
    group, update, startWalk: () => start(walk), startDesktopHigh: () => start(high),
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
