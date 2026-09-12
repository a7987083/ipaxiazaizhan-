import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
const app=createApp(); const server=app.listen(env.PORT,'0.0.0.0',()=>console.log(`ZONOE API listening on ${env.PORT}`));
async function shutdown(){ server.close(async()=>{ await pool.end(); process.exit(0); }); setTimeout(()=>process.exit(1),10_000).unref(); }
process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
