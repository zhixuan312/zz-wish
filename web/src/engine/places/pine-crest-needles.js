import * as THREE from 'three';

const maxPads = 130;
const profileSeeds = [73, 131, 243];
const shoots = [
  [-.65, -.10, .40], [-.46, .08, .82], [-.18, .04, 1.05],
  [.21, .12, 1.11], [.51, -.01, .80], [.63, -.13, .48], [.04, -.19, .60],
];
const up = new THREE.Vector3(0, 1, 0);

function randomFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeProfile(seed) {
  const random = randomFrom(seed);
  const positions = [], colors = [];
  const deepGreen = new THREE.Color(0x304522);
  const youngGreen = new THREE.Color(0x647b3e);
  const shoot = new THREE.Vector3(), across = shoot.clone(), above = shoot.clone();
  const root = shoot.clone(), needle = shoot.clone(), tip = shoot.clone();
  const shoulder = shoot.clone(), side = shoot.clone(), rib = shoot.clone();
  const ring = [shoot.clone(), shoot.clone(), shoot.clone()];
  const color = deepGreen.clone();
  const add = (point, light) => {
    positions.push(point.x, point.y, point.z);
    colors.push(color.r * light, color.g * light, color.b * light);
  };

  for (const [x, y, z] of shoots) {
    shoot.set(x + (random() - .5) * .11, y + (random() - .5) * .16, z * (.86 + random() * .25));
    const length = shoot.length();
    shoot.divideScalar(length);
    across.crossVectors(up, shoot).normalize();
    above.crossVectors(shoot, across);
    const phase = random() * Math.PI * 2;

    for (let pair = 0; pair < 9; pair++) {
      const at = .34 + .62 * (pair + random() * .64) / 9;
      root.copy(shoot).multiplyScalar(length * at);
      root.addScaledVector(above, .13 * at * at + (random() - .5) * .15);
      root.addScaledVector(across, (random() - .5) * .18);
      for (const sign of [-1, 1]) {
        const angle = phase + pair * 2.39996 + sign * (.14 + random() * .31);
        needle.copy(shoot).multiplyScalar(.52 + random() * .31);
        needle.addScaledVector(across, Math.cos(angle) * .86).addScaledVector(above, Math.sin(angle) * .67);
        needle.normalize();
        const reach = (.29 + random() * .24) * (1 - .2 * at);
        tip.copy(root).addScaledVector(needle, reach).addScaledVector(up, reach * (.01 + random() * .24));
        shoulder.copy(root).addScaledVector(needle, reach * .45);
        side.crossVectors(needle, up).normalize();
        rib.crossVectors(needle, side);
        const width = (.036 + random() * .020) * (1 - .24 * at);
        ring[0].copy(shoulder).addScaledVector(side, width);
        ring[1].copy(shoulder).addScaledVector(rib, width * .34);
        ring[2].copy(shoulder).addScaledVector(side, -width).addScaledVector(rib, -width * .12);
        color.copy(deepGreen).lerp(youngGreen, .12 + .74 * random());
        // Each slender, bent needle has three tapered faces on both sides of
        // its shoulder. Flat normals keep the tiny cross sections well defined.
        for (let face = 0; face < ring.length; face++) {
          const a = ring[face], b = ring[(face + 1) % ring.length];
          add(root, .77); add(b, .92); add(a, .94);
          add(tip, 1.09); add(a, .94); add(b, .92);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function buildPineCrestNeedles(geometryFingerprint, authoring) {
  if (!geometryFingerprint || geometryFingerprint !== authoring?.geometryFingerprint) return null;
  const { pads } = authoring;
  if (!Array.isArray(pads) || !pads.length || pads.length > maxPads) throw new Error('Invalid Pine crest needle pad count.');

  const point = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  const placements = profileSeeds.map(() => []);
  for (const pad of pads) {
    if (!point(pad.root) || !point(pad.outward) || !Number.isFinite(pad.width) || pad.width <= 0 || pad.width > .8
      || !Number.isFinite(pad.seed) || Math.hypot(...pad.outward) < .01) throw new Error('Invalid authored Pine crest needle pad.');
    const random = randomFrom(Math.imul(pad.seed, 0x9e3779b1));
    const profile = Math.floor(random() * placements.length);
    placements[profile].push({ pad, random });
  }
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .89, metalness: 0 });
  const group = new THREE.Group();
  group.name = 'Authored Pine Crest terminal needle pads';
  const forward = new THREE.Vector3(), right = forward.clone(), normal = forward.clone();
  const matrix = new THREE.Matrix4(), light = new THREE.Color();

  for (const [profile, rows] of placements.entries()) {
    if (!rows.length) continue;
    const geometry = makeProfile(profileSeeds[profile]);
    const mesh = new THREE.InstancedMesh(geometry, material, rows.length);
    for (const [index, { pad, random }] of rows.entries()) {
      forward.fromArray(pad.outward);
      forward.y *= .48;
      if (Math.hypot(forward.x, forward.z) < .01) {
        const azimuth = random() * Math.PI * 2;
        forward.x = Math.cos(azimuth);
        forward.z = Math.sin(azimuth);
      }
      forward.normalize();
      right.crossVectors(up, forward).normalize();
      normal.crossVectors(forward, right);
      const bank = (random() - .5) * .46;
      right.applyAxisAngle(forward, bank).multiplyScalar(pad.width * (.85 + .24 * random()));
      normal.applyAxisAngle(forward, bank).multiplyScalar(pad.width * (.75 + .30 * random()));
      forward.multiplyScalar(pad.width * (.89 + .23 * random()));
      matrix.makeBasis(right, normal, forward).setPosition(...pad.root);
      mesh.setMatrixAt(index, matrix);
      const brightness = .72 + random() * .25;
      mesh.setColorAt(index, light.setRGB(brightness * .98, brightness, brightness * (.89 + random() * .14)));
    }
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return {
    group,
    dispose() {
      group.removeFromParent();
      for (const mesh of group.children) { mesh.dispose(); mesh.geometry.dispose(); }
      material.dispose();
      group.clear();
    },
  };
}
