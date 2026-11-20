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
  band: { from: .004, to: .012, clearance: .0012, width: .008 },
});

// The strip exists from the moment the place loads, but is tied on only when the lamp is lit,
// and it is never taken away afterwards: both endings leave it in place.
export function wishClothVisible(lit) {
  return lit === true;
}

export function createWishCloth({ THREE, anchor }) {
  const group = new THREE.Group();
  // The anchor is the stone surface; the tray sits on it and the cloth ties to the tray.
  group.position.set(anchor.x, anchor.y, anchor.z);
  // Hidden until the lamp is lit; see wishClothVisible and the ignite path in scene.js.
  group.visible = false;

  const { band } = CLOTH_SPEC;
  // Light the cloth exactly as the spent wax stubs beside it are lit: same material family,
  // the same environment intensity, no separate tinting. It must never read brighter than the
  // stone at night, so nothing here pushes light into it.
  const material = new THREE.MeshPhysicalMaterial({
    color: CLOTH_COLOR, roughness: .92, metalness: 0,
    clearcoat: .04, clearcoatRoughness: .6,
    specularIntensity: .32, envMapIntensity: .42,
    side: THREE.DoubleSide,
  });

  // The tray wall is convex over this band, so a straight span between two rings would cut
  // inside it. The band is therefore a stack of rings that each take the wall radius at their
  // own height, and the strip between adjacent rings still stays outside the stone.
  const RINGS = 12;
  const steps = 96;
  const positions = [], indices = [];
  for (let r = 0; r < RINGS; r++) {
    const y = band.from + (band.to - band.from) * (r / (RINGS - 1));
    const radius = wallRadius(y) + band.clearance;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      positions.push(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
    }
  }
  for (let r = 1; r < RINGS; r++) {
    for (let i = 0; i < steps; i++) {
      const next = (i + 1) % steps;
      const lower = (r - 1) * steps, upper = r * steps;
      indices.push(lower + i, lower + next, upper + i, lower + next, upper + next, upper + i);
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
  // The visible strip is S1's modelled glb. Parameterised geometry cannot read as cloth here, and
  // the band that was tried spilled past the tray's silhouette from the burning camera, so the
  // mesh is authored and measured but not drawn. The group, the show() flow and the no-burial
  // bounds stay live so the modelled strip can be dropped into the same slot.
  group.add(mesh);
  mesh.visible = false;

  const local = new V3();
  return {
    group,
    anchor: anchor.clone(),
    update() { /* A taut band on a ledge does not move. */ },
    show(lit) { group.visible = wishClothVisible(lit); },
    worldPosition() { return group.getWorldPosition(local.clone()); },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
