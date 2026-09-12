import crypto from 'node:crypto';
import { env } from '../config/env.js';
const key = crypto.createHash('sha256').update(env.SOURCE_CONFIG_KEY).digest();
export function encryptJson(value) {
  if (value == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value),'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv,tag,body]).toString('base64url');
}
export function decryptJson(encoded) {
  if (!encoded) return {};
  const raw = Buffer.from(encoded, 'base64url');
  const iv=raw.subarray(0,12), tag=raw.subarray(12,28), body=raw.subarray(28);
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv); decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(body),decipher.final()]).toString('utf8'));
}
export function hashIp(ip) { return crypto.createHash('sha256').update(`${env.IP_HASH_SALT}:${ip || ''}`).digest('hex'); }
export function csrfToken() { return crypto.randomBytes(24).toString('base64url'); }
