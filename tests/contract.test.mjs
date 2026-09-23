import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLane,validateSegments} from '../lib/contract.mjs';
import {snapshot,segments} from '../public/demo.js';
import {createServer} from '../server.mjs';

test('all four synthetic stages have valid clinical sections and utterance references',()=>{
 for(let step=0;step<4;step++)for(const lane of ['assessment','plan'])validateLane(snapshot(step)[lane],lane,segments.slice(0,step+1));
});
test('the authored correction replaces BP and its dependent fluid indication',()=>{
 assert.equal(snapshot(0).assessment.vitals[0].value,'88/54');
 assert.equal(snapshot(2).assessment.vitals[0].value,'108/64');
 assert.match(snapshot(2).plan.management.find(i=>i.id==='m-fluid').text,/reassess perfusion/);
 assert.deepEqual(snapshot(2).assessment.vitals[0].sourceIds,['speech-1','speech-3']);
});
test('requests, collection, results, and unknown allergy stay distinct',()=>{
 const find=(step,id)=>snapshot(step).plan.management.find(i=>i.id===id);
 assert.equal(find(1,'m-cultures').state,'requested');assert.equal(find(2,'m-cultures').state,'done');
 assert.equal(find(1,'m-lactate').state,'requested');assert.equal(find(2,'m-lactate').state,'result');
 assert.equal(snapshot(2).assessment.history.find(i=>i.id==='h-allergy').state,'to clarify');
 assert.equal(find(3,'m-abx').state,'consider');
});
test('there is no invented question; only the latest direct question is shown',()=>{
 assert.equal(snapshot(0).plan.answer,null);
 assert.match(snapshot(1).plan.answer.question,/leading diagnosis/);
 assert.match(snapshot(3).plan.answer.question,/antibiotic/);
});
test('unknown references, duplicate identities and invalid action states are rejected',()=>{
 const v=snapshot(0).assessment;v.vitals[0].sourceIds=['invented'];assert.throws(()=>validateLane(v,'assessment',segments));
 const duplicate=snapshot(0).assessment;duplicate.history[0].id=duplicate.vitals[0].id;assert.throws(()=>validateLane(duplicate,'assessment',segments));
 const plan=snapshot(1).plan;plan.management[0].state='probably done';assert.throws(()=>validateLane(plan,'plan',segments));
});
test('unspoken suggestions need no invented evidence, while reported facts require speech',()=>{
 const assessment=snapshot(0).assessment;assessment.history.find(i=>i.state==='to clarify').sourceIds=[];
 validateLane(assessment,'assessment',segments);
 assessment.history.find(i=>i.state==='reported').sourceIds=[];
 assert.throws(()=>validateLane(assessment,'assessment',segments));
 const plan=snapshot(1).plan;plan.management.find(i=>i.state==='requested').sourceIds=[];
 assert.throws(()=>validateLane(plan,'plan',segments));
});
test('transcript limits and duplicate utterance identifiers are explicit errors',()=>{
 assert.throws(()=>validateSegments([segments[0],segments[0]]));assert.throws(()=>validateSegments([]));
 assert.throws(()=>validateSegments([{id:'a',text:'x'.repeat(30001)}]));
});
async function withServer(adapter,run){const server=createServer(adapter);await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await run(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(r=>server.close(r));}}
const post=(base,path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('HTTP lanes carry the contract, preserve state, and reject foreign origins',async()=>{
 const requests=[];
 await withServer(async r=>{requests.push(r);return r.task==='transcribe'?{text:'Lactate requested.'}:snapshot(1)[r.lane];},async base=>{
  const page=await fetch(base);assert.match(await page.text(),/Start listening/);
  const result=await post(base,'/api/analyze',{lane:'plan',segments:segments.slice(0,2)});assert.equal(result.status,200);
  assert.equal((await result.json()).data.management.find(i=>i.id==='m-cultures').state,'requested');
  assert.match(requests[0].instructions,/a test order is not its result/);
  assert.equal(requests[0].version,3);
  assert.equal((await post(base,'/api/analyze',{lane:'assessment',segments},{Origin:'https://foreign.invalid'})).status,403);
  assert.equal((await post(base,'/api/transcribe',{audio:'AAAA',mimeType:'text/html'})).status,400);
  const transcribed=await post(base,'/api/transcribe',{audio:'AAAA',mimeType:'audio/wav'});assert.equal((await transcribed.json()).text,'Lactate requested.');
  assert.equal((await post(base,'/api/analyze',{lane:'unknown',segments})).status,400);
 });
});
test('provider errors retain no secret details in the public response',async()=>{
 await withServer(async()=>{throw new Error('secret-provider-key and private speech');},async base=>{
  const response=await post(base,'/api/analyze',{lane:'plan',segments});assert.equal(response.status,502);
  assert.doesNotMatch(await response.text(),/secret-provider|private speech/);
 });
});
test('local VAD assets resolve with correct types, without exposing node_modules or credentials',async()=>{
 await withServer(async()=>{},async base=>{
  const wasm=await fetch(base+'/vendor/ort/ort-wasm-simd-threaded.wasm');assert.equal(wasm.status,200);assert.equal(wasm.headers.get('content-type'),'application/wasm');await wasm.body.cancel();
  const vad=await fetch(base+'/vendor/vad/bundle.min.js');assert.equal(vad.status,200);assert.match(vad.headers.get('content-security-policy'),/wasm-unsafe-eval/);
  for(const path of ['/.env','/node_modules/onnxruntime-web/package.json','/vendor/ort/package.json'])assert.equal((await fetch(base+path)).status,404);
 });
});
