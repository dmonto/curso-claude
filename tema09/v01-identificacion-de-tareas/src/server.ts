import { createApp } from './app.js';
import { readConfig } from './config.js';
const config = readConfig();
const server = createApp(config).listen(config.port, config.host, () => {
  console.log(`${config.version} — ${config.title}`);
  console.log(`Backend: http://${config.host}:${config.port} | AI_MODE=${config.mode}`);
});
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE' ? 'El puerto está ocupado. Detén la otra versión o cambia PORT.' : error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
