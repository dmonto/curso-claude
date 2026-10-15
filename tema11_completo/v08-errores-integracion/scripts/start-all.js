import './init-env.js';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
const { config } = await import('../src/config.js');
const { features } = await import('../src/features.js');
const cwd = fileURLToPath(new URL('../', import.meta.url));
const children = [];
let stopping = false;

function portFree(port) {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
function start(file) {
  const child = spawn(process.execPath, [file], { cwd, stdio: 'inherit', env: process.env });
  children.push(child);
  child.on('error', () => stop(1));
  child.on('exit', code => { if (!stopping) stop(code || 1); });
}
const ports = [config.port, ...(features.microservices ? [config.ordersPort, config.customersPort, config.billingPort, ...(features.actions ? [config.ticketsPort] : [])] : [])];
for (const port of ports) {
  if (!await portFree(port)) {
    console.error(`El puerto ${port} está ocupado. Detén la otra versión antes de iniciar ${features.version}.`);
    process.exit(1);
  }
}
if (features.microservices) {
  start('ms-orders.js'); start('ms-customers.js'); start('ms-billing.js');
  if (features.actions) start('ms-tickets.js');
}
start(features.microservices ? 'gateway-assistant.js' : 'server.js');
for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => stop());
console.log(`Iniciando ${features.version}. Ctrl+C detiene todos los procesos de esta versión.`);
