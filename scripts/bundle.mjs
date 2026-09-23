import {spawnSync} from 'node:child_process';
for(const [command,args] of [[process.execPath,['scripts/release-check.mjs']],['python3',['scripts/bundle.py']]]){
 const result=spawnSync(command,args,{stdio:'inherit',shell:false});
 if(result.error||result.status!==0){process.exitCode=result.status||1;break;}
}
