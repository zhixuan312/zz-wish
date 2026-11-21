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

function buildHarbour(h) {
  const { M, box, peak, rock, context } = h;
  const shore = M(0x394b4b, .94);
  const distant = M(0x586d72, 1);
  // Overlapping rocks carry the two shoulders to a narrow, open channel.
  peak(71, -5.6, -30, 32, 18, shore, 17, .84);
  peak(78, -5.4, 45, 32, 23, shore, 69, .83);
  peak(96, -6, -62, 48, 29, distant, 57, .93);
  peak(113, -6, 78, 50, 37, distant, 31, .94);
  const stones = [
    [26, -22, 12, 4.2, 6, 1], [38, -14, 10, 3.4, 5, 2],
    [49, -8, 9, 2.8, 4.1, 3], [61, -4.5, 8, 2.5, 4, 5],
    [68, .7, 8, 2.65, 3.8, 17, '', -.16], [77, 3.9, 7.2, 2.7, 3.05, 21, 'South harbour tip', .12],
    [27, 34, 13, 4.9, 5.2, 6], [42, 29, 10, 4.0, 4.4, 8],
    [54, 24, 9.5, 3.2, 4, 10], [67, 20.4, 8, 2.9, 4, 12],
    [73, 17.8, 7.4, 2.9, 3.8, 24, '', .23], [79, 14.5, 8.3, 2.8, 3.3, 27, 'North harbour tip', -.15],
  ];
  for (const [x, z, sx, sy, sz, seed, name, rotation] of stones) {
    const first = context.G.children.length;
    rock(x, -2.6, z, [sx, sy, sz], seed * 19);
    for (const object of context.G.children.slice(first)) {
      if (name) object.name = name;
      if (rotation !== undefined) object.rotation.y = rotation;
    }
  }
  const quay = M(0x535e5a, .94, { map: h.pavingTex });
  box(15, 2.1, 3.1, quay, 30.5, -2.4, -17.7, -.4);
  box(13, 2.0, 3.2, quay, 28, -2.4, 32.6, .26);
  buildTideWater(h, { shoals: [
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
