import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const v of JSON.parse(readFileSync(new URL('../versions.json',import.meta.url)))){
 const r=spawnSync(process.execPath,['--test','test/engine.test.js'],{cwd:root+v.directory,stdio:'inherit'});
 if(r.status!==0)process.exit(r.status??1);
}
