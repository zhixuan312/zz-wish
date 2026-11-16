// Cloud Cliff Court: halls built out from a sheer cliff on long posts, a sea of cloud far below.
// The lamp is a brass storm lantern hung inside the gallery that runs along the cliff edge.
export default function createPlace(h) {
  const { THREE, V3, M, roofMat, hallB, box, put, rock, mist, eave, col, rail, cloudSea, otherLamp, trees, pauseBuild, latticeTex, grainTex } = h;
  return {
    exposure: 1.2, shade: 0.35,
    sky: { top: 0x050811, horizon: 0x1c2638, ground: 0x0c1018, sun: 0xdde6ff, dir: [.3, .26, .92], glow: .3, clouds: .25, lit: 0x3a4660, dark: 0x0c1018, stars: .7, disc: 1.6 },
    fog: [0x141c28, .004], sunL: [0xb8c8ec, .7], hemi: [0x3a4a6a, 0x0a0c10, .4], bloom: [.8, .8], porch: [0xffa04a, 160],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: 1, sky: { top: 0x5a86c0, horizon: 0xe2e8ee, ground: 0xc8d0da, sun: 0xfff2dc, dir: [.3, .4, .92], glow: .6, clouds: .2, lit: 0xffffff, dark: 0xb8c4d4 }, fog: [0xd4dce6, .0022], sunL: [0xfff0dc, 2.1], hemi: [0xd0dcea, 0x606a74, .9], bloom: [.38, 1.3] },
    view: { pos: V3(1.3, 1.68, 28), look: V3(-1, 2.3, -2) },
    walk: [V3(1, 1.65, 23), V3(.5, 1.65, 15), V3(.6, 1.65, 7)], doors: V3(.4, 1.6, 8),
    async build() {
      const C = h.context;
      const wood = M(0x514438, .86, { map: grainTex }), dark = roofMat(0x303234), red = M(0x512a23,.82);
      // One timber gallery fastened to the cliff. The route is supported all the way from the outer gate.
      for (let z=-4;z<31;z+=.22) box(3.2,.13,.205,wood,.5,-.075,z);
      for (const x of [-1.1,2.1]) {
        box(.22,.3,35,wood,x,-.27,13);
        for(let z=-2;z<30;z+=4){box(.24,48,.24,wood,x,-24.4,z);box(.10,1.05,.10,wood,x,.525,z);}
        box(.10,.09,34,wood,x,1.05,13);box(.07,.06,34,wood,x,.43,13);
      }
      // Half open gate onto the long court-gallery, with a covered waiting bay.
      for(const x of [-1.05,2.05]) col(x,18,3.1,.15,red);
      box(3.5,.24,.35,wood,.5,3.04,18);
      eave({x0:-1.7,x1:2.7,y:3.2,z:19.3,depth:2.8,rise:.6,tile:0x33383b});
      box(.85,2.65,.09,red,-.75,1.34,17.65,-.9);
      for(const x of [-11.7,-3.3])for(const z of [-8.5,-3])box(.26,54,.26,wood,x,-27.3,z);
      // Timber ties beneath the hall run into the same gallery joists.
      box(9.8,.28,7,wood,-7.5,-.25,-5.6);
      for(const z of [-8.5,-3])box(9.8,.28,.24,wood,-7.5,-.5,z);
      hallB({x:-7.5,z:-5.8,w:9,d:6,h:3.5,wall:red,roof:dark,base:.25,glow:.22});
      // A short timber connection joins the hall's east side to the gallery, clear of the walking line.
      for(let z=-4.5;z<-2.5;z+=.22)box(3.2,.13,.205,wood,-2.5,-.075,z);
      for(const z of [-4.5,-2.5])box(3.2,.24,.16,wood,-2.5,-.23,z);
      hallB({x:-10,y:4,z:-13,w:7,d:5,h:3.4,wall:red,roof:dark,base:.3,glow:.16});
      for(const x of [-13.5,-6.5])for(const z of [-15,-11])box(.28,55,.28,wood,x,-23.2,z);
      await pauseBuild();
      // Rock rises behind the halls and anchors the route on the left, rather than a floating platform.
      rock(-12,-18,-9,[9,55,14],21);rock(-7,-8,18,[5,34,20],23);
      rock(-18,-30,-25,[9,48,12],29);rock(-22,8,-42,[12,22,16],31);
      const T=trees();for(const [x,y,z] of [[-8,9,-8],[-10,15,-18],[-6,6,24]])T.pine(x,y,z,1.6,0x28372e,true);T.finish();
      for(const [x,y,z] of [[-4.1,2.4,6],[-3.8,2.4,-1]]){const f=new THREE.PointLight(0xffb979,1.8,8,2);f.position.set(x,y,z);C.G.add(f);}
      await pauseBuild();
    },
    // The gallery on the cliff edge. The lantern hangs from a bracket on the middle column; the rail and the
    // cloud sea are in front of it, the hall's lattice doors behind.
    nook: {
      at: { pos: V3(0, 0, 2), ry: 0 },
      lamp: 'lantern', y: 1.86, exposure: 1.05, bloom: [.42, .95],
      approach: [V3(.7, 1.65, 3.4)],
      wide: { pos: V3(.85, 1.55, 1.45), look: V3(-.18, 1.53, -.15) },
      // The flame stays in the place: brass, suspension rod, roof beam, timber screen and cloud beyond the rail.
      burn: { pos: V3(.64, 1.7, 2.1), look: V3(-.1, 1.95, -.13) },
      burnPhone: { pos: V3(.28, 1.75, 2.2), look: V3(-.05, 1.95, -.08) },
      cover: { pos: V3(1.7, 1.65, 2.8), look: V3(1.4, 1.47, .3) },
      coverPhone: { pos: V3(1.35, 1.7, 2.3), look: V3(.95, 1.3, .62) },
      async build(hh, C) {
        const wood = M(0x3a2618, .72, { map: grainTex }), red = M(0x5a1a12, .55), floorM = M(0x5a4030, .8, { map: grainTex });
        // Floor planks over joists, open to the drop at the edge.
        for (let z = -1.1; z < 1.65; z += .2) box(7.2, .05, .18, floorM, 0, -.025, z + .1);
        for(const x of [-3.4,3.4])box(.16,.24,2.9,wood,x,-.16,.25);
        for (let x = -3.4; x <= 3.4; x += 1.1) box(.12, .2, 2.9, wood, x, -.15, .25);
        box(7.2, .22, .14, wood, 0, -.12, 1.68);
        // Posts and struts under the gallery, going down into the cloud.
        for (const x of [-2.6, 0, 2.6]) { box(.2, 40, .2, wood, x, -20.2, 1.2); const s = new THREE.BoxGeometry(.14, 3, .14); s.rotateX(-.6); put(s, wood, x, -1.4, .55); }
        // The cross-gallery opens onto the approach. Its rail never crosses the walking line.
        rail(-3.4, -1.15, 1.18, .92, wood); rail(2.2, 3.4, 1.18, .92, wood);
        for (const x of [-3.4,3.4]) {
          box(.07,.06,2.5,wood,x,.93,.08);box(.07,.05,2.5,wood,x,.42,.08);
          for(let z=-1.1;z<=1.3;z+=.8)box(.09,1,.09,wood,x,.5,z);
        }
        // The cliffward wall of the gallery is the hall's timber screen. The opposite side stays open above cloud.
        // Looking down the gallery reveals the screen, columns, roof and the next hall, rather than an empty horizon.
        const screenWood=M(0x30231a,.87,{map:grainTex}), screenBase=M(0x47342a,.9,{map:grainTex});
        box(.16,.52,7.2,screenBase,-1.16,.26,-1.75);
        for(const z of [-4.9,-2.7,-.5,1.5])col(-1.16,z,2.7,.1,red);
        box(.18,.2,7.4,wood,-1.16,2.6,-1.75);
        const screenMat=new THREE.MeshStandardMaterial({color:0x21170f,emissive:0xffb26a,emissiveMap:latticeTex,emissiveIntensity:.13+.08*C.light.n,roughness:.9,side:THREE.DoubleSide});
        for(const z of [-3.8,-1.6,.5]) {
          const doors=new THREE.Mesh(new THREE.PlaneGeometry(2.05,1.94),screenMat);doors.rotation.y=Math.PI/2;doors.position.set(-1.05,1.51,z);C.G.add(doors);
          box(.06,.06,2.1,screenWood,-1.02,.57,z);box(.06,.06,2.1,screenWood,-1.02,2.45,z);
          for(let dz=-.9;dz<=.91;dz+=.3)box(.04,1.85,.025,screenWood,-1.01,1.51,z+dz);
        }
        // Exposed joists and roof above the actual place where the visitor stands.
        for(const z of [-1,.8]){box(4.6,.18,.16,red,1.0,2.62,z);for(const x of [-1.16,3.2])col(x,z,2.7,.10,red);}
        eave({x0:-1.4,x1:3.5,y:2.78,z:1.55,depth:6.8,rise:.65,tile:0x34363a});
        // Both lanterns hang by metal rods from the exposed roof beams, with every connection visible.
        const hookMetal=M(0x342c20,.55,{metalness:.8});
        box(4.6,.18,.16,red,1.0,2.62,0);
        box(.012,.72,.012,hookMetal,0,2.24,0);
        box(.045,.045,.24,wood,.95,2.59,.69);
        box(.012,.72,.012,hookMetal,.95,2.24,.62);
        C.cover = otherLamp('lantern', .95, 1.86, .62, .7, .5, .7);
        // The cliff face the gallery is fixed to, on the left.
        hh.rock(-5.2, -6, -.5, [2.4, 12, 3.2], 33); hh.rock(-4.6, -1, 2.8, [1.6, 5, 2.2], 35);
        await pauseBuild();
        cloudSea({ y: -15, speed: 14 });
        // Far ridges just breaking through the cloud, fading into it.
        hh.ridges([[520,-13,56,0x3a424c],[760,-13,80,0x4a525c],[600,-18,60,0x343b44,undefined,true]]);
        // Cloud tearing past just below the rail, fast.
        mist({ n: 26, at: [0, -7, -20], box: [120, 8, 100], color: 0xdfe6ee, opacity: .28, size: 14, drift: 5 });
        await pauseBuild();
      },
    },
  };
}
