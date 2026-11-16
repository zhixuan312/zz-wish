// Pine Gate Steps: a long flight of stone steps between tall pines, the mountain gate half hidden at the top.
// The lamp is a small candle in a stone niche cut into the gate pier, lighting the last few steps.
export default function createPlace(h) {
  const { THREE, V3, M, roofMat, ground, pave, hallB, gateB, compound, trees, peak, mist, stairs, box, rock, eave, wallWithHoles, otherLamp, pavingTex, grainTex, pauseBuild } = h;
  return {
    exposure: 1.1, shade: 0.3,
    sky: { top: 0x060a0e, horizon: 0x222a2e, ground: 0x0c0f10, sun: 0xd8e2e6, dir: [.6, .3, -1], glow: .2, clouds: .62, lit: 0x3a4448, dark: 0x0e1214, stars: .2, disc: 1.2 },
    fog: [0x1a2124, .014], sunL: [0xb8c8cc, .5], hemi: [0x344044, 0x0c0e0c, .3], bloom: [.75, .82], porch: [0xffa850, 90],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: 1, sky: { top: 0x587090, horizon: 0xdadee2, ground: 0xc8ccd2, sun: 0xfff4e0, dir: [.6, .3, -1], glow: .6, clouds: .35, lit: 0xffffff, dark: 0xa8b0bc }, fog: [0xc6ced6, .0055], sunL: [0xfff2dc, 2], hemi: [0xc0d0e0, 0x384030, .85], bloom: [.4, 1.3] },
    view: { pos: V3(28, 18, 62), look: V3(0, 8, -8) },
    walk: [V3(0, 1.7, 40), V3(0, 1.7, 24), V3(0, 2.0, 13), V3(.2, 3.4, 8.5)], doors: V3(0, 5.4, 1),
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
      gateB({ z: 18, w: 10, wall: C.red, roof: green });
      await pauseBuild();
      compound(18, -26, 24, 3.4, C.red, green);
      await pauseBuild();
      const T = trees();
      await pauseBuild();
      for (let i = 0; i < 40; i++) { const a = C.rnd() * 6.28, r = 28 + C.rnd() * 22; T.pine(Math.cos(a) * r, 0, Math.sin(a) * r - 6, 1.3 + C.rnd(), 0x26382a); }
      // Tall pines crowding both sides of the steps.
      for (let i = 0; i < 46; i++) { const side = C.rnd() < .5 ? -1 : 1, z = 10 + C.rnd() * 40; T.pine(side * (5.5 + C.rnd() * 9), z > 10 && z < 18 ? 4 - (z - 10) * .2 : 0, z, 2.2 + C.rnd() * 1.4, 0x1e3024, true); }
      await pauseBuild();
      T.finish();
      await pauseBuild();
      const mtn = M(0x2e4232, 1);
      await pauseBuild();
      for (const [x, z, r, h, s] of [[-120, -160, 70, 190, 1], [-60, -260, 90, 230, 2], [90, -200, 80, 210, 3], [200, -130, 70, 170, 4], [-200, -90, 80, 160, 5], [150, -330, 110, 250, 6], [-230, -280, 100, 220, 7]]) peak(x, -140, z, r, h, mtn, s * 7, 1.4);
      await pauseBuild();
      peak(40, -140, -300, 70, 270, mtn, 99, 1.6);
      await pauseBuild();
      mist({ n: 120, at: [0, -16, -60], box: [600, 14, 500], color: 0xf4f6f8, opacity: .55, size: 70, drift: 1.2 });
      await pauseBuild();
      mist({ n: 18, at: [0, 2, 10], box: [120, 4, 80], color: 0xf0f2f4, opacity: .14, size: 20 });
      await pauseBuild();
    },

    // The gate pier at the top of the steps: a niche cut in the stone, the red gate leaf half open beside it.
    nook: {
      at: { pos: V3(-1.8, 4, .9), ry: 0 },
      lamp: 'niche', y: 1.0, exposure: 1.1, bloom: [.36, 1],
      approach: [V3(1.2, .2, 6.5), V3(1.0, .6, 4.2)],
      wide: { pos: V3(.62, .95, 2.5), look: V3(.15, 1.22, 0) },
      async build(hh, C) {
        const stone = M(0x7e786c, .93, { map: pavingTex }), dark = M(0x4a463e, .95, { map: pavingTex }), red = M(0x6a1a12, .6), wood = M(0x3a2618, .75, { map: grainTex });
        // The pier, with the niche: a square opening under a round head, its back blackened by years of flames.
        wallWithHoles({ x0: -.62, x1: .62, y0: 0, y1: 2.6, z: .22, depth: .64, m: stone, uv: .9, holes: [{ x0: -.18, x1: .18, y0: 1.0, y1: 1.48, arch: true }] });
        box(.36, .48, .02, M(0x5a554c, .95, { map: pavingTex }), 0, 1.24, -.15);
        box(.44, .05, .44, dark, 0, .975, .05);
        const soot = new THREE.Mesh(new THREE.PlaneGeometry(.3, .32), new THREE.MeshBasicMaterial({ map: hh.sootTex, color: 0x000000, transparent: true, opacity: .55, depthWrite: false }));
        soot.position.set(0, 1.36, -.138); C.G.add(soot);
        box(1.4, .3, .8, stone, 0, 2.75, -.1);
        // The gate: posts, a threshold, one leaf swung open, studs on the leaf.
        for (const x of [.72, 2.92]) box(.24, 2.8, .3, red, x, 1.4, -.1);
        box(2.4, .18, .4, dark, 1.82, .09, -.1);
        const leaf = new THREE.Group(); leaf.position.set(.86, 0, -.06); leaf.rotation.y = -1.05; C.G.add(leaf);
        const lm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.5, .08), red); lm.position.set(.5, 1.33, 0); lm.castShadow = lm.receiveShadow = true; leaf.add(lm);
        for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) { const st = new THREE.Mesh(new THREE.SphereGeometry(.022, 10, 8), M(0x8a6a34, .4, { metalness: .9 })); st.position.set(.18 + c * .22, .4 + r * .36, .05); leaf.add(st); }
        box(2.6, .26, .34, wood, 1.82, 2.7, -.1);
        eave({ x0: -.9, x1: 3.4, y: 3.05, z: .9, depth: 1.6, rise: .6, tile: 0x3a3c3a });
        // The wall running off to the left, low, with its own niche and two lamps someone left earlier.
        wallWithHoles({ x0: -3.4, x1: -.62, y0: 0, y1: 1.7, z: .05, depth: .5, m: stone, uv: .9, holes: [{ x0: -1.46, x1: -1.02, y0: .86, y1: 1.26, arch: true }] });
        box(.44, .04, .3, dark, -1.24, .84, -.17);
        box(2.9, .16, .62, M(0x3a3c3a, .8), -2.0, 1.78, -.2);
        otherLamp('niche', -1.33, .86, -.2, .45); otherLamp('niche', -1.14, .86, -.24, .75);
        // A lantern under the gate eave, so the steps are not climbed in the dark.
        hh.lanterns([[1.82, 2.32, .3]], .34);
        const gateLight = new THREE.PointLight(0xff8a40, 14, 9, 2); gateLight.position.set(1.82, 2.2, .45); C.G.add(gateLight);
        // The landing at the top of the flight, worn and mossy at its edges.
        box(4.6, .2, 1.6, stone, .6, -.1, .5);
        rock(-2.2, -.3, 1.6, [.6, .45, .5], 61); rock(3.4, -.3, 1.4, [.5, .4, .5], 63);
        await pauseBuild();
      },
    },
  };
}
