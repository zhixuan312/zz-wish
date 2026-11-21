// A continuous watershed around the court. The spines define the large forms
// first. Smaller branch ridges and drainage texture follow their slopes.
const FLOOR = -.86;
const MIN_X = -212, MAX_X = 229, MIN_Z = -334, MAX_Z = 57;
const COLUMNS = 154, ROWS = 126;

// Along-valley stations: Z, crest X, elevation, outer and inner slope widths.
// The long, lower shoulders read as part of one slope between high points.
const WEST = [
  [-334, -108, 18, 97, 77], [-277, -112, 69, 89, 76],
  [-231, -82, 74, 92, 65], [-185, -71, 56, 91, 64],
  [-156, -61, 71, 84, 55], [-128, -79, 66, 76, 62],
  [-103, -76, 48, 88, 51], [-74, -84, 52, 73, 48],
  [-36, -93, 36, 86, 56], [-8, -88, 27, 83, 47],
  [24, -96, 20, 87, 44], [57, -101, 4, 83, 38],
];
const EAST = [
  [-334, 136, 18, 82, 78], [-279, 140, 66, 94, 78],
  [-246, 126, 68, 86, 63], [-212, 120, 55, 92, 68],
  [-174, 103, 62, 89, 73], [-143, 99, 52, 81, 60],
  [-116, 91, 64, 86, 55], [-87, 92, 52, 86, 50],
  [-53, 108, 44, 76, 56], [-25, 107, 33, 81, 55],
  [6, 109, 31, 85, 52], [30, 113, 17, 86, 53],
  [57, 112, 4, 81, 44],
];

const clamp01 = x => Math.min(1, Math.max(0, x));
const mix = (a, b, t) => a + (b - a) * t;
const fade = t => t * t * (3 - 2 * t);
const smooth = (low, high, x) => fade(clamp01((x - low) / (high - low)));

function gridValue(x, z) {
  let hash = Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x1b873593);
  hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca77);
  return ((hash ^ (hash >>> 13)) >>> 0) / 4294967295;
}

function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = fade(x - ix), fz = fade(z - iz);
  return mix(
    mix(gridValue(ix, iz), gridValue(ix + 1, iz), fx),
    mix(gridValue(ix, iz + 1), gridValue(ix + 1, iz + 1), fx),
    fz,
  );
}

function spineSlope(x, z, stations, isWest) {
  let i = 1;
  while (i < stations.length - 1 && z > stations[i][0]) i++;
  const left = stations[i - 1], right = stations[i];
  const along = smooth(left[0], right[0], z);
  const crest = mix(left[1], right[1], along) + 3.6 * (noise(z * .031, isWest ? 11 : 24) - .5);
  const height = mix(left[2], right[2], along);
  const lateral = x - crest;
  const inside = isWest ? lateral > 0 : lateral < 0;
  const width = inside ? mix(left[4], right[4], along) : mix(left[3], right[3], along);
  const across = Math.abs(lateral) / width;
  if (across >= 1) return 0;

  // A rounded top gives way to the steeper face, and the foot grades out
  // rather than meeting the valley floor at a hard ring.
  const face = Math.pow(.5 + .5 * Math.cos(Math.PI * across), .86);
  const spurMix = smooth(.1, .52, across) * (1 - smooth(.67, 1, across));
  const drainage = noise(x * .079 + z * .037, z * .092 + lateral * .022);
  const divides = noise(x * .039 - z * .025, z * .067);
  const spurs = 1 + (.24 * (divides - .42) - .21 * (1 - drainage) ** 3) * spurMix;
  return height * face * spurs;
}

// Recessed, offset shoulders beyond the creek. Their irregular crest profiles
// leave a visible saddle instead of closing the valley with one isolated cone.
const FAR_FOLDS = [
  [-48, -214, 55, 54, 44, -.55],
  [0, -253, 61, 47, 46, -.28],
  [36, -262, 47, 32, 38, .13],
  [47, -303, 22, 56, 33, -.1],
  [72, -254, 35, 34, 48, .32],
  [114, -244, 57, 44, 44, .48],
];

