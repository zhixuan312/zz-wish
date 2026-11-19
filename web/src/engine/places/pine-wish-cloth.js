// The visitor's red cloth strip, tied under the candle stand when the lamp is lit.
// It carries no text: the wish stays with the visitor. It stays through the burn, the
// burnt-down ending and the put-out ending, becoming part of the shrine like the older wax.
import { Vector3 as V3 } from 'three';

const CLOTH_COLOR = 0xb8231d;
const KNOT_COLOR = 0x8f1a15;

// A narrow coarse strip: one flat ribbon folded over the ledge, a knot at the fold and two
// tails hanging about six to eight centimetres. Geometry is authored once in metres.
function strip(tails, width = .0135) {
  const positions = [];
  const indices = [];
  const push = (x, y, z) => { positions.push(x, y, z); return positions.length / 3 - 1; };
  // Each tail is a few points from the knot down, so the ribbon can bend without a shader.
  for (const tail of tails) {
    let previous = null;
    for (let i = 0; i < tail.length; i++) {
      const [x, y, z] = tail[i];
      const half = width / 2;
      const left = push(x - half, y, z);
      const right = push(x + half, y, z);
      if (previous) {
        indices.push(previous[0], previous[1], left, previous[1], right, left);
      }
      previous = [left, right];
    }
  }
  return { positions, indices };
}

export function createWishCloth({ THREE, anchor, seed = 1 }) {
  const group = new THREE.Group();
  // The anchor is the candle's seat; the cloth hangs below its front face.
  group.position.set(anchor.x, anchor.y - .004, anchor.z);
  const material = new THREE.MeshStandardMaterial({ color: CLOTH_COLOR, roughness: .92, metalness: 0, side: THREE.DoubleSide });
  const knotMaterial = new THREE.MeshStandardMaterial({ color: KNOT_COLOR, roughness: .88, metalness: 0 });

  // Deterministic, restrained bends so the two tails differ without a randomised look.
  const bend = (t, phase) => .0018 * Math.sin(t * 5.2 + phase) + .0011 * Math.sin(t * 11.3 + phase * .7);
  // Two narrow tails, 30 mm across at the knot and tapering a little; wide enough to read as
  // cloth from the burn camera instead of a few pixels.
  // Two tails that splay apart as they fall, so they read as two separate strips of cloth
  // rather than one block, and the gap between them lets the stone show through.
  const tails = [
    [[.0036, -.001], [.0046, -.019], [.0052, -.035], [.0056, -.052]].map(([x, y], i, all) =>
      [x, y, .0028 + bend(i / (all.length - 1), seed * 1.7) + i * .0006]),
    [[-.0032, -.001], [-.0042, -.018], [-.0050, -.034], [-.0054, -.050]].map(([x, y], i, all) =>
      [x, y, -.0028 + bend(i / (all.length - 1), seed * 2.3) - i * .0004]),
  ];
  const { positions, indices } = strip(tails, .0095);
  const ribbon = new THREE.BufferGeometry();
  ribbon.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  ribbon.setIndex(indices);
  ribbon.computeVertexNormals();
  const cloth = new THREE.Mesh(ribbon, material);
  cloth.castShadow = true;
  cloth.receiveShadow = true;
  cloth.name = 'Visitor wish cloth tied under the candle stand';
  group.add(cloth);

  // The fold over the ledge and the knot itself, so the strip reads as tied, not draped.
  // Keep both close to the ribbon's own size; a thick box reads as a block.
  const fold = new THREE.Mesh(new THREE.BoxGeometry(.013, .0016, .005), material);
  fold.position.set(0, .0010, 0);
  // A slight tilt only: the ribbon hangs nearly vertical, and the burn camera looks almost
  // level, so its face is what the viewer sees. A large tilt lays the tails flat and reads
  // as a block lying on the stone.
  group.rotation.x = -.07;
  fold.castShadow = true;
  group.add(fold);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(.0046, 12, 9), knotMaterial);
  knot.scale.set(1.2, .82, .8);
  knot.position.set(-.0006, -.0032, .0004);
  knot.castShadow = true;
  group.add(knot);

  const local = new V3();
  return {
    group,
    // The seat the strip hangs from, so a probe can compare the strip with the stand.
    anchor: anchor.clone(),
    // A gentle sway that follows the same wind value the pines use, so the strip moves with
    // the gust and the ambient wind instead of standing still in a moving scene.
    update(wind = 0) {
      const angle = Math.max(-.5, Math.min(.5, wind)) * .55;
      group.rotation.z = angle;
      group.rotation.x = angle * .18;
    },
    worldPosition() { return group.getWorldPosition(local.clone()); },
    dispose() {
      ribbon.dispose(); fold.geometry.dispose(); knot.geometry.dispose();
      material.dispose(); knotMaterial.dispose();
    },
  };
}
