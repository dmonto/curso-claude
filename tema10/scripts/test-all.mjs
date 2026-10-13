import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const versions = JSON.parse(fs.readFileSync(path.join(root, 'versions.json'), 'utf8'));
let failed = false;
for (const version of versions) {
  console.log(`\n${version.id} · ${version.title}`);
  const result = spawnSync(process.execPath, ['--test', 'tests/agent.test.js'], { cwd: path.join(root, version.directory), stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}
if (failed) process.exitCode = 1;
