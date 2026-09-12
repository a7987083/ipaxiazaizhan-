import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const boolish = z.string().optional().transform(v => v === 'true');
const defaultRoot=fileURLToPath(new URL('../../../../', import.meta.url));
const schema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost'),
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(32),
  IP_HASH_SALT: z.string().min(8),
  SOURCE_CONFIG_KEY: z.string().min(16),
  COOKIE_SECURE: boolish,
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  CONTROL_DIR: z.string().optional(),
  MYSQL_BIN: z.string().optional(),
  LOCAL_STORAGE_DIR: z.string().default('/data/uploads'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(4096),
  DOWNLOAD_RATE_LIMIT: z.coerce.number().int().positive().default(120)
});

const parsed=schema.parse(process.env);
parsed.CONTROL_DIR=parsed.CONTROL_DIR || path.join(process.env.INSTALL_DIR || defaultRoot,'data','control');
export const env = parsed;
