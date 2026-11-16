// Tide Temple: a temple with its back to the hill, facing the sea over low granite walls.
export default function createPlace(h) {
  const { THREE, V3, M, roofMat, pave, hallB, trees, peak, postLanterns, stairs, paifang, water, box, lanterns, pauseBuild } = h;
  return {
    exposure: 1.1, shade: 0.32,
    sky: { top: 0x070c22, horizon: 0x3a2e44, ground: 0x0c0e16, sun: 0xff8a50, dir: [.95, .02, -.5], glow: .7, clouds: .35, lit: 0x6a4450, dark: 0x161830, stars: .8, disc: 0 },
    fog: [0x221e30, .008], sunL: [0x8a9ad0, .45], hemi: [0x3a4878, 0x141016, .32], bloom: [.85, .8], porch: [0xffa04a, 100],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: 1, sky: { top: 0x3f74bc, horizon: 0xd4e2ec, ground: 0x34465a, sun: 0xfff2dc, dir: [.6, .45, -.6], glow: .5, clouds: .35, lit: 0xffffff, dark: 0xaabccc, disc: 4 }, fog: [0xc4d6e2, .006], sunL: [0xfff2e0, 2.2], hemi: [0xbcd0e8, 0x504838, .8], bloom: [.35, 1.3] },
    view: { pos: V3(24, 11, 66), look: V3(0, 24, -36) },
    walk: [V3(0, 1.7, 30), V3(4, 1.7, 18), V3(14, 1.7, 10)], doors: V3(27, 1.2, 8),
    async build() {
      const C = h.context;
      water(-2.5, 0x0c1424, { env: 1.2 });
      await pauseBuild();
      box(60, 6, 46, C.stone, 0, -3, 0); pave(0, 12, 8, 20);
      await pauseBuild();
      peak(0, -4, -95, 85, 52, M(0x26302a, 1), 21, .55);
      await pauseBuild();
      const roof = roofMat(0xc0542e, true), red = M(0x9a3a28, .85);
      await pauseBuild();
      hallB({ z: -4, w: 16, d: 10, h: 5.5, wall: red, roof, lift: 1.8, glow: 1.6 });
      await pauseBuild();
      box(26, 16, 18, C.stone, 0, 2, -24); stairs(0, 0, -9, 20, .5, .3, 5, C.stone);
      await pauseBuild();
      hallB({ y: 10, z: -24, w: 14, d: 9, h: 5, wall: red, roof, lift: 1.8, glow: 1.4 });
      await pauseBuild();
      box(22, 34, 16, C.stone, 0, 9, -42); hallB({ y: 26, z: -42, w: 12, d: 8, h: 5, wall: red, roof, lift: 1.8, glow: 1.4 });
      await pauseBuild();
      await pauseBuild();
      await pauseBuild();
      paifang(17, 9, 5.5, M(0xb8b0a2, .9), roof);
      await pauseBuild();
      const L = []; for (const [y, z, w] of [[6.3, 1.5, 16], [16.3, -19, 14], [32.3, -37.5, 12]]) for (let i = 0; i < 6; i++) L.push([-w / 2 + w * (i + .5) / 6, y, z]);
      await pauseBuild();
      lanterns(L, .8); postLanterns([6, 11, 16, 21], 3, 3, .9);
      await pauseBuild();
      for (const z of [8, 18]) { const l = new THREE.PointLight(0xff6a30, 12, 30, 2); l.position.set(0, 4, z); C.G.add(l); }
      await pauseBuild();
      const T = trees();
      await pauseBuild();
      for (let i = 0; i < 30; i++) { const x = (C.rnd() - .5) * 120, z = -110 + C.rnd() * 100, dist = Math.hypot(x, z + 95), y = -4 + 52 * Math.max(0, 1 - Math.pow(dist / 85, 1 / .55)); if (Math.abs(x) < 16 || y < 0) continue; T.broad(x, y - .5, z, 1.6 + C.rnd(), 0x1e2c22); }
      await pauseBuild();
      T.finish();
      await pauseBuild();
    },

    // A low sea wall of granite; on it a small stone lamp-house, the hood lamp inside its recess. The sea beyond.
    nook: {
      at: { pos: V3(27, 0, 8), ry: -Math.PI / 2 },
      lamp: 'hood', y: 1.0, exposure: 1.05, bloom: [.4, .95],
      approach: [V3(0, 1.6, 4)],
      wide: { pos: V3(1.0, 1.55, 2.1), look: V3(-.2, 1.0, -.6) },
      async build(hh) {
        const { THREE, M, box, put, wallWithHoles, otherLamp, pavingTex, pauseBuild } = hh;
        const granite = M(0x6e6a64, .92, { map: pavingTex }), dark = M(0x4a4844, .95, { map: pavingTex });
        box(8, 1.0, .7, granite, 0, .5, -.45); box(8.1, .1, .78, dark, 0, 1.0, -.45);
        // The lamp-house: a stone box with a recess, a hipped stone cap.
        wallWithHoles({ x0: -.3, x1: .3, y0: 1.0, y1: 1.58, z: .12, depth: .52, m: granite, uv: 1.2, holes: [{ x0: -.17, x1: .17, y0: 1.0, y1: 1.4, arch: true }] });
        box(.34, .4, .02, M(0x2a2622, 1), 0, 1.2, -.38);
        put(new THREE.ConeGeometry(.5, .28, 4).rotateY(Math.PI / 4), dark, 0, 1.72, -.14);
        wallWithHoles({ x0: 1.7, x1: 2.26, y0: 1.0, y1: 1.54, z: .08, depth: .5, m: granite, uv: 1.2, holes: [{ x0: 1.82, x1: 2.14, y0: 1.0, y1: 1.36, arch: true }] });
        put(new THREE.ConeGeometry(.46, .26, 4).rotateY(Math.PI / 4), dark, 1.98, 1.66, -.17);
        otherLamp('hood', 1.98, 1.0, -.16, .7);
        // Paving, a coil of rope and a stone bollard: the harbour is below.
        box(8, .2, 3, M(0x5a5854, .85, { map: pavingTex }), 0, -.1, 1.2);
        put(new THREE.TorusGeometry(.16, .035, 8, 24).rotateX(Math.PI / 2), M(0x8a7a5a, .9), -1.6, .04, .6);
        put(new THREE.CylinderGeometry(.12, .16, .55, 12), dark, 2.9, .27, .5);
        await pauseBuild();
      },
    },
  };
}
