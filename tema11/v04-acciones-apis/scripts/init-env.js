import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
if (!existsSync(new URL('.env', root))) {
  copyFileSync(new URL('.env.example', root), new URL('.env', root));
  console.log(`Creado ${fileURLToPath(new URL('.env', root))}`);
} else console.log('.env ya existe; se conserva.');
