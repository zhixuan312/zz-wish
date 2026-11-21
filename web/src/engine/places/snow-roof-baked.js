// The Snow Roof pilot uses authored Blender construction and Cycles lighting.
// This descriptor owns cameras and live weather only; no static architecture is made here.
import { loadBakedPlace } from '../baked/loadPlace.js';
import { readBakedManifest } from '../baked/prefetchPlace.js';

function incenseStrands(h, C, config) {
  const { THREE, V3 } = h;
  const origin = C.G.worldToLocal(V3(...config.anchor));
  const uniforms = { uTime: { value: 0 }, uRise: { value: config.riseMetres }, uSpeed: { value: config.speedMetresPerSecond }, uSway: { value: config.swayMetres }, uOpacity: { value: config.opacity } };
  for (let strand = 0; strand < config.strandCount; strand++) {
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { ...uniforms, uSeed: { value: strand * 2.71 } },
      vertexShader: `uniform float uTime,uRise,uSpeed,uSway,uSeed;varying vec2 vUv;
        void main(){vUv=uv;float y=uv.y*uRise,t=uTime*uSpeed/uRise;
          vec4 p=modelMatrix*vec4(0.,y,0.,1.);
          vec3 right=normalize(vec3(viewMatrix[0][0],0.,viewMatrix[2][0]));
          float curl=sin(uv.y*10.-t*6.283+uSeed)*.6+sin(uv.y*19.-t*4.1+uSeed)*.4;
          p.xyz+=right*(position.x+curl*uSway*smoothstep(0.,.7,uv.y));
          gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader: `uniform float uOpacity;varying vec2 vUv;
        void main(){float edge=exp(-pow((vUv.x-.5)*4.,2.));
          float fade=smoothstep(0.,.06,vUv.y)*(1.-smoothstep(.45,1.,vUv.y));
          gl_FragColor=vec4(.36,.32,.27,uOpacity*edge*fade);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(config.widthMetres, config.riseMetres, 1, 48), material);
    mesh.position.copy(origin); mesh.position.x += (strand - (config.strandCount - 1) / 2) * .006;
    mesh.userData.cast = false; C.G.add(mesh);
  }
  C.up.push((_dt, time) => { uniforms.uTime.value = time; });
}

function sourceDust(h, C, config) {
  const { THREE, V3 } = h, positions = new Float32Array(config.count * 3);
  const lo = C.G.worldToLocal(V3(...config.boundsMin)), hi = C.G.worldToLocal(V3(...config.boundsMax));
  for (let i = 0; i < config.count; i++) for (let axis = 0; axis < 3; axis++) positions[i * 3 + axis] = lo.getComponent(axis) + C.rnd() * (hi.getComponent(axis) - lo.getComponent(axis));
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xc4a27c, size: config.radiusMetres * 2, transparent: true, opacity: config.opacity, depthWrite: false });
  const points = new THREE.Points(geometry, material); C.G.add(points);
  C.up.push(dt => {
    const attribute = geometry.attributes.position;
    for (let i = 0; i < config.count; i++) {
      const y = attribute.getY(i) + dt * config.speedMetresPerSecond;
      attribute.setY(i, y > hi.y ? lo.y : y);
    }
    attribute.needsUpdate = true;
  });
}

export default async function createPlace(h) {
  const manifest = await readBakedManifest('snow-roof');
  if (manifest.snowCourt?.revision === 'winter-pass-v1') {
    return (await import('./snow-roof-court.js')).default(h);
  }
  return createLegacyPlace(h);
}

