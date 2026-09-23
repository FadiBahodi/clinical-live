import {encodeWav} from './session.js';
let runtime;
function script(src){return new Promise((resolve,reject)=>{const node=document.createElement('script');node.src=src;node.onload=resolve;node.onerror=()=>{node.remove();reject(new Error('Speech detection assets are unavailable. Run npm ci.'));};document.head.append(node);});}
export async function loadVoiceRuntime(){
 if(!runtime)runtime=(async()=>{await script('/vendor/ort/ort.wasm.min.js');await script('/vendor/vad/bundle.min.js');return window.vad;})().catch(error=>{runtime=null;throw error;});
 return runtime;
}
export function voiceOptions({getStream,onSpeech,onSpeaking=()=>{},onLevel=()=>{},onFrame=()=>{},pauseMs=450}){
 return {model:'v5',startOnLoad:false,baseAssetPath:'/vendor/vad/',onnxWASMBasePath:'/vendor/ort/',
  getStream,pauseStream:async()=>{},resumeStream:async stream=>stream,
  positiveSpeechThreshold:0.5,negativeSpeechThreshold:0.25,preSpeechPadMs:320,minSpeechMs:128,redemptionMs:Math.min(1400,Math.max(200,Number(pauseMs)||450)),submitUserSpeechOnPause:true,
  ortConfig:ort=>{ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;},
  onSpeechStart:()=>onSpeaking(true),onVADMisfire:()=>onSpeaking(false),
  onSpeechEnd:audio=>{onSpeaking(false);onSpeech(audio);},
  onFrameProcessed:(probabilities,frame)=>{let sum=0;for(const n of frame)sum+=n*n;onLevel(Math.min(1,Math.sqrt(sum/frame.length)*12));onFrame(probabilities,frame.length/16);}
 };
}
const base64=buffer=>{const bytes=new Uint8Array(buffer);let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);};
export class VoiceInput {
 constructor({onTranscript,onStatus=()=>{},onError=()=>{},onLevel=()=>{},onQueue=()=>{},pauseMs=()=>450,maxClipMs=()=>8000,concurrency=()=>2,now=()=>performance.now(),loadRuntime=loadVoiceRuntime,getStream=()=>navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false})}){Object.assign(this,{onTranscript,onStatus,onError,onLevel,onQueue,pauseMs,maxClipMs,concurrency,now,getStream,loadRuntime});this.generation=0;this.queue=[];this.active=false;this.inFlight=0;this.controllers=new Set();this.starting=false;this.failed=false;}
 get busy(){return this.inFlight>0;}
 async start({testOnly=false}={}){
  if(this.active||this.starting)return;
  const generation=this.generation;let captureStream;this.testOnly=testOnly;this.starting=true;this.onStatus('Loading speech detection');
  try{
   const runtime=await this.loadRuntime();if(generation!==this.generation)return;
   const capture=await runtime.MicVAD.new(voiceOptions({
    pauseMs:this.pauseMs(),
    getStream:async()=>{const stream=await this.getStream();if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());throw new Error('Cancelled');}captureStream=stream;this.stream=stream;return stream;},
    onSpeech:audio=>{const end=this.lastVoicedAt??this.now();this.speechStart=null;if(!this.testOnly&&generation===this.generation&&audio.length>=2048)this.enqueue(encodeWav(audio),'audio/wav',{speechEndedAt:end,audioMs:audio.length/16});},
    onSpeaking:speaking=>{if(generation!==this.generation)return;this.onStatus(this.testOnly?'Mic test · local only':speaking?'Hearing speech':'Listening');this.speechStart=speaking?this.now():null;if(speaking){this.speechMs=0;this.lastVoicedAt=this.now();}this.quietMs=0;},
    onLevel:value=>{if(generation===this.generation)this.onLevel(value);},
    onFrame:(probabilities,ms)=>{
     if(!this.active||this.speechStart==null||this.splitting)return;
     this.quietMs=probabilities.isSpeech<0.25?(this.quietMs||0)+ms:0;
     this.speechMs=(this.speechMs||0)+ms;if(probabilities.isSpeech>=0.5)this.lastVoicedAt=this.now();
     const maximum=Math.min(20000,Math.max(4000,Number(this.maxClipMs())||8000));
     // Finish processing the current frame before VAD flushes it; otherwise the boundary frame can be lost.
     if((this.speechMs>=maximum/2&&this.quietMs>=128)||this.speechMs>=maximum)queueMicrotask(()=>{if(generation===this.generation)void this.cutSegment();});
    }
   }));
   if(generation!==this.generation){try{await capture.destroy();}catch{}captureStream?.getTracks().forEach(t=>t.stop());return;}
   this.vad=capture;await capture.start();
   if(generation!==this.generation){try{await capture.destroy();}catch{}captureStream?.getTracks().forEach(t=>t.stop());return;}
   this.active=true;this.onStatus(this.testOnly?'Mic test · local only':'Listening');
  }catch(error){if(generation===this.generation){await this.pause();this.onError(new Error(error.name==='NotAllowedError'?'Microphone permission was not granted.':error.message||'Microphone could not start.'));}}
  finally{if(generation===this.generation){this.starting=false;this.onStatus(this.active?(this.testOnly?'Mic test · local only':'Listening'):this.failed?'Transcription paused':'Mic off');}}
 }
 async cutSegment(){
  if(!this.active||!this.vad||this.splitting)return;
  this.splitting=true;const current=this.vad;
  try{await current.pause();if(this.active&&this.vad===current)await current.start();}
  catch{await this.pause();this.onError(new Error('Speech capture stopped while splitting a long segment. Restart listening to continue.'));}
  finally{this.splitting=false;}
 }
 async pause(){
  this.active=false;this.speechStart=null;
  const current=this.vad,stream=this.stream,generation=this.generation;this.vad=null;this.stream=null;
  if(current){try{await current.pause();await current.destroy();}catch{/* A partially initialized capture may have no audio context. */}}
  stream?.getTracks().forEach(track=>track.stop());
  if(generation===this.generation){this.onLevel(0);this.onStatus(this.busy||this.queue.length?'Finishing transcription':'Mic off');}
 }
 reset(){
  this.generation++;for(const controller of this.controllers)controller.abort();this.controllers.clear();this.queue=[];this.inFlight=0;this.failed=false;this.starting=false;this.onQueue(0);void this.pause();
 }
 enqueue(buffer,mimeType,metrics={}){
  this.queue.push({audio:base64(buffer),mimeType,state:'waiting',metrics:{...metrics,queuedAt:this.now()}});this.onQueue(this.queue.length);
  if(this.queue.length>=8&&this.active){void this.pause();this.onError(new Error('Transcription is behind. Listening paused while the saved speech queue finishes.'));}
  this.process();
 }
 retry(){this.failed=false;for(const part of this.queue)if(part.state==='failed')part.state='waiting';this.process();}
 process(){
  if(this.failed)return;
  const maximum=Math.min(2,Math.max(1,Number(this.concurrency())||2));
  while(this.inFlight<maximum){const part=this.queue.find(p=>p.state==='waiting');if(!part)break;void this.transcribe(part);}
 }
 commit(){
  // A later clip may finish first, but corrections must enter the transcript in spoken order.
  while(this.queue[0]?.state==='ready'){
   const part=this.queue.shift();if(part.result.text.trim())this.onTranscript(part.result.text.trim(),part.result.elapsedMs,{...part.metrics,committedAt:this.now()});
  }
  this.onQueue(this.queue.length);
 }
 async transcribe(part){
  const generation=this.generation,controller=new AbortController();this.controllers.add(controller);this.inFlight++;part.state='running';part.metrics.requestedAt=this.now();
  this.onStatus(this.active?'Listening · transcribing':'Finishing transcription');
  try{
   const response=await fetch('/api/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({audio:part.audio,mimeType:part.mimeType})});
   const result=await response.json();if(!response.ok)throw new Error('Transcription failed. This speech segment is kept in memory for Retry.');
   if(generation!==this.generation)return;
   if(typeof result.text!=='string')throw new Error('Invalid transcription. Retry this speech segment.');
   part.result=result;part.metrics.transcribedAt=this.now();part.state='ready';this.commit();
  }catch(error){if(generation===this.generation&&error.name!=='AbortError'){part.state='failed';this.failed=true;await this.pause();this.onError(error);}}
  finally{
   if(generation===this.generation){this.controllers.delete(controller);this.inFlight--;this.process();if(!this.busy)this.onStatus(this.active?(this.testOnly?'Mic test · local only':'Listening'):this.failed?'Transcription paused':'Mic off');}
  }
 }
}
