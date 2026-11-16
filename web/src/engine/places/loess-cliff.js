// Loess Cliff Court: arched halls cut into an ochre cliff, layer on layer of earth.
export default function createPlace(h) {
  const { THREE, V3, M, roofMat, ground, pave, hallB, gateB, compound, trees, ridges, paifang, tower, pavingTex, pauseBuild } = h;
  return {
    exposure: 1.1, shade: 0.25,
    sky: { top: 0x08090c, horizon: 0x26221f, ground: 0x0e0c0b, sun: 0xd0d0d0, dir: [0, .6, -1], glow: .05, clouds: .9, lit: 0x2e2c2c, dark: 0x101012, disc: 0 },
    fog: [0x1c1a18, .015], sunL: [0xb8c0cc, .35], hemi: [0x3a3c40, 0x120f0c, .35], bloom: [.85, .8], porch: [0xff9440, 120],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: 1, sky: { top: 0x545a62, horizon: 0x9c9c98, ground: 0x4a4440, sun: 0xd0d0d0, dir: [0, .6, -1], glow: .1, clouds: .92, lit: 0xa0a2a6, dark: 0x5a5e66, disc: 0 }, fog: [0x8a8c8e, .013], sunL: [0xdfe4ea, .9], hemi: [0xa8b0b8, 0x3a3530, 1.1], bloom: [.45, 1.2] },
    view: { pos: V3(18, 4.5, 66), look: V3(0, 10, -10) },
    walk: [V3(0, 1.7, 44), V3(0, 1.7, 26), V3(-2, 1.7, 10)], doors: V3(-14, 1.6, 2),
    async build() {
      const C = h.context;
      ground(0x6a5c46, { rough: .55 }); pave(0, 30, 6, 34, 0, M(0x6e6a62, .3, { map: pavingTex }));
      await pauseBuild();
      const green = roofMat(0x4a4642);
      await pauseBuild();
      hallB({ z: -4, w: 20, d: 12, h: 6.5, eaves: 2, wall: C.red, roof: green });
      await pauseBuild();
      tower({ z: -36, w: 15, d: 12, floors: 2, fh: 7.5, wall: C.red, roof: green });
      await pauseBuild();
      gateB({ z: 14, w: 10, wall: C.red, roof: green });
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
      await pauseBuild();
    },

    // A cave dwelling cut into the loess cliff: an arched window with red paper-cuts, the clay lamp on its sill.
    nook: {
      at: { pos: V3(-14, 0, 2), ry: Math.PI / 2 },
      lamp: 'clay', y: 1.0, exposure: 1.1, bloom: [.38, .98],
      approach: [V3(0, 1.6, 4.5)],
      wide: { pos: V3(.85, 1.35, 2.0), look: V3(-.15, 1.3, -.3) },
      async build(hh, C) {
        const { THREE, M, box, put, wallWithHoles, otherLamp, loessTex, papercutTex, grainTex, pauseBuild } = hh;
        const loess = M(0xb08a5c, .97, { map: loessTex }), packed = M(0x7e6040, .95, { map: loessTex }), wood = M(0x4a3020, .7, { map: grainTex });
        wallWithHoles({ x0: -6, x1: 6, y0: 0, y1: 7, z: -.2, depth: .7, m: loess, uv: .45, holes: [{ x0: -.58, x1: .58, y0: 1.02, y1: 2.3, arch: true }, { x0: 1.35, x1: 2.35, y0: 0, y1: 2.4, arch: true }, { x0: -2.95, x1: -1.85, y0: 1.02, y1: 2.2, arch: true }] });
        // The window: a wooden lattice with paper and red paper-cuts, lit a little from the room inside.
        const paper = new THREE.MeshStandardMaterial({ map: papercutTex, emissive: 0xff9a50, emissiveMap: papercutTex, emissiveIntensity: .12 + .2 * C.light.n, roughness: .9, side: THREE.DoubleSide });
        for (const [x, w] of [[0, 1.16], [-2.4, 1.1]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.3), paper); p.position.set(x, 1.65, -.62); C.G.add(p); box(w, .06, .08, wood, x, 1.04, -.6); }
        box(1.36, .06, .62, packed, 0, .98, -.26); box(1.3, .05, .5, packed, -2.4, .98, -.32);
        // The door: a quilted cotton curtain, dark blue.
        const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.1), new THREE.MeshStandardMaterial({ color: 0x24324e, roughness: .95 })); curtain.position.set(1.85, 1.05, -.62); C.G.add(curtain);
        otherLamp('clay', -2.35, 1.0, -.2, .6, .4);
        // The yard of packed earth, a millstone, a stack of corn by the door.
        box(14, .2, 8, packed, 0, -.1, 3.6);
        put(new THREE.CylinderGeometry(.42, .42, .16, 28), M(0x6a665e, .9), -1.2, .08, 1.2);
        for (let i = 0; i < 18; i++) put(new THREE.CylinderGeometry(.03, .03, .2, 8).rotateZ(Math.PI / 2), M(0xc8962a, .7), 2.75 + (i % 6) * .02, .06 + Math.floor(i / 6) * .06, -.1 + (i % 6) * .07);
        await pauseBuild();
      },
    },
  };
}
