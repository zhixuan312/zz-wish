// Independent arithmetic models. These never replace the shipping field/sample.
const clamp=x=>Math.max(0,Math.min(1,x));
export function arithmetic({float32=true,fused=false,dot='left',mix='affine',recordFma}={}){
 const r=float32?Math.fround:x=>x,add=(a,b)=>r(a+b),sub=(a,b)=>r(a-b),mul=(a,b)=>r(a*b),div=(a,b)=>r(a/b),mad=fused?(a,b,c)=>{const v=r(a*b+c);recordFma?.(a,b,c,v);return v;}:(a,b,c)=>add(mul(a,b),c);
 const blend=mix==='weighted'?(a,b,t)=>add(mul(a,sub(1,t)),mul(b,t)):(a,b,t)=>mad(sub(b,a),t,a);
 const product=(a,b)=>{if(dot==='fma-left')return mad(a[2],b[2],mad(a[1],b[1],mul(a[0],b[0])));if(dot==='fma-right')return mad(a[0],b[0],mad(a[1],b[1],mul(a[2],b[2])));const p=a.map((v,i)=>mul(v,b[i]));return dot==='right'?add(p[0],add(p[1],p[2])):add(add(p[0],p[1]),p[2]);};
 return{r,add,sub,mul,div,mad,blend,product,clamp:x=>r(clamp(x))};
}

export function makeGlslReference(c,options={}){
 const a=arithmetic(options),{r,add,sub,mul,div,mad,blend,product}=a,bank=b=>({...b,centre:b.centre.map(r),radii:b.radii.map(r),density:r(b.density),edge:r((1-b.edgeWidth)**2)}),banks=c.banks.map(bank),substrate=bank(c.substrate),base=r(c.breakup.thresholdBase),amplitude=r(c.breakup.noiseAmplitude),normalization=r(c.breakup.normalization);
 const bounds=c.banks.map(b=>({min:b.centre.map((v,i)=>r(v-b.radii[i]-c.domainWarp.sampleOffsetBounds.max[i])),max:b.centre.map((v,i)=>r(v+b.radii[i]-c.domainWarp.sampleOffsetBounds.min[i]))}));
 const groups=c.bankGroups.map(g=>({...g,expandedCullBounds:{min:g.expandedCullBounds.min.map(r),max:g.expandedCullBounds.max.map(r)}}));
 const inside=(p,b)=>p.every((v,i)=>v>=b.min[i]&&v<=b.max[i]),global={min:c.bounds.min.map(r),max:c.bounds.max.map(r)};
 const envelope=(p,b)=>{const q=p.map((v,i)=>div(sub(v,b.centre[i]),b.radii[i])),t=a.clamp(div(sub(product(q,q),b.edge),sub(1,b.edge)));return sub(1,mul(mul(t,t),sub(3,mul(2,t))));};
 const modulo=x=>sub(x,mul(289,Math.floor(div(x,289)))),permute=x=>{x=modulo(x);return modulo(mul(mad(34,x,1),x));};
 const noise=p=>{
  const cell=p.map(Math.floor),f=p.map((v,i)=>sub(v,cell[i])),u=f.map(v=>mul(mul(mul(v,v),v),mad(v,mad(6,v,-15),10)));
  const h=(x,y,z)=>div(permute(add(permute(add(permute(add(cell[0],x)),modulo(add(cell[1],y)))),modulo(add(cell[2],z)))),288);
  return blend(blend(blend(h(0,0,0),h(1,0,0),u[0]),blend(h(0,1,0),h(1,1,0),u[0]),u[1]),blend(blend(h(0,0,1),h(1,0,1),u[0]),blend(h(0,1,1),h(1,1,1),u[0]),u[1]),u[2]);
 };
 return(p,time=0,diagnostics=false)=>{
  p=p.map(r);if(!inside(p,global))return diagnostics?{density:0}:0;
  const haze=mul(substrate.density,envelope(p,substrate)),active=groups.flatMap(g=>inside(p,g.expandedCullBounds)?g.lobeIndices.filter(i=>inside(p,bounds[i])):[]);
  if(!active.length)return diagnostics?{density:haze}:haze;
  const q=p.map((v,i)=>add(v,mul(r(c.flowEngine[i]),sub(r(time),r(c.timeOrigin))))),coordinates=c.noise.octaves.map(o=>q.map((v,i)=>mad(v,r(o.frequency),r(o.offset[i])))),n=coordinates.map(p=>a.clamp(noise(p))),F=a.clamp(product(n,c.noise.octaves.map(o=>r(o.weight)))),mixtures=c.domainWarp.octaveMixturesEngine.map(row=>product(n,row.map(r))),warped=p.map((v,i)=>add(add(v,mul(mixtures[i],r(c.domainWarp.scaleEngine[i]))),r(c.domainWarp.offsetEngine[i])));
  let density=0;for(const i of active)density=Math.max(density,mul(banks[i].density,a.clamp(div(add(sub(envelope(warped,banks[i]),base),mul(amplitude,F)),normalization))));
  density=add(density,haze);return diagnostics?{density,coordinates,n,F,warped,active}:density;
 };
}

