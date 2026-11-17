// CPU numeric reference, not production field or a CPU image renderer.
import { DataUtils } from 'three';
import { arithmetic } from '../../tests/visual/cloud-arithmetic-reference.mjs';

export function makeCloudLiveReference(contract,halfTables){
  const c=contract,fp=arithmetic({float32:true,fused:true,mix:'affine'}),{r,add,sub,mul,div,mad,blend}=fp;
  if(c.version!==7||c.banks.length!==48||c.nearWisps.length!==3||halfTables.length!==2)throw Error('Actual source7 and exact two noise tables required');
  const tables=halfTables.map(values=>Float32Array.from(values,DataUtils.fromHalfFloat));
  const mod=(v,n)=>v-n*Math.floor(v/n);
  function noise(p){
    const cell=p.map(Math.floor),f=p.map((v,i)=>sub(v,cell[i])),u=f.map(v=>mul(mul(mul(v,v),v),mad(v,mad(6,v,-15),10)));
    const id=mod(cell[0],17)+17*(mod(cell[1],17)+17*mod(cell[0]+cell[1]+cell[2],289));
    const h=(x,y,z)=>div(tables[z][id*4+x+2*y],288);
    return blend(blend(blend(h(0,0,0),h(1,0,0),u[0]),blend(h(0,1,0),h(1,1,0),u[0]),u[1]),blend(blend(h(0,0,1),h(1,0,1),u[0]),blend(h(0,1,1),h(1,1,1),u[0]),u[1]),u[2]);
  }
  const bank=b=>({...b,centre:b.centre.map(r),radii:b.radii.map(r),density:r(b.density),edge:r((1-b.edgeWidth)**2)});
  const banks=c.banks.map(bank),wisps=c.nearWisps.map(bank),substrate=bank(c.substrate);
  function envelope(p,b){
    const q=p.map((v,i)=>div(sub(v,b.centre[i]),b.radii[i])),q2=add(add(mul(q[0],q[0]),mul(q[2],q[2])),mul(q[1],q[1]));
    const u=fp.clamp(div(sub(q2,b.edge),sub(1,b.edge)));return sub(1,mul(mul(u,u),sub(3,mul(2,u))));
  }
  function sample(p,time=0){
    p=p.map(r);if(p.some((v,i)=>v<c.bounds.min[i]||v>c.bounds.max[i]))return 0;
    const haze=mul(substrate.density,envelope(p,substrate));
    const near=Math.max(...wisps.map(b=>mul(b.density,envelope(p,b))));
    const active=c.bankGroups.some(g=>p.every((v,i)=>v>=g.expandedCullBounds.min[i]&&v<=g.expandedCullBounds.max[i]));
    if(!active&&near===0)return haze;
    const q=p.map((v,i)=>add(v,mul(r(c.flowEngine[i]),sub(r(time),r(c.timeOrigin)))));
    const n=c.noise.octaves.map(o=>fp.clamp(noise(q.map((v,i)=>mad(v,r(o.frequency),r(o.offset[i]))))));
    const F=fp.clamp(add(add(mul(n[0],r(c.noise.octaves[0].weight)),mul(n[1],r(c.noise.octaves[1].weight))),mul(n[2],r(c.noise.octaves[2].weight))));
    const mixtures=c.domainWarp.octaveMixturesEngine.map(row=>row.reduce((sum,w,i)=>w?(sum===null?mul(n[i],r(w)):add(sum,mul(n[i],r(w)))):sum,null));
    const warped=p.map((v,i)=>add(v,mad(mixtures[i],r(c.domainWarp.scaleEngine[i]),r(c.domainWarp.offsetEngine[i]))));
    let E=0;if(active)for(const b of banks){if(warped.some((v,i)=>Math.abs(v-b.centre[i])>b.radii[i]))continue;E=Math.max(E,envelope(warped,b));}
    const child=mul(banks[0].density,fp.clamp(div(sub(E,sub(r(c.breakup.thresholdBase),mul(F,r(c.breakup.noiseAmplitude)))),r(c.breakup.normalization))));
    return add(Math.max(child,mul(near,mad(F,r(c.nearWispModulation.scale),r(c.nearWispModulation.base)))),haze);
  }
  return{sample,noise,envelope,arithmetic:'Actual socket Float32 constants, explicit MULTIPLY_ADD/FMA and saved Blender XYZ dot order; CPU inference reference only'};
}
