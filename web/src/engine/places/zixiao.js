// Loaded only when this place is visited.
export default function createPlace(h) {
  const { V3, M, roofMat, ground, pave, hallB, gateB, compound, trees, peak, mist, stairs, box, pauseBuild } = h;
  return {
    sky: { top: 0x587090, horizon: 0xdadee2, ground: 0xc8ccd2, sun: 0xfff4e0, dir: [.6, .3, -1], glow: .6, clouds: .35, lit: 0xffffff, dark: 0xa8b0bc },
    fog: [0xc6ced6, .0055], sunL: [0xfff2dc, 2], hemi: [0xc0d0e0, 0x384030, .85], bloom: [.4, 1.3],
    view: { pos: V3(28, 18, 62), look: V3(0, 8, -8) },
    walk: [V3(0, 1.7, 40), V3(0, 1.7, 22), V3(0, 1.7, 14), V3(0, 1.7, 11), V3(0, 5.4, 3), V3(0, 5.8, -1)], doors: V3(0, 8.5, -7),
    async build() {
      const C = h.context;
      ground(0x4a5636, { r: 52 }); peak(0, -160, -8, 120, 150, M(0x34442e, 1), 2, .55);
      await pauseBuild();
      pave(0, 30, 6, 30);
      await pauseBuild();
      const green = roofMat(0x3c7a52, true);
      await pauseBuild();
      stairs(0, 0, 10, 20, .2, .4, 8, C.stone); box(44, 4, 22, C.stone, 0, 2, -10);
      await pauseBuild();
      hallB({ y: 4, z: -12, w: 18, d: 11, h: 6, eaves: 2, wall: C.red, roof: green, base: 1.4 });
      await pauseBuild();
      gateB({ z: 18, w: 10, wall: C.red, roof: green, text: '紫霄宫' });
      await pauseBuild();
      compound(18, -26, 24, 3.4, C.red, green);
      await pauseBuild();
      const T = trees();
      await pauseBuild();
      for (let i = 0; i < 40; i++) { const a = C.rnd() * 6.28, r = 28 + C.rnd() * 22; T.pine(Math.cos(a) * r, 0, Math.sin(a) * r - 6, 1.3 + C.rnd(), 0x26382a); }
      await pauseBuild();
      T.finish();
      await pauseBuild();
      const mtn = M(0x2e4232, 1);
      await pauseBuild();
      for (const [x, z, r, h, s] of [[-120, -160, 70, 190, 1], [-60, -260, 90, 230, 2], [90, -200, 80, 210, 3], [200, -130, 70, 170, 4], [-200, -90, 80, 160, 5], [150, -330, 110, 250, 6], [-230, -280, 100, 220, 7]]) peak(x, -140, z, r, h, mtn, s * 7, 1.4);
      await pauseBuild();
      peak(40, -140, -300, 70, 270, mtn, 99, 1.6); box(4, 3, 3, M(0xe0ac3c, .25, { metalness: 1 }), 40, 129, -300);
      await pauseBuild();
      mist({ n: 120, at: [0, -16, -60], box: [600, 14, 500], color: 0xf4f6f8, opacity: .55, size: 70, drift: 1.2 });
      await pauseBuild();
      mist({ n: 18, at: [0, 2, 10], box: [120, 4, 80], color: 0xf0f2f4, opacity: .14, size: 20 });
      await pauseBuild();
    },
  };
}
