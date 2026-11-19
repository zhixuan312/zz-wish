import * as THREE from 'three';

const maxPads = 130;
const profileSeeds = [73, 131, 243];
const crowns = [
  [[-.57, -.08, .48], [-.38, .12, .89], [-.12, .05, 1.08],
    [.22, .17, .94], [.50, -.04, .73], [.74, -.14, .53]],
  [[-.68, -.20, .44], [-.51, .08, .73], [-.26, -.11, .85], [.04, .12, 1.12],
    [.28, .06, 1.03], [.49, -.10, .68], [.51, -.17, .40]],
  [[-.60, .02, .49], [-.52, -.12, .78], [-.29, .09, .92], [-.08, .17, 1.01],
    [.15, .11, .91], [.37, .03, .89], [.54, -.12, .65], [.42, -.18, .42]],
];
const pairsPerCrown = 144;
const up = new THREE.Vector3(0, 1, 0);

function randomFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeProfile(seed, shoots) {
  const random = randomFrom(seed);
  const positions = [], colors = [], indices = [], bendWeights = [];
  const deepGreen = new THREE.Color(0x2c4522);
  const youngGreen = new THREE.Color(0x647944);
  const twigBrown = new THREE.Color(0x55492b);
  const shoot = new THREE.Vector3(), across = shoot.clone(), above = shoot.clone();
  const root = shoot.clone(), needle = shoot.clone(), tip = shoot.clone();
  const shoulder = shoot.clone(), side = shoot.clone(), point = shoot.clone();
  const color = deepGreen.clone();
  const add = (point, light, weight) => {
    positions.push(point.x, point.y, point.z);
    bendWeights.push(weight);
    colors.push(color.r * light, color.g * light, color.b * light);
  };

  for (const [twig, [x, y, z]] of shoots.entries()) {
    shoot.set(x + (random() - .5) * .11, y + (random() - .5) * .16, z * (.86 + random() * .25));
    const length = shoot.length();
    shoot.divideScalar(length);
    across.crossVectors(up, shoot).normalize();
    above.crossVectors(shoot, across);
    const phase = random() * Math.PI * 2;
    const bend = (random() - .5) * .27, lift = (random() - .28) * .24;
    const elbow = .58;
    const twigAt = (target, t) => {
      const arc = t < elbow ? elbow * t : elbow * elbow + (t - elbow) * (1 + elbow);
      return target.copy(shoot).multiplyScalar(length * t)
        .addScaledVector(across, bend * arc).addScaledVector(above, lift * arc);
    };
    const elbowWeight = twigAt(point, elbow).z ** 2, tipWeight = twigAt(point, 1).z ** 2;
    // Interpolate the bent twig between the same two bearings used by
    // the mesh so both needles still meet it after the instance bends.
    const bendWeightAt = t => t < elbow ? elbowWeight * t / elbow
      : elbowWeight + (tipWeight - elbowWeight) * (t - elbow) / (1 - elbow);
    const twigStart = positions.length / 3;
    color.copy(twigBrown);
    for (const [t, radius] of [[0, .009], [elbow, .006]]) {
      twigAt(root, t);
      for (let edge = 0; edge < 3; edge++) {
        const angle = phase + edge * 2 * Math.PI / 3;
        point.copy(root).addScaledVector(across, radius * Math.cos(angle))
          .addScaledVector(above, radius * Math.sin(angle));
        add(point, .84 + t * .16, bendWeightAt(t));
      }
    }
    add(twigAt(root, 1), 1, tipWeight);
    for (let edge = 0; edge < 3; edge++) {
      const a = twigStart + edge, b = twigStart + (edge + 1) % 3;
      indices.push(a, b, b + 3, a, b + 3, a + 3, a + 3, b + 3, twigStart + 6);
    }

    const pairCount = Math.floor(pairsPerCrown / shoots.length) + Number(twig < pairsPerCrown % shoots.length);
    for (let pair = 0; pair < pairCount; pair++) {
      const age = (pair + random() * .72) / pairCount;
      const at = .28 + .71 * (.52 * age + .48 * Math.sqrt(age));
      twigAt(root, at);
      const bias = bendWeightAt(at) - root.z ** 2;
      const addNeedle = (point, light) => add(point, light, point.z ** 2 + bias);
      const sheath = phase + pair * 2.39996 + (random() - .5) * .33;
      const bent = (twig + pair) % 3 === 0;
      for (const sign of [-1, 1]) {
        const angle = sheath + sign * (.11 + random() * .24);
        const spread = .52 + random() * .30;
        needle.copy(shoot).multiplyScalar(.53 + random() * .33);
        needle.addScaledVector(across, Math.cos(angle) * spread).addScaledVector(above, Math.sin(angle) * spread);
        needle.normalize();
        const reach = (.26 + random() * .20) * (1 - .18 * at);
        const curl = reach * (-.12 + random() * .29);
        const width = (.0073 + random() * .0054) * (1 - .16 * at);
        side.crossVectors(needle, up).normalize().applyAxisAngle(needle, angle * .62);
        tip.copy(root).addScaledVector(needle, reach).addScaledVector(above, curl);
        color.copy(deepGreen).lerp(youngGreen, .15 + .66 * random());
        const start = positions.length / 3;
        // Tapered strips add overlap between the bent needles.
        // Both forms share a sheath on the twig.
        addNeedle(root, .72);
        shoulder.copy(root).addScaledVector(needle, reach * .32).addScaledVector(above, curl * .10);
        addNeedle(shoulder.addScaledVector(side, width), .92);
        shoulder.copy(root).addScaledVector(needle, reach * .47).addScaledVector(above, curl * .22);
        addNeedle(shoulder.addScaledVector(side, -width * .97), .94);
        indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
        if (bent) {
          shoulder.copy(root).addScaledVector(needle, reach * .70).addScaledVector(above, curl * .49);
          addNeedle(shoulder.addScaledVector(side, width * .54), 1.02);
          indices.push(start + 3, start + 4, start + 2);
        }
        addNeedle(tip, 1.13);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('pineCrestWeight', new THREE.Float32BufferAttribute(bendWeights, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += .40;
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
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: .89, metalness: 0, side: THREE.DoubleSide,
  });
  material.onBeforeCompile = shader => {
    // Small seeded bends distinguish the pads without moving their mounts.
    shader.vertexShader = 'attribute vec2 pineCrestBend;\nattribute float pineCrestWeight;\n' + shader.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        objectNormal.z -= 2. * position.z * dot(pineCrestBend, objectNormal.xy);
      `)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.xy += pineCrestBend * pineCrestWeight;
      `);
  };
  const group = new THREE.Group();
  group.name = 'Authored Pine Crest terminal needle pads';
  const forward = new THREE.Vector3(), right = forward.clone(), normal = forward.clone();
  const matrix = new THREE.Matrix4(), light = new THREE.Color();

  for (const [profile, rows] of placements.entries()) {
    if (!rows.length) continue;
    const geometry = makeProfile(profileSeeds[profile], crowns[profile]);
    const mesh = new THREE.InstancedMesh(geometry, material, rows.length);
    const bends = new THREE.InstancedBufferAttribute(new Float32Array(rows.length * 2), 2);
    geometry.setAttribute('pineCrestBend', bends);
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
      const bend = randomFrom(Math.imul(pad.seed, 0x3c6ef35f));
      bends.setXY(index, (bend() - .5) * .20, (bend() - .5) * .18);
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
