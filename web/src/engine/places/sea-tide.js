import { createWalk, walkSeconds } from './sea-tide-camera.js';
import { buildTideWater } from './sea-tide-water.js';

export const wallReturn = { start: [3.10, 14.19], end: [8.93, 10.0], capWidth: .63 };

function buildLane(h, granite, dark) {
  const { THREE, M, box, pave, context, pavingTex } = h;
  pave(0, 24, 5.38, 23, .002, M(0x777c79, .96, { map: pavingTex }));
  box(.64, 2.8, 22.5, dark, -3, 1.4, 23.75);
  box(.88, 2.72, 20, dark, 3, 1.36, 24);
  box(1.04, .14, 20.18, granite, 3, 2.76, 24);
  box(.78, .13, 22.66, granite, -3, 2.84, 23.75);
  const stones = [0x7a827f, 0x747b77, 0x6e7672, 0x858a81].map(color =>
    M(color, .95, { map: pavingTex }));
  for (let course = 0; course < 5; course++) {
    const y = .27 + course * .53;
    for (const side of [-1, 1]) {
      let start = side > 0 ? 14.02 : 12.52;
      const limit = side > 0 ? 33.98 : 34.98;
      let i = 0;
      while (start < limit - .05) {
        const end = Math.min(limit, start + 1.17 + .29 * Math.sin(i * 2.4 + course * 2.1 + side));
        const stone = stones[(i + course * 3 + (side > 0 ? 1 : 0)) % stones.length];
        if (end - start > .06) {
          box(.98, .512 + .011 * Math.sin(i + course), end - start - .017,
            stone, 3 * side, y, (start + end) / 2);
        }
        start = end;
        i++;
      }
    }
  }
  // The return steps down towards the niche, intercepting spray from the channel.
  const returnStart = new THREE.Vector2(...wallReturn.start);
  const returnEnd = new THREE.Vector2(...wallReturn.end);
  const run = returnEnd.clone().sub(returnStart);
  const yaw = Math.atan2(-run.y, run.x);
  for (let i = 0; i < 8; i++) {
    const point = returnStart.clone().addScaledVector(run, (i + .5) / 8);
    const height = Math.max(.83, 1.55 - .15 * i);
    const length = run.length() / 8;
    box(length - .018, height, .53, stones[(i + 1) % stones.length], point.x, height / 2, point.y, yaw);
    box(length + .008, .075, wallReturn.capWidth, dark, point.x, height + .028, point.y, yaw);
  }
  // Spray leaves broken, pale traces on the outside and on the stone return.
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 192;
  const paint = canvas.getContext('2d');
  let seed = 13807;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 4900; i++) {
    const x = random() * canvas.width;
    const ridge = 114 + 12 * Math.sin(x * .048) + 7 * Math.sin(x * .12);
    const y = ridge + (random() - random()) * 82;
    const edge = Math.sin(Math.PI * x / canvas.width);
    paint.fillStyle = `rgba(212,218,200,${(.04 + random() * .28) * edge})`;
    paint.fillRect(x, y, 1 + random() * 6, 1 + random() * 2.4);
  }
  const salt = new THREE.CanvasTexture(canvas);
  salt.colorSpace = THREE.SRGBColorSpace;
  const saltMaterial = new THREE.MeshStandardMaterial({
    map: salt, transparent: true, opacity: .87, depthWrite: false, roughness: .96,
  });
  for (const [name, width, x, z, rotation] of [
    ['Seaward salt deposits', 5.2, 3.505, 16.7, Math.PI / 2],
    ['Salt on the wall end', .91, 3, 13.994, Math.PI],
    ['Salt on the descending return', 3.92, 7.24, 10.89, yaw + Math.PI],
  ]) {
    const deposits = new THREE.Mesh(new THREE.PlaneGeometry(width, 2.28), saltMaterial);
    deposits.name = name;
    const lowReturn = name === 'Salt on the descending return';
    if (lowReturn) deposits.scale.y = .34;
    deposits.position.set(x, lowReturn ? .48 : 1.19, z);
    deposits.rotation.y = rotation;
    deposits.userData.cast = false;
    context.G.add(deposits);
  }
}

