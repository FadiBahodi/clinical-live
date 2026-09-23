import test from 'node:test';
import assert from 'node:assert/strict';
import {placeLane,describeChange,clinicalMarkup} from '../public/presentation.js';
import {LatestLane} from '../public/session.js';
import {validateLane,instructionsFor} from '../lib/contract.mjs';

test('reading order stays put while corrections, dose changes and removals take effect',()=>{
 const a={id:'a',text:'Penicillin allergy',detail:'unknown',state:'to clarify'};
 const b={id:'b',text:'Ceftriaxone',dose:'1 g',route:'IV',state:'consider'};
 const c={id:'c',text:'Obsolete action',state:'consider'};
 const previous={management:[a,b,c]};
 const incoming={management:[{...b,dose:'2 g',state:'requested'},{id:'new',text:'Culture result'}, {...a,detail:'denied',state:'reported'}]};
 const placed=placeLane(previous,incoming,'plan');
 assert.deepEqual(placed.management.map(i=>i.id),['a','b','new']);
 assert.equal(placed.management[0].detail,'denied');
 assert.equal(placed.management[1].dose,'2 g');
 assert.equal(placed.management[1].state,'requested');
 assert.equal(describeChange(a,placed.management[0]),'to clarify → reported');
 assert.equal(describeChange(b,{...b}), '');
 // Similar text does not merge distinct actions; rank remains clinical, not position-locked.
 const assessed=placeLane({vitals:[],history:[a],exam:[]},{vitals:[],history:[a,{...a,id:'distinct'}],exam:[],differential:[{id:'urgent'},{id:'leading'}]},'assessment');
 assert.equal(assessed.history.length,2);assert.equal(assessed.differential[0].id,'urgent');
});

test('changing a model cancels the old request and carries the displayed clinical state forward',async()=>{
 let finishOld;const calls=[],outputs=[];
 const lane=new LatestLane({request:async(segments,previous)=>{calls.push({segments,previous});return calls.length===1?new Promise(r=>finishOld=r):{data:{management:[{id:'current'}]}};},onResult:r=>outputs.push(r.data)});
 lane.previous={management:[{id:'stable'}]};lane.push([{id:'s1',text:'Initial'}]);lane.reset(true);lane.push([{id:'s1',text:'Initial'},{id:'s2',text:'Correction'}]);
 await new Promise(r=>setImmediate(r));finishOld({data:{management:[{id:'stale'}]}});await new Promise(r=>setImmediate(r));
 assert.equal(calls[1].previous.management[0].id,'stable');assert.equal(outputs.length,1);assert.equal(outputs[0].management[0].id,'current');
});

test('answers use a separate contract and no question produces no invented answer',()=>{
 validateLane({answer:null},'answer',[{id:'s1',text:'Fever and cough'}]);
 assert.throws(()=>validateLane({answer:{id:'a',question:'Why?',points:['Because'],sourceIds:['not-spoken']}},'answer',[{id:'s1',text:'Fever'}]));
 assert.match(instructionsFor('answer','resus'),/latest/i);
 assert.match(instructionsFor('assessment','resus'),/VERBATIM/);
 assert.doesNotMatch(instructionsFor('plan','ed'),/"answer"\s*:/);
});

test('clinical fields stay separate and use the caller escape function',()=>{
 const markup=clinicalMarkup({text:'CXR',detail:'right < lower',dose:'',route:''},v=>v.replaceAll('<','&lt;'));
 assert.match(markup,/<span class="cue-text">CXR<\/span>/);
 assert.match(markup,/<span class="cue-detail">right &lt; lower<\/span>/);
});
