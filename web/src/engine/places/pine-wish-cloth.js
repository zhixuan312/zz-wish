// The visitor's red cloth strip, tied round the candle tray when the lamp is lit.
// It carries no text: the wish stays with the visitor. It stays through the burn, the
// burnt-down ending and the put-out ending, becoming part of the shrine like the older wax.
//
// All coordinates are metres relative to the lamp anchor, which is the stone surface. +z faces
// the burn camera. Nothing may sit below y = 0 (inside the stone) or inside the tray wall.
import { Vector3 as V3 } from 'three';

const CLOTH_COLOR = 0xb8231d;
const KNOT_COLOR = 0x8f1a15;

// The tray's outer wall, straight from createPineTray's lathe profile: [radius, y].
export const TRAY_PROFILE = Object.freeze([
  [.038, 0], [.042, .001], [.045, .0035], [.052, .006],
  [.057, .0105], [.058, .014], [.0565, .0165], [.054, .017],
]);

/** The tray's outer radius at height y, linearly interpolated through the lathe profile. */
export function wallRadius(y) {
  const profile = TRAY_PROFILE;
  if (y <= profile[0][1]) return profile[0][0];
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1], [r1, y1] = profile[i];
    if (y <= y1) return r0 + (r1 - r0) * ((y - y0) / (y1 - y0));
  }
  return profile.at(-1)[0];
}

export const CLOTH_SPEC = Object.freeze({
  band: { width: .010, from: .003, to: .013, clearance: .0025 },
  knot: { y: .008, outward: .006, size: [.009, .007, .006] },
  tail: {
    width: .030, flatFrom: .0006, flatTo: .002,
    endZ: [.110, .128], spread: [.020, .035], top: .008,
  },
});

