// Wet mud footprints on the last steps up to the shoulder and across the tea pavilion floor.
//
// Painted at runtime as decals, not baked: each print is a small quad that is raycast onto the real
// stone, lifted a hair above it, and turned to the stone's own normal so it follows the tread
// instead of floating or reading as a sticker. The alpha and normal maps are generated here, so
// there is no texture file and nothing to license.
import type * as THREE_NS from 'three';

// A grass or cloth sole: one continuous outline, 9-10 cm wide at the forefoot, 6 cm at the arch and
// 7 cm at the round heel, 24-26 cm long. No tread pattern, only two areas pressed deeper: the ball of
// the foot and the heel. Edges are broken by noise so there is crumbly mud and small gaps, and the
// cover thins in places so the stone shows through.
// The half-width of the sole at a fraction `t` of its length, 0 at the toe and 1 at the back of the
// heel, as a fraction of the print's length. For a 26 cm print these give a 9.5 cm forefoot, a 6 cm
// arch and a 7 cm heel, which is an adult's grass or cloth sole. One smooth curve, so the print never
// splits into two pieces.
const SOLE_PROFILE: readonly (readonly [number, number])[] = Object.freeze([
  [0.00, 0.000], [0.05, 0.110], [0.12, 0.175], [0.19, 0.186], [0.28, 0.172],
  [0.38, 0.142], [0.47, 0.108], [0.55, 0.106], [0.64, 0.120], [0.74, 0.140],
  [0.84, 0.148], [0.90, 0.153], [0.95, 0.148], [0.978, 0.122], [1.00, 0.000],
]);

function soleHalfWidth(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  for (let i = 1; i < SOLE_PROFILE.length; i++) {
    const [t1, w1] = SOLE_PROFILE[i];
    if (t > t1) continue;
    const [t0, w0] = SOLE_PROFILE[i - 1];
    const f = (t - t0) / (t1 - t0);
    // Cosine easing keeps the rim from showing corners at the control points.
    return w0 + (w1 - w0) * (.5 - .5 * Math.cos(Math.PI * f));
  }
  return 0;
}

// A deterministic value noise, interpolated on a lattice: the hash alone changes every texel and
// averages to a flat mid-grey once the print is only a few pixels wide on screen. Interpolating
// between lattice points keeps patches large enough to read.
function hash(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function noise2(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, seed), b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed), d = hash(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * sx, bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

// Two octaves, for a rim that wanders at two scales.
function fbm2(x: number, y: number, seed: number): number {
  return noise2(x, y, seed) * .65 + noise2(x * 2.3, y * 2.3, seed + 7) * .35;
}

function soleMaps(THREE: typeof THREE_NS, size = 192) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);

  // Build the shape row by row: for each height the half-width, then break the rim with noise.
  const image = g.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    const t = py / (size - 1);
    const w = soleHalfWidth(t) * size;
    if (w <= 0) continue;
    const centre = size / 2;
    for (let px = 0; px < size; px++) {
      const dx = (px - centre) / (w || 1);
      if (Math.abs(dx) > 1.35) continue;
      // Two deeper presses, at the ball and the heel; elsewhere the mud is thinner.
      const ballPress = .55 + .45 * Math.exp(-(((t - .27) / .12) ** 2));
      const heelPress = .5 + .5 * Math.exp(-(((t - .84) / .10) ** 2));
      const press = Math.max(ballPress, heelPress);
      // Irregular rim: coarse noise decides how far in the edge wanders.
      const rim = fbm2(px * .022, py * .022, 5);
      const edge = Math.abs(dx) + .26 * (rim - .5);
      // Solid through the middle, then a broken band at the rim. At forty pixels on screen a soft
      // ramp averages away to nothing, so the print needs mass inside to read at all.
      const coverage = edge < .78 ? 1 : 1 - Math.min(1, (edge - .78) / .22);
      // A few large patches of clean stone, at a scale that survives the print being a few pixels wide.
      const holes = noise2(px * .055, py * .055, 23);
      const holeMask = holes > .86 ? .10 : 1;
      // Thinnest over the arch, where the foot barely touches; pressed at ball and heel.
      const archThin = 1 - .22 * Math.exp(-(((t - .50) / .10) ** 2));
      const mottle = .86 + .14 * noise2(px * .045, py * .045, 37);
      const value = Math.min(1, coverage * press * holeMask * mottle * archThin);
      if (value <= .01) continue;
      // three.js samples an alphaMap's green channel and ignores its alpha, so the cover goes into the
      // colour. Writing it into alpha instead keeps every print a solid silhouette.
      const level = Math.round(255 * value);
      const i = (py * size + px) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = level;
      image.data[i + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);

  const alpha = new THREE.CanvasTexture(canvas);
  alpha.colorSpace = THREE.NoColorSpace;

  // A shallow normal from the alpha's own gradient, so the pressed areas read as a slight hollow.
  const normal = (() => {
    const out = new Uint8Array(size * size * 4);
    const at = (x: number, y: number) => image.data[
      ((Math.min(size - 1, Math.max(0, y)) * size) + Math.min(size - 1, Math.max(0, x))) * 4 + 1] / 255;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = at(x + 1, y) - at(x - 1, y), dy = at(x, y + 1) - at(x, y - 1);
        const i = (y * size + x) * 4;
        out[i] = Math.round(128 - dx * 70);
        out[i + 1] = Math.round(128 - dy * 70);
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
      // Wet mud is darker than the granite and slightly glossy, never black. The environment is
      // bright here, and a stain should not pick up its colour, so keep the reflection low.
      color: 0x1d1712,
      roughness: .52 - .18 * print.weight,
      metalness: 0,
      envMapIntensity: .12,
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

    // The sole is about 9.5 cm across the ball; the map's widest row is the forefoot.
    const width = print.length * .36;
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

// The trail itself: a walker comes off the mud path onto the shoulder paving and crosses it towards
// the shrine, then two prints turn aside to the tea pavilion. Alternate feet sit either side of the
// walking line, the stride is 60-70 cm, and the toes point slightly outwards. The first prints, just
// off the mud, are the wettest and darkest; each one after is drier and more broken, until the last
// is only a dry patch of the forefoot.
export const PINE_PRINTS: readonly PrintSpec[] = Object.freeze([
  // The shoulder paving measured from the declared overview camera: `Broad_stone_landing002*` at
  // y 4.00-4.01, spanning x -1.31..0.43, z 0.03..2.53. Alternate feet fall about 9 cm either side of
  // the line at x -0.46, with a 65 cm stride and the toes turned out.
  { x: -0.55, y: 4.00, z: 2.38, yaw: 0.22, length: .27, weight: .95 }, // right foot, wettest
  { x: -0.37, y: 4.00, z: 1.72, yaw: -0.18, length: .27, weight: .86 }, // left
  { x: -0.55, y: 4.00, z: 1.08, yaw: 0.20, length: .26, weight: .70 }, // right, drying
  { x: -0.37, y: 4.01, z: 0.42, yaw: -0.14, length: .27, weight: .52 }, // left, breaking up
  // Turning aside to the tea pavilion, which stands to the right of this frame.
  { x: -0.06, y: 4.01, z: 0.50, yaw: 1.12, length: .25, weight: .28 }, // a smudge
  { x: 0.28, y: 4.00, z: 0.66, yaw: 1.34, length: .24, weight: .12 }, // dry patch of the forefoot
]);
