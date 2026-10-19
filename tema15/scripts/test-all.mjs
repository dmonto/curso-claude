import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
for(const v of JSON.parse(readFileSync(new URL('versions.json',root)))){
 console.log('\n'+v.id+' - '+v.title);
 const result=spawnSync(process.execPath,['--test','test/lab.test.js'],{cwd:fileURLToPath(new URL(v.directory+'/',root)),stdio:'inherit'});
 if(result.status!==0){process.exitCode=1;break;}
}
