// High White Court: white walls and flat roofs under a wide sky, ridges far off.
export default function createPlace(h) {
  const { THREE, V3, V2, M, ground, pave, peak, ridges, box, put, smokeAt, pavingTex, pauseBuild } = h;
  return {
    exposure: 1.05, shade: 0.3,
    sky: { top: 0x030716, horizon: 0x16223e, ground: 0x0e0c0c, sun: 0xdfe8ff, dir: [.35, .55, -.6], glow: .12, clouds: .08, lit: 0x2a3450, dark: 0x0a0e1c, stars: 1, disc: 1.6 },
    fog: [0x101a30, .0045], sunL: [0xb4c8ff, .9], hemi: [0x3a4c7a, 0x1a140e, .35], bloom: [.7, .8], porch: [0xffb860, 160],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: .9, sky: { top: 0x0b3d9e, horizon: 0x8ab6e6, ground: 0x6a5a48, sun: 0xffffff, dir: [.35, .8, -.5], glow: .3, clouds: .3, lit: 0xffffff, dark: 0xc4d4ea, disc: 4 }, fog: [0xa9c6ea, .004], sunL: [0xffffff, 3.1], hemi: [0x9ac0ff, 0x6a5030, .8], bloom: [.25, 2.2] },
    view: { pos: V3(15, 3.6, 60), look: V3(0, 9, 0) },
    walk: [V3(0, 1.7, 42), V3(4, 1.7, 28)], doors: V3(16, 1.2, 16),
    async build() {
      const C = h.context;
      ground(0x9a8a72); pave(0, 32, 80, 50, 0, M(0xb4ab9c, .9, { map: pavingTex }));
      await pauseBuild();
      // A broad white hall with flat roofs, small deep windows and a lit doorway; nothing taken from any real temple.
      const white = M(0xece6da, .95), coping = M(0x4a4846, .85);
      box(30, 8, 18, white, 0, 4, -6); box(30.6, .7, 18.6, coping, 0, 8.35, -6); box(14, 4, 10, white, 0, 10.7, -8); box(14.4, .5, 10.4, coping, 0, 12.95, -8);
      for (let x = -12; x <= 12; x += 3) if (Math.abs(x) > 2) box(.9, 1.3, .2, M(0x1a1410, .8), x, 5.2, 3.05);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.4), new THREE.MeshStandardMaterial({ color: 0x1a0e08, emissive: 0xffa04a, emissiveIntensity: 1.2 })); door.position.set(0, 1.7, 3.06); C.G.add(door);
      await pauseBuild();
      for (const s of [-1, 1]) { const g = new THREE.LatheGeometry([[0, 0], [1.6, 0], [1.6, .5], [1.1, .7], [1.2, 2.2], [.8, 2.4], [.5, 3.6], [.15, 4.4], [0, 4.6]].map(([a, b]) => V2(a, b)), 24); put(g, M(0xefe9dc, .95), s * 8, 0, 22); smokeAt(s * 8, 3.4, 22, { color: 0xf0eee8, size: .7, spread: .6, op: .35, k: 20, rate: .8 }); }
      await pauseBuild();
      await pauseBuild();
      await pauseBuild();
      await pauseBuild();
      const snowM = M(0x8a7a6a, 1);
      await pauseBuild();
      peak(-120, 0, -200, 90, 110, snowM, 5, 1.2); peak(60, 0, -240, 110, 140, snowM, 9, 1.3);
      await pauseBuild();
      ridges([[320, 0, 130, 0x7a8aa8, 95], [460, 0, 170, 0x9aaccc, 120]]);
      await pauseBuild();
    },

    // The inside corner of two thick white walls, out of the wind. A stone ledge, the brass lamp under its glass.
    nook: {
      at: { pos: V3(16, 0, 16), ry: 0 },
      lamp: 'chimney', y: .92, exposure: 1.05, bloom: [.38, .98],
      approach: [V3(1.6, 1.6, 4)],
      wide: { pos: V3(1.7, 1.45, 2.1), look: V3(.1, 1.1, -.1) },
      async build(hh) {
        const { M, box, fall, otherLamp, plasterTex, pavingTex, grainTex, pauseBuild } = hh;
        const white = M(0xece8de, .95, { map: plasterTex }), cap = M(0x3a3836, .85), stoneM = M(0x7a766e, .85, { map: pavingTex }), wood = M(0x3a2618, .7, { map: grainTex });
        box(4.6, 2.7, .55, white, 2.0, 1.35, -.58); box(.55, 2.7, 3.4, white, -.58, 1.35, 1.1);
        box(4.7, .16, .65, cap, 2.0, 2.78, -.58); box(.65, .16, 3.4, cap, -.58, 2.78, 1.1);
        for (let x = .1; x < 4.2; x += .3) box(.08, .08, .14, wood, x, 2.58, -.26);
        // The ledge in the corner, worn smooth; another further along the wall.
        box(.64, .06, .52, stoneM, .02, .89, -.04); box(.6, .86, .08, stoneM, .02, .43, .18);
        box(.5, .05, .4, stoneM, 2.4, .89, -.1);
        otherLamp('chimney', 2.4, .92, -.1, .55);
        box(8, .16, 6, M(0x5e5a54, .9, { map: pavingTex }), 1.5, -.08, 2);
        await pauseBuild();
        fall({ n: 300, at: [1, 1.6, 2], box: [8, 3.4, 5], color: 0xe6e2da, size: .012, vy: .2, sway: .6, wind: 2.2, opacity: .5 });
        await pauseBuild();
      },
    },
  };
}
