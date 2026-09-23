export const PROVIDERS = ['gemini', 'openai'];
const modelId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(value);
export function defaults(env = process.env) {
 const provider = env.ANALYSIS_PROVIDER || (env.GEMINI_API_KEY ? 'gemini' : env.OPENAI_API_KEY ? 'openai' : 'gemini');
 const model = provider === 'openai' ? env.OPENAI_MODEL || 'gpt-4.1' : (env.GEMINI_MODEL || 'gemini-3.8-flash').replace(/^models\//, '');
 const transcriptionProvider = env.TRANSCRIPTION_PROVIDER || (env.OPENAI_API_KEY ? 'openai' : 'gemini');
 const speechTransport=transcriptionProvider!=='gemini'||env.CLINICAL_ADAPTER?'clips':env.SPEECH_TRANSPORT || (!env.GEMINI_TRANSCRIPTION_MODEL?'streaming':'clips');
 return {speechTransport,profile: 'ed', geminiThinking: env.GEMINI_THINKING || 'low', assessment: {provider, model: env.ASSESSMENT_MODEL || model}, plan: {provider, model: env.PLAN_MODEL || model}, answer: {provider, model: env.ANSWER_MODEL || model}, transcription: {provider: transcriptionProvider, model: transcriptionProvider === 'openai' ? env.TRANSCRIPTION_MODEL || 'gpt-4o-transcribe' : env.GEMINI_TRANSCRIPTION_MODEL || (speechTransport==='streaming'?'gemini-3.5-transcribe-live':'gemini-2.5-flash')}};
}
export function validateSettings(value) {
 if (!value || !['ed', 'resus', 'acute'].includes(value.profile)) throw new Error('Choose a clinical workspace.');
 if (!['low','medium','high','default'].includes(value.geminiThinking || 'low')) throw new Error('Choose a thinking level.');
 for (const lane of ['assessment', 'plan', 'answer', 'transcription']) {
  if (!PROVIDERS.includes(value[lane]?.provider) || !modelId(value[lane]?.model)) throw new Error('Choose a provider and valid model ID for each role.');
 }
 if(!['streaming','clips'].includes(value.speechTransport||'clips')||(value.speechTransport==='streaming'&&value.transcription.provider!=='gemini'))throw new Error('Streaming speech requires Gemini.');
 return {speechTransport:value.speechTransport||'clips',profile: value.profile, geminiThinking: value.geminiThinking || 'low', ...Object.fromEntries(['assessment','plan','answer','transcription'].map(lane => [lane, {provider:value[lane].provider,model:value[lane].model.replace(/^models\//,'')}]))};
}
export function credentials(env = process.env) {return {gemini: env.GEMINI_API_KEY || '', openai: env.OPENAI_API_KEY || ''};}
export function connectionStatus(settings, keys, custom = false) {
 const ready = lane => custom || Boolean(keys[settings[lane].provider]);
 return {settings, connected: {gemini:Boolean(keys.gemini),openai:Boolean(keys.openai)}, analysisReady: ['assessment','plan','answer'].every(ready), audioReady: ready('transcription'), transcription:custom?'custom':settings.transcription.provider, analysis:custom?'custom':settings.assessment.provider, model:custom?'custom':settings.assessment.model, custom};
}
