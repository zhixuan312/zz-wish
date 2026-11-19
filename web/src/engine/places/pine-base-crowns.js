import * as THREE from 'three';
import data from './pine-base-crown-data.json' with { type: 'json' };

const up = new THREE.Vector3(0, 1, 0);
const binary = encoded => new DataView(Uint8Array.from(atob(encoded), char => char.charCodeAt(0)).buffer);
const fraction = value => value - Math.floor(value);

function barkGeometry(data) {
  const vertices = binary(data.positions), uv = binary(data.uv), indices = binary(data.indices);
  const geometry = new THREE.BufferGeometry();
  const attribute = (view, count, scale) => new THREE.BufferAttribute(
    Float32Array.from({ length: view.byteLength / 2 }, (_, i) => view.getInt16(i * 2, true) / scale), count);
  geometry.setAttribute('position', attribute(vertices, 3, 8192));
  geometry.setAttribute('uv', attribute(uv, 2, 2048));
  geometry.setAttribute('normal', attribute(binary(data.normals), 3, 32767));
  geometry.setIndex(new THREE.BufferAttribute(
    Uint16Array.from({ length: indices.byteLength / 2 }, (_, i) => indices.getUint16(i * 2, true)), 1));
  return geometry;
}

function needleGeometry(encoded) {
  const data = binary(encoded);
  const shoots = [-1.55, -.48, .47, 1.73];
  const bladeCount = data.byteLength / 7 * shoots.length * 2;
  const positions = new Float32Array(bladeCount * 5 * 3);
  const colors = new Float32Array(positions.length);
  const indices = positions.length / 3 <= 65536
    ? new Uint16Array(bladeCount * 9)
    : new Uint32Array(bladeCount * 9);
  const center = new THREE.Vector3(), radial = center.clone(), tangent = center.clone();
  const anchor = center.clone(), bend = center.clone(), tip = center.clone();
  const point = center.clone(), bladeSide = center.clone();
  let vertex = 0, index = 0;
  const write = (position, stain) => {
    position.toArray(positions, vertex * 3);
    colors.fill(stain, vertex * 3, vertex * 3 + 3);
    vertex++;
  };
  for (let row = 0; row < data.byteLength / 7; row++) {
    const i = row * 7;
    center.set(data.getInt16(i, true), data.getInt16(i + 2, true), data.getInt16(i + 4, true)).divideScalar(8192);
    const spread = Math.min(.027, data.getUint8(i + 6) / 4096);
    const aspect = fraction((row + 1) * .618033989);
    const heading = Math.atan2(center.z, center.x) + (aspect - .5) * 2.15;
    for (const shoot of shoots) {
      const growth = fraction((row + shoot + 2) * .754877666);
      const azimuth = heading + shoot * (.31 + .75 * aspect);
      radial.set(Math.cos(azimuth), 0, Math.sin(azimuth));
      tangent.crossVectors(up, radial);
      anchor.copy(center).addScaledVector(radial, spread * (.04 + .38 * growth))
        .addScaledVector(tangent, spread * .21 * shoot).addScaledVector(up, spread * .38 * (growth - .5));
      for (const blade of [-1, 1]) {
        const length = .017 + .014 * fraction((row + blade * shoot + 3) * .381966011);
        const uplift = (.18 + .71 * growth) * length;
        const width = .00055 + .00032 * aspect;
        bladeSide.copy(tangent).multiplyScalar(.78).addScaledVector(up, .62 * blade);
        bend.copy(anchor).addScaledVector(radial, length * .53).addScaledVector(up, uplift * .71)
          .addScaledVector(tangent, length * .21 * blade);
        tip.copy(anchor).addScaledVector(radial, length).addScaledVector(up, uplift * .55)
          .addScaledVector(tangent, length * .41 * blade);
        const base = vertex, color = .62 + .29 * aspect;
        write(point.copy(anchor).addScaledVector(bladeSide, -width * .7), color * .88);
        write(point.copy(anchor).addScaledVector(bladeSide, width * .7), color * .88);
        write(point.copy(bend).addScaledVector(bladeSide, -width), color);
        write(point.copy(bend).addScaledVector(bladeSide, width), color);
        write(tip, color);
        indices.set([base, base + 2, base + 1, base + 1, base + 2, base + 3, base + 2, base + 4, base + 3], index);
        index += 9;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

export function preparePineBaseCrowns(mounts, source) {
  if (source.sha256 !== data.sourceSha256) return null;
  const group = new THREE.Group();
  group.name = 'Pine Gate base needle crowns';
  const foliage = new THREE.MeshStandardMaterial({
    color: 0x5b7043, vertexColors: true, side: THREE.DoubleSide, roughness: .92, envMapIntensity: .36,
  });
  const models = new Map();
  const needles = new Map();
  const previous = mounts.flatMap(mount => mount.proxies.map(proxy => [proxy, proxy.visible]));
  for (const mount of mounts) {
    let model = models.get(mount.prototype);
    if (!model) {
      const spec = data.crowns[mount.prototype];
      model = { needles: needleGeometry(spec.anchors), bark: barkGeometry(spec.bark) };
      models.set(mount.prototype, model);
    }
    const original = mount.proxies.flatMap(proxy => [proxy.material].flat())
      .find(material => material.name === mount.stemMaterial);
    const bark = new THREE.MeshStandardMaterial({
      color: 0x938371, roughness: .91, map: original?.map ?? null,
      normalMap: original?.normalMap ?? null, envMapIntensity: .30,
    });
    const tree = new THREE.Group();
    tree.name = mount.node;
    tree.position.fromArray(mount.position);
    tree.rotation.y = mount.yawRadians;
    tree.scale.setScalar(mount.height);
    const crown = new THREE.Mesh(model.needles, foliage);
    tree.add(new THREE.Mesh(model.bark, bark), crown);
    needles.set(mount.node, crown);
    group.add(tree);
  }
  for (const [proxy] of previous) proxy.visible = false;
  return { group, needles, restore() {
    for (const [proxy, visible] of previous) proxy.visible = visible;
  } };
}
