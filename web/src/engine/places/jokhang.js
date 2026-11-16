// Loaded only when this place is visited.
export default function createPlace(h) {
  const { THREE, V3, V2, M, ground, pave, peak, ridges, tibetan, flags, put, smokeAt, pavingTex, pauseBuild } = h;
  return {
    exposure: .9,
    sky: { top: 0x0b3d9e, horizon: 0x8ab6e6, ground: 0x6a5a48, sun: 0xffffff, dir: [.35, .8, -.5], glow: .3, clouds: .3, lit: 0xffffff, dark: 0xc4d4ea, disc: 4 },
    fog: [0xa9c6ea, .004], sunL: [0xffffff, 3.1], hemi: [0x9ac0ff, 0x6a5030, .8], bloom: [.25, 2.2],
    view: { pos: V3(15, 3.6, 60), look: V3(0, 9, 0) },
    walk: [V3(0, 1.7, 42), V3(0, 1.7, 26), V3(0, 1.7, 18)], doors: V3(0, 3, 12),
    async build() {
      const C = h.context;
      ground(0x9a8a72); pave(0, 32, 80, 50, 0, M(0xb4ab9c, .9, { map: pavingTex }));
      await pauseBuild();
      tibetan({ w: 36, d: 22, h: 9.5 });
      await pauseBuild();
      for (const s of [-1, 1]) { const g = new THREE.LatheGeometry([[0, 0], [1.6, 0], [1.6, .5], [1.1, .7], [1.2, 2.2], [.8, 2.4], [.5, 3.6], [.15, 4.4], [0, 4.6]].map(([a, b]) => V2(a, b)), 24); put(g, M(0xefe9dc, .95), s * 8, 0, 22); smokeAt(s * 8, 3.4, 22, { color: 0xf0eee8, size: .7, spread: .6, op: .35, k: 20, rate: .8 }); }
      await pauseBuild();
      put(new THREE.CylinderGeometry(.18, .26, 18, 10), M(0x6a4a2a, .8), -14, 9, 30);
      await pauseBuild();
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; flags(V3(-14, 17.5, 30), V3(-14 + Math.cos(a) * 12, .6, 30 + Math.sin(a) * 12), 26, .8); }
      await pauseBuild();
      flags(V3(-18, 9.8, 11), V3(-6, 14.6, -4), 30, .6); flags(V3(18, 9.8, 11), V3(6, 14.6, -4), 30, .6); flags(V3(-18, 9.8, 11), V3(18, 9.8, 11), 70, 1.5);
      await pauseBuild();
      const snowM = M(0x8a7a6a, 1);
      await pauseBuild();
      peak(-120, 0, -200, 90, 110, snowM, 5, 1.2); peak(60, 0, -240, 110, 140, snowM, 9, 1.3);
      await pauseBuild();
      ridges([[320, 0, 130, 0x7a8aa8, 95], [460, 0, 170, 0x9aaccc, 120]]);
      await pauseBuild();
    },
  };
}
