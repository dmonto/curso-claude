import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const base = path.dirname(fileURLToPath(import.meta.url));
const envFile = [path.join(base,'.env'),path.join(base,'..','.env')].find(fs.existsSync);
if (envFile) process.loadEnvFile(envFile);
export const config = {
  port:Number(process.env.PORT || 3000), host:process.env.HOST || '127.0.0.1',
  origin:process.env.FRONTEND_ORIGIN || 'http://localhost:4200',
  mode:process.env.MODEL_MODE || 'mock', secret:process.env.JWT_SECRET || '',
  password:process.env.LAB_PASSWORD || '', ttl:Number(process.env.TOKEN_TTL_SECONDS || 3600),
  model:process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', effort:process.env.CLAUDE_EFFORT || 'medium',
  maxTokens:Number(process.env.MAX_TOKENS || 4096), key:process.env.ANTHROPIC_API_KEY || '',
  runtime:process.env.LAB_RUNTIME || path.join(base,'runtime'),
};
if (config.secret.length < 32 || config.password.length < 8) throw new Error('Configura JWT_SECRET (32+ caracteres) y LAB_PASSWORD (8+).');
if (!['mock','live'].includes(config.mode) || !['low','medium','high','max'].includes(config.effort)) throw new Error('Configuración de modelo inválida.');
if (!Number.isInteger(config.port) || !Number.isInteger(config.ttl) || config.ttl < 1) throw new Error('Puerto o TTL inválidos.');
if (config.mode === 'live' && (!config.key || config.secret.startsWith('solo-laboratorio'))) throw new Error('Configura la clave API y sustituye JWT_SECRET para modo live.');
fs.mkdirSync(config.runtime,{recursive:true});
