import * as THREE from 'three';

// Each daughter's tapered wood starts inside the parent. Its base ring
// and tip define the centerline used for the needles and the animated bend.
export function writePineDaughter(root, tip, radius, rootWeight, add, indices, start) {
  const axis = new THREE.Vector3().subVectors(tip, root).normalize();
  const across = new THREE.Vector3(-axis.z, 0, axis.x).normalize();
  const normal = new THREE.Vector3().crossVectors(axis, across);
  const tipWeight = tip.z ** 2;
  for (let edge = 0; edge < 3; edge++) {
    const turn = edge * 2 * Math.PI / 3;
    const ring = root.clone().addScaledVector(across, radius * Math.cos(turn))
      .addScaledVector(normal, radius * Math.sin(turn));
    add(ring, .83, rootWeight);
    indices.push(start + edge, start + (edge + 1) % 3, start + 3);
  }
  add(tip, .96, tipWeight);
  return {
    root, tip, axis,
    weightAt: t => THREE.MathUtils.lerp(rootWeight, tipWeight, t),
  };
}
