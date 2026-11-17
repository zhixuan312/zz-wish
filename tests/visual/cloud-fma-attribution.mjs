// Independent native-node contraction sensitivity and actual-operand capture.
import{readFile,writeFile}from'node:fs/promises';import{makeNativeGraphReference}from'./cloud-arithmetic-reference.mjs';
const out='artifacts/full-review/round-1/cloud-source16-arithmetic',graph=JSON.parse(await readFile(out+'/native-graph.json')),input=JSON.parse(await readFile('artifacts/full-review/round-1/cloud-source16-runtime-night/chromium-density-proof.json'));
const category=n=>{const b=n.inputs[1],c=n.inputs[2];if(!b.link&&[.02500000037252903,.07500000298023224,.22499999403953552].includes(b.value))return'coordinate';if((!b.link&&b.value===6&&!c.link&&c.value===-15)||(!c.link&&c.value===10))return'quintic';if(!b.link&&b.value===34)return'integer hash';if(!b.link&&[12,16].includes(b.value))return'warp';return'interpolation';};
const results=[];
for(const name of['coordinate','quintic','interpolation','warp','all except coordinate']){
 const fn=makeNativeGraphReference(graph,{float32:true,fused:false,fmaNode:n=>name==='all except coordinate'?category(n)!=='coordinate':category(n)===name});let maximum=0,sum=0,failed=0;
 for(const row of input.points){const error=Math.abs(fn(row.inputFloat32Point)-row.gpuDensity);maximum=Math.max(maximum,error);sum+=error*error;failed+=error>1e-6?1:0;}
 results.push({fusedNodeCategory:name,maximum,rms:Math.sqrt(sum/input.points.length),failed,passed:maximum<=1e-6});
}
let count=0;const slots=graph.nodes.filter(n=>n.operation==='MULTIPLY_ADD'||n.type==='ShaderNodeMapRange').length,triples=new Float32Array(input.points.length*slots*4),fn=makeNativeGraphReference(graph,{float32:true,fused:true,recordFma:(a,b,c,v)=>{triples.set([a,b,c,v],count*4);count++;}});
for(const row of input.points)fn(row.inputFloat32Point);if(count!==slots*input.points.length)throw Error('Unexpected actual FMA population.');
await writeFile(out+'/native-fma-operands.f32le',Buffer.from(triples.buffer));await writeFile(out+'/fma-category-attribution.json',JSON.stringify({pointCount:input.points.length,actualMultiplyAddNodes:graph.nodes.filter(n=>n.operation==='MULTIPLY_ADD').length,recordedFmaTriples:count,results},null,2)+'\n');console.log(JSON.stringify(results,null,2));
