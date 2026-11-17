import { execFileSync } from 'node:child_process';
import { stat } from 'node:fs/promises';

const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z','--','docs/evidence'],{encoding:'utf8'}).split('\0').filter(Boolean);
const violations=[];
for(const file of new Set(files)){
  let info;
  try{info=await stat(file);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  if(/\.(png|jpe?g|webp|gif|mp4|webm|mov|wav|mp3|ogg|npz|bin|exr|blend|gz)$/i.test(file)||info.size>131072)violations.push({file,bytes:info.size});
}
if(violations.length){console.error(JSON.stringify(violations,null,2));process.exitCode=1;}
else console.log('Evidence gate passes: source/delivery artifacts are separate from media; each evidence text file is≤128KiB.');
