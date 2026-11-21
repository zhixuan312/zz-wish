import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const fullTurn = Math.PI * 2;
const leafRings = [.09, .20, .35, .51, .68, .83, .94, 1];

// Loose clumps flank the seat, with a lower fringe and openings between
// the raised leaves. Leave the bridge, old stands, and the wick lane open.
const leaves = [
  [-4.60, 8.67, .38, .07], [-4.48, 9.04, .53, .24], [-4.99, 8.74, .52, .38],
  [-5.38, 9.05, .48, .51], [-5.37, 9.56, .36, .21], [-5.76, 9.24, .56, .37],
  [-4.19, 6.04, .32, .08], [-4.35, 5.77, .42, .12], [-4.69, 6.06, .45, .24],
  [-4.86, 5.46, .52, .38], [-5.20, 5.88, .56, .46], [-5.75, 5.85, .52, .56],
  [-5.47, 6.56, .35, .12], [-5.87, 6.80, .46, .31], [-6.25, 6.13, .51, .43],
  [-6.67, 8.06, .48, .16], [-6.98, 8.59, .54, .43], [-7.52, 8.31, .60, .63],
  [-7.58, 10.38, .49, .24], [-7.93, 10.02, .54, .59], [-8.28, 10.48, .61, .48],
];

// The open blooms are outnumbered by leaves. Two younger flowers still
// hold their petals upright.
const flowers = [
  [-4.31, 8.53, .25, .39, .85], [-5.53, 9.25, .22, .65, .18],
  [-4.13, 5.72, .24, .42, .92], [-5.50, 5.63, .25, .64, .67],
  [-6.35, 8.17, .19, .41, .25], [-7.38, 10.05, .24, .62, .77],
];

