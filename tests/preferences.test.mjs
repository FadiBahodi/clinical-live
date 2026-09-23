import test from 'node:test';
import assert from 'node:assert/strict';
import {DevicePreferences} from '../public/preferences.js';
import {defaults} from '../lib/settings.mjs';
import {snapshot,segments} from '../public/demo.js';
import {validateLane} from '../lib/contract.mjs';
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
test('credentials require opt-in; forgetting removes them across a fresh app instance',async()=>{
 const storage=memory(),prefs=new DevicePreferences(storage);
 prefs.key('gemini','test-only',false);assert.deepEqual(prefs.keys(),{});
 prefs.key('gemini','test-only',true);prefs.key('openai','second-test',true);
 const fresh=new DevicePreferences(storage);assert.equal(fresh.keys().gemini,'test-only');
 fresh.key('gemini','',false);assert.deepEqual(new DevicePreferences(storage).keys(),{openai:'second-test'});
 fresh.key('openai','',false);assert.equal(storage.getItem('clinical-live-keys'),null);
});
test('restart reconnects saved keys before restoring per-role model choices',async()=>{
 const storage=memory(),prefs=new DevicePreferences(storage),calls=[];
 prefs.key('gemini','test-only',true);const settings=defaults({});settings.answer.model='custom-answer';prefs.settings(settings);
 assert.deepEqual(await new DevicePreferences(storage).restore(async(path,body)=>calls.push({path,body})),[]);
 assert.equal(calls[0].path,'/api/connection');assert.equal(calls[1].path,'/api/settings');assert.equal(calls[1].body.answer.model,'custom-answer');
 assert.equal(defaults({}).answer.model,'gemini-3.8-flash');assert.equal(defaults({}).transcription.model,'gemini-2.5-flash');
});
test('restore isolates provider failures and never echoes credential-bearing errors',async()=>{
 const prefs=new DevicePreferences(memory());prefs.key('gemini','test-only',true);prefs.key('openai','second-test',true);prefs.settings(defaults({}));const calls=[];
 const errors=await prefs.restore(async(path,body)=>{calls.push(path);if(body.provider==='gemini')throw Error('test-only');});
 assert.deepEqual(errors,['gemini could not reconnect']);assert.equal(calls.length,3);
});
test('corrupt or unavailable browser storage does not prevent temporary use',async()=>{
 const prefs=new DevicePreferences({getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');},removeItem:()=>{throw Error('blocked');}});
 assert.deepEqual(await prefs.restore(()=>{throw Error('should not run');}),[]);assert.throws(()=>prefs.key('gemini','test-only',true));
});
test('observation flags carry context and are corrected with the value',()=>{
 const early=snapshot(0).assessment,later=snapshot(2).assessment;
 assert.equal(early.vitals.find(v=>v.id==='temp').flag,'high');assert.equal(early.vitals[0].flag,'low');assert.equal(later.vitals[0].flag,'none');
 const temp=early.vitals.find(v=>v.id==='temp');temp.flagReason='';assert.throws(()=>validateLane(early,'assessment',segments));
});