function createLegacyPlace(h){
  const {V3}=h;
  let staticWicks;
  const sourcePoint=(baked,key)=>{
    const raw=baked.group.userData[key],point=typeof raw==='string'?JSON.parse(raw):raw;
    if(!Array.isArray(point)||point.length!==3||!point.every(Number.isFinite))throw new Error(`Invalid Snow Roof source contact anchor: ${key}`);
    return point;
  };
  const localPoint=(group,point)=>group.worldToLocal(V3(...point)).toArray();
  const sourceConfig=(baked,key)=>{
    const raw=baked.group.userData[key],config=typeof raw==='string'?JSON.parse(raw):raw;
    if(!config||typeof config!=='object')throw new Error(`Missing Snow Roof source configuration: ${key}`);
    return config;
  };
  const addFixture=(C,wick)=>{
    if(!wick.lit)return;
    const flame=h.liveFlame(...localPoint(C.G,wick.wickTip),{size:wick.kind.includes('clay')?.65:wick.name==='court lantern'?.7:.9,radiance:.55,halo:false});
    h.fixtureSpecular(...localPoint(C.G,wick.pointLight),(wick.actualWatts??wick.watts)*C.baked.cameraPreExposure,wick.linearColor??[1,180/255,108/255]);
    C.up.push(()=>{flame.power=.86*C.baked.fixturePower();});
  };
  return{
    bakedLighting:true,snow:0,exposure:1,shade:.4,
    sky:{top:0x1e2c3f,horizon:0x384b5d,ground:0x141b25,sun:0xc8d4ff,dir:[.4,.5,-1],glow:.05,clouds:.65,lit:0x495c6b,dark:0x172433,disc:0},
    fog:[0x242b38,.006],sunL:[0x9fb4e0,.22],hemi:[0x8b9ebd,0x28232a,.3],bloom:[.32,1.1],
    day:{exposure:.9,sky:{top:0x8494aa,horizon:0xdadfe6,ground:0x6a6870,sun:0xf4f6ff,dir:[.4,.45,-1],glow:.35,clouds:.7,lit:0xf4f4f8,dark:0x9aa0ae,disc:2},fog:[0xc6cbd4,.004],sunL:[0xf2f5ff,1.5],hemi:[0xd4dcea,0x585058,.9],bloom:[.22,1.3]},
    view:{pos:V3(2.0,1.75,40),look:V3(0,3.1,16)},
    viewPhone:{pos:V3(2.0,1.75,40),look:V3(0,1.4,16),fov:54},
    walkSeconds:30,
    walk:[V3(.7,1.7,35),V3(.1,1.7,27),V3(0,1.7,19),V3(0,1.7,13)],doors:V3(0,1.7,17),
    async build(){
      const C=h.context,baked=await loadBakedPlace('snow-roof',h.renderer,C.light);
      C.G.add(baked.group);C.baked=baked;
      const raw=baked.group.userData.static_lamp_wicks_engine;
      staticWicks=typeof raw==='string'?JSON.parse(raw):raw;
      if(!Array.isArray(staticWicks)||staticWicks.length!==7||staticWicks.some(wick=>typeof wick.lit!=='boolean'||!Array.isArray(wick.wickTip)||!Array.isArray(wick.pointLight)))throw new Error('Snow Roof requires its seven measured source wick contacts and fixture states.');
      C.G.updateMatrixWorld(true);
      for(const wick of staticWicks.filter(wick=>!wick.name.startsWith('altar ')))addFixture(C,wick);
      h.fall({n:1000,at:[0,6.5,30.3],box:[48,13,52.2],color:0xe4ecf8,size:.025,vy:.65,sway:.18,opacity:.52,softEdges:true});
    },
    nook:{
      at:{pos:V3(0,.6,-.5),ry:0},lamp:'gauze',y:2.25,lampFovMax:55,hangingPoint:[-1.4993,5.040999961853027,-1.3],exposure:1,bloom:[.32,1.1],dust:false,
      interior:{min:[-5,-.3,-6],max:[5,4.4,2.5]},
      // Eye height remains 1.62 m above the path, rising only over the terrace steps.
      approach:[V3(0,1.1,11),V3(0,1.12,6.45),V3(0,1.19,6.18),V3(0,1.39,5.77),V3(0,1.59,5.37),V3(0,1.62,4.95)],
      wide:{pos:V3(.2,1.62,3.75),look:V3(0,1.75,-3),fov:40},
      widePhone:{pos:V3(.05,1.62,3.75),look:V3(0,1.9,-3),fov:56},
      // Follow the doorway into the open bay; every view uses the nook frame.
      // The approach must close on the lamp monotonically. Desktop: the waypoint lies
      // on the line from the doorway to the chooser spot, so the distance only falls.
      // Phone: fitShadeView moves the chooser pose away from the doorway line, so any
      // lateral waypoint overshoots; a single doorway point lets the curve reach the
      // chooser pose without backing off.
      chooseApproach:[V3(0,1.62,2.7),V3(-1.4,1.62,1.9)],
      chooseApproachPhone:[V3(0,1.62,2.7)],
      choose:{pos:V3(-2.75,1.62,1.15),look:V3(-1.4993,1.5523,-.8),fov:55},
      choosePhone:{pos:V3(-1.5,1.6,2.2),look:V3(-1.4993,.97,-.8),fov:55},
      spread:{pos:V3(-2.95,1.65,1.05),look:V3(-1.4993,1.5523,-.8),fov:55},
      spreadPhone:{pos:V3(-1.5,1.63,1.95),look:V3(-1.4993,.97,-.8),fov:55},
      burn:{pos:V3(-4.9,1.75,-1.65),look:V3(1.09794395,1.05,-1.49293831),fov:45},
      burnPhone:{pos:V3(-2.3,1.25,2.4),look:V3(-.850851599,1.1,-1.8),fov:55},
      burnFar:{pos:V3(-4.94,1.75,-1.65),look:V3(1.05794395,1.05,-1.49293831),fov:45},
      burnFarPhone:{pos:V3(-2.3,1.25,2.48),look:V3(-.850851599,1.1,-1.8),fov:55},
      burnWalk:[V3(-3.2,1.67,.6),V3(-3.8,1.72,-.3),V3(-4.5,1.75,-1)],
      burnWalkPhone:[V3(-1.65,1.53,2.1),V3(-2.1,1.35,2.3)],
      async build(){
        const C=h.context;
        C.G.updateMatrixWorld(true);
        // Source anchors use world Y-up. The nook has its own translated frame;
        // liveFlame aligns its visible base exactly to the baked wick tip.
        for(const wick of staticWicks.filter(wick=>wick.name.startsWith('altar '))){
          addFixture(C,wick);
        }
        const smoke=sourcePoint(C.baked,'static_incense_smoke_engine');
        const config=sourceConfig(C.baked,'static_incense_smoke_config');
        if(config.anchor.some((value,i)=>Math.abs(value-smoke[i])>.000001))throw new Error('Incense smoke configuration differs from its source contact anchor.');
        incenseStrands(h,C,config);
        sourceDust(h,C,sourceConfig(C.baked,'static_dust_config'));
      },
    },
  };
}
