import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const dir of readdirSync(root).filter(x=>/^v\d\d-/.test(x)).sort()) {
  console.log('\n'+dir);const r=spawnSync(process.execPath,['--test','tests/security.test.js'],{cwd:root+dir,stdio:'inherit'});if(r.status!==0)process.exit(r.status || 1);
}