function buildInlandRidge({ THREE, M, context }) {
  // The path faces the landmass behind the temple. Its slope closes glints of
  // distant water through the gate before the camera rounds the wall.
  const ground = new THREE.PlaneGeometry(360, 174, 72, 42).rotateX(-Math.PI / 2);
  const positions = ground.getAttribute('position');
  const colour = [];
  const grey = new THREE.Color(0x5d655e);
  const green = new THREE.Color(0x46544a);
  const tint = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const edge = Math.max(0, 1 - (Math.abs(x) / 180) ** 5)
      * Math.max(0, 1 - (Math.abs(z) / 87) ** 2);
    const ribs = .56 + .18 * Math.sin(x / 28 + z / 19)
      + .12 * Math.sin(x / 12 - z / 17) + .08 * Math.cos(x / 5 + z / 10);
    positions.setY(i, -5 + edge * (33 * ribs + 6 * Math.cos(z / 19)));
    tint.copy(grey).lerp(green, Math.max(0, Math.min(1, (ribs - .25) * 1.7)));
    colour.push(tint.r, tint.g, tint.b);
  }
  ground.setAttribute('color', new THREE.Float32BufferAttribute(colour, 3));
  ground.computeVertexNormals();
  const slope = new THREE.Mesh(ground, M(0xffffff, .98, { vertexColors: true }));
  slope.position.z = -106;
  slope.receiveShadow = true;
  slope.name = 'Inland temple ridge';
  context.G.add(slope);
}

const harbourLevel = -2.8;

function tideRockMaterial(material, grain = false) {
  const surface = material.clone();
  surface.customProgramCacheKey = () => `${material.customProgramCacheKey()}/tide-wet-${grain}`;
  surface.onBeforeCompile = (shader, renderer) => {
    material.onBeforeCompile(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTideRockWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n'
        + 'vTideRockWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const stoneGrain = grain ? `
      float tideBankHash(vec3 p) {
        p = fract(p * .1031);
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }
      float tideBankGrain(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3. - 2. * f);
        vec4 a = vec4(tideBankHash(i), tideBankHash(i + vec3(1,0,0)),
          tideBankHash(i + vec3(0,1,0)), tideBankHash(i + vec3(1,1,0)));
        vec4 b = vec4(tideBankHash(i + vec3(0,0,1)), tideBankHash(i + vec3(1,0,1)),
          tideBankHash(i + vec3(0,1,1)), tideBankHash(i + vec3(1,1,1)));
        vec4 layers = mix(a, b, f.z);
        return mix(mix(layers.x, layers.y, f.x), mix(layers.z, layers.w, f.x), f.y);
      }
    ` : '';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTideRockWorld;\n' + stoneGrain)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float tideVariation = sin(vTideRockWorld.x * 2.4 + vTideRockWorld.z * 1.8)
          * sin(vTideRockWorld.z * 3.1 - vTideRockWorld.x * 1.2);
        float stainTop = -2.16 + 0.22 * tideVariation
          + 0.16 * sin(vTideRockWorld.x * 0.73 - vTideRockWorld.z * 0.81);
        float tideDamp = 1.0 - smoothstep(stainTop - 0.28, stainTop + 0.36, vTideRockWorld.y);
        float dampGrain = 0.91 + 0.09 * tideVariation;
        diffuseColor.rgb *= mix(1.0, 0.54 * dampGrain, tideDamp);
        roughnessFactor = mix(roughnessFactor, min(roughnessFactor, 0.45), tideDamp * 0.88);
        ${grain ? `float exposed = tideBankGrain(vTideRockWorld * .19);
        float seams = tideBankGrain(vTideRockWorld * vec3(.93, 1.46, .87));
        float chipDetail = 1. - smoothstep(.22, .7, length(fwidth(vTideRockWorld)));
        float chips = tideBankGrain(vTideRockWorld * 3.1);
        float weathered = .78 + .36 * exposed + .13 * seams + .12 * chipDetail * (chips - .5);
        diffuseColor.rgb *= weathered;
        roughnessFactor = mix(roughnessFactor, .95, (1. - tideDamp) * seams * .5);` : ''}
      `);
  };
  return surface;
}

