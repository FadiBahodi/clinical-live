// Every queued revision contains all speech so coalescing never discards an utterance.
// Reset changes the generation before aborting: even a late successful response is ignored.
export class LatestLane {
 constructor({request,onResult,onState=()=>{},onError=()=>{}}){Object.assign(this,{request,onResult,onState,onError});this.generation=0;this.active=false;this.queued=null;this.previous=null;}
 push(segments){this.queued=structuredClone(segments);if(!this.active)void this.run();}
 reset(keepPrevious=false){const previous=this.previous;this.generation++;this.controller?.abort();this.active=false;this.queued=null;this.previous=keepPrevious?previous:null;this.onState(false);}
 async run(){
  if(!this.queued)return;
  const generation=this.generation,segments=this.queued;this.queued=null;this.active=true;this.controller=new AbortController();this.onState(true);
  try{
   const result=await this.request(segments,this.previous,this.controller.signal);
   if(generation!==this.generation)return;
   this.previous=result.data;this.onResult(result,segments.length);
  }catch(error){if(generation===this.generation&&error.name!=='AbortError')this.onError(error);}
  finally{
   if(generation===this.generation){this.active=false;if(this.queued)void this.run();else this.onState(false);}
  }
 }
}
export const emptyAssessment=()=>({summary:'',vitals:[],differential:[],history:[],exam:[]});
export const emptyPlan=()=>({management:[]});
export const emptyAnswer=()=>({answer:null});
export function encodeWav(samples,sampleRate=16000){
 const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);
 const ascii=(at,value)=>{for(let i=0;i<value.length;i++)view.setUint8(at+i,value.charCodeAt(i));};
 ascii(0,'RIFF');view.setUint32(4,36+samples.length*2,true);ascii(8,'WAVE');ascii(12,'fmt ');
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);ascii(36,'data');view.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){const s=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,s<0?s*32768:s*32767,true);}
 return buffer;
}
