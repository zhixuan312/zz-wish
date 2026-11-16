// Lotus Pond Court: white walls and halls round a lotus pond, a low bridge across it.
export default function createPlace(h) {
  const { THREE, V3, M, roofMat, ground, pave, hallB, gateB, wallRun, trees, peak, water, archBridge, lotus, box, plasterTex, pavingTex, pauseBuild } = h;
  return {
    exposure: 1.1, shade: 0.3,
    sky: { top: 0x070c16, horizon: 0x26303e, ground: 0x0c1016, sun: 0xe8eef8, dir: [-1, .12, -.45], glow: .35, clouds: .45, lit: 0x4a5464, dark: 0x101620, stars: .35, disc: 1.5 },
    fog: [0x1a222e, .012], sunL: [0xbccce6, .6], hemi: [0x3a4a62, 0x0e1014, .32], bloom: [.75, .82], porch: [0xffa04a, 55],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: 1, sky: { top: 0x5c6ea2, horizon: 0xf6c4aa, ground: 0x3a4a5a, sun: 0xffd2a0, dir: [-1, .07, -.45], glow: 1.1, clouds: .4, lit: 0xffd4c0, dark: 0x8a7a98 }, fog: [0xe0bcb2, .009], sunL: [0xffc8a0, 1.9], hemi: [0xa8b0d8, 0x504040, .75], bloom: [.5, 1.1] },
    view: { pos: V3(3.8, 1.8, 48), look: V3(0, 2.5, 26) },
    walk: [V3(0, 1.7, 40), V3(0, 1.7, 31), V3(0, 1.7, 24), V3(0, 2.0, 18.5), V3(0, 2.7, 12)], doors: V3(0, 1.7, 30),
    async build() {
      const C = h.context;
      const white = M(0xe2e0d6, .94, { map: plasterTex }), grey = roofMat(0x41464a), granite = M(0x96958b, .86, { map: pavingTex });
      ground(0x273b2a);
      pave(0, 40, 4, 26, 0, granite); pave(0, 24, 30, 12, 0, granite);
      // The pond sits inside the walls; the lamp rail is its south edge, with the walk on the camera side.
      for (const [x, z, w, d] of [[0,-3,29,1],[0,17.5,29,1],[-14.5,7.2,1,21],[14.5,7.2,1,21]]) box(w, .7, d, granite, x, -.1, z);
      water(.05, 0x132923, { geo: new THREE.PlaneGeometry(28, 20), z: 7.2, waves: .09, env: 1, reflect:true });
      lotus(-13.5, -2.7, -2, 16.5, .08, 46); lotus(2.7, 13.5, -2, 16.5, .08, 46);
      archBridge(7.2,18,.85,3.4,granite,.03,[1]);
      // White plaster courts, low dark roofs, no ceremonial yellow or ranked roof stack.
      gateB({ z: 30, w: 8, h: 3.8, wall: white, roof: grey, lift: .2 });
      for (const side of [-1, 1]) {
        wallRun(side * 4, 30, side * 19, 30, 2.6, white, grey);
        wallRun(side * 19, 30, side * 19, -19, 2.6, white, grey);
        hallB({ x: side * 18, z: 5, w: 5.2, d: 16, h: 3, wall: white, roof: grey, base: .25, lift: .2, glow: .12 });
      }
      hallB({ z: -12, w: 19, d: 6.5, h: 3.4, wall: white, roof: grey, base: .4, lift: .24, glow: .22 });
      await pauseBuild();
      const T = trees();
      for (let i = 0; i < 36; i++) { const side = i % 2 ? -1 : 1; T.broad(side * (22 + C.rnd() * 24), 0, -28 + C.rnd() * 75, 1.1 + C.rnd(), 0x294332); }
      T.finish(); await pauseBuild();
      peak(-110, -20, -170, 90, 65, M(0x344239, 1), 12, .7);
      peak(120, -20, -220, 110, 85, M(0x2f3b39, 1), 18, .7);
      await pauseBuild();
    },

    // A pale stone rail at the pond's edge; the lamp sits on the rail and burns twice, once in the water.
    nook: {
      at: { pos: V3(-3.35, 1.2, 7.2), ry: Math.PI / 2 },
      lamp: 'lotus', y: .78, mirror: -1.15, exposure: 1.1, bloom: [.42, .95],
      approach: [V3(-3, 1.6, 3.35), V3(1, 1.6, 2.8)],
      wide: { pos: V3(.6, 1.55, 2.05), look: V3(0, .65, -.55) },
      burn: { pos: V3(.45, 1.4, 1.95), look: V3(0, .63, -.55) },
      async build(hh, C) {
        const { THREE, M, box, put, otherLamp, pavingTex, pauseBuild } = hh;
        const pale = M(0xc9c1b2, .76, { map: pavingTex });
        // An open lamp alcove projects from the bridge's west rail. The camera remains on the bridge;
        // open water lies beneath the lamp and its real reflection ray, clear of the walking deck.
        for (const x of [-.64,.64]) {
          box(.18,.18,1.85,pale,x,-.09,.82);
          box(.24,1.16,.28,pale,x,-.58,.28);
          const brace=new THREE.BoxGeometry(.13,1.2,.13); brace.rotateX(-.75); put(brace,pale,x,-.48,.8);
        }
        box(1.7,.09,.24,pale,0,.72,0);
        for(const x of [-.78,.78]) {
          box(.14,.72,.18,pale,x,.36,0);
          put(new THREE.SphereGeometry(.075,16,12),pale,x,.81,0);
          box(.09,.09,1.6,pale,x,.72,.8);
          box(.09,.7,.09,pale,x,.35,1.55);
        }
        box(.45,.06,.45,pale,0,.75,-.05);
        otherLamp('lotus', -.6, .765, 0, .5); otherLamp('lotus', .6, .765, 0, .8);
        await pauseBuild();
      },
    },
  };
}