function farShoulders(x, z) {
  let height = 0;
  for (const [cx, cz, crest, width, depth, yaw] of FAR_FOLDS) {
    const dx = x - cx, dz = z - cz;
    const u = (Math.cos(yaw) * dx - Math.sin(yaw) * dz) / width;
    const v = (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / depth;
    const reach = Math.hypot(u * (1 + .16 * v), v);
    const mound = Math.max(0, 1 - reach * reach);
    const fold = crest * mound ** 1.75 *
      (.93 + .15 * noise(u * 3.6 + cx * .1, v * 4.2));
    // A small smooth union rounds the common saddle between two shoulders.
    height = Math.max(height, fold) + Math.min(height, fold) * .14;
  }
  return height;
}

export function valleyRidgeHeight(x, z) {
  if (x <= MIN_X || x >= MAX_X || z <= MIN_Z || z >= MAX_Z) return FLOOR;
  const west = spineSlope(x, z, WEST, true);
  const east = spineSlope(x, z, EAST, false);
  const far = farShoulders(x, z);
  let height = Math.max(west, east, far) + Math.min(Math.max(west, east), far) * .18;

  const creekAxis = 14 + Math.max(0, (-z - 39) * .105);
  const corridor = 1 - smooth(-126, -80, z);
  const courtApron = smooth(0, 17, Math.max(-45 - x, x - 65));
  const valleySides = mix(1, smooth(13, 36, Math.abs(x - creekAxis)), smooth(-281, -214, z));
  height *= mix(courtApron, valleySides, corridor);
  const edges = smooth(0, 25, x - MIN_X) * smooth(0, 25, MAX_X - x)
    * smooth(0, 23, z - MIN_Z) * smooth(0, 29, MAX_Z - z);
  const relief = (noise(x * .116, z * .106) - .5) * 2.15
    + (noise(x * .196 + 41, z * .168) - .5) * .72;
  return FLOOR + Math.max(0, height + relief * smooth(1.5, 17, height)) * edges;
}

export function addValleyRidges({ THREE, context }) {
  const positions = new Float32Array((COLUMNS + 1) * (ROWS + 1) * 3);
  const indices = new Uint16Array(COLUMNS * ROWS * 6);
  let p = 0, index = 0;
  for (let row = 0; row <= ROWS; row++) {
    const z = mix(MIN_Z, MAX_Z, row / ROWS);
    for (let col = 0; col <= COLUMNS; col++) {
      const x = mix(MIN_X, MAX_X, col / COLUMNS);
      positions[p++] = x;
      positions[p++] = valleyRidgeHeight(x, z);
      positions[p++] = z;
      if (row === ROWS || col === COLUMNS) continue;
      const a = row * (COLUMNS + 1) + col, b = a + 1;
      const c = a + COLUMNS + 1, d = c + 1;
      indices[index++] = a; indices[index++] = c; indices[index++] = b;
      indices[index++] = b; indices[index++] = c; indices[index++] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const normals = geometry.attributes.normal;
  const colors = new Float32Array(positions.length);
  const deepCover = new THREE.Color(0x405644), lightCover = new THREE.Color(0x6c7653);
  const darkStone = new THREE.Color(0x59615a), lightStone = new THREE.Color(0x888672);
  const cover = new THREE.Color(), stone = new THREE.Color();
  for (let i = 0; i < normals.count; i++) {
    const offset = i * 3;
    const [x, y, z] = [positions[offset], positions[offset + 1], positions[offset + 2]];
    const inclination = Math.sqrt(Math.max(0, 1 - normals.getY(i) ** 2));
    const drainage = noise(x * .094 + z * .041, z * .077);
    const canopy = noise(x * .119 - 10, z * .129) * .62 + noise(x * .028, z * .031) * .38;
    const bed = Math.sin(y * .54 + x * .027 + z * .034 + noise(x * .041, z * .045) * 1.8);
    const bare = smooth(.44, .83, inclination + .14 * (drainage - .38))
      * smooth(6, 27, y) * (.6 + .4 * smooth(-.4, .75, bed));
    cover.copy(deepCover).lerp(lightCover, smooth(.23, .78, canopy) * .78);
    stone.copy(darkStone).lerp(lightStone, .28 + .45 * smooth(-.55, .8, bed));
    cover.lerp(stone, bare).multiplyScalar(.88 + .22 * canopy);
    cover.toArray(colors, offset);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, envMapIntensity: .16 });
  const ridges = new THREE.Mesh(geometry, material);
  ridges.name = 'Valley watershed slopes';
  context.G.add(ridges);
  return ridges;
}
