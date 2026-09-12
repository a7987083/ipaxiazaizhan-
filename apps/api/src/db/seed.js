import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
import { env } from '../config/env.js';
const count = await pool.query('SELECT COUNT(*)::int AS n FROM admins');
if (count.rows[0].n === 0) {
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 chars for first seed');
  const hash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  await pool.query('INSERT INTO admins(username,email,password_hash,role) VALUES($1,$2,$3,$4)', [env.ADMIN_USERNAME, env.ADMIN_EMAIL || null, hash, 'superadmin']);
  console.log(`Created admin ${env.ADMIN_USERNAME}`);
} else console.log('Admin already exists; seed skipped');
await pool.end();
