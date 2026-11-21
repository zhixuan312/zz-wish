import { hermiteTrack } from './pine-walk-curve.js';

const bridgeCenter = 7.2;
const bridgeHalfLength = 11.5;
const bridgeHalfWidth = 1.7;
const waterHeight = .05;
const nookOrigin = [-3.55, .12, 7.2];
const walkSeconds = 27.6; // The procedural engine adds a 2.4 s hold at the chooser.

// The gaze turns downward before the stands enter the field of view. The
// reflection stays in frame until the camera clears the south end of the rail.
const waypoints = [
  { time: 4, pos: [.38, 1.72, 30], aim: [5.3, 1.7, 20], fov: 38 },
  { time: 9, pos: [3.15, 1.7, 23.3], aim: [4.1, .1, 17.6], fov: 40 },
  { time: 13, pos: [3.55, 1.7, 19.1], aim: [-.3, -1.05, 16.6], fov: 40 },
  { time: 15.9, pos: [1.25, 1.82, 18.35], aim: [-3.4, -3.13, 13.5], fov: 40, phoneFov: 41 },
  { time: 16.98, pos: [.03, 1.94, 17.66], aim: [-4.93, -3.71, 12.03], fov: 40, phoneFov: 41 },
  { time: 19.38, pos: [-.31, 1.985, 17.38], aim: [-5.33, -3.83, 11.66], fov: 40, phoneFov: 41 },
  { time: 21.7, pos: [-.63, 2.4, 14.4], aim: [-5.5, -3.45, 11.5], fov: 38, phoneFov: 40 },
  { time: 24.7, pos: [-.64, 2.64, 11.25], aim: [-6.0, .40, 11.4], fov: 48 },
];

function deckHeight(z) {
  const u = Math.min(1, Math.abs(z - bridgeCenter) / bridgeHalfLength);
  return .16 + .87 * Math.cos(Math.PI * u / 2) ** 1.2;
}

function buildBridge(THREE, put, box, granite) {
  // Trace the top and a shallow opening below it as one perimeter. The deck
  // and its two feet can then share a single continuous masonry surface.
  const shape = new THREE.Shape();
  const profile = Array.from({ length: 33 }, (_, index) => {
    const z = -bridgeHalfLength + index * bridgeHalfLength / 16;
    return [z, deckHeight(z + bridgeCenter)];
  });
  shape.moveTo(...profile[0]);
  for (const point of profile.slice(1)) shape.lineTo(...point);
  shape.lineTo(bridgeHalfLength, -.2);
  shape.lineTo(5.6, -.2);
  shape.quadraticCurveTo(0, 1.56, -5.6, -.2);
  shape.lineTo(-bridgeHalfLength, -.2);
  shape.closePath();
  const deck = new THREE.ExtrudeGeometry(shape, { depth: bridgeHalfWidth * 2, bevelEnabled: false });
  deck.translate(0, 0, -bridgeHalfWidth);
  deck.rotateY(-Math.PI / 2);
  put(deck, granite, 0, 0, bridgeCenter);

  function rail(side, posts) {
    const x = side * 1.55;
    const height = z => deckHeight(z) + .64;
    for (const z of posts) box(.22, .67, .26, granite, x, height(z) - .32, z);
    for (let i = 1; i < posts.length; i++) {
      const a = posts[i - 1], b = posts[i];
      const dy = height(b) - height(a);
      const cap = new THREE.BoxGeometry(.22, .095, Math.hypot(b - a, dy) + .14);
      cap.rotateX(-Math.atan2(dy, b - a));
      put(cap, granite, x, (height(a) + height(b)) / 2, (a + b) / 2);
    }
  }
  rail(1, [-1, 1.6, 4.4, 7.2, 10, 12.8, 15.6, 17.8]);
  rail(-1, [10.35, 11.65, 12.95, 14.2]);
}

