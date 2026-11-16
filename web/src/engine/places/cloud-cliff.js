// Cloud Cliff Court: halls built out from a sheer cliff on long posts, a sea of cloud far below.
// The lamp is a brass storm lantern hung inside the gallery that runs along the cliff edge.
export default function createPlace(h) {
  const { THREE, V3, M, roofMat, hallB, box, put, peak, rock, mist, eave, col, rail, cloudSea, otherLamp, trees, pauseBuild, latticeTex, grainTex } = h;
  return {
    exposure: 1.2, shade: 0.35,
    sky: { top: 0x050811, horizon: 0x1c2638, ground: 0x0c1018, sun: 0xdde6ff, dir: [.3, .26, .92], glow: .3, clouds: .25, lit: 0x3a4660, dark: 0x0c1018, stars: .7, disc: 1.6 },
    fog: [0x141c28, .004], sunL: [0xb8c8ec, .7], hemi: [0x3a4a6a, 0x0a0c10, .4], bloom: [.8, .8], porch: [0xffa04a, 160],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: 1, sky: { top: 0x5a86c0, horizon: 0xe2e8ee, ground: 0xc8d0da, sun: 0xfff2dc, dir: [.3, .4, .92], glow: .6, clouds: .2, lit: 0xffffff, dark: 0xb8c4d4 }, fog: [0xd4dce6, .0022], sunL: [0xfff0dc, 2.1], hemi: [0xd0dcea, 0x606a74, .9], bloom: [.38, 1.3] },
    view: { pos: V3(34, 8, 58), look: V3(-2, 7, -6) },
    walk: [V3(14, 1.7, 30), V3(7, 1.7, 15)], doors: V3(0, 1.7, 3),
    async build() {
      // The sea of cloud itself belongs to the gallery, below.
      await pauseBuild();
      // The cliff: a wall of rock rising behind the halls and falling away below them.
      const cliff = M(0x4e4a46, 1);
      peak(-12, -120, -40, 70, 260, cliff, 3, .5); peak(30, -120, -55, 60, 230, cliff, 9, .55); peak(-55, -120, -20, 50, 200, cliff, 15, .6);
      rock(-14, -6, -8, [8, 22, 8], 21); rock(16, -10, -10, [9, 18, 7], 27);
      await pauseBuild();
      // Platforms on long posts, stepping down the cliff, each with a hall.
      const wood = M(0x4a3020, .8, { map: grainTex }), dark = roofMat(0x2e3034), red = M(0x6a2418, .8);
      for (const [x, y, z, w] of [[0, 0, 0, 12], [-14, 7, -6, 9], [13, -6, -4, 8]]) {
        box(w + 3, .4, 9, wood, x, y - .2, z);
        for (let px = -w / 2 - 1; px <= w / 2 + 1; px += 2) for (const pz of [-3.5, 3.5]) { box(.3, 60, .3, wood, x + px, y - 30.4, z + pz); }
        for (let k = 0; k < 6; k++) { const strut = new THREE.BoxGeometry(.22, 9, .22); strut.rotateX(.5); put(strut, wood, x + (k - 2.5) * 2, y - 4, z + 1.5); }
        await pauseBuild();
        hallB({ x, y, z: z - (x === 0 && y === 0 ? 3.4 : 1.5), w, d: 5.5, h: 4, wall: red, roof: dark, base: .3, glow: 1.4 });
        await pauseBuild();
      }
      // The plank way along the cliff that brings you here.
      for (let i = 0; i < 18; i++) box(2.2, .2, 2, wood, 6 + i * 1.4, -.1, 4.5 + i * 1.6, -.7);
      await pauseBuild();
      const T = trees();
      for (const [x, y, z] of [[-20, 6, -4], [-24, 12, -10], [20, -4, -8], [8, 10, -12]]) T.pine(x, y, z, 1.4, 0x22301e, true);
      T.finish();
      await pauseBuild();
      peak(-260, -90, 420, 90, 220, M(0x34383c, 1), 41, 1.4); peak(180, -90, 520, 110, 260, M(0x30343a, 1), 43, 1.3); peak(420, -90, 300, 80, 170, M(0x383c40, 1), 47, 1.5);
      await pauseBuild();
      mist({ n: 24, at: [0, -40, -60], box: [300, 16, 120], color: 0xe8eef6, opacity: .3, size: 40, drift: 6 });
      await pauseBuild();
    },
    // The gallery on the cliff edge. The lantern hangs from a bracket on the middle column; the rail and the
    // cloud sea are in front of it, the hall's lattice doors behind.
    nook: {
      at: { pos: V3(0, 0, 3.2), ry: 0 },
      lamp: 'lantern', y: 1.86, exposure: 1.05, bloom: [.42, .95],
      approach: [V3(2.2, 1.6, .7)],
      wide: { pos: V3(1.35, 1.6, 1.0), look: V3(-.25, 1.55, -.3) },
      cover: { pos: V3(-.28, 1.52, -.42), look: V3(1.05, 1.45, 1.25) },
      async build(hh, C) {
        const wood = M(0x3a2618, .72, { map: grainTex }), red = M(0x5a1a12, .55), floorM = M(0x5a4030, .8, { map: grainTex });
        // Floor planks over joists, open to the drop at the edge.
        for (let z = -1.1; z < 1.3; z += .2) box(7.2, .05, .18, floorM, 0, -.025, z + .1);
        for (let x = -3.4; x <= 3.4; x += 1.1) box(.12, .2, 2.6, wood, x, -.15, .1);
        box(7.2, .22, .14, wood, 0, -.12, 1.28);
        // Posts and struts under the gallery, going down into the cloud.
        for (const x of [-2.6, 0, 2.6]) { box(.2, 40, .2, wood, x, -20.2, 1.2); const s = new THREE.BoxGeometry(.14, 3, .14); s.rotateX(-.6); put(s, wood, x, -1.4, .55); }
        rail(-3.4, 3.4, 1.18, .92, wood);
        // Columns, the hall front with its lattice doors faintly lit from inside.
        for (const x of [-2.6, 0, 2.6]) col(x, -.32, 2.7, .1, red);
        box(7.2, .2, .2, red, 0, 2.62, -.32);
        const doors = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 2.4), new THREE.MeshStandardMaterial({ color: 0x1a0e08, emissive: 0xffa04a, emissiveMap: latticeTex, emissiveIntensity: .14 + .12 * C.light.n, roughness: .8 }));
        doors.position.set(0, 1.3, -1.12); C.G.add(doors);
        box(7.2, .3, .3, wood, 0, 2.62, -1.15);
        eave({ x0: -3.6, x1: 3.6, y: 2.78, z: 1.55, depth: 2.6, rise: .7, tile: 0x34363a });
        // The bracket the lantern hangs from, and one more for the lamp already burning by the rail.
        box(.06, .06, .38, wood, 0, 1.93, -.14); box(.012, .1, .012, M(0x2a2018, .5, { metalness: .6 }), 0, 1.88, 0);
        box(.06, .06, .5, wood, .95, 1.93, .38); box(.012, .1, .012, M(0x2a2018, .5, { metalness: .6 }), .95, 1.88, .62);
        C.cover = otherLamp('lantern', .95, 1.86, .62, .7, .5, 1);
        // The cliff face the gallery is fixed to, on the left.
        hh.rock(-5.2, -6, -.5, [2.4, 12, 3.2], 33); hh.rock(-4.6, -1, 2.8, [1.6, 5, 2.2], 35);
        await pauseBuild();
        cloudSea({ y: -38, speed: 14 });
        // Far ridges just breaking through the cloud, fading into it.
        hh.ridges([[520, -46, 26, 0x3a424c, undefined, true], [760, -46, 42, 0x4a525c, undefined, true]]);
        // Cloud tearing past just below the rail, fast.
        mist({ n: 26, at: [0, -6, 22], box: [90, 10, 40], color: 0xdfe6ee, opacity: .28, size: 14, drift: 5 });
        await pauseBuild();
      },
    },
  };
}