// Evaluate the serialized actual saved node DAG, not a second hand-written field.
export function makeNativeGraphReference(graph,options={}){
 const a=arithmetic(options),{r,add,sub,mul,div,mad,product}=a,values=graph.nodes.map(n=>Array.from({length:n.outputs.length},()=>0));
 const read=(n,i)=>{const s=n.inputs[i];return s.link?values[s.link[0]][s.link[1]]:Array.isArray(s.value)?s.value.map(r):r(s.value??0);};
 const jobs=graph.nodes.map(n=>{
  const out=values[n.id];
  if(n.type==='ShaderNodeNewGeometry')return p=>{out[n.outputs.indexOf('Position')]=[p[0],r(-p[2]),p[1]];};
  if(n.type==='ShaderNodeSeparateXYZ')return()=>{const v=read(n,0);out[0]=v[0];out[1]=v[1];out[2]=v[2];};
  if(n.type==='ShaderNodeCombineXYZ')return()=>{out[0]=[read(n,0),read(n,1),read(n,2)];};
  if(n.type==='ShaderNodeMath')return()=>{const x=read(n,0),y=read(n,1),z=read(n,2);let v;
   switch(n.operation){case'ADD':v=add(x,y);break;case'SUBTRACT':v=sub(x,y);break;case'MULTIPLY':v=mul(x,y);break;case'DIVIDE':v=y===0?0:div(x,y);break;case'MULTIPLY_ADD':v=options.fmaNode?(options.fmaNode(n)?r(x*y+z):add(mul(x,y),z)):mad(x,y,z);break;case'FLOOR':v=r(Math.floor(x));break;case'MINIMUM':v=r(Math.min(x,y));break;case'MAXIMUM':v=r(Math.max(x,y));break;default:throw Error('Unmodelled actual math node '+n.operation);}
   out[0]=n.use_clamp?a.clamp(v):v;
  };
  if(n.type==='ShaderNodeVectorMath')return()=>{const x=read(n,0),y=read(n,1);if(n.operation==='SUBTRACT')out[0]=x.map((v,i)=>sub(v,y[i]));else if(n.operation==='DIVIDE')out[0]=x.map((v,i)=>y[i]===0?0:div(v,y[i]));else if(n.operation==='DOT_PRODUCT')out[n.outputs.indexOf('Value')]=product(x,y);else throw Error('Unmodelled actual vector node '+n.operation);};
  if(n.type==='ShaderNodeMapRange')return()=>{if(n.interpolation_type!=='SMOOTHSTEP')throw Error('Unmodelled actual map range '+n.interpolation_type);const t=a.clamp(div(sub(read(n,0),read(n,1)),sub(read(n,2),read(n,1)))),s=mul(mul(t,t),sub(3,mul(2,t)));out[0]=mad(sub(read(n,4),read(n,3)),s,read(n,3));};
  throw Error('Unmodelled actual node '+n.type);
 });
 return(p,diagnostics=false)=>{p=p.map(r);for(const job of jobs)job(p);const density=values[graph.densityRoot[0]][graph.densityRoot[1]];return diagnostics?{density,labels:Object.fromEntries(graph.nodes.filter(n=>n.label).map(n=>[n.label,structuredClone(values[n.id])]))}:density;};
}
