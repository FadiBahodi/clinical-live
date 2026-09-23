import {validateLane} from './contract.mjs';
// Explicit model IDs only. No text similarity, semantic filters or delayed corrections.
function applyItems(previous,patch){
 if(!patch||!Array.isArray(patch.upsert)||!Array.isArray(patch.remove)||patch.upsert.length>60||patch.remove.length>60)throw Error('Invalid update');
 const known=new Set(previous.map(item=>item.id)),updated=new Set();
 for(const item of patch.upsert){if(!item||typeof item.id!=='string'||updated.has(item.id))throw Error('Duplicate update');updated.add(item.id);}
 const removed=new Set(patch.remove);
 if(removed.size!==patch.remove.length||patch.remove.some(id=>typeof id!=='string'||!known.has(id)||updated.has(id)))throw Error('Invalid removal');
 const replacements=new Map(patch.upsert.map(item=>[item.id,item]));
 return [...previous.filter(item=>!removed.has(item.id)).map(item=>replacements.get(item.id)||item),...patch.upsert.filter(item=>!known.has(item.id))];
}
export function applyUpdate(previous,patch,lane,segments){
 if(!previous||!patch)throw Error('Update requires prior state');
 let result;
 if(lane==='assessment'){
  if(patch.summary!==null&&typeof patch.summary!=='string')throw Error('Invalid summary update');
  if(patch.differential!==null&&!Array.isArray(patch.differential))throw Error('Invalid differential update');
  result={summary:patch.summary??previous.summary,differential:patch.differential??previous.differential};
  for(const key of ['vitals','history','exam'])result[key]=applyItems(previous[key],patch[key]);
 }else if(lane==='plan')result={management:applyItems(previous.management,patch.management)};
 else if(lane==='answer'){
  if(typeof patch.changed!=='boolean'||(!patch.changed&&patch.answer!==null))throw Error('Invalid answer update');
  result=patch.changed?{answer:patch.answer}:previous;
 }else throw Error('Unknown update lane');
 return validateLane(result,lane,segments);
}
export const updateInstructions=`\nUPDATE MODE: The supplied previous section is already visible. Return only explicit changes using the update schema, not the full section. For each collection return upsert (complete replacement items with their original IDs, or new items) and remove (IDs to remove). Empty arrays keep everything. Omitted unchanged items remain verbatim; never regenerate them. Upsert must include every required field for that item. Correct values, states, doses, qualifications and dependent recommendations immediately. Remove obsolete items explicitly. For assessment, summary=null and differential=null mean unchanged; otherwise replace summary or the full ranked differential. For answer, changed=false with answer=null retains the previous answer; changed=true replaces it, including null to clear. All utterances are available: inspect newUtteranceIds first, then use the full case for clinical context. Never miss an actual correction or new direct question to save tokens. Do not return unchanged items just to acknowledge them.`;
