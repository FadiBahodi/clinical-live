import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { validateLane, validateSegments, instructionsFor } from './lib/contract.mjs';
import { builtInAdapter, listModels } from './lib/providers.mjs';
import {connectionStatus, validateSettings, PROVIDERS, defaults} from './lib/settings.mjs';
import {attachLiveAudio} from './lib/live-audio.mjs';
import {createAccess} from './lib/access.mjs';

const project = fileURLToPath(new URL('./', import.meta.url));
const root = resolve(project,'public');
const version=JSON.parse(readFileSync(resolve(project,'package.json'),'utf8')).version;
const archivePath=resolve(project,'dist/clinical-live-'+version+'.zip');
const limit = 8 * 1024 * 1024;
const vendorFiles = new Map([
 ...['bundle.min.js','vad.worklet.bundle.min.js','silero_vad_v5.onnx'].map(f=>['/vendor/vad/'+f,resolve(project,'node_modules/@ricky0123/vad-web/dist',f)]),
 ...['ort.wasm.min.js','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'].map(f=>['/vendor/ort/'+f,resolve(project,'node_modules/onnxruntime-web/dist',f)])
]);
export function callAdapter(request, {signal,settings,keys}={}) {
  const executable=process.env.CLINICAL_ADAPTER;
  if (!executable) return builtInAdapter(request,{signal,settings,keys});
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [], { shell:false, stdio:['pipe','pipe','ignore'] });
    let output='',settled=false;
    const end=(error,result)=>{
      if(settled)return;settled=true;clearTimeout(timeout);signal?.removeEventListener('abort',abort);
      if(error){child.kill();reject(error);}else resolve(result);
    };
    const abort=()=>end(new Error('Aborted'));
    const timeout=setTimeout(()=>end(new Error('Adapter timeout')),45000);
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted){abort();return;}
    child.on('error',()=>end(new Error('Adapter unavailable')));
    child.stdin.on('error',()=>end(new Error('Adapter input failed')));
    child.stdout.on('data',chunk=>{output+=chunk;if(output.length>limit)end(new Error('Adapter output too large'));});
    child.on('close',code=>{if(code!==0)return end(new Error('Adapter failed'));try{end(null,JSON.parse(output));}catch{end(new Error('Adapter response is not JSON'));}});
    child.stdin.end(JSON.stringify(request));
  });
}
async function readJson(req) {
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>limit)throw new Error('Request too large');chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString());
}
export function createServer(adapter=callAdapter,{env=process.env,fetcher=fetch,liveAudio}={}) {
 const access=createAccess(env);
 const server=http.createServer(async(req,res)=>{
  const send=(status,value)=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const host=req.headers.host||'';
  if(!access.accepts(req))return send(403,{error:'Host or origin rejected'});
  let path=new URL(req.url,'http://'+host).pathname;
  if(path==='/healthz'&&req.method==='GET')return send(200,{ok:true,version});
  let session;
  try{session=access.get(req,res);}catch{return send(503,{error:'Workspace is busy. Try again later.'});}
  if(!session)return send(403,{error:'Host or origin rejected'});
  if(path==='/api/login'&&req.method==='POST'){
   try{const body=await readJson(req);if(access.login(req,session,body.password))return send(200,{ok:true});}catch{}
   return send(401,{error:'Access code not accepted. Try again shortly.'});
  }
  if(!session.authenticated){
   if(path.startsWith('/api/'))return send(401,{error:'Sign in to use this workspace.'});
   if(!['/login.js','/style.css'].includes(path))path='/login.html';
  }
  const status=()=>({...connectionStatus(session.settings,session.keys,Boolean(env.CLINICAL_ADAPTER)),storage:'memory only',version,downloadReady:existsSync(archivePath),hosted:access.hosted});
  if(path==='/api/status'&&req.method==='GET')return send(200,status());
  if(path==='/api/settings'&&req.method==='POST'){
   try{session.settings=validateSettings(await readJson(req));return send(200,status());}catch{return send(400,{error:'Choose a workspace, provider and model for each role.'});}
  }
  if(path==='/api/connection'&&req.method==='POST'){
   try{
    const body=await readJson(req);
    if(!PROVIDERS.includes(body.provider)||typeof body.key!=='string'||body.key.length>500||/\s/.test(body.key))throw new Error();
    if(body.key.length)await listModels(body.provider,body.key,{fetcher});
    session.keys[body.provider]=body.key;
    if(body.key){
     const selected=defaults({ANALYSIS_PROVIDER:body.provider,TRANSCRIPTION_PROVIDER:body.provider});
     for(const role of ['assessment','plan','answer','transcription'])if(!session.keys[session.settings[role].provider]){session.settings[role]=selected[role];if(role==='transcription')session.settings.speechTransport=selected.speechTransport;}
    }
    return send(200,status());
   }catch{return send(400,{error:'Connection could not be verified. Check the key, account access and network.'});}
  }
  if(path==='/api/models'&&req.method==='GET'){
   try{const provider=new URL(req.url,'http://'+host).searchParams.get('provider');if(!PROVIDERS.includes(provider))return send(400,{error:'Unknown provider'});return send(200,{models:await listModels(provider,session.keys[provider],{fetcher})});}
   catch{return send(502,{error:'Could not load models. Check the connection and try again.'});}
  }
  if(req.method==='POST'&&['/api/analyze','/api/transcribe'].includes(path)){
   if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'JSON required'});
   const controller=new AbortController();res.once('close',()=>{if(!res.writableEnded)controller.abort();});
   let body;
   try{
    body=await readJson(req);
    if(path==='/api/transcribe'){
     if(typeof body.audio!=='string'||!body.audio.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.audio)||!['audio/wav','audio/webm','audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].includes(body.mimeType))throw new Error('Invalid audio');
    }else{
     validateSegments(body.segments);
     if(!['assessment','plan','answer'].includes(body.lane))throw new Error('Invalid lane');
     if(body.newUtteranceIds!==undefined&&(!Array.isArray(body.newUtteranceIds)||body.newUtteranceIds.some(id=>!body.segments.some(s=>s.id===id))))throw new Error('Invalid revision');
     if(body.provisionalIds!==undefined&&(!Array.isArray(body.provisionalIds)||body.provisionalIds.some(id=>!body.segments.some(s=>s.id===id))))throw new Error('Invalid provisional source');
     if(body.previous)validateLane(body.previous,body.lane,body.segments);
    }
   }catch{return send(400,{error:'Input could not be processed. Check the transcript or audio format and encounter length.'});}
   try{
    const started=performance.now();
    if(path==='/api/transcribe'){
     const result=await adapter({version:3,task:'transcribe',audio:body.audio,mimeType:body.mimeType},{signal:controller.signal,settings:structuredClone(session.settings),keys:{...session.keys}});
     if(typeof result.text!=='string'||result.text.length>30000)throw new Error('Invalid transcription');
     return send(200,{text:result.text,elapsedMs:Math.round(performance.now()-started)});
    }
    const result=await adapter({version:3,task:'analyze',lane:body.lane,instructions:instructionsFor(body.lane,session.settings.profile),segments:body.segments,previous:body.previous||null,incremental:body.incremental===true,newUtteranceIds:body.newUtteranceIds||[],provisionalIds:body.provisionalIds||[]},{signal:controller.signal,settings:structuredClone(session.settings),keys:{...session.keys}});
    return send(200,{data:validateLane(result,body.lane,body.segments),elapsedMs:Math.round(performance.now()-started)});
   }catch{
    return send(502,{error:'This update failed. The previous display is retained; newer speech may not be reflected. Retry when the provider is available.'});
   }
  }
  if(req.method!=='GET')return send(405,{error:'Method not allowed'});
  let file,download=false;
  if(vendorFiles.has(path))file=vendorFiles.get(path);
  else if(path==='/download/clinical-live.zip'){file=archivePath;download=true;}
  else{
   try{file=resolve(root,'.'+decodeURIComponent(path==='/'?'/index.html':path));}catch{return send(400,{error:'Invalid path'});}
   if(!file.startsWith(root+sep))return send(403,{error:'Forbidden'});
  }
  try{
   const data=await readFile(file);
   res.writeHead(200,{
    'Content-Type':({'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.svg':'image/svg+xml','.wasm':'application/wasm','.zip':'application/zip'})[extname(file)]||'application/octet-stream',
    'Cache-Control':vendorFiles.has(path)?'public, max-age=3600':'no-store','X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self' blob:; img-src 'self' data:; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'Permissions-Policy':'camera=(), microphone=(self)',
    ...(download?{'Content-Disposition':'attachment; filename="clinical-live.zip"'}:{})
   });res.end(data);
  }catch{send(404,{error:'Not found'});}
 });
 attachLiveAudio(server,access,liveAudio);
 return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||8840);
 const bind=process.env.HOST||'127.0.0.1';
 if(!['127.0.0.1','localhost','::1'].includes(bind)&&!process.env.PUBLIC_ORIGIN)throw new Error('Set PUBLIC_ORIGIN and ACCESS_PASSWORD before binding a public interface.');
 createServer().listen(port,bind,()=>console.log(`Clinical Live: http://127.0.0.1:${port}`));
}
