import test from 'node:test';
import assert from 'node:assert/strict';
import {builtInAdapter,providerStatus,listModels} from '../lib/providers.mjs';
import {defaults} from '../lib/settings.mjs';
import {snapshot,segments} from '../public/demo.js';
test('provider selection is explicit in status and contains no credentials',()=>{
 const env={GEMINI_API_KEY:'fixture-secret'};
 assert.equal(providerStatus(env).audioReady,true);assert.equal(providerStatus(env).transcription,'gemini');
 assert.equal(providerStatus({...env,OPENAI_API_KEY:'other'}).transcription,'openai');
 assert.equal(providerStatus({...env,TRANSCRIPTION_PROVIDER:'openai'}).audioReady,false);
 assert.doesNotMatch(JSON.stringify(providerStatus(env)),/fixture-secret/);
});
test('OpenAI transcription uses a WAV file, JSON response and server-side credential',async()=>{
 const result=await builtInAdapter({task:'transcribe',audio:Buffer.from('synthetic audio bytes').toString('base64'),mimeType:'audio/wav'}, {
  env:{OPENAI_API_KEY:'fixture-key'},fetcher:async(url,options)=>{
   assert.equal(url,'https://api.openai.com/v1/audio/transcriptions');assert.equal(options.headers.Authorization,'Bearer fixture-key');
   assert.equal(options.body.get('file').name,'speech.wav');assert.equal(options.body.get('model'),'gpt-4o-transcribe');assert.equal(options.body.get('response_format'),'json');
   return {ok:true,json:async()=>({text:'Lactate requested.'})};
  }
 });assert.equal(result.text,'Lactate requested.');
});
test('Gemini-only installs support transcription without uploading files to a persistent Files API',async()=>{
 const result=await builtInAdapter({task:'transcribe',audio:'AAAA',mimeType:'audio/wav'}, {env:{GEMINI_API_KEY:'fixture-key'},fetcher:async(url,options)=>{
  assert.match(url,/:generateContent$/);const body=JSON.parse(options.body);
  assert.equal(body.contents[0].parts[0].inlineData.mimeType,'audio/wav');assert.equal(body.contents[0].parts[0].inlineData.data,'AAAA');
  assert.match(body.systemInstruction.parts[0].text,/Do not answer/);
  return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'{"text":"No penicillin allergy."}'}]},finishReason:'STOP'}]})};
 }});assert.equal(result.text,'No penicillin allergy.');
});
test('each interpretation lane receives its schema, speech and prior state',async()=>{
 const result=await builtInAdapter({task:'analyze',lane:'plan',instructions:'contract',segments,previous:snapshot(0).plan},{env:{GEMINI_API_KEY:'fixture-key',GEMINI_MODEL:'models/configured-model'},fetcher:async(url,options)=>{
  assert.match(url,/configured-model:generateContent$/);const body=JSON.parse(options.body);
  assert.ok(body.generationConfig.responseJsonSchema.properties.management);assert.ok(JSON.parse(body.contents[0].parts[0].text).previous);
  assert.equal(body.tools,undefined);assert.doesNotMatch(options.body,/fixture-key/);
  return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(snapshot(1).plan)}]},finishReason:'STOP'}]})};
 }});assert.equal(result.management.find(i=>i.id==='m-cultures').state,'requested');
});
test('truncated model responses cannot replace the display',async()=>{
 await assert.rejects(builtInAdapter({task:'analyze',lane:'plan',instructions:'contract',segments},{env:{GEMINI_API_KEY:'fixture-key'},fetcher:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]})})}));
});
test('missing credentials fail before any network call',async()=>{
 let calls=0;await assert.rejects(builtInAdapter({task:'transcribe'},{env:{},fetcher:async()=>{calls++;}}));assert.equal(calls,0);
});
test('OpenAI interpretation uses the chosen role model and strict non-stored Responses output',async()=>{
 const settings=defaults({OPENAI_API_KEY:'fixture-key'});settings.answer.model='selected-answer-model';
 const result=await builtInAdapter({task:'analyze',lane:'answer',instructions:'answer contract',segments,previous:{answer:null}},{settings,keys:{openai:'fixture-key'},fetcher:async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);
  assert.equal(body.model,'selected-answer-model');assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.text.format.name,'clinical_answer');
  assert.equal(body.text.format.schema.additionalProperties,false);assert.deepEqual(JSON.parse(body.input).previous,{answer:null});assert.doesNotMatch(options.body,/fixture-key/);
  return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"answer":null}'}]}]})};
 }});assert.deepEqual(result,{answer:null});
 for(const data of [{status:'incomplete',output:[]},{status:'completed',output:[{content:[{type:'refusal'}]}]}])await assert.rejects(builtInAdapter({task:'analyze',lane:'answer',segments},{settings,keys:{openai:'fixture-key'},fetcher:async()=>({ok:true,json:async()=>data})}));
});
test('model catalogs follow provider pagination without mixing credentials into URLs',async()=>{
 const urls=[];
 const models=await listModels('gemini','fixture-secret',{fetcher:async(url,options)=>{
  urls.push(url);assert.doesNotMatch(url,/fixture-secret/);assert.equal(options.headers['x-goog-api-key'],'fixture-secret');
  return {ok:true,json:async()=>urls.length===1?{models:[{name:'models/first',supportedGenerationMethods:['generateContent']}],nextPageToken:'next/page'}:{models:[{name:'models/embed',supportedGenerationMethods:['embedContent']},{name:'models/second',supportedGenerationMethods:['generateContent']}]}};
 }});assert.deepEqual(models.map(m=>m.id),['first','second']);assert.match(urls[1],/pageToken=next%2Fpage/);
});
