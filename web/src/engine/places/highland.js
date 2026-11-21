// High White Court: white walls and flat roofs under a wide sky, ridges far off.
import { HIGH_WHITE_NOOK, HIGH_WHITE_TRAVEL_SECONDS, highWhiteCameras } from './highland-camera.js';
import { buildHighWhiteRidges } from './highland-ridges.js';
import { fitHighWhiteChimneys, whitewash } from './highland-surfaces.js';

export default function createPlace(h) {
  const { THREE, V3, M, ground, box, wallWithHoles, plasterTex, pavingTex, grainTex, pauseBuild } = h;
  const cameras = highWhiteCameras(V3);
  function createWalk(start, end, phone) {
    const walk = cameras.createWalk(start, end, phone);
    return (progress, rig) => {
      walk(progress, rig);
      // The held entrance can drift more than a walking eye. Keep the small
      // start-of-walk sway within the height allowed above the raised paving.
      rig.amp *= .1;
    };
  }
  return {
    exposure: 1.05, shade: 0.3,
    sky: { top: 0x030716, horizon: 0x16223e, ground: 0x0e0c0c, sun: 0xdfe8ff, dir: [.35, .55, -.6], glow: .12, clouds: .08, lit: 0x2a3450, dark: 0x0a0e1c, stars: 1, disc: 1.6 },
    fog: [0x101a30, .0045], sunL: [0xb4c8ff, .9], hemi: [0x3a4c7a, 0x1a140e, .35], bloom: [.7, .8], porch: [0xffb860, 160],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: .9, sky: { top: 0x0b3d9e, horizon: 0x8ab6e6, ground: 0x6a5a48, sun: 0xfff4e4, dir: [.48, .78, .52], glow: .3, clouds: .3, lit: 0xffffff, dark: 0xc4d4ea, disc: 4 }, fog: [0xa9c6ea, .004], sunL: [0xfff4e4, 2.8], hemi: [0xd8e5f3, 0xa49377, .84], bloom: [.25, 2.2] },
    view: cameras.view, viewPhone: cameras.viewPhone,
    walkSeconds: HIGH_WHITE_TRAVEL_SECONDS, createWalk,
    walk: [], doors: V3(0, 1.66, 28),
    async build() {
      const C = h.context;
      const scan = M(0xffffff, .95, { map: plasterTex });
      const white = whitewash(THREE, scan, 0xece6db);
      const innerLime = whitewash(THREE, scan, 0xd5c9b7, 1.25);
      const cap = M(0x524f48, .92), paving = M(0x8b877c, .9, { map: pavingTex });
      const wood = M(0x53412d, .85, { map: grainTex });
      const rubbedStone = M(0x9a8974, .89, { map: pavingTex });
      // Keep the floor and entrance solids separate in the scene graph so
      // their true world bounds are available during camera review.
      function structure(name, size, position, material) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
        mesh.name = `High White ${name}`;
        mesh.position.set(...position);
        mesh.castShadow = mesh.receiveShadow = true;
        C.G.add(mesh);
      }
      ground(0x706954);
      structure('entrance paving', [4.2, .12, 26], [0, .06, 39], paving);
      structure('court paving', [33, .12, 32], [5, .02, 12], paving);
      // A thick plain entrance wall, with a deep recessed door rather than a ranked roof or ceremonial tower.
      structure('west jamb', [10.85, 2.8, .85], [-6.575, 1.4, 27.575], white);
      structure('east jamb', [23.85, 2.8, .85], [13.075, 1.4, 27.575], white);
      structure('lintel', [37, .8, .85], [6.5, 3.2, 27.575], white);
      box(37.4, .2, 1.05, cap, 6.5, 3.7, 27.6);
      for (const x of [-1.24, 1.24]) box(.18, 2.9, .18, wood, x, 1.45, 28.03);
      box(2.7, .2, .2, wood, 0, 2.9, 28.03);
      // The inner west pier extends into the court. Its sunlit return stays in
      // the edge of the crossing shot without moving or narrowing the opening.
      structure('west pier', [1.45, 3.24, 1.05], [-1.875, 1.62, 26.625], innerLime);
      box(1.55, .14, 1.12, cap, -1.90, 3.31, 26.62);
      box(1.45, .22, 1.05, rubbedStone, -1.872, .20, 26.626);
      structure('threshold stone', [2.3, .073, 1.92], [0, .0855, 27.19], rubbedStone);
      // A lower patch where the plaster has worn around the interior foot.
      for (const [index, length] of [.18, .24, .14, .19].entries()) {
        box(.006, .075 - index * .01, length, rubbedStone, -1.149, .30, 26.32 + index * .21);
      }
      // Courtyard boundaries and the north hall: small windows disappear into wall thickness.
      box(.7, 3.4, 30, white, -12, 1.7, 12.7); box(.9, .18, 30.2, cap, -12, 3.49, 12.7);
      box(.7, 3.4, 30, white, 25, 1.7, 12.7); box(.9, .18, 30.2, cap, 25, 3.49, 12.7);
      const holes = [{ x0: -1.2, x1: 1.2, y0: 0, y1: 2.65 }];
      for (const x of [-8, -4, 4, 8, 12]) holes.push({ x0: x - .36, x1: x + .36, y0: 2.0, y1: 3.0 });
      wallWithHoles({ x0: -11.5, x1: 14.5, y0: 0, y1: 4.5, z: -1, depth: .8, m: white, uv: .3, holes });
      box(26, 4.5, .7, white, 1.5, 2.25, -9); for (const x of [-11.5, 14.5]) box(.7, 4.5, 8, white, x, 2.25, -5);
      box(26.8, .28, 9, cap, 1.5, 4.64, -5); box(26.8, .16, 9, white, 1.5, 4.86, -5);
      const windowPaper = new THREE.MeshStandardMaterial({ color: 0x9d7952, emissive: 0xf0a054, emissiveIntensity: .03, roughness: .84 });
      C.up.push((_dt, _time, light) => { windowPaper.emissiveIntensity = .025 + .11 * light.lamp; });
      for (const x of [-8, -4, 4, 8, 12]) {
        box(.63, .89, .035, windowPaper, x, 2.5, -1.74);
        for (const side of [-1, 1]) {
          box(.075, .95, .1, wood, x + .317 * side, 2.5, -1.66);
          box(.68, .075, .1, wood, x, 2.5 + .44 * side, -1.66);
        }
        box(.034, .82, .045, wood, x, 2.5, -1.6);
        box(.59, .035, .045, wood, x, 2.48, -1.59);
        box(.88, .11, 1, rubbedStone, x, 1.955, -1.32);
      }
      // East wing: its southwest corner is the sheltered ledge built in the lamp frame below.
      box(9, 2.7, .6, white, 20.5, 1.35, 5.5); box(.6, 2.7, 9.3, white, 24.7, 1.35, 10.15);
      box(9.2, .2, 9.6, cap, 20.4, 2.8, 10.4); box(9.2, .12, 9.6, white, 20.4, 2.96, 10.4);
      box(.6, 2.7, 9.2, white, 16, 1.35, 10.1);
      box(4.0, 2.7, .6, white, 22.7, 1.35, 15.1);
      // Rounded coping stones, worn thresholds and sand collected along the walls ground the large blank plaster surfaces.
      for (let i=0;i<30;i++) box(.3+C.rnd()*.6,.02,.15+C.rnd()*.3,M(0x7d735f,1),-10.8+C.rnd()*34,.012,-.2+C.rnd()*.5);
      await pauseBuild();
      buildHighWhiteRidges({ THREE, context: C });
      await pauseBuild();
    },

    // The inside corner of two thick white walls, out of the wind. A stone ledge, the brass lamp under its glass.
    nook: {
      at: { pos: V3(...HIGH_WHITE_NOOK), ry: 0 },
      lamp: 'chimney', y: .92, exposure: 1.05, bloom: [.38, .98],
      wide: cameras.wide, widePhone: cameras.widePhone,
      choose: cameras.choose, choosePhone: cameras.choosePhone,
      async build(hh) {
        const { M, box, fall, otherLamp, plasterTex, pavingTex, grainTex, pauseBuild } = hh;
        const white = whitewash(THREE, M(0xffffff, .95, { map: plasterTex }), 0xdcd2c2);
        const cap = M(0x3a3836, .85), stoneM = M(0x7a766e, .85, { map: pavingTex }), wood = M(0x3a2618, .7, { map: grainTex });
        box(4.6, 2.7, .55, white, 2.0, 1.35, -.58); box(.55, 2.7, 3.4, white, -.58, 1.35, 1.1);
        box(4.7, .16, .65, cap, 2.0, 2.78, -.58); box(.65, .16, 3.4, cap, -.58, 2.78, 1.1);
        for (let x = .1; x < 4.2; x += .3) box(.08, .08, .14, wood, x, 2.58, -.26);
        // The ledge in the corner, worn smooth; another further along the wall.
        box(.64, .06, .52, stoneM, .02, .89, -.04); box(.6, .86, .08, stoneM, .02, .43, .18);
        box(.5, .05, .4, stoneM, 2.4, .89, -.1);
        otherLamp('chimney', 2.4, .92, -.1, .55);
        fitHighWhiteChimneys(THREE, hh.context);
        box(8, .16, 6, M(0x5e5a54, .9, { map: pavingTex }), 1.5, -.08, 2);
        await pauseBuild();
        fall({ n: 300, at: [1, 1.6, 2], box: [8, 3.4, 5], color: 0xe6e2da, size: .012, vy: .2, sway: .6, wind: 2.2, opacity: .5 });
        await pauseBuild();
      },
    },
  };
}
