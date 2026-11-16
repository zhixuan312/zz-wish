// The Snow Roof pilot uses authored Blender construction and Cycles lighting.
// This descriptor owns cameras and live weather only; no static architecture is made here.
import { loadBakedPlace } from '../baked/loadPlace.js';
export default function createPlace(h){
  const {V3}=h;
  return{
    bakedLighting:true,snow:0,exposure:1,shade:.4,
    sky:{top:0x070a16,horizon:0x2c2638,ground:0x14121a,sun:0xc8d4ff,dir:[.4,.5,-1],glow:.15,clouds:.75,lit:0x4a3e4e,dark:0x16141e,disc:0},
    fog:[0x242b38,.006],sunL:[0x9fb4e0,.22],hemi:[0x8b9ebd,0x28232a,.3],bloom:[.32,1.1],
    day:{exposure:.9,sky:{top:0x8494aa,horizon:0xdadfe6,ground:0x6a6870,sun:0xf4f6ff,dir:[.4,.45,-1],glow:.35,clouds:.7,lit:0xf4f4f8,dark:0x9aa0ae,disc:2},fog:[0xc6cbd4,.004],sunL:[0xf2f5ff,1.5],hemi:[0xd4dcea,0x585058,.9],bloom:[.22,1.3]},
    view:{pos:V3(2.4,1.75,45),look:V3(0,3.1,16)},
    walk:[V3(.1,1.7,37),V3(0,1.7,27),V3(0,1.7,19),V3(0,1.7,13)],doors:V3(0,1.65,16),
    async build(){
      const C=h.context,baked=await loadBakedPlace('snow-roof',h.renderer);
      C.G.add(baked.group);C.baked=baked;
      h.fall({n:1000,at:[0,6,22],box:[48,13,54],color:0xe4ecf8,size:.025,vy:.65,sway:.18,opacity:.52});
    },
    nook:{
      at:{pos:V3(0,.6,-.5),ry:0},lamp:'gauze',y:2.62,exposure:1,bloom:[.32,1.1],dust:true,referenceFraming:true,
      interior:{min:[-5,-.3,-6],max:[5,4.4,2.5]},
      approach:[V3(.5,1,11),V3(.3,1.05,6.4),V3(.1,1.6,3.6),V3(0,1.62,1.8)],
      wide:{pos:V3(.75,1.62,1.55),look:V3(0,2.15,-.6)},
      async build(){
        h.smokeAt(0,1.11,-4.25,{k:.5,size:.018,spread:.015,op:.06,rate:.2,n:30});
      },
    },
  };
}
