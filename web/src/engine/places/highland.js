// High White Court: white walls and flat roofs under a wide sky, ridges far off.
export default function createPlace(h) {
  const { THREE, V3, M, ground, pave, peak, ridges, box, wallWithHoles, plasterTex, pavingTex, grainTex, pauseBuild } = h;
  return {
    exposure: 1.05, shade: 0.3,
    sky: { top: 0x030716, horizon: 0x16223e, ground: 0x0e0c0c, sun: 0xdfe8ff, dir: [.35, .55, -.6], glow: .12, clouds: .08, lit: 0x2a3450, dark: 0x0a0e1c, stars: 1, disc: 1.6 },
    fog: [0x101a30, .0045], sunL: [0xb4c8ff, .9], hemi: [0x3a4c7a, 0x1a140e, .35], bloom: [.7, .8], porch: [0xffb860, 160],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: .9, sky: { top: 0x0b3d9e, horizon: 0x8ab6e6, ground: 0x6a5a48, sun: 0xffffff, dir: [.35, .8, -.5], glow: .3, clouds: .3, lit: 0xffffff, dark: 0xc4d4ea, disc: 4 }, fog: [0xa9c6ea, .004], sunL: [0xffffff, 3.1], hemi: [0x9ac0ff, 0x6a5030, .8], bloom: [.25, 2.2] },
    view: { pos: V3(3.5, 1.75, 48), look: V3(0, 2.2, 26) },
    walk: [V3(.2, 1.7, 40), V3(0, 1.7, 30), V3(1.5, 1.7, 25), V3(8, 1.7, 22), V3(15, 1.65, 21)], doors: V3(0, 1.6, 28),
    async build() {
      const C = h.context;
      const white = M(0xe0dcd2, .97, { map: plasterTex }), cap = M(0x524f48, .92), paving = M(0x8b877c, .9, { map: pavingTex }), dark = M(0x252a29, .95), wood = M(0x493b2c, .85, { map: grainTex });
      ground(0x706954); pave(0, 39, 4.2, 26, 0, paving); pave(5, 12, 33, 32, -.04, paving);
      // A thick plain entrance wall, with a deep recessed door rather than a ranked roof or ceremonial tower.
      wallWithHoles({ x0: -12, x1: 25, y0: 0, y1: 3.6, z: 28, depth: .85, m: white, uv: .4, holes: [{ x0: -1.15, x1: 1.15, y0: 0, y1: 2.8 }] });
      box(37.4, .2, 1.05, cap, 6.5, 3.7, 27.6);
      for (const x of [-1.24, 1.24]) box(.18, 2.9, .18, wood, x, 1.45, 28.03);
      box(2.7, .2, .2, wood, 0, 2.9, 28.03);
      // Courtyard boundaries and the north hall: small windows disappear into wall thickness.
      box(.7, 3.4, 30, white, -12, 1.7, 12.7); box(.9, .18, 30.2, cap, -12, 3.49, 12.7);
      box(.7, 3.4, 30, white, 25, 1.7, 12.7); box(.9, .18, 30.2, cap, 25, 3.49, 12.7);
      const holes = [{ x0: -1.2, x1: 1.2, y0: 0, y1: 2.65 }];
      for (const x of [-8, -4, 4, 8, 12]) holes.push({ x0: x - .36, x1: x + .36, y0: 2.0, y1: 3.0 });
      wallWithHoles({ x0: -11.5, x1: 14.5, y0: 0, y1: 4.5, z: -1, depth: .8, m: white, uv: .3, holes });
      box(26, 4.5, .7, white, 1.5, 2.25, -9); for (const x of [-11.5, 14.5]) box(.7, 4.5, 8, white, x, 2.25, -5);
      box(26.8, .28, 9, cap, 1.5, 4.64, -5); box(26.8, .16, 9, white, 1.5, 4.86, -5);
      for (const x of [-8, -4, 4, 8, 12]) {
        box(.67, .95, .05, dark, x, 2.5, -1.76);
        const window = new THREE.Mesh(new THREE.PlaneGeometry(.5,.72), new THREE.MeshStandardMaterial({ color: 0x17130f, emissive: 0xffa259, emissiveIntensity: .055, roughness: 1 })); window.position.set(x,2.5,-1.72); C.G.add(window);
        box(.9, .1, 1, paving, x, 1.95, -1.32);
      }
      // East wing: its southwest corner is the sheltered ledge built in the lamp frame below.
      box(9, 2.7, .6, white, 20.5, 1.35, 5.5); box(.6, 2.7, 9.3, white, 24.7, 1.35, 10.15);
      box(9.2, .2, 9.6, cap, 20.4, 2.8, 10.4); box(9.2, .12, 9.6, white, 20.4, 2.96, 10.4);
      box(.6, 2.7, 9.2, white, 16, 1.35, 10.1);
      box(4.0, 2.7, .6, white, 22.7, 1.35, 15.1);
      // Rounded coping stones, worn thresholds and sand collected along the walls ground the large blank plaster surfaces.
      for (let i=0;i<30;i++) box(.3+C.rnd()*.6,.02,.15+C.rnd()*.3,M(0x7d735f,1),-10.8+C.rnd()*34,.012,-.2+C.rnd()*.5);
      await pauseBuild();
      const mountain = M(0x647181, 1);
      peak(-130, -10, -210, 100, 150, mountain, 5, 1.1); peak(80, -10, -280, 120, 190, mountain, 9, 1.05);
      ridges([[370, 0, 165, 0x71819b, 105], [560, 0, 205, 0x93a6c5, 140]]);
      await pauseBuild();
    },

    // The inside corner of two thick white walls, out of the wind. A stone ledge, the brass lamp under its glass.
    nook: {
      at: { pos: V3(16, 0, 16), ry: 0 },
      lamp: 'chimney', y: .92, exposure: 1.05, bloom: [.38, .98],
      approach: [V3(1.6, 1.65, 4)],
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
