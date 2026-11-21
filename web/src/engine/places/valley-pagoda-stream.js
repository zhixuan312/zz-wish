import { STREAM_X } from './valley-pagoda-camera.js';

const CHANNEL_FRONT = 49;
const CHANNEL_END = -102;
export const STREAM_Y = -.48;

const SIDE_COLUMNS = [-.26, -.10, 0, .12, .29, .49, .76, 1.10, 1.52, 2.1, 2.8,
  3.6, 4.5, 5.5, 6.8, 8.2, 10, 12.5, 16, 21, 28, 38, 54, 73];
const ROWS = 151;

const clamp = (value) => Math.max(0, Math.min(1, value));
const mix = (a, b, amount) => a + (b - a) * amount;
const smooth = (a, b, value) => {
  const k = clamp((value - a) / (b - a));
  return k * k * (3 - 2 * k);
};

export function streamCenter(z) {
  const bend = Math.exp(-(((z + 31) / 14) ** 2));
  return STREAM_X - 1.55 * bend + 4.4 * Math.max(0, (-z - 38) / 39);
}

export function streamHalfWidth(z) {
  return 2.5 + Math.sin(z * .19) * .21 + Math.sin(z * .57 + 2) * .075;
}

export function streamEdge(z, side) {
  return streamCenter(z) + side * streamHalfWidth(z);
}

/** The crossing court stays level. Outside it the floodplain climbs away from a cut channel. */
export function valleyBankHeight(x, z) {
  const distance = Math.abs(x - streamCenter(z)) - streamHalfWidth(z);
  const east = x > streamCenter(z);
  const wetNoise = Math.sin(z * .67 + x * .25) * .055 + Math.sin(z * .23 - x * .85) * .06;
  const shelves = Math.sin(x * .264 + z * .08) * .22 + Math.cos(z * .13 - x * .17) * .13;
  const wetLip = -.523 + wetNoise * .18
    + smooth(-.04, .52 + wetNoise, distance) * (.22 + wetNoise)
    + smooth(.32, 1.45, distance) * (.26 + wetNoise * .6);
  const downstream = 1 - smooth(-39, -22, z);
  const shoulder = (.18 + shelves + (east ? .22 : .09) * downstream)
    * smooth(.9, 5.5, distance);
  const toes = (.50 + .28 * Math.sin(z * .08 - x * .14))
    * smooth(5, 15, distance) * downstream;
  const court = smooth(-27, -22, z) * (1 - smooth(42, 48, z))
    * smooth(-14, -11.5, x) * (1 - smooth(8.9, 10.35, x)) * smooth(.7, 1.8, distance);
  const floodplain = wetLip + shoulder + toes;
  const trim = smooth(54, 73, distance);
  return mix(mix(floodplain, 0, court), -.825, trim);
}

