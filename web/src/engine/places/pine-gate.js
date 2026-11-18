// Pine Gate Steps: a long flight of stone steps between tall pines, the mountain gate half hidden at the top.
// The lamp is a small candle in a stone niche cut into the gate pier, lighting the last few steps.
export default function createPlace(h) {
  const { THREE, V3, M, roofMat, ground, hallB, trees, peak, mist, stairs, box, put, rock, eave, wallWithHoles, otherLamp, pavingTex, grainTex, pauseBuild } = h;
  return {
    exposure: 1.1, shade: 0.3,
    sky: { top: 0x060a0e, horizon: 0x222a2e, ground: 0x0c0f10, sun: 0xd8e2e6, dir: [.6, .3, -1], glow: .2, clouds: .62, lit: 0x3a4448, dark: 0x0e1214, stars: .2, disc: 1.2 },
    fog: [0x1a2124, .014], sunL: [0xc5d4db, .68], hemi: [0x47545c, 0x10150e, .48], bloom: [.75, .82], porch: [0xffa850, 90],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: 1, sky: { top: 0x587090, horizon: 0xdadee2, ground: 0xc8ccd2, sun: 0xfff4e0, dir: [.6, .3, -1], glow: .6, clouds: .35, lit: 0xffffff, dark: 0xa8b0bc }, fog: [0xc6ced6, .0055], sunL: [0xfff2dc, 2], hemi: [0xc0d0e0, 0x384030, .85], bloom: [.4, 1.3] },
    view: { pos: V3(3.8, 2.3, 52), look: V3(-.4, 5.4, 1) },
    walk: [V3(.2, 1.7, 46), V3(-.15, 2.65, 36), V3(.2, 3.65, 26), V3(0, 4.65, 16), V3(.1, 5.65, 6)], doors: V3(-.3, 5.6, .8),
    async build() {
      const C = h.context;
      const granite = M(0x797b74, .94, { map: pavingTex }), damp = M(0x484e43, .98, { map: pavingTex }), bark = M(0x40382b, 1, { map: grainTex });
      ground(0x252e23, { y: -.12 });
      // The mountain rises under the flight and the tree roots rather than leaving trunks suspended above a flat ground plane.
      const bank = new THREE.PlaneGeometry(56, 80, 56, 80); bank.rotateX(-Math.PI / 2); bank.translate(0, 0, 20);
      const bp = bank.attributes.position;
      for (let i = 0; i < bp.count; i++) {
        const x = bp.getX(i), z = bp.getZ(i), rise = Math.max(0, Math.min(4, (46 - z) * .1));
        const shoulder = Math.max(0, Math.abs(x) - 14), ripple = Math.sin(x * 2.3 + z * .4) * .025 + Math.sin(z * 2.1) * .018;
        bp.setY(i, rise - .13 - Math.pow(shoulder, 1.2) * .25 + ripple);
      }
      bank.computeVertexNormals();
      const bankMesh = new THREE.Mesh(bank, M(0x303c2b, 1, { map: pavingTex })); bankMesh.receiveShadow = true; C.G.add(bankMesh);
      // Fifty shallow risers climb four metres. The lamp pier, gate, landing and hall all share that level.
      stairs(0, 0, 46, 50, .08, .8, 4.2, granite);
      box(10, 4, 14, damp, 0, 2, -1);
      box(13, .24, 12, granite, 0, 3.88, -3);
      for (let i = 0; i < 50; i++) {
        const z = 45.6 - i * .8, y = (i + 1) * .08;
        for (const side of [-1, 1]) {
          box(.32, .1, .78, damp, side * 2.26, y - .01, z);
          // Worn edges and moss-filled joints break the ruler-straight stair silhouette.
          if (i % 3 === 0) box(.14 + C.rnd() * .22, .018, .3, M(0x34452c, 1), side * (1.9 + C.rnd() * .12), y + .009, z - .16);
        }
      }
      await pauseBuild();
      const tile = roofMat(0x34393a);
      hallB({ x: 0, y: 4, z: -12, w: 11, d: 7, h: 3.3, wall: M(0x5c3025, .9, { map: grainTex }), roof: tile, base: .3, lift: .28, glow: .22 });
      // The low mountain wall terminates at the actual gate pier; there is no second gate on the approach.
      for (const side of [-1, 1]) {
        box(7.3, 1.5, .6, damp, side * 6, 4.75, .7);
        box(7.6, .14, .8, tile, side * 6, 5.57, .7);
      }
      await pauseBuild();
      const T = trees();
      for (let i = 0; i < 38; i++) {
        const side = i % 2 ? -1 : 1, z = 47 - (i / 2) * 2.7, y = Math.max(0, Math.min(4, (46 - z) * .1));
        const x = side * (6.2 + C.rnd() * 6.6), size = 1.1 + C.rnd() * .65;
        T.pine(x, y - .16, z, size, 0x27382b, true);
        if (i % 3 === 0) {
          rock(x, y - .2, z, [.5 + C.rnd(), .3 + C.rnd() * .35, .6 + C.rnd()], i + 13);
          const root = new THREE.CatmullRomCurve3([V3(x, y + .06, z), V3(x * .78, y + .04, z + .4), V3(side * 2.35, y - .04, z + .85)]);
          put(new THREE.TubeGeometry(root, 12, .045, 6, false), bark);
        }
      }
      T.finish(); h.addStump(-5.8,1.1,33,.8,.5);h.addStump(6.5,2.5,20,.65,-.4);await pauseBuild();
      const mountain = M(0x2c3730, 1);
      for (const [x, z, r, height, seed] of [[-100,-130,80,130,3],[80,-160,100,170,7],[-150,80,80,100,13]]) peak(x, -90, z, r, height, mountain, seed, .7);
      mist({ n: 55, at: [0, -12, 55], box: [180, 10, 140], color: 0x9aa9b2, opacity: .18, size: 24, drift: .55 });
      mist({ n: 16, at: [0, 2, 28], box: [60, 3, 60], color: 0xb4bfc0, opacity: .055, size: 12, drift: .2 });
      await pauseBuild();
    },

    // The gate pier at the top of the steps: a niche cut in the stone, the red gate leaf half open beside it.
    nook: {
      at: { pos: V3(-1.8, 4, .9), ry: 0 },
      lamp: 'pineWax', y: 1.0, exposure: 1.1, bloom: [.32, 1],
      approach: [V3(1.8, 1.65, 3.8), V3(1.2, 1.65, 2.3)],
      wide: { pos: V3(.62, 1.62, 2.5), look: V3(.15, 1.22, 0) },
      // The close views keep the shelf visible, including the trace after the flame is gone.
      choose: { pos: V3(.13, 1.29, .58), look: V3(.095, 1.075, 0), fov: 31 },
      choosePhone: { pos: V3(.09, 1.25, .56), look: V3(0, .95, 0), fov: 43 },
      burn: { pos: V3(.095, 1.24, .43), look: V3(.025, 1.075, 0), fov: 34 },
      burnPhone: { pos: V3(.085, 1.26, .53), look: V3(.005, 1.060, 0), fov: 40 },
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
        // The landing at the top of the flight, worn and mossy at its edges.
        box(4.6, .2, 1.6, stone, .6, -.1, .5);
        rock(-2.2, -.3, 1.6, [.6, .45, .5], 61); rock(3.4, -.3, 1.4, [.5, .4, .5], 63);
        await pauseBuild();
      },
    },
  };
}
