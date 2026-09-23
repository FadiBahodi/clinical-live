import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter,once} from 'node:events';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {WebSocket} from 'ws';
import {createServer} from '../server.mjs';
import {LatestLane} from '../public/session.js';
class Provider extends EventEmitter{
 constructor(){super();this.sent=[];this.readyState=1;this.bufferedAmount=0;queueMicrotask(()=>this.emit('open'));}
 send(text){const data=JSON.parse(text);this.sent.push(data);if(data.setup)queueMicrotask(()=>this.message({setupComplete:{}}));}
 message(data){this.emit('message',JSON.stringify(data));}
 close(){this.readyState=3;this.emit('close');}
}
async function fixture(t,options={}){
 const providers=[];const server=createServer(undefined,{env:{GEMINI_API_KEY:'test-only'},liveAudio:{connect:()=>{const p=new Provider();providers.push(p);return p;},...options}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 const response=await fetch(base+'/api/status');const cookie=response.headers.get('set-cookie').split(';')[0];const clients=[];
 t.after(()=>{for(const c of clients)c.terminate();server.closeAllConnections();server.close();});
 function connect(headers={origin:base,cookie}){const ws=new WebSocket(base.replace('http:','ws:')+'/api/listen',{headers});clients.push(ws);return ws;}
 return {providers,connect,base,cookie};
}
function next(ws,type){return new Promise((resolve,reject)=>{const listener=bytes=>{const data=JSON.parse(bytes);if(data.type===type){ws.off('message',listener);resolve(data);}};ws.on('message',listener);});}
test('stream accepts continuous PCM and sends revisable partials followed by a final, without an API key in browser messages',async t=>{
 const {connect,providers}=await fixture(t);const ws=connect();await next(ws,'ready');
 ws.send(Buffer.alloc(3200));const received=next(ws,'interim');providers[0].message({serverContent:{interimInputTranscription:{text:'BP 90'}}});assert.equal((await received).text,'BP 90');
 const final=next(ws,'final');providers[0].message({serverContent:{inputTranscription:{text:'BP 120 over 70'}}});assert.equal((await final).text,'BP 120 over 70');
 await new Promise(r=>setTimeout(r,5));assert.equal(providers[0].sent[1].realtimeInput.audio.mimeType,'audio/pcm;rate=16000');
 assert.ok(!JSON.stringify(providers[0].sent).includes('test-only'));
});
test('stream rejects a missing session, a foreign origin and a second capture in the same session',async t=>{
 const {connect,base,cookie}=await fixture(t);for(const headers of [{origin:base},{origin:'https://foreign.invalid',cookie}]){const ws=connect(headers);const [error]=await once(ws,'error');assert.match(error.message,/403/);}
 const first=connect();await next(first,'ready');const second=connect();const [error]=await once(second,'error');assert.match(error.message,/403/);
});
test('renewal holds new PCM until the old final commits, then resumes on a fresh provider stream',async t=>{
 const {connect,providers}=await fixture(t,{renewMs:30});const ws=connect();await next(ws,'ready');await next(ws,'renewing');ws.send(Buffer.alloc(3200,1));
 await new Promise(r=>setTimeout(r,5));const ready=next(ws,'ready');providers[0].message({serverContent:{inputTranscription:{text:'Old phrase'},generationComplete:true}});await ready;
 assert.equal(providers.length,2);assert.equal(providers[1].sent[1].realtimeInput.audio.data,Buffer.alloc(3200,1).toString('base64'));
});
test('malformed PCM and upstream failures stop listening without leaking provider details',async t=>{
 const {connect,providers}=await fixture(t);const ws=connect();await next(ws,'ready');const error=next(ws,'error');ws.send(Buffer.alloc(3));assert.match((await error).message,/Invalid audio/);assert.equal(providers[0].readyState,3);
});
test('worklet sends every sample once in 100 ms frames, including its final partial frame',()=>{
 let Worklet;const messages=[];class AudioWorkletProcessor{constructor(){this.port={postMessage:m=>messages.push(m)}}}
 vm.runInNewContext(readFileSync(new URL('../public/pcm-worklet.js',import.meta.url),'utf8'),{AudioWorkletProcessor,registerProcessor:(_name,value)=>{Worklet=value;},Int16Array,Math});
 const worklet=new Worklet(),samples=Float32Array.from({length:4992},(_,i)=>i%2?0.5:-0.5);
 for(let i=0;i<samples.length;i+=128)worklet.process([[samples.subarray(i,i+128)]]);
 worklet.port.onmessage({data:'flush'});const frames=messages.filter(m=>m.pcm);assert.deepEqual(frames.map(m=>m.pcm.byteLength),[3200,3200,3200,384]);
 const output=frames.flatMap(m=>[...new Int16Array(m.pcm)]);assert.equal(output.length,samples.length);assert.ok(output.every((v,i)=>v===(i%2?16383:-16384)));
});
test('a revised live source and its identical finalization both reach the model under the same source ID',async()=>{
 const calls=[];let resolve;const lane=new LatestLane({request:(segments,previous,signal,revision)=>{calls.push({segments,revision});return new Promise(r=>resolve=r);},onResult:()=>{}});
 const turn=()=>new Promise(r=>setImmediate(r));
 lane.push([{id:'s1',text:'BP 90'}],{provisionalIds:['s1']});lane.push([{id:'s1',text:'BP 120 over 70'}],{provisionalIds:['s1']});resolve({data:{}});await turn();assert.deepEqual(calls[1].revision.newUtteranceIds,['s1']);
 resolve({data:{}});await turn();lane.push([{id:'s1',text:'BP 120 over 70'}],{provisionalIds:[]});assert.deepEqual(calls[2].revision.newUtteranceIds,['s1']);assert.deepEqual(calls[2].revision.provisionalIds,[]);resolve({data:{}});await turn();
});
test('final speech preempts its pending draft and late draft output cannot overwrite it',async()=>{
 const calls=[],results=[];const lane=new LatestLane({preemptFinal:true,request:(segments,previous,signal,revision)=>new Promise(resolve=>calls.push({resolve,signal,revision})),onResult:r=>results.push(r.data)});
 lane.push([{id:'s1',text:'BP 100'}],{provisionalIds:['s1']});lane.push([{id:'s1',text:'BP 120 over 70'}],{provisionalIds:[]});
 assert.equal(calls.length,2);assert.equal(calls[0].signal.aborted,true);calls[1].resolve({data:'final'});await new Promise(r=>setImmediate(r));calls[0].resolve({data:'stale'});await new Promise(r=>setImmediate(r));assert.deepEqual(results,['final']);
});
import {StreamingVoice} from '../public/live-voice.js';
function browserFixture(overrides={}){
 const events=[],errors=[],statuses=[];let socket,stopped=0;const stream={getTracks:()=>[{stop:()=>stopped++}]};
 globalThis.location={href:'http://127.0.0.1:8840/'};
 const node={connect(){},disconnect(){},port:{postMessage(){queueMicrotask(()=>{node.port.onmessage({data:{pcm:new ArrayBuffer(64),level:0}});node.port.onmessage({data:{flushed:true}});});}}};
 const voice=new StreamingVoice({onTranscript:t=>events.push(['final',t]),onPartial:t=>events.push(['partial',t]),onError:e=>errors.push(e.message),onStatus:s=>statuses.push(s),getStream:async()=>stream,
  socketFactory:()=>{socket={readyState:1,bufferedAmount:0,send:value=>events.push(['send',typeof value==='string'?JSON.parse(value):value.byteLength]),close(){this.readyState=3;}};queueMicrotask(()=>socket.onmessage({data:JSON.stringify({type:'ready'})}));return socket;},
  contextFactory:()=>({sampleRate:16000,audioWorklet:{addModule:async()=>{}},createMediaStreamSource:()=>({connect(){},disconnect(){}}),createGain:()=>({gain:{},connect(){},disconnect(){}}),resume:async()=>{},close:async()=>{}}),workletFactory:()=>node,...overrides});
 return {voice,events,errors,statuses,stream,get socket(){return socket;},get stopped(){return stopped;}};
}
test('pausing streams the partial audio frame before finish and accepts the final transcript',async()=>{
 const f=browserFixture();await f.voice.start();assert.equal(f.voice.active,true);await f.voice.pause();assert.deepEqual(f.events.filter(e=>e[0]==='send'),[['send',64],['send',{type:'finish'}]]);
 f.socket.onmessage({data:JSON.stringify({type:'final',text:'Corrected phrase'})});f.socket.onmessage({data:JSON.stringify({type:'finished'})});assert.equal(f.voice.busy,false);assert.ok(f.stopped);assert.deepEqual(f.events.at(-1),['final','Corrected phrase']);f.voice.reset();
});
test('clearing during microphone initialization closes the arriving stream and ignores old speech',async()=>{
 let deliver;const f=browserFixture({getStream:()=>new Promise(r=>deliver=r)});const starting=f.voice.start();await new Promise(r=>setImmediate(r));f.voice.reset();deliver(f.stream);await starting;
 f.socket.onmessage({data:JSON.stringify({type:'final',text:'stale'})});assert.equal(f.stopped,1);assert.ok(!f.events.some(e=>e[0]==='final'));assert.equal(f.voice.active,false);
});
test('a disconnected stream stops the microphone and reports the unfinished phrase instead of silently continuing',async()=>{
 const f=browserFixture();await f.voice.start();f.socket.onclose();assert.equal(f.voice.active,false);assert.ok(f.stopped);assert.match(f.errors[0],/unfinished phrase/);
});
test('frequent final phrases cannot starve the first substantial assessment',async()=>{
 const calls=[],shown=[];const lane=new LatestLane({request:(_s,_p,signal)=>new Promise(resolve=>calls.push({signal,resolve})),onResult:r=>shown.push(r.data)});
 lane.previous={summary:'',vitals:[],differential:[],history:[],exam:[]};
 lane.push([{id:'s1',text:'Dyspnea'}],{provisionalIds:['s1']});lane.push([{id:'s1',text:'Dyspnea'}],{provisionalIds:[]});lane.push([{id:'s1',text:'Dyspnea'},{id:'s2',text:'Chest pain'}],{provisionalIds:[]});assert.equal(calls.length,1);assert.equal(calls[0].signal.aborted,false);calls[0].resolve({data:'initial'});await new Promise(r=>setImmediate(r));assert.equal(calls.length,2);assert.deepEqual(shown,['initial']);calls[1].resolve({data:'latest'});await new Promise(r=>setImmediate(r));assert.deepEqual(shown,['initial','latest']);
});
test('idle streams renew even when the provider emits no final transcript for silence',async t=>{
 const {connect,providers}=await fixture(t,{renewMs:20});const ws=connect();await next(ws,'ready');await next(ws,'renewing');await next(ws,'ready');assert.equal(providers.length,2);
});
