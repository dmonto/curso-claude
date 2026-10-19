import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const versions=JSON.parse(readFileSync(new URL('../versions.json',import.meta.url)));
for(const v of versions){console.log(v.directory);const r=spawnSync(process.execPath,['--test'],{cwd:new URL('../'+v.directory+'/',import.meta.url),stdio:'inherit',env:{...process.env,MODEL_MODE:'mock'}});if(r.status!==0)process.exit(r.status||1);}
