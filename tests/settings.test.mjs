import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.mjs';
import {defaults} from '../lib/settings.mjs';
import {snapshot,segments} from '../public/demo.js';
import http from 'node:http';
async function serve(options,adapter,run){const server=createServer(adapter,options);await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await run('http://127.0.0.1:'+server.address().port);}finally{await new Promise(r=>server.close(r));}}
const cookie=r=>r.headers.get('set-cookie').split(';')[0];
const post=(base,path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
const hostedFetch=(url,options={})=>new Promise((resolve,reject)=>{const req=http.request(url,options,res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));});req.on('error',reject);req.end(options.body);});
const hostedPost=(base,path,body,headers={})=>hostedFetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});

test('browser sessions choose independent models and keep credentials out of responses',async()=>{
 const requests=[];
 await serve({env:{},fetcher:async()=>({ok:true,json:async()=>({models:[]})})},async(req,options)=>{requests.push(options);return snapshot(0).plan;},async base=>{
  const first=await fetch(base+'/api/status'), a=cookie(first),second=await fetch(base+'/api/status'), b=cookie(second);
  assert.notEqual(a,b);
  const connected=await post(base,'/api/connection',{provider:'gemini',key:'private-fixture-credential'},{Cookie:a});
  const result=await connected.text();assert.doesNotMatch(result,/private-fixture/);assert.equal(JSON.parse(result).connected.gemini,true);
  const settings=defaults({});settings.plan.model='chosen-plan-model';settings.profile='resus';
  assert.equal((await post(base,'/api/settings',settings,{Cookie:a})).status,200);
  await post(base,'/api/analyze',{lane:'plan',segments:segments.slice(0,1)},{Cookie:a});
  assert.equal(requests[0].settings.plan.model,'chosen-plan-model');assert.equal(requests[0].keys.gemini,'private-fixture-credential');
  const other=await (await fetch(base+'/api/status',{headers:{Cookie:b}})).json();assert.equal(other.connected.gemini,false);assert.notEqual(other.settings.plan.model,'chosen-plan-model');
  const openai=await (await post(base,'/api/connection',{provider:'openai',key:'another-fixture-credential'},{Cookie:b})).json();
  assert.equal(openai.analysisReady,true);assert.equal(openai.audioReady,true);assert.equal(openai.settings.assessment.provider,'openai');assert.equal(openai.settings.transcription.model,'gpt-4o-transcribe');
  assert.equal((await post(base,'/api/connection',{provider:'unknown',key:'x'},{Cookie:a})).status,400);
  assert.equal((await post(base,'/api/settings',{...settings,plan:{provider:'gemini',model:'bad model'}},{Cookie:a})).status,400);
 });
});

test('hosted deployment requires an access code and rejects cross-origin use',async()=>{
 assert.throws(()=>createServer(undefined,{env:{PUBLIC_ORIGIN:'http://public.invalid',ACCESS_PASSWORD:'a'.repeat(20)}}),/HTTPS/);
 assert.throws(()=>createServer(undefined,{env:{PUBLIC_ORIGIN:'https://workspace.example'}}),/ACCESS_PASSWORD/);
 await serve({env:{PUBLIC_ORIGIN:'https://workspace.example',ACCESS_PASSWORD:'test-only-access-code'}},async()=>({answer:null}),async base=>{
  const headers={Host:'workspace.example'};
  const health=await hostedFetch(base+'/healthz',{headers});assert.equal(health.status,200);assert.equal(health.headers.get('set-cookie'),null);
  const first=await hostedFetch(base,{headers}), session=cookie(first);assert.match(await first.text(),/Access code/);
  assert.match(first.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);assert.match(first.headers.get('set-cookie'),/Secure/);
  headers.Cookie=session;
  assert.equal((await hostedFetch(base+'/api/status',{headers})).status,401);
  assert.equal((await hostedPost(base,'/api/login',{password:'wrong'},headers)).status,401);
  assert.equal((await hostedPost(base,'/api/login',{password:'test-only-access-code'},headers)).status,200);
  assert.equal((await hostedFetch(base+'/api/status',{headers})).status,200);
  assert.equal((await hostedPost(base,'/api/analyze',{lane:'answer',segments:segments.slice(0,1)},{...headers,Origin:'https://foreign.example'})).status,403);
  assert.equal((await fetch(base+'/api/status')).status,403);
 });
});

test('remembered setup restores through a fresh HTTP server session and forget stays forgotten',async()=>{
 const {DevicePreferences}=await import('../public/preferences.js');const data=new Map();const prefs=new DevicePreferences({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)});
 prefs.key('gemini','test-only-remembered-key',true);const settings=defaults({});settings.answer.model='custom-answer';prefs.settings(settings);
 const options={env:{},fetcher:async()=>({ok:true,json:async()=>({models:[]})})};
 const visit=async base=>{
  const session=cookie(await fetch(base+'/api/status'));
  const request=async(path,body)=>{const response=await post(base,path,body,{Cookie:session});assert.equal(response.status,200);return response.json();};
  assert.deepEqual(await prefs.restore(request),[]);
  const status=await (await fetch(base+'/api/status',{headers:{Cookie:session}})).json();
  assert.equal(status.connected.gemini,true);assert.equal(status.settings.answer.model,'custom-answer');
  return {request,session};
 };
 await serve(options,undefined,visit);
 await serve(options,undefined,async base=>{
  const {request,session}=await visit(base);prefs.key('gemini','',false);await request('/api/connection',{provider:'gemini',key:''});
  const status=await (await fetch(base+'/api/status',{headers:{Cookie:session}})).json();assert.equal(status.connected.gemini,false);
 });
 await serve(options,undefined,async base=>{
  const session=cookie(await fetch(base+'/api/status'));await prefs.restore(async(path,body)=>{assert.notEqual(path,'/api/connection');return post(base,path,body,{Cookie:session});});
  const status=await (await fetch(base+'/api/status',{headers:{Cookie:session}})).json();assert.equal(status.connected.gemini,false);
 });
});