function randomFrom(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

function makeSurface(THREE, positions, colors, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function solidColor(THREE, geometry, color) {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
  geometry.deleteAttribute('uv');
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function makeStem(THREE, random, crown, height, radius, color) {
  const bend = (random() - .5) * .42;
  const drift = (random() - .5) * .39;
  const foot = new THREE.Vector3(crown.x - bend, crown.y - height - .035, crown.z - drift);
  const elbow = foot.clone().lerp(crown, .49).add(new THREE.Vector3(-bend * .22, 0, drift * .35));
  const curve = new THREE.QuadraticBezierCurve3(foot, elbow, crown);
  return solidColor(THREE, new THREE.TubeGeometry(curve, 7, radius, 6), color);
}

function makeLeaf(THREE, random, center, radius, rise) {
  const crown = random() * fullTurn;
  const veinCount = 15 + Math.floor(random() * 4);
  const low = rise < .15;
  const tilt = (low ? .045 : .12 + random() * .19) * radius;
  const cup = (low ? .030 : .11 + random() * .18) * radius;
  const rimWave = (low ? .035 : .09 + random() * .13) * radius;
  const green = new THREE.Color(0x3c624b).lerp(new THREE.Color(0x637e47), random() * .83);
  const vein = green.clone().lerp(new THREE.Color(0x97a270), .40);
  const hub = green.clone().multiplyScalar(.72);
  const color = new THREE.Color();
  const positions = center.toArray();
  const colors = hub.toArray();
  const indices = [];
  const spokes = Array.from({ length: veinCount }, (_, i) =>
    (i + (random() - .5) * .20) * fullTurn / veinCount + crown);
  const count = spokes.length * 4;

  for (const r of leafRings) {
    for (let i = 0; i < spokes.length; i++) {
      const a = spokes[i];
      const next = spokes[i + 1] ?? spokes[0] + fullTurn;
      const width = .006 + .017 * (1 - r);
      const angles = [a - width, a, a + width, (a + next) * .5];
      for (let j = 0; j < angles.length; j++) {
        const angle = angles[j];
        const phase = angle - crown;
        const outline = 1 + .057 * Math.cos(3 * phase + 1.3) + .037 * Math.sin(5 * phase) +
          .018 * Math.cos(9 * phase - .4);
        const distance = r * radius * outline;
        const fold = j === 3 ? -.019 * radius * r : 0;
        const curl = cup * r * r + tilt * r * Math.cos(phase);
        const edge = rimWave * r ** 3 * (.65 * Math.sin(5 * phase + 1.1) + .35 * Math.cos(9 * phase));
        positions.push(center.x + Math.cos(angle) * distance, center.y + curl + edge + fold,
          center.z + Math.sin(angle) * distance);
        color.copy(green).multiplyScalar(1 + .11 * Math.cos(4 * phase + r * 6) +
          .07 * Math.sin(i * 7.6 + r * 5) + .09 * r);
        if (j === 1) color.lerp(vein, .86 - .50 * r);
        color.lerp(hub, Math.max(0, 1 - r * 3) * .63);
        colors.push(color.r, color.g, color.b);
      }
    }
  }

  for (let col = 0; col < count; col++) {
    const next = (col + 1) % count;
    indices.push(0, 1 + next, 1 + col);
    for (let ring = 1; ring < leafRings.length; ring++) {
      const inner = 1 + (ring - 1) * count;
      const outer = inner + count;
      indices.push(inner + col, outer + next, outer + col,
        inner + col, inner + next, outer + next);
    }
  }
  return makeSurface(THREE, positions, colors, indices);
}

function makePetal(THREE, center, radius, angle, openness, width, curl, base, tip) {
  const rows = 8, columns = 5;
  const positions = [], colors = [], indices = [];
  const color = new THREE.Color();
  const dx = Math.cos(angle), dz = Math.sin(angle);
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const reach = radius * (.10 + (.30 + openness * .61) * t ** .77 -
      (.34 * (1 - openness)) * t ** 4);
    const rise = radius * ((.9 - openness * .54) * t + curl * t ** 3);
    const halfWidth = radius * width * Math.max(.008, Math.sin(Math.PI * t ** .85)) ** .75;
    for (let col = 0; col <= columns; col++) {
      const u = 2 * col / columns - 1;
      const flare = u * halfWidth + radius * .045 * Math.sin(t * Math.PI);
      const fold = radius * u * u * Math.sin(Math.PI * t) * .10;
      positions.push(center.x + dx * reach - dz * flare, center.y + rise + fold,
        center.z + dz * reach + dx * flare);
      color.copy(base).lerp(tip, .09 + .86 * t ** 1.7 + .04 * u * u);
      colors.push(color.r, color.g, color.b);
      if (row && col) {
        const corner = row * (columns + 1) + col;
        indices.push(corner, corner - 1, corner - columns - 2,
          corner, corner - columns - 2, corner - columns - 1);
      }
    }
  }
  return makeSurface(THREE, positions, colors, indices);
}

function addFlower(THREE, random, geometry, center, radius, openness) {
  const phase = random() * fullTurn;
  const cream = new THREE.Color(0xf0cfb0);
  const blush = new THREE.Color(0xe7b6bd);
  const pink = new THREE.Color(0xc7678e).lerp(new THREE.Color(0xa34771), random() * .61);
  const pale = cream.clone().lerp(blush, random() * .70);
  for (let ring = 0; ring < 2; ring++) {
    const count = (ring ? 7 : 9) + Math.floor(random() * 2);
    for (let j = 0; j < count; j++) {
      const angle = phase + (j + ring * .46 + (random() - .5) * .22) * fullTurn / count;
      const size = radius * (1 - .29 * ring) * (.88 + random() * .21);
      geometry.push(makePetal(THREE, center, size, angle, openness * (1 - .28 * ring),
        .20 + random() * .075, (random() - .35) * .19, pale, pink));
    }
  }
  const calyx = new THREE.SphereGeometry(radius * .22, 8, 5);
  calyx.scale(1, .65, 1);
  calyx.translate(center.x, center.y + radius * .035, center.z);
  geometry.push(solidColor(THREE, calyx, new THREE.Color(0x607850)));
  if (openness > .52) {
    const receptacle = new THREE.SphereGeometry(radius * .20, 10, 6);
    receptacle.scale(1, .60, 1);
    receptacle.translate(center.x, center.y + radius * .21, center.z);
    geometry.push(solidColor(THREE, receptacle, new THREE.Color(0xc0994e)));
  }
}

function addBatch(THREE, group, geometry, name, roughness, doubleSided) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness,
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(mergeGeometries(geometry), material);
  for (const part of geometry) part.dispose();
  mesh.name = name;
  mesh.receiveShadow = true;
  group.add(mesh);
}

export function buildForegroundLotus(THREE, group, waterHeight) {
  const random = randomFrom(0x2f6c51);
  const foliage = [], stems = [], blossoms = [];
  const stemColor = new THREE.Color(0x4b6041);
  const crown = (x, z, rise) => new THREE.Vector3(
    x + (random() - .5) * .13,
    waterHeight + rise * (.90 + .20 * random()),
    z + (random() - .5) * .13,
  );
  for (const [x, z, radius, rise] of leaves) {
    const center = crown(x, z, rise);
    foliage.push(makeLeaf(THREE, random, center, radius * (.90 + .20 * random()), rise));
    stems.push(makeStem(THREE, random, center, center.y - waterHeight, radius * .024, stemColor));
  }
  for (const [x, z, radius, rise, openness] of flowers) {
    const center = crown(x, z, rise);
    addFlower(THREE, random, blossoms, center, radius, openness);
    stems.push(makeStem(THREE, random, center, center.y - waterHeight, radius * .035, stemColor));
  }
  addBatch(THREE, group, foliage, 'Lotus leaves', .65, true);
  addBatch(THREE, group, stems, 'Lotus stems', .86, false);
  addBatch(THREE, group, blossoms, 'Lotus flowers', .77, true);
}
