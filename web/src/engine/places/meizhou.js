// Loaded only when this place is visited.
export default function createPlace(h) {
  const { THREE, V3, M, roofMat, pave, hallB, trees, peak, postLanterns, stairs, paifang, water, statue, box, lanterns, pauseBuild } = h;
  return {
    exposure: 1.1, shade: 0.32,
    sky: { top: 0x070c22, horizon: 0x3a2e44, ground: 0x0c0e16, sun: 0xff8a50, dir: [.95, .02, -.5], glow: .7, clouds: .35, lit: 0x6a4450, dark: 0x161830, stars: .8, disc: 0 },
    fog: [0x221e30, .008], sunL: [0x8a9ad0, .45], hemi: [0x3a4878, 0x141016, .32], bloom: [.85, .8], porch: [0xffa04a, 100],
    view: { pos: V3(24, 11, 66), look: V3(0, 24, -36) },
    walk: [V3(0, 1.7, 30), V3(0, 1.7, 18), V3(0, 1.7, 10)], doors: V3(0, 3.5, 4),
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
      statue(0, 47, -95, 22, M(0xece8de, .8));
      await pauseBuild();
      const sp = new THREE.SpotLight(0xffe2c0, 4000, 200, .22, .6, 2); sp.position.set(10, 34, -50); sp.target.position.set(0, 58, -95); sp.intensity = 3200; C.G.add(sp, sp.target);
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
  };
}
