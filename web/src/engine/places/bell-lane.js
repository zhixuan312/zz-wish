// Lane's End Bell Court: past the last lit shops of a narrow lane, a small door into a quiet court.
export default function createPlace(h) {
  const { V3, M, roofMat, ground, pave, hallB, compound, trees, ridges, paifang, fall, petalTex, pauseBuild } = h;
  return {
    exposure: 1.1, shade: 0.3,
    sky: { top: 0x0a0d1a, horizon: 0x34302e, ground: 0x12100c, sun: 0xf4e4c0, dir: [-.7, .4, -.35], glow: .3, clouds: .2, lit: 0x4c4636, dark: 0x12121a, stars: .6, disc: 1.6 },
    fog: [0x1e1c1c, .009], sunL: [0xe8dcc0, .6], hemi: [0x3e4256, 0x14100a, .33], bloom: [.75, .82], porch: [0xffaa50, 100],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: 1, sky: { top: 0x4f7cc0, horizon: 0xeadab8, ground: 0x7a6a50, sun: 0xffd8a0, dir: [-.7, .35, -.35], glow: .6, clouds: .28, lit: 0xfff4e4, dark: 0xb8c0d0 }, fog: [0xd8c8a8, .0065], sunL: [0xffd49a, 2.3], hemi: [0xb0c4e0, 0x5a4630, .7], bloom: [.4, 1.3] },
    view: { pos: V3(-15, 8, 66), look: V3(3, 7, 2) },
    walk: [V3(0, 1.7, 46), V3(0, 1.7, 30), V3(4, 1.7, 18)], doors: V3(17, 1.2, 8),
    async build() {
      const C = h.context;
      ground(0x8a7a5a); pave(0, 34, 6, 30); pave(0, 8, 30, 12);
      await pauseBuild();
      const yel = roofMat(0x55585c), marble = M(0xb8b4ac, .85);
      await pauseBuild();
      hallB({ z: -6, w: 26, d: 15, h: 8, eaves: 2, wall: C.red, roof: yel, base: 2.4, baseM: marble });
      await pauseBuild();
      hallB({ z: 12, w: 5.5, d: 5.5, h: 3.2, eaves: 2, wall: C.red, roof: yel, base: .8, glow: 0 });
      await pauseBuild();
      paifang(22, 12, 6, marble, roofMat(0x3d6a56, true));
      await pauseBuild();
      compound(22, -26, 28, 4.2, C.red, yel);
      await pauseBuild();
      const T = trees();
      await pauseBuild();
      for (let z = 26; z < 76; z += 4.5) for (const s of [-1, 1]) T.cypress(s * (5.5 + C.rnd() * 3), 0, z + C.rnd() * 2, 1 + C.rnd() * .5, 0x2a3a26);
      await pauseBuild();
      for (let i = 0; i < 30; i++) { const s = C.rnd() < .5 ? -1 : 1; T.cypress(s * (12 + C.rnd() * 30), 0, -30 + C.rnd() * 100, 1 + C.rnd() * .6, 0x2a3a26); }
      await pauseBuild();
      for (const [x, z] of [[-16, 6], [16, 4], [-20, 30], [20, 34], [-34, 50], [30, 58]]) T.broad(x, 0, z, 2.4, 0xd9a52c);
      await pauseBuild();
      T.finish();
      await pauseBuild();
      ridges([[300, 0, 30, 0xb8b0a0]]);
      await pauseBuild();
      fall({ n: 360, at: [0, 7, 30], box: [60, 14, 60], color: 0xe8b434, size: .35, vy: .9, sway: 1.2, opacity: 1, tex: petalTex });
      await pauseBuild();
    },

    // A quiet court of grey brick: the bell tower behind, a small door in the wall left ajar onto the lit lane.
    // The wooden lattice lamp stands on the brick floor and lays its square light around it.
    nook: {
      at: { pos: V3(17, 0, 8), ry: -Math.PI / 2 },
      lamp: 'lattice', y: 0, exposure: 1.1, bloom: [.38, .98],
      approach: [V3(.6, 1.6, 4.5)],
      wide: { pos: V3(1.5, 1.55, 2.6), look: V3(-.3, .85, -.8) },
      async build(hh, C) {
        const { THREE, M, box, put, col, trees, bell, wallWithHoles, otherLamp, brickTex, pavingTex, windowsTex, pauseBuild } = hh;
        const bricks = brickTex.clone(); bricks.repeat.set(5, 4); bricks.needsUpdate = true;
        const wallB = brickTex.clone(); wallB.repeat.set(.5, .5); wallB.needsUpdate = true;
        const floor = M(0x6a6a6c, .85, { map: bricks }), wall = M(0x6e6e72, .92, { map: wallB }), red = M(0x6a1c14, .55);
        box(12, .1, 10, floor, 0, -.05, 0);
        // The bell tower: a brick podium with an arched passage, the pavilion and its bell above.
        wallWithHoles({ x0: -2, x1: 2, y0: 0, y1: 3.2, z: -3.6, depth: 3.6, m: wall, uv: .5, holes: [{ x0: -.7, x1: .7, y0: 0, y1: 2.2, arch: true }] });
        for (const [x, z] of [[-1.5, -4.0], [1.5, -4.0], [-1.5, -6.8], [1.5, -6.8]]) col(x, z, 2.4, .11, red, 3.2);
        put(new THREE.ConeGeometry(2.9, 1.4, 4).rotateY(Math.PI / 4), hh.roofMat(0x34363a), 0, 6.5, -5.4);
        bell(0, 5.5, -5.4, .9, M(0x4a3a24, .45, { metalness: .9 }));
        // The wall on the left with a small door left ajar; the lane beyond is still lit.
        wallWithHoles({ x0: -6.5, x1: -2.1, y0: 0, y1: 2.8, z: -1.6, depth: .4, m: wall, uv: .5, holes: [{ x0: -3.9, x1: -3.1, y0: 0, y1: 2.0 }] });
        box(4.6, .14, .6, M(0x34363a, .8), -4.3, 2.86, -1.8);
        const lane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), new THREE.MeshStandardMaterial({ color: 0x100804, emissive: 0xffb070, emissiveMap: windowsTex, emissiveIntensity: 1.6 })); lane.position.set(-3.5, 1.2, -2.4); C.G.add(lane);
        const glow = new THREE.PointLight(0xffa060, .8 + .6 * C.light.n, 6, 2); glow.position.set(-3.5, 1.4, -2.3); C.G.add(glow);
        const door = new THREE.Mesh(new THREE.BoxGeometry(.4, 1.96, .05), red); door.position.set(-3.7, .98, -1.4); door.rotation.y = .9; door.castShadow = true; C.G.add(door);
        // An old tree, a stone bench, one more lamp by the tower.
        const T = trees(); T.broad(3.1, 0, -2.4, 1.8, 0x2c3a26); T.finish();
        box(1.2, .08, .36, M(0x6a6660, .8, { map: pavingTex }), 2.0, .42, .4); for (const x of [1.55, 2.45]) box(.2, .4, .3, M(0x5a5650, .9), x, .2, .4);
        otherLamp('lattice', -1.4, 0, -2.6, .7, .3);
        await pauseBuild();
      },
    },
  };
}
