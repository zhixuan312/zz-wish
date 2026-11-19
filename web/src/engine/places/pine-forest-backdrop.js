import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }
`;

const fragmentShader = `
  uniform sampler2D uPlate;
  uniform float uOpacity, uStation;
  varying vec2 vUv;

  void main() {
    vec4 encoded = texture2D(uPlate, vUv);
    vec2 border = min(vUv, 1. - vUv);
    float edge = smoothstep(0., .012, min(border.x, border.y));
    // Fine leaves retain coverage; the live verge takes over before the
    // camera gets close enough to resolve individual plate texels.
    float mediumDistance = smoothstep(5.5, 8.0, cameraPosition.z - uStation);
    float coverage = smoothstep(.12, .71, encoded.a);
    float alpha = coverage * edge * uOpacity * mediumDistance;
    if (alpha < .002) discard;
    vec3 radiance = (exp2(encoded.rgb * log2(65.)) - 1.) / 8.;
    gl_FragColor = vec4(radiance, alpha);
  }
`;

export function readPineForestBackdrop(manifest) {
  const forest = manifest.approachForest;
  if (forest === undefined) return null;
  const { width, height, centerY, widthMetres, heightMetres, layers } = forest ?? {};
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0)
    || !Number.isFinite(centerY)
    || ![widthMetres, heightMetres].every(value => Number.isFinite(value) && value > 0)
    || Math.abs(width - height * widthMetres / heightMetres) > 1
    || !Array.isArray(layers) || layers.length < 2) {
    throw new Error('Invalid Pine Gate approach forest dimensions.');
  }
  const depths = new Set(), files = new Set();
  const plates = layers.map(layer => {
    const { z, uri } = layer ?? {};
    if (!Number.isFinite(z) || depths.has(z) || typeof uri !== 'string'
      || !/^[a-z0-9][a-z0-9._-]*\.webp$/.test(uri) || files.has(uri)) {
      throw new Error('Invalid Pine Gate approach forest layer.');
    }
    const {
      width: pixelWidth = width, height: pixelHeight = height, centerX = 0,
      widthMetres: planeWidth = widthMetres, heightMetres: planeHeight = heightMetres, centerY: planeY = centerY,
    } = layer;
    if (![pixelWidth, pixelHeight].every(value => Number.isSafeInteger(value) && value > 0)
      || ![planeWidth, planeHeight].every(value => Number.isFinite(value) && value > 0)
      || ![centerX, planeY].every(Number.isFinite)
      || Math.abs(pixelWidth - pixelHeight * planeWidth / planeHeight) > 1) {
      throw new Error(`Invalid Pine Gate crop geometry for ${uri}.`);
    }
    const rows = manifest.files.filter(file => file.uri === uri);
    const [file] = rows;
    if (rows.length !== 1 || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      throw new Error(`Missing Pine Gate approach forest asset ${uri}.`);
    }
    depths.add(z);
    files.add(uri);
    return { z, file, pixelWidth, pixelHeight, planeWidth, planeHeight, centerX, planeY };
  });
  return { width, height, centerY, widthMetres, heightMetres, plates: plates.sort((a, b) => a.z - b.z) };
}

export async function loadPineForestBackdrop(baked, renderer, light, descriptor) {
  if (!descriptor) return null;
  const { plates } = descriptor;
  if (plates.some(plate => Math.max(plate.pixelWidth, plate.pixelHeight) > renderer.capabilities.maxTextureSize)) {
    throw new Error('Pine Gate approach forest exceeds the device texture limit.');
  }
  const textures = await Promise.all(plates.map(async ({ file, pixelWidth, pixelHeight }) => {
    const texture = await baked.loadTexture(file.uri);
    if (texture.image.width !== pixelWidth || texture.image.height !== pixelHeight) {
      baked.disposeTexture(texture);
      throw new Error(`Wrong Pine Gate approach forest dimensions for ${file.uri}.`);
    }
    return texture;
  }));

  const group = new THREE.Group();
  group.name = 'Pine Gate layered approach forest';
  const uOpacity = { value: 1 };
  // Facing the approach, the cutouts pass behind the camera naturally.
  // Render farther cutouts first and let nearby opaque terrain occlude them.
  for (const [index, { z, file, planeWidth, planeHeight, centerX, planeY }] of plates.entries()) {
    const texture = textures[index];
    renderer.initTexture(texture);
    const material = new THREE.ShaderMaterial({
      uniforms: { uPlate: { value: texture }, uOpacity, uStation: { value: z } },
      vertexShader, fragmentShader, side: THREE.FrontSide,
      transparent: true, depthWrite: false, toneMapped: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(planeWidth, planeHeight), material);
    plane.name = file.uri;
    plane.position.set(centerX, planeY, z);
    plane.renderOrder = -20 + index;
    group.add(plane);
  }

  function update(daylight) {
    // The plates depict the reference midday light. The baked scene takes
    // over through twilight until independently lit forest plates exist.
    const day = (1 - daylight.n) * (1 - daylight.g);
    uOpacity.value = THREE.MathUtils.smoothstep(day, .35, .88);
    group.visible = uOpacity.value > 0;
  }
  update(light);
  return {
    group, update,
    dispose() {
      group.removeFromParent();
      for (const plane of group.children) { plane.geometry.dispose(); plane.material.dispose(); }
      for (const texture of textures) baked.disposeTexture(texture);
      group.clear();
    },
  };
}
