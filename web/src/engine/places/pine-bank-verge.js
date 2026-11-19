import * as THREE from 'three';

// x, z, scale and a broad search midpoint in metres. The heights here only
// identify the correct ground band. Actual roots use the resident terrain mesh.
const bankSites = [
  [-2.95, 31.15, .61, 1.58], [-3.14, 29.8, .83, 1.74], [-4.15, 30.75, .72, 1.92],
  [-2.77, 28.35, .75, 1.79], [-3.9, 28.15, .88, 2.10], [-2.86, 26.7, .59, 1.97],
  [-4.15, 25.95, .90, 2.40], [-2.70, 24.96, .55, 2.09], [-3.48, 24.64, .84, 2.35],
  [-2.43, 23.2, .53, 2.24], [-3.68, 22.6, .93, 2.70], [-3.08, 20.7, .66, 2.80],
  [-3.74, 18.85, .61, 3.68],
  [2.63, 31.7, .59, 1.46], [3.49, 30.12, .72, 1.81], [2.73, 27.95, .66, 1.86],
  [3.4, 26.8, .83, 2.16], [2.63, 25.19, .73, 2.12], [3.04, 23.78, .67, 2.42],
  [2.56, 22.56, .66, 2.39], [3.39, 21.93, .83, 2.81], [2.94, 20.35, .62, 2.84],
  [2.85, 18.65, .55, 2.87], [3.48, 18.45, .71, 3.31],
];

const around = 2 * Math.PI;
const frondSeeds = [809, 1537];
const down = new THREE.Vector3(0, -1, 0);

function randomFrom(seed) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function approachTerrain(group) {
  const meshes = [];
  group.traverse(object => {
    if (!object.isMesh || object.material?.name !== 'Damp pine needle litter') return;
    for (let parent = object; parent; parent = parent.parent) {
      const region = parent.userData.lightmap_region ?? parent.userData.region;
      if (region) {
        if (region === 'approach') meshes.push(object);
        break;
      }
    }
  });
  return meshes;
}

