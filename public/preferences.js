// Only explicit opt-in credentials and configuration; never encounter content.
export class DevicePreferences {
 constructor(storage){this.storage=storage;}
 read(name,fallback){try{return JSON.parse(this.storage.getItem('clinical-live-'+name))??fallback;}catch{return fallback;}}
 keys(){const saved=this.read('keys',{});return Object.fromEntries(['gemini','openai'].filter(p=>typeof saved?.[p]==='string'&&saved[p]).map(p=>[p,saved[p]]));}
 key(provider,key,remember){const keys=this.keys();if(remember&&key)keys[provider]=key;else delete keys[provider];if(Object.keys(keys).length)this.storage.setItem('clinical-live-keys',JSON.stringify(keys));else this.storage.removeItem('clinical-live-keys');}
 settings(value){if(value)this.storage.setItem('clinical-live-models',JSON.stringify(value));return this.read('models',null);}
 async restore(request){
  const errors=[];
  for(const [provider,key] of Object.entries(this.keys()))try{await request('/api/connection',{provider,key});}catch{errors.push(provider+' could not reconnect');}
  const settings=this.settings();if(settings)try{await request('/api/settings',settings);}catch{errors.push('Saved model choices could not be applied');}
  return errors;
 }
}
