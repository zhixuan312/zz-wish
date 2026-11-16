// Loaded only when this place is visited.
export default function createPlace(h) {
  const { THREE, V3, M, roofMat, ground, pave, hallB, gateB, compound, trees, ridges, paifang, fall, tower, pavingTex, pauseBuild } = h;
  return {
    sky: { top: 0x545a62, horizon: 0x9c9c98, ground: 0x4a4440, sun: 0xd0d0d0, dir: [0, .6, -1], glow: .1, clouds: .92, lit: 0xa0a2a6, dark: 0x5a5e66, disc: 0 },
    fog: [0x8a8c8e, .013], sunL: [0xdfe4ea, .9], hemi: [0xa8b0b8, 0x3a3530, 1.1], bloom: [.45, 1.2],
    view: { pos: V3(18, 4.5, 66), look: V3(0, 10, -10) },
    walk: [V3(0, 1.7, 44), V3(0, 1.7, 26), V3(0, 1.7, 14), V3(0, 1.7, 8)], doors: V3(0, 3.5, 4),
    async build() {
      const C = h.context;
      ground(0x6a5c46, { rough: .55 }); pave(0, 30, 6, 34, 0, M(0x6e6a62, .3, { map: pavingTex }));
      await pauseBuild();
      const green = roofMat(0x3e6c4c, true);
      await pauseBuild();
      hallB({ z: -4, w: 20, d: 12, h: 6.5, eaves: 2, wall: C.red, roof: green });
      await pauseBuild();
      tower({ z: -36, w: 15, d: 12, floors: 2, fh: 7.5, wall: C.red, roof: green });
      await pauseBuild();
      gateB({ z: 14, w: 10, wall: C.red, roof: green, text: '关帝庙' });
      await pauseBuild();
      paifang(26, 10, 6.5, C.col, green);
      await pauseBuild();
      compound(14, -46, 24, 4, C.red, green);
      await pauseBuild();
      for (let i = 0; i < 8; i++) { const p = new THREE.Mesh(new THREE.CircleGeometry(1 + C.rnd() * 2, 24), new THREE.MeshPhysicalMaterial({ color: 0x2a2a2a, roughness: .02, envMapIntensity: 1 })); p.rotation.x = -Math.PI / 2; p.position.set((C.rnd() - .5) * 10, .13, 20 + C.rnd() * 26); C.G.add(p); }
      await pauseBuild();
      const T = trees();
      await pauseBuild();
      for (let i = 0; i < 26; i++) { const s = C.rnd() < .5 ? -1 : 1; T.cypress(s * (8 + C.rnd() * 30), 0, -20 + C.rnd() * 80, 1 + C.rnd() * .5, 0x2a3424); }
      await pauseBuild();
      T.finish();
      await pauseBuild();
      ridges([[340, 0, 26, 0x7a7e80], [460, 0, 40, 0x8c9092]]);
      await pauseBuild();
      fall({ kind: 'rain', n: 3200, at: [6, 10, 36], box: [70, 22, 70], color: 0xc8ccd2, vy: 16, sway: 0, wind: .8, opacity: .28 });
      await pauseBuild();
    },
  };
}
