// The AudioContext resamples the device stream to 16 kHz. No main-thread capture or VAD gating.
class PCMStream extends AudioWorkletProcessor {
 constructor(){super();this.samples=new Int16Array(1600);this.used=0;this.power=0;this.port.onmessage=e=>{if(e.data==='flush'){this.flush();this.port.postMessage({flushed:true});}};}
 flush(){if(!this.used)return;const pcm=this.samples.buffer.slice(0,this.used*2);this.port.postMessage({pcm,level:Math.min(1,Math.sqrt(this.power/this.used)*12)},[pcm]);this.used=0;this.power=0;}
 process(inputs){const channel=inputs[0]?.[0];if(channel)for(const n of channel){const value=Math.max(-1,Math.min(1,n));this.samples[this.used++]=value<0?value*32768:value*32767;this.power+=value*value;if(this.used===1600)this.flush();}return true;}
}
registerProcessor('pcm-stream',PCMStream);
