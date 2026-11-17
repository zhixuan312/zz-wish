// Bounded non-rendering resource/time guard challenges, not a test suite.
import fs from'node:fs';import crypto from'node:crypto';import{createCloudLightPhase}from'../web/src/engine/places/cloud-light-phase.js';
const sourceIdentity={sourceBlendSha256:'ee3f9f065a72a102867d0bfe7ea9233761cd7db62e98711c993d38cba324bda0',sourceFieldSha256:'6aacf69c6964989e485f3f1a78401a10133738aa491b7e5fd7b4d71975c26f47'},out=process.argv[2]??'art/build/cloud-cliff-round1/source19-phase-guard.json';if(fs.existsSync(out))throw Error('Fresh receipt required');
function backend(tasks=40){return{create:async phase=>({...phase,tasks:Array.from({length:tasks},(_,i)=>i)}),execute:async({phase})=>({sourcePhaseTime:phase.time}),commit:async phase=>({...phase,directionsCompleted:7}),dispose(){}};}
const controls=[];
for(const [name,tasks]of[['normal40passes',40],['slow100passes',100]]){
  const phase=createCloudLightPhase({backend:backend(tasks),sourceIdentity}),frames=[];let prior=0,holds=0;
  for(let i=0;i<600;i++){
    const dt=i%17===0?.05:1/30,state=await phase.tick(dt),d=phase.describe();
    if(state.simulationTime<prior||state.simulationTime-prior>dt+1e-10)throw Error('Simulation time jumped or reversed');
    if(state.ready){if(state.previous.time>state.simulationTime+1e-10||state.current.time<state.simulationTime-1e-10||state.weight<0||state.weight>1)throw Error('Density time not bracketed by actual completed transport');if(d.active&&(d.active.slot===state.previous.slot||d.active.slot===state.current.slot))throw Error('Sample/write alias');}
    if(state.ready&&state.simulationTime===prior)holds++;prior=state.simulationTime;frames.push({frame:i,ready:state.ready,simulationTime:state.simulationTime,weight:state.weight,active:d.active});
  }
  controls.push({name,frames:frames.length,simulationTime:prior,producerStallHoldFrames:holds,completedEvents:phase.describe().events.filter(e=>e.type==='complete').length,passed:true});phase.dispose();
}
for(const kind of['wrong-source','mixed-phase','missing-SUN']){
  const b=backend(1);if(kind==='wrong-source')b.create=async phase=>({...phase,sourceIdentity:{...sourceIdentity,sourceFieldSha256:'wrong'},tasks:[0]});if(kind==='mixed-phase')b.execute=async({phase})=>({sourcePhaseTime:phase.time+1});if(kind==='missing-SUN')b.commit=async phase=>({...phase,directionsCompleted:6});const phase=createCloudLightPhase({backend:b,sourceIdentity});let rejected=false;try{await phase.tick(1/30);}catch{rejected=true;}if(!rejected)throw Error('Unsafe phase accepted:'+kind);controls.push({name:kind,rejected:true,passed:true});phase.dispose();
}
const sha=path=>crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex'),report={version:1,sourceIdentity,passed:true,controls,completedSlots:3,extraMemory:'Three rather than two completed XYZ/SUN slots; explicit residency must be counted by actual target allocator.',moduleSha256:sha('web/src/engine/places/cloud-light-phase.js'),scriptSha256:sha(new URL(import.meta.url)),limits:['Synthetic backend/task timing only; no GPU or renderer invocation.','SourceT interpolation/phase-step error still needs actual source/ray measurement.','Producer stalls hold BOTH density time and transport; this is not a claim of ideal continuous simulation under overload.']};fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log('PHASE_GUARD_PASS',out,JSON.stringify(controls));
