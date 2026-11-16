// Loaded only when this place is visited.
export default function createPlace(h) {
  const { THREE, V3, roofMat, ground, hallB, gateB, compound, trees, postLanterns, city, fall, lanterns, tower, pauseBuild } = h;
  return {
    snow: .85, exposure: 1.2, shade: 0.4,
    sky: { top: 0x070a16, horizon: 0x2c2638, ground: 0x14121a, sun: 0xc8d4ff, dir: [.4, .5, -1], glow: .15, clouds: .75, lit: 0x4a3e4e, dark: 0x16141e, disc: 0 },
    fog: [0x221e2c, .02], sunL: [0x9fb4e0, .45], hemi: [0x4a5478, 0x1c181c, .42], bloom: [.85, .8], porch: [0xffa04a, 110],
    view: { pos: V3(13, 7, 54), look: V3(0, 7, -6) },
    walk: [V3(0, 1.7, 42), V3(0, 1.7, 24), V3(0, 1.7, 16), V3(0, 1.7, 8)], doors: V3(0, 3.5, 4),
    async build() {
      const C = h.context;
      ground(0xdde3ec, { rough: .9 });
      await pauseBuild();
      const yel = roofMat(0xe0b03a, true);
      await pauseBuild();
      hallB({ z: -4, w: 20, d: 12, h: 6.5, eaves: 2, wall: C.red, roof: yel, glow: 1.8 });
      await pauseBuild();
      tower({ z: -36, w: 16, d: 12, floors: 3, fh: 5, wall: C.red, roof: yel });
      await pauseBuild();
      gateB({ z: 16, w: 11, wall: C.red, roof: yel, text: '雍和宫' });
      await pauseBuild();
      compound(16, -46, 26, 4, C.red, yel);
      await pauseBuild();
      postLanterns([22, 28, 34, 40, 46], 3.4, 3.2, 1);
      await pauseBuild();
      lanterns([[-1.6, 4.1, 17.6], [1.6, 4.1, 17.6]], 1.3);
      await pauseBuild();
      for (const z of [26, 40]) { const l = new THREE.PointLight(0xff6a2a, 10, 30, 2); l.position.set(0, 3.2, z); C.G.add(l); }
      await pauseBuild();
      const T = trees();
      await pauseBuild();
      for (let i = 0; i < 24; i++) { const side = C.rnd() < .5 ? -1 : 1; T.pine(side * (8 + C.rnd() * 16), 0, -10 + C.rnd() * 26, 1.2 + C.rnd(), 0x1e2c22); }
      await pauseBuild();
      T.finish();
      await pauseBuild();
      city(160, 320, 480, [-Math.PI * .9, -Math.PI * .1]);
      await pauseBuild();
      fall({ n: 2600, at: [4, 9, 34], box: [60, 22, 70], color: 0xffffff, size: .16, vy: 1.1, sway: .5, opacity: .85 });
      await pauseBuild();
    },
  };
}