function makeBanks(THREE) {
  const earth = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .97 });
  earth.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 vValleyBank;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nvValleyBank = position;',
    );
    shader.fragmentShader = 'varying vec3 vValleyBank;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>', `#include <color_fragment>
        vec2 groundGrain = vValleyBank.xz;
        float freckle = sin(groundGrain.x * 43.8 + sin(groundGrain.y * 26.1))
                      * sin(groundGrain.y * 30.9 - sin(groundGrain.x * 17.6));
        float stone = sin(groundGrain.x * 3.1 - groundGrain.y * 5.2)
                    * cos(groundGrain.x * 7.3 + groundGrain.y * 4.3);
        diffuseColor.rgb *= .93 + .08 * freckle + .11 * stone;`,
    );
  };
  earth.customProgramCacheKey = () => 'valley-cut-earth-v1';

  const wet = new THREE.Color(0x36382e);
  const sand = new THREE.Color(0x7a6a52);
  const grass = new THREE.Color(0x51603d);
  const moss = new THREE.Color(0x374831);
  const turf = new THREE.Color(0x5a5c49);
  const tint = new THREE.Color();
  return [-1, 1].map((side) => {
    const positions = [], colors = [], triangles = [];
    const width = SIDE_COLUMNS.length;
    for (let row = 0; row <= ROWS; row++) {
      const z = mix(CHANNEL_END, CHANNEL_FRONT, row / ROWS);
      const edge = streamEdge(z, side);
      for (let i = 0; i < width; i++) {
        const offset = SIDE_COLUMNS[i];
        const x = edge + side * offset;
        const y = valleyBankHeight(x, z);
        positions.push(x, y, z);
        const patch = Math.sin(x * 1.83 + z * .39) * Math.sin(z * 1.05 - x * .58);
        const wash = .5 + .5 * Math.sin(z * .48 + 2.4 * side);
        tint.copy(wet).lerp(sand, smooth(-.1, .44, offset) * (.63 + .34 * wash));
        tint.lerp(grass, smooth(.22, 1.36, offset)).lerp(moss, smooth(.4, 2, offset) * (.33 + .41 * patch));
        const managed = smooth(-29, -23, z) * (1 - smooth(39, 48, z))
          * smooth(-13.4, -9, x) * (1 - smooth(7.5, 9, x));
        tint.lerp(turf, managed * .81).multiplyScalar(.96 + .10 * patch);
        colors.push(tint.r, tint.g, tint.b);
        if (row === ROWS || i === width - 1) continue;
        const a = row * width + i, b = a + 1, c = a + width, d = c + 1;
        if (side === 1) triangles.push(a, c, b, b, c, d);
        else triangles.push(a, b, c, b, d, c);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(triangles);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const bank = new THREE.Mesh(geometry, earth);
    bank.name = 'Valley floodplain and cut stream bank';
    bank.receiveShadow = true;
    return bank;
  });
}

function addSedgePatches(THREE, group) {
  const geometry = new THREE.BufferGeometry();
  const positions = [], colors = [];
  const leaf = new THREE.Color();
  const wet = new THREE.Color(0x465236);
  const tip = new THREE.Color(0x829264);
  for (const side of [-1, 1]) {
    for (let patch = 0; patch < 39; patch++) {
      const z0 = -81 + patch * 2.2 + Math.sin(patch * 2.3 + side) * 1.2;
      if (Math.sin(patch * .63 + side * 1.8) < -.46) continue;
      const bank = side * (.27 + .31 * (.5 + .5 * Math.sin(patch * 1.59)));
      for (let stem = 0; stem < 13; stem++) {
        const phase = stem * 2.4 + patch * 1.17;
        const z = z0 + Math.cos(phase * 2.14) * .54;
        const x = streamEdge(z, side) + bank + Math.sin(phase * 1.7) * .24;
        const y = valleyBankHeight(x, z) - .035;
        const height = .10 + (.5 + .5 * Math.sin(phase * 4.8)) * (side < 0 ? .18 : .29);
        const width = height * .072;
        const bendX = Math.cos(phase) * height * .52;
        const bendZ = Math.sin(phase) * height * .52;
        const edgeX = -Math.sin(phase) * width;
        const edgeZ = Math.cos(phase) * width;
        const baseL = [x - edgeX, y, z - edgeZ], baseR = [x + edgeX, y, z + edgeZ];
        const kneeL = [x + bendX * .16 - edgeX, y + height * .67, z + bendZ * .16 - edgeZ];
        const kneeR = [x + bendX * .16 + edgeX, y + height * .67, z + bendZ * .16 + edgeZ];
        const end = [x + bendX, y + height, z + bendZ];
        positions.push(...baseL, ...baseR, ...kneeR, ...baseL, ...kneeR, ...kneeL, ...kneeL, ...kneeR, ...end);
        for (const green of [.02, 0, .48, .02, .48, .42, .42, .48, .76]) {
          leaf.copy(wet).lerp(tip, green + .09 * Math.sin(phase * 5.47));
          colors.push(leaf.r, leaf.g, leaf.b);
        }
      }
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .91 });
  const plants = new THREE.Mesh(geometry, material);
  plants.name = 'Grouped sedges at the wet edge';
  plants.receiveShadow = true;
  group.add(plants);
}

export function addValleyStream(h) {
  const { THREE, water, rock } = h;
  const C = h.context;
  for (const bank of makeBanks(THREE)) C.G.add(bank);
  addSedgePatches(THREE, C.G);

  const waterZ = (CHANNEL_END + CHANNEL_FRONT) * .5;
  const bed = new THREE.PlaneGeometry(2, CHANNEL_FRONT - CHANNEL_END, 1, ROWS);
  const points = bed.attributes.position;
  for (let i = 0; i < points.count; i++) {
    const z = waterZ - points.getY(i);
    points.setX(i, points.getX(i) * streamHalfWidth(z) + streamCenter(z) - STREAM_X);
  }
  bed.computeBoundingSphere();
  const stream = water(STREAM_Y, 0x24413f, { geo: bed, x: STREAM_X, z: waterZ, waves: 1.2, env: .46, rough: .26 });
  stream.material.clearcoat = .05;
  stream.material.specularIntensity = .54;

  // Irregular shore clumps leave open runs. Some stones sit low enough to break the water surface.
  for (let i = 0; i < 36; i++) {
    const z = -79 + i * 3.4;
    const size = .25 + C.rnd() * .48;
    const west = C.rnd(), east = C.rnd();
    if (i % 5 !== 2 && west > .21) {
      const x = streamEdge(z, -1) - (.10 + west * .53);
      rock(x, valleyBankHeight(x, z) - .14, z, [size, size * .57, size * 1.35], i * 3 + 7);
      if (i % 4 === 0) rock(x + .65, STREAM_Y - .21, z - .92, [size * .77, size * .58, size * .88], i * 17 + 7);
    }
    if (i % 4 !== 2 && east < .83) {
      const t = z + .3 + east * 2.1;
      const x = streamEdge(t, 1) + east * .86 - .12;
      rock(x, valleyBankHeight(x, t) - .10, t, [size * 1.04, size * .63, size * 1.29], i * 3 + 8);
    }
  }

  const current = new THREE.MeshBasicMaterial({ color: 0x8eb2ae, transparent: true, opacity: .16, depthWrite: false });
  const ripples = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, .024).rotateX(-Math.PI / 2), current, 44);
  ripples.name = 'Short drifting strokes of reflected light';
  ripples.frustumCulled = false;
  ripples.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  C.G.add(ripples);
  const pose = new THREE.Object3D();
  const strokes = Array.from({ length: ripples.count }, () => ({
    width: .17 + C.rnd() * .38, yaw: (C.rnd() - .5) * .55,
    z: -75 + C.rnd() * 110, along: (C.rnd() - .5) * 1.6,
  }));
  const update = (dt) => {
    strokes.forEach((line, i) => {
      line.z -= dt * .53;
      if (line.z < -84) line.z += 119;
      const width = streamHalfWidth(line.z);
      pose.position.set(streamCenter(line.z) + width * line.along, STREAM_Y + .013, line.z);
      pose.rotation.y = line.yaw;
      pose.scale.set(line.width, 1, 1);
      pose.updateMatrix();
      ripples.setMatrixAt(i, pose.matrix);
    });
    ripples.instanceMatrix.needsUpdate = true;
  };
  update(0);
  C.up.push(update);
}
