import * as THREE from 'three';
import { writePineDaughter } from './pine-needle-shoot.js';

const ridgeMaterial = 'Ridge pine needle fascicles';
const maxMounts = 134;
const up = new THREE.Vector3(0, 1, 0);
const alternate = new THREE.Vector3(1, 0, 0);

function randomFrom(seed) {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}

export function ridgeFascicleMounts(geometry, start, count) {
  const positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv'), index = geometry.index;
  if (!positions || !uv || !index || count % 3) return [];
  const parent = new Int32Array(positions.count).fill(-1);
  const capFaces = new Uint8Array(positions.count);
  const find = id => {
    while (parent[id] !== id) {
      parent[id] = parent[parent[id]];
      id = parent[id];
    }
    return id;
  };

  for (let i = start; i < start + count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    for (const id of [a, b, c]) if (parent[id] < 0) parent[id] = id;
    const stem = find(a);
    parent[find(b)] = stem;
    parent[find(c)] = stem;
    if (uv.getY(a) === 1 && uv.getY(b) === 1 && uv.getY(c) === 1) {
      capFaces[a]++; capFaces[b]++; capFaces[c]++;
    }
  }
  const islands = new Map();
  for (const [id, host] of parent.entries()) {
    if (host < 0) continue;
    const island = find(id);
    if (!islands.has(island)) islands.set(island, []);
    islands.get(island).push(id);
  }

  const mounts = [], offset = new THREE.Vector3();
  for (const ids of islands.values()) {
    const pins = ids.filter(id => uv.getY(id) === 1);
    const tips = ids.filter(id => uv.getY(id) === 0);
    const centers = pins.filter(id => capFaces[id] === 6);
    // The central mount touches all six cap faces. The other pinned
    // vertices outline the sheath and touch two cap faces each.
    if (ids.length !== 25 || pins.length !== 7 || tips.length !== 6 || centers.length !== 1
      || pins.some(id => id !== centers[0] && capFaces[id] !== 2)) return [];
    const root = new THREE.Vector3().fromBufferAttribute(positions, centers[0]);
    const axis = tips.reduce((axis, tip) => axis.add(offset.fromBufferAttribute(positions, tip).sub(root)),
      new THREE.Vector3()).normalize();
    let length = 0, radius = 0;
    for (const id of ids) {
      offset.fromBufferAttribute(positions, id).sub(root);
      const axial = offset.dot(axis);
      length = Math.max(length, axial);
      radius = Math.max(radius, offset.addScaledVector(axis, -axial).length());
    }
    if (!(length > .01 && radius > .005)) return [];
    mounts.push({ root, axis, length, radius });
  }
  return mounts;
}

