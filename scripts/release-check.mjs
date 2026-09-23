import {readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
const blocked = [/\/Users\//i,/sk-[a-z0-9]{20}/i,/AIza[\w-]{20}/,/\b(?:SOO|SAMPs?|CCFP|examiner|pluely)\b/i];
let files=0, failures=[];
async function scan(dir='.'){
 for(const entry of await readdir(dir,{withFileTypes:true})){
  if(['.git','node_modules','dist'].includes(entry.name))continue;
  const path=join(dir,entry.name);
  if(entry.isDirectory()){await scan(path);continue;}
  if(path===join('scripts','release-check.mjs'))continue;
  files++;
  if(entry.name.startsWith('.env')&&entry.name!=='.env.example')failures.push(path+': environment file');
  const text=await readFile(path,'utf8');
  if(blocked.some(pattern=>pattern.test(text)))failures.push(path+': private or legacy content');
 }
}
await scan();
console.log(JSON.stringify({files,failures},null,2));
if(failures.length)process.exitCode=1;
