// An invented valley court, one old brick pagoda and the stream beyond its eastern wall.
import {
  createValleyPagodaCamera, FOREGROUND_PINES, GATE_Z, STREAM_X,
  TABLE_CENTER, TOWER_BASE_RADIUS, TOWER_CENTER, WALK_SECONDS,
} from './valley-pagoda-camera.js';

export default function createPlace(h) {
  const { THREE, V3, M, ground, water, box, put, wallWithHoles, eave, trees, rock, peak, mist, otherLamp, pavingTex, brickTex, grainTex, pauseBuild } = h;
  const cameras = createValleyPagodaCamera(THREE, V3);
  const [tableX, , tableZ] = TABLE_CENTER;
  const towerZ = TOWER_CENTER[2];

  return {
    exposure: 1.12, shade: .32,
    sky: { top: 0x080d18, horizon: 0x263044, ground: 0x0c1119, sun: 0xdce4f4, dir: [-.35, .6, -.25], glow: .1, clouds: .65, lit: 0x424e65, dark: 0x121924, stars: .2, disc: .7 },
    fog: [0x1c2737, .009], sunL: [0xb8c9e5, .55], hemi: [0x3e516d, 0x131914, .34], bloom: [.48, 1.05], porch: [0xffa65c, 5],
    day: { exposure: 1, sky: { top: 0x5c7b9e, horizon: 0xd6dfdb, ground: 0x53604f, sun: 0xffe6c0, dir: [-.35, .6, -.25], glow: .35, clouds: .55, lit: 0xffeee0, dark: 0x83989d }, fog: [0xa5b8b5, .006], sunL: [0xffe7c8, 1.8], hemi: [0xc5dce5, 0x42523e, .85], bloom: [.25, 1.4] },
    view: cameras.view,
    viewPhone: cameras.viewPhone,
    walkSeconds: WALK_SECONDS,
    createWalk: cameras.createWalk,
    walk: [V3(0, 1.66, GATE_Z), V3(4.2, 1.66, towerZ), V3(5.9, 1.66, -16.65)],
    doors: V3(0, 1.4, GATE_Z),
    async build() {
      const C = h.context;
      const wall = M(0x66645c, .97, { map: brickTex });
      const wood = M(0x3b291c, .9, { map: grainTex });
      const paving = M(0x72716a, .95, { map: pavingTex });
      const bank = M(0x4e5548, .98);
      ground(0x394639, { y: -.8 });
      box(23, .8, 67, bank, -.7, -.4, 11);
      box(22, .8, 13.5, bank, -1.1, -.4, -27);
      box(3, .07, 32, paving, 0, .035, 33.8);

      // The existing gate is the narrow point between the two wooded stretches.
      wallWithHoles({ x0: -11.5, x1: 10.8, y0: 0, y1: 2.6, z: GATE_Z, depth: .65, m: wall, uv: .55, holes: [{ x0: -1.25, x1: 1.25, y0: 0, y1: 2.6 }] });
      for (const x of [-1.4, 1.4]) box(.23, 2.7, .8, wood, x, 1.35, 17.85);
      box(3.2, .2, .8, wood, 0, 2.78, 17.85);
      eave({ x0: -2, x1: 2, y: 2.85, z: 18.5, depth: 1.4, rise: .5, tile: 0x343d40 });
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.48, .075), wood);
      leaf.position.set(-1.24, 1.24, 17.35);
      leaf.rotation.y = -1.1;
      leaf.castShadow = leaf.receiveShadow = true;
      C.G.add(leaf);

      // One continuous bed. The bend below the terrace brings moving water into
      // the resting view without switching sides or introducing a second water feature.
      const channel = z => {
        const bend = Math.exp(-(((z + 31) / 14) ** 2));
        return STREAM_X - 1.55 * bend + 4.4 * Math.max(0, (-z - 38) / 39);
      };
      const waterZ = -20;
      const bed = new THREE.PlaneGeometry(5.2, 132, 1, 44);
      const points = bed.attributes.position;
      for (let i = 0; i < points.count; i++) {
        points.setX(i, points.getX(i) + channel(waterZ - points.getY(i)) - STREAM_X);
      }
      bed.computeBoundingSphere();
      water(-.48, 0x29464b, { geo: bed, x: STREAM_X, z: waterZ, waves: .8, env: .85, rough: .18 });
      for (let i = 0; i < 36; i++) {
        const z = -78 + i * 3.4;
        const x = channel(z);
        const size = .35 + C.rnd() * .5;
        rock(x - 2.7 - C.rnd() * .4, -.49, z, [size, size * .65, size * 1.4], i * 3 + 7);
        rock(x + 2.7 + C.rnd() * .6, -.49, z + .8, [size, size * .8, size * 1.6], i * 3 + 8);
      }
      const rippleMaterial = new THREE.MeshBasicMaterial({ color: 0xb1c3c5, transparent: true, opacity: .19, depthWrite: false });
      const ripples = Array.from({ length: 44 }, () => {
        const ripple = new THREE.Mesh(new THREE.PlaneGeometry(.19 + C.rnd() * .48, .02), rippleMaterial);
        ripple.rotation.x = -Math.PI / 2;
        ripple.rotation.z = (C.rnd() - .5) * .55;
        const z = -75 + C.rnd() * 110;
        const offset = (C.rnd() - .5) * 3.6;
        ripple.position.set(channel(z) + offset, -.467, z);
        C.G.add(ripple);
        return { ripple, offset, z };
      });
      C.up.push((dt) => {
        for (const item of ripples) {
          item.z -= dt * .65;
          if (item.z < -78) item.z += 112;
          item.ripple.position.set(channel(item.z) + item.offset, -.467, item.z);
        }
      });
      await pauseBuild();

      const mountain = M(0x293b35, 1);
      for (const [x, z, radius, height, seed] of [
        [-70, -80, 58, 130, 11], [-88, 5, 60, 145, 17],
        [100, -84, 58, 155, 23], [88, 18, 62, 150, 27],
        [-12, -170, 85, 185, 31], [42, -175, 61, 142, 61],
      ]) peak(x, -12, z, radius, height, mountain, seed, 1.05);
      const grove = trees();
      for (const [x, z, scale] of FOREGROUND_PINES) {
        grove.pine(x, 0, z, scale, 0x354d37, true);
      }
      for (let i = 0; i < 56; i++) {
        const side = i % 2 ? -1 : 1;
        const z = -70 + C.rnd() * 118;
        grove.pine(side * (18 + C.rnd() * 31), -.58, z, .8 + C.rnd() * 1.4, 0x253b2b);
      }
      grove.finish();
      for (const [x, z, size] of [[-7, 27, 1.2], [6, 31, 1], [-6, 38, .7], [7.9, -22, .5], [9.35, -24, .68], [9.1, -26.3, .6]]) {
        rock(x, z < -21 ? -.12 : 0, z, [size, size * .7, size * .9], Math.round(z));
      }
      mist({ n: 38, at: [0, 1.8, -38], box: [90, 3.1, 86], color: 0xb6c9cb, opacity: .085, size: 17, drift: .5 });
      await pauseBuild();
    },
    nook: {
      at: { pos: V3(...TABLE_CENTER), ry: 0 },
      lamp: 'glass', y: .46, exposure: 1.1, bloom: [.36, 1.02],
      wide: cameras.wide,
      widePhone: cameras.widePhone,
      choose: cameras.choose,
      choosePhone: cameras.choosePhone,
      async build(_helpers, C) {
        const bricks = brickTex.clone();
        bricks.repeat.set(2.3, 3);
        bricks.needsUpdate = true;
        const brick = M(0x6e6458, .96, { map: bricks });
        const cap = M(0x4b4e4b, .95, { map: pavingTex });
        const stone = M(0x73766b, .9, { map: pavingTex });
        const court = M(0x555b51, .96, { map: pavingTex });
        const moss = M(0x3f5038, 1);
        const worldBox = (w, height, d, material, x, y, z, yaw) => box(w, height, d, material, x - tableX, y, z - tableZ, yaw);
        const worldPut = (geometry, material, x, y, z, yaw) => put(geometry, material, x - tableX, y, z - tableZ, yaw);

        // The paving follows the walk east of the tower rather than sending the
        // visitor straight into its front. The terrace remains open down-valley.
        const path = [[0, 17.7], [.26, 10], [1.05, 4.5], [2.85, -1.9], [4.2, -7.35], [4.26, -12.35], [6.34, -17.65], [8.55, -20.6]];
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1], b = path[i];
          const dx = b[0] - a[0], dz = b[1] - a[1];
          worldBox(2.1, .07, Math.hypot(dx, dz) + .36, court, (a[0] + b[0]) / 2, -.012 + i * .0005, (a[1] + b[1]) / 2, Math.atan2(dx, dz));
        }
        const sideWall = (x, start, end, height) => {
          worldBox(.52, height, start - end, brick, x, height / 2, (start + end) / 2);
          worldBox(.68, .11, start - end, cap, x, height + .055, (start + end) / 2);
        };
        sideWall(-11.5, 18, -27, 1.65);
        sideWall(10.8, 18, 13.6, 1.52);
        sideWall(10.8, 13.6, -4.8, .82);
        sideWall(10.8, -4.8, -14.2, .64);
        // The masonry ends where the terrace recedes from the bank.
        worldBox(.72, .64, .72, cap, 10.8, .32, -14.2);
        worldBox(14.9, .52, .53, brick, -4.04, .26, -27);
        worldBox(15.0, .11, .67, cap, -4.04, .575, -27);

        // The worn slab retains its glass bowls and the central lamp seat.
        box(2, .08, .62, stone, 0, .42, 0);
        for (const x of [-.7, .7]) box(.34, .38, .5, stone, x, .19, 0);
        for (const [x, fuel] of [[-.6, .4], [-.32, .75], [.42, .5], [.7, .3]]) {
          otherLamp('glass', x, .46, (x * 5 % 1) * .08, fuel);
        }
        box(1.2, .065, .34, stone, -1.92, .36, -.75);
        for (const x of [-2.31, -1.51]) box(.18, .33, .28, stone, x, .165, -.75);

        // The same seven-stage brick tower stands on a single octagonal plinth.
        worldPut(new THREE.CylinderGeometry(2.5, TOWER_BASE_RADIUS, .6, 8), cap, 0, .3, towerZ);
        worldPut(new THREE.CylinderGeometry(2.15, 2.32, 3.4, 8), brick, 0, 2.3, towerZ);
        let y = 4, radius = 2.15;
        for (let i = 0; i < 7; i++) {
          worldPut(new THREE.CylinderGeometry(radius * 1.12, radius * 1.02, .18, 8), cap, 0, y + .09, towerZ);
          y += .18;
          const height = 1.05 - i * .055, next = radius * .88;
          worldPut(new THREE.CylinderGeometry(next, radius, height, 8), brick, 0, y + height / 2, towerZ);
          for (let side = 0; side < 8; side++) {
            const angle = (side + .5) / 8 * Math.PI * 2;
            const offset = radius * .93;
            const pane = new THREE.Mesh(new THREE.PlaneGeometry(.28 - i * .018, .5 - i * .025), M(0x111819, .96));
            pane.position.set(Math.sin(angle) * offset - tableX, y + height * .52, towerZ + Math.cos(angle) * offset - tableZ);
            pane.rotation.y = angle;
            C.G.add(pane);
          }
          y += height;
          radius = next;
        }
        worldPut(new THREE.ConeGeometry(radius * 1.1, 1, 8), cap, 0, y + .5, towerZ);
        worldPut(new THREE.SphereGeometry(.09, 16, 12), cap, 0, y + 1.03, towerZ);
        worldBox(.72, 1.5, .08, M(0x101512, .98), 0, 1.35, towerZ + 2.16);
        const doorGlow = new THREE.MeshStandardMaterial({ color: 0x3a2616, emissive: 0xffac61, emissiveIntensity: .22, roughness: 1 });
        worldBox(.36, .7, .025, doorGlow, 0, 1.1, towerZ + 2.215);
        const inside = new THREE.PointLight(0xffa35b, 1.2, 4, 2);
        inside.position.set(-tableX, 1, towerZ + 2.45 - tableZ);
        C.G.add(inside);
        for (const [x, z, size] of [[-2.6, -9.6, .5], [3, -11, .65], [-4, -1, .7], [5.55, -5, .5]]) {
          rock(x - tableX, 0, z - tableZ, [size, size * .55, size * .8], Math.round((z + 13) * 11));
        }
        for (let i = 0; i < 65; i++) {
          const angle = C.rnd() * 6.28, distance = 2.6 + C.rnd() * 1.5;
          worldPut(new THREE.PlaneGeometry(.035, .12 + C.rnd() * .13), moss, Math.sin(angle) * distance, .1, towerZ + Math.cos(angle) * distance, angle);
        }
        await pauseBuild();
      },
    },
  };
}