function makeRidgeProfile() {
  const random = randomFrom(19733);
  const locations = [], colors = [], indices = [];
  const tip = new THREE.Vector3(), root = tip.clone(), shoulder = tip.clone(), end = tip.clone(), tangent = tip.clone();
  const verdant = new THREE.Color(0x526b3e), spring = new THREE.Color(0x617943), bark = new THREE.Color(0x51462e);
  const tint = verdant.clone();
  const shoots = [[.27, -.26, .21, .55], [.48, .35, -.20, .69]].map(([at, x, y, z]) => ({
    at, end: new THREE.Vector3(x, y, z),
  }));
  function add(point, factor) {
    locations.push(point.x, point.y, point.z);
    colors.push(tint.r * factor, tint.g * factor, tint.b * factor);
  }
  // The terminal twig and the needle roots use the same two segments.
  const elbow = new THREE.Vector3(.027, -.044, .35), bud = new THREE.Vector3(.095, .026, .77);
  function twigAt(target, z) {
    if (z <= elbow.z) return target.copy(elbow).multiplyScalar(z / elbow.z);
    return target.copy(elbow).lerp(bud, (z - elbow.z) / (bud.z - elbow.z));
  }
  tint.copy(bark);
  for (const [section, width] of [[0, .020], [elbow.z, .015]]) {
    twigAt(root, section);
    for (let edge = 0; edge < 3; edge++) {
      const turn = edge * 2 * Math.PI / 3;
      add(shoulder.copy(root).add(new THREE.Vector3(Math.cos(turn) * width, Math.sin(turn) * width, 0)), .80);
    }
  }
  add(bud, 1.0);
  for (let edge = 0; edge < 3; edge++) {
    const next = (edge + 1) % 3;
    indices.push(edge, next, next + 3, edge, next + 3, edge + 3, edge + 3, next + 3, 6);
  }
  const daughters = shoots.map(({ at, end }) => writePineDaughter(
    twigAt(new THREE.Vector3(), at), end, .012, 0, add, indices, locations.length / 3,
  ));

  for (let pair = 0; pair < 24; pair++) {
    const t = .052 + .68 * ((pair + random() * .65) / 24) ** .91;
    const daughter = pair % 4 < 2 ? daughters[pair % 2] : null;
    if (daughter) {
      const local = (Math.floor(pair / 4) + .35) / 6;
      root.copy(daughter.root).lerp(daughter.tip, .32 + .65 * local);
    } else twigAt(root, t);
    const whorl = pair * 2.39996 + (random() - .5) * .63;
    for (const sign of [-1, 1]) {
      const angle = whorl + sign * (.08 + random() * .22);
      const radius = (.44 + random() * .52) * Math.sin(Math.PI * (.22 + .77 * t));
      const rise = .235 + random() * .31;
      tip.set(Math.cos(angle) * radius, Math.sin(angle) * radius, Math.min(.992, t + rise));
      if (daughter) {
        tip.x = root.x * .38 + tip.x * .91;
        tip.y = root.y * .57 + tip.y * .91;
        tip.z = Math.min(.992, root.z + rise * .85);
      }
      tangent.set(-Math.sin(angle), Math.cos(angle), 0);
      const width = (.022 + random() * .016) * (daughter ? 1.48 : 1);
      tint.copy(verdant).lerp(spring, random() * .69);
      const i = locations.length / 3;
      add(root, .75);
      add(shoulder.copy(root).lerp(tip, .38).addScaledVector(tangent, width), .92);
      add(shoulder.copy(root).lerp(tip, .55).addScaledVector(tangent, -width), .94);
      end.copy(tip);
      end.addScaledVector(tangent, .08 * width * sign);
      add(shoulder.copy(root).lerp(end, .72).addScaledVector(tangent, width * .61), 1.03);
      add(end, 1.11);
      indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2, i + 3, i + 4, i + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(locations, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildPineRidgeFascicles(group) {
  const sources = [];
  group.traverse(object => {
    if (!object.isMesh || !object.geometry) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const target = materials.findIndex(material => material?.name === ridgeMaterial);
    if (target < 0) return;
    const parts = object.geometry.groups.length
      ? object.geometry.groups.filter(group => group.materialIndex === target)
      : [{ start: 0, count: object.geometry.index?.count ?? 0 }];
    if (parts.length === 1) sources.push({ object, ...parts[0] });
  });
  if (sources.length !== 1) return null;
  const { object, start, count } = sources[0];
  const mounts = ridgeFascicleMounts(object.geometry, start, count);
  if (!mounts.length || mounts.length > maxMounts) return null;

  const profile = makeRidgeProfile();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: .88, metalness: 0, side: THREE.DoubleSide,
  });
  const instances = new THREE.InstancedMesh(profile, material, mounts.length);
  instances.name = 'Living needles at authored ridge fascicles';
  const across = new THREE.Vector3(), above = across.clone(), forward = across.clone();
  const world = new THREE.Matrix4();
  const color = new THREE.Color();
  for (const [index, { root, axis, length, radius }] of mounts.entries()) {
    const seed = Math.imul(Math.round(root.x * 8192), 73856093)
      ^ Math.imul(Math.round(root.y * 8192), 19349663) ^ Math.imul(Math.round(root.z * 8192), 83492791);
    const random = randomFrom(seed);
    across.crossVectors(Math.abs(axis.y) > .95 ? alternate : up, axis).normalize();
    above.crossVectors(axis, across);
    const roll = random() * 2 * Math.PI;
    across.applyAxisAngle(axis, roll).multiplyScalar(radius);
    above.applyAxisAngle(axis, roll).multiplyScalar(radius);
    forward.copy(axis).multiplyScalar(length);
    instances.setMatrixAt(index, world.makeBasis(across, above, forward).setPosition(root));
    const tone = .74 + .26 * random();
    instances.setColorAt(index, color.setRGB(tone * (.91 + .12 * random()), tone, tone * (.86 + .14 * random())));
  }
  instances.computeBoundingSphere();
  object.add(instances);
  return {
    instances,
    dispose() {
      instances.removeFromParent();
      instances.dispose();
      profile.dispose();
      material.dispose();
    },
  };
}
