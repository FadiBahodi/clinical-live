import test from 'node:test';
import assert from 'node:assert/strict';
import {LatestLane,encodeWav} from '../public/session.js';
import {VoiceInput,voiceOptions} from '../public/voice.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('rapid speech coalesces to the full newest transcript after an in-flight update',async()=>{
 const pending=[],sent=[],shown=[];
 const lane=new LatestLane({request:(segments,previous)=>{sent.push({segments,previous});return new Promise(r=>pending.push(r));},onResult:r=>shown.push(r)});
 lane.push([{id:'1',text:'Initial'}]);lane.push([{id:'1',text:'Initial'},{id:'2',text:'More'}]);lane.push([{id:'1',text:'Initial'},{id:'2',text:'More'},{id:'3',text:'Correction'}]);
 assert.equal(sent.length,1);pending.shift()({data:{version:1}});await tick();
 assert.equal(sent.length,2);assert.equal(sent[1].segments.length,3);assert.equal(sent[1].previous.version,1);
 pending.shift()({data:{version:3}});await tick();assert.equal(shown.at(-1).data.version,3);
});
test('late results and queued speech from a cleared encounter cannot appear in the new one',async()=>{
 const pending=[],shown=[];const lane=new LatestLane({request:()=>new Promise(r=>pending.push(r)),onResult:r=>shown.push(r)});
 lane.push([{id:'old'}]);lane.push([{id:'old'},{id:'old2'}]);lane.reset();lane.push([{id:'new'}]);
 pending[0]({data:{case:'old'}});await tick();assert.equal(shown.length,0);assert.equal(lane.active,true);
 pending[1]({data:{case:'new'}});await tick();assert.equal(shown[0].data.case,'new');
});
test('one slow lane does not block the other and a failed response preserves prior data',async()=>{
 let resolveSlow;const shown=[],errors=[];
 const slow=new LatestLane({request:()=>new Promise(r=>resolveSlow=r),onResult:r=>shown.push(r)});
 const fast=new LatestLane({request:async()=>({data:{plan:'ready'}}),onResult:r=>shown.push(r),onError:e=>errors.push(e)});
 slow.push([{id:'1'}]);fast.push([{id:'1'}]);await tick();assert.equal(shown[0].data.plan,'ready');
 fast.request=async()=>{throw new Error('offline');};fast.push([{id:'2'}]);await tick();assert.equal(fast.previous.plan,'ready');assert.equal(errors.length,1);
 resolveSlow({data:{assessment:'ready'}});await tick();assert.equal(shown.length,2);
});
test('WAV encoding preserves signed PCM, duration, sample rate and mono metadata',()=>{
 const view=new DataView(encodeWav(new Float32Array([-1,0,1])));
 assert.equal(view.getUint32(24,true),16000);assert.equal(view.getUint16(22,true),1);assert.equal(view.getUint32(40,true),6);
 assert.equal(view.getInt16(44,true),-32768);assert.equal(view.getInt16(46,true),0);assert.equal(view.getInt16(48,true),32767);
});
test('speech detector is local, tolerates short speech and flushes the final phrase on pause',()=>{
 const options=voiceOptions({getStream:async()=>{},onSpeech:()=>{}});
 assert.equal(options.baseAssetPath,'/vendor/vad/');assert.equal(options.onnxWASMBasePath,'/vendor/ort/');
 assert.equal(options.submitUserSpeechOnPause,true);assert.equal(options.minSpeechMs,128);assert.equal(options.redemptionMs,450);
});
test('failed audio remains queued for retry and is transcribed once',async t=>{
 let calls=0;const heard=[];
 t.mock.method(globalThis,'fetch',async()=>{calls++;return calls===1?{ok:false,json:async()=>({})}:{ok:true,json:async()=>({text:'Correction: no allergy.',elapsedMs:12})};});
 const voice=new VoiceInput({onTranscript:t=>heard.push(t)});voice.enqueue(encodeWav(new Float32Array(4000)),'audio/wav');await tick();
 assert.equal(voice.failed,true);assert.equal(voice.queue.length,1);voice.retry();await tick();assert.equal(voice.queue.length,0);assert.deepEqual(heard,['Correction: no allergy.']);
});
test('new encounter aborts in-flight transcription and discards only that encounter queue',async t=>{
 let finish;const heard=[];
 t.mock.method(globalThis,'fetch',()=>new Promise(r=>finish=r));
 const voice=new VoiceInput({onTranscript:t=>heard.push(t)});voice.enqueue(encodeWav(new Float32Array(4000)),'audio/wav');voice.reset();
 finish({ok:true,json:async()=>({text:'Old case'})});await tick();assert.deepEqual(heard,[]);assert.equal(voice.queue.length,0);
});
test('microphone test uses selected pause timing and never enqueues audio',async t=>{
 let calls=0,options,stopped=0;const heard=[];
 t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Must stay local');});
 const voice=new VoiceInput({onTranscript:t=>heard.push(t),pauseMs:()=>800,getStream:async()=>({getTracks:()=>[{stop:()=>stopped++}]}),loadRuntime:async()=>({MicVAD:{new:async value=>{options=value;await value.getStream();return {start:async()=>{},pause:async()=>value.onSpeechEnd(new Float32Array(5000)),destroy:async()=>{}};}}})});
 await voice.start({testOnly:true});assert.equal(voice.active,true);assert.equal(options.redemptionMs,800);
 options.onSpeechEnd(new Float32Array(5000));await voice.pause();await tick();
 assert.equal(calls,0);assert.equal(voice.queue.length,0);assert.deepEqual(heard,[]);assert.equal(stopped,1);
});
test('clearing while voice initializes destroys the old capture without interrupting a new one',async()=>{
 let finish,created=0,oldDestroyed=0;const tracks=[];
 const voice=new VoiceInput({onTranscript:()=>{},getStream:async()=>{const track={stopped:false,stop(){this.stopped=true;}};tracks.push(track);return {getTracks:()=>[track]};},loadRuntime:async()=>({MicVAD:{new:async options=>{
  const id=++created;await options.getStream();if(id===1)await new Promise(r=>finish=r);
  return {start:async()=>{},pause:async()=>{},destroy:async()=>{if(id===1)oldDestroyed++;}};
 }}})});
 const old=voice.start();await tick();voice.reset();await voice.start();finish();await old;
 assert.equal(voice.active,true);assert.equal(oldDestroyed,1);assert.equal(tracks[0].stopped,true);assert.equal(tracks[1].stopped,false);await voice.pause();
});
