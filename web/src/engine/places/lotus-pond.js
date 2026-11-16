// Lotus Pond Court: white walls and halls round a lotus pond, a low bridge across it.
export default function createPlace(h) {
  const { THREE, V3, M, roofMat, ground, pave, hallB, gateB, compound, trees, peak, water, archBridge, lotus, box, pauseBuild } = h;
  return {
    exposure: 1.1, shade: 0.3,
    sky: { top: 0x070c16, horizon: 0x26303e, ground: 0x0c1016, sun: 0xe8eef8, dir: [-1, .12, -.45], glow: .35, clouds: .45, lit: 0x4a5464, dark: 0x101620, stars: .35, disc: 1.5 },
    fog: [0x1a222e, .012], sunL: [0xbccce6, .6], hemi: [0x3a4a62, 0x0e1014, .32], bloom: [.75, .82], porch: [0xffa04a, 55],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: 1, sky: { top: 0x5c6ea2, horizon: 0xf6c4aa, ground: 0x3a4a5a, sun: 0xffd2a0, dir: [-1, .07, -.45], glow: 1.1, clouds: .4, lit: 0xffd4c0, dark: 0x8a7a98 }, fog: [0xe0bcb2, .009], sunL: [0xffc8a0, 1.9], hemi: [0xa8b0d8, 0x504040, .75], bloom: [.5, 1.1] },
    view: { pos: V3(-22, 8, 70), look: V3(3, 4, 12) },
    walk: [V3(0, 1.7, 50), V3(0, 1.9, 40), V3(0, 4, 31)], doors: V3(-7, 1.2, 21),
    async build() {
      const C = h.context;
      water(-1, 0x16283a); ground(0x4c5a34, { r: 120 }); ground(0xb8a888, { r: 128, y: -.3 });
      await pauseBuild();
      pave(0, 48, 6, 14); pave(0, 19, 6, 8); pave(0, 6, 26, 16);
      await pauseBuild();
      const rimM = M(0xb8b2a4, .9);
      await pauseBuild();
      box(34, .5, 1, rimM, 0, .1, 41); box(34, .5, 1, rimM, 0, .1, 21); box(1, .5, 20, rimM, -17, .1, 31); box(1, .5, 20, rimM, 17, .1, 31);
      await pauseBuild();
      water(.05, 0x1e3424, { geo: new THREE.PlaneGeometry(33, 19), z: 31, waves: .15, env: .8 });
      await pauseBuild();
      lotus(-16, 16, 22, 40, .08, 90);
      await pauseBuild();
      archBridge(31, 10, 2, 4, M(0xc6c0b2, .85));
      await pauseBuild();
      const yellow = M(0xd8aa4c, .9), grey = roofMat(0x9a958e);
      await pauseBuild();
      hallB({ z: -4, w: 22, d: 13, h: 7, eaves: 2, wall: C.red, roof: grey });
      await pauseBuild();
      gateB({ z: 16, w: 11, wall: yellow, roof: grey });
      await pauseBuild();
      compound(16, -18, 24, 3.6, yellow, grey);
      await pauseBuild();
      const T = trees();
      await pauseBuild();
      for (let i = 0; i < 50; i++) { const a = C.rnd() * 6.28, r = 30 + C.rnd() * 80, x = Math.cos(a) * r, z = Math.sin(a) * r; if (z > 0 && Math.abs(x) < 22) continue; T.broad(x, 0, z, 1.5 + C.rnd() * 1.4, 0x2f4a2a); }
      await pauseBuild();
      T.finish();
      await pauseBuild();
      const isl = M(0x3a4048, 1);
      await pauseBuild();
      peak(-260, -1, -320, 70, 40, isl, 3, .7); peak(-120, -1, -420, 90, 50, isl, 5, .7); peak(200, -1, -380, 60, 30, isl, 8, .7);
      await pauseBuild();
      peak(60, -1, -90, 70, 60, M(0x3c4a32, 1), 12, .8);
      await pauseBuild();
    },

    // A pale stone rail at the pond's edge; the lamp sits on the rail and burns twice, once in the water.
    nook: {
      at: { pos: V3(-7, .35, 20.6), ry: 0 },
      lamp: 'lotus', y: .87, mirror: -.3, exposure: 1.1, bloom: [.42, .95],
      approach: [V3(3, 1.6, 5)],
      wide: { pos: V3(.95, 1.15, 1.9), look: V3(-.2, .6, -.4) },
      async build(hh, C) {
        const { THREE, M, box, put, otherLamp, plasterTex, pavingTex, pauseBuild } = hh;
        const pale = M(0xc9c1b2, .66, { map: pavingTex }), walk = M(0x8a857c, .8, { map: pavingTex }), plaster = M(0xe4e0d6, .95, { map: plasterTex });
        // The walk behind the rail, the hall's white wall and dark eaves behind that.
        box(9, .5, 3.4, walk, 0, -.25, -1.7);
        box(9, 3, .3, plaster, 0, 1.5, -3.3); box(9.2, .14, .5, M(0x2e2e30, .8), 0, 3.05, -3.25);
        for (const x of [-3, 3]) { const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshStandardMaterial({ color: 0x1a0e08, emissive: 0xffa04a, emissiveMap: hh.latticeTex, emissiveIntensity: .4 + .4 * C.light.n })); win.position.set(x, 1.6, -3.14); C.G.add(win); }
        // The rail: posts with lotus-bud caps, carved panels, a flat top where lamps are set.
        box(6, .07, .2, pale, 0, .835, 0); box(6, .08, .2, pale, 0, .04, 0);
        for (const x of [-2.4, -1.2, 0.6, 1.8]) { box(.15, .98, .15, pale, x, .49, 0); put(new THREE.SphereGeometry(.09, 16, 12), pale, x, 1.03, 0); }
        for (const x of [-1.8, -.3, 1.2, 2.4]) box(1.0, .6, .07, pale, x, .44, 0);
        box(6, .1, .3, pale, 0, -.05, .06);
        otherLamp('lotus', -1.5, .87, 0, .5); otherLamp('lotus', 1.25, .87, 0, .8);
        await pauseBuild();
      },
    },
  };
}