function buildShoreBank({ THREE, M, context }, edge, inland) {
  // Each section runs from below the rock armour through the same slope and
  // over the inland crest. The lower courses also supply the waterline.
  const toe = [[0, -3.86], [.48, -3.13], [1.2, -2.46], [2.35, -1.77],
    [3.72, -1.28], [6.1, -.3], [10.5, 1.72]];
  const upland = [15, 18, 22, 27, 32, 37, 43, 50, 58, 68, 82, 100];
  const rowCount = toe.length + upland.length;
  const positions = [], colours = [], faces = [];
  const dark = new THREE.Color(0x484d45), light = new THREE.Color(0x79776a);
  const scrub = new THREE.Color(0x53634e), tone = new THREE.Color();
  const steps = 7;
  for (let column = 0; column <= (edge.length - 1) * steps; column++) {
    const segment = Math.min(edge.length - 2, Math.floor(column / steps));
    const fraction = (column - segment * steps) / steps;
    const [a, b] = [edge[segment], edge[segment + 1]];
    const x = THREE.MathUtils.lerp(a[0], b[0], fraction);
    const shoreline = THREE.MathUtils.lerp(a[1], b[1], fraction);
    const head = Math.exp(-(((x - (inland > 0 ? 72 : 61)) / 25) ** 2));
    const back = Math.exp(-(((x - (inland > 0 ? 113 : 101)) / 27) ** 2));
    const relief = (inland > 0 ? 14 : 11) * (.27 + .73 * head + .46 * back);
    for (let row = 0; row < rowCount; row++) {
      const width = row < toe.length ? toe[row][0] : upland[row - toe.length];
      const rising = THREE.MathUtils.smoothstep(width, 13, 35);
      const receding = THREE.MathUtils.smoothstep(width, 38, 90);
      const height = row < toe.length ? toe[row][1] : 3.65 + rising * relief - receding * 9.3;
      const joint = Math.sin(x * 1.88 + row * 1.39) * Math.cos(x * .93 - row * 1.72);
      const jut = .34 * Math.sin(x * 1.31 + row * .58) + .18 * Math.cos(x * 2.93 + row * 1.91);
      const reliefDetail = .22 * joint + rising * (1 - receding)
        * (.51 * Math.sin(x * .25 + width * .34) + .43 * Math.sin(x * .15 - width * .48));
      positions.push(x + .19 * joint, height + reliefDetail,
        shoreline + inland * (width + jut));
      const cover = .44 + .29 * Math.sin(x * .084 + width * .116) * Math.cos(x * .23 - width * .27);
      tone.copy(dark).lerp(light, .54 + .20 * joint + .16 * Math.sin(x * .44 + width * .29));
      tone.lerp(scrub, THREE.MathUtils.smoothstep(width, 8, 25) * cover);
      colours.push(tone.r, tone.g, tone.b);
      if (column && row) {
        const d = column * rowCount + row, c = d - 1;
        const b = d - rowCount, a = b - 1;
        if (inland > 0) faces.push(a, b, c, b, d, c);
        else faces.push(a, c, b, b, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  const apron = new THREE.Mesh(geometry, tideRockMaterial(M(0xffffff, .91, { vertexColors: true }), true));
  apron.name = inland > 0 ? 'North harbour submerged rock apron' : 'South harbour submerged rock apron';
  apron.receiveShadow = true;
  context.G.add(apron);

  // Find the water crossing along each section of this same ground mesh.
  const waterline = [];
  const stride = rowCount * 3;
  for (let section = 0; section < positions.length; section += stride) {
    for (let below = section; below < section + stride - 3; below += 3) {
      const above = below + 3;
      if (positions[above + 1] < harbourLevel) continue;
      const t = (harbourLevel - positions[below + 1]) / (positions[above + 1] - positions[below + 1]);
      waterline.push([THREE.MathUtils.lerp(positions[below], positions[above], t),
        THREE.MathUtils.lerp(positions[below + 2], positions[above + 2], t)]);
      break;
    }
  }
  return waterline.sort((a, b) => a[0] - b[0]);
}

function buildFarHeadland({ THREE, M, context }, { name, x, z, width, depth, height, tint }) {
  const ground = new THREE.PlaneGeometry(width * 2, depth * 2, 46, 38).rotateX(-Math.PI / 2);
  const points = ground.getAttribute('position');
  const colours = [];
  const shade = new THREE.Color(tint), weathered = new THREE.Color(0x7a8585);
  const tone = new THREE.Color();
  for (let i = 0; i < points.count; i++) {
    const u = points.getX(i) / width, v = points.getZ(i) / depth;
    const shore = Math.max(0, 1 - (u * u + v * v));
    const ridge = 1 + .16 * Math.sin(u * 7 + v * 3) + .075 * Math.sin(v * 12 - u * 5);
    points.setY(i, -5.4 + height * shore ** 1.45 * ridge);
    tone.copy(shade).lerp(weathered, .20 + .13 * Math.sin(u * 5 - v * 2));
    colours.push(tone.r, tone.g, tone.b);
  }
  ground.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  ground.computeVertexNormals();
  const land = new THREE.Mesh(ground, M(0xffffff, .98, { vertexColors: true }));
  land.position.set(x, 0, z);
  land.name = name;
  context.G.add(land);
}

function harbourArmour(edge, side) {
  const stones = [];
  const variation = (n) => .5 + .5 * Math.sin(n * 2.399);
  // Stagger a row at the toe and a second on the low bank. The overlapping
  // stones have different aspect ratios and expose joints between faces.
  for (let segment = 1; segment < edge.length; segment++) {
    const [[x0, z0], [x1, z1]] = [edge[segment - 1], edge[segment]];
    const count = Math.ceil((x1 - x0) / 3.35);
    for (let i = 0; i < count; i++) {
      const seed = 27 * segment + 17 * i + (side > 0 ? 43 : 19);
      const t = (i + .26 + .48 * variation(seed)) / count;
      const x = x0 + t * (x1 - x0), toeZ = z0 + t * (z1 - z0);
      stones.push([x, toeZ + side * (1.26 + .38 * variation(seed + 5)), 1.32 + .62 * variation(seed + 1),
        1.02 + .85 * variation(seed + 3), .98 + .64 * variation(seed + 2), seed]);
      if (i % 2 === segment % 2) {
        stones.push([x + .81, toeZ + side * (3.7 + .63 * variation(seed + 6)), 1.44 + .46 * variation(seed + 2),
          1.53 + .72 * variation(seed + 8), 1.45 + .51 * variation(seed + 3), seed + 9]);
      }
    }
  }
  return stones;
}

function buildHarbour(h) {
  const { THREE, M, box, rock, context } = h;
  const southEdge = [[8, -28], [17, -24], [25, -18], [36, -12.2], [46, -7.2], [56, -3.6],
    [64, -.1], [71, 3.9], [77, 6.5], [80, 5.25], [86, .8], [92, -5.6], [104, -12], [119, -20], [137, -29]];
  const northEdge = [[8, 38], [18, 32], [27, 28.8], [37, 25.6], [47, 23.2], [57, 19.6],
    [64, 16.9], [72, 14.2], [79, 11], [82, 11.73], [88, 15.6], [94, 22.9], [108, 30], [124, 38], [141, 47]];
  const south = buildShoreBank(h, southEdge, -1);
  const north = buildShoreBank(h, northEdge, 1);
  buildFarHeadland(h, { name: 'South harbour far headland', x: 153, z: -52, width: 61, depth: 38, height: 27, tint: 0x687e80 });
  buildFarHeadland(h, { name: 'North harbour far headland', x: 168, z: 70, width: 72, depth: 49, height: 31, tint: 0x6b8086 });
  const stones = [
    ...harbourArmour(southEdge.slice(1, 7), -1),
    ...harbourArmour(northEdge.slice(1, 8), 1),
    [68, .7, 8, 2.65, 3.8, 17, '', -.16], [77, 3.9, 7.2, 2.7, 3.05, 21, 'South harbour tip', .12],
    [73, 17.8, 7.4, 2.9, 3.8, 24, '', .23], [79, 14.5, 8.3, 2.8, 3.3, 27, 'North harbour tip', -.15],
  ];
  const wetVariants = new Map();
  function wetMaterial(material) {
    if (!wetVariants.has(material)) wetVariants.set(material, tideRockMaterial(material));
    return wetVariants.get(material);
  }
  const bounds = new THREE.Box3();
  for (const [x, z, sx, sy, sz, seed, name, rotation] of stones) {
    const first = context.G.children.length;
    rock(x, -2.6, z, [sx, sy, sz], seed * 19);
    for (const object of context.G.children.slice(first)) {
      if (name) object.name = name;
      if (rotation !== undefined) object.rotation.y = rotation;
      // Hold the established tip silhouette while lowering each scanned foot
      // past sea level. The water can cut across the body rather than its base.
      bounds.setFromObject(object, true);
      const drownedFoot = harbourLevel - .66 - Math.min(.28, sy * .065);
      const height = bounds.max.y - bounds.min.y;
      if (height > .2 && bounds.min.y > drownedFoot) {
        const stretch = (bounds.max.y - drownedFoot) / height;
        object.scale.y *= stretch;
        object.position.y = bounds.max.y - (bounds.max.y - object.position.y) * stretch;
      }
      object.traverse((part) => {
        if (!part.isMesh || !part.material) return;
        part.material = Array.isArray(part.material) ? part.material.map(wetMaterial) : wetMaterial(part.material);
      });
    }
  }
  const quay = M(0x535e5a, .94, { map: h.pavingTex });
  box(15, 2.1, 3.1, quay, 30.5, -2.4, -17.7, -.4);
  box(13, 2.0, 3.2, quay, 28, -2.4, 32.6, .26);
  buildTideWater(h, { waterlines: [south, north], shoals: [
    [26, -22, 10.2, 6], [49, -8, 8.2, 4.9], [68, .7, 8.6, 4.5], [77, 3.9, 7.5, 3],
    [27, 34, 10.8, 5.1], [54, 24, 8.3, 4.4], [69, 20, 9.1, 4.2], [79, 14.5, 8.5, 3.3],
  ] });
}

export default function createPlace(h) {
  const { THREE, V3, M, roofMat, pave, hallB, peak, box, gateB, pauseBuild, pavingTex } = h;
  const wide = { pos: V3(-.96, 1.65, 2.4), look: V3(-1.02, 1.21, -2), fov: 42 };
  const widePhone = { pos: V3(-.914, 1.529, 1.928), look: V3(-.88, 1.26, -.12) };
  return {
    exposure: 1.14, shade: .32,
    sky: { top: 0x0b142b, horizon: 0x3d4c64, ground: 0x0d1521, sun: 0xcac1ac, dir: [.95, .13, -.5], glow: .6, clouds: .29, lit: 0x4d5f80, dark: 0x1c2339, stars: .62, disc: 0 },
    fog: [0x26364b, .004], sunL: [0xa0b3dd, .73], hemi: [0x596d94, 0x31333b, .67], bloom: [.7, .9], porch: [0xffba75, 100],
    day: { exposure: 1, sky: { top: 0x407bb9, horizon: 0xc8dce4, ground: 0x40545b, sun: 0xfff2dc, dir: [.6, .45, -.6], glow: .5, clouds: .29, lit: 0xf4f7ee, dark: 0xaabccc, disc: 4 }, fog: [0xb3cbd1, .003], sunL: [0xfff2e0, 2.2], hemi: [0xc5d3df, 0x646257, .9], bloom: [.35, 1.3] },
    verticalCameraDrift: 0,
    view: { pos: V3(0, 1.65, 31), look: V3(0, 1.5, 23), fov: 48 },
    viewPhone: { pos: V3(0, 1.65, 31), look: V3(0, 1.5, 23), fov: 52 },
    doors: V3(0, 1.62, 14),
    walk: [V3(0, 1.62, 25), V3(0, 1.62, 15), V3(1.2, 1.62, 10)],
    walkSeconds, createWalk,
    async build() {
      const { context, put, grainTex } = h;
      const granite = M(0x7b8079, .85, { map: pavingTex });
      const darkStone = M(0x606660, .93, { map: pavingTex });
      const tile = roofMat(0x394041);
      const wood = M(0x6b5842, .88, { map: grainTex });
      box(22, 5.4, 53, granite, 2, -2.7, 8.5);
      pave(2, 8.5, 21.8, 52.8, 0, granite);
      hallB({ z: -8, w: 13, d: 8, h: 3.8, wall: granite, roof: tile, base: .28, lift: .25, glow: .22 });
      gateB({ z: 4.2, w: 7, h: 3.55, wall: granite, roof: tile, lift: .19 });
      peak(-42, -7, -9, 40, 22, M(0x42534f, .98), 88, 1.4);
      buildInlandRidge(h);
      buildLane(h, granite, darkStone);
      buildHarbour(h);
      // A quay cap stays low in the seaward view and ends beside the sheltered nook.
      box(.57, .65, 11.7, granite, 12.58, .325, -.9);
      box(.72, .10, 11.8, darkStone, 12.58, .67, -.9);
      box(.53, .68, 18.8, granite, 12.55, .34, 24.8);
      box(.69, .10, 18.9, darkStone, 12.55, .68, 24.8);
      for (let i = 0; i < 7; i++) {
        const coil = new THREE.TorusGeometry(.22 + i * .028, .015, 6, 48).rotateX(-Math.PI / 2);
        put(coil, wood, 11.13, .142 + (i % 3) * .017, 13.14);
      }
      // This is a fixed quay light. The visitor's hood is the near light after the turn.
      const bracket = M(0x35332a, .92);
      box(.16, .34, .22, bracket, -2.55, 2.05, 20.2);
      box(.10, .14, .15, new THREE.MeshBasicMaterial({ color: 0xc6a16f }), -2.449, 2.06, 20.2);
      const practical = new THREE.PointLight(0xffbc75, 20, 8);
      practical.position.set(-2.35, 2.03, 20.2);
      context.G.add(practical);
      await pauseBuild();
    },
    nook: {
      at: { pos: V3(10, 0, 10), ry: -Math.PI / 2 },
      lamp: 'hood', y: 1.04, exposure: 1.09, bloom: [.43, .95],
      wide, widePhone,
      choose: { pos: V3(-.63, 1.43, 1.61), look: V3(-.13, 1.3, -.39), fov: 36 },
      choosePhone: { pos: V3(-.45, 1.50, 1.50), look: V3(-.267, 1.34, -.35) },
      async build(hh) {
        const { THREE, M, box, put, wallWithHoles, otherLamp, pavingTex, pauseBuild } = hh;
        const granite = M(0x797d74, .93, { map: pavingTex });
        const cap = M(0x555b55, .96, { map: pavingTex });
        const soot = M(0x343933, .98, { map: pavingTex });
        // A short screen shields the lamp without closing the view down the channel.
        box(1.86, .86, .61, granite, .45, .43, -.37);
        box(.65, .18, .84, cap, 0, .95, -.17);
        wallWithHoles({
          x0: -.28, x1: .33, y0: 1.03, y1: 1.67, z: .11, depth: .53, m: granite, uv: 1.2,
          holes: [{ x0: -.18, x1: .19, y0: 1.037, y1: 1.53, arch: true }],
        });
        box(.49, .62, .07, soot, .02, 1.34, -.45);
        box(.70, .09, .78, cap, .015, 1.69, -.16);
        put(new THREE.ConeGeometry(.49, .23, 4).rotateY(Math.PI / 4), cap, 0, 1.83, -.16);
        box(.54, .14, .63, cap, 1, .93, -.16);
        wallWithHoles({
          x0: .73, x1: 1.27, y0: 1.0, y1: 1.51, z: .07, depth: .44, m: granite, uv: 1.2,
          holes: [{ x0: .83, x1: 1.17, y0: 1.005, y1: 1.39, arch: true }],
        });
        box(.38, .46, .06, soot, 1, 1.23, -.38);
        put(new THREE.ConeGeometry(.43, .2, 4).rotateY(Math.PI / 4), cap, 1, 1.59, -.16);
        otherLamp('hood', 1, 1.0, -.15, .7, 0, .24);
        put(new THREE.CylinderGeometry(.11, .17, .50, 12), cap, 2.55, .37, -.85);
        await pauseBuild();
      },
    },
  };
}
