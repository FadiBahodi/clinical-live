import {VoiceInput} from './voice.js';
export class StreamingVoice {
 constructor({onTranscript,onPartial=()=>{},onStatus=()=>{},onError=()=>{},onLevel=()=>{},onQueue=()=>{},getStream,now=()=>performance.now(),socketFactory=url=>new WebSocket(url),contextFactory=()=>new AudioContext({sampleRate:16000}),workletFactory=context=>new AudioWorkletNode(context,'pcm-stream')}){
  Object.assign(this,{onTranscript,onPartial,onStatus,onError,onLevel,onQueue,getStream,now,socketFactory,contextFactory,workletFactory});this.generation=0;this.active=false;this.starting=false;this.busy=false;this.queue=[];this.failed=false;
 }
 async start(){
  if(this.active||this.starting||this.busy)return;
  const generation=++this.generation;this.starting=true;this.onStatus('Connecting live speech');this.finalSincePartial=true;
  try{
   const url=new URL('/api/listen',location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';
   const socket=this.socket=this.socketFactory(url.href);
   await new Promise((resolve,reject)=>{
    this.rejectStart=reject;this.startTimer=setTimeout(()=>reject(Error('Live speech connection timed out.')),15000);
    socket.onmessage=event=>{
     if(generation!==this.generation)return;
     let data;try{data=JSON.parse(event.data);}catch{return this.fail('Invalid live speech response.');}
     if(data.type==='ready'){clearTimeout(this.startTimer);resolve();if(this.active)this.onStatus('Listening · live');}
     if(data.type==='renewing')this.onStatus('Listening · renewing connection');
     if(['interim','final'].includes(data.type)&&data.text?.trim()){
      const at=this.now(),trace={streaming:true,receivedAt:at,committedAt:at};
      if(data.type==='interim'){this.finalSincePartial=false;this.onPartial(data.text,trace);}
      else{this.finalSincePartial=true;this.onTranscript(data.text,0,trace);}
     }
     if(data.type==='error'){reject(Error(data.message));this.fail(data.message);}
     if(data.type==='finished'){if(data.uncertain&&!this.finalSincePartial)this.onError(Error('The last phrase did not finalize. Its live draft remains provisional.'));this.finish();}
    };
    socket.onerror=()=>{reject(Error('Could not connect live speech. Check Voice & models.'));};
    socket.onclose=()=>{if(generation!==this.generation)return;reject(Error('Live speech disconnected.'));if(this.active||this.busy)this.fail('Listening disconnected. The unfinished phrase may be incomplete. Restart listening.');};
   });
   if(generation!==this.generation)return;
   const stream=await this.getStream();if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}this.stream=stream;
   const context=this.context=this.contextFactory();if(context.sampleRate!==16000)throw Error('This browser could not open a 16 kHz stream. Choose Phrase clips in Voice & models.');
   await context.audioWorklet.addModule('/pcm-worklet.js');if(generation!==this.generation)return;
   const node=this.node=this.workletFactory(context);this.source=context.createMediaStreamSource(stream);this.source.connect(node);const mute=this.mute=context.createGain();mute.gain.value=0;node.connect(mute);mute.connect(context.destination);
   node.port.onmessage=({data})=>{
    if(generation!==this.generation)return;
    if(data.flushed){this.resolveFlush?.();return;}
    if(!data.pcm)return;this.onLevel(data.level);
    if(socket.readyState!==1||socket.bufferedAmount>64000){this.fail('The audio connection is falling behind. Restart listening and repeat the unfinished phrase.');return;}
    socket.send(data.pcm);
   };
   await context.resume();if(generation!==this.generation)return;this.active=true;this.onStatus('Listening · live');
  }catch(error){if(generation===this.generation)this.fail(error.name==='NotAllowedError'?'Microphone permission was not granted.':error.message);}
  finally{if(generation===this.generation){this.starting=false;if(!this.active)this.onStatus('Mic off');}}
 }
 stopCapture(){this.source?.disconnect();this.node?.disconnect();this.mute?.disconnect();this.stream?.getTracks().forEach(t=>t.stop());void this.context?.close().catch(()=>{});this.context=null;this.stream=null;this.onLevel(0);}
 async pause(){
  if(!this.active){if(this.starting)this.reset();return;}
  this.active=false;this.busy=true;this.onStatus('Finishing live speech');
  this.source?.disconnect();const generation=this.generation;
  await new Promise(resolve=>{this.resolveFlush=()=>{clearTimeout(this.flushTimer);resolve();};this.flushTimer=setTimeout(resolve,500);this.node.port.postMessage('flush');});
  if(generation!==this.generation)return;
  this.stopCapture();if(this.socket?.readyState===1)this.socket.send(JSON.stringify({type:'finish'}));else this.finish();
  this.finishTimer=setTimeout(()=>{if(this.busy)this.fail('Final transcription timed out. The last live draft remains provisional.');},8000);
 }
 finish(){clearTimeout(this.startTimer);clearTimeout(this.finishTimer);this.busy=false;this.active=false;this.stopCapture();this.socket?.close();this.onStatus('Mic off');}
 fail(message){if(this.failing)return;this.failing=true;this.reset();this.onError(Error(message));this.failing=false;}
 reset(){this.generation++;this.active=false;this.starting=false;this.busy=false;clearTimeout(this.startTimer);clearTimeout(this.finishTimer);clearTimeout(this.flushTimer);this.resolveFlush?.();this.rejectStart?.(Error('Cancelled'));this.stopCapture();this.socket?.close();this.socket=null;this.onQueue(0);this.onStatus('Mic off');}
 retry(){void this.start();}
}
// One controller keeps settings/tests and the explicit phrase-clip fallback compatible.
export class LiveVoiceInput {
 constructor(options){this.options=options;this.clips=new VoiceInput(options);this.live=new StreamingVoice(options);this.current=this.clips;}
 get active(){return this.current.active;}get starting(){return this.current.starting;}get busy(){return this.current.busy;}get queue(){return this.current.queue;}get failed(){return this.current.failed;}get testOnly(){return this.current.testOnly;}
 async start(options={}){if(this.active||this.starting||this.busy)return;this.current=!options.testOnly&&this.options.transport()==='streaming'?this.live:this.clips;return this.current.start(options);}
 pause(){return this.current.pause();}retry(){return this.current.retry();}reset(){this.clips.reset();this.live.reset();}
}
