export const historyTags = ['HPI','ASSOC','PMH','MEDS','ALLERGY','SOCIAL','COLLAT','RISK'];
export const examTags = ['PRIMARY','GEN','NEURO','HEENT','NECK','CVS','RESP','ABDO','GU','SKIN','MSK'];
export const managementTags = ['RESUS','MED','PROC','LABS','IMG','MON','CONSULT','DISPO','COMM'];
const text = (value, max=700) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

export function validateSegments(segments) {
  if (!Array.isArray(segments) || !segments.length || segments.length > 500) throw new Error('Invalid transcript');
  const ids = new Set(); let length = 0;
  for (const s of segments) {
    if (!s || !text(s.id,100) || ids.has(s.id) || !text(s.text,30000)) throw new Error('Invalid utterance');
    ids.add(s.id); length += s.text.length;
  }
  if (length > 250000) throw new Error('Transcript limit reached');
  return segments;
}

export function validateLane(value, lane, segments) {
  const known = new Set(segments.map(s=>s.id)), ids = new Set();
  const base = (item,requireSource=false) => {
    if (!item || !text(item.id,100) || ids.has(item.id)) throw new Error('Invalid identity');
    ids.add(item.id);
    if (!Array.isArray(item.sourceIds) || (requireSource&&!item.sourceIds.length) || item.sourceIds.some(id=>!known.has(id))) throw new Error('Invalid speech reference');
  };
  const list = (key,max,check) => {
    if (!Array.isArray(value[key]) || value[key].length > max) throw new Error('Invalid group');
    value[key].forEach(item=>{base(item,key==='vitals'||['reported','requested','done','result'].includes(item?.state));check(item);});
  };
  const cues = (key,tags,states) => list(key,60,item=>{
    if ([item.detail,item.dose,item.route].some(v=>v!==undefined&&(typeof v!=='string'||v.length>240))) throw new Error('Invalid cue detail');
    if (!tags.includes(item.tag) || !states.includes(item.state) || !['key','routine'].includes(item.priority) || !text(item.text)) throw new Error('Invalid clinical cue');
  });
  if (!value || typeof value !== 'object') throw new Error('Invalid response');
  if (lane === 'assessment') {
    if (typeof value.summary !== 'string' || value.summary.length > 500) throw new Error('Invalid summary');
    list('vitals',12,item=>{if (!text(item.label,40) || !text(item.value,80) || typeof item.unit !== 'string' || item.unit.length > 80) throw new Error('Invalid observation');if(item.flag!==undefined&&!['none','high','low'].includes(item.flag))throw new Error('Invalid observation flag');if(item.flagReason!==undefined&&(typeof item.flagReason!=='string'||item.flagReason.length>240))throw new Error('Invalid observation reason');if(['high','low'].includes(item.flag)&&!text(item.flagReason,240))throw new Error('Observation flag needs context');});
    list('differential',8,item=>{if (!text(item.name,140) || !text(item.cue,240) || !['leading','consider','urgent'].includes(item.rank)) throw new Error('Invalid differential');});
    cues('history',historyTags,['to clarify','reported']);
    cues('exam',examTags,['to examine','reported']);
  } else if (lane === 'plan') {
    cues('management',managementTags,['consider','requested','done','result']);
  } else if (lane === 'answer') {
    if (value.answer !== null) {
      base(value.answer,true);
      if (!text(value.answer.question,350) || !Array.isArray(value.answer.points) || !value.answer.points.length || value.answer.points.length > 12 || value.answer.points.some(p=>!text(p))) throw new Error('Invalid answer');
    }
  } else throw new Error('Invalid lane');
  return value;
}

export {instructionsFor} from './prompts.mjs';
