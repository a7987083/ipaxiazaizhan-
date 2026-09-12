import { createApp } from './app.js';
import { env } from './config/env.js';
import { ensureControlInitialized } from './storage/controlStore.js';

await ensureControlInitialized();
const app = createApp();
const server = app.listen(env.PORT, env.HOST, () => {
  console.log(`ZONOE API listening on ${env.HOST}:${env.PORT}`);
});

function shutdown(){
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(1),10_000).unref();
}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
