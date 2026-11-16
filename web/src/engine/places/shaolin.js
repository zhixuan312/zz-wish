// Loaded only when this place is visited.
export default function createPlace(h) {
  const { V3, M, roofMat, ground, pave, hallB, gateB, compound, trees, peak, ridges, pagoda, fall, pauseBuild } = h;
  return {
    exposure: 1.1, shade: 0.28,
    sky: { top: 0x070b18, horizon: 0x3a2a2c, ground: 0x0e0c0c, sun: 0xff8f4a, dir: [-.25, .03, -1], glow: .55, clouds: .3, lit: 0x5a3c38, dark: 0x12121c, stars: .55, disc: 0 },
    fog: [0x1c1820, .011], sunL: [0x9aa8d0, .45], hemi: [0x34405e, 0x120e0a, .3], bloom: [.8, .8], porch: [0xff9a48, 80],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: 1, sky: { top: 0x34456e, horizon: 0xf2a462, ground: 0x4a3a2a, sun: 0xffb060, dir: [-.25, .05, -1], glow: 1.1, clouds: .35, lit: 0xffc98a, dark: 0x6a5468 }, fog: [0xc98e62, .008], sunL: [0xffb070, 2.4], hemi: [0x7a88b0, 0x40301c, .55], bloom: [.55, 1.1] },
    view: { pos: V3(-22, 15, 74), look: V3(-5, 5, 4) },
    walk: [V3(0, 1.7, 40), V3(0, 1.7, 22), V3(0, 1.7, 14), V3(0, 1.7, 6)], doors: V3(0, 3.5, 2),
    async build() {
      const C = h.context;
      ground(0x6a573c); pave(0, 28, 6, 28);
      await pauseBuild();
      const grey = roofMat(0x8e8a82);
      await pauseBuild();
      hallB({ z: -4, w: 18, d: 11, h: 6, wall: C.red, roof: grey });
      await pauseBuild();
      gateB({ z: 14, w: 10, wall: C.red, roof: grey, text: '少林寺' });
      await pauseBuild();
      compound(14, -16, 20, 3.4, C.red, grey);
      await pauseBuild();
      const brick = [M(0x8a6c52, .95), M(0x7a6858, .95), M(0x96826a, .95)];
      await pauseBuild();
      for (let i = 0; i < 46; i++) { const x = -6 - C.rnd() * 36, z = 18 + C.rnd() * 38; pagoda(x, z, 1 + Math.floor(C.rnd() * 7), .7 + C.rnd() * .9, brick[i % 3]); }
      await pauseBuild();
      for (let i = 0; i < 10; i++) pagoda(8 + C.rnd() * 20, 22 + C.rnd() * 30, 1 + Math.floor(C.rnd() * 4), .6 + C.rnd() * .6, brick[i % 3]);
      await pauseBuild();
      const T = trees();
      await pauseBuild();
      for (let i = 0; i < 40; i++) { const x = (C.rnd() - .5) * 120, z = -50 + C.rnd() * 110; if (Math.abs(x) < 22 && z < 16) continue; T.pine(x, 0, z, 1.4 + C.rnd() * 1.4, 0x2c3624); }
      await pauseBuild();
      T.finish();
      await pauseBuild();
      const rockM = M(0x4a4250, 1);
      await pauseBuild();
      peak(-70, 0, -150, 80, 110, rockM, 11, 1.4); peak(20, 0, -190, 90, 140, rockM, 17, 1.5); peak(110, 0, -160, 70, 95, rockM, 23, 1.3);
      await pauseBuild();
      ridges([[300, 0, 90, 0x6a5470], [420, 0, 120, 0x9a7a80]]);
      await pauseBuild();
      fall({ n: 500, at: [-10, 4, 36], box: [50, 8, 50], color: 0xffd8a0, size: .1, vy: -.06, sway: .25, opacity: .55, add: true });
      await pauseBuild();
    },
  };
}
