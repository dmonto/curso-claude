import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const versions = JSON.parse(fs.readFileSync('versions.json','utf8'));
let failures = 0;
for (const version of versions) {
  const result = spawnSync(process.execPath, ['--check', `${version.directory}/server.js`], { stdio: 'inherit' });
  if (result.status !== 0) failures++;
}
process.exit(failures ? 1 : 0);
