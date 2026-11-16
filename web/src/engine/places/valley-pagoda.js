// An invented valley court, one old brick pagoda and the stream just beyond its eastern wall.
export default function createPlace(h) {
  const { THREE, V3, M, ground, water, box, put, wallWithHoles, eave, trees, rock, peak, mist, otherLamp, pavingTex, brickTex, grainTex, pauseBuild } = h;
  return {
    exposure: 1.12, shade: .32,
    sky: { top: 0x080d18, horizon: 0x263044, ground: 0x0c1119, sun: 0xdce4f4, dir: [-.35, .6, -.25], glow: .1, clouds: .65, lit: 0x424e65, dark: 0x121924, stars: .2, disc: .7 },
    fog: [0x1c2737, .009], sunL: [0xb8c9e5, .55], hemi: [0x3e516d, 0x131914, .34], bloom: [.48, 1.05], porch: [0xffa65c, 5],
    day: { exposure: 1, sky: { top: 0x5c7b9e, horizon: 0xd6dfdb, ground: 0x53604f, sun: 0xffe6c0, dir: [-.35, .6, -.25], glow: .35, clouds: .55, lit: 0xffeee0, dark: 0x83989d }, fog: [0xa5b8b5, .006], sunL: [0xffe7c8, 1.8], hemi: [0xc5dce5, 0x42523e, .85], bloom: [.25, 1.4] },
    view: { pos: V3(-1.4, 1.7, 43), look: V3(.2, 3.5, -6) },
    walk: [V3(-.7, 1.7, 33), V3(.2, 1.7, 22), V3(.4, 1.7, 11)], doors: V3(0, 1.4, 18),
    async build() {
      const C = h.context, wall = M(0x66645c, .97, { map: brickTex }), wood = M(0x3b291c, .9, { map: grainTex });
      ground(0x394639, { y: -.8 }); box(23, .8, 67, M(0x4e5548, .98), -.7, -.4, 11);
      box(3, .07, 43, M(0x72716a, .95, { map: pavingTex }), 0, .035, 31);
      // One low gate, a view through to the single pagoda and a path that continues into its court.
      wallWithHoles({ x0: -11.5, x1: 10.8, y0: 0, y1: 2.6, z: 18, depth: .65, m: wall, uv: .55, holes: [{ x0: -1.25, x1: 1.25, y0: 0, y1: 2.6 }] });
      for (const x of [-1.4, 1.4]) box(.23, 2.7, .8, wood, x, 1.35, 17.85);
      box(3.2, .2, .8, wood, 0, 2.78, 17.85); eave({ x0: -2, x1: 2, y: 2.85, z: 18.5, depth: 1.4, rise: .5, tile: 0x343d40 });
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.48, .075), wood); leaf.position.set(-1.24, 1.24, 17.35); leaf.rotation.y = -1.1; leaf.castShadow = leaf.receiveShadow = true; C.G.add(leaf);
      // The stream occupies a real cut below the court, with rock banks and a slight whitewater scatter.
      water(-.48, 0x182c32, { geo: new THREE.PlaneGeometry(5.2, 110), x: 14.3, z: -9, waves: .8, env: .65, rough: .14 });
      for (let i = 0; i < 26; i++) {
        const z = -52 + i * 4.3, size = .35 + C.rnd() * .5;
        rock(11.5 + C.rnd() * .7, -.45, z, [size, size * .65, size * 1.4], i * 3 + 7);
        rock(17.1 + C.rnd() * .8, -.45, z + .8, [size, size * .8, size * 1.6], i * 3 + 8);
      }
      const rippleM = new THREE.MeshBasicMaterial({ color: 0xa4b6bb, transparent: true, opacity: .09, depthWrite: false });
      for (let i=0;i<34;i++) { const ripple = new THREE.Mesh(new THREE.PlaneGeometry(.18 + C.rnd() * .3, .025), rippleM); ripple.rotation.x=-Math.PI/2;ripple.rotation.z=C.rnd()*.4;ripple.position.set(12.5+C.rnd()*3.5,-.465,-48+C.rnd()*88);C.G.add(ripple); }
      await pauseBuild();
      // The valley sides rise from the same ground and converge behind the pagoda. Their foot is hidden in pine and mist.
      const mountain = M(0x293b35, 1);
      for (const [x,z,r,ht,seed] of [[-70,-80,58,130,11],[-88,5,60,145,17],[75,-95,58,155,23],[85,18,65,150,27],[-12,-170,85,185,31]]) peak(x,-12,z,r,ht,mountain,seed,1.05);
      const T=trees();for(let i=0;i<44;i++){const side=i%2?-1:1;T.pine(side*(18+C.rnd()*35),-.4,-40+C.rnd()*100,.9+C.rnd()*1.3,0x253b2b);}T.finish();
      for(const [x,z,s] of [[-7,27,1.2],[6,31,1],[-6,38,.7]])rock(x,0,z,[s,s*.7,s*.9],Math.round(z));
      mist({n:38,at:[0,1.8,-20],box:[80,3.2,90],color:0xb6c9cb,opacity:.11,size:18,drift:.5});
      await pauseBuild();
    },
    nook: {
      at: { pos: V3(0, 0, -3), ry: 0 }, lamp: 'glass', y: .46, exposure: 1.1, bloom: [.36, 1.02],
      approach: [V3(.4,1.68,8), V3(.8,1.5,4)],
      wide: { pos: V3(1,.95,1.8), look: V3(-.25,.9,-1.1) },
      async build(hh,C) {
        const bricks=brickTex.clone();bricks.repeat.set(2.3,3);bricks.needsUpdate=true;
        const pb=M(0x6e6458,.96,{map:bricks}), cap=M(0x4b4e4b,.95,{map:pavingTex}), stone=M(0x73766b,.9,{map:pavingTex}), moss=M(0x3f5038,1);
        box(22,.13,32,M(0x555b51,.96,{map:pavingTex}),-.3,-.065,4);
        // Low brick walls enclose the court while allowing the stream and valley beyond them to remain legible.
        for(const x of [-11.5,10.8]){box(.52,1.65,32,pb,x,.825,4);box(.68,.11,32,cap,x,1.705,4);}
        box(22.8,1.65,.52,pb,-.35,.825,-12);box(23,.11,.68,cap,-.35,1.705,-12);
        // A broad table before the pagoda, glass bowls seated directly on its worn slab.
        box(2,.08,.62,stone,0,.42,0);for(const x of [-.7,.7])box(.34,.38,.5,stone,x,.19,0);
        for(const [x,L]of[[-.6,.4],[-.32,.75],[.42,.5],[.7,.3]])otherLamp('glass',x,.46,(x*5%1)*.08,L);
        box(1.2,.065,.34,stone,2.4,.36,.7);for(const x of [2,2.8])box(.18,.33,.28,stone,x,.165,.7);
        // Seven irregular brick stages, plain corbelled ledges and deep unlit niches; this is no real-world pagoda replica.
        const z=-7.6;put(new THREE.CylinderGeometry(2.5,2.68,.6,8),cap,0,.3,z);put(new THREE.CylinderGeometry(2.15,2.32,3.4,8),pb,0,2.3,z);
        let y=4,r=2.15;
        for(let i=0;i<7;i++){
          put(new THREE.CylinderGeometry(r*1.12,r*1.02,.18,8),cap,0,y+.09,z);y+=.18;
          const ht=1.05-i*.055,next=r*.88;
          put(new THREE.CylinderGeometry(next,r,ht,8),pb,0,y+ht/2,z);
          // Small recessed-looking apertures on each accessible face, surrounded by projecting brick jambs.
          for(let side=0;side<8;side++){const a=(side+.5)/8*Math.PI*2,rr=r*.93,x=Math.sin(a)*rr,zz=z+Math.cos(a)*rr,w=.28-i*.018,hh2=.5-i*.025;const pane=new THREE.Mesh(new THREE.PlaneGeometry(w,hh2),M(0x111819,.96));pane.position.set(x,y+ht*.52,zz);pane.rotation.y=a;C.G.add(pane);}
          y+=ht;r=next;
        }
        put(new THREE.ConeGeometry(r*1.1,1,8),cap,0,y+.5,z);put(new THREE.SphereGeometry(.09,16,12),cap,0,y+1.03,z);
        // A single broad entrance at its base. A lamp glows far within, rather than turning the doorway into a luminous sticker.
        box(.72,1.5,.08,M(0x101512,.98),0,1.35,z+2.16);
        box(.36,.7,.025,new THREE.MeshStandardMaterial({color:0x3a2616,emissive:0xffac61,emissiveIntensity:.22,roughness:1}),0,1.1,z+2.215);
        const inside=new THREE.PointLight(0xffa35b,1.2,4,2);inside.position.set(0,1,z+2.45);C.G.add(inside);
        // Roots, moss, a few leaves and low plants catch the dampness at the base of the masonry.
        for(const[x,zz,s]of[[-2.6,-6.6,.5],[3,-8,.65],[-4,2,.7],[4.8,-2,.5]])rock(x,0,zz,[s,s*.55,s*.8],Math.round((zz+10)*11));
        for(let i=0;i<65;i++){const a=C.rnd()*6.28,rr=2.6+C.rnd()*1.5;put(new THREE.PlaneGeometry(.035,.12+C.rnd()*.13),moss,Math.sin(a)*rr,.1,z+Math.cos(a)*rr,a);}
        await pauseBuild();
      },
    },
  };
}