function buildOldStands(THREE, put, box, stone, wax, paleWax, otherLamp) {
  const stands = [
    { x: -5.1, z: 10.5, height: .67, angle: .08, lit: true },
    { x: -5.7, z: 11.4, height: .83, angle: -.14 },
    { x: -5.25, z: 12.45, height: .61, angle: .23, lit: true },
  ];
  for (const { x, z, height, angle, lit } of stands) {
    box(.59, .37, .65, stone, x, .18, z, angle);
    put(new THREE.CylinderGeometry(.19, .24, height - .35, 8), stone, x, (height + .35) / 2, z);
    box(.76, .15, .70, stone, x, height, z, angle);
    const top = height + .075;
    if (lit) otherLamp('lotus', x, top, z, .22, angle, .27);
    for (const [dx, dz, h, material] of [
      [-.21, -.12, .033, wax], [.22, .13, .055, paleWax], [.11, -.19, .020, wax],
      ...(!lit ? [[-.06, .035, .061, paleWax]] : []),
    ]) {
      put(new THREE.CylinderGeometry(.035, .046, h, 10), material, x + dx, top + h / 2, z + dz);
    }
  }
}
export default function createPlace(h) {
  const { THREE, V3, M, roofMat, ground, pave, hallB, gateB, wallRun, trees, peak, water, lotus, box, put, otherLamp, plasterTex, pavingTex, pauseBuild } = h;
  const view = { pos: V3(1.45, 1.74, 36.6), look: V3(6.3, 1.7, 24), fov: 38 };
  const viewPhone = { ...view, fov: 44 };
  const local = (x, y, z) => V3(nookOrigin[2] - z, y - nookOrigin[1], x - nookOrigin[0]);
  const seated = {
    pos: local(-.95, 2.57, 8.38),
    look: local(-3.65, .03, 7.2),
    fov: 39,
  };
  const portraitSeat = {
    look: local(-3.70, -.10, 7.13),
    pos: local(-.58, 2.58, 9.82),
  };
  // Invert the procedural portrait pullback. The chooser's additional tilt
  // remains in effect so both the lamp and its reflection clear the sheet.
  portraitSeat.pos.lerp(portraitSeat.look, 1 - 1 / 1.45);

  function createWalk(start, arrival, phone) {
    const look = arrival.look.clone();
    if (phone) look.y -= arrival.pos.distanceTo(look) * .10;
    const times = [0, ...waypoints.map(point => point.time), walkSeconds, walkSeconds + .01];
    const positions = [start.pos.toArray(), ...waypoints.map(point => point.pos), arrival.pos.toArray(), arrival.pos.toArray()];
    const looks = [start.look.toArray(), ...waypoints.map(point => point.aim), look.toArray(), look.toArray()];
    const fovs = [start.fov, ...waypoints.map(point => phone ? point.phoneFov ?? point.fov + 4 : point.fov), phone ? 44 : seated.fov, phone ? 44 : seated.fov];
    const positionAt = hermiteTrack(times, positions);
    const lookAt = hermiteTrack(times, looks);
    const fovAt = hermiteTrack(times, fovs.map(fov => [fov]));
    let entranceDrift;
    return (progress, rig) => {
      entranceDrift ??= rig.amp;
      const time = progress * walkSeconds;
      rig.pos.fromArray(positionAt(time));
      rig.look.fromArray(lookAt(time));
      rig.fov = fovAt(time)[0];
      rig.amp = entranceDrift * (1 - THREE.MathUtils.smoothstep(time, 0, 4));
    };
  }

  return {
    exposure: 1.1, shade: 0.3,
    sky: { top: 0x070c16, horizon: 0x26303e, ground: 0x0c1016, sun: 0xe8eef8, dir: [-1, .12, -.45], glow: .35, clouds: .45, lit: 0x4a5464, dark: 0x101620, stars: .35, disc: 1.5 },
    fog: [0x1a222e, .012], sunL: [0xbccce6, .6], hemi: [0x3a4a62, 0x0e1014, .32], bloom: [.75, .82], porch: [0xffa04a, 55],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: 1, sky: { top: 0x5c6ea2, horizon: 0xf6c4aa, ground: 0x3a4a5a, sun: 0xffd2a0, dir: [-1, .07, -.45], glow: 1.1, clouds: .4, lit: 0xffd4c0, dark: 0x8a7a98 }, fog: [0xe0bcb2, .009], sunL: [0xffc8a0, 1.9], hemi: [0xa8b0d8, 0x504040, .75], bloom: [.5, 1.1] },
    view, viewPhone, walkSeconds, createWalk,
    walk: [], doors: V3(0, 1.7, 30),
    async build() {
      const C = h.context;
      const white = M(0xe2e0d6, .94, { map: plasterTex }), grey = roofMat(0x41464a), granite = M(0x96958b, .86, { map: pavingTex });
      ground(0x273b2a);
      pave(0, 40, 5, 26, 0, granite); pave(0, 24, 30, 12, 0, granite);
      pave(0, 18.25, 3.55, 1.9, 0, granite);
      for (const [x, z, width, depth] of [[0, -3, 29, 1], [-8.25, 17.5, 13, 1], [8.25, 17.5, 13, 1], [-14.5, 7.2, 1, 21], [14.5, 7.2, 1, 21]]) {
        box(width, .7, depth, granite, x, -.1, z);
      }
      water(waterHeight, 0x132923, { geo: new THREE.PlaneGeometry(28, 20), z: 7.2, reflect: true });
      lotus(-13.5, -7.5, -2, 16.5, .08, 34);
      lotus(2.7, 13.5, -2, 16.5, .08, 46);
      buildBridge(THREE, put, box, granite);
      const standStone = M(0x77786c, .88, { map: pavingTex });
      buildOldStands(THREE, put, box, standStone, M(0x823b32, .72), M(0xc5a67a, .7), otherLamp);
      // White plaster courts, low dark roofs, no ceremonial yellow or ranked roof stack.
      gateB({ z: 30, w: 8, h: 3.8, wall: white, roof: grey, lift: .2 });
      for (const side of [-1, 1]) {
        wallRun(side * 4, 30, side * 19, 30, 2.6, white, grey);
        wallRun(side * 19, 30, side * 19, -19, 2.6, white, grey);
        hallB({ x: side * 18, z: 5, w: 5.2, d: 16, h: 3, wall: white, roof: grey, base: .25, lift: .2, glow: .12 });
      }
      hallB({ z: -12, w: 19, d: 6.5, h: 3.4, wall: white, roof: grey, base: .4, lift: .24, glow: .22 });
      await pauseBuild();
      const T = trees();
      for (let i = 0; i < 36; i++) { const side = i % 2 ? -1 : 1; T.broad(side * (22 + C.rnd() * 24), 0, -28 + C.rnd() * 75, 1.1 + C.rnd(), 0x294332); }
      T.finish(); await pauseBuild();
      peak(-110, -20, -170, 90, 65, M(0x344239, 1), 12, .7);
      peak(120, -20, -220, 110, 85, M(0x2f3b39, 1), 18, .7);
      await pauseBuild();
    },

    // A pale stone rail at the pond's edge; the lamp sits on the rail and burns twice, once in the water.
    nook: {
      at: { pos: V3(...nookOrigin), ry: Math.PI / 2 },
      lamp: 'lotus', y: .78, exposure: 1.1, bloom: [.42, .95],
      wide: seated, burn: seated, widePhone: portraitSeat, choosePhone: portraitSeat, burnPhone: portraitSeat,
      async build(hh) {
        const { THREE, M, box, put, pavingTex, pauseBuild } = hh;
        const pale = M(0xc9c1b2, .76, { map: pavingTex });
        // The cantilever is below the chooser's sightline. Its side braces
        // leave the view of open water beneath the candle clear.
        for (const x of [-.88, .88]) {
          box(.145, .14, 1.88, pale, x, .55, .91);
          const brace = new THREE.BoxGeometry(.13, .98, .13);
          brace.rotateX(-.88);
          put(brace, pale, x, .31, 1.45);
        }
        box(1.98, .105, .23, pale, 0, .56, 0);
        box(.235, .17, .16, pale, 0, .695, 0);
        await pauseBuild();
      },
    },
  };
}