function fernProfile(seed, frondCount) {
  const random = randomFrom(seed);
  const positions = [], colors = [], indices = [];
  const green = new THREE.Color(0x36562b), young = new THREE.Color(0x5b7433);
  const vein = new THREE.Color(0x4d562b), base = new THREE.Color(0x3b3d24);
  const color = green.clone();
  const vertex = (point, tone, brightness = 1) => {
    const i = positions.length / 3;
    positions.push(point.x, point.y, point.z);
    colors.push(tone.r * brightness, tone.g * brightness, tone.b * brightness);
    return i;
  };

  for (let frond = 0; frond < frondCount; frond++) {
    const direction = frond * 2.39996 + (random() - .5) * .47;
    const forward = new THREE.Vector3(Math.cos(direction), 0, Math.sin(direction));
    const across = new THREE.Vector3(-forward.z, 0, forward.x);
    const reach = .57 + .45 * random();
    const rise = .27 + .40 * random();
    const drift = (random() - .5) * .14;
    const frondAt = t => forward.clone().multiplyScalar(reach * t ** 1.24)
      .addScaledVector(across, drift * t * t)
      .setY(rise * Math.sin(2.45 * t) - .071 * t ** 3);

    // A living central stipe supports the individual pinnae above the bank.
    const stem = positions.length / 3;
    for (let row = 0; row <= 10; row++) {
      const t = row / 10;
      const center = frondAt(t);
      const thickness = .011 * (1 - t) + .0019;
      const normal = frondAt(Math.min(1, t + .02)).sub(frondAt(Math.max(0, t - .02))).cross(across).normalize();
      const tone = color.copy(base).lerp(vein, Math.min(1, 1.6 * t));
      for (let edge = 0; edge < 3; edge++) {
        const angle = edge * around / 3;
        vertex(center.clone().addScaledVector(across, thickness * Math.cos(angle))
          .addScaledVector(normal, thickness * Math.sin(angle)), tone);
      }
      if (!row) continue;
      for (let edge = 0; edge < 3; edge++) {
        const lower = stem + (row - 1) * 3;
        const next = (edge + 1) % 3;
        indices.push(lower + edge, lower + next, lower + edge + 3,
          lower + next, lower + next + 3, lower + edge + 3);
      }
    }

    for (let pair = 0; pair < 9; pair++) {
      const row = .22 + .70 * pair / 8;
      const profile = Math.sin(Math.PI * (.20 + .80 * row)) ** .84;
      for (const side of [-1, 1]) {
        const t = row + side * .019 + (random() - .5) * .020;
        const anchor = frondAt(t);
        const length = (.17 + .10 * random()) * reach * profile;
        const tip = anchor.clone().addScaledVector(across, length * side)
          .addScaledVector(forward, length * (.28 + .30 * row));
        tip.y += length * (.10 + (random() - .61) * .31);
        const axis = tip.clone().sub(anchor).normalize();
        const margin = new THREE.Vector3(-axis.z, 0, axis.x).normalize();
        margin.y = side * (.12 + (random() - .5) * .38);
        const breadth = length * (.096 + .072 * random());
        const tone = color.copy(green).lerp(young, .08 + .62 * random() + row * .21);
        const first = vertex(anchor, tone, .68);
        for (const [part, width] of [[.31, .91], [.66, .67]]) {
          const middle = anchor.clone().lerp(tip, part);
          middle.y += length * .085 * Math.sin(Math.PI * part);
          vertex(middle.clone().addScaledVector(margin, breadth * width), tone, .85);
          vertex(middle.clone().setY(middle.y + breadth * .32), tone, 1.09);
          vertex(middle.clone().addScaledVector(margin, -breadth * width * (.8 + .22 * random())), tone, .95);
        }
        vertex(tip, tone, 1.02);
        for (const face of [[0, 1, 2], [0, 2, 3], [1, 4, 2], [4, 5, 2], [2, 5, 3], [5, 6, 3], [4, 7, 5], [5, 7, 6]]) {
          indices.push(...face.map(index => first + index));
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildPineBankVerge(bakedGroup) {
  const terrain = approachTerrain(bakedGroup);
  if (!terrain.length) return null;
  bakedGroup.updateWorldMatrix(true, true);
  const origin = new THREE.Vector3(), normal = origin.clone(), tint = new THREE.Color();
  const normalMatrix = new THREE.Matrix3(), ray = new THREE.Raycaster(origin, down, 0, .68);
  const accepted = frondSeeds.map(() => []);
  for (const [i, [x, z, size, searchY]] of bankSites.entries()) {
    origin.set(x, searchY + .34, z);
    ray.set(origin, down);
    const hit = ray.intersectObjects(terrain, false).find(candidate => {
      normalMatrix.getNormalMatrix(candidate.object.matrixWorld);
      return normal.copy(candidate.face.normal).applyNormalMatrix(normalMatrix).y > .46;
    });
    if (hit) accepted[i % frondSeeds.length].push({ i, root: hit.point, size });
  }
  if (accepted.every(profile => !profile.length)) return null;

  const group = new THREE.Group();
  group.name = 'Rooted bank wood ferns';
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: .80, metalness: 0, side: THREE.DoubleSide, envMapIntensity: .24,
  });
  const placement = new THREE.Object3D();
  for (const [profile, sites] of accepted.entries()) {
    if (!sites.length) continue;
    const sprouts = new THREE.InstancedMesh(fernProfile(frondSeeds[profile], 6 + profile), material, sites.length);
    for (const [instance, { i, root, size }] of sites.entries()) {
      const random = randomFrom(Math.imul(i + 97, 9419));
      placement.position.copy(root);
      placement.position.y -= .021;
      placement.rotation.y = random() * around;
      placement.scale.set(size * (1 + .13 * random()), size * (.65 + .33 * random()), size);
      placement.updateMatrix();
      sprouts.setMatrixAt(instance, placement.matrix);
      const brightness = .58 + .26 * random();
      sprouts.setColorAt(instance, tint.setRGB(brightness * .97, brightness, brightness * (.87 + .11 * random())));
    }
    sprouts.computeBoundingSphere();
    group.add(sprouts);
  }
  return {
    group,
    dispose() {
      group.removeFromParent();
      for (const sprouts of group.children) { sprouts.dispose(); sprouts.geometry.dispose(); }
      material.dispose();
      group.clear();
    },
  };
}
