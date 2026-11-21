// Low, overlapping ranges behind the court. All units are world metres.
const ranges = [
  {
    name: 'Near folded slopes', front: 148, depth: 158, width: 910, columns: 148, rows: 29,
    base: 18, seed: 23, cut: 5.2, rock: 0x797168, scree: 0x998c78,
    peaks: [[-234, 21, 62, 116], [-114, 31, 89, 61], [-3, 6, 23, 45], [155, 32, 84, 110], [283, 13, 78, 118]],
  },
  {
    name: 'Middle broken ridgeline', front: 239, depth: 185, width: 1100, columns: 150, rows: 25,
    base: 37, seed: 47, cut: 7.5, rock: 0x72737a, scree: 0x898783,
    peaks: [[-241, 22, 85, 142], [-67, 30, 108, 56], [13, 22, 38, 77], [122, 30, 80, 49], [269, 34, 95, 138]],
  },
  {
    name: 'Distant rounded divide', front: 351, depth: 192, width: 1330, columns: 120, rows: 20,
    base: 59, seed: 71, cut: 8.1, rock: 0x737e94, scree: 0x88909c,
    peaks: [[-350, 30, 107, 130], [-157, 32, 130, 96], [7, 38, 113, 60], [102, 34, 80, 114], [332, 42, 108, 129]],
  },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = t => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;

function noise(x, seed) {
  const cell = Math.floor(x);
  const hash = n => {
    const value = Math.sin(n * 127.1 + seed * 19.7) * 43758.5453;
    return (value - Math.floor(value)) * 2 - 1;
  };
  return mix(hash(cell), hash(cell + 1), smooth(x - cell));
}

function section(range, x, distance) {
  const { peaks, base, seed, cut } = range;
  const crest = peaks.reduce((height, [centre, rise, west, east]) => {
    const side = (x - centre) / (x < centre ? west : east);
    return height + rise * Math.exp(-side * side * 1.5);
  }, base);
  const roughness = 3.8 * noise(x * .045, seed) + 1.6 * noise(x * .14, seed + 11);
  const apex = .61 + .095 * noise(x * .015, seed + 18);
  const flank = distance <= apex ? distance / apex : (1 - distance) / (1 - apex);

  // Each drainage line runs downslope. The warped coordinate keeps the cuts
  // from repeating evenly and breaks up the spurs between catchments.
  const drain = x + 22 * noise(x * .014, seed + 7) + 22 * (1 - flank) * noise(x * .035, seed + 19);
  const channel = (.5 + .5 * Math.sin(drain * .148 + seed)) ** 6;
  const tributary = (.5 + .5 * Math.sin(drain * .31 + 2.4 * noise(x * .043, seed))) ** 7;
  const carve = (channel + .34 * tributary) * Math.sin(Math.PI * flank) ** .75;
  const face = flank ** (distance <= apex ? 1.22 : .84);
  const edge = smooth(clamp((range.width * .5 - Math.abs(x)) / 125, 0, 1));
  const height = -1.4 + edge * (face * (crest + roughness + 2) - cut * carve);
  return { height, carve, face };
}

export function buildHighWhiteRidges({ THREE, context }) {
  for (const range of ranges) {
    const { columns, rows, width, front, depth } = range;
    const geometry = new THREE.PlaneGeometry(width, depth, columns, rows).rotateX(-Math.PI / 2);
    const vertices = geometry.attributes.position;
    const colours = new Float32Array(vertices.count * 3);
    const rock = new THREE.Color(range.rock), scree = new THREE.Color(range.scree), shade = new THREE.Color();
    for (let row = 0; row <= rows; row++) {
      const distance = 1 - row / rows;
      for (let column = 0; column <= columns; column++) {
        const i = row * (columns + 1) + column;
        const x = vertices.getX(i), z = -front - distance * depth;
        const { height, carve, face } = section(range, x, distance);
        vertices.setXYZ(i, x, height, z);
        // Pale scree sits between darker drainage cuts; the variation follows
        // the geometry so changing sun angle reveals real slope shape.
        const band = noise(x * .045 - height * .04 + z * .016, range.seed + 28);
        const stone = clamp(.49 + .22 * band - .58 * carve + .10 * face, .08, .87);
        shade.copy(rock).lerp(scree, stone).toArray(colours, i * 3);
      }
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: .17 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = range.name;
    context.G.add(mesh);
  }
}
