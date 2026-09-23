import {segments as demoSegments,snapshot} from './demo.js';
import {LatestLane,emptyAssessment,emptyPlan,emptyAnswer} from './session.js';
import {LiveVoiceInput} from './live-voice.js';
import {Connections} from './connections.js';
import {placeLane,describeChange,clinicalMarkup} from './presentation.js';
const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tagOrder={history:['HPI','ASSOC','PMH','MEDS','ALLERGY','SOCIAL','COLLAT','RISK'],exam:['PRIMARY','GEN','NEURO','HEENT','NECK','CVS','RESP','ABDO','GU','SKIN','MSK'],management:['RESUS','MED','PROC','LABS','IMG','MON','CONSULT','DISPO','COMM']};
const stateSymbols={consider:'','to clarify':'','to examine':'',reported:'●',requested:'↗',done:'✓',result:'✓'};
let step=1,demo=true,assessment=snapshot(step).assessment,plan=snapshot(step).plan,answer={answer:snapshot(step).plan.answer},speech=demoSegments.slice(0,step+1),status={},elapsed=0,timerStart=null,epoch=0;
let settings={font:13,leading:1.24,spacing:3,columns:14,ddx:false,inline:true,rules:true,timer:false,colour:'clinical'};
try{const saved=JSON.parse(localStorage.getItem('clinical-live-display-v3')||'null');if(saved)settings={...settings,...saved};}catch{}
let provisionalId=null;const provisionalIds=new Set();
const timings={},failures=new Set(),speechMetrics=new Map();
const seconds=ms=>(Math.max(0,ms)/1000).toFixed(1)+'s';
function message(text,error=false){$('notice').hidden=!text;$('notice').textContent=text;$('notice').classList.toggle('error',error);}
function sourceTitle(item){return item.sourceIds?.length?item.sourceIds.map(id=>'Transcript '+(speech.findIndex(s=>s.id===id)+1)).join(' · '):'Generated clinical suggestion';}
function html(node,value){if(node.innerHTML!==value)node.innerHTML=value;}
function keyed(parent,items,key,render,tag='div'){
 const existing=new Map([...parent.children].map(node=>[node.dataset.key,node]));
 items.forEach((item,index)=>{
  const id=key(item);let node=existing.get(id);
  if(!node){node=document.createElement(tag);node.dataset.key=id;}
  existing.delete(id);render(node,item);
  if(parent.children[index]!==node)parent.insertBefore(node,parent.children[index]||null);
 });
 for(const node of existing.values())node.remove();
}
function renderCues(group,items){
 const groups=tagOrder[group].filter(tag=>items.some(item=>item.tag===tag));
 keyed($(group),groups,tag=>tag,(node,tag)=>{
  node.className='cue-group group-'+tag;
  if(!node.firstChild)node.innerHTML='<span class="group-tag tag-'+tag+'">'+tag+'</span><div class="group-items"></div>';
  keyed(node.lastChild,items.filter(item=>item.tag===tag),item=>item.id,(child,item)=>{
   const change=describeChange(child._clinical,item);
   child.className='cue '+item.state.replaceAll(' ','-')+' '+item.priority;
   child.dataset.itemId=item.id;child.dataset.changed=change?'true':'false';child.title=[item.state,sourceTitle(item),change].filter(Boolean).join(' · ');
   const mark=stateSymbols[item.state], suffix=['requested','done','result'].includes(item.state)?' <span class="inline-state">'+item.state+'</span>':'';
   html(child,(mark?'<span class="cue-symbol" aria-label="'+esc(item.state)+'">'+mark+'</span>':'')+clinicalMarkup(item,esc)+suffix);
   child._clinical={...item};
  },'span');
 });
 if(!items.length)html($(group),'<div class="empty-section">The conversation will populate this section.</div>');
}
function renderAssessment(){
 $('summary').textContent=assessment.summary||(speech.length?'Building the clinical view…':'');
 keyed($('vitals'),assessment.vitals,item=>item.id,(node,item)=>{
  const previous=node.dataset.value;node.className='vital';if(previous&&previous!==item.value)node.classList.add('changed');
  node.dataset.value=item.value;const flagged=['high','low'].includes(item.flag);if(flagged)node.classList.add('flagged');node.title=[sourceTitle(item),flagged?'Interpretive flag: '+item.flagReason:''].filter(Boolean).join(' · ');
  html(node,'<span class="label">'+esc(item.label)+'</span><b>'+esc(item.value)+(flagged?'<span class="vital-flag" aria-label="'+esc(item.flag)+'">'+(item.flag==='high'?'↑':'↓')+'</span>':'')+'</b><small>'+esc(item.unit)+'</small>');
 });
 $('vitals').hidden=!assessment.vitals.length;
 keyed($('differential'),assessment.differential,item=>item.id,(node,item)=>{
  node.className='ddx-item '+item.rank;node.title=sourceTitle(item);
  html(node,'<div class="dx-title"><span class="dx-name">'+esc(item.name)+'</span>'+(item.rank==='urgent'?'<span class="dx-urgent" title="Important to exclude" aria-label="Important to exclude">!</span>':'')+'</div><span class="dx-cue">'+esc(item.cue)+'</span>');
 },'li');
 renderCues('history',assessment.history);renderCues('exam',assessment.exam);
 $('history-count').textContent=assessment.history.length?assessment.history.length+' cues':'';
 $('exam-count').textContent=assessment.exam.length?assessment.exam.length+' cues':'';
}
function renderPlan(){renderCues('management',plan.management);}
function renderAnswer(){
 const value=answer.answer;
 if(value){$('answer').className='answer-body';$('answer').title=sourceTitle(value);html($('answer'),'<h3>'+esc(value.question)+'</h3><ol>'+value.points.map(point=>'<li><span>'+esc(point)+'</span></li>').join('')+'</ol>');}
 else{$('answer').className='empty-section';$('answer').textContent='Ask aloud. The answer stays here.';$('answer').removeAttribute('title');}
}
function renderSpeech(){
 $('speech-count').textContent=speech.length;
 keyed($('transcript'),speech,s=>s.id,(node,s)=>{node.className='speech-line'+(provisionalIds.has(s.id)?' provisional':'');html(node,'<b>'+String(speech.indexOf(s)+1).padStart(2,'0')+'</b><span>'+esc(s.text)+'</span>');},'p');
 $('last-heard').textContent=speech.at(-1)?.text||'';document.querySelector('.heard-label').textContent=provisionalIds.has(speech.at(-1)?.id)?'HEARING · DRAFT':'HEARD';
 $('mode').textContent=demo?'SAMPLE '+(step+1)+'/4':'LIVE';$('mode').classList.toggle('live',!demo);
 $('output-label').textContent=demo?'Authored sample':provisionalIds.size?'Live draft · recognition may change':'Generated · clinically unverified';
 $('next').hidden=!demo;$('next').disabled=step===3;$('sample').textContent=demo?'Restart sample':'Sample case';
 $('empty-start').hidden=speech.length>0;$('board').hidden=!speech.length;$('heard-line').hidden=!speech.length;
}
const lanes=Object.fromEntries(['assessment','plan','answer'].map(lane=>[lane,new LatestLane({preemptFinal:lane==='answer',
 request:async(segments,previous,signal,revision)=>{
  const response=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({lane,segments,previous,incremental:true,newUtteranceIds:revision.newUtteranceIds,provisionalIds:revision.provisionalIds})});
  const result=await response.json();if(!response.ok)throw new Error(result.error);return result;
 },
 onResult:(result,count,trace)=>{
  const previous=lane==='assessment'?assessment:lane==='plan'?plan:answer;
  const data=placeLane(previous,result.data,lane);lanes[lane].previous=data;
  if(lane==='assessment'){assessment=data;renderAssessment();}else if(lane==='plan'){plan=data;renderPlan();}else{answer=data;renderAnswer();}
  const draft=Boolean(trace.provisionalIds?.length);document.querySelector('[data-lane="'+lane+'"]').dataset.draft=String(draft);
  const name=lane==='assessment'?'Assessment':lane==='plan'?'Management':'Answer',audio=trace.audio;
  const total=trace.renderedAt-(audio?.speechEndedAt??trace.receivedAt??trace.queuedAt);
  timings[lane]=name+' '+seconds(total);$('latency').textContent=(audio?.streaming?'After recognized text · ':audio?'After speech · ':'After text · ')+Object.values(timings).join(' · ');
  const phases=audio?.streaming?['Streaming recognition · '+(draft?'provisional':'final')]:audio?['Speech → clip '+seconds(audio.queuedAt-audio.speechEndedAt),'Clip wait '+seconds(audio.requestedAt-audio.queuedAt),'Transcribe '+seconds(audio.transcribedAt-audio.requestedAt),'Spoken-order wait '+seconds(audio.committedAt-audio.transcribedAt)]:['Text input'];
  $('trace-'+lane).textContent=name+' · phrase '+count+' · '+[...phases,'Model queue '+seconds(trace.queuedMs),'Model + network '+seconds(trace.roundTripMs),'Total '+seconds(total)].join(' → ');
  const node=document.querySelector('[data-lane="'+lane+'"]');node.dataset.reflected=count;node.classList.remove('failed');
  failures.delete(lane);if(!voice.failed&&!failures.size){message('');$('retry').hidden=true;}
 },
 onState:(busy,progress)=>{const node=document.querySelector('[data-lane="'+lane+'"]');node.classList.toggle('busy',busy);if(!node.classList.contains('failed'))node.textContent=busy?(node.dataset.draft==='true'?'Live draft · updating':progress.covered?'Updating…':'Building…'):progress.covered?(node.dataset.draft==='true'?'Live draft':'Current'):'';node.title='Through '+progress.covered+'/'+progress.target+' transcript entries. '+(busy?'Newer speech is not fully reflected yet.':node.dataset.draft==='true'?'Based on changing speech recognition.':'Includes finalized speech through this update.');},
 onError:error=>{failures.add(lane);const node=document.querySelector('[data-lane="'+lane+'"]');node.classList.add('failed');node.textContent='update failed';message(error.message,true);$('retry').hidden=false;}
})]));
function analyze(finalizedId){
 if(!status.analysisReady){message('Connect your models in Voice & models. The sample works without keys.',true);return;}
 const latest=speechMetrics.get(speech.at(-1)?.id);for(const lane of Object.values(lanes))lane.push(speech,{receivedAt:latest?.committedAt??performance.now(),provisionalIds:[...provisionalIds],audio:latest?{...latest}:null,finalizedId});
}
function addSpeech(text,ms,trace){
 if(demo)clearEncounter();
 if(speech.length>=500||speech.reduce((n,s)=>n+s.text.length,0)+text.length>250000){void pauseListening();message('Encounter transcript limit reached. Start a new encounter to continue.',true);return;}
 let finalizedId;
 if(trace?.streaming&&provisionalId){finalizedId=provisionalId;const item=speech.find(s=>s.id===provisionalId);item.text=text;provisionalIds.delete(provisionalId);provisionalId=null;if(trace)speechMetrics.set(item.id,trace);}
 else{speech.push({id:'s'+(speech.length+1),text});if(trace)speechMetrics.set(speech.at(-1).id,trace);}
 renderSpeech();analyze(finalizedId);
}
let connections;
const voice=new LiveVoiceInput({
 transport:()=>status.settings?.speechTransport||'clips',
 onPartial:(text,trace)=>{
  if(speech.length>=500||text.length>30000){void pauseListening();return;}
  if(!provisionalId){provisionalId='s'+(speech.length+1);provisionalIds.add(provisionalId);speech.push({id:provisionalId,text});}
  else{const item=speech.find(s=>s.id===provisionalId);if(item.text===text)return;item.text=text;}
  speechMetrics.set(provisionalId,trace);renderSpeech();analyze();
 },
 onTranscript:addSpeech,
 getStream:()=>navigator.mediaDevices.getUserMedia(connections.constraints()),
 pauseMs:()=>connections.voice.pause,maxClipMs:()=>connections.voice.maxClip,concurrency:()=>connections.voice.parallel,
 onStatus:text=>{
  $('mic-state').lastChild.textContent=text;$('mic-state').classList.toggle('on',voice.active||text==='Hearing speech');
  $('listen').lastChild.textContent=voice.active?(voice.testOnly?'Stop mic test':'Pause'):voice.starting?'Starting…':'Start listening';
  $('test-mic').textContent=voice.active&&voice.testOnly?'Stop microphone test':'Test microphone';
  if(!voice.active&&timerStart!==null){elapsed+=Date.now()-timerStart;timerStart=null;}
 },
 onLevel:value=>{$('level').style.transform='scaleX('+value+')';},
 onQueue:count=>{$('queue-count').hidden=!count;$('queue-count').textContent=count+' queued';},
 onError:error=>{message(error.message,true);$('retry').hidden=!voice.failed;$('mic-test-status').textContent=error.message;}
});
async function pauseListening(){await voice.pause();if(timerStart!==null){elapsed+=Date.now()-timerStart;timerStart=null;}}
async function toggleListening(){
 if(voice.starting)return;
 if(voice.active){await pauseListening();return;}
 if(!status.audioReady||!status.analysisReady){$('setup-panel').showModal();message('Connect speech and clinical models to start listening.',true);return;}
 if(demo)clearEncounter();message('');
 provisionalId=null;const before=epoch;await voice.start();
 if(before===epoch&&voice.active){timerStart=Date.now();$('listen').lastChild.textContent='Pause';void connections.devices();}
}
connections=new Connections({
 onStatus:value=>{status=value;},
 isCapturing:()=>voice.active||voice.starting||voice.busy||voice.queue.length>0,
 onApply:()=>{for(const lane of Object.values(lanes))lane.reset(true);if(speech.length&&!demo)analyze();},
 onMicTest:async()=>{
  if(voice.active){await pauseListening();return;}
  if(voice.busy||voice.queue.length){$('mic-test-status').textContent='Let pending transcription finish first.';return;}
  await voice.start({testOnly:true});if(voice.active){$('mic-test-status').textContent='Listening locally. No test audio is sent to a provider.';void connections.devices();}
 }
});
function clearEncounter(){
 epoch++;voice.reset();provisionalId=null;provisionalIds.clear();for(const lane of Object.values(lanes))lane.reset();
 demo=false;speech=[];assessment=emptyAssessment();plan=emptyPlan();answer=emptyAnswer();elapsed=0;timerStart=null;failures.clear();speechMetrics.clear();for(const lane of ['assessment','plan','answer'])$('trace-'+lane).textContent='';
 for(const key of Object.keys(timings))delete timings[key];$('latency').textContent='';$('retry').hidden=true;
 document.querySelectorAll('.lane-state').forEach(el=>{el.classList.remove('failed');el.textContent='';delete el.dataset.reflected;delete el.dataset.draft;});
 message('');renderAssessment();renderPlan();renderAnswer();renderSpeech();
}
function loadSample(nextStep=0){
 clearEncounter();demo=true;step=nextStep;speech=demoSegments.slice(0,step+1);({assessment,plan}=snapshot(step));answer={answer:plan.answer};renderAssessment();renderPlan();renderAnswer();renderSpeech();
}
function applySettings(save=true){
 const ranges={font:[10,19],leading:[1.05,1.7],spacing:[0,10],columns:[4,28]};
 for(const [name,[min,max]] of Object.entries(ranges)){settings[name]=Math.min(max,Math.max(min,Number(settings[name])||min));$(name).value=settings[name];$(name+'-value').textContent=settings[name];}
 const style=document.documentElement.style;style.setProperty('--body',settings.font+'px');style.setProperty('--leading',settings.leading);style.setProperty('--space',settings.spacing+'px');style.setProperty('--columns',settings.columns+'px');
 for(const [id,key] of [['ddx-detail','ddx'],['inline-labels','inline'],['rules','rules'],['timer','timer']])$(id).checked=settings[key];
 $('colour').value=settings.colour;document.body.dataset.colour=settings.colour;
 document.body.classList.toggle('inline-labels',settings.inline);document.body.classList.toggle('hide-ddx-cues',!settings.ddx);document.body.classList.toggle('no-rules',!settings.rules);$('elapsed').hidden=!settings.timer;
 if(save)try{localStorage.setItem('clinical-live-display-v3',JSON.stringify(settings));}catch{}
}
function panel(button,id){const open=$(id).hidden;$(id).hidden=!open;$(button).setAttribute('aria-expanded',String(open));}
$('listen').onclick=toggleListening;$('empty-listen').onclick=toggleListening;$('new').onclick=clearEncounter;
$('sample').onclick=()=>loadSample();$('empty-sample').onclick=()=>loadSample(1);
$('next').onclick=()=>{if(step<3){step++;speech=demoSegments.slice(0,step+1);({assessment,plan}=snapshot(step));answer={answer:plan.answer};renderAssessment();renderPlan();renderAnswer();renderSpeech();}};
$('display-toggle').onclick=()=>panel('display-toggle','display-panel');$('transcript-toggle').onclick=()=>panel('transcript-toggle','transcript-panel');
$('transcript-close').onclick=()=>{$('transcript-panel').hidden=true;$('transcript-toggle').setAttribute('aria-expanded','false');};
$('text-form').onsubmit=event=>{event.preventDefault();const text=$('text-input').value.trim();if(text){addSpeech(text);$('text-input').value='';}};
$('retry').onclick=()=>{if(voice.failed)voice.retry();if(speech.length&&!demo)analyze();};
for(const name of ['font','leading','spacing','columns'])$(name).oninput=()=>{settings[name]=Number($(name).value);applySettings();};
for(const [id,key] of [['ddx-detail','ddx'],['inline-labels','inline'],['rules','rules'],['timer','timer']])$(id).onchange=()=>{settings[key]=$(id).checked;applySettings();};
$('colour').onchange=()=>{settings.colour=$('colour').value;applySettings();};
const presets={compact:{font:13,leading:1.24,spacing:3,columns:14},dense:{font:11.5,leading:1.18,spacing:1.5,columns:10},comfortable:{font:15,leading:1.4,spacing:5,columns:18}};
for(const button of document.querySelectorAll('[data-preset]'))button.onclick=()=>{Object.assign(settings,presets[button.dataset.preset]);applySettings();};
setInterval(()=>{const seconds=Math.floor((elapsed+(timerStart===null?0:Date.now()-timerStart))/1000);$('elapsed').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');},1000);
window.addEventListener('pagehide',()=>voice.reset());
applySettings(false);renderAssessment();renderPlan();renderAnswer();renderSpeech();void connections.refresh();
