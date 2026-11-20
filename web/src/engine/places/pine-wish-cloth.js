// The visitor's red cloth strip, tied round the candle tray when the lamp is lit.
// It carries no text: the wish stays with the visitor. It stays through the burn, the
// burnt-down ending and the put-out ending, becoming part of the shrine like the older wax.
//
// This is deliberately the plainest version: one narrow band hugging the tray's outer wall, no
// knot and no tails. A modelled cloth strip with a real knot and tails is coming from S1 as a
// baked glb; this stays as the functional placeholder until that model is wired in, so the
// behaviour (appears on lighting, survives both endings) and the no-burial guarantee are live.
//
// All coordinates are metres relative to the lamp anchor, which is the stone surface.
import { Vector3 as V3 } from 'three';

const CLOTH_COLOR = 0xa5161b;

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
  // A narrow band: 8 mm tall, from y .004 to .012, a couple of millimetres off the wall, and
  // never wider than the tray's own rim.
  band: { from: .004, to: .012, clearance: .0018, width: .008 },
});

export function createWishCloth({ THREE, anchor }) {
  const group = new THREE.Group();
  // The anchor is the stone surface; the tray sits on it and the cloth ties to the tray.
  group.position.set(anchor.x, anchor.y, anchor.z);

  const { band } = CLOTH_SPEC;
  const material = new THREE.MeshStandardMaterial({
    color: CLOTH_COLOR, roughness: .97, metalness: 0, side: THREE.DoubleSide,
  });

  // One upright ring round the wall: two rings joined into a quad strip. It follows the wall's
  // flare so it stays in contact, which is why it is a shell rather than a flat ribbon.
  const steps = 96;
  const positions = [], indices = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const rTop = wallRadius(band.to) + band.clearance;
    const rBottom = wallRadius(band.from) + band.clearance;
    positions.push(Math.sin(angle) * rTop, band.to, Math.cos(angle) * rTop);
    positions.push(Math.sin(angle) * rBottom, band.from, Math.cos(angle) * rBottom);
    if (i > 0) {
      const a = (i - 1) * 2, b = i * 2;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'Wish cloth band tied round the candle tray';
  group.add(mesh);

  const local = new V3();
  return {
    group,
    anchor: anchor.clone(),
    update() { /* A taut band on a ledge does not move. */ },
    worldPosition() { return group.getWorldPosition(local.clone()); },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
