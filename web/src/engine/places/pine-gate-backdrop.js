import * as THREE from 'three';
import projection from '../../../../shared/pine-gate-backdrop.json' with { type: 'json' };
import { readPineBackdrop } from '../baked/pineManifest.js';

const vertexShader = `varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }`;

const fragmentShader = `uniform sampler2D uPlate;
  uniform float uDayOpacity;
  varying vec2 vUv;
  void main() {
    vec4 encoded = texture2D(uPlate, vUv);
    vec3 radiance = (exp2(encoded.rgb * log2(65.)) - 1.) / 8.;
    vec2 border = min(vUv, 1. - vUv);
    float edge = smoothstep(0., .015, min(border.x, border.y));
    gl_FragColor = vec4(radiance, encoded.a * uDayOpacity * edge);
  }`;

export async function loadPineGateBackdrop(baked, renderer, initialLight) {
  const descriptor = readPineBackdrop(baked.manifest);
  if (!descriptor) return null;
  const { files, width, height } = descriptor;
  if (baked.cameraPreExposure !== projection.preExposure) throw new Error('Pine Gate backdrop exposure does not match the place bake');
  if (Math.max(width, height) > renderer.capabilities.maxTextureSize) throw new Error('Pine Gate backdrop exceeds the device texture limit');
  const plates = await Promise.all(Object.entries(files).map(async ([name, file]) => {
    const texture = await baked.loadTexture(file.uri);
    if (texture.image.width !== width || texture.image.height !== height) throw new Error(`Wrong Pine Gate backdrop dimensions: ${file.uri}`);
    return { name, texture };
  }));

  const origin = new THREE.Vector3(...projection.position);
  const forward = new THREE.Vector3(...projection.direction).normalize();
  const slope = Math.tan(THREE.MathUtils.degToRad(projection.verticalFov / 2));
  const aspect = projection.width / projection.height;
  const group = new THREE.Group();
  const uDayOpacity = { value: 1 };
  group.name = 'Pine Gate Cycles backdrop';
  // Render the transparent plates over the sky from far to near. The depth
  // test still lets any nearer solid terrain or shrine occlude them.
  for (const [index, { name, texture }] of plates.entries()) {
    renderer.initTexture(texture);
    const distance = projection.distances[name];
    const planeHeight = 2 * distance * slope;
    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, uniforms: { uPlate: { value: texture }, uDayOpacity },
      transparent: true, depthWrite: false, toneMapped: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(planeHeight * aspect, planeHeight), material);
    plane.name = name;
    plane.position.copy(origin).addScaledVector(forward, distance);
    plane.lookAt(origin);
    plane.renderOrder = -30 + index;
    group.add(plane);
  }

  function update(light) {
    const day = (1 - light.n) * (1 - light.g);
    uDayOpacity.value = THREE.MathUtils.smoothstep(day, .4, .95);
    group.visible = uDayOpacity.value > 0;
  }
  update(initialLight);
  return {
    group, update,
    dispose() {
      group.removeFromParent();
      for (const plane of group.children) {
        plane.geometry.dispose();
        plane.material.dispose();
      }
      group.clear();
    },
  };
}
