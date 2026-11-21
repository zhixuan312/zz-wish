// Low, overlapping ranges behind the court. All units are world metres.
const ranges = [
  {
    name: 'Near folded slopes', front: 49, depth: 126, width: 492, columns: 246, rows: 63,
    base: 19, seed: 23, rock: 0x675746, scree: 0xb69b76,
    peaks: [[-128, 12, 35, 52], [-57, 12, 41, 29], [-10, 5, 24, 16], [22, 7, 22, 33], [65, 13, 29, 41], [135, 14, 62, 40]],
    // Crest start, toe offset, bend, cut depth, west/east tributary reach.
    drains: [
      [-171, -12, 8, 7, 17, 10], [-119, 29, -4, 8.5, 21, 13],
      [-79, -14, 8, 8, 10, 14], [-39, 9, -8, 8.9, 15, 15],
      [-13, -12, 5, 7.5, 12, 9], [12, 8, -4, 8, 13, 13],
      [38, 12, 5, 9.1, 16, 14],
      [111, 21, 9, 8, 14, 16], [158, 13, -11, 7.7, 23, 12],
      [194, 7, 12, 7, 14, 15],
    ],
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
const bell = x => Math.exp(-x * x);

function fade(a, b, x) {
  return smooth(clamp((x - a) / (b - a), 0, 1));
}

function noise(x, seed) {
  const cell = Math.floor(x);
  const hash = n => {
    const value = Math.sin(n * 127.1 + seed * 19.7) * 43758.5453;
    return (value - Math.floor(value)) * 2 - 1;
  };
  return mix(hash(cell), hash(cell + 1), smooth(x - cell));
}

function crestHeight(range, x) {
  return range.peaks.reduce((height, [centre, rise, west, east]) => {
    const side = (x - centre) / (x < centre ? west : east);
    return height + rise * Math.exp(-side * side * 1.5);
  }, range.base);
}

function section(range, x, distance) {
  const { seed, cut } = range;
  const crest = crestHeight(range, x);
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

function cutByDrain(x, down, [head, spread, bend, depth, west, east]) {
  const thalweg = head + spread * down + bend * Math.sin(Math.PI * down);
  const across = x - thalweg;
  if (Math.abs(across) > Math.max(west, east) + 18) return 0;
  // Narrow cuts near the crest widen toward the fan. Each upper tributary
  // approaches the main channel at a different height and angle.
  const width = mix(1.8, 6.5, down);
  const westJoin = fade(.14, .43, down), eastJoin = fade(.20, .54, down);
  const trunk = bell(across / width);
  const left = bell((across + west * (1 - westJoin)) / (1.6 + .7 * westJoin)) * (1 - westJoin);
  const right = bell((across - east * (1 - eastJoin)) / (1.5 + .9 * eastJoin)) * (1 - eastJoin);
  const recessed = Math.max(trunk, .54 * left, .48 * right);
  return depth * recessed * fade(.01, .18, down) * (1 - fade(.82, 1, down));
}

function principalRavine(x, down, seed) {
  // The channel bends around the shoulder before the deposit spreads at its foot.
  const lowerTurn = 2.45 * fade(.50, .85, down);
  const centre = 79 - 24 * down + 7 * Math.sin(Math.PI * down) + .85 * noise(down * 8, seed + 14) - lowerTurn;
  const across = x - centre;
  if (Math.abs(across) > 28) return null;

  const apronStart = fade(.26, .55, down);
  const reach = fade(.035, .145, down) * (1 - fade(.89, .99, down));
  const width = mix(3.1, 4.8, fade(.11, .42, down)) * (1 - .25 * apronStart);
  const runnel = reach * bell(across / width);
  const widthAtBank = width * (across < 0 ? 2.20 : 2.66);
  const rock = reach * (1 - apronStart) * (1 - fade(.47, 1, Math.abs(across) / widthAtBank));
  const apronWidth = mix(8, 23, fade(.36, .87, down)) + 1.45 * noise(down * 17, seed + 2);
  const apron = apronStart * reach * (1 - fade(.39, 1, Math.abs(across - 1.4) / apronWidth));
  // Broken bedding and a shallower fan surface still carry the incised line.
  const bedding = noise(x * .21 + down * 15, seed + 5);
  const rubble = noise(x * .53 - down * 20, seed + 8);
  const exposedLedge = rock * bell((across - width * 1.22) / (width * .82));
  const shallowBend = fade(.11, .26, down) * (1 - fade(.42, .58, down));
  const depth = mix(6.5, 2.05, apronStart) * (1 - .65 * shallowBend);
  const height = 1.65 * exposedLedge + rock * (1.28 * bedding + .60 * rubble)
    + apron * (1.2 + .5 * rubble) - depth * runnel;
  return { height, runnel, rock, apron, bedding, rubble };
}

function nearSection(range, x, distance) {
  const { seed } = range;
  const apex = .58 + .095 * noise(x * .028, seed + 18) + .024 * noise(x * .09, seed + 2);
  const front = distance <= apex;
  const flank = front ? distance / apex : (1 - distance) / (1 - apex);
  const down = 1 - flank;
  const face = front ? flank ** 1.19 : flank ** .83;
  let incised = 0;
  if (front) for (const trunk of range.drains) incised = Math.max(incised, cutByDrain(x, down, trunk));
  const ravine = front ? principalRavine(x, down, seed) : null;
  // Fractured rock shifts the slope underneath the scree in long, irregular
  // plates. Small ridges move from the crest down and out along the face.
  const fault = x + down * (11 + 19 * noise(x * .017, seed + 7));
  const crag = 2.5 * noise(fault * .11, seed + 9) + 1.1 * noise(fault * .22 - distance * 3, seed + 2);
  const plate = 1.9 * noise(x * .044 + distance * 4, seed + 13) + .8 * noise(x * .34 - distance * 12, seed + 5);
  const edge = fade(0, 57, range.width * .5 - Math.abs(x));
  const height = -1.4 + edge * (face * (crestHeight(range, x) + crag + plate + 2) - incised
    + (ravine?.height ?? 0));
  return { height, carve: incised / 9.1, face, ravine };
}

export function buildHighWhiteRidges({ THREE, context }) {
  for (const range of ranges) {
    const { columns, rows, width, front, depth } = range;
    const geometry = new THREE.PlaneGeometry(width, depth, columns, rows).rotateX(-Math.PI / 2);
    const vertices = geometry.attributes.position;
    const colours = new Float32Array(vertices.count * 3);
    const rock = new THREE.Color(range.rock), scree = new THREE.Color(range.scree), shade = new THREE.Color();
    const fracturedRock = new THREE.Color(0x51463e), paleApron = new THREE.Color(0xc5b49b);
    const channelSilt = new THREE.Color(0x594c41);
    const sample = range.drains ? nearSection : section;
    for (let row = 0; row <= rows; row++) {
      const distance = 1 - row / rows;
      for (let column = 0; column <= columns; column++) {
        const i = row * (columns + 1) + column;
        const x = vertices.getX(i), z = -front - distance * depth;
        const { height, carve, face, ravine } = sample(range, x, distance);
        vertices.setXYZ(i, x, height, z);
        // Pale scree sits between darker drainage cuts; the variation follows
        // the geometry so changing sun angle reveals real slope shape.
        const band = noise(x * .045 - height * .04 + z * .016, range.seed + 28);
        let stone = clamp(.49 + .22 * band - .58 * carve + .10 * face, .08, .87);
        if (range.drains) {
          const strata = noise(height * .25 + x * .024 - z * .038, range.seed + 4);
          const fragments = noise(x * .22 + z * .17, range.seed + 6);
          stone = clamp(stone + .21 * strata + .15 * fragments + .16 * (1 - face), .05, .94);
        }
        shade.copy(rock).lerp(scree, stone);
        // Concave cuts receive less indirect light than the open ridges above.
        if (range.drains) shade.multiplyScalar(1 - .34 * clamp(carve, 0, 1));
        if (ravine) {
          shade.lerp(fracturedRock, ravine.rock * (.66 + .16 * ravine.bedding));
          shade.lerp(paleApron, ravine.apron * (.78 + .20 * ravine.rubble));
          // Fine, darker sediment marks the same floor as it crosses the fan.
          shade.lerp(channelSilt, .94 * ravine.runnel * ravine.apron);
          // The channel floor and the sheltered side receive less sky light.
          shade.multiplyScalar(1 - ravine.runnel * (.34 - .17 * ravine.apron));
        }
        shade.toArray(colours, i * 3);
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
