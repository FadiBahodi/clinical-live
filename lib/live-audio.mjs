import {WebSocket,WebSocketServer} from 'ws';
export function attachLiveAudio(server,access,{connect=(key)=>new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key='+encodeURIComponent(key)),renewMs=540000}={}){
 const wss=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});
 const occupied=new WeakSet();
 server.on('upgrade',(req,socket,head)=>{
  const session=access.lookup(req);
  if(req.url!=='/api/listen'||!req.headers.origin||!session?.authenticated||!session.keys.gemini||session.settings.speechTransport!=='streaming'||session.settings.transcription.provider!=='gemini'||occupied.has(session)){
   socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
  }
  occupied.add(session);
  wss.handleUpgrade(req,socket,head,client=>{
   let upstream,ready=false,ended=false,closing=false,rotating=false,unfinalized=false,activity=false,pending=[],pendingBytes=0,startTimer,renewTimer,drainTimer;
   const send=value=>{if(client.readyState===WebSocket.OPEN)client.send(JSON.stringify(value));};
   const cleanup=()=>{if(ended)return;ended=true;clearTimeout(startTimer);clearTimeout(renewTimer);clearTimeout(drainTimer);pending=[];upstream?.close();occupied.delete(session);};
   const fail=message=>{if(ended)return;send({type:'error',message});cleanup();client.close(1011,'Listening stopped');};
   const forward=bytes=>{if(ended||upstream?.readyState!==WebSocket.OPEN)return;if(upstream.bufferedAmount>64000)return fail('Audio connection is falling behind. Listening stopped; repeat the unfinished phrase after reconnecting.');upstream.send(JSON.stringify({realtimeInput:{audio:{data:bytes.toString('base64'),mimeType:'audio/pcm;rate=16000'}}}));};
   function open(){
    ready=false;upstream=connect(session.keys.gemini);const current=upstream;
    startTimer=setTimeout(()=>fail('Live transcription did not connect. Check the selected model and account access.'),12000);
    current.on('open',()=>current.send(JSON.stringify({setup:{model:'models/'+session.settings.transcription.model,generationConfig:{responseModalities:['TEXT']},inputAudioTranscription:{mode:'VERBATIM',languageCodes:[]}}})));
    current.on('error',()=>{if(upstream===current&&!ended)fail('Live transcription connection failed. Check the provider and restart listening.');});
    current.on('close',()=>{if(upstream===current&&!ended)fail('Live transcription disconnected. The last unfinished phrase may be incomplete; restart listening.');});
    current.on('message',raw=>{
     if(ended||upstream!==current)return;
     let data;try{data=JSON.parse(raw);}catch{return fail('Live transcription returned an invalid response.');}
     if(data.setupComplete){clearTimeout(startTimer);ready=true;send({type:'ready'});for(const bytes of pending)forward(bytes);pending=[];pendingBytes=0;renewTimer=setTimeout(rotate,renewMs);if(closing)finish();}
     if(data.voiceActivity?.type==='ACTIVITY_START')activity=true;
     if(data.voiceActivity?.type==='ACTIVITY_END')activity=false;
     const content=data.serverContent;
     for(const [key,type] of [['interimInputTranscription','interim'],['inputTranscription','final']]){
      const text=content?.[key]?.text;if(typeof text==='string'&&text.length<=30000){unfinalized=type==='interim';send({type,text});}
     }
     if(content?.generationComplete||content?.turnComplete){
      if(rotating)replaceConnection();
      else if(closing){send({type:'finished'});cleanup();client.close(1000,'Finished');}
     }
     if(data.error)fail('Live transcription rejected the request. Check model availability in Voice & models.');
    });
   }
   function replaceConnection(){const old=upstream;rotating=false;unfinalized=false;activity=false;clearTimeout(drainTimer);upstream=null;old.close();open();}
   function rotate(){
    if(ended||closing)return;rotating=true;ready=false;send({type:'renewing'});
    upstream.send(JSON.stringify({realtimeInput:{audioStreamEnd:true}}));
    // Silent streams may not emit generationComplete. Allow pending recognition to arrive before renewing an idle stream.
    drainTimer=setTimeout(()=>{if(!unfinalized&&!activity)replaceConnection();else drainTimer=setTimeout(()=>fail('The speech connection could not renew cleanly. Restart listening and repeat the unfinished phrase.'),7000);},1000);
   }
   function finish(){if(!ready||ended)return;upstream.send(JSON.stringify({realtimeInput:{audioStreamEnd:true}}));clearTimeout(drainTimer);drainTimer=setTimeout(()=>{send({type:'finished',uncertain:true});cleanup();client.close(1000,'Finished');},6000);}
   client.on('message',(bytes,binary)=>{
    if(ended)return;
    if(binary){
     if(closing||!bytes.length||bytes.length%2||bytes.length>6400)return fail('Invalid audio frame. Restart listening.');
     if(ready)forward(bytes);else{pending.push(bytes);pendingBytes+=bytes.length;if(pendingBytes>256000)fail('Audio connection is behind. Listening stopped before more speech was lost.');}
    }else{let data;try{data=JSON.parse(bytes);}catch{return fail('Invalid listening command.');}if(data.type!=='finish')return fail('Invalid listening command.');closing=true;clearTimeout(renewTimer);finish();}
   });
   client.on('close',cleanup);client.on('error',cleanup);open();
  });
 });
 server.on('close',()=>{for(const client of wss.clients)client.terminate();wss.close();});
 return wss;
}
