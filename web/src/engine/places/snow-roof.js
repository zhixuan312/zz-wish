// Snow Roof Court: a northern courtyard temple, deep grey tiles under thick snow.
export default function createPlace(h) {
  const { THREE, V3, roofMat, ground, gateB, compound, trees, postLanterns, fall, lanterns, tower, pauseBuild } = h;
  return {
    snow: .85, exposure: 1.2, shade: 0.4,
    sky: { top: 0x070a16, horizon: 0x2c2638, ground: 0x14121a, sun: 0xc8d4ff, dir: [.4, .5, -1], glow: .15, clouds: .75, lit: 0x4a3e4e, dark: 0x16141e, disc: 0 },
    fog: [0x221e2c, .02], sunL: [0x9fb4e0, .45], hemi: [0x4a5478, 0x1c181c, .42], bloom: [.85, .8], porch: [0xffa04a, 110],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: 1, sky: { top: 0x8494aa, horizon: 0xdadfe6, ground: 0x6a6870, sun: 0xf4f6ff, dir: [.4, .45, -1], glow: .35, clouds: .7, lit: 0xf4f4f8, dark: 0x9aa0ae, disc: 2 }, fog: [0xc6cbd4, .012], sunL: [0xf2f5ff, 1.5], hemi: [0xd4dcea, 0x585058, .95], bloom: [.35, 1.3] },
    view: { pos: V3(13, 7, 54), look: V3(0, 7, -6) },
    walk: [V3(0, 1.7, 42), V3(0, 1.7, 24), V3(0, 1.7, 17)], doors: V3(0, 2.6, 1),
    async build() {
      const C = h.context;
      ground(0xdde3ec, { rough: .9 });
      await pauseBuild();
      const yel = roofMat(0x3a3c40);
      await pauseBuild();
      // The main hall is the spot itself, built where you walk in.
      tower({ z: -36, w: 16, d: 12, floors: 3, fh: 5, wall: C.red, roof: yel });
      await pauseBuild();
      gateB({ z: 16, w: 11, wall: C.red, roof: yel });
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
      fall({ n: 2600, at: [4, 9, 34], box: [60, 22, 70], color: 0xffffff, size: .16, vy: 1.1, sway: .5, opacity: .85 });
      await pauseBuild();
    },

    // The main hall of the northern court, entered from the snow. Inside: dark stone floor, red columns, painted
    // beams, an altar with small lamps before a dim gilded screen, and the red gauze lantern hanging from the beam.
    // Behind you, through the open doors, the court lies blue-white under snow.
    nook: {
      at: { pos: V3(0, .6, -.5), ry: 0 },
      lamp: 'gauze', y: 2.62, exposure: 1.15, bloom: [.42, .92], dust: true,
      interior: { min: [-5, -.3, -6], max: [5, 4.4, 2.5] },
      approach: [V3(.5, 1.0, 11), V3(.3, 1.05, 6.4), V3(.1, 1.6, 3.6), V3(0, 1.62, 1.8)],
      wide: { pos: V3(.75, 1.62, 1.55), look: V3(0, 2.15, -.6) },
      async build(hh, C) {
        const { THREE, M, box, put, col, eave, fall, footprints, otherLamp, wallWithHoles, smokeAt, lathe, latticeTex, pavingTex, grainTex, plasterTex, pauseBuild } = hh;
        const red = M(0x6e1810, .55), paint = M(0x24504e, .62), gold = M(0xa88038, .45, { metalness: .7 }), floorM = M(0x34302c, .5, { map: pavingTex });
        const stoneM = M(0x6a6866, .8, { map: pavingTex }), snow = M(0xe4eaf2, .92), wall = M(0x5a1a12, .8, { map: plasterTex }), wood = M(0x3a2216, .7, { map: grainTex });
        // Floor, walls, ceiling. The front wall has the open doors and two lattice windows.
        box(10.6, .12, 8.8, floorM, 0, -.06, -1.8);
        wallWithHoles({ x0: -5.3, x1: 5.3, y0: 0, y1: 4.5, z: 2.7, depth: .3, m: wall, uv: .5, holes: [{ x0: -.95, x1: .95, y0: 0, y1: 3.0 }, { x0: -3.9, x1: -2.3, y0: 1.0, y1: 2.7 }, { x0: 2.3, x1: 3.9, y0: 1.0, y1: 2.7 }] });
        for (const x of [-3.1, 3.1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.7), new THREE.MeshStandardMaterial({ color: 0x1a0e08, emissive: 0xc8d4ee, emissiveMap: latticeTex, emissiveIntensity: .25 + .5 * (1 - C.light.n), roughness: .8, side: THREE.DoubleSide })); w.position.set(x, 1.85, 2.55); C.G.add(w); }
        for (const s of [-1, 1]) { const leaf = new THREE.Mesh(new THREE.BoxGeometry(.95, 2.96, .07), red); leaf.position.set(s * 1.25, 1.48, 2.1); leaf.rotation.y = s * 1.2; leaf.castShadow = leaf.receiveShadow = true; C.G.add(leaf); }
        box(1.9, .16, .4, stoneM, 0, .08, 2.55);
        box(10.6, 4.5, .3, wall, 0, 2.25, -6.1); for (const s of [-1, 1]) box(.3, 4.5, 8.8, wall, s * 5.3, 2.25, -1.8);
        box(10.6, .14, 8.8, wood, 0, 4.52, -1.8);
        for (const z of [1.6, 0, -1.8, -3.6]) { box(10.4, .26, .22, paint, 0, 4.25, z); box(10.4, .05, .23, gold, 0, 4.1, z); }
        box(.012, 4.12 - 2.62, .012, M(0x2a2018, .5, { metalness: .6 }), 0, (4.12 + 2.62) / 2, 0);
        for (const [x, z] of [[-2.7, 1.5], [2.7, 1.5], [-2.7, -3.7], [2.7, -3.7]]) col(x, z, 4.3, .17, red);
        // The altar, the gilded screen behind it, an incense burner, small lamps along the altar's edge.
        box(3.6, .95, 1.1, M(0x2a1410, .45), 0, .475, -4.5); box(3.7, .06, 1.2, gold, 0, .97, -4.5);
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.6), new THREE.MeshStandardMaterial({ color: 0x8a6a30, metalness: .75, roughness: .38, emissive: 0x3a2408, emissiveIntensity: .35 }));
        screen.position.set(0, 2.5, -5.92); C.G.add(screen);
        for (let i = 0; i < 9; i++) { const a = (i / 8 - .5) * 2.6; put(new THREE.TorusGeometry(1.5 + (i % 2) * .08, .02, 6, 40, Math.PI), gold, Math.sin(a) * .02, 2.6, -5.88); }
        put(lathe([[0, 0], [.13, 0], [.15, .04], [.12, .08], [.2, .18], [.21, .26], [.18, .27], [0, .24]], 32), gold, 0, .98, -4.4);
        smokeAt(0, 1.24, -4.4, { k: 1, size: .03, spread: .02, op: .12, rate: .35, n: 50 });
        otherLamp('gauze', -2.7, 2.62, -1.1, .7); otherLamp('gauze', 2.7, 2.62, -1.1, .5);
        for (const x of [-1.5, -1.1, -.7, .7, 1.1, 1.5]) otherLamp('glass', x, .98, -4.05, .4 + ((x * 7 % 1) + 1) % 1 * .5);
        for (const x of [-.8, .8]) put(new THREE.CylinderGeometry(.26, .28, .12, 24), M(0x8a6a28, .9), x, .06, -2.8);
        // Two more gauze lanterns others lit, hanging between the columns.
        for (const x of [-2.7, 2.7]) box(.012, 4.12 - 2.62, .012, M(0x2a2018, .5, { metalness: .6 }), x, (4.12 + 2.62) / 2, -1.1);
        const glow = new THREE.PointLight(0xffa860, 4, 9, 2); glow.position.set(0, 1.7, -3.9); C.G.add(glow);
        // The roof seen from the court: a deep grey gable under thick snow, eaves with icicles.
        const sec = new THREE.Shape(); sec.moveTo(4.9, 4.55); sec.lineTo(-1.8, 7.2); sec.lineTo(-8.5, 4.55); sec.lineTo(-8.5, 4.8); sec.lineTo(-1.8, 7.45); sec.lineTo(4.9, 4.8);
        const roof = new THREE.ExtrudeGeometry(sec, { depth: 12, bevelEnabled: false }); roof.rotateY(-Math.PI / 2); roof.translate(6, 0, 0); put(roof, hh.roofMat(0x3a3c40), 0, 0, 0);
        const cap = new THREE.Shape(); cap.moveTo(4.6, 4.86); cap.lineTo(-1.8, 7.5); cap.lineTo(-8.2, 4.86); cap.lineTo(-8.2, 5.02); cap.lineTo(-1.8, 7.68); cap.lineTo(4.6, 5.02);
        const snowCap = new THREE.ExtrudeGeometry(cap, { depth: 11.8, bevelEnabled: false }); snowCap.rotateY(-Math.PI / 2); snowCap.translate(5.9, 0, 0); put(snowCap, snow, 0, 0, 0);
        for (const s of [-1, 1]) { const tri = new THREE.Shape(); tri.moveTo(4.9, 4.55); tri.lineTo(-1.8, 7.2); tri.lineTo(-8.5, 4.55); const gable = new THREE.ShapeGeometry(tri); gable.rotateY(-Math.PI / 2); put(gable, wall, s * 5.45, 0, 0); }
        eave({ x0: -6, x1: 6, y: 4.5, z: 4.95, depth: .6, rise: .25, tile: 0x3a3c40, paint: 0x24504e, snow: true });
        // Front terrace, steps down to the court, the snow, one line of footprints toward the gate.
        box(11, .6, 2.4, stoneM, 0, -.3, 3.9); box(11.1, .06, 2.5, snow, 0, .02, 4.1);
        for (let i = 0; i < 3; i++) box(3.2, .2, .4, stoneM, 0, -.1 - i * .2, 5.3 + i * .4);
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 40, 80, 60), snow); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.58, 24);
        const gp = ground.geometry.attributes.position; for (let i = 0; i < gp.count; i++) gp.setZ(i, Math.sin(gp.getX(i) * 1.3) * .03 + Math.sin(gp.getY(i) * 2.1 + gp.getX(i)) * .02); ground.geometry.computeVertexNormals(); C.G.add(ground);
        footprints(V3(.2, -.58, 6.6), V3(1.6, -.58, 15), 22, M(0xa8b4c8, .9));
        await pauseBuild();
        fall({ n: 1600, at: [0, 2, 13], box: [16, 7, 16], color: 0xffffff, size: .03, vy: .5, sway: .25, opacity: .9 });
        await pauseBuild();
      },
    },
  };
}
