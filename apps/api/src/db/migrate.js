import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, '../../db/migrations');
await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
const files = (await fs.readdir(dir)).filter(f => f.endsWith('.sql')).sort();
for (const name of files) {
  const exists = await pool.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name]);
  if (exists.rowCount) continue;
  const sql = await fs.readFile(path.join(dir, name), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
    await client.query('COMMIT');
    console.log(`Applied ${name}`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally { client.release(); }
}
await pool.end();
