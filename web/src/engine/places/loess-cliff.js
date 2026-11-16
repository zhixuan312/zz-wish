// An invented cave court. The lamp window, cave fronts and cliff are one continuous piece of ground.
export default function createPlace(h) {
  const { THREE, V3, M, ground, box, put, wallWithHoles, otherLamp, loessTex, papercutTex, grainTex, pavingTex, mist, pauseBuild } = h;
  return {
    exposure: 1.12, shade: .3,
    sky: { top: 0x080b12, horizon: 0x24232a, ground: 0x100e0c, sun: 0xc9d2e4, dir: [-.4, .5, .5], glow: .08, clouds: .45, lit: 0x333b4a, dark: 0x111118, stars: .6, disc: 1.1 },
    fog: [0x1c1e25, .009], sunL: [0xb6c5df, .48], hemi: [0x42495e, 0x17120e, .38], bloom: [.48, 1], porch: [0xffa45b, 8],
    day: { exposure: 1, sky: { top: 0x657f9a, horizon: 0xe0d5bd, ground: 0x8f704d, sun: 0xffebcf, dir: [-.5, .55, .5], glow: .35, clouds: .25, lit: 0xffeee0, dark: 0x8793a4 }, fog: [0xb9aa96, .006], sunL: [0xffe4c0, 2], hemi: [0xc4d5e5, 0x62503b, .85], bloom: [.3, 1.4] },
    view: { pos: V3(2.1, 1.68, 35), look: V3(-.5, 2.1, -2) },
    walk: [V3(1.8, 1.68, 27), V3(1.2, 1.68, 17), V3(.8, 1.68, 8)], doors: V3(1.85, 1.5, -3),
    async build() {
      const C = h.context, earth = M(0x8f6c46, .98, { map: loessTex }), cap = M(0x74634e, .95, { map: loessTex });
      ground(0x725c43, { mat: { map: loessTex } });
      // The lane enters through a low, plain earthen gate. A single door is pulled back into the yard.
      wallWithHoles({ x0: -9, x1: 9, y0: 0, y1: 2.7, z: 18, depth: .8, m: earth, uv: .32, holes: [{ x0: -.2, x1: 3.2, y0: 0, y1: 2.7 }] });
      box(3.65, .18, .95, cap, 1.5, 2.78, 17.65);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.45, .08), M(0x462b1b, .9, { map: grainTex })); leaf.position.set(3.17, 1.23, 17.1); leaf.rotation.y = -1.25; leaf.castShadow = leaf.receiveShadow = true; C.G.add(leaf);
      box(.5, .08, .9, cap, -.45, .04, 17.5); box(.5, .08, .9, cap, 3.45, .04, 17.5);
      // Worn earth slopes out of the yard, with a darker walking line and broken stone only at the threshold.
      box(2.7, .025, 24, M(0x5c4a36, .98, { map: loessTex }), 1.4, .013, 20);
      for (let i = 0; i < 26; i++) { const x = (C.rnd() < .5 ? -1 : 1) * (5 + C.rnd() * 9), z = 1 + C.rnd() * 32; put(new THREE.DodecahedronGeometry(.09 + C.rnd() * .18, 1), cap, x, .04, z, C.rnd() * 6.28); }
      // Thin dry grass and exposed roots along the low walls, never across the path.
      const grass = M(0x6d6042, 1, { side: THREE.DoubleSide });
      for (let i = 0; i < 160; i++) { const x = (C.rnd() < .5 ? -1 : 1) * (7.2 + C.rnd() * 7), z = -3 + C.rnd() * 38, hh = .12 + C.rnd() * .35; put(new THREE.PlaneGeometry(.015 + C.rnd() * .02, hh), grass, x, hh / 2, z, C.rnd() * 6.28); }
      await pauseBuild();
      mist({ n: 10, at: [0, .6, 24], box: [30, 1.2, 22], color: 0x9c8b76, opacity: .05, size: 10, drift: .45 });
    },
    nook: {
      at: { pos: V3(0, 0, -3), ry: 0 }, lamp: 'clay', y: 1, exposure: 1.08, bloom: [.35, 1.05],
      approach: [V3(.7, 1.65, 6), V3(.9, 1.5, 3.2)],
      wide: { pos: V3(.85, 1.35, 2), look: V3(-.15, 1.3, -.3) },
      async build(hh, C) {
        const earth = M(0x9d794e, .98, { map: loessTex }), packed = M(0x725638, .98, { map: loessTex }), wood = M(0x47301e, .85, { map: grainTex });
        // A thick cliff face with fully open arches. The front is the actual cave wall, rather than a distant scenery copy.
        const holes = [{ x0: -.58, x1: .58, y0: 1.02, y1: 2.3, arch: true }, { x0: 1.25, x1: 2.55, y0: 0, y1: 2.65, arch: true }, { x0: -3.15, x1: -1.85, y0: .92, y1: 2.3, arch: true }, { x0: -7.7, x1: -5.5, y0: 0, y1: 3.1, arch: true }, { x0: 5.2, x1: 7.5, y0: 0, y1: 3.25, arch: true }];
        wallWithHoles({ x0: -16, x1: 16, y0: 0, y1: 11, z: -.2, depth: 5.5, m: earth, uv: .34, holes });
        // Sediment shelves run through the cliff; their different thicknesses catch a thin band of moonlight.
        for (const [y, depth, tint] of [[3.5, .16, 0x8a6946], [5.6, .28, 0xa38156], [7.9, .22, 0x8c6d49], [9.8, .36, 0xa6855b]]) {
          for (let i = 0; i < 8; i++) box(4.08, .035 + (i % 3) * .025, depth, M(tint, 1, { map: loessTex }), -14 + i * 4, y + Math.sin(i * 1.7) * .12, -.14);
        }
        box(32, 1.4, 8, earth, 0, 11.6, -3.8);
        for (const x of [-18, 18]) box(5, 9, 14, earth, x, 4.5, -4.8);
        // Deep dark cave interiors stay visible through the open arches, with small pools of light far inside.
        for (const [x, w, hh2, glow] of [[-6.6, 2.2, 3.1, .18], [1.9, 1.3, 2.65, .1], [6.35, 2.3, 3.25, .14]]) {
          box(w + .15, hh2, .08, M(0x24180f, .98), x, hh2 / 2, -5.35);
          const glowM = new THREE.MeshStandardMaterial({ color: 0x291a10, roughness: 1, emissive: 0xffa25b, emissiveIntensity: glow });
          box(w * .65, hh2 * .7, .04, glowM, x, hh2 * .35, -5.29);
          box(w, .08, 5.2, packed, x, .04, -2.9);
        }
        const paper = new THREE.MeshStandardMaterial({ map: papercutTex, emissive: 0xffb875, emissiveMap: papercutTex, emissiveIntensity: .09 + .11 * C.light.n, roughness: .95, side: THREE.DoubleSide });
        for (const [x, w] of [[0, 1.16], [-2.5, 1.3]]) {
          const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.25), paper); pane.position.set(x, 1.65, -.52); C.G.add(pane);
          for (let k = -2; k <= 2; k++) box(.018, 1.25, .035, wood, x + k * w / 5, 1.65, -.46);
          for (const y of [1.08, 1.65, 2.23]) box(w, .025, .045, wood, x, y, -.44);
          box(w + .18, .065, .62, packed, x, .98, -.25);
        }
        const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 2.36, 12, 1), M(0x273141, .98, { side: THREE.DoubleSide }));
        const cp = curtain.geometry.attributes.position; for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 32) * .045); curtain.geometry.computeVertexNormals(); curtain.position.set(1.9, 1.19, -.75); C.G.add(curtain);
        otherLamp('clay', -2.5, 1, -.2, .6, .4);
        box(32, .14, 19, packed, 0, -.07, 7);
        for (const x of [-15.8, 15.8]) box(.7, 2.1, 19, earth, x, 1.05, 7);
        put(new THREE.CylinderGeometry(.42, .42, .16, 36), M(0x68645b, .94, { map: pavingTex }), -3.8, .08, 1.8);
        box(1.1, .08, .38, wood, 3.4, .4, .8); for (const x of [3.02, 3.78]) box(.08, .38, .28, wood, x, .19, .8);
        // Rough firewood against the cave wall, little earthen jars and drying grain.
        for (let i = 0; i < 16; i++) put(new THREE.CylinderGeometry(.03, .05, .55 + (i % 3) * .08, 9).rotateZ(Math.PI / 2), wood, 4.1, .07 + Math.floor(i / 4) * .08, .15 + i % 4 * .09);
        for (const x of [-4.9, 3.9]) put(new THREE.LatheGeometry([[0, 0], [.11, 0], [.16, .18], [.1, .31], [.09, .33]].map(([r,y])=>new THREE.Vector2(r,y)), 32), M(0x62472f, .95), x, 0, .3);
        await pauseBuild();
      },
    },
  };
}
