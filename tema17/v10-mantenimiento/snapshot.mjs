import {mkdirSync,copyFileSync,writeFileSync,existsSync} from 'node:fs';
import {configuration} from './engine.js';
const local=new URL('./.env',import.meta.url);if(existsSync(local))process.loadEnvFile(local);
const folder=new URL('./backups/'+new Date().toISOString().replace(/[:.]/g,'-')+'/',import.meta.url);
mkdirSync(folder,{recursive:true});copyFileSync(new URL('./prompts/registry.json',import.meta.url),new URL('registry.json',folder));
writeFileSync(new URL('config-public.json',folder),JSON.stringify(configuration(),null,2));console.log(folder.pathname);
