// Bamboo Rain Cloister: a temple deep in bamboo, its cloisters running round courtyards in the rain.
export default function createPlace(h) {
  const { THREE, V3, M, roofMat, ground, pave, hallB, gateB, trees, peak, ridges, fall, box, put, wallRun, col, otherLamp, plasterTex, grainTex, pavingTex, pauseBuild } = h;
  return {
    exposure: 1.25, shade: 0.3,
    sky: { top: 0x080a14, horizon: 0x33242a, ground: 0x0e0c0c, sun: 0xf0e0d0, dir: [.5, .4, -1], glow: .25, clouds: .35, lit: 0x4a3438, dark: 0x120f16, stars: .5, disc: 1.4 },
    fog: [0x1e1618, .012], sunL: [0xc8c4d8, .5], hemi: [0x3a3650, 0x140c0c, .45], bloom: [.8, .8], porch: [0xff8a46, 240],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: 1, sky: { top: 0x76a0d0, horizon: 0xece2d2, ground: 0x5a6a44, sun: 0xfff0d0, dir: [.5, .45, -1], glow: .55, clouds: .38, lit: 0xffffff, dark: 0xb4c0d0 }, fog: [0xd6dccc, .01], sunL: [0xfff0d8, 2.1], hemi: [0xc8d8e8, 0x506038, .85], bloom: [.4, 1.3] },
    view: { pos: V3(2.8, 1.75, 36), look: V3(0, 2.0, 14) },
    walk: [V3(.2, 1.7, 29), V3(0, 1.7, 20), V3(0, 1.7, 14), V3(-2.5, 1.75, 8)], doors: V3(0, 1.6, 18),
    async build() {
      const C = h.context;
      const white = M(0xe0dfd5, .96, { map: plasterTex }), tile = roofMat(0x34383a), stone = M(0x5f6460, .3, { map: pavingTex }), wood = M(0x493829, .84, { map: grainTex });
      ground(0x233326); pave(0, 27, 3.6, 24, 0, stone);
      pave(0, 5, 16, 23, -.04, stone);
      // A modest plaster gate opens into the wet court. The left cloister is the lamp shelf built below.
      gateB({ z: 18, w: 7, h: 3.7, wall: white, roof: tile, lift: .22 });
      wallRun(-11, 18, -3.5, 18, 2.8, white, tile); wallRun(3.5, 18, 11, 18, 2.8, white, tile);
      wallRun(10, 18, 10, -9, 2.8, white, tile); wallRun(-10, 18, -10, -9, 2.8, white, tile);
      hallB({ z: -8, w: 15, d: 5, h: 3.0, wall: white, roof: tile, base: .3, lift: .2, glow: .18 });
      // Opposite covered walk. Rafter ends, column drums and floor margins share the same real scale as the near shelf.
      box(2.7, .35, 19, stone, 8.3, .175, 4);
      box(.45, .06, 17, wood, 9.3, .85, 4);
      for (const z of [-3, 1, 5, 9, 12]) box(.08, .5, .08, wood, 9.35, .57, z);
      for (let z = -3; z <= 12; z += 3) {
        col(6.9, z, 2.7, .12, wood, .35);
        box(2.8, .18, .14, wood, 8.1, 3.03, z);
      }
      const roof = new THREE.BoxGeometry(3.4, .13, 20); roof.rotateZ(-.17); put(roof, tile, 8.2, 3.25, 4);
      box(.2, .2, 19, wood, 6.86, 3.05, 4);
      // Rainwater runs in a shallow open channel at the cloister's edge.
      box(.26, .05, 19, M(0x101c1c, .05), 6.56, .025, 4);
      for (let z = -2; z < 13; z += 3) otherLamp('celadon', 9.3, .88, z, .45, Math.PI / 2, .45);
      await pauseBuild();
      const T = trees();
      C.free = true;
      for (let i = 0; i < 170; i++) {
        const side = i % 2 ? -1 : 1, z = -15 + C.rnd() * 55;
        T.bamboo(side * (11 + C.rnd() * 10), 0, z, .72 + C.rnd() * .5, 0x38573d);
      }
      for (let i = 0; i < 28; i++) T.bamboo(-15 + C.rnd() * 30, 0, -15 - C.rnd() * 10, .8 + C.rnd() * .4, 0x2b4935);
      C.free = false; T.finish(); await pauseBuild();
      const hill = M(0x283c32, 1); peak(-65, 0, -110, 65, 45, hill, 4, .7); peak(65, 0, -145, 85, 65, hill, 8, .7);
      ridges([[300, 0, 60, 0x62766c]]);
      fall({ kind: 'rain', n: 1000, at: [0, 5, 7], box: [40, 10, 45], color: 0x9aabb8, opacity: .16, vy: 9, sway: .04 });
      // Thin spill lines under the opposite eaves; the near eave has its own matching drip row.
      fall({ kind: 'rain', n: 170, at: [6.5, 1.8, 4], box: [.04, 3.1, 19], color: 0xaebfca, opacity: .3, vy: 5.3, sway: 0 });
      await pauseBuild();
    },

    // The cloister: a long wooden shelf of celadon lamps against a white wall; rain off the eaves, bamboo beyond.
    nook: {
      at: { pos: V3(-9.3, .35, 6), ry: Math.PI / 2 },
      lamp: 'celadon', y: .91, exposure: 1.1, bloom: [.36, 1],
      approach: [V3(.4, 1.3, 4.2)],
      wide: { pos: V3(.9, 1.4, -.22), look: V3(0,.96,0) },
      burn: { pos: V3(.65, 1.28, -.2), look: V3(0,.96,0) },
      async build(hh) {
        const { THREE, M, box, put, col, eave, fall, rock, mist, otherLamp, lathe, plasterTex, grainTex, pavingTex, pauseBuild } = hh;
        const wood = M(0x3a2216, .68, { map: grainTex }), plaster = M(0xe2ded4, .95, { map: plasterTex }), skirt = M(0x55575a, .9, { map: pavingTex }), wet = M(0x4a4c4c, .22, { map: pavingTex }), floor = M(0x666260, .55, { map: pavingTex });
        box(7, 3.3, .3, plaster, 0, 1.65, -.5); box(7, .55, .34, skirt, 0, .275, -.48); box(7.2, .14, .5, M(0x2e2e30, .8), 0, 3.3, -.45);
        // The shelf, its brackets, a lip along the front edge.
        box(4.2, .05, .32, wood, 0, .885, -.1); box(4.2, .025, .02, wood, 0, .905, .055);
        for (const x of [-1.9, -.65, .65, 1.9]) { box(.05, .3, .05, wood, x, .72, -.24); const s = new THREE.BoxGeometry(.04, .32, .04); s.rotateX(.7); put(s, wood, x, .76, -.14); }
        for (const x of [-1.5, -1.05, -.55, .55, 1.0, 1.5]) otherLamp('celadon', x, .91, -.1 + (x * 7 % 1) * .04, .35 + ((x * 13) % 1 + 1) % 1 * .5);
        // Corridor floor, red-brown columns at its edge, the eaves above.
        box(7, .12, 2.1, floor, 0, -.06, .55);
        box(7, .18, .3, M(0x5c5a56, .7, { map: pavingTex }), 0, -.09, 1.65);
        for (const x of [-3, 3]) col(x, 1.35, 2.5, .11, M(0x4a1c12, .5));
        box(7, .2, .18, wood, 0, 2.55, 1.35);
        eave({ x0: -3.6, x1: 3.6, y: 2.72, z: 1.75, depth: 2.4, rise: .7, tile: 0x323436 });
        // The courtyard, wet, a stone basin catching the drips.
        box(9, .1, 6, wet, 0, -.35, 4.8);
        put(lathe([[0, 0], [.3, 0], [.34, .35], [.3, .38], [.26, .1], [0, .1]], 32), M(0x606260, .4), 1.3, -.3, 2.4);
        rock(-2.6, -.3, 3.2, [.5, .4, .5], 71);
        await pauseBuild();
        // Rain over the court, and the line of drips falling off the tile ends.
        fall({ kind: 'rain', n: 900, at: [0, 1.4, 4.4], box: [9, 4.2, 5.2], color: 0x9aa6b4, opacity: .22, vy: 7, sway: .05 });
        fall({ kind: 'rain', n: 160, at: [0, 1.2, 1.84], box: [7, 2.8, .06], color: 0xb4bec8, opacity: .32, vy: 5, sway: 0 });
        mist({ n: 12, at: [0, 1.5, 6], box: [12, 2, 4], color: 0xc8d0d4, opacity: .1, size: 6, drift: .2 });
        await pauseBuild();
      },
    },
  };
}
