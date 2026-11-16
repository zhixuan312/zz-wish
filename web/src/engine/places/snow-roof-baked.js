// The Snow Roof pilot uses authored Blender construction and Cycles lighting.
// This descriptor owns cameras and live weather only; no static architecture is made here.
import { loadBakedPlace } from '../baked/loadPlace.js';
export default function createPlace(h){
  const {V3}=h;
  let staticWicks;
  const sourcePoint=(baked,key,fallback)=>{
    const raw=baked.group.userData[key],point=raw===undefined?fallback:typeof raw==='string'?JSON.parse(raw):raw;
    if(!Array.isArray(point)||point.length!==3||!point.every(Number.isFinite))throw new Error(`Invalid Snow Roof source contact anchor: ${key}`);
    return point;
  };
  const localPoint=(group,point)=>group.worldToLocal(V3(...point)).toArray();
  return{
    bakedLighting:true,snow:0,exposure:1,shade:.4,
    sky:{top:0x1e2c3f,horizon:0x384b5d,ground:0x141b25,sun:0xc8d4ff,dir:[.4,.5,-1],glow:.05,clouds:.65,lit:0x495c6b,dark:0x172433,disc:0},
    fog:[0x242b38,.006],sunL:[0x9fb4e0,.22],hemi:[0x8b9ebd,0x28232a,.3],bloom:[.32,1.1],
    day:{exposure:.9,sky:{top:0x8494aa,horizon:0xdadfe6,ground:0x6a6870,sun:0xf4f6ff,dir:[.4,.45,-1],glow:.35,clouds:.7,lit:0xf4f4f8,dark:0x9aa0ae,disc:2},fog:[0xc6cbd4,.004],sunL:[0xf2f5ff,1.5],hemi:[0xd4dcea,0x585058,.9],bloom:[.22,1.3]},
    view:{pos:V3(2.4,1.75,45),look:V3(0,3.1,16)},
    walkSeconds:46,
    walk:[V3(.7,1.7,37),V3(.1,1.7,27),V3(0,1.7,19),V3(0,1.7,13)],doors:V3(0,1.7,17),
    async build(){
      const C=h.context,baked=await loadBakedPlace('snow-roof',h.renderer,C.light);
      C.G.add(baked.group);C.baked=baked;
      const raw=baked.group.userData.static_lamp_wicks_engine;
      staticWicks=typeof raw==='string'?JSON.parse(raw):raw;
      if(!Array.isArray(staticWicks)||staticWicks.filter(wick=>wick.name.startsWith('altar ')).length!==4||staticWicks.filter(wick=>wick.name.startsWith('gate ')).length!==2)throw new Error('Snow Roof requires its six source wick contacts.');
      C.G.updateMatrixWorld(true);
      for(const wick of staticWicks.filter(wick=>wick.name.startsWith('gate ')))h.liveFlame(...localPoint(C.G,wick.wickTip));
      h.fall({n:1000,at:[0,6.5,30.3],box:[48,13,52.2],color:0xe4ecf8,size:.025,vy:.65,sway:.18,opacity:.52,softEdges:true});
    },
    nook:{
      at:{pos:V3(0,.6,-.5),ry:0},lamp:'gauze',y:2.62,exposure:1,bloom:[.32,1.1],dust:true,
      interior:{min:[-5,-.3,-6],max:[5,4.4,2.5]},
      // Eye height remains 1.62 m above the path, rising only over the terrace steps.
      approach:[V3(0,1.1,11),V3(0,1.12,6.45),V3(0,1.19,6.18),V3(0,1.39,5.77),V3(0,1.59,5.37),V3(0,1.62,4.95)],
      wide:{pos:V3(.2,1.62,3.75),look:V3(0,1.75,-3),fov:40},
      widePhone:{pos:V3(.05,1.62,3.75),look:V3(0,1.9,-3),fov:56},
      choose:{pos:V3(.18,1.62,2.1),look:V3(.25,2.08,0),fov:32},
      choosePhone:{pos:V3(.1,1.62,2.1),look:V3(0,2.12,0),fov:44},
      confirm:{pos:V3(.12,1.62,1.88),look:V3(.2,2.08,0),fov:32},
      confirmPhone:{pos:V3(.1,1.62,2),look:V3(0,2.15,0),fov:44},
      spread:{pos:V3(.12,1.62,2.35),look:V3(0,1.89,-.75),fov:44},
      spreadPhone:{pos:V3(0,1.62,2.35),look:V3(0,1.85,-.75),fov:64},
      burn:{pos:V3(.18,1.62,-1.9),look:V3(0,2.1,.5),fov:40},
      burnPhone:{pos:V3(.18,1.62,-1.9),look:V3(.085,1.88,.5),fov:56},
      burnFar:{pos:V3(.18,1.62,-3.35),look:V3(0,1.95,.5),fov:32},
      burnFarPhone:{pos:V3(.18,1.62,-3.35),look:V3(0,1.88,.5),fov:44},
      burnWalk:[V3(1.4,1.62,1.3),V3(1.95,1.62,-.75),V3(1.65,1.62,-1.7)],
      async build(){
        const C=h.context;
        C.G.updateMatrixWorld(true);
        // Source anchors use world Y-up. The nook has its own translated frame;
        // liveFlame accepts the baked wick tip, and its flame mesh adds 2 mm.
        for(const wick of staticWicks.filter(wick=>wick.name.startsWith('altar '))){
          h.liveFlame(...localPoint(C.G,wick.wickTip));
          h.fixtureSpecular(...localPoint(C.G,wick.pointLight));
        }
        // The fallback supports the preceding delivery while new source assets
        // are being rebuilt. New contact-audited exports carry the measured tip.
        const smoke=sourcePoint(C.baked,'static_incense_smoke_engine',[.002,1.98,-4.85]);
        h.smokeAt(...localPoint(C.G,smoke),{k:2,size:.007,spread:.06,op:.08,perSecond:8,n:48});
      },
    },
  };
}
