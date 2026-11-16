// Bamboo Rain Cloister: a temple deep in bamboo, its cloisters running round courtyards in the rain.
export default function createPlace(h) {
  const { V3, M, roofMat, ground, pave, hallB, gateB, compound, trees, peak, ridges, fall, pauseBuild } = h;
  return {
    exposure: 1.25, shade: 0.3,
    sky: { top: 0x080a14, horizon: 0x33242a, ground: 0x0e0c0c, sun: 0xf0e0d0, dir: [.5, .4, -1], glow: .25, clouds: .35, lit: 0x4a3438, dark: 0x120f16, stars: .5, disc: 1.4 },
    fog: [0x1e1618, .012], sunL: [0xc8c4d8, .5], hemi: [0x3a3650, 0x140c0c, .45], bloom: [.8, .8], porch: [0xff8a46, 240],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: 1, sky: { top: 0x76a0d0, horizon: 0xece2d2, ground: 0x5a6a44, sun: 0xfff0d0, dir: [.5, .45, -1], glow: .55, clouds: .38, lit: 0xffffff, dark: 0xb4c0d0 }, fog: [0xd6dccc, .01], sunL: [0xfff0d8, 2.1], hemi: [0xc8d8e8, 0x506038, .85], bloom: [.4, 1.3] },
    view: { pos: V3(-11, 4.6, 60), look: V3(2, 6.5, 4) },
    walk: [V3(0, 1.7, 42), V3(0, 1.7, 24), V3(0, 1.7, 14), V3(0, 1.7, 8)], doors: V3(0, 3.5, 2),
    async build() {
      const C = h.context;
      ground(0x4f6b34); pave(0, 32, 5, 36);
      await pauseBuild();
      const grey = roofMat(0x8e8b84);
      await pauseBuild();
      hallB({ z: -6, w: 18, d: 11, h: 6, wall: C.red, roof: grey });
      await pauseBuild();
      gateB({ z: 14, w: 10, wall: C.red, roof: grey });
      await pauseBuild();
      compound(14, -20, 20, 3.4, C.red, grey);
      await pauseBuild();
      const T = trees();
      await pauseBuild();
      for (let i = 0; i < 170; i++) { const s = C.rnd() < .5 ? -1 : 1; T.bamboo(s * (3.6 + C.rnd() * 12), 0, 18 + C.rnd() * 46, .9 + C.rnd() * .3, 0x6f9a40); }
      await pauseBuild();
      for (let i = 0; i < 40; i++) { const x = (C.rnd() - .5) * 160, z = -80 + C.rnd() * 60; T.broad(x, 0, z, 1.6 + C.rnd(), 0x3c5a2c); }
      await pauseBuild();
      T.finish();
      await pauseBuild();
      const hill = M(0x3c5a30, 1);
      await pauseBuild();
      peak(-40, 0, -130, 70, 70, hill, 4, .9); peak(50, 0, -150, 80, 90, hill, 8, .9); peak(130, 0, -110, 60, 60, hill, 12, .9);
      await pauseBuild();
      ridges([[300, 0, 60, 0x8aa08a], [420, 0, 90, 0xa8b8aa]]);
      await pauseBuild();
      fall({ kind: 'rain', n: 1400, at: [0, 8, 26], box: [50, 16, 50], color: 0x9aa6b4, opacity: .2, vy: 9, sway: .05 });
      await pauseBuild();
    },

    // The cloister: a long wooden shelf of celadon lamps against a white wall; rain off the eaves, bamboo beyond.
    nook: {
      at: { pos: V3(-7.5, .35, 6), ry: Math.PI / 2 },
      lamp: 'celadon', y: .91, exposure: 1.1, bloom: [.36, 1],
      approach: [V3(.4, 1.3, 4.2)],
      wide: { pos: V3(1.55, 1.28, 1.3), look: V3(-.4, .98, -.12) },
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
        for (const x of [-2.4, 0, 2.4]) col(x, 1.35, 2.5, .11, M(0x4a1c12, .5));
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
