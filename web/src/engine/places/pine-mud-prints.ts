// Wet mud footprints on the last steps up to the shoulder and across the tea pavilion floor.
//
// Painted at runtime as decals, not baked: each print is a small quad that is raycast onto the real
// stone, lifted a hair above it, and turned to the stone's own normal so it follows the tread
// instead of floating or reading as a sticker. The alpha and normal maps are generated here, so
// there is no texture file and nothing to license.
import type * as THREE_NS from 'three';

// A grass-sandal sole: a rounded heel, a narrow waist and a wider forefoot, with a few worn gaps.
// Drawn once into a small canvas and used as the print's alpha.
function soleMaps(THREE: typeof THREE_NS, size = 96) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  // The sole, toe up. Soft edges so the print does not read as a sticker.
  g.fillStyle = '#fff';
  g.beginPath();
  g.ellipse(size * .5, size * .27, size * .185, size * .145, 0, 0, Math.PI * 2); // forefoot
  g.fill();
  g.beginPath();
  g.ellipse(size * .5, size * .52, size * .125, size * .16, 0, 0, Math.PI * 2);  // waist
  g.fill();
  g.beginPath();
  g.ellipse(size * .5, size * .8, size * .155, size * .13, 0, 0, Math.PI * 2);   // heel
  g.fill();
  // Worn gaps: a sandal does not print as one solid pad.
  g.globalCompositeOperation = 'destination-out';
  const gaps: [number, number, number, number][] = [
    [.31, .30, .06, .10], [.63, .34, .05, .08], [.44, .70, .09, .05],
  ];
  for (const [x, y, w, h] of gaps) {
    g.beginPath();
    g.ellipse(size * x, size * y, size * w, size * h, .3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  // Fade the rim by a pixel or two, so no hard cut shows on the stone.
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createRadialGradient(size / 2, size / 2, size * .30, size / 2, size / 2, size * .5);
  fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade; g.fillRect(0, 0, size, size);
  const alpha = new THREE.CanvasTexture(canvas);
  alpha.colorSpace = THREE.NoColorSpace;

  // A shallow normal, derived from the alpha's own gradient so the rim reads as a pressed edge.
  const normal = (() => {
    const data = g.getImageData(0, 0, size, size).data;
    const out = new Uint8Array(size * size * 4);
    const at = (x: number, y: number) =>
      data[((Math.min(size - 1, Math.max(0, y)) * size) + Math.min(size - 1, Math.max(0, x))) * 4 + 3] / 255;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = at(x + 1, y) - at(x - 1, y), dy = at(x, y + 1) - at(x, y - 1);
        const i = (y * size + x) * 4;
        out[i] = Math.round(128 - dx * 90);
        out[i + 1] = Math.round(128 - dy * 90);
        out[i + 2] = 255; out[i + 3] = 255;
      }
    }
    const texture = new THREE.DataTexture(out, size, size, THREE.RGBAFormat);
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
    return texture;
  })();
  return { alpha, normal };
}

export interface PrintSpec {
  /** Where the foot lands, in the place's world metres. */
  x: number; y: number; z: number;
  /** Direction of travel, radians about y; the print points the way the walker is going. */
  yaw: number;
  /** Overall print length in metres, 0.24 to 0.29 for an adult. */
  length: number;
  /** How deep the mud sits, 0 to 1; shallower prints at the very end of the trail. */
  weight: number;
}

export function createMudPrints({ THREE, surface, prints }: {
  THREE: typeof THREE_NS;
  /** The meshes to raycast onto: the stone the prints must sit on. */
  surface: THREE_NS.Object3D;
  prints: readonly PrintSpec[];
}) {
  const maps = soleMaps(THREE);
  const group = new THREE.Group();
  group.name = 'Wet mud footprints on the steps';
  group.renderOrder = 2;
  const disposers: (() => void)[] = [];
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const up = new THREE.Vector3(0, 1, 0);

  for (const print of prints) {
    // Find the stone under the intended spot; a print with no stone below is not drawn at all,
    // which is better than one floating over the void.
    ray.set(new THREE.Vector3(print.x, print.y + 2, print.z), down);
    ray.far = 6;
    const hit = ray.intersectObject(surface, true)[0];
    if (!hit) continue;

    const material = new THREE.MeshStandardMaterial({
      // Wet mud is darker than the granite and slightly glossy, never black.
      color: 0x2e2620,
      roughness: .48 - .16 * print.weight,
      metalness: 0,
      alphaMap: maps?.alpha ?? null,
      normalMap: maps?.normal ?? null,
      normalScale: new THREE.Vector2(.9, .9),
      transparent: true,
      opacity: Math.min(.92, .35 + .55 * print.weight),
      // The print is a stain on stone: it must not fight the stone for depth.
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    const width = print.length * .38;
    const geometry = new THREE.PlaneGeometry(width, print.length);
    const mesh = new THREE.Mesh(geometry, material);
    // Lift 2 mm along the stone's normal: enough to beat z-fighting, too little to see a gap.
    // A raycast can report the back face of a one-sided plane, which would point the print into the
    // stone. The step's walkable side is up, so flip any downward normal.
    const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : up.clone();
    if (normal.y < 0) normal.negate();
    mesh.position.copy(hit.point).addScaledVector(normal, .002);
    // Build the orientation in one go: a PlaneGeometry stands in XY, so tip it flat about X, then
    // turn it about world Y to the walker's heading, then tilt it from world up onto the stone's
    // normal. Doing these as separate rotate calls in the wrong order leaves the print on edge.
    const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const heading = new THREE.Quaternion().setFromAxisAngle(up, print.yaw);
    const tilt = new THREE.Quaternion().setFromUnitVectors(up, normal);
    mesh.quaternion.copy(tilt).multiply(heading).multiply(flat);
    mesh.receiveShadow = true;
    mesh.name = 'Wet mud footprint';
    mesh.userData.cast = false;
    group.add(mesh);
    disposers.push(() => { geometry.dispose(); material.dispose(); });
  }

  return {
    group,
    count: group.children.length,
    dispose() {
      for (const dispose of disposers) dispose();
      maps?.alpha.dispose();
      maps?.normal.dispose();
    },
  };
}

// The trail itself: along the last steps to the shoulder, then a few prints turning aside to the
// tea pavilion. Kept under twenty prints, as the brief asks, and each one is snapped to the stone.
export const PINE_PRINTS: readonly PrintSpec[] = Object.freeze([
  // On the shoulder paving around the niche, where the raycast found stone at y = 5.00 and
  // x -1.9..-1.74, z 0.85..1.01. The prints approach the shrine, then two turn aside.
  { x: -1.88, y: 5.0, z: 1.02, yaw: .15, length: .27, weight: .8 },
  { x: -1.79, y: 5.0, z: .98, yaw: -.10, length: .27, weight: .75 },
  { x: -1.90, y: 5.0, z: .94, yaw: .08, length: .26, weight: .7 },
  { x: -1.80, y: 5.0, z: .90, yaw: -.06, length: .27, weight: .85 },
  { x: -1.89, y: 5.0, z: .86, yaw: .12, length: .26, weight: .65 },
  { x: -1.78, y: 5.0, z: .82, yaw: -.12, length: .27, weight: .6 },
  { x: -1.87, y: 5.0, z: .78, yaw: .05, length: .25, weight: .5 },
  { x: -1.76, y: 5.0, z: .95, yaw: .9, length: .25, weight: .35 },
  { x: -1.73, y: 5.0, z: .90, yaw: 1.2, length: .24, weight: .28 },
]);
