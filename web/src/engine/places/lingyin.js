// Loaded only when this place is visited.
export default function createPlace(h) {
  const { V3, M, roofMat, ground, pave, hallB, gateB, compound, rock, trees, peak, ridges, mist, burnerAt, box, pauseBuild } = h;
  return {
    sky: { top: 0x7c909c, horizon: 0xcfd4c8, ground: 0x59604c, sun: 0xffe2b8, dir: [.5, .22, -1], glow: .5, clouds: .45, lit: 0xf2efe6, dark: 0x9aa39e },
    fog: [0xc2c9bd, .016], sunL: [0xfff0dc, 1.7], hemi: [0xd0dcd6, 0x3c4434, .9], bloom: [.4, 1.2],
    view: { pos: V3(18, 10, 62), look: V3(-6, 7, 0) },
    walk: [V3(0, 1.7, 40), V3(0, 1.7, 24), V3(0, 1.7, 14), V3(0, 1.7, 8)], doors: V3(0, 3.5, 4),
    async build() {
      const C = h.context;
      ground(0x47502f); pave(0, 30, 6, 34); pave(0, 6, 24, 16);
      await pauseBuild();
      const yellow = M(0xd4a54e, .9), grey = roofMat(0xa29f98);
      await pauseBuild();
      hallB({ z: -4, w: 20, d: 12, h: 6.5, eaves: 2, wall: C.red, roof: grey, lift: .9 });
      await pauseBuild();
      gateB({ z: 16, w: 11, wall: yellow, roof: grey, text: '灵隐寺' });
      await pauseBuild();
      compound(16, -16, 24, 3.6, yellow, grey);
      await pauseBuild();
      rock(-34, 0, 14, [15, 15, 13], 5); rock(-27, 0, 38, [8, 7, 8], 9); rock(-46, 0, -6, [12, 18, 12], 13);
      await pauseBuild();
      const T = trees();
      await pauseBuild();
      for (let i = 0; i < 70; i++) { const side = C.rnd() < .5 ? -1 : 1, x = side * (6 + C.rnd() * 44), z = -40 + C.rnd() * 110; if (Math.abs(x) < 26 && z < 18 && z > -18) continue; if (x < -20 && Math.hypot(x + 34, z - 14) < 16) continue; T.broad(x, 0, z, 1.6 + C.rnd() * 1.6, 0x2c4626); }
      await pauseBuild();
      T.finish();
      await pauseBuild();
      peak(-80, 0, -140, 60, 70, M(0x3c4c3a, 1), 3, .8); peak(30, 0, -170, 80, 85, M(0x44543f, 1), 7, .8);
      await pauseBuild();
      ridges([[260, 0, 50, 0x8a978c], [380, 0, 80, 0xa8b2a8]]);
      await pauseBuild();
      mist({ n: 34, at: [0, 3, 10], box: [140, 5, 140], color: 0xe6ebe4, opacity: .2, size: 26 });
      await pauseBuild();
      burnerAt(0, 8, 1.1);
      await pauseBuild();
    },
  };
}
