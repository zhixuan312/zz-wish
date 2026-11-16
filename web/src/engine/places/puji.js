// Loaded only when this place is visited.
export default function createPlace(h) {
  const { THREE, V3, M, roofMat, ground, pave, hallB, gateB, compound, trees, peak, water, archBridge, lotus, box, pauseBuild } = h;
  return {
    sky: { top: 0x5c6ea2, horizon: 0xf6c4aa, ground: 0x3a4a5a, sun: 0xffd2a0, dir: [-1, .07, -.45], glow: 1.1, clouds: .4, lit: 0xffd4c0, dark: 0x8a7a98 },
    fog: [0xe0bcb2, .009], sunL: [0xffc8a0, 1.9], hemi: [0xa8b0d8, 0x504040, .75], bloom: [.5, 1.1],
    view: { pos: V3(-22, 8, 70), look: V3(3, 4, 12) },
    walk: [V3(0, 1.7, 50), V3(0, 1.9, 40), V3(0, 4, 31), V3(0, 1.9, 23), V3(0, 1.7, 14), V3(0, 1.7, 8)], doors: V3(0, 3.5, 4),
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
      gateB({ z: 16, w: 11, wall: yellow, roof: grey, text: '普济寺' });
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
  };
}
