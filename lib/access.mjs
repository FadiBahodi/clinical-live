import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {defaults,credentials} from './settings.mjs';
const digest=value=>createHash('sha256').update(value).digest();
export function createAccess(env=process.env){
 const hosted=Boolean(env.PUBLIC_ORIGIN);
 let origin;
 if(hosted){
  origin=new URL(env.PUBLIC_ORIGIN);
  if(origin.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(origin.hostname))throw new Error('PUBLIC_ORIGIN must use HTTPS.');
  if(!env.ACCESS_PASSWORD||env.ACCESS_PASSWORD.length<16)throw new Error('Set ACCESS_PASSWORD to at least 16 characters before hosting.');
 }
 const sessions=new Map(), attempts=new Map(), lifetime=8*60*60*1000;
 function accepts(req){
  const host=req.headers.host||'';
  if(hosted?host!==origin.host:! /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))return false;
  const expected=hosted?origin.origin:'http://'+host;
  return !req.headers.origin||req.headers.origin===expected;
 }
 function get(req,res){
  if(!accepts(req))return null;
  const now=Date.now();
  for(const [id,s]of sessions)if(s.expires<now)sessions.delete(id);
  const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('clinical_session='));
  let id=cookie?.slice('clinical_session='.length), session=sessions.get(id);
  if(!session){
   if(sessions.size>=1000)throw new Error('Session capacity reached');
   id=randomBytes(32).toString('hex');session={settings:defaults(env),keys:credentials(env),authenticated:!hosted,expires:now+lifetime};
   sessions.set(id,session);
   res.setHeader('Set-Cookie','clinical_session='+id+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800'+(hosted&&origin.protocol==='https:'?'; Secure':''));
  }
  return session;
 }
 function login(req,session,password){
  const ip=req.socket.remoteAddress||'local',now=Date.now();
  const attempt=attempts.get(ip)||{count:0,since:now};
  if(now-attempt.since>60000){attempt.count=0;attempt.since=now;}
  attempt.count++;attempts.set(ip,attempt);
  if(attempt.count>10)return false;
  const match=typeof password==='string'&&password.length<=500&&timingSafeEqual(digest(password),digest(env.ACCESS_PASSWORD||''));
  if(match){session.authenticated=true;attempts.delete(ip);}
  return match;
 }
 function lookup(req){
  if(!accepts(req))return null;
  const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('clinical_session='));
  const session=sessions.get(cookie?.slice('clinical_session='.length));
  return session&&session.expires>Date.now()?session:null;
 }
 return {get,lookup,login,hosted,accepts};
}
