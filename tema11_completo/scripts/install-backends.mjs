import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = new URL('../', import.meta.url);
const versions = JSON.parse(readFileSync(new URL('versions.json', root), 'utf8'));
for (const version of versions) {
  console.log(`Instalando ${version.directory}`);
  const code = await new Promise(resolve => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--no-audit', '--no-fund'],
      { cwd: fileURLToPath(new URL(`${version.directory}/`, root)), stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('exit', resolve); child.on('error', () => resolve(1));
  });
  if (code !== 0) process.exit(code || 1);
}
