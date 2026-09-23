import test from 'node:test';
import assert from 'node:assert/strict';
import {VoiceInput,voiceOptions} from '../public/voice.js';
import {LatestLane,encodeWav} from '../public/session.js';
import {applyUpdate} from '../lib/updates.mjs';
import {builtInAdapter} from '../lib/providers.mjs';
import {snapshot,segments} from '../public/demo.js';
import frameModule from '../node_modules/@ricky0123/vad-web/dist/frame-processor.js';
import messageModule from '../node_modules/@ricky0123/vad-web/dist/messages.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const empty=()=>({upsert:[],remove:[]});
const assessmentPatch=()=>({summary:null,vitals:empty(),differential:null,history:empty(),exam:empty()});
test('an empty delta keeps every field and identity; changed items replace atomically',()=>{
 const before=snapshot(1).assessment,patch=assessmentPatch();assert.deepEqual(applyUpdate(before,patch,'assessment',segments),before);
 patch.vitals.upsert=[{...before.vitals[0],value:'108/64',flag:'none',flagReason:'',sourceIds:['speech-3']}];
 patch.history.remove=[before.history[0].id];const next=applyUpdate(before,patch,'assessment',segments);
 assert.equal(next.vitals[0].value,'108/64');assert.equal(before.vitals[0].value,'88/54');assert.equal(next.history.some(i=>i.id===before.history[0].id),false);assert.strictEqual(next.history[0],before.history[1]);
});
test('dose and administration changes cannot partially overwrite or silently remove items',()=>{
 const before=snapshot(1).plan,item=before.management.find(i=>i.tag==='MED');
 const next=applyUpdate(before,{management:{upsert:[{...item,dose:'',route:'',state:'done',sourceIds:['speech-3']}],remove:[]}},'plan',segments);
 assert.equal(next.management.find(i=>i.id===item.id).dose,'');assert.equal(next.management.length,before.management.length);
 assert.throws(()=>applyUpdate(before,{management:{upsert:[{id:item.id,text:'changed'}],remove:[]}},'plan',segments));
 assert.throws(()=>applyUpdate(before,{management:{upsert:[item],remove:[item.id]}},'plan',segments));
 assert.throws(()=>applyUpdate(before,{management:{upsert:[],remove:['made-up']}},'plan',segments));
});
test('an unchanged answer stays; replacement and clearing are explicit',()=>{
 const before={answer:snapshot(1).plan.answer};assert.strictEqual(applyUpdate(before,{changed:false,answer:null},'answer',segments),before);
 assert.equal(applyUpdate(before,{changed:true,answer:null},'answer',segments).answer,null);
 assert.throws(()=>applyUpdate(before,{changed:false,answer:before.answer},'answer',segments));
});
test('incremental provider requests use the edit schema and validate the rebuilt section',async()=>{
 const before=snapshot(1).plan,patch={management:empty()};
 const result=await builtInAdapter({task:'analyze',lane:'plan',segments,previous:before,incremental:true,instructions:'Clinical contract',newUtteranceIds:['speech-3']},{env:{GEMINI_API_KEY:'fixture'},fetcher:async(url,options)=>{
  const b=JSON.parse(options.body);assert.ok(b.generationConfig.responseJsonSchema.properties.management.properties.upsert);assert.match(b.systemInstruction.parts[0].text,/UPDATE MODE/);assert.deepEqual(JSON.parse(b.contents[0].parts[0].text).newUtteranceIds,['speech-3']);
  return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(patch)}]}}]})};
 }});assert.deepEqual(result.management,before.management);
});
test('two transcriptions overlap but a later correction commits only after its predecessor',async t=>{
 const pending=[],heard=[];let now=0;
 t.mock.method(globalThis,'fetch',(_url,options)=>new Promise(resolve=>pending.push({resolve,signal:options.signal})));
 const voice=new VoiceInput({onTranscript:(text,_ms,trace)=>heard.push({text,trace}),now:()=>now});
 voice.enqueue(encodeWav(new Float32Array(4000)),'audio/wav',{speechEndedAt:0});now=100;voice.enqueue(encodeWav(new Float32Array(4000)),'audio/wav',{speechEndedAt:100});assert.equal(pending.length,2);
 now=200;pending[1].resolve({ok:true,json:async()=>({text:'Correction: BP 120/70.'})});await tick();assert.equal(heard.length,0);
 now=500;pending[0].resolve({ok:true,json:async()=>({text:'BP 90/50.'})});await tick();assert.deepEqual(heard.map(x=>x.text),['BP 90/50.','Correction: BP 120/70.']);assert.equal(heard[1].trace.committedAt-heard[1].trace.transcribedAt,300);assert.equal(voice.queue.length,0);
});
test('failed first clip preserves completed later clips and retries only the failure',async t=>{
 const pending=[],heard=[];t.mock.method(globalThis,'fetch',()=>new Promise(resolve=>pending.push(resolve)));
 const voice=new VoiceInput({onTranscript:text=>heard.push(text)});for(let n=0;n<2;n++)voice.enqueue(encodeWav(new Float32Array(4000)),'audio/wav');
 pending[1]({ok:true,json:async()=>({text:'second'})});pending[0]({ok:false,json:async()=>({})});await tick();assert.equal(voice.failed,true);assert.deepEqual(heard,[]);
 voice.retry();assert.equal(pending.length,3);pending[2]({ok:true,json:async()=>({text:'first'})});await tick();assert.deepEqual(heard,['first','second']);
});
test('clear cancels all concurrent transcriptions and prevents cross-case speech',async t=>{
 const pending=[],heard=[];t.mock.method(globalThis,'fetch',(_url,options)=>new Promise(resolve=>pending.push({resolve,signal:options.signal})));
 const voice=new VoiceInput({onTranscript:text=>heard.push(text)});for(let n=0;n<2;n++)voice.enqueue(encodeWav(new Float32Array(4000)),'audio/wav');voice.reset();assert.ok(pending.every(p=>p.signal.aborted));
 for(const p of pending)p.resolve({ok:true,json:async()=>({text:'old'})});await tick();assert.deepEqual(heard,[]);assert.equal(voice.busy,false);
});
test('continuous speech is cut at the selected ceiling with no lost or duplicated boundary samples',async t=>{
 let processor,handle,now=0;const clips=[];const {Message}=messageModule;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{const b=Buffer.from(JSON.parse(options.body).audio,'base64');clips.push([...new Int16Array(b.buffer,b.byteOffset+44,(b.length-44)/2)]);return {ok:true,json:async()=>({text:'fixture'})};});
 const voice=new VoiceInput({now:()=>now,onTranscript:()=>{},maxClipMs:()=>4000,getStream:async()=>({getTracks:()=>[{stop(){}}]}),loadRuntime:async()=>({MicVAD:{new:async options=>{
  await options.getStream();handle=event=>{if(event.msg===Message.FrameProcessed)options.onFrameProcessed(event.probs,event.frame);if(event.msg===Message.SpeechStart)options.onSpeechStart();if(event.msg===Message.SpeechEnd)options.onSpeechEnd(event.audio);if(event.msg===Message.VADMisfire)options.onVADMisfire();};
  processor=new frameModule.FrameProcessor(async()=>({isSpeech:1}),()=>{},options,32);
  return {start:async()=>processor.resume(),pause:async()=>processor.pause(handle),destroy:async()=>{}};
 }}})});
 await voice.start();const original=[];
 for(let i=0;i<520;i++){now+=32;const frame=new Float32Array(512).fill((i+1)/1000);original.push(...new Int16Array(encodeWav(frame),44));await processor.process(frame,handle);await tick();}
 await voice.pause();await tick();assert.ok(clips.length>=4);assert.ok(clips.every(c=>c.length<=16000*4.1));assert.deepEqual(clips.flat(),original);
});
test('freshness reflects queued speech and timing includes model queue wait',async()=>{
 const pending=[],states=[],results=[];let now=0;
 const lane=new LatestLane({now:()=>now,request:(_s,_p,_a,revision)=>new Promise(resolve=>pending.push({resolve,revision})),onState:(_busy,s)=>states.push(s),onResult:(_r,_count,trace)=>results.push(trace)});
 lane.push([{id:'a',text:'first'}]);now=20;lane.push([{id:'a',text:'first'},{id:'b',text:'correction'}]);now=70;pending[0].resolve({data:{}});await tick();assert.equal(states.at(-1).covered,1);assert.equal(states.at(-1).target,2);assert.deepEqual(pending[1].revision.newUtteranceIds,['b']);now=90;pending[1].resolve({data:{}});await tick();assert.equal(results[1].queuedMs,50);assert.equal(states.at(-1).covered,2);
});
