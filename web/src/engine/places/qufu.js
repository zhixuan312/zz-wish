// Loaded only when this place is visited.
export default function createPlace(h) {
  const { V3, M, roofMat, ground, pave, hallB, compound, trees, ridges, paifang, fall, petalTex, pauseBuild } = h;
  return {
    exposure: 1.1, shade: 0.3,
    sky: { top: 0x0a0d1a, horizon: 0x34302e, ground: 0x12100c, sun: 0xf4e4c0, dir: [-.7, .4, -.35], glow: .3, clouds: .2, lit: 0x4c4636, dark: 0x12121a, stars: .6, disc: 1.6 },
    fog: [0x1e1c1c, .009], sunL: [0xe8dcc0, .6], hemi: [0x3e4256, 0x14100a, .33], bloom: [.75, .82], porch: [0xffaa50, 100],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: 1, sky: { top: 0x4f7cc0, horizon: 0xeadab8, ground: 0x7a6a50, sun: 0xffd8a0, dir: [-.7, .35, -.35], glow: .6, clouds: .28, lit: 0xfff4e4, dark: 0xb8c0d0 }, fog: [0xd8c8a8, .0065], sunL: [0xffd49a, 2.3], hemi: [0xb0c4e0, 0x5a4630, .7], bloom: [.4, 1.3] },
    view: { pos: V3(-15, 8, 66), look: V3(3, 7, 2) },
    walk: [V3(0, 1.7, 46), V3(0, 1.7, 30), V3(0, 1.7, 22), V3(7.5, 1.7, 15), V3(7, 1.7, 9), V3(0, 1.7, 6.5)], doors: V3(0, 5, 0),
    async build() {
      const C = h.context;
      ground(0x8a7a5a); pave(0, 34, 6, 30); pave(0, 8, 30, 12);
      await pauseBuild();
      const yel = roofMat(0xdcae3e, true), marble = M(0xdcd6c8, .85);
      await pauseBuild();
      hallB({ z: -6, w: 26, d: 15, h: 8, eaves: 2, wall: C.red, roof: yel, base: 2.4, baseM: marble });
      await pauseBuild();
      hallB({ z: 12, w: 5.5, d: 5.5, h: 3.2, eaves: 2, wall: C.red, roof: yel, base: .8, glow: 0 });
      await pauseBuild();
      paifang(22, 12, 6, marble, roofMat(0x3d6a56, true));
      await pauseBuild();
      compound(22, -26, 28, 4.2, C.red, yel);
      await pauseBuild();
      const T = trees();
      await pauseBuild();
      for (let z = 26; z < 76; z += 4.5) for (const s of [-1, 1]) T.cypress(s * (5.5 + C.rnd() * 3), 0, z + C.rnd() * 2, 1 + C.rnd() * .5, 0x2a3a26);
      await pauseBuild();
      for (let i = 0; i < 30; i++) { const s = C.rnd() < .5 ? -1 : 1; T.cypress(s * (12 + C.rnd() * 30), 0, -30 + C.rnd() * 100, 1 + C.rnd() * .6, 0x2a3a26); }
      await pauseBuild();
      for (const [x, z] of [[-16, 6], [16, 4], [-20, 30], [20, 34], [-34, 50], [30, 58]]) T.broad(x, 0, z, 2.4, 0xd9a52c);
      await pauseBuild();
      T.finish();
      await pauseBuild();
      ridges([[300, 0, 30, 0xb8b0a0]]);
      await pauseBuild();
      fall({ n: 360, at: [0, 7, 30], box: [60, 14, 60], color: 0xe8b434, size: .35, vy: .9, sway: 1.2, opacity: 1, tex: petalTex });
      await pauseBuild();
    },
  };
}
