import { BELL, LAMP, TREE, TURN_SECONDS, WALK_SECONDS, WINDOW, bellLaneCameras } from './bell-lane-camera.js';
import { addBellLaneTree } from './bell-lane-tree.js';
import { addBellLaneOilCup, makeBellLaneOilBowl } from './bell-lane-oil.js';
import { BELL_LANE_CUPS } from './bell-lane-cups.ts';
import { addBellLaneWishTag } from './bell-lane-wish-tag.js';
import { bellLaneLocalHour, bellLaneShutterOffset, bellLaneShutterOpening } from './bell-lane-dawn.ts';

// An invented neighbourhood temple: a lit shop lane, one low door, a tree and a small bell court.
export default function createPlace(h) {
  const { THREE, V3, M, ground, box, put, wallWithHoles, eave, col, otherLamp,
    brickTex, plasterTex, grainTex, pavingTex, latticeTex, pauseBuild, lathe, liveFlame, unlitLattice } = h;
  const cameras = bellLaneCameras(V3);
  const gateHalfWidth = 1.16;
  const taperSource = V3(-1.47, .658, .092);
  const makeCup = (group, clay, baseY) => addBellLaneOilCup(h, group, clay, baseY);
  return {
    exposure: 1.12, shade: .32,
    sky: { top: 0x080d19, horizon: 0x282c38, ground: 0x0b0e15, sun: 0xe0e4ee, dir: [-.7, .5, .35], glow: .12, clouds: .3, lit: 0x424e65, dark: 0x11141c, stars: .35, disc: 1.2 },
    fog: [0x1b2230, .007], sunL: [0xc1cce4, .48], hemi: [0x424f69, 0x15140f, .35], bloom: [.45, 1.05], porch: [0xffb46a, 2.4],
    day: { exposure: 1, sky: { top: 0x6489ba, horizon: 0xe5dcc8, ground: 0x685f52, sun: 0xffe6bf, dir: [-.7, 1.65, .35], glow: .4, clouds: .25, lit: 0xfff2e0, dark: 0x8d9aaf }, fog: [0xc9c6bd, .004], sunL: [0xffe3b5, 2], hemi: [0xc2d5e8, 0x4c4539, .85], bloom: [.25, 1.4] },
    sunDirectionAt(date, { n, elev }) {
      const hour = date.getHours() + date.getMinutes() / 60
        + (date.getSeconds() + date.getMilliseconds() / 1000) / 3600;
      // Cross above the lane around noon. Keep the morning side light and the westward
      // afternoon direction that carries the tree's shadow to the bell pavilion.
      const west = THREE.MathUtils.smoothstep(hour, 10.5, 13.5);
      return [
        THREE.MathUtils.lerp(THREE.MathUtils.lerp(.70, -.70, west), -.70, n),
        THREE.MathUtils.lerp(Math.max(.02, 1.65 * elev), .50, n),
        .35,
      ];
    },
    view: cameras.view, viewPhone: cameras.viewPhone,
    walk: [], doors: V3(0, 1.66, 10),
    walkSeconds: WALK_SECONDS, createWalk: cameras.createWalk,
    arrivalSeconds: TURN_SECONDS, createArrival: cameras.createArrival,
    async build() {
      const C = h.context, wall = M(0x6b6c6d, .97, { map: brickTex }), wood = M(0x3b271b, .85, { map: grainTex }), paper = M(0xb7aa8c, .96), stone = M(0x59595a, .9, { map: pavingTex });
      const shutters = [];
      ground(0x444546, { mat: { map: pavingTex } }); box(7.6, .06, 48, stone, 0, .03, 34);
      // Two irregular rows of small shops make an enclosed, human-scale lane rather than an avenue to a palace.
      for (let i = 0; i < 7; i++) for (const side of [-1, 1]) {
        const landmark = side === 1 && i === 0;
        const z = 14 + i * 6, ht = 3.2 + (i % 3) * .32;
        const face = landmark ? WINDOW[0] : side * (3.9 + (i % 2) * .16);
        const shade = M(i % 3 === 0 ? 0x6a645a : 0x767574, .95, { map: i % 3 === 0 ? plasterTex : brickTex });
        const wallX = face + side * 1.73, windowZ = landmark ? WINDOW[2] : z, windowY = landmark ? WINDOW[1] : 1.55;
        const width = landmark ? 2.65 : 3.8;
        const frame = landmark ? M(0x385e60, .91, { map: grainTex }) : wood;
        box(3.4, ht, 5.8, shade, wallX, ht / 2, z);
        // The east corner shop is the window visible again through the door.
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(width, 1.38), new THREE.MeshStandardMaterial({
          color: landmark ? 0xcead79 : 0x80694d, map: latticeTex,
          emissive: 0xffb76b, emissiveMap: latticeTex, roughness: .9,
        }));
        pane.position.set(face, windowY, windowZ);
        pane.rotation.y = -side * Math.PI / 2;
        if (landmark) pane.name = 'Bell Lane east shop window';
        C.G.add(pane);
        const sill = landmark ? M(0x854630, .94, { map: grainTex }) : frame;
        box(.22, .12, width + .26, sill, face - side * .08, windowY - .72, windowZ);
        box(.13, .10, width + .20, frame, face - side * .04, windowY + .72, windowZ);
        for (const dz of [-.50, -.17, .17, .50]) box(.12, 1.48, .075, frame, face - side * .045, windowY, windowZ + dz * width);
        box(.11, landmark ? 1.48 : 2.6, landmark ? .50 : .52, frame, face - side * .11,
          landmark ? windowY : 1.3, landmark ? windowZ - 1.57 : z + 2.54, landmark ? -.45 : 0);
        if (landmark) {
          for (let j = 0; j < 7; j++) box(.07, .037, .42, sill, face - .20, .94 + j * .16, windowZ - 1.55, -.45);
        } else if (i >= 2 && i % 2 === 0) {
          // These leaves are up the lane beyond the seated view. They keep the
          // landmark recognizable when the rest of the street closes for the night.
          const leafSize = width / 2 - .018;
          for (const hinge of [-1, 1]) {
            const pivot = new THREE.Group();
            pivot.position.set(face - side * .06, windowY, windowZ + hinge * width / 2);
            const leaf = new THREE.Mesh(new THREE.BoxGeometry(.05, 1.37, leafSize), wood);
            leaf.position.z = -hinge * leafSize / 2;
            leaf.castShadow = leaf.receiveShadow = true;
            pivot.add(leaf);
            C.G.add(pivot);
            shutters.push({ pivot, sign: side * hinge, timeOffset: bellLaneShutterOffset(i, side) });
          }
        }
        const canopy = landmark ? 4.12 : 3.7;
        box(canopy, .21, 6.06, h.roofMat(0x3f4244), wallX - side * .30, ht + .12, z);
        // An uneven overhang with exposed joist ends catches the shop glow.
        box(.6, .12, 5.8, wood, face - side * .2, 2.68, z);
        for (let q = 0; q < 6; q++) box(.62, .065, .055, wood, face - side * .2, 2.62, z - 2.4 + q * .9);
        // One practical light marks the way home. Wall-facing windows give the other shops their glow.
        const lamp = landmark ? new THREE.PointLight(0xffb66c, 0, 6, 2) : null;
        if (lamp) {
          lamp.position.set(face - .36, 1.74, windowZ);
          C.G.add(lamp);
        }
        const setWindowLight = light => {
          pane.material.emissiveIntensity = landmark ? .045 + 1.30 * light.lamp : .012 + light.lamp * (.12 + (i % 4) * .035);
          if (lamp) lamp.intensity = .25 + 3.2 * light.lamp;
        };
        setWindowLight(C.light);
        C.up.push((_dt, _t, light) => setWindowLight(light));
        // A low counter and baskets beside the doorway, all grounded.
        if (!landmark) box(.46, .65, 1.4, wood, face - side * .3, .325, z - 1.2);
        put(new THREE.CylinderGeometry(.2, .16, .28, 24, 1, true), paper, face - side * .32, .14, z + 1.6);
        if (!landmark && i % 2 === 0) { const sign = new THREE.Mesh(new THREE.PlaneGeometry(.38, 1.1), M(0x6e3220, .97, { side: THREE.DoubleSide })); sign.position.set(face - side * .45, 2.1, z + 2.2); sign.rotation.y = -.35 * side; C.G.add(sign); }
      }
      await pauseBuild();
      // The wall is solid across the lane except for this one door.
      wallWithHoles({ x0: -6.3, x1: 6.3, y0: 0, y1: 3.05, z: 10, depth: .55, m: wall, uv: .75,
        holes: [{ x0: -gateHalfWidth, x1: gateHalfWidth, y0: 0, y1: 2.28 }] });
      box(2.44, .17, .68, wood, 0, 2.37, 9.75);
      box(2.31, .065, .75, stone, 0, .0325, 9.73);
      for (const x of [-1.20, 1.20]) box(.14, 2.28, .60, wood, x, 1.14, 9.73);
      // The open leaf sits outside the opening and does not block the return sightline.
      box(.085, 2.12, 1.11, wood, -1.29, 1.08, 8.83, -.075);
      for (const y of [.36, 1.73]) box(.13, .075, 1.04, M(0x47433b, .76, { metalness: .52 }), -1.29, y, 8.83, -.075);
      eave({ x0: -6.5, x1: 6.5, y: 3.06, z: 10.45, depth: 1.3, rise: .3, tile: 0x34383d });
      box(.27, .33, .20, wood, -1.65, 2.16, 10.12);
      box(.19, .23, .025, M(0xc9a678, .88, { emissive: 0xfda350, emissiveIntensity: .42 }), -1.65, 2.16, 10.23);
      const thresholdLight = new THREE.PointLight(0xffbb82, 2.3, 5.8, 2);
      thresholdLight.position.set(-1.57, 2.17, 10.43); C.G.add(thresholdLight);
      // Narrow drains and a few patched paving slabs carry the view all the way to the door.
      for (const x of [-3.45, 3.45]) box(.12, .008, 48, M(0x25282b, .95), x, .067, 34);
      for (let i = 0; i < 12; i++) box(.4 + C.rnd() * .35, .008, .6, M(0x6b6a65, .94, { map: pavingTex }), (C.rnd() - .5) * 5, .067, 14 + C.rnd() * 40);

      const floor = M(0x8c8174, .94, { map: pavingTex });
      box(12.6, .12, 22.6, floor, 0, -.045, -1.35);
      for (const x of [-6.3, 6.3]) {
        box(.5, 3.05, 22.6, wall, x, 1.525, -1.35);
        box(.69, .18, 22.6, h.roofMat(0x3f4144), x, 3.12, -1.35);
        for (const z of [-10, -5, 0, 5]) box(.53, 4.25, 4.8, shadeWall(M, plasterTex), x * 1.11, 2.08, z);
      }
      box(12.6, 3.05, .5, wall, 0, 1.525, -12.55);
      box(12.8, .13, .66, h.roofMat(0x36383b), 0, 3.12, -12.55);
      for (const x of [-4.2, 3.8]) {
        box(5.1, 4.8, 3.3, M(0x756b60, .97, { map: plasterTex }), x, 2.4, -14.3);
        eave({ x0: x - 2.62, x1: x + 2.62, y: 4.8, z: -12.5, depth: 1.92, rise: .65, tile: 0x454544 });
      }

      const [bellX, , bellZ] = BELL;
      const red = M(0x673b2b, .9, { map: grainTex });
      box(4.12, .28, 3.32, stone, bellX, .14, bellZ);
      box(3.8, .13, .35, stone, bellX, .065, bellZ + 1.75);
      box(3.8, .13, .30, stone, bellX, .19, bellZ + 1.59);
      for (const x of [-1.62, 1.62]) for (const dz of [-1.29, 1.29]) col(bellX + x, bellZ + dz, 2.43, .12, red, .28);
      for (const dz of [-1.29, 1.29]) box(3.57, .21, .17, wood, bellX, 2.69, bellZ + dz);
      box(.17, .23, 2.91, wood, bellX, 2.61, bellZ);
      const bronze = M(0x564830, .56, { metalness: .78 });
      put(new THREE.CylinderGeometry(.021, .021, .19, 12), bronze, bellX, 2.42, bellZ);
      const bellBody = lathe([[.40, 0], [.414, .018], [.403, .074], [.36, .23], [.287, .65],
        [.251, .82], [.173, .94], [.045, .96], [0, .95], [0, .915], [.156, .912],
        [.221, .819], [.264, .649], [.341, .21], [.382, .064], [.38, .016], [.40, 0]], 48);
      put(bellBody, bronze, bellX, 1.36, bellZ);
      for (const [radius, y] of [[.405, 1.397], [.362, 1.584], [.273, 2.055]]) {
        put(new THREE.TorusGeometry(radius, .009, 7, 44).rotateX(Math.PI / 2), bronze, bellX, y, bellZ);
      }
      box(.105, .095, 1.24, wood, bellX + .99, 1.53, bellZ);
      for (const dz of [-.42, .42]) put(new THREE.CylinderGeometry(.007, .007, 1.13, 8), bronze, bellX + .99, 2.08, bellZ + dz);
      const roofDepth = 1.86, roofRise = .66;
      eave({ x0: bellX - 2.2, x1: bellX + 2.2, y: 2.82, z: bellZ + roofDepth, depth: roofDepth, rise: roofRise, tile: 0x3b3d42 });
      const roof = new THREE.BoxGeometry(4.43, .11, Math.hypot(roofRise, roofDepth));
      roof.rotateX(-Math.atan2(roofRise, roofDepth));
      put(roof, h.roofMat(0x3b3d42), bellX, 3.02 + roofRise / 2, bellZ - roofDepth / 2);
      box(4.48, .13, .13, wood, bellX, 3.02 + roofRise, bellZ);

      addBellLaneTree(h, TREE);
      box(1.18, .10, .38, stone, -2.54, .44, 2.22);
      for (const x of [-2.96, -2.12]) box(.19, .40, .28, wall, x, .20, 2.22);
      const courtFill = new THREE.PointLight(0xffc48a, 0, 13, 2);
      courtFill.position.set(-2.3, 2.6, 8.7); C.G.add(courtFill);
      C.up.push((_dt, _t, light) => { courtFill.intensity = .4 + light.n * 5; });
      // A broom and sweep pile sit under the west eave before anyone opens.
      const brush = new THREE.ConeGeometry(.081, .25, 14);
      brush.rotateZ(-.18);
      put(brush, M(0x9b855f, .99), -3.49, .14, 23.4);
      const stick = new THREE.CylinderGeometry(.016, .019, 1.13, 10);
      stick.rotateZ(-.18);
      put(stick, wood, -3.60, .68, 23.4);
      const setLocalTime = () => {
        const hour = bellLaneLocalHour(new Date());
        for (const { pivot, sign, timeOffset } of shutters) {
          const open = bellLaneShutterOpening(hour + timeOffset);
          pivot.rotation.y = sign * open * (Math.PI * .97);
        }
      };
      setLocalTime();
      C.up.push(setLocalTime);
      await pauseBuild();
    },
    nook: {
      at: { pos: V3(...LAMP), ry: 0 }, lamp: 'lattice', y: .46, exposure: 1.1, bloom: [.35, 1.02],
      makeVisitorCup: makeCup,
      makeVisitorWishTag: lamp => addBellLaneWishTag(h, lamp),
      // The two most recent lamps flank the current lamp within the seated phone view.
      // The remaining slots are farther back on the same shelf.
      pastLampSlots: [[.318, .46, .205, .47, .14], [-.205, .46, .075, .45, .27],
        [.59, .46, .205, .38, -.16], [-.61, .46, .202, .38, .13]],
      makePastLamp: lamp => unlitLattice(lamp, makeCup),
      explicitPhoneViews: true, wide: cameras.wide, widePhone: cameras.widePhone,
      choose: cameras.choose, choosePhone: cameras.choosePhone, taperSource,
      async build() {
        const wood = M(0x6a4732, .93, { map: grainTex });
        const edge = M(0x574333, .95, { map: grainTex });
        const tag = M(0x9b7552, .96);
        const clay = M(0x9d623f, .84);
        // Keep the center for the current lamp and leave room among the older lamps.
        box(2.11, .09, .56, wood, 0, .415, 0);
        for (const x of [-.94, .94]) for (const z of [-.21, .21]) box(.085, .37, .081, edge, x, .185, z);
        box(1.85, .09, .29, edge, 0, .18, 0);
        const darkLamps = [[-.79, .01, -.1, .52, 0x69533e], [.42, .055, -.21, .52, 0x826648],
          [.76, .02, .3, .52, 0x604a39], [.62, -.154, .10, .38, 0x73523b], [-.66, -.163, -.24, .39, 0x756359]];
        darkLamps.forEach(([x, z, yaw, scale, color], i) => {
          const lamp = unlitLattice({ color }, makeCup);
          lamp.name = `Bell Lane old lamp ${i + 1}`;
          lamp.position.set(x, .46, z);
          lamp.rotation.y = yaw;
          lamp.scale.setScalar(scale);
          h.context.G.add(lamp);
        });
        const other = otherLamp('lattice', -.44, .46, .055, .55, .13, .31);
        other.g.name = 'Bell Lane old lamp 6';
        other.g.scale.setScalar(.52);
        other.p.shells[0].color.setHex(0x88603d);
        // The two matching bowls sit on a small ledge beside the central lamp, within both seated views.
        const cupLedgeY = .912, cupLedgeZ = .139;
        box(.206, .018, .105, wood, .359, cupLedgeY - .009, cupLedgeZ);
        box(.331, .018, .024, edge, .2685, cupLedgeY - .028, .11);
        BELL_LANE_CUPS.forEach(({ id, color, roughness }, i) => {
          const bowl = makeBellLaneOilBowl(h, M(color, roughness), -.010);
          bowl.name = `Bell Lane rack oil cup ${id}`;
          bowl.userData.cupId = id;
          bowl.position.set(.31 + .099 * i, cupLedgeY, cupLedgeZ);
          h.context.G.add(bowl);
        });
        // Taper and tag supplies stay on the side table.
        box(.56, .065, .42, wood, -1.57, .58, .18);
        for (const x of [-1.79, -1.35]) box(.061, .55, .28, edge, x, .275, .18);
        const cup = lathe([[0, 0], [.038, 0], [.057, .034], [.051, .034], [.032, .011], [0, .011]], 28);
        box(.15, .012, .083, tag, -1.39, .625, .24, .08);
        box(.24, .008, .008, tag, -1.52, .63, .31, .21);
        put(cup, clay, -1.47, .615, .092);
        liveFlame(taperSource.x, taperSource.y, taperSource.z, { size: .53, power: .48 });
        const broom = new THREE.CylinderGeometry(.017, .019, 1.24, 10);
        broom.rotateZ(.19);
        put(broom, edge, -2.24, .67, .39);
        const straw = new THREE.ConeGeometry(.082, .28, 13);
        straw.rotateZ(.19);
        put(straw, tag, -2.12, .16, .39);
        await pauseBuild();
      },
    },
  };
}

function shadeWall(M, plasterTex) {
  return M(0x706c63, .97, { map: plasterTex });
}
