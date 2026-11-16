// An invented neighbourhood temple: a lit shop lane, one low door, a tree and a small bell court.
export default function createPlace(h) {
  const { THREE, V3, M, ground, box, put, wallWithHoles, eave, col, otherLamp, trees, bell, brickTex, plasterTex, grainTex, pavingTex, latticeTex, pauseBuild } = h;
  return {
    exposure: 1.12, shade: .32,
    sky: { top: 0x080d19, horizon: 0x282c38, ground: 0x0b0e15, sun: 0xe0e4ee, dir: [-.7, .5, .35], glow: .12, clouds: .3, lit: 0x424e65, dark: 0x11141c, stars: .35, disc: 1.2 },
    fog: [0x1b2230, .007], sunL: [0xc1cce4, .48], hemi: [0x424f69, 0x15140f, .35], bloom: [.45, 1.05], porch: [0xffb46a, 2.4],
    day: { exposure: 1, sky: { top: 0x6489ba, horizon: 0xe5dcc8, ground: 0x685f52, sun: 0xffe6bf, dir: [-.7, .5, .35], glow: .4, clouds: .25, lit: 0xfff2e0, dark: 0x8d9aaf }, fog: [0xc9c6bd, .004], sunL: [0xffe3b5, 2], hemi: [0xc2d5e8, 0x4c4539, .85], bloom: [.25, 1.4] },
    view: { pos: V3(.55, 1.68, 50), look: V3(.1, 1.9, 12) },
    walk: [V3(.2, 1.68, 41), V3(-.1, 1.68, 27), V3(.1, 1.68, 16), V3(.2, 1.68, 7)], doors: V3(0, 1.4, 10),
    async build() {
      const C = h.context, wall = M(0x6b6c6d, .97, { map: brickTex }), wood = M(0x3b271b, .85, { map: grainTex }), paper = M(0xb7aa8c, .96), stone = M(0x59595a, .9, { map: pavingTex });
      ground(0x444546, { mat: { map: pavingTex } }); box(7.6, .06, 48, stone, 0, .03, 34);
      // Two irregular rows of small shops make an enclosed, human-scale lane rather than an avenue to a palace.
      for (let i = 0; i < 7; i++) for (const side of [-1, 1]) {
        const z = 14 + i * 6, ht = 3.2 + (i % 3) * .32, face = side * (3.9 + (i % 2) * .16), shade = M(i % 3 === 0 ? 0x6a645a : 0x767574, .95, { map: i % 3 === 0 ? plasterTex : brickTex });
        box(3.4, ht, 5.8, shade, side * 5.6, ht / 2, z);
        // Side-facing lattice windows, dark frames, a slightly open timber shutter and a shallow tiled canopy.
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 1.55), new THREE.MeshStandardMaterial({ color: 0x4c3220, emissive: 0xffb76b, emissiveMap: latticeTex, emissiveIntensity: .16 + (i % 4) * .08, roughness: .9, side: THREE.DoubleSide })); pane.position.set(face, 1.55, z); pane.rotation.y = -side * Math.PI / 2; C.G.add(pane);
        box(.11, .1, 4.1, wood, face - side * .04, .73, z); box(.11, .12, 4.1, wood, face - side * .04, 2.4, z);
        for (const dz of [-2.05, -.68, .68, 2.05]) box(.11, 1.75, .065, wood, face - side * .04, 1.55, z + dz);
        box(.11, 2.6, .52, wood, face - side * .06, 1.3, z + 2.54);
        box(3.7, .16, 6.1, M(0x34373b, .88), side * 5.4, ht + .12, z);
        // An uneven overhang with exposed joist ends catches the shop glow.
        box(.6, .12, 5.8, wood, face - side * .2, 2.68, z);
        for (let q = 0; q < 6; q++) box(.62, .065, .055, wood, face - side * .2, 2.62, z - 2.4 + q * .9);
        const lamp = new THREE.PointLight(0xffb66c, .7 + (i % 3) * .35, 5.5, 2); lamp.position.set(face - side * .12, 1.65, z); C.G.add(lamp);
        // A low counter and baskets beside the doorway, all grounded.
        box(.46, .65, 1.4, wood, face - side * .3, .325, z - 1.2);
        put(new THREE.CylinderGeometry(.2, .16, .28, 24, 1, true), paper, face - side * .32, .14, z + 1.6);
        if (i % 2 === 0) { const sign = new THREE.Mesh(new THREE.PlaneGeometry(.38, 1.1), M(0x6e3220, .97, { side: THREE.DoubleSide })); sign.position.set(face - side * .45, 2.1, z + 2.2); sign.rotation.y = -.35 * side; C.G.add(sign); }
      }
      await pauseBuild();
      // The lane ends at this actual small doorway. The court and bell tower beyond it are already present.
      wallWithHoles({ x0: -6.3, x1: 6.3, y0: 0, y1: 3.05, z: 10, depth: .55, m: wall, uv: .75, holes: [{ x0: -.78, x1: .78, y0: 0, y1: 2.3 }] });
      box(1.8, .16, .68, wood, 0, 2.4, 9.78); box(1.65, .07, .72, stone, 0, .035, 9.7);
      const door = new THREE.Mesh(new THREE.BoxGeometry(.7, 2.25, .065), M(0x573122, .82, { map: grainTex })); door.position.set(-.8, 1.13, 9.25); door.rotation.y = -1.2; door.castShadow = door.receiveShadow = true; C.G.add(door);
      eave({ x0: -6.5, x1: 6.5, y: 3.06, z: 10.45, depth: 1.3, rise: .3, tile: 0x34383d });
      // Narrow drains and a few patched paving slabs carry the view all the way to the door.
      for (const x of [-3.45, 3.45]) box(.12, .008, 48, M(0x25282b, .95), x, .067, 34);
      for (let i = 0; i < 12; i++) box(.4 + C.rnd() * .35, .008, .6, M(0x6b6a65, .94, { map: pavingTex }), (C.rnd() - .5) * 5, .067, 14 + C.rnd() * 40);
      await pauseBuild();
    },
    nook: {
      at: { pos: V3(0, 0, -3.5), ry: 0 }, lamp: 'lattice', y: 0, exposure: 1.1, bloom: [.35, 1.02],
      approach: [V3(.4, 1.65, 7), V3(.8, 1.6, 4.2)],
      wide: { pos: V3(1.5, 1.55, 2.6), look: V3(-.3, .85, -.8) },
      async build(hh, C) {
        const bricks = brickTex.clone(); bricks.repeat.set(4, 5); bricks.needsUpdate = true;
        const wallMap = brickTex.clone(); wallMap.repeat.set(1.5, 1); wallMap.needsUpdate = true;
        const floor = M(0x626365, .9, { map: bricks }), wall = M(0x66676a, .97, { map: wallMap }), red = M(0x5e291e, .85, { map: grainTex }), wood = M(0x35251b, .86, { map: grainTex });
        box(12.6, .12, 22.6, floor, 0, -.06, 2.7);
        for (const x of [-6.3, 6.3]) box(.5, 3.05, 22.6, wall, x, 1.525, 2.7);
        box(12.6, 3.05, .5, wall, 0, 1.525, -8.6);
        for (const x of [-6.3, 6.3]) box(.66, .12, 22.6, M(0x35383d, .9), x, 3.1, 2.7);
        box(12.8, .12, .66, M(0x35383d, .9), 0, 3.1, -8.6);
        // Low bell tower with an open pavilion, timber beams and a bell genuinely suspended between them.
        wallWithHoles({ x0: -2, x1: 2, y0: 0, y1: 2.6, z: -3.6, depth: 3.6, m: wall, uv: .65, holes: [{ x0: -.7, x1: .7, y0: 0, y1: 2.1, arch: true }] });
        box(4.2, .16, 3.9, M(0x46474a, .92), 0, 2.68, -5.4);
        for (const [x,z] of [[-1.55,-4.0],[1.55,-4.0],[-1.55,-6.8],[1.55,-6.8]]) col(x, z, 2.45, .115, red, 2.75);
        for (const z of [-4, -6.8]) box(3.5, .2, .17, wood, 0, 5.13, z);
        box(.18, .22, 3.2, wood, 0, 5.1, -5.4);
        put(new THREE.CylinderGeometry(.012,.012,.22,12), M(0x463a26,.7,{metalness:.7}), 0,4.87,-5.4);
        bell(0, 4.78, -5.4, .9, M(0x4a3b27, .48, { metalness: .85 }));
        // Two simple roof slopes, underside boards and tile ends, without a ceremonial roof rank.
        eave({ x0: -2.4, x1: 2.4, y: 5.28, z: -3.15, depth: 2.25, rise: .95, tile: 0x32363c });
        const backRoof = new THREE.Group(); backRoof.position.set(0, 0, -5.4); backRoof.rotation.y = Math.PI; C.G.add(backRoof);
        // Geometry is placed directly here because the main batch remains in the court's frame.
        const slope = Math.atan2(.95,2.25), backG = new THREE.BoxGeometry(5,.11,Math.hypot(.95,2.25)); backG.rotateX(slope); backG.translate(0,5.28+.95/2+.2,1.125);
        const backM = new THREE.Mesh(backG, hh.roofMat(0x32363c)); backM.castShadow = backM.receiveShadow = true; backRoof.add(backM);
        box(4.9,.16,.18,wood,0,6.5,-5.4);
        // Old tree and an irregular stone seat. It belongs to the court, not to a background layer.
        const T = trees(); T.broad(3.8, 0, -2.3, 1.45, 0x26372b); T.finish();
        for(const [dx,dz,angle] of [[.5,0,-.65],[-.4,.25,.6],[.2,-.35,.45]]) { const g=new THREE.CylinderGeometry(.065,.12,1.4,12);g.rotateZ(angle);put(g,wood,3.8+dx,.7,-2.3+dz); }
        box(1.2,.09,.38,M(0x68665f,.94,{map:pavingTex}),2.5,.42,.7);for(const x of [2.08,2.92])box(.2,.39,.28,wall,x,.195,.7);
        otherLamp('lattice', -1.4, 0, -2.6, .65, .3);
        const glow = new THREE.PointLight(0xffb46e, 1.1, 7, 2); glow.position.set(-.8, 1.3, 12.4); C.G.add(glow);
        await pauseBuild();
      },
    },
  };
}
