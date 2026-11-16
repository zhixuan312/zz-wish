// Loaded only when this place is visited.
export default function createPlace(h) {
  const { V3, M, roofMat, ground, pave, hallB, gateB, compound, trees, peak, ridges, ribbons, fall, petalTex, pauseBuild } = h;
  return {
    sky: { top: 0x76a0d0, horizon: 0xece2d2, ground: 0x5a6a44, sun: 0xfff0d0, dir: [.5, .45, -1], glow: .55, clouds: .38, lit: 0xffffff, dark: 0xb4c0d0 },
    fog: [0xd6dccc, .01], sunL: [0xfff0d8, 2.1], hemi: [0xc8d8e8, 0x506038, .85], bloom: [.4, 1.3],
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
      gateB({ z: 14, w: 10, wall: C.red, roof: grey, text: '红螺寺' });
      await pauseBuild();
      compound(14, -20, 20, 3.4, C.red, grey);
      await pauseBuild();
      const T = trees();
      await pauseBuild();
      for (let i = 0; i < 170; i++) { const s = C.rnd() < .5 ? -1 : 1; T.bamboo(s * (3.6 + C.rnd() * 12), 0, 18 + C.rnd() * 46, .9 + C.rnd() * .3, 0x6f9a40); }
      await pauseBuild();
      for (const [x, z] of [[-9, 10], [10, 8]]) { T.pine(x, 0, z, 2.6, 0x2c3e26, true); for (let k = 0; k < 24; k++) { const a = C.rnd() * 6.28, d = 1 + C.rnd() * 3.4; T.blob(x + Math.cos(a) * d, 3 + C.rnd() * 4, z + Math.sin(a) * d, .35, 1.1 + C.rnd() * .6, .35, 0xa47ad0); } }
      await pauseBuild();
      for (let i = 0; i < 40; i++) { const x = (C.rnd() - .5) * 160, z = -80 + C.rnd() * 60; T.broad(x, 0, z, 1.6 + C.rnd(), 0x3c5a2c); }
      await pauseBuild();
      T.finish();
      await pauseBuild();
      ribbons(10, 5, 8, 40, 5);
      await pauseBuild();
      const hill = M(0x3c5a30, 1);
      await pauseBuild();
      peak(-40, 0, -130, 70, 70, hill, 4, .9); peak(50, 0, -150, 80, 90, hill, 8, .9); peak(130, 0, -110, 60, 60, hill, 12, .9);
      await pauseBuild();
      ridges([[300, 0, 60, 0x8aa08a], [420, 0, 90, 0xa8b8aa]]);
      await pauseBuild();
      fall({ n: 420, at: [0, 6, 26], box: [50, 12, 50], color: 0xf4c2d0, size: .26, vy: .7, sway: 1, opacity: 1, tex: petalTex });
      await pauseBuild();
    },
  };
}
