// The visitor's red cloth strip, tied round the candle tray when the lamp is lit.
// It carries no text: the wish stays with the visitor. It stays through the burn, the
// burnt-down ending and the put-out ending, becoming part of the shrine like the older wax.
//
// Shape, as the world bible describes it: a coarse strip about 30 mm wide and about 250 mm
// long, wrapped round the tray's outer rim, knotted on the side facing the burn camera, with
// two tails falling about 60-80 mm and resting on the stone. Matte woven cloth, fresh red,
// soft folds and a frayed end, never a solid block.
import { Vector3 as V3 } from 'three';

const CLOTH_COLOR = 0xb8231d;
const KNOT_COLOR = 0x8f1a15;

export const CLOTH_SPEC = Object.freeze({
  width: .030,      // m across the strip
  length: .250,     // m along the strip
  tail: .070,       // m, each hanging tail
  // The refined tray lathe's outer radius (createPineTray) is 58 mm; the wall stands a few
  // millimetres inside that, so the cloth wraps at 60 mm to sit on the outside of the wall.
  knotRadius: .060,
});

// A ribbon strip following a path of [x,y,z] points, `half` wide either side across the
// horizontal normal, with a slight fold so it is never a flat card.
function ribbonAlong(points, half, fold = .0006) {
  const positions = [];
  const indices = [];
  let previous = null;
  points.forEach((point, i) => {
    const [x, y, z] = point;
    // The strip's face turns as it wraps; the fold alternates so the fabric buckles.
    const buckle = (i % 2 ? 1 : -1) * fold * (i > 0 ? 1 : 0);
    const left = positions.length / 3;
    positions.push(x - half, y, z + buckle);
    const right = positions.length / 3;
    positions.push(x + half, y, z - buckle);
    if (previous) indices.push(previous[0], previous[1], left, previous[1], right, left);
    previous = [left, right];
  });
  return { positions, indices };
}

export function createWishCloth({ THREE, anchor, seed = 1 }) {
  const group = new THREE.Group();
  // The anchor is the candle seat; the knot is on the tray's outer wall below it.
  // Authored below the seat, then lifted so the band sits at the tray's outer lip: the seat
  // top is 8 mm above the anchor and the tray wall is about 12 mm tall below that.
  group.position.set(anchor.x, anchor.y + .014, anchor.z);

  // Matte woven cloth: high roughness, no metalness, tiny sheen so it is visibly fabric.
  const material = new THREE.MeshStandardMaterial({
    color: CLOTH_COLOR, roughness: .96, metalness: 0, side: THREE.DoubleSide,
  });
  const knotMaterial = new THREE.MeshStandardMaterial({ color: KNOT_COLOR, roughness: .94, metalness: 0 });

  const R = CLOTH_SPEC.knotRadius;
  const width = CLOTH_SPEC.width;
  const half = width / 2;
  const tail = CLOTH_SPEC.tail;

  // 1. The band round the tray wall. It starts behind the left side, comes round the front
  // and ends behind the right, so the wrap reads as going round the tray rather than floating.
  const wrap = [];
  const wrapSteps = 22;
  for (let i = 0; i <= wrapSteps; i++) {
    // Nearly a full turn: the strip visibly goes round the tray and its ends tuck behind.
    const angle = Math.PI * (-0.02 + 1.04 * (i / wrapSteps));
    const wobble = .0012 * Math.sin(i * 1.9 + seed);
    wrap.push([Math.sin(angle) * (R + wobble), -.020 - .0016 * Math.sin(i * 2.7), Math.cos(angle) * (R + wobble)]);
  }
  const band = ribbonAlong(wrap, half, .0005);
  const bandGeometry = new THREE.BufferGeometry();
  bandGeometry.setAttribute('position', new THREE.Float32BufferAttribute(band.positions, 3));
  bandGeometry.setIndex(band.indices);
  bandGeometry.computeVertexNormals();
  const bandMesh = new THREE.Mesh(bandGeometry, material);
  bandMesh.castShadow = true;
  bandMesh.receiveShadow = true;
  bandMesh.name = 'Wish cloth wrapped round the candle tray';
  group.add(bandMesh);

  // 2. The knot on the camera-facing side of the tray wall.
  const knot = new THREE.Mesh(new THREE.SphereGeometry(.0072, 14, 11), knotMaterial);
  knot.scale.set(1.25, .92, .78);
  knot.position.set(0, -.0215, R + .0035);
  knot.castShadow = true;
  knot.name = 'Knot of the visitor wish cloth';
  group.add(knot);

  // 3. Two tails from the knot, resting on the stone. Each bends its own way and frays at
  // the end, so they never read as a single block or as parallel strips.
  const bend = (t, phase) => .0026 * Math.sin(t * 4.1 + phase) + .0014 * Math.sin(t * 9.7 + phase * .8);
  const tailProfile = (side, phase) => {
    const out = [];
    const steps = 7;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Falls, then the last third lies back onto the stone and drifts outwards.
      const y = -.024 - tail * t * (1 - .28 * t * t);
      const x = side * (.006 + .020 * t * t) + bend(t, phase);
      const z = R + .002 + .006 * Math.sin(t * 2.2) - .010 * t * t;
      out.push([x, y, z]);
    }
    return out;
  };
  for (const [index, side] of [-1, 1].entries()) {
    const points = tailProfile(side, seed * (1.3 + index));
    const t = ribbonAlong(points, half * .92, .0009);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(t.positions, 3));
    geometry.setIndex(t.indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `Wish cloth tail ${index + 1} resting on the stone`;
    group.add(mesh);

    // A frayed end: three short threads of differing length, so the edge is not a straight cut.
    for (let k = 0; k < 3; k++) {
      const end = points.at(-1);
      const thread = new THREE.Mesh(new THREE.BoxGeometry(.0022, .0008, .0045 + .002 * k), material);
      thread.position.set(end[0] + (k - 1) * .005, end[1] + .0002, end[2] - .003 - .0015 * k);
      thread.rotation.y = (k - 1) * .28 + side * .12;
      thread.name = 'Frayed end of a wish cloth tail';
      group.add(thread);
    }
  }

  // The loose hanging parts flex with the same eased gust the pine sprays feel.
  const tails = group.children.filter(object => /tail|Frayed/.test(object.name));
  const rest = tails.map(object => object.position.clone());
  const local = new V3();
  return {
    group,
    // The seat the strip hangs from, so a probe can compare the strip with the stand.
    anchor: anchor.clone(),
    update(wind = 0) {
      const angle = Math.max(-.5, Math.min(.5, wind)) * .30;
      tails.forEach((object, i) => {
        object.rotation.z = angle * (i % 2 ? -1 : 1) * .6;
      });
    },
    worldPosition() { return group.getWorldPosition(local.clone()); },
    dispose() {
      for (const object of group.children) {
        object.geometry?.dispose();
      }
      material.dispose(); knotMaterial.dispose();
      void rest;
    },
  };
}
