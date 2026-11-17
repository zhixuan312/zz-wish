// CPU-only comparison against immutable existing Chrome/WebKit RGBA32F rows.
import{readFile,writeFile,mkdir}from'node:fs/promises';import{createHash}from'node:crypto';
import{makeGlslReference,makeNativeGraphReference}from'./cloud-arithmetic-reference.mjs';
const root=process.env.OUTPUT??'artifacts/full-review/round-1/cloud-source16-arithmetic';await mkdir(root,{recursive:true});
const graphBytes=await readFile(root+'/native-graph.json'),graph=JSON.parse(graphBytes),c=JSON.parse(await readFile('art/build/cloud-cliff-round1/source-v16-small-preview/cloud-contract.json')),sha=b=>createHash('sha256').update(b).digest('hex');
const candidates=[
 ['glsl-f32-affine-no-fma',makeGlslReference(c,{float32:true,fused:false,mix:'affine'})],
 ['glsl-f32-weighted-no-fma',makeGlslReference(c,{float32:true,fused:false,mix:'weighted'})],
 ['glsl-f32-affine-fma',makeGlslReference(c,{float32:true,fused:true,mix:'affine'})],
 ['glsl-f32-affine-fma-dot-left',makeGlslReference(c,{float32:true,fused:true,mix:'affine',dot:'fma-left'})],
 ['glsl-f32-affine-fma-dot-right',makeGlslReference(c,{float32:true,fused:true,mix:'affine',dot:'fma-right'})],
 ['native-graph-double',makeNativeGraphReference(graph,{float32:false,fused:false})],
 ['native-graph-f32-no-fma',makeNativeGraphReference(graph,{float32:true,fused:false})],
 ['native-graph-f32-explicit-fma',makeNativeGraphReference(graph,{float32:true,fused:true})],
 ['native-graph-f32-fma-dot-left',makeNativeGraphReference(graph,{float32:true,fused:true,dot:'fma-left'})],
 ['native-graph-f32-fma-dot-right',makeNativeGraphReference(graph,{float32:true,fused:true,dot:'fma-right'})],
];
const report={source:graph.source,actualGraph:{sha256:sha(graphBytes),nodes:graph.nodes.length},limit:1e-6,unchangedDoubleFailuresRetained:true,gpuBrowserRuns:0,models:candidates.map(([name])=>name),browsers:[],limitations:['Float32 per operation and explicit multiply-add models are arithmetic references, not new native/GPU measurements.','FMA uses a single final Math.fround(a*b+c) on Float32 operands; a native fmaf validation is recorded separately.','No reference is selected by relaxing the tolerance. Original Double failures remain unchanged.']};
for(const browser of['chromium','webkit']){
 const path='artifacts/full-review/round-1/cloud-source16-runtime-night/'+browser+'-density-proof.json',bytes=await readFile(path),input=JSON.parse(bytes);if(input.limit!==1e-6||input.time!==0)throw Error('Unchanged1e-6/time0 input required.');
 const rows=input.points,values=candidates.map(()=>new Float64Array(rows.length)),stats=[];
 for(let k=0;k<candidates.length;k++){
  const[name,fn]=candidates[k];let maximum=0,sum=0,failed=0,worst=-1;
  for(let i=0;i<rows.length;i++){const v=name.startsWith('native')?fn(rows[i].inputFloat32Point):fn(rows[i].inputFloat32Point,0),error=Math.abs(v-rows[i].gpuDensity);if(!Number.isFinite(error))throw Error('Nonfinite reference '+name);values[k][i]=v;sum+=error*error;failed+=error>1e-6?1:0;if(error>maximum){maximum=error;worst=i;}}
  const raw=Buffer.from(values[k].buffer),file=root+'/'+browser+'-'+name+'.f64le';await writeFile(file,raw);stats.push({name,maximum,rms:Math.sqrt(sum/rows.length),failed,passed:maximum<=1e-6,worstIndex:worst,raw:{file,sha256:sha(raw)}});console.log('ARITHMETIC',browser,name,JSON.stringify({maximum,failed}));
 }
 const worst=rows.map((row,i)=>({i,error:row.absoluteError})).sort((a,b)=>b.error-a.error).slice(0,30).map(({i})=>({index:i,point:rows[i].inputFloat32Point,gpu:rows[i].gpuDensity,double:rows[i].cpuDensity,doubleError:rows[i].absoluteError,references:Object.fromEntries(candidates.map(([name],k)=>[name,{value:values[k][i],error:Math.abs(values[k][i]-rows[i].gpuDensity)}]))}));
 report.browsers.push({browser,input:{path,sha256:sha(bytes)},count:rows.length,originalDouble:{maximum:input.maximumAbsoluteDensityError,rms:input.rmsAbsoluteDensityError,failed:rows.filter(x=>x.absoluteError>1e-6).length,passed:input.passed},stats,worst});
}
await writeFile(root+'/reference-comparison.json',JSON.stringify(report,null,2)+'\n');console.log('ARITHMETIC_REPORT',root+'/reference-comparison.json');