export function createWishCloth({ THREE, anchor, seed = 1 }) {
  const group = new THREE.Group();
  // The anchor is the stone surface; the tray sits on it and the cloth ties to the tray.
  group.position.set(anchor.x, anchor.y, anchor.z);

  const material = new THREE.MeshStandardMaterial({
    color: CLOTH_COLOR, roughness: .96, metalness: 0, side: THREE.DoubleSide,
  });
  const knotMaterial = new THREE.MeshStandardMaterial({ color: KNOT_COLOR, roughness: .94, metalness: 0 });

  // 1. The tied band: a full turn round the tray wall, 10 mm wide, between y .003 and .013.
  // A strip pulled tight narrows, so this section is narrower than the free tails.
  const { band, knot: knotSpec, tail: tailSpec } = CLOTH_SPEC;
  // A 10 mm band is wide in y, so it is two rings joined into a quad strip rather than a flat
  // ribbon; each ring takes the wall radius at its own height.
  const bandSteps = 48;
  const bandTop = [], bandBottom = [];
  for (let i = 0; i <= bandSteps; i++) {
    const angle = (i / bandSteps) * Math.PI * 2;
    const yTop = band.to, yBottom = band.from;
    bandTop.push([Math.sin(angle) * (wallRadius(yTop) + band.clearance), yTop, Math.cos(angle) * (wallRadius(yTop) + band.clearance)]);
    bandBottom.push([Math.sin(angle) * (wallRadius(yBottom) + band.clearance), yBottom, Math.cos(angle) * (wallRadius(yBottom) + band.clearance)]);
  }
  const positions = [], indices = [];
  for (let i = 0; i <= bandSteps; i++) {
    positions.push(...bandTop[i], ...bandBottom[i]);
    if (i > 0) {
      const a = (i - 1) * 2, b = i * 2;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const bandMeshGeometry = new THREE.BufferGeometry();
  bandMeshGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  bandMeshGeometry.setIndex(indices);
  bandMeshGeometry.computeVertexNormals();
  const bandMesh = new THREE.Mesh(bandMeshGeometry, material);
  bandMesh.castShadow = true;
  bandMesh.receiveShadow = true;
  bandMesh.name = 'Wish cloth band tied round the candle tray';
  group.add(bandMesh);

  // 2. The knot at angle 0 (+z, the camera side), centred at y .008 on the wall's face.
  const knotRadius = wallRadius(knotSpec.y) + knotSpec.outward;
  const knot = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), knotMaterial);
  knot.scale.set(knotSpec.size[0] / 2, knotSpec.size[1] / 2, knotSpec.size[2] / 2);
  knot.position.set(0, knotSpec.y, knotRadius);
  knot.castShadow = true;
  knot.name = 'Knot of the visitor wish cloth';
  group.add(knot);

  // 3. Two 30 mm tails: from the knot they fall to the stone, then lie flat and reach out
  // toward the camera, each bending its own way. Nothing goes below the stone.
  const bend = (t, phase) => .0042 * Math.sin(t * 3.6 + phase) + .0022 * Math.sin(t * 8.4 + phase * .7);
  const madeTails = [];
  for (const [index, side] of [-1, 1].entries()) {
    const spread = tailSpec.spread[index];
    const endZ = tailSpec.endZ[index];
    const points = [];
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // First fall from the knot, then lie along the stone toward the camera.
      const fall = Math.min(1, t / .45);
      const lie = Math.max(0, (t - .45) / .55);
      const y = knotSpec.y * (1 - fall) + (tailSpec.flatFrom + .0011 * Math.sin(t * 5.1 + index)) * lie;
      // The outward spread must dominate the buckle, or the two tails would cross and read as
      // one strip; keep each on its own side of the knot.
      const outward = side * (spread * lie * lie + Math.abs(bend(t, seed * (1.7 + index)) * .35) * lie);
      const x = outward;
      const z = knotRadius + (endZ - knotRadius) * lie;
      points.push([x, Math.max(tailSpec.flatFrom, y), z]);
    }
    // The tail's own width runs across its length, so build the quad strip explicitly.
    const half = tailSpec.width / 2;
    const positions = [], indices = [];
    points.forEach(([x, y, z], i) => {
      const next = points[Math.min(i + 1, points.length - 1)];
      const prev = points[Math.max(i - 1, 0)];
      const dx = next[0] - prev[0], dz = next[2] - prev[2];
      const len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * half, nz = (dx / len) * half;
      const a = positions.length / 3;
      positions.push(x - nx, y, z - nz);
      const b = positions.length / 3;
      positions.push(x + nx, y, z + nz);
      if (i > 0) { const p = (i - 1) * 2; indices.push(p, p + 1, a, p + 1, b, a); }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `Wish cloth tail ${index + 1} lying on the stone`;
    group.add(mesh);
    madeTails.push(mesh);

    // Frayed end: three short threads of differing length, so the edge is not a straight cut.
    const end = points.at(-1);
    for (let k = 0; k < 3; k++) {
      const thread = new THREE.Mesh(new THREE.BoxGeometry(.0024, .0007, .005 + .0022 * k), material);
      // A 0.7 mm thread resting on the stone has its centre half a thickness up.
      thread.position.set(end[0] + (k - 1) * .0052, tailSpec.flatFrom + .0004, end[2] - .0018 - .0012 * k);
      thread.rotation.y = (k - 1) * .3 + side * .14;
      thread.name = 'Frayed end of a wish cloth tail';
      group.add(thread);
    }
  }

  const loose = group.children.filter(object => /tail|Frayed/.test(object.name));
  const local = new V3();
  return {
    group,
    anchor: anchor.clone(),
    update(wind = 0) {
      const angle = Math.max(-.5, Math.min(.5, wind)) * .16;
      loose.forEach((object, i) => { object.rotation.y += 0; object.rotation.z = angle * (i % 2 ? -1 : 1) * .5; });
    },
    worldPosition() { return group.getWorldPosition(local.clone()); },
    dispose() {
      for (const object of group.children) object.geometry?.dispose();
      material.dispose(); knotMaterial.dispose();
      void madeTails;
    },
  };
}
