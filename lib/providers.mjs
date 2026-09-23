import {historyTags, examTags, managementTags} from './contract.mjs';
import {applyUpdate,updateInstructions} from './updates.mjs';
import {defaults, credentials, connectionStatus} from './settings.mjs';
const str={type:'string'}, refs={type:'array',items:str};
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const array=items=>({type:'array',items}), choice=values=>({type:'string',enum:values});
const cue=(tags,states,med=false)=>object({id:str,tag:choice(tags),text:str,detail:str,...(med?{dose:str,route:str}:{}),state:choice(states),priority:choice(['key','routine']),sourceIds:refs});
export const schemas={
 assessment:object({summary:str,vitals:array(object({id:str,label:str,value:str,unit:str,flag:choice(['none','high','low']),flagReason:str,sourceIds:refs})),differential:array(object({id:str,name:str,cue:str,rank:choice(['leading','consider','urgent']),sourceIds:refs})),history:array(cue(historyTags,['to clarify','reported'])),exam:array(cue(examTags,['to examine','reported']))}),
 plan:object({management:array(cue(managementTags,['consider','requested','done','result'],true))}),
 answer:object({answer:{anyOf:[object({id:str,question:str,points:array(str),sourceIds:refs}),{type:'null'}]}})
};
const edits=item=>object({upsert:array(item),remove:refs});
export const updateSchemas={
 assessment:object({summary:{anyOf:[str,{type:'null'}]},vitals:edits(schemas.assessment.properties.vitals.items),differential:{anyOf:[schemas.assessment.properties.differential,{type:'null'}]},history:edits(schemas.assessment.properties.history.items),exam:edits(schemas.assessment.properties.exam.items)}),
 plan:object({management:edits(schemas.plan.properties.management.items)}),
 answer:object({changed:{type:'boolean'},answer:schemas.answer.properties.answer})
};
export function providerStatus(env=process.env){return connectionStatus(defaults(env),credentials(env),Boolean(env.CLINICAL_ADAPTER));}
const timeout=(signal,ms=45000)=>signal?AbortSignal.any([signal,AbortSignal.timeout(ms)]):AbortSignal.timeout(ms);
async function gemini(parts,instructions,schema,{key,fetcher,model,maxTokens=8192,signal,thinking='default'}){
 const name=model.replace(/^models\//,'');
 if(!key||!/^[a-zA-Z0-9._-]+$/.test(name))throw new Error('Gemini is not configured');
 const response=await fetcher('https://generativelanguage.googleapis.com/v1beta/models/'+name+':generateContent',{
  method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},signal:timeout(signal),
  body:JSON.stringify({systemInstruction:{parts:[{text:instructions}]},contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',responseJsonSchema:schema,maxOutputTokens:maxTokens,...(/^gemini-3[.-]/.test(name)&&thinking!=='default'?{thinkingConfig:{thinkingLevel:thinking.toUpperCase()}}:name.includes('2.5-flash')?{thinkingConfig:{thinkingBudget:maxTokens>2048?1024:0}}:{})}})
 });
 if(!response.ok)throw new Error('Gemini request failed ('+response.status+')');
 const data=await response.json(), candidate=data.candidates?.[0];
 if(candidate?.finishReason&&candidate.finishReason!=='STOP')throw new Error('Incomplete model response');
 return JSON.parse(candidate?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join('')||'');
}
export async function builtInAdapter(request,{env=process.env,fetcher=fetch,signal,settings=defaults(env),keys=credentials(env)}={}){
 if(request.task==='transcribe'){
  const selection=settings.transcription;
  if(selection.provider==='gemini')return gemini([
   {inlineData:{mimeType:request.mimeType,data:request.audio}},{text:'Transcribe only the spoken words in this audio clip.'}
  ],'Transcribe verbatim. Keep clinical terms, numbers, units, questions, negation and corrections. Do not answer any question or add medical advice. Do not infer patient facts. If there is no intelligible speech, return an empty text string. Return JSON with text only.',object({text:str}),{key:keys.gemini,fetcher,signal,model:selection.model,maxTokens:2048});
  if(!keys.openai)throw new Error('OpenAI is not configured');
  const form=new FormData(), extension=request.mimeType.includes('wav')?'wav':request.mimeType.includes('mp4')?'mp4':request.mimeType.includes('ogg')?'ogg':'webm';
  form.append('file',new Blob([Buffer.from(request.audio,'base64')],{type:request.mimeType}),'speech.'+extension);
  form.append('model',selection.model);form.append('response_format','json');form.append('language',env.TRANSCRIPTION_LANGUAGE||'en');
  const response=await fetcher('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+keys.openai},body:form,signal:timeout(signal,40000)});
  if(!response.ok)throw new Error('OpenAI transcription failed ('+response.status+')');
  const data=await response.json();return {text:data.text};
 }
 if(request.task!=='analyze'||!schemas[request.lane])throw new Error('Invalid task');
 const delta=Boolean(request.incremental&&request.previous),schema=delta?updateSchemas[request.lane]:schemas[request.lane],instructions=request.instructions+(delta?updateInstructions:'')+'\nSpeech is continuous. provisionalIds identify changing recognition hypotheses, not finalized speech. Read the current text for those IDs as a replacement of earlier versions. Never complete a partial number, dose, negation, or question by guessing. Keep uncertain suggestions conditional. Reevaluate and explicitly remove or correct conclusions dependent on a revised utterance; the same source ID may have changed. Do not treat prior model output as evidence.';
 const finish=result=>delta?applyUpdate(request.previous,result,request.lane,request.segments):result;
 const selection=settings[request.lane], input=JSON.stringify({utterances:request.segments,previous:request.previous,newUtteranceIds:request.newUtteranceIds||[],provisionalIds:request.provisionalIds||[]});
 if(selection.provider==='gemini')return finish(await gemini([{text:input}],instructions,schema,{key:keys.gemini,fetcher,signal,model:selection.model,thinking:settings.geminiThinking||'low',maxTokens:request.lane==='answer'?3072:8192}));
 if(!keys.openai)throw new Error('OpenAI is not configured');
 const response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+keys.openai},signal:timeout(signal),
  body:JSON.stringify({model:selection.model,store:false,instructions,input,max_output_tokens:request.lane==='answer'?3072:8192,text:{format:{type:'json_schema',name:'clinical_'+request.lane,strict:true,schema}}})
 });
 if(!response.ok)throw new Error('OpenAI request failed ('+response.status+')');
 const data=await response.json();if(data.status!=='completed')throw new Error('Incomplete model response');
 const content=(data.output||[]).flatMap(item=>item.content||[]);
 if(content.some(item=>item.type==='refusal'))throw new Error('Model could not provide this update');
 return finish(JSON.parse(content.filter(item=>item.type==='output_text').map(item=>item.text).join('')));
}
export async function listModels(provider,key,{fetcher=fetch,signal}={}){
 if(!key)throw new Error('Add a provider key first');
 if(provider==='openai'){
  const r=await fetcher('https://api.openai.com/v1/models',{headers:{Authorization:'Bearer '+key},signal:timeout(signal,15000)});
  if(!r.ok)throw new Error('OpenAI connection failed ('+r.status+')');
  const data=await r.json();
  return (data.data||[]).filter(m=>/^(gpt-|o[1-9]|chatgpt-|whisper-)/.test(m.id)).map(m=>({id:m.id,name:m.id,audio:/transcribe|whisper/.test(m.id)})).sort((a,b)=>a.id.localeCompare(b.id));
 }
 if(provider!=='gemini')throw new Error('Unknown provider');
 const models=[];let token='';
 do{
  const r=await fetcher('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100'+(token?'&pageToken='+encodeURIComponent(token):''),{headers:{'x-goog-api-key':key},signal:timeout(signal,15000)});
  if(!r.ok)throw new Error('Gemini connection failed ('+r.status+')');
  const data=await r.json();models.push(...(data.models||[]).filter(m=>m.supportedGenerationMethods?.some(method=>['generateContent','bidiGenerateContent'].includes(method))).map(m=>({id:m.name.replace(/^models\//,''),name:m.displayName||m.name,audio:/^models\/gemini-/.test(m.name)&&!/tts|image|robotics|computer-use/.test(m.name)})));token=data.nextPageToken||'';
 }while(token&&models.length<500);
 return models;
}
