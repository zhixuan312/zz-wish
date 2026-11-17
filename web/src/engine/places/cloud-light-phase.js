// Pure temporal/buffer coordinator. No renderer and no production activation.
// Three completed slots keep old/current transport intact while a future phase
// is written. Density always samples the same continuous simulation time used
// to interpolate those two completed transport phases; never live+frozenT0.
export function createCloudLightPhase({backend,sourceIdentity,phaseStepSeconds=2,completedSlots=3}){
  if(!backend?.create||!backend?.execute||!backend?.commit||!sourceIdentity?.sourceBlendSha256||!sourceIdentity?.sourceFieldSha256||!(phaseStepSeconds>0)||completedSlots<3)throw new TypeError('Actual seven-direction backend/source identity and three bounded slots required');
  let nextId=0,nextPhaseTime=0,simulationTime=0,active=null,pending=false,inFlight=false,disposed=false,failure=null;
  const completed=[],free=Array.from({length:completedSlots},(_,i)=>i),events=[];
  function identical(value){return value?.sourceBlendSha256===sourceIdentity.sourceBlendSha256&&value?.sourceFieldSha256===sourceIdentity.sourceFieldSha256;}
  function frame(){
    if(completed.length<2)return{ready:false,simulationTime:0};
    let low=completed[0],high=completed[1];
    for(let i=1;i<completed.length;i++){if(completed[i].time>=simulationTime){high=completed[i];low=completed[i-1];break;}}
    const weight=Math.max(0,Math.min(1,(simulationTime-low.time)/(high.time-low.time)));
    return{ready:true,simulationTime,previous:low,current:high,weight,sourceIdentity};
  }
  function retire(){
    while(completed.length>2&&simulationTime>=completed[1].time){const old=completed.shift();free.push(old.slot);events.push({type:'retire',slot:old.slot,time:simulationTime});}
  }
  async function start(){
    if(active||pending||!free.length||disposed||failure)return;
    pending=true;const slot=free.shift(),id=nextId++,time=nextPhaseTime;
    try{
      const phase=await backend.create({id,time,slot,sourceIdentity});
      if(disposed){backend.releasePhase?.(phase);return;}
      if(!identical(phase.sourceIdentity)||phase.time!==time||phase.slot!==slot||!Array.isArray(phase.tasks)||!phase.tasks.length)throw Error('Actual phase backend/source/task identity mismatch');
      active={...phase,id,nextTask:0};events.push({type:'begin',id,slot,time});nextPhaseTime+=phaseStepSeconds;
    }catch(error){free.push(slot);failure=error;throw error;}finally{pending=false;}
  }
  const api={
    async tick(dt){
      if(disposed||failure)throw failure??new Error('Cloud light phase disposed');
      if(!Number.isFinite(dt)||dt<0)throw new RangeError('Actual nonnegative frame delta required');
      // Consumer time is monotonic and advances by actual dt only while two
      // validated transport phases bracket it. Producer stalls hold both
      // density and transport, rather than running density ahead of lighting.
      if(completed.length>=2)simulationTime=Math.min(simulationTime+dt,completed.at(-1).time);
      retire();if(inFlight)return frame();inFlight=true;
      try{
      await start();
      if(active&&!disposed){
        const phase=active;
        const task=phase.tasks[phase.nextTask],sampled=frame();
        if(sampled.ready&&(phase.slot===sampled.previous.slot||phase.slot===sampled.current.slot))throw Error('Attempt to overwrite a sampled completed transport slot');
        const result=await backend.execute({phase,task});
        if(disposed)return frame();
        if(result?.sourcePhaseTime!==undefined&&result.sourcePhaseTime!==phase.time)throw Error('Source time changed within a prefix batch');
        phase.nextTask++;
        if(phase.nextTask===phase.tasks.length){
          const committed=await backend.commit(phase);
          if(disposed)return frame();
          if(!identical(committed.sourceIdentity)||committed.time!==phase.time||committed.slot!==phase.slot||committed.directionsCompleted!==7)throw Error('Incomplete/mixed XYZ+SUN phase refused');
          completed.push(committed);completed.sort((a,b)=>a.time-b.time);events.push({type:'complete',id:phase.id,slot:phase.slot,time:phase.time});active=null;
        }
      }
      return frame();
      }catch(error){failure=error;events.push({type:'failure',message:error.message});throw error;}
      finally{inFlight=false;}
    },
    sample:frame,
    describe:()=>({sourceIdentity,simulationTime,phaseStepSeconds,completedSlots,completed:completed.map(({slot,time})=>({slot,time})),active:active?{id:active.id,slot:active.slot,time:active.time,nextTask:active.nextTask,tasks:active.tasks.length}:null,pending,failure:failure?.message??null,events:[...events],status:'Unactivated coordinator; actual backend/GPU/optical/phase-error gates remain separate'}),
    dispose(){disposed=true;backend.dispose?.();completed.length=0;free.length=0;active=null;}
  };
  return api;
}
