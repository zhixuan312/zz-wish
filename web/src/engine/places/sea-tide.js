// Tide Temple: a temple with its back to the hill, facing the sea over low granite walls.
export default function createPlace(h) {
  const { THREE, V3, M, roofMat, pave, hallB, peak, water, box, gateB, rock, pauseBuild, grainTex, pavingTex } = h;
  return {
    exposure: 1.1, shade: 0.32,
    sky: { top: 0x070c22, horizon: 0x3a2e44, ground: 0x0c0e16, sun: 0xff8a50, dir: [.95, .02, -.5], glow: .7, clouds: .35, lit: 0x6a4450, dark: 0x161830, stars: .8, disc: 0 },
    fog: [0x221e30, .008], sunL: [0x8a9ad0, .45], hemi: [0x3a4878, 0x141016, .32], bloom: [.85, .8], porch: [0xffa04a, 100],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: 1, sky: { top: 0x3f74bc, horizon: 0xd4e2ec, ground: 0x34465a, sun: 0xfff2dc, dir: [.6, .45, -.6], glow: .5, clouds: .35, lit: 0xffffff, dark: 0xaabccc, disc: 4 }, fog: [0xc4d6e2, .006], sunL: [0xfff2e0, 2.2], hemi: [0xbcd0e8, 0x504838, .8], bloom: [.35, 1.3] },
    view: { pos: V3(1.2,1.65,42), look: V3(0,2,6) },
    walk: [V3(.6,1.65,33),V3(0,1.65,24),V3(.2,1.65,13),V3(4,1.65,13)], doors: V3(0,1.65,25),
    async build() {
      const C=h.context;
      water(-2.8,0x111c24,{env:1.1,waves:.8});
      const granite=M(0x7e817c,.76,{map:pavingTex}), dark=roofMat(0x383b3c), wood=M(0x645744,.9,{map:grainTex});
      box(24,7,40,granite,0,-3.5,5); box(4.5,6.8,24,granite,0,-3.4,36);pave(0,8,20,32,0,granite);pave(0,35,4.2,26,0,granite);
      hallB({z:-7,w:15,d:8,h:3.8,wall:granite,roof:dark,base:.3,lift:.25,glow:.22});
      gateB({z:25,w:8,h:3.8,wall:granite,roof:dark,lift:.2});
      for(const x of [-11.5,11.5])box(.65,1,35,granite,x,.5,5);
      box(17,1,.6,granite,2.8,.5,24.8);
      // Weathered boatside details belong to the stone court rather than a ceremonial avenue.
      for(let i=0;i<8;i++){const rope=new THREE.Mesh(new THREE.TorusGeometry(.24+i*.024,.018,6,48).rotateX(-Math.PI/2),wood);rope.position.set(-7,.035+i*.015,13);C.G.add(rope);}
      for(let i=0;i<10;i++)box(.06,.06,3.8,wood,-8+i*.13,.12,9,.3);
      for(let i=0;i<9;i++)for(let j=0;j<6;j++)box(.012,1.1,.012,wood,-8.2+i*.18,.85,1+j*.16);
      peak(0,-8,-65,65,48,M(0x28372f,1),21,.7);
      for(const [x,z,k] of [[-14,28,1],[15,24,2],[-8,45,3],[12,42,4],[-18,-4,5]])rock(x,-2.4,z,[3.5,2.6,4.2],k*7);
      // Surf rolls as broken silver threads against the rocks at the foot of the wall.
      const foam=new THREE.MeshBasicMaterial({color:0xa7b8bf,transparent:true,opacity:.12,depthWrite:false});
      for(let i=0;i<10;i++){const g=new THREE.Mesh(new THREE.TorusGeometry(3+i*.35,.035,4,80,Math.PI*1.4).rotateX(-Math.PI/2),foam.clone());g.position.set(-13,-2.65,27);C.G.add(g);C.up.push((dt,t)=>{g.material.opacity=.07+.06*Math.sin(t*.7-i*.35);g.scale.setScalar(1+((t*.06+i*.1)%1)*.4);});}
      await pauseBuild();
    },
    // A low sea wall of granite; on it a small stone lamp-house, the hood lamp inside its recess. The sea beyond.
    nook: {
      at: { pos: V3(7, 0, 18), ry: Math.PI },
      lamp: 'hood', y: 1.0, exposure: 1.05, bloom: [.4, .95],
      approach: [V3(.8, 1.6, 4)],
      wide: { pos: V3(1.0, 1.55, 2.1), look: V3(-.2, 1.0, -.6) },
      async build(hh) {
        const { THREE, M, box, put, wallWithHoles, otherLamp, pavingTex, pauseBuild } = hh;
        const granite = M(0x6e6a64, .92, { map: pavingTex }), dark = M(0x4a4844, .95, { map: pavingTex });
        box(8, 1.0, .7, granite, 0, .5, -.45); box(8.1, .1, .78, dark, 0, 1.0, -.45);
        // The lamp-house: a stone box with a recess, a hipped stone cap.
        wallWithHoles({ x0: -.3, x1: .3, y0: 1.0, y1: 1.58, z: .12, depth: .52, m: granite, uv: 1.2, holes: [{ x0: -.17, x1: .17, y0: 1.0, y1: 1.4, arch: true }] });
        box(.34, .4, .02, M(0x2a2622, 1), 0, 1.2, -.38);
        put(new THREE.ConeGeometry(.5, .28, 4).rotateY(Math.PI / 4), dark, 0, 1.72, -.14);
        wallWithHoles({ x0: 1.7, x1: 2.26, y0: 1.0, y1: 1.54, z: .08, depth: .5, m: granite, uv: 1.2, holes: [{ x0: 1.82, x1: 2.14, y0: 1.0, y1: 1.36, arch: true }] });
        put(new THREE.ConeGeometry(.46, .26, 4).rotateY(Math.PI / 4), dark, 1.98, 1.66, -.17);
        otherLamp('hood', 1.98, 1.0, -.16, .7);
        // Paving, a coil of rope and a stone bollard: the harbour is below.
        box(8, .2, 3, M(0x5a5854, .85, { map: pavingTex }), 0, -.1, 1.2);
        put(new THREE.TorusGeometry(.16, .035, 8, 24).rotateX(Math.PI / 2), M(0x8a7a5a, .9), -1.6, .04, .6);
        put(new THREE.CylinderGeometry(.12, .16, .55, 12), dark, 2.9, .27, .5);
        await pauseBuild();
      },
    },
  };
}
