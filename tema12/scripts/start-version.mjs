import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const versions = JSON.parse(fs.readFileSync(path.join(root, 'versions.json'), 'utf8'));
const selected = process.argv[2] || 'v10';
const version = versions.find(item => item.id === selected || item.directory === selected);
if (!version) throw new Error('Versión desconocida. Usa v01, v02, …, v10.');
const commonEnv = path.join(root, '.env');
if (!fs.existsSync(commonEnv)) throw new Error('Falta el .env común en la raíz. Copia .env.example a .env.');
fs.copyFileSync(commonEnv, path.join(root, version.directory, '.env'));
const { startServer } = await import(pathToFileURL(path.join(root, version.directory, 'server.js')).href);
const { baseUrl, runtime, server } = await startServer();
console.log(`${version.id} · ${version.title}
${baseUrl} · ${runtime.config.modelMode}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
