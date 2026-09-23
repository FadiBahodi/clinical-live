import {DevicePreferences} from './preferences.js';
const $=id=>document.getElementById(id);
export class Connections {
 constructor({onStatus,onApply,onMicTest,isCapturing}){
  Object.assign(this,{onStatus,onApply,onMicTest,isCapturing});this.catalog={};
  this.saved=new DevicePreferences({getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v),removeItem:k=>localStorage.removeItem(k)});
  this.voice={device:'',mode:'room',pause:450,maxClip:8000,parallel:2};
  try{Object.assign(this.voice,JSON.parse(localStorage.getItem('clinical-live-voice')||'{}'));}catch{}
  for(const [id,key] of [['audio-mode','mode'],['audio-pause','pause'],['audio-max','maxClip'],['audio-parallel','parallel']])$(id).value=this.voice[key];
  $('audio-device').onchange=()=>this.saveVoice();$('audio-mode').onchange=()=>this.saveVoice();$('audio-pause').onchange=()=>this.saveVoice();$('audio-max').onchange=()=>this.saveVoice();$('audio-parallel').onchange=()=>this.saveVoice();
  $('speech-transport').onchange=()=>{if($('speech-transport').value==='streaming'){$('transcription-provider').value='gemini';$('transcription-model').value='gemini-3.5-transcribe-live';}else $('transcription-model').value=$('transcription-provider').value==='gemini'?'gemini-2.5-flash':'gpt-4o-transcribe';};
  $('setup-toggle').onclick=()=>{$('setup-panel').showModal();void this.devices();};
  $('setup-close').onclick=()=>$('setup-panel').close();
  $('refresh-devices').onclick=()=>this.devices();
  $('test-mic').onclick=()=>onMicTest();
  $('connect-key').onclick=()=>this.connect(false);$('remove-key').onclick=()=>this.connect(true);
  $('key-provider').onchange=()=>this.savedStatus();
  $('gemini-preset').onclick=()=>{for(const role of ['assessment','plan','answer','transcription']){$(role+'-provider').value='gemini';$(role+'-model').value=role==='transcription'?'gemini-3.5-transcribe-live':'gemini-3.8-flash';this.populate(role);}$('gemini-thinking').value='low';$('speech-transport').value='streaming';void this.apply();};
  $('load-models').onclick=()=>this.models();
  $('models-form').onsubmit=event=>{event.preventDefault();void this.apply();};
  const names={transcription:'Speech → text',assessment:'DDx · history · physical',plan:'Management',answer:'Direct answer'};
  for(const [role,label] of Object.entries(names)){
   const row=document.createElement('div');row.className='model-role';
   const name=document.createElement('label');name.htmlFor=role+'-model';name.textContent=label;
   const provider=document.createElement('select');provider.id=role+'-provider';provider.setAttribute('aria-label',label+' provider');
   for(const p of ['gemini','openai'])provider.add(new Option(p==='gemini'?'Gemini':'OpenAI',p));
   const model=document.createElement('input');model.id=role+'-model';model.setAttribute('list',role+'-models');model.autocomplete='off';model.spellcheck=false;
   const list=document.createElement('datalist');list.id=role+'-models';
   provider.onchange=()=>{if(role==='transcription')$('speech-transport').value='clips';model.value=provider.value==='gemini'?(role==='transcription'?'gemini-2.5-flash':'gemini-3.8-flash'):(role==='transcription'?'gpt-4o-transcribe':'gpt-4.1');this.populate(role);};
   row.append(name,provider,model,list);$('model-roles').append(row);
  }
 }
 async request(path,body){
  const r=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await r.json();if(!r.ok)throw new Error(data.error||'Request failed');return data;
 }
 setStatus(status){
  this.status=status;this.onStatus(status);
  $('connection-status').textContent=status.analysisReady&&status.audioReady?'Voice and clinical models connected':'Connect a provider to start listening';
  $('key-status').textContent=['Gemini: '+(status.connected?.gemini?'connected':'not connected'),'OpenAI: '+(status.connected?.openai?'connected':'not connected')].join(' · ');
  if(status.settings)for(const role of ['assessment','plan','answer','transcription']){$(role+'-provider').value=status.settings[role].provider;$(role+'-model').value=status.settings[role].model;this.populate(role);}
  $('speech-transport').value=status.settings?.speechTransport||'clips';
  $('clinical-profile').value=status.settings?.profile||'ed';$('gemini-thinking').value=status.settings?.geminiThinking||'low';
  $('processing-info').textContent='Speech and clinical context are sent to the providers selected above. This app keeps encounter data in memory; it does not automatically remove identifiers.';
  document.querySelector('.download').hidden=!status.downloadReady;this.savedStatus();
 }
 savedStatus(){const remembered=Boolean(this.saved.keys()[$('key-provider').value]);$('remember-key').checked=remembered;$('saved-key-status').textContent=remembered?'Key remembered on this browser. Forget removes it and disconnects.':'Key will be temporary unless you choose Remember.';}
 async refresh(){try{$('connection-status').textContent='Restoring your setup…';const errors=await this.saved.restore((...args)=>this.request(...args));this.setStatus(await this.request('/api/status'));if(errors.length)$('key-status').textContent=errors.join(' · ');}catch(e){$('connection-status').textContent=e.message;}}
 async connect(remove){
  if(this.isCapturing()){$('key-status').textContent='Pause and finish transcription before changing connections.';return;}
  const key=$('provider-key'),value=remove?'':key.value.trim(),provider=$('key-provider').value,remember=$('remember-key').checked;key.value='';
  if(remove){try{this.saved.key(provider,'',false);}catch{$('key-status').textContent='Browser storage could not be cleared.';return;}}
  if(!remove&&!value){$('key-status').textContent='Paste a key to connect.';return;}
  $('connect-key').disabled=true;$('key-status').textContent='Checking connection…';
  try{const status=await this.request('/api/connection',{provider,key:value});
   try{this.saved.key(provider,value,remember&&!remove);this.saved.settings(status.settings);}catch{this.setStatus(status);$('key-status').textContent='Connected for this session; browser could not save your setup.';return;}
   this.setStatus(status);await this.models();}catch(e){$('key-status').textContent=e.message;}finally{$('connect-key').disabled=false;}
 }
 async models(){
  $('model-save-status').textContent='Loading account models…';
  const results=await Promise.allSettled(['gemini','openai'].filter(p=>this.status?.connected?.[p]).map(async provider=>{this.catalog[provider]=(await this.request('/api/models?provider='+provider)).models;}));
  for(const role of ['assessment','plan','answer','transcription'])this.populate(role);
  const failed=results.find(r=>r.status==='rejected');
  $('model-save-status').textContent=failed?failed.reason.message:results.length?'Available models refreshed.':'Connect a provider first.';
 }
 populate(role){
  const list=$(role+'-models');list.replaceChildren();
  for(const model of this.catalog[$(role+'-provider').value]||[]){
   if(role==='transcription'&&!model.audio)continue;
   if(role!=='transcription'&&/transcribe|whisper|tts|realtime|image|audio/.test(model.id))continue;
   list.append(new Option(model.name,model.id));
  }
 }
 async apply(){
  if(this.isCapturing()){$('model-save-status').textContent='Pause and finish transcription before changing models.';return;}
  const settings={speechTransport:$('speech-transport').value,profile:$('clinical-profile').value,geminiThinking:$('gemini-thinking').value};
  for(const role of ['assessment','plan','answer','transcription'])settings[role]={provider:$(role+'-provider').value,model:$(role+'-model').value.trim()};
  $('apply-models').disabled=true;
  try{this.setStatus(await this.request('/api/settings',settings));this.onApply();try{this.saved.settings(this.status.settings);$('model-save-status').textContent='Applied and remembered on this browser.';}catch{$('model-save-status').textContent='Applied for this session; browser storage unavailable.';}}catch(e){$('model-save-status').textContent=e.message;}finally{$('apply-models').disabled=false;}
 }
 saveVoice(){
  if(this.isCapturing()){$('mic-test-status').textContent='Pause first. New input settings apply when you restart listening.';}
  this.voice={device:$('audio-device').value,mode:$('audio-mode').value,pause:Number($('audio-pause').value),maxClip:Number($('audio-max').value),parallel:Number($('audio-parallel').value)};
  try{localStorage.setItem('clinical-live-voice',JSON.stringify(this.voice));}catch{}
 }
 async devices(){
  try{
   const devices=await navigator.mediaDevices.enumerateDevices(),select=$('audio-device');select.replaceChildren(new Option('System default',''));
   for(const [index,device] of devices.filter(d=>d.kind==='audioinput').entries())select.add(new Option(device.label||'Microphone '+(index+1),device.deviceId));
   if([...select.options].some(o=>o.value===this.voice.device))select.value=this.voice.device;
   if(!this.isCapturing())$('mic-test-status').textContent='Device names become available after microphone permission.';
  }catch{$('mic-test-status').textContent='Microphone discovery is unavailable in this browser.';}
 }
 constraints(){const direct=this.voice.mode==='direct';return {audio:{...(this.voice.device?{deviceId:{exact:this.voice.device}}:{}),echoCancellation:direct,noiseSuppression:direct,autoGainControl:direct},video:false};}
}
